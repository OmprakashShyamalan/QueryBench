"""
backend/crypto.py — symmetric encryption for sensitive DB config fields.

Uses Fernet (AES-128-CBC + HMAC-SHA256) from the `cryptography` package.
The key is loaded from the DB_FIELD_ENCRYPTION_KEY environment variable.

Encrypted values are prefixed with "enc:" so plain-text legacy values can be
detected and passed through unchanged (migration safety).

Usage:
    from backend.crypto import encrypt_field, decrypt_field

    stored = encrypt_field(raw_password)      # store this in the DB
    raw    = decrypt_field(stored)            # use this to connect
"""

import os
import logging
from cryptography.fernet import Fernet, InvalidToken

logger = logging.getLogger(__name__)

_ENC_PREFIX = "enc:"

def _get_fernet() -> Fernet | None:
    key = os.environ.get("DB_FIELD_ENCRYPTION_KEY", "").strip()
    if not key:
        logger.warning(
            "DB_FIELD_ENCRYPTION_KEY is not set. "
            "DB passwords are stored unencrypted. Set this variable in production."
        )
        return None
    try:
        return Fernet(key.encode())
    except Exception:
        logger.error("DB_FIELD_ENCRYPTION_KEY is invalid. Must be a valid Fernet key.")
        return None


def encrypt_field(value: str) -> str:
    """
    Encrypts a plain-text string. Returns the encrypted value prefixed with 'enc:'.
    Returns the original value unchanged if encryption key is not configured.
    Empty strings are returned as-is.
    """
    if not value:
        return value
    f = _get_fernet()
    if f is None:
        return value
    return _ENC_PREFIX + f.encrypt(value.encode()).decode()


def decrypt_field(value: str) -> str:
    """
    Decrypts a value previously encrypted by encrypt_field.
    If the value does not start with 'enc:' (plain-text legacy), returns it as-is.
    Empty strings are returned as-is.
    """
    if not value or not value.startswith(_ENC_PREFIX):
        return value  # plain-text legacy or empty — pass through
    f = _get_fernet()
    if f is None:
        # Key missing: strip prefix and return raw encrypted bytes (will likely fail downstream)
        logger.error("Cannot decrypt DB password: DB_FIELD_ENCRYPTION_KEY is not set.")
        return value
    try:
        return f.decrypt(value[len(_ENC_PREFIX):].encode()).decode()
    except InvalidToken:
        logger.error("Failed to decrypt DB password: invalid token or wrong key.")
        return ""
