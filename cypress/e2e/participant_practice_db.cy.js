// Participant E2E Test — SQL_TRAINING Infrastructure
// Runs AFTER admin_training_e2e.cy.js (alphabetical order guarantees this).
// Reads participant credentials and assessment details from
// cypress/fixtures/e2e_session_training.json.
//
// Scenario coverage across 10 questions:
//   Q1 — Wrong syntax      : SELCT typo (SQL_STORE.customers)   → "Query Execution Failed"
//   Q2 — Correct syntax,   : Missing Phone column (shippers)    → "Result Mismatch"
//        wrong projection
//   Q3..Q10 — Correct answer queries from fixture                → "Query Correct!"
// Final: Finish → Confirm → "Assessment Submitted"
// Epilogue: Admin logs in and verifies the result row appears.

describe('Participant Flow E2E — SQL Training', () => {
  const admin = { username: 'admin', password: 'admin123' };

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

  // Helper: focus the CodeMirror editor, clear any existing content, then type a query.
  // Clears first (select-all + delete) to avoid appending to leftover content from a
  // previous run or autocomplete insertion. Uses Escape to dismiss any open autocomplete.
  // force:true is required after switching away from the Diagram tab (React Flow holds
  // focus and the actionability check would otherwise fail).
  const typeQuery = (query) => {
    cy.get('.cm-content')
      .click({ force: true })
      .type('{selectall}', { parseSpecialCharSequences: true })
      .type('{del}', { parseSpecialCharSequences: true })
      .type('{esc}', { parseSpecialCharSequences: true })
      .type(query, { parseSpecialCharSequences: false, delay: 30 });
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
    // Wait up to 10 s for the Begin button — the dashboard may still be fetching assignments
    cy.contains('button', 'Begin', { timeout: 10000 }).click();
    // Verify first question prompt is visible — assessment loaded successfully
    cy.contains(questions[0].prompt, { timeout: 10000 }).should('exist');
    // Step navigator shows exactly as many steps as questions in the assessment
    cy.contains('button', new RegExp('^' + questions.length + '$'), { timeout: 8000 }).should('exist');
  });

  // ─── Schema Explorer ─────────────────────────────────────────────────────

  it('3. Explorer tab shows only Q1-relevant table (customers)', () => {
    // Q1 solution references SQL_STORE.customers, so the backend filters the Explorer
    // to show only that table.
    cy.contains('button', 'Explorer').click();

    // customers must be visible — it is the only table in Q1's solution query
    cy.contains('customers', { timeout: 8000 }).should('be.visible');

    // A known column from SQL_STORE.customers must appear in the detail view
    cy.contains('CustomerID').should('be.visible');

    // Tables from other queries / schemas must not appear
    cy.contains('Movie').should('not.exist');
    cy.contains('shippers').should('not.exist');
    cy.contains('orders').should('not.exist');
  });

  // ─── ER Diagram ──────────────────────────────────────────────────────────

  it('4. Diagram tab renders ER diagram for Q1-relevant table', () => {
    cy.contains('button', 'Diagram').click();

    // ReactFlow root element must mount
    cy.get('.react-flow', { timeout: 8000 }).should('exist');

    // Q1's solution references only SQL_STORE.customers — that is the only node
    cy.get('.react-flow__nodes').contains('customers').should('exist');

    // Tables outside Q1's solution must not appear as diagram nodes
    cy.get('.react-flow__nodes').contains('Movie').should('not.exist');
    cy.get('.react-flow__nodes').contains('orders').should('not.exist');
    cy.get('.react-flow__nodes').contains('shippers').should('not.exist');

    // Return to Prompt tab. Wait briefly for React Flow to fully unmount — without
    // this pause the CodeMirror editor in the next test can miss the click due to
    // residual focus held by the React Flow canvas.
    cy.contains('button', 'Prompt').click();
    cy.wait(500);
  });

  // ─── Q1: Wrong Syntax ────────────────────────────────────────────────────

  it('5. Q1 — Wrong Syntax Answer (SELCT typo)', function () {
    if (!questions[0]) return this.skip();

    cy.contains(questions[0].prompt, { timeout: 5000 }).should('be.visible');

    // Misspelled SELECT keyword — should cause a SQL Server parse error
    typeQuery('SELCT DISTINCT Country FROM SQL_STORE.customers ORDER BY Country;');

    cy.contains('button', 'Run Query').click();

    cy.wait(1000);

    cy.contains('Query Execution Failed', { timeout: 15000 }).should('be.visible');
  });

  // ─── Q2: Correct Syntax, Wrong Projection ────────────────────────────────

  it('6. Q2 — Correct Syntax, Wrong Projection (missing Phone column)', function () {
    if (!questions[1]) return this.skip();

    cy.contains('button', /^2$/).click();
    cy.contains(questions[1].prompt, { timeout: 5000 }).should('be.visible');

    // Valid SQL — but omits the Phone column that the solution requires
    typeQuery('SELECT ShipperName FROM SQL_STORE.shippers ORDER BY ShipperName;');

    cy.contains('button', 'Run Query').click();

    cy.wait(1000);

    cy.contains('Result Mismatch', { timeout: 15000 }).should('be.visible');
  });

  // ─── Q3..Q10: Correct Answers ──────────────────────────────────────────────

  it('7. Q3..Q10 — Correct Answers from Fixture', function () {
    if (!questions[2]) return this.skip();

    for (let i = 2; i < questions.length; i += 1) {
      const questionNumber = i + 1;
      cy.contains('button', new RegExp(`^${questionNumber}$`)).click();
      cy.contains(questions[i].prompt, { timeout: 5000 }).should('be.visible');

      typeQuery(questions[i].query);
      cy.contains('button', 'Run Query').click();
      cy.wait(1000);
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
