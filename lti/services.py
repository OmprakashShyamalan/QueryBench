import base64
import hashlib
import json
import logging
import os
import time
import uuid
from dataclasses import dataclass
from datetime import timedelta
from datetime import timezone as dt_timezone
from typing import Any, Dict, Optional, Tuple

import jwt
import requests
from cryptography.hazmat.primitives import serialization
from cryptography.hazmat.primitives.asymmetric import rsa
from django.conf import settings
from django.contrib.auth.models import User
from django.db import transaction
from django.utils import timezone

from api.models import Assignment, Attempt
from .models import LmsAssessmentMapping, LmsProvider, LtiNonce

logger = logging.getLogger("querybench.lti")

LTI_DEPLOYMENT_CLAIM = "https://purl.imsglobal.org/spec/lti/claim/deployment_id"
LTI_ROLES_CLAIM = "https://purl.imsglobal.org/spec/lti/claim/roles"
LTI_CONTEXT_CLAIM = "https://purl.imsglobal.org/spec/lti/claim/context"
LTI_RESOURCE_LINK_CLAIM = "https://purl.imsglobal.org/spec/lti/claim/resource_link"
LTI_AGS_CLAIM = "https://purl.imsglobal.org/spec/lti-ags/claim/endpoint"


class LtiValidationError(Exception):
    pass


@dataclass
class LaunchData:
    provider: LmsProvider
    claims: Dict[str, Any]
    user: User
    assignment: Assignment
    attempt: Attempt


_TOOL_PRIVATE_KEY_PEM: Optional[str] = None
_TOOL_PUBLIC_KEY_PEM: Optional[str] = None


def _urlsafe_b64(value: bytes) -> str:
    return base64.urlsafe_b64encode(value).decode("ascii").rstrip("=")


