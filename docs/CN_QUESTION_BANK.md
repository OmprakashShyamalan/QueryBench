# IDIT Contact (CN_) Assessment Question Bank

This assessment bank is for the IDIT Contact domain, where `CN_` denotes Contact entities in the IDIT data model.
All questions use only `CN_` tables, and each solution query enforces non-null output fields.

## 1) Contact Directory With Phone Type And City
- Difficulty: EASY
- Assessment Task: Create a contact extract that an operations team can use immediately. Show only contacts that have both a valid phone record and address mapping, and include the business phone type. Return `ContactID`, `ContactName`, `TelephoneType`, `PhoneNumber`, and `CityName`.

```sql
SELECT TOP 20
    c.ID AS ContactID,
    c.NAME AS ContactName,
    tt.DESCRIPTION AS TelephoneType,
    t.TELEPHONE_NUMBER AS PhoneNumber,
    a.CITY_NAME AS CityName
FROM dbo.CN_CONTACT c
JOIN dbo.CN_CONTACT_TELEPHONE t ON t.CONTACT_ID = c.ID
JOIN dbo.T_TELEPHONE_TYPE tt ON tt.ID = t.TELEPHONE_TYPE
JOIN dbo.CN_CONTACT_ADDRESS ca ON ca.CONTACT_ID = c.ID
JOIN dbo.CN_ADDRESS a ON a.ID = ca.ADRESS_ID
WHERE c.NAME IS NOT NULL
  AND tt.DESCRIPTION IS NOT NULL
  AND t.TELEPHONE_NUMBER IS NOT NULL
  AND a.CITY_NAME IS NOT NULL
ORDER BY c.ID DESC;
```

## 2) Contact Email Channel View
- Difficulty: EASY
- Assessment Task: Build an outreach-ready email dataset for business users. Include each contact's email type and preferred flag so communication priority can be decided. Return `ContactID`, `ContactName`, `EmailType`, `EmailAddress`, and `IsPreferred`.

```sql
SELECT TOP 20
    c.ID AS ContactID,
    c.NAME AS ContactName,
    et.DESCRIPTION AS EmailType,
    e.EMAIL AS EmailAddress,
    e.IS_PREFERRED AS IsPreferred
FROM dbo.CN_CONTACT_EMAIL e
JOIN dbo.CN_CONTACT c ON c.ID = e.CONTACT_ID
JOIN dbo.T_EMAIL_TYPE et ON et.ID = e.EMAIL_TYPE
WHERE c.NAME IS NOT NULL
  AND et.DESCRIPTION IS NOT NULL
  AND e.EMAIL IS NOT NULL
ORDER BY e.IS_PREFERRED DESC, c.ID DESC;
```

## 3) Person Demographics Snapshot
- Difficulty: MEDIUM
- Assessment Task: Produce a demographic snapshot for reporting. Include only records where both birth-date and gender reference data are available. Return `ContactID`, `ContactName`, `DateOfBirth`, and `GenderDescription`.

```sql
SELECT TOP 20
    c.ID AS ContactID,
    c.NAME AS ContactName,
    p.DATE_OF_BIRTH AS DateOfBirth,
    g.DESCRIPTION AS GenderDescription
FROM dbo.CN_PERSON p
JOIN dbo.CN_CONTACT c ON c.ID = p.CONTACT_ID
JOIN dbo.T_GENDER g ON g.ID = p.GENDER
WHERE c.NAME IS NOT NULL
  AND p.DATE_OF_BIRTH IS NOT NULL
  AND g.DESCRIPTION IS NOT NULL
ORDER BY p.DATE_OF_BIRTH ASC;
```

## 4) Contact Relationship Network
- Difficulty: MEDIUM
- Assessment Task: Generate a relationship network extract that business users can interpret without codes. Show both sides of each relationship and the business relationship description. Return `RelationshipID`, `PrimaryContact`, `RelatedContact`, and `RelationshipDescription`.

