// Participant E2E Test
// Runs AFTER admin_e2e.cy.js (alphabetical order guarantees this).
// Reads participant credentials and assessment details from cypress/fixtures/e2e_session.json.
//
// Scenario coverage across 5 questions:
//   Q1 — Wrong syntax      : SELCT typo              → "Query Execution Failed"
//   Q2 — Correct syntax,   : Missing column (Phone)  → "Result Mismatch"
//        wrong projection
//   Q3 — Correct answer    : Exact solution query    → "Query Correct!"
//   Q4 — Correct answer    : Run and evaluated       → "Query Correct!"
//   Q5 — Correct answer    : Run and evaluated       → "Query Correct!"
// Final: Finish → Confirm → "Assessment Submitted"
// Epilogue: Admin logs in and verifies the result row appears.

describe('Participant Flow E2E', () => {
  const admin = { username: 'admin', password: 'admin123' };

  // Populated from fixture written by admin_e2e.cy.js
  let participant;
  let assessmentName;
  let questions;

  before(() => {
    cy.readFile('cypress/fixtures/e2e_session.json').then((data) => {
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
    // Wait up to 10 s for the Begin button — the dashboard may still be fetching assignments
    cy.contains('button', 'Begin', { timeout: 10000 }).click();
    // Verify first question prompt is visible — assessment loaded successfully
    cy.contains(questions[0].prompt, { timeout: 10000 }).should('exist');
    // Step navigator shows exactly as many steps as questions were created
    cy.contains('button', new RegExp('^' + questions.length + '$'), { timeout: 8000 }).should('exist');
  });

  // ─── Schema Explorer ─────────────────────────────────────────────────────

  it('3. Explorer tab shows only Q1-relevant table', () => {
    // The schema API is called with question_id, so the backend filters to only
    // the tables referenced in Q1's solution query: Customers.
    cy.contains('button', 'Explorer').click();

    // Customers must be visible — it is the only table in Q1's solution query
    cy.contains('Customers', { timeout: 8000 }).should('be.visible');

    // Column details inside the Customers card must be visible
    cy.contains('CustomerID').should('be.visible');

    // Tables outside Q1's solution must not appear in the explorer
    cy.contains('Products').should('not.exist');
    cy.contains('Suppliers').should('not.exist');
  });

  // ─── ER Diagram ──────────────────────────────────────────────────────────

  it('4. Diagram tab renders ER diagram for Q1-relevant table', () => {
    cy.contains('button', 'Diagram').click();

    // ReactFlow root element must mount
    cy.get('.react-flow', { timeout: 8000 }).should('exist');

    // Q1's solution references only Customers — that is the only node in the diagram
    cy.get('.react-flow__nodes').contains('Customers').should('exist');

    // Tables outside Q1's solution must not appear as diagram nodes
    cy.get('.react-flow__nodes').contains('Orders').should('not.exist');
    cy.get('.react-flow__nodes').contains('Products').should('not.exist');
    cy.get('.react-flow__nodes').contains('Suppliers').should('not.exist');

    // Return to Prompt tab. Wait briefly for React Flow to fully unmount — without
    // this pause the CodeMirror editor in the next test can miss the click due to
    // residual focus held by the React Flow canvas.
    cy.contains('button', 'Prompt').click();
    cy.wait(500);
  });

  // ─── Q1: Wrong Syntax ────────────────────────────────────────────────────

  // Uses function() syntax so this.skip() is available.
  it('5. Q1 — Wrong Syntax Answer (SELCT typo)', function () {
    if (!questions[0]) return this.skip();

    cy.contains(questions[0].prompt, { timeout: 5000 }).should('be.visible');

    // Type a query with a syntax error (misspelled SELECT keyword)
    typeQuery('SELCT DISTINCT Country FROM Customers ORDER BY Country;');

    cy.contains('button', 'Run Query').click();

    cy.wait(1000);

    cy.contains('Query Execution Failed', { timeout: 15000 }).should('be.visible');
  });

  // ─── Q2: Correct Syntax, Wrong Projection ────────────────────────────────

  it('6. Q2 — Correct Syntax, Wrong Projection (missing Phone column)', function () {
    if (!questions[1]) return this.skip();

    cy.contains('button', /^2$/).click();
    cy.contains(questions[1].prompt, { timeout: 5000 }).should('be.visible');

    // Valid SQL — but omits the Phone column the solution requires
    typeQuery('SELECT SupplierName FROM Suppliers ORDER BY SupplierName;');

    cy.contains('button', 'Run Query').click();

    cy.wait(1000);

    cy.contains('Result Mismatch', { timeout: 15000 }).should('be.visible');
  });

  // ─── Q3: Correct Answer ──────────────────────────────────────────────────

  it('7. Q3 — Correct Answer', function () {
    if (!questions[2]) return this.skip();

    cy.contains('button', /^3$/).click();
    cy.contains(questions[2].prompt, { timeout: 5000 }).should('be.visible');

    typeQuery(questions[2].query);

    cy.contains('button', 'Run Query').click();

    cy.wait(1000);

    cy.contains('Query Correct', { timeout: 15000 }).should('be.visible');
  });

  // ─── Q4: Correct Answer ───────────────────────────────────────────────────

  it('8. Q4 — Correct Answer', function () {
    if (!questions[3]) return this.skip();

    cy.contains('button', /^4$/).click();
    cy.contains(questions[3].prompt, { timeout: 5000 }).should('be.visible');

    typeQuery(questions[3].query);

    cy.contains('button', 'Run Query').click();

    cy.wait(1000);

    cy.contains('Query Correct', { timeout: 15000 }).should('be.visible');
  });

  // ─── Q5: Correct Answer ───────────────────────────────────────────────────

  it('9. Q5 — Correct Answer', function () {
    if (!questions[4]) return this.skip();

    cy.contains('button', new RegExp('^' + questions.length + '$')).click();
    cy.contains(questions[4].prompt, { timeout: 5000 }).should('be.visible');

    typeQuery(questions[4].query);

    cy.contains('button', 'Run Query').click();

    cy.wait(1000);

    cy.contains('Query Correct', { timeout: 15000 }).should('be.visible');
  });

  // ─── Submit Assessment ───────────────────────────────────────────────────

  it('10. Participant Submits Assessment', () => {
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

  it('11. Admin Verifies Results', () => {
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
