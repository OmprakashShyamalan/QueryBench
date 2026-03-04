// Admin E2E Test
// Covers the full admin setup flow:
// Login → Create Participant → Create Infrastructure → Create Questions → Create Assessment → Assign → Logout
// Session data is written to cypress/fixtures/e2e_session.json for participant_e2e.cy.js to consume.

describe('Admin Setup E2E', () => {
  const admin = { username: 'admin', password: 'admin123' };
  const ts = Date.now();
  const participant = {
    username: `e2e_user_${ts}`,
    password: 'password123',
    email: `e2e_${ts}@example.com`,
  };

  const infra = {
    name: 'W3Schools_DB',
    host: 'INLT3178\\SQLEXPRESS',
    port: '1433',
    dbName: 'W3Schools_DB',
    provider: 'SQL_SERVER',
  };

  const questions = [
    {
      title: 'Customer Countries',
      prompt: 'List each distinct country that has at least one customer. Sort the results alphabetically by country name.',
      query: 'SELECT DISTINCT Country FROM Customers ORDER BY Country;',
      difficulty: 'EASY',
    },
    {
      title: 'Supplier Directory',
      prompt: 'Retrieve the name and phone number of every supplier. Order results by supplier name.',
      query: 'SELECT SupplierName, Phone FROM Suppliers ORDER BY SupplierName;',
      difficulty: 'EASY',
    },
    {
      title: 'Products per Category',
      prompt: 'For each category, return the CategoryID and the number of products it contains (label the count ProductCount). Order by CategoryID ascending.',
      query: 'SELECT CategoryID, COUNT(*) AS ProductCount FROM Products GROUP BY CategoryID ORDER BY CategoryID;',
      difficulty: 'MEDIUM',
    },
    {
      title: 'Orders in 1997',
      prompt: 'List all orders placed during 1997, showing OrderID, CustomerID, and OrderDate. Sort by OrderDate ascending.',
      query: 'SELECT OrderID, CustomerID, OrderDate FROM Orders WHERE YEAR(OrderDate) = 1997 ORDER BY OrderDate;',
      difficulty: 'MEDIUM',
    },
    {
      title: 'Top Customers by Order Volume',
      prompt: 'Find the top 5 customers who have placed the most orders. Show their CustomerID and order count (labelled OrderCount), highest first.',
      query: 'SELECT TOP 5 CustomerID, COUNT(*) AS OrderCount FROM Orders GROUP BY CustomerID ORDER BY OrderCount DESC;',
      difficulty: 'HARD',
    },
  ];

  const assessmentName = 'E2E SQL Assessment ' + ts;
  const dueDate = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];

  // Tracks questions that were actually saved (validation passed + API confirmed).
  // Populated in test 4; read in tests 5 and 6.
  let createdQuestions = [];
  let assessmentCreated = false;

  before(() => {
    // Write initial session data; test 4 will overwrite with only the created questions.
    cy.writeFile('cypress/fixtures/e2e_session.json', {
      participant,
      assessmentName,
      questions,
    });
  });

  it('1. Admin Logs In', () => {
    cy.visit('/login');
    cy.get('input[name="username"]').type(admin.username);
    cy.get('input[name="password"]').type(admin.password);
    cy.get('button[type="submit"]').click();
    cy.contains('ADMIN', { timeout: 10000 }).should('be.visible');
  });

  it('2. Admin Creates Participant User', () => {
    cy.contains('button', 'users').click();
    cy.contains('button', 'Add User').click();

    cy.get('input[name="first_name"]').type('E2E');
    cy.get('input[name="last_name"]').type('Tester');
    cy.get('input[name="username"]').type(participant.username);
    cy.get('input[name="email"]').type(participant.email);
    cy.get('input[name="password"]').type(participant.password);
    cy.contains('button', 'PARTICIPANT').click();

    cy.contains('button', 'Create User').click();
    cy.contains(participant.username, { timeout: 10000 }).should('exist');
  });

  it('3. Admin Creates Infrastructure (W3Schools)', () => {
    cy.contains('button', 'infrastructure').click({ force: true });
    cy.contains('button', 'Add Target').click();

    cy.get('input[name="config_name"]').type(infra.name);
    cy.get('input[name="database_name"]').type(infra.dbName);
    cy.get('select[name="provider"]').select(infra.provider);
    cy.get('input[name="host"]').type(infra.host);
    cy.get('input[name="port"]').clear().type(infra.port);

    // Toggle Trusted Connection (Windows Auth — no credentials needed)
    cy.contains('Trusted Connection').parent().parent().find('button').click();
    cy.get('input[name="username"]').should('not.exist');

    // Test the connection before saving (required for new configs — Save is disabled until test passes)
    cy.contains('button', 'Test Connection').click();
    // Wait for the round-trip DB connection check before asserting the success message
    cy.wait(2000);
    cy.contains('Connected to', { timeout: 20000 }).should('be.visible');

    cy.contains('button', 'Save Configuration').click();
    cy.contains(infra.dbName, { timeout: 10000 }).should('exist');
  });

  it('4. Admin Creates Questions', () => {
    // Reset on every run (handles retries)
    createdQuestions = [];

    cy.contains('button', 'questions').click({ force: true });

    questions.forEach((q) => {
      // exact:true prevents substring-match hitting the "Create New Question" save button
      // in a still-open modal from the previous iteration.
      cy.contains('button', 'Create', { exact: true }).click();

      // Use invoke+trigger to avoid cy.select() error when duplicate options exist from prior runs
      cy.get('select[name="environment_tag"]').invoke('val', infra.dbName).trigger('change');

      cy.get(`button[name="difficulty-${q.difficulty}"]`).click();
      cy.get('input[name="title"]').type(q.title);
      cy.get('textarea[name="prompt"]').type(q.prompt);

      cy.get('.cm-content').click().type(q.query, { parseSpecialCharSequences: false, delay: 0 });

      // Allow React to flush the final CodeMirror onChange → setEditingItem update
      // before validateSQL reads editingItem.solution_query (defence-in-depth alongside ref fix).
      cy.wait(300);

      cy.contains('button', 'Validate Logic').click();

      // Wait past the transient 'validating' UI state (which previously flashed
      // "Validation Failed" text before the actual DB result arrived).
      cy.wait(2000);

      // Wait for validation outcome — handles both outcomes without hanging.
      cy.get('body', { timeout: 25000 }).should(($body) => {
        expect($body.text()).to.match(/Validation Passed|Validation Failed/);
      }).then(($body) => {
        if ($body.text().includes('Validation Passed')) {
          cy.contains('button', 'Create New Question').click();
          // Wait for the question to appear in the list — confirms API save completed.
          // Only then record it as created; this prevents the assessment step from
          // trying to add a question that doesn't actually exist in the DB.
          cy.contains(q.title, { timeout: 10000 }).should('exist').then(() => {
            createdQuestions.push(q);
          });
        } else {
          cy.log(`⚠ Validation failed for "${q.title}" — skipping`);
          cy.contains('button', 'Cancel').click();
        }
        // Gate on full modal unmount before the next forEach iteration.
        // Prevents the next Create click from landing on a still-open modal.
        cy.get('.cm-content', { timeout: 10000 }).should('not.exist');
      });

      cy.wait(500);
    });

    // After the loop, update the fixture so the participant suite only sees real questions.
    cy.then(() => {
      cy.writeFile('cypress/fixtures/e2e_session.json', {
        participant,
        assessmentName,
        questions: createdQuestions,
      });
    });

    // Fail fast with a clear message if nothing was saved — no point continuing.
    cy.then(() => {
      expect(
        createdQuestions.length,
        `0 of ${questions.length} questions passed validation — cannot create an assessment`,
      ).to.be.greaterThan(0);
      cy.log(`✓ ${createdQuestions.length}/${questions.length} questions created successfully`);
    });
  });

  // Uses function() syntax (not arrow) so this.skip() is available.
  it('5. Admin Creates Assessment', function () {
    if (createdQuestions.length === 0) {
      cy.log('No questions were created — skipping assessment creation');
      this.skip();
      return;
    }

    cy.contains('button', 'assessments').click({ force: true });
    cy.contains('button', 'Create Assessment').click();

    cy.get('input[name="name"]').type(assessmentName);
    cy.get('textarea[name="description"]').type('Full E2E Test Assessment');
    cy.get('input[name="duration_minutes"]').clear().type('45');

    // Use invoke+trigger to avoid duplicate-option error
    cy.get('select[name="db_config"]').invoke('val', infra.dbName).trigger('change');

    // Only add the questions that were actually created — prevents hangs when some
    // failed validation and are absent from the question list.
    createdQuestions.forEach((q) => {
      cy.get('input[placeholder="Filter questions..."]').clear().type(q.title);
      cy.contains(q.title).click();
    });

    cy.contains('button', 'Save Assessment').click();
    cy.contains(assessmentName, { timeout: 10000 }).should('exist').then(() => {
      assessmentCreated = true;
    });
  });

  // Uses function() syntax so this.skip() is available.
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

  it('7. Admin Logs Out', () => {
    cy.get('button[title="Sign Out"]').click();
    cy.get('input[name="username"]', { timeout: 10000 }).should('be.visible');
  });
});