def _rsa_public_jwk(public_key, kid: str) -> Dict[str, str]:
    numbers = public_key.public_numbers()
    n = numbers.n.to_bytes((numbers.n.bit_length() + 7) // 8, "big")
    e = numbers.e.to_bytes((numbers.e.bit_length() + 7) // 8, "big")
    return {
        "kty": "RSA",
        "kid": kid,
        "use": "sig",
        "alg": "RS256",
        "n": _urlsafe_b64(n),
        "e": _urlsafe_b64(e),
    }


def _load_or_generate_tool_keys() -> Tuple[str, str]:
    global _TOOL_PRIVATE_KEY_PEM, _TOOL_PUBLIC_KEY_PEM
    if _TOOL_PRIVATE_KEY_PEM and _TOOL_PUBLIC_KEY_PEM:
        return _TOOL_PRIVATE_KEY_PEM, _TOOL_PUBLIC_KEY_PEM

    env_private = os.environ.get("QB_LTI_PRIVATE_KEY_PEM", "").strip()
    env_public = os.environ.get("QB_LTI_PUBLIC_KEY_PEM", "").strip()
    if env_private and env_public:
        _TOOL_PRIVATE_KEY_PEM = env_private
        _TOOL_PUBLIC_KEY_PEM = env_public
        return _TOOL_PRIVATE_KEY_PEM, _TOOL_PUBLIC_KEY_PEM

    key = rsa.generate_private_key(public_exponent=65537, key_size=2048)
    private_pem = key.private_bytes(
        encoding=serialization.Encoding.PEM,
        format=serialization.PrivateFormat.PKCS8,
        encryption_algorithm=serialization.NoEncryption(),
    ).decode("utf-8")
    public_pem = key.public_key().public_bytes(
        encoding=serialization.Encoding.PEM,
        format=serialization.PublicFormat.SubjectPublicKeyInfo,
    ).decode("utf-8")
    _TOOL_PRIVATE_KEY_PEM = private_pem
    _TOOL_PUBLIC_KEY_PEM = public_pem
    return private_pem, public_pem


def get_tool_jwks() -> Dict[str, Any]:
    _, public_pem = _load_or_generate_tool_keys()
    kid = os.environ.get("QB_LTI_KEY_ID", "querybench-tool-key")
    public_key = serialization.load_pem_public_key(public_pem.encode("utf-8"))
    return {"keys": [_rsa_public_jwk(public_key, kid)]}


def _get_claim_audience(claims: Dict[str, Any]) -> str:
    aud = claims.get("aud")
    if isinstance(aud, list):
        return aud[0] if aud else ""
    return str(aud or "")


def _get_provider_for_claims(claims: Dict[str, Any]) -> LmsProvider:
    issuer = str(claims.get("iss", "")).strip()
    client_id = _get_claim_audience(claims)
    deployment_id = str(claims.get(LTI_DEPLOYMENT_CLAIM, "")).strip()
    if not issuer or not client_id or not deployment_id:
        raise LtiValidationError("Missing issuer, audience/client_id, or deployment_id in LTI launch token.")

    try:
        return LmsProvider.objects.get(
            issuer=issuer,
            client_id=client_id,
            deployment_id=deployment_id,
        )
    except LmsProvider.DoesNotExist as exc:
        raise LtiValidationError("Unknown LMS provider for launch token.") from exc


def _find_jwk(jwks: Dict[str, Any], kid: str) -> Dict[str, Any]:
    for key in jwks.get("keys", []):
        if key.get("kid") == kid:
            return key
    raise LtiValidationError("No matching JWK key id found for launch token.")


def _decode_id_token(id_token: str, provider: LmsProvider) -> Dict[str, Any]:
    header = jwt.get_unverified_header(id_token)
    kid = header.get("kid")
    if not kid:
        raise LtiValidationError("LTI id_token missing kid header.")

    jwks_resp = requests.get(provider.keyset_url, timeout=10)
    jwks_resp.raise_for_status()
    jwk = _find_jwk(jwks_resp.json(), kid)
    public_key = jwt.algorithms.RSAAlgorithm.from_jwk(json.dumps(jwk))

    return jwt.decode(
        id_token,
        key=public_key,
        algorithms=["RS256", "RS384", "RS512"],
        audience=provider.client_id,
        issuer=provider.issuer,
        options={"require": ["iss", "sub", "aud", "exp", "iat", "nonce"]},
    )


def _validate_timestamp(payload: Dict[str, Any]) -> None:
    max_age_seconds = int(os.environ.get("QB_LTI_MAX_TOKEN_AGE_SECONDS", "300"))
    iat = int(payload.get("iat", 0))
    now = int(time.time())
    if iat <= 0:
        raise LtiValidationError("Invalid launch token timestamp (iat).")
    if now - iat > max_age_seconds:
        raise LtiValidationError("Launch token is too old.")
    if iat - now > 60:
        raise LtiValidationError("Launch token iat is in the future beyond allowed skew.")


def _validate_and_store_nonce(issuer: str, nonce: str, exp: int) -> None:
    if not nonce:
        raise LtiValidationError("Missing nonce in launch token.")

    LtiNonce.purge_expired()
    if LtiNonce.objects.filter(issuer=issuer, nonce=nonce).exists():
        raise LtiValidationError("Launch nonce has already been used.")

    expiry = timezone.now() + timedelta(minutes=10)
    if exp:
        exp_dt = timezone.datetime.fromtimestamp(exp, tz=dt_timezone.utc)
        if exp_dt < expiry:
            expiry = exp_dt

    LtiNonce.objects.create(issuer=issuer, nonce=nonce, expires_at=expiry)


def _extract_course_assignment(claims: Dict[str, Any]) -> Tuple[str, str]:
    context_claim = claims.get(LTI_CONTEXT_CLAIM, {}) or {}
    resource_claim = claims.get(LTI_RESOURCE_LINK_CLAIM, {}) or {}
    course_id = str(context_claim.get("id", "")).strip()
    assignment_id = str(resource_claim.get("id", "")).strip()
    if not course_id or not assignment_id:
        raise LtiValidationError("Missing LTI context/resource_link identifiers.")
    return course_id, assignment_id


def _normalize_name(claims: Dict[str, Any]) -> Tuple[str, str]:
    full_name = str(claims.get("name", "")).strip()
    given = str(claims.get("given_name", "")).strip()
    family = str(claims.get("family_name", "")).strip()
    if given or family:
        return given, family
    if not full_name:
        return "", ""
    parts = full_name.split(" ", 1)
    if len(parts) == 1:
        return parts[0], ""
    return parts[0], parts[1]


def _provision_lti_user(provider: LmsProvider, claims: Dict[str, Any]) -> User:
    lti_sub = str(claims.get("sub", "")).strip()
    if not lti_sub:
        raise LtiValidationError("Missing LTI subject (sub).")
    user_hash = hashlib.sha256(f"{provider.id}:{lti_sub}".encode("utf-8")).hexdigest()[:24]
    username = f"lti_{provider.id}_{user_hash}"

    email = str(claims.get("email", "")).strip()
    first_name, last_name = _normalize_name(claims)

    user, created = User.objects.get_or_create(
        username=username,
        defaults={
            "email": email,
            "first_name": first_name,
            "last_name": last_name,
            "is_active": True,
        },
    )
    if created:
        user.set_unusable_password()
        user.save(update_fields=["password"])
    else:
        changed = False
        if email and user.email != email:
            user.email = email
            changed = True
        if first_name and user.first_name != first_name:
            user.first_name = first_name
            changed = True
        if last_name and user.last_name != last_name:
            user.last_name = last_name
            changed = True
        if changed:
            user.save(update_fields=["email", "first_name", "last_name"])

    return user


def _lookup_assessment_mapping(provider: LmsProvider, course_id: str, assignment_id: str) -> LmsAssessmentMapping:
    try:
        return LmsAssessmentMapping.objects.select_related("querybench_assessment").get(
            provider=provider,
            lms_course_id=course_id,
            lms_assignment_id=assignment_id,
        )
    except LmsAssessmentMapping.DoesNotExist as exc:
        raise LtiValidationError("No assessment mapping found for LMS course/assignment.") from exc


def _extract_ags_data(claims: Dict[str, Any]) -> Tuple[str, str, str]:
    ags_claim = claims.get(LTI_AGS_CLAIM, {}) or {}
    lineitems = str(ags_claim.get("lineitems", "")).strip()
    lineitem = str(ags_claim.get("lineitem", "")).strip()
    scopes = ags_claim.get("scope") or []
    if not isinstance(scopes, list):
        scopes = []
    return lineitems, lineitem, " ".join(scopes)


@transaction.atomic
def process_lti_launch(id_token: str) -> LaunchData:
    if not id_token:
        raise LtiValidationError("Missing id_token in launch request.")

    unverified_claims = jwt.decode(id_token, options={"verify_signature": False})
    provider = _get_provider_for_claims(unverified_claims)

    claims = _decode_id_token(id_token, provider)
    _validate_timestamp(claims)
    _validate_and_store_nonce(provider.issuer, str(claims.get("nonce", "")), int(claims.get("exp", 0)))

    course_id, lms_assignment_id = _extract_course_assignment(claims)
    mapping = _lookup_assessment_mapping(provider, course_id, lms_assignment_id)
    user = _provision_lti_user(provider, claims)

    assignment, _ = Assignment.objects.get_or_create(
        assessment=mapping.querybench_assessment,
        user=user,
        defaults={
            "status": "IN_PROGRESS",
            "due_date": timezone.now() + timedelta(days=3650),
        },
    )

    lineitems_url, lineitem_url, scope_value = _extract_ags_data(claims)
    context_id = str((claims.get(LTI_CONTEXT_CLAIM) or {}).get("id", ""))
    resource_link_id = str((claims.get(LTI_RESOURCE_LINK_CLAIM) or {}).get("id", ""))
    lti_sub = str(claims.get("sub", ""))

    active_attempt = assignment.attempts.filter(submitted_at__isnull=True).first()
    if active_attempt and not active_attempt.is_session_closed:
        attempt = active_attempt
    else:
        attempt = Attempt.objects.create(
            assignment=assignment,
            source="lms",
            lms_provider=provider,
            lms_assignment_id=lms_assignment_id,
            lti_context_id=context_id,
            lti_user_id=lti_sub,
            lti_ags_endpoint=lineitems_url,
            lti_lineitem=lineitem_url,
            lti_ags_scope=scope_value,
            lti_resource_link_id=resource_link_id,
        )

    assignment.status = "IN_PROGRESS"
    assignment.save(update_fields=["status"])

    return LaunchData(
        provider=provider,
        claims=claims,
        user=user,
        assignment=assignment,
        attempt=attempt,
    )


def _build_client_assertion(provider: LmsProvider) -> str:
    private_pem, _ = _load_or_generate_tool_keys()
    kid = os.environ.get("QB_LTI_KEY_ID", "querybench-tool-key")
    now = int(time.time())
    payload = {
        "iss": provider.client_id,
        "sub": provider.client_id,
        "aud": provider.token_url,
        "iat": now,
        "exp": now + 300,
        "jti": uuid.uuid4().hex,
    }
    headers = {"kid": kid, "typ": "JWT"}
    return jwt.encode(payload, private_pem, algorithm="RS256", headers=headers)


def _fetch_access_token(provider: LmsProvider, scope: str) -> str:
    assertion = _build_client_assertion(provider)
    payload = {
        "grant_type": "client_credentials",
        "client_assertion_type": "urn:ietf:params:oauth:client-assertion-type:jwt-bearer",
        "client_assertion": assertion,
        "scope": scope or "https://purl.imsglobal.org/spec/lti-ags/scope/score",
    }
    token_resp = requests.post(provider.token_url, data=payload, timeout=10)
    token_resp.raise_for_status()
    data = token_resp.json()
    token = data.get("access_token", "")
    if not token:
        raise LtiValidationError("Token endpoint did not return access_token.")
    return token


def submit_grade_for_attempt(attempt: Attempt, score: float, max_score: float) -> Dict[str, Any]:
    if attempt.source != "lms":
        raise LtiValidationError("Attempt is not LMS-sourced.")
    if not attempt.lms_provider_id:
        raise LtiValidationError("Attempt missing LMS provider reference.")
    if not attempt.lti_lineitem:
        raise LtiValidationError("Attempt missing LTI lineitem URL.")

    provider = attempt.lms_provider
    if provider is None:
        raise LtiValidationError("Referenced LMS provider not found.")

    access_token = _fetch_access_token(provider, attempt.lti_ags_scope)
    scores_url = attempt.lti_lineitem.rstrip("/") + "/scores"
    now_iso = timezone.now().isoformat()
    body = {
        "timestamp": now_iso,
        "scoreGiven": float(score),
        "scoreMaximum": float(max_score),
        "activityProgress": "Completed",
        "gradingProgress": "FullyGraded",
        "userId": attempt.lti_user_id,
    }

    resp = requests.post(
        scores_url,
        json=body,
        timeout=10,
        headers={
            "Authorization": f"Bearer {access_token}",
            "Content-Type": "application/vnd.ims.lis.v1.score+json",
        },
    )
    resp.raise_for_status()

    return {
        "scoreGiven": float(score),
        "scoreMaximum": float(max_score),
        "timestamp": now_iso,
    }


def enforce_https_for_lti(request) -> None:
    if settings.DEBUG:
        return
    proto = request.META.get("HTTP_X_FORWARDED_PROTO", "")
    if request.is_secure() or proto == "https":
        return
    raise LtiValidationError("LTI endpoints require HTTPS.")
