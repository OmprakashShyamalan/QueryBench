// Participant E2E Test
// Runs AFTER admin_e2e.cy.js (alphabetical order guarantees this).
// Reads participant credentials and assessment details from cypress/fixtures/e2e_session.json.
//
// Scenario coverage across 5 questions:
//   Q1 — Wrong syntax      : SELCT typo              → "Query Execution Failed"
//   Q2 — Correct syntax,   : Missing column (Phone)  → "Result Mismatch"
//        wrong projection
//   Q3 — Correct answer    : Exact solution query    → "Query Correct!"
//   Q4 — Correct answer    : Typed, not run (still submitted)
//   Q5 — Correct answer    : Typed, not run (still submitted)
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
  const typeQuery = (query) => {
    cy.get('.cm-content')
      .click()
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

  it('2. Participant Opens Assigned Assessment', () => {
    cy.contains('button', 'Begin').click();
    // Verify first question prompt is visible — assessment loaded successfully
    cy.contains(questions[0].prompt, { timeout: 10000 }).should('exist');
    // Step navigator shows all 5 questions
    cy.contains('button', /^5$/).should('exist');
  });

  // ─── Schema Explorer ─────────────────────────────────────────────────────

  it('3. Explorer tab shows all schema tables', () => {
    // Q1 solution query uses Customers — full schema is loaded for this assessment DB
    cy.contains('button', 'Explorer').click();

    // Tables directly referenced in solution queries
    cy.contains('Customers', { timeout: 8000 }).should('be.visible');

    // Tables not referenced in Q1 but present in the full schema — verifies the
    // explorer shows the complete data model, not just the question-scoped subset
    cy.contains('Products', { timeout: 8000 }).should('be.visible');
    cy.contains('Suppliers', { timeout: 8000 }).should('be.visible');

    // Column details inside the Customers card must be visible
    cy.contains('CustomerID').should('be.visible');
  });

  // ─── ER Diagram ──────────────────────────────────────────────────────────

  it('4. Diagram tab renders ER diagram with all table nodes and FK edges', () => {
    cy.contains('button', 'Diagram').click();

    // ReactFlow root element must mount
    cy.get('.react-flow', { timeout: 8000 }).should('exist');

    // Full-schema nodes: tables not scoped to the solution query must also appear
    cy.get('.react-flow__nodes').contains('Customers').should('exist');
    cy.get('.react-flow__nodes').contains('Orders').should('exist');
    cy.get('.react-flow__nodes').contains('Products').should('exist');
    cy.get('.react-flow__nodes').contains('Suppliers').should('exist');

    // FK edges must be drawn (complete schema has multiple FKs)
    cy.get('.react-flow__edges .react-flow__edge').should('have.length.greaterThan', 2);

    // Return to Prompt tab so subsequent tests start from a clean state
    cy.contains('button', 'Prompt').click();
  });

  // ─── Q1: Wrong Syntax ────────────────────────────────────────────────────

  it('5. Q1 — Wrong Syntax Answer (SELCT typo)', () => {
    // Q1 is active by default (index 0)
    cy.contains(questions[0].prompt, { timeout: 5000 }).should('be.visible');

    // Type a query with a syntax error (misspelled SELECT keyword)
    typeQuery('SELCT DISTINCT Country FROM Customers ORDER BY Country;');

    cy.contains('button', 'Run Query').click();

    // Wait for the backend to execute the query before asserting the result label
    cy.wait(1000);

    // Expect the engine to report a SQL execution error (pyodbc relays the DB syntax error)
    cy.contains('Query Execution Failed', { timeout: 15000 }).should('be.visible');
  });

  // ─── Q2: Correct Syntax, Wrong Projection ────────────────────────────────

  it('6. Q2 — Correct Syntax, Wrong Projection (missing Phone column)', () => {
    // Navigate to Q2 via step navigator
    cy.contains('button', /^2$/).click();
    cy.contains(questions[1].prompt, { timeout: 5000 }).should('be.visible');

    // Valid SQL — but omits the Phone column the solution requires
    typeQuery('SELECT SupplierName FROM Suppliers ORDER BY SupplierName;');

    cy.contains('button', 'Run Query').click();

    // Wait for execution and evaluation round-trip before asserting the result label
    cy.wait(1000);

    // Column count mismatch → evaluation returns INCORRECT → UI shows Result Mismatch
    cy.contains('Result Mismatch', { timeout: 15000 }).should('be.visible');
  });

  // ─── Q3: Correct Answer ──────────────────────────────────────────────────

  it('7. Q3 — Correct Answer', () => {
    cy.contains('button', /^3$/).click();
    cy.contains(questions[2].prompt, { timeout: 5000 }).should('be.visible');

    // Exact solution query
    typeQuery('SELECT CategoryID, COUNT(*) AS ProductCount FROM Products GROUP BY CategoryID ORDER BY CategoryID;');

    cy.contains('button', 'Run Query').click();

    // Wait for execution and evaluation round-trip before asserting the result label
    cy.wait(1000);

    // Validation engine confirms the result matches the expected output
    cy.contains('Query Correct', { timeout: 15000 }).should('be.visible');
  });

  // ─── Q4: Correct Answer (typed, not run) ─────────────────────────────────

  it('8. Q4 — Correct Answer (typed, not run)', () => {
    cy.contains('button', /^4$/).click();
    cy.contains(questions[3].prompt, { timeout: 5000 }).should('be.visible');

    // Type the correct answer — submission will still capture this query
    typeQuery('SELECT OrderID, CustomerID, OrderDate FROM Orders WHERE YEAR(OrderDate) = 1997 ORDER BY OrderDate;');
  });

  // ─── Q5: Correct Answer (typed, not run) ─────────────────────────────────

  it('9. Q5 — Correct Answer (typed, not run)', () => {
    cy.contains('button', /^5$/).click();
    cy.contains(questions[4].prompt, { timeout: 5000 }).should('be.visible');

    typeQuery('SELECT TOP 5 CustomerID, COUNT(*) AS OrderCount FROM Orders GROUP BY CustomerID ORDER BY OrderCount DESC;');
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