```sql
SELECT TOP 20
    r.ID AS RelationshipID,
    ca.NAME AS PrimaryContact,
    cb.NAME AS RelatedContact,
    rt.RELATIONSHIP_DSC AS RelationshipDescription
FROM dbo.CN_CONTACT_RELATIONSHIP r
JOIN dbo.CN_CONTACT ca ON ca.ID = r.CONTACT_ID_A
JOIN dbo.CN_CONTACT cb ON cb.ID = r.CONTACT_ID_B
JOIN dbo.T_CONTACT_RELATIONSHIP_TYPE rt ON rt.ID = r.RELATIONSHIP_TYPE
WHERE ca.NAME IS NOT NULL
  AND cb.NAME IS NOT NULL
  AND rt.RELATIONSHIP_DSC IS NOT NULL
ORDER BY r.ID DESC;
```

## 5) Legal Entity Registry View
- Difficulty: MEDIUM
- Assessment Task: Build a company master-data view suitable for underwriting and finance review. Combine legal identity, reference information, activity description, and currency context. Return `LegalEntityName`, `ContactReference`, `RegisteredName`, `ActivityDescription`, and `CurrencyCode`.

```sql
SELECT TOP 20
    c.NAME AS LegalEntityName,
    co.CONTACT_REF AS ContactReference,
    COALESCE(co.REGISTERED_NAME, c.NAME) AS RegisteredName,
    bat.ACTIVITY_DESCRIPTION AS ActivityDescription,
    cur.DESCRIPTION_SHORT AS CurrencyCode
FROM dbo.CN_COMPANY co
JOIN dbo.CN_CONTACT c ON c.ID = co.CONTACT_ID
JOIN dbo.T_BUSINESS_ACTIVITY_TYPE bat ON bat.ID = co.ACTIVITY_TYPE
JOIN dbo.T_CURRENCY cur ON cur.ID = co.CURRENCY_ID
WHERE c.NAME IS NOT NULL
  AND co.CONTACT_REF IS NOT NULL
  AND COALESCE(co.REGISTERED_NAME, c.NAME) IS NOT NULL
  AND bat.ACTIVITY_DESCRIPTION IS NOT NULL
  AND cur.DESCRIPTION_SHORT IS NOT NULL
ORDER BY c.NAME;
```

## 6) Service Provider Agreement List
- Difficulty: MEDIUM
- Assessment Task: Create a service-provider onboarding report. Show who the provider is, what service type they belong to, and when the agreement began. Return `ServiceProviderID`, `ProviderName`, `ServiceTypeDescription`, and `AgreementStartDate`.

```sql
SELECT TOP 20
    sp.ID AS ServiceProviderID,
    c.NAME AS ProviderName,
    st.DESCRIPTION AS ServiceTypeDescription,
    sp.AGREEMENT_START_DATE AS AgreementStartDate
FROM dbo.CN_SERVICE_PROVIDER sp
JOIN dbo.CN_CONTACT c ON c.ID = sp.CONTACT_ID
JOIN dbo.T_SERVICE_TYPE st ON st.ID = sp.SERVICE_TYPE_ID
WHERE c.NAME IS NOT NULL
  AND st.DESCRIPTION IS NOT NULL
  AND sp.AGREEMENT_START_DATE IS NOT NULL
ORDER BY sp.AGREEMENT_START_DATE DESC;
```

## 7) Provider-to-Business Contact Mapping
- Difficulty: MEDIUM
- Assessment Task: Prepare a provider-to-business-contact linkage report for operations tracking. Include provider identity, service type description, linked business contact, and the most recent update timestamp. Return `LinkID`, `ServiceProviderName`, `ServiceTypeDescription`, `LinkedBusinessContact`, and `LastUpdatedAt`.

