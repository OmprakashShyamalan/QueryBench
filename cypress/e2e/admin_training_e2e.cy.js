// Admin E2E Test — Contact Module Assessment (CORE_20_1_0208_CLEANUP_BA Infrastructure)
// Runs AFTER admin_local.cy.js and BEFORE participant_training_e2e.cy.js (alphabetical order).
//
// Creates:
//   • CORE_20_1_0208_CLEANUP_BA database config (SQL Server auth, not Windows auth)
//   • 10 questions for the Contact module (CN_ domain + reference lookups)
//   • 1 assessment with all 10 Contact module questions
//   • 1 assignment to the freshly-created participant
//
// Session data is written to cypress/fixtures/e2e_session_training.json
// for participant_training_e2e.cy.js to consume.
//
// Assessment question order (drives participant test scenarios):
//   AQ1 — Contact Directory With Phone Type And City  → wrong-syntax test
//   AQ2 — Preferred Email Contacts                    → wrong-projection test
//   AQ3..AQ10                                         → correct answers

describe('Admin Setup E2E — Contact Module Assessment', () => {
  const admin = { username: 'admin', password: 'admin123' };
  const ts = Date.now();
  const participant = {
    username: `e2e_train_${ts}`,
    password: 'password123',
    email: `e2e_train_${ts}@example.com`,
  };

  // Credentials loaded from cypress.env.json (gitignored — never committed).
  // Copy cypress.env.json.example → cypress.env.json and fill in CORE_* values before running.
  const requireEnv = (key) => {
    const value = Cypress.env(key);
    expect(value, `Missing Cypress env var: ${key}`).to.be.a('string').and.not.be.empty;
    return value;
  };

  const getInfra = () => ({
    name: 'IDIT_DB',
    host: requireEnv('CORE_DB_HOST'),
    port: '1433',
    dbName: requireEnv('CORE_DB_NAME'),
    provider: 'SQL_SERVER',
    username: requireEnv('CORE_DB_USERNAME'),
    password: requireEnv('CORE_DB_PASSWORD'),
  });

  const contactQuestions = [
    {
      title: 'Contact Directory With Phone Type And City',
      prompt:
        'Create a contact extract that an operations team can use immediately. Show only contacts that have both a valid phone record and address mapping, and include the business phone type. Return ContactID, ContactName, TelephoneType, PhoneNumber, and CityName.',
      query: 'SELECT TOP 20 c.ID AS ContactID, c.NAME AS ContactName, tt.DESCRIPTION AS TelephoneType, t.TELEPHONE_NUMBER AS PhoneNumber, a.CITY_NAME AS CityName FROM dbo.CN_CONTACT c JOIN dbo.CN_CONTACT_TELEPHONE t ON t.CONTACT_ID = c.ID JOIN dbo.T_TELEPHONE_TYPE tt ON tt.ID = t.TELEPHONE_TYPE JOIN dbo.CN_CONTACT_ADDRESS ca ON ca.CONTACT_ID = c.ID JOIN dbo.CN_ADDRESS a ON a.ID = ca.ADRESS_ID WHERE c.NAME IS NOT NULL AND tt.DESCRIPTION IS NOT NULL AND t.TELEPHONE_NUMBER IS NOT NULL AND a.CITY_NAME IS NOT NULL ORDER BY c.ID DESC;',
      difficulty: 'EASY',
    },
    {
      title: 'Preferred Email Contacts',
      prompt:
        'Build an outreach-ready email dataset for business users. Include each contact\'s email type and preferred flag so communication priority can be decided. Return ContactID, ContactName, EmailType, EmailAddress, and IsPreferred.',
      query: 'SELECT TOP 20 c.ID AS ContactID, c.NAME AS ContactName, et.DESCRIPTION AS EmailType, e.EMAIL AS EmailAddress, e.IS_PREFERRED AS IsPreferred FROM dbo.CN_CONTACT_EMAIL e JOIN dbo.CN_CONTACT c ON c.ID = e.CONTACT_ID JOIN dbo.T_EMAIL_TYPE et ON et.ID = e.EMAIL_TYPE WHERE c.NAME IS NOT NULL AND et.DESCRIPTION IS NOT NULL AND e.EMAIL IS NOT NULL ORDER BY e.IS_PREFERRED DESC, c.ID DESC;',
      difficulty: 'EASY',
    },
    {
      title: 'Person Demographics Snapshot',
      prompt:
        'Produce a demographic snapshot for reporting. Include only records where both birth-date and gender reference data are available. Return ContactID, ContactName, DateOfBirth, and GenderDescription.',
      query: 'SELECT TOP 20 c.ID AS ContactID, c.NAME AS ContactName, p.DATE_OF_BIRTH AS DateOfBirth, g.DESCRIPTION AS GenderDescription FROM dbo.CN_PERSON p JOIN dbo.CN_CONTACT c ON c.ID = p.CONTACT_ID JOIN dbo.T_GENDER g ON g.ID = p.GENDER WHERE c.NAME IS NOT NULL AND p.DATE_OF_BIRTH IS NOT NULL AND g.DESCRIPTION IS NOT NULL ORDER BY p.DATE_OF_BIRTH ASC;',
      difficulty: 'MEDIUM',
    },
    {
      title: 'Contact Relationship Network',
      prompt:
        'Generate a relationship network extract that business users can interpret without codes. Show both sides of each relationship and the business relationship description. Return RelationshipID, PrimaryContact, RelatedContact, and RelationshipDescription.',
      query: 'SELECT TOP 20 r.ID AS RelationshipID, ca.NAME AS PrimaryContact, cb.NAME AS RelatedContact, rt.RELATIONSHIP_DSC AS RelationshipDescription FROM dbo.CN_CONTACT_RELATIONSHIP r JOIN dbo.CN_CONTACT ca ON ca.ID = r.CONTACT_ID_A JOIN dbo.CN_CONTACT cb ON cb.ID = r.CONTACT_ID_B JOIN dbo.T_CONTACT_RELATIONSHIP_TYPE rt ON rt.ID = r.RELATIONSHIP_TYPE WHERE ca.NAME IS NOT NULL AND cb.NAME IS NOT NULL AND rt.RELATIONSHIP_DSC IS NOT NULL ORDER BY r.ID DESC;',
      difficulty: 'MEDIUM',
    },
    {
      title: 'Company Registry View',
      prompt:
        'Build a company master-data view suitable for underwriting and finance review. Combine legal identity, reference information, activity description, and currency context. Return LegalEntityName, ContactReference, RegisteredName, ActivityDescription, and CurrencyCode.',
      query: 'SELECT TOP 20 c.NAME AS LegalEntityName, co.CONTACT_REF AS ContactReference, COALESCE(co.REGISTERED_NAME, c.NAME) AS RegisteredName, bat.ACTIVITY_DESCRIPTION AS ActivityDescription, cur.DESCRIPTION_SHORT AS CurrencyCode FROM dbo.CN_COMPANY co JOIN dbo.CN_CONTACT c ON c.ID = co.CONTACT_ID JOIN dbo.T_BUSINESS_ACTIVITY_TYPE bat ON bat.ID = co.ACTIVITY_TYPE JOIN dbo.T_CURRENCY cur ON cur.ID = co.CURRENCY_ID WHERE c.NAME IS NOT NULL AND co.CONTACT_REF IS NOT NULL AND COALESCE(co.REGISTERED_NAME, c.NAME) IS NOT NULL AND bat.ACTIVITY_DESCRIPTION IS NOT NULL AND cur.DESCRIPTION_SHORT IS NOT NULL ORDER BY c.NAME;',
      difficulty: 'HARD',
    },
    {
      title: 'Service Provider Agreement List',
      prompt:
        'Create a service-provider onboarding report. Show who the provider is, what service type they belong to, and when the agreement began. Return ServiceProviderID, ProviderName, ServiceTypeDescription, and AgreementStartDate.',
      query: 'SELECT TOP 20 sp.ID AS ServiceProviderID, c.NAME AS ProviderName, st.DESCRIPTION AS ServiceTypeDescription, sp.AGREEMENT_START_DATE AS AgreementStartDate FROM dbo.CN_SERVICE_PROVIDER sp JOIN dbo.CN_CONTACT c ON c.ID = sp.CONTACT_ID JOIN dbo.T_SERVICE_TYPE st ON st.ID = sp.SERVICE_TYPE_ID WHERE c.NAME IS NOT NULL AND st.DESCRIPTION IS NOT NULL AND sp.AGREEMENT_START_DATE IS NOT NULL ORDER BY sp.AGREEMENT_START_DATE DESC;',
      difficulty: 'EASY',
    },
    {
      title: 'Provider To Business Contact Mapping',
      prompt:
        'Prepare a provider-to-business-contact linkage report for operations tracking. Include provider identity, service type description, linked business contact, and the most recent update timestamp. Return LinkID, ServiceProviderName, ServiceTypeDescription, LinkedBusinessContact, and LastUpdatedAt.',
      query: 'SELECT TOP 20 sb.ID AS LinkID, spc.NAME AS ServiceProviderName, st.DESCRIPTION AS ServiceTypeDescription, bc.NAME AS LinkedBusinessContact, sb.UPDATE_DATE AS LastUpdatedAt FROM dbo.CN_SERVICE_PROVIDER_BC sb JOIN dbo.CN_SERVICE_PROVIDER sp ON sp.ID = sb.SERVICE_PROVIDER_ID JOIN dbo.CN_CONTACT spc ON spc.ID = sp.CONTACT_ID JOIN dbo.T_SERVICE_TYPE st ON st.ID = sp.SERVICE_TYPE_ID JOIN dbo.CN_CONTACT bc ON bc.ID = sb.CONTACT_ID WHERE spc.NAME IS NOT NULL AND st.DESCRIPTION IS NOT NULL AND bc.NAME IS NOT NULL AND sb.UPDATE_DATE IS NOT NULL ORDER BY sb.UPDATE_DATE DESC;',
      difficulty: 'EASY',
    },
    {
      title: 'Affinity Membership Volume',
      prompt:
        'Summarize customer segmentation by affinity group for business analysis. Show affinity descriptions and rank groups by membership size. Return AffinityID, AffinityDescription, and MemberCount, highest first.',
      query: 'SELECT TOP 20 m.AFFINITY_ID AS AffinityID, a.DESCRIPTION AS AffinityDescription, COUNT(*) AS MemberCount FROM dbo.CN_AFFINITY_MEMBERSHIP m JOIN dbo.T_AFFINITY a ON a.ID = m.AFFINITY_ID WHERE a.DESCRIPTION IS NOT NULL AND m.CONTACT_ID IS NOT NULL GROUP BY m.AFFINITY_ID, a.DESCRIPTION HAVING COUNT(*) > 0 ORDER BY MemberCount DESC, m.AFFINITY_ID;',
      difficulty: 'MEDIUM',
    },
    {
      title: 'City-Wise Address Concentration',
      prompt:
        'Produce a geographic concentration report to support regional planning. Aggregate maintained addresses by city and country description. Return CityName, CountryDescription, and AddressCount.',
      query: 'SELECT TOP 20 a.CITY_NAME AS CityName, ctry.DESCRIPTION AS CountryDescription, COUNT(*) AS AddressCount FROM dbo.CN_ADDRESS a JOIN dbo.T_COUNTRY ctry ON ctry.ID = a.COUNTRY_ID WHERE a.CITY_NAME IS NOT NULL AND ctry.DESCRIPTION IS NOT NULL GROUP BY a.CITY_NAME, ctry.DESCRIPTION HAVING COUNT(*) > 0 ORDER BY AddressCount DESC, a.CITY_NAME;',
      difficulty: 'MEDIUM',
    },
    {
      title: 'Role Distribution Analytics',
      prompt:
        'Build a role-distribution summary for governance and audit reporting. Show contact volume per role and the earliest and latest role timeline markers. Return RoleID, RoleDescription, ContactCount, EarliestEffectiveDate, and LatestUpdateDate.',
      query: 'SELECT TOP 20 r.ROLE_ID AS RoleID, cr.DESCRIPTION AS RoleDescription, COUNT(*) AS ContactCount, MIN(r.EFFECTIVE_DATE) AS EarliestEffectiveDate, MAX(r.UPDATE_DATE) AS LatestUpdateDate FROM dbo.CN_CONTACT_ROLE r JOIN dbo.T_CONTACT_ROLE cr ON cr.ID = r.ROLE_ID WHERE cr.DESCRIPTION IS NOT NULL AND r.CONTACT_ID IS NOT NULL AND r.EFFECTIVE_DATE IS NOT NULL GROUP BY r.ROLE_ID, cr.DESCRIPTION HAVING COUNT(*) > 0 ORDER BY ContactCount DESC, r.ROLE_ID;',
      difficulty: 'HARD',
    },
  ];

  // All 10 questions to create in the question bank
  const allQuestions = contactQuestions;

  // All 10 questions will be used in the assessment, preserving authoring order.
  const assessmentQuestionTitles = allQuestions.map((q) => q.title);

  const assessmentName = 'E2E Contact Module Assessment ' + ts;
  const dueDate = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];

  // Tracks question titles that were actually saved after validation
  let createdTitles = [];
  let assessmentCreated = false;

  before(() => {
    // Write initial fixture; test 5 overwrites it with only the created assessment questions.
    cy.writeFile('cypress/fixtures/e2e_session_training.json', {
      participant,
      assessmentName,
      questions: allQuestions,
    });
  });

  // ─── 1. Login ─────────────────────────────────────────────────────────────

  it('1. Admin Logs In', () => {
    cy.visit('/login');
    cy.get('input[name="username"]').type(admin.username);
    cy.get('input[name="password"]').type(admin.password);
    cy.get('button[type="submit"]').click();
    cy.contains('ADMIN', { timeout: 10000 }).should('be.visible');
  });

  // ─── 2. Create participant ────────────────────────────────────────────────

  it('2. Admin Creates Participant User', () => {
    cy.contains('button', 'users').click();
    cy.contains('button', 'Add User').click();

    cy.get('input[name="first_name"]').type('Train');
    cy.get('input[name="last_name"]').type('Tester');
    cy.get('input[name="username"]').type(participant.username);
    cy.get('input[name="email"]').type(participant.email);
    cy.get('input[name="password"]').type(participant.password);
    cy.contains('button', 'PARTICIPANT').click();

    cy.contains('button', 'Create User').click();
    cy.contains(participant.username, { timeout: 10000 }).should('exist');
  });

  // ─── 3. Create infrastructure (SQL auth) ─────────────────────────────────

  it('3. Admin Creates Infrastructure (CORE_20_1_0208_CLEANUP_BA)', () => {
    const infra = getInfra();
    cy.contains('button', 'infrastructure').click({ force: true });
    cy.contains('button', 'Add Target').click();

    cy.get('input[name="config_name"]').type(infra.name);
    cy.get('input[name="database_name"]').type(infra.dbName);
    cy.get('select[name="provider"]').select(infra.provider);
    cy.get('input[name="host"]').type(infra.host);
    cy.get('input[name="port"]').clear().type(infra.port);

    // SQL Server auth — Trusted Connection stays OFF; fill credentials directly
    cy.get('input[name="username"]').type(infra.username);
    cy.get('input[name="password_secret_ref"]').type(infra.password);

    cy.contains('button', 'Test Connection').click();
    cy.wait(2000);
    cy.contains('Connected to', { timeout: 20000 }).should('be.visible');

    cy.contains('button', 'Save Configuration').click();
    cy.contains(infra.dbName, { timeout: 10000 }).should('exist');
  });

  // ─── 4. Create all 10 questions ───────────────────────────────────────────

  it('4. Admin Creates Questions (contact module)', () => {
    const infra = getInfra();
    createdTitles = [];

    cy.contains('button', 'questions').click({ force: true });

    allQuestions.forEach((q) => {
      cy.contains('button', 'Create', { exact: true }).click();

      cy.get('select[name="environment_tag"]').invoke('val', infra.dbName).trigger('change');
      cy.get(`button[name="difficulty-${q.difficulty}"]`).click();
      cy.get('input[name="title"]').type(q.title);
      cy.get('textarea[name="prompt"]').type(q.prompt);

      cy.get('.cm-content').click().type(q.query, { parseSpecialCharSequences: false, delay: 0 });

      // Allow React to flush final CodeMirror onChange before validation reads the query
      cy.wait(300);

      cy.contains('button', 'Validate Logic').click();

      // Wait past the transient 'validating' state before asserting outcome
      cy.wait(2000);

      cy.get('body', { timeout: 25000 })
        .should(($body) => {
          expect($body.text()).to.match(/Validation Passed|Validation Failed/);
        })
        .then(($body) => {
          if ($body.text().includes('Validation Passed')) {
            cy.contains('button', 'Create New Question').click();
            cy.contains(q.title, { timeout: 10000 })
              .should('exist')
              .then(() => {
                createdTitles.push(q.title);
              });
          } else {
            cy.log(`⚠ Validation failed for "${q.title}" — skipping`);
            cy.contains('button', 'Cancel').click();
          }
          // Gate on full modal unmount before next iteration
          cy.get('.cm-content', { timeout: 10000 }).should('not.exist');
        });

      cy.wait(500);
    });

    cy.then(() => {
      expect(
        createdTitles.length,
        `Expected all ${allQuestions.length} questions to pass validation for 10-question contact module assessment`,
      ).to.equal(allQuestions.length);
      cy.log(`✓ ${createdTitles.length}/${allQuestions.length} questions created successfully`);
    });
  });

  // ─── 5. Create assessment with all 10 questions ───────────────────────────

  it('5. Admin Creates Assessment', function () {
    const available = allQuestions.filter(
      (q) => assessmentQuestionTitles.includes(q.title) && createdTitles.includes(q.title),
    );
    if (available.length === 0) {
      cy.log('None of the assessment questions were created — skipping');
      this.skip();
      return;
    }

    cy.contains('button', 'assessments').click({ force: true });
    cy.contains('button', 'Create Assessment').click();

    const infra = getInfra();
    cy.get('input[name="name"]').type(assessmentName);
    cy.get('textarea[name="description"]').type('Full E2E Contact Module Assessment — CN domain');
    cy.get('input[name="duration_minutes"]').clear().type('60');

    cy.get('select[name="db_config"]').invoke('val', infra.dbName).trigger('change');

    // Add only the curated questions that were actually created, preserving order
    assessmentQuestionTitles.forEach((title) => {
      if (createdTitles.includes(title)) {
        cy.get('input[placeholder="Filter questions..."]').clear().type(title);
        cy.contains(title).click();
      }
    });

    cy.contains('button', 'Save Assessment').click();
    cy.contains(assessmentName, { timeout: 10000 })
      .should('exist')
      .then(() => {
        assessmentCreated = true;
        // Update fixture with only the questions that made it into the assessment
        cy.writeFile('cypress/fixtures/e2e_session_training.json', {
          participant,
          assessmentName,
          questions: available,
        });
      });
  });

  // ─── 6. Assign assessment ────────────────────────────────────────────────

  it('6. Admin Assigns Assessment to Participant', function () {
    if (!assessmentCreated) {
      cy.log('Assessment was not created — skipping assignment');
      this.skip();
      return;
    }

    cy.contains('button', 'assignments').click({ force: true });
    cy.contains('button', 'Bulk Assign').click();

    cy.get('select[name="assessment_id"]').select(assessmentName);
    cy.get('input[name="due_date"]').type(dueDate);

    cy.contains('button', 'Pick from List').click();
    cy.get('input[placeholder="Search by name, username, or email..."]').type(participant.username);
    cy.contains(participant.username).click();

    cy.contains('button', 'Assign (1)').click();

    cy.contains(participant.username).should('exist');
    cy.contains(assessmentName).should('exist');
    cy.contains('PENDING').should('exist');
  });

  // ─── 7. Logout ───────────────────────────────────────────────────────────

  it('7. Admin Logs Out', () => {
    cy.get('button[title="Sign Out"]').click();
    cy.get('input[name="username"]', { timeout: 10000 }).should('be.visible');
  });
});
