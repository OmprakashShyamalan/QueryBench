// Participant E2E Test — Contact Module Assessment (CORE_20_1_0208_CLEANUP_BA Infrastructure)
// Runs AFTER admin_training_e2e.cy.js (alphabetical order guarantees this).
// Reads participant credentials and assessment details from
// cypress/fixtures/e2e_session_training.json.
//
// Scenario coverage across 10 questions:
//   Q1 — Wrong syntax      : SELCT typo                          → "Query Execution Failed"
//   Q2 — Correct syntax,   : Wrong projection                    → "Result Mismatch"
//        wrong projection
//   Q3..Q10 — Correct answer queries from fixture                → "Query Correct!"
// Final: Finish → Confirm → "Assessment Submitted"
// Epilogue: Admin logs in and verifies the result row appears.

describe('Participant Flow E2E — Contact Module Assessment', () => {
  const admin = { username: 'admin', password: 'admin123' };

  const normalizeSql = (value = '') => value.replace(/\r\n/g, '\n').trim();
  const escapeRegExp = (value = '') => value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

  // Populated from fixture written by admin_training_e2e.cy.js
  let participant;
  let assessmentName;
  let questions;

  before(() => {
    cy.readFile('cypress/fixtures/e2e_session_training.json').then((data) => {
      participant = data.participant;
      assessmentName = data.assessmentName;
      questions = data.questions;
    });
  });

  beforeEach(() => {
    cy.intercept('POST', '/api/v1/attempts/run_query_async/').as('runQueryAsync');
  });

  const typeQuery = (query) => {
    cy.setCodeMirrorQuery(query);
  };

  const getPrimaryTableReference = (sql) => {
    const m = (sql || '').match(/\bfrom\s+([\w\[\].]+)/i);
    if (!m) return null;
    const raw = m[1].replace(/\[|\]/g, '');
    const parts = raw.split('.');
    const name = parts.pop() || raw;
    const schema = parts.pop() || '';
    return { raw, schema, name };
  };

  const getTableLabelPattern = (sql) => {
    const ref = getPrimaryTableReference(sql);
    if (!ref) return null;
    if (ref.schema && ref.schema.toLowerCase() !== 'dbo') {
      return new RegExp(`^\\s*(?:${escapeRegExp(ref.schema)}\\s*\\.\\s*)?${escapeRegExp(ref.name)}\\s*$`, 'i');
    }
    return new RegExp(`^\\s*${escapeRegExp(ref.name)}\\s*$`, 'i');
  };

  const runQueryAndAssertSubmission = (expectedQuery) => {
    cy.contains('button', 'Run Query').click();
    cy.wait('@runQueryAsync').then(({ request }) => {
      const body = typeof request.body === 'string' ? JSON.parse(request.body) : request.body;
      expect(normalizeSql(body.query), 'submitted query payload').to.equal(normalizeSql(expectedQuery));
    });
  };

  // ─── Participant Login ────────────────────────────────────────────────────

  it('1. Participant Logs In', () => {
    cy.visit('/login');
    cy.get('input[name="username"]').type(participant.username);
    cy.get('input[name="password"]').type(participant.password);
    cy.get('button[type="submit"]').click();
    cy.contains('Assigned Assessments', { timeout: 10000 }).should('be.visible');
  });

  it('2. Participant Opens Assigned Assessment', function () {
    if (!questions || !questions.length) return this.skip();
    expect(questions.length, 'Training assessment should contain 10 questions').to.equal(10);
    // Open the assignment that matches fixture assessmentName to avoid
    // picking a different pending assignment from prior runs.
    cy.get('button', { timeout: 10000 }).then(($buttons) => {
      const target = Array.from($buttons).find((btn) => {
        const label = (btn.textContent || '').trim();
        if (!/Begin|Resume/.test(label)) return false;
        const card = Cypress.$(btn).closest('div[class*="rounded-3xl"]')[0];
        const cardText = card?.textContent || '';
        return cardText.includes(assessmentName);
      });

      expect(target, `Begin/Resume button for assessment "${assessmentName}"`).to.exist;
      cy.wrap(target).click();
    });
    // Verify first question title is visible — assessment loaded successfully
    cy.contains(questions[0].title, { timeout: 10000 }).should('exist');
    // Step navigator shows exactly as many steps as questions in the assessment
    cy.contains('button', new RegExp('^' + questions.length + '$'), { timeout: 8000 }).should('exist');
  });

  // ─── Schema Explorer ─────────────────────────────────────────────────────

  it('3. Explorer tab shows only Q1-relevant table', () => {
    const tablePattern = getTableLabelPattern(questions?.[0]?.query);
    cy.contains('button', 'Explorer').click();

    if (tablePattern) {
      cy.contains('span', tablePattern, { timeout: 8000 }).should('be.visible');
    }
  });

  // ─── ER Diagram ──────────────────────────────────────────────────────────

  it('4. Diagram tab renders ER diagram for Q1-relevant table', () => {
    const tablePattern = getTableLabelPattern(questions?.[0]?.query);
    cy.contains('button', 'Diagram').click();

    // ReactFlow root element must mount
    cy.get('.react-flow', { timeout: 8000 }).should('exist');

    if (tablePattern) {
      cy.get('.react-flow__node-table', { timeout: 8000 }).contains(tablePattern).should('exist');
    }

    // Return to Task tab. Wait briefly for React Flow to fully unmount — without
    // this pause the CodeMirror editor in the next test can miss the click due to
    // residual focus held by the React Flow canvas.
    cy.contains('button', 'Task').click();
    cy.wait(500);
  });

  // ─── Q1: Wrong Syntax ────────────────────────────────────────────────────

  it('5. Q1 — Wrong Syntax Answer (SELCT typo)', function () {
    if (!questions[0]) return this.skip();

    cy.contains(questions[0].title, { timeout: 5000 }).should('be.visible');

    // Type a query with a syntax error (misspelled SELECT keyword)
    const broken = (questions[0].query || '').replace(/^\s*SELECT/i, 'SELCT');
    typeQuery(broken || 'SELCT 1;');

    runQueryAndAssertSubmission(broken || 'SELCT 1;');

    cy.contains('Query Execution Failed', { timeout: 15000 }).should('be.visible');
  });

  // ─── Q2: Correct Syntax, Wrong Projection ────────────────────────────────

  it('6. Q2 — Correct Syntax, Wrong Projection', function () {
    if (!questions[1]) return this.skip();

    cy.contains('button', /^2$/).click();
    cy.contains(questions[1].title, { timeout: 5000 }).should('be.visible');

    // Valid SQL but intentionally wrong result shape
    const wrongProjectionQuery = 'SELECT 1 AS MismatchValue;';
    typeQuery(wrongProjectionQuery);

    runQueryAndAssertSubmission(wrongProjectionQuery);

    cy.contains('Result Mismatch', { timeout: 15000 }).should('be.visible');
  });

  // ─── Q3..Q10: Correct Answers ──────────────────────────────────────────────

  it('7. Q3..Q10 — Correct Answers from Fixture', function () {
    if (!questions[2]) return this.skip();

    for (let i = 2; i < questions.length; i += 1) {
      const questionNumber = i + 1;
      cy.contains('button', new RegExp(`^${questionNumber}$`)).click();
      cy.contains(questions[i].title, { timeout: 5000 }).should('be.visible');

      typeQuery(questions[i].query);
      runQueryAndAssertSubmission(questions[i].query);
      cy.contains('Query Correct', { timeout: 15000 }).should('be.visible');
    }
  });

  // ─── Submit Assessment ───────────────────────────────────────────────────

  it('8. Participant Submits Assessment', () => {
    // Click Finish to open the confirmation modal
    cy.contains('button', 'Finish').click();

    // Confirm the submission in the modal
    cy.contains('button', 'Confirm').click();

    // Wait for the assessment submission API call to complete
    cy.wait(1000);

    // Submission screen confirms the attempt was recorded
    cy.contains('Assessment Submitted', { timeout: 15000 }).should('exist');
  });

  // ─── Admin Verifies Results ───────────────────────────────────────────────

  it('9. Admin Verifies Results', () => {
    cy.clearCookies();
    cy.visit('/login');
    cy.get('input[name="username"]').type(admin.username);
    cy.get('input[name="password"]').type(admin.password);
    cy.get('button[type="submit"]').click();

    // Wait for admin dashboard to fully load, then navigate to Results tab
    cy.contains('button', 'results', { timeout: 15000 }).click({ force: true });

    // The result row for this participant and assessment must be present
    cy.contains(participant.email, { timeout: 10000 }).should('exist');
    cy.contains(assessmentName).should('exist');
  });
});