```sql
SELECT TOP 20
    sb.ID AS LinkID,
    spc.NAME AS ServiceProviderName,
    st.DESCRIPTION AS ServiceTypeDescription,
    bc.NAME AS LinkedBusinessContact,
    sb.UPDATE_DATE AS LastUpdatedAt
FROM dbo.CN_SERVICE_PROVIDER_BC sb
JOIN dbo.CN_SERVICE_PROVIDER sp ON sp.ID = sb.SERVICE_PROVIDER_ID
JOIN dbo.CN_CONTACT spc ON spc.ID = sp.CONTACT_ID
JOIN dbo.T_SERVICE_TYPE st ON st.ID = sp.SERVICE_TYPE_ID
JOIN dbo.CN_CONTACT bc ON bc.ID = sb.CONTACT_ID
WHERE spc.NAME IS NOT NULL
  AND st.DESCRIPTION IS NOT NULL
  AND bc.NAME IS NOT NULL
  AND sb.UPDATE_DATE IS NOT NULL
ORDER BY sb.UPDATE_DATE DESC;
```

## 8) Affinity Membership Volume
- Difficulty: HARD
- Assessment Task: Summarize customer segmentation by affinity group for business analysis. Show affinity descriptions and rank groups by membership size. Return `AffinityID`, `AffinityDescription`, and `MemberCount`, highest first.

```sql
SELECT TOP 20
    m.AFFINITY_ID AS AffinityID,
    a.DESCRIPTION AS AffinityDescription,
    COUNT(*) AS MemberCount
FROM dbo.CN_AFFINITY_MEMBERSHIP m
JOIN dbo.T_AFFINITY a ON a.ID = m.AFFINITY_ID
WHERE a.DESCRIPTION IS NOT NULL
  AND m.CONTACT_ID IS NOT NULL
GROUP BY m.AFFINITY_ID, a.DESCRIPTION
HAVING COUNT(*) > 0
ORDER BY MemberCount DESC, m.AFFINITY_ID;
```

## 9) Address Concentration by City
- Difficulty: HARD
- Assessment Task: Produce a geographic concentration report to support regional planning. Aggregate maintained addresses by city and country description. Return `CityName`, `CountryDescription`, and `AddressCount`.

```sql
SELECT TOP 20
    a.CITY_NAME AS CityName,
    ctry.DESCRIPTION AS CountryDescription,
    COUNT(*) AS AddressCount
FROM dbo.CN_ADDRESS a
JOIN dbo.T_COUNTRY ctry ON ctry.ID = a.COUNTRY_ID
WHERE a.CITY_NAME IS NOT NULL
  AND ctry.DESCRIPTION IS NOT NULL
GROUP BY a.CITY_NAME, ctry.DESCRIPTION
HAVING COUNT(*) > 0
ORDER BY AddressCount DESC, a.CITY_NAME;
```

## 10) Role Distribution Analytics
- Difficulty: HARD
- Assessment Task: Build a role-distribution summary for governance and audit reporting. Show contact volume per role and the earliest and latest role timeline markers. Return `RoleID`, `RoleDescription`, `ContactCount`, `EarliestEffectiveDate`, and `LatestUpdateDate`.

```sql
SELECT TOP 20
    r.ROLE_ID AS RoleID,
    cr.DESCRIPTION AS RoleDescription,
    COUNT(*) AS ContactCount,
    MIN(r.EFFECTIVE_DATE) AS EarliestEffectiveDate,
    MAX(r.UPDATE_DATE) AS LatestUpdateDate
FROM dbo.CN_CONTACT_ROLE r
JOIN dbo.T_CONTACT_ROLE cr ON cr.ID = r.ROLE_ID
WHERE cr.DESCRIPTION IS NOT NULL
  AND r.CONTACT_ID IS NOT NULL
  AND r.EFFECTIVE_DATE IS NOT NULL
GROUP BY r.ROLE_ID, cr.DESCRIPTION
HAVING COUNT(*) > 0
ORDER BY ContactCount DESC, r.ROLE_ID;
```

## Validation Note
All 10 solution queries were executed against `CORE_20_1_0208_CLEANUP_BA` and returned rows.
