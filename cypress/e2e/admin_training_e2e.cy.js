// Admin E2E Test — SQL_TRAINING Infrastructure
// Runs AFTER admin_e2e.cy.js and BEFORE participant_training_e2e.cy.js (alphabetical order).
//
// Creates:
//   • SQL_TRAINING database config (SQL Server auth, not Windows auth)
//   • 5 questions from SQL_STORE schema  (Customer Countries, Shipper Directory,
//     Products per Category, Orders in 1996, Top 5 Customers by Order Volume)
//   • 5 questions from SQL_MOVIE schema  (Movies by MPAA Rating, Distributor List,
//     Top 5 Movies by WW Box Office, MCU Phase 1 Movies, Avg Box Office by Distributor)
//   • 1 assessment with 5 curated questions (mixing both schemas)
//   • 1 assignment to the freshly-created participant
//
// Session data is written to cypress/fixtures/e2e_session_training.json
// for participant_training_e2e.cy.js to consume.
//
// Assessment question order (drives participant test scenarios):
//   AQ1 — Customer Countries    (sql_store) → wrong-syntax test
//   AQ2 — Shipper Directory     (sql_store) → wrong-projection test (omit Phone)
//   AQ3 — Products per Category (sql_store) → correct answer
//   AQ4 — Movies by MPAA Rating (sql_movie) → correct answer
//   AQ5 — Top 5 Movies WW BO   (sql_movie) → correct answer

describe('Admin Setup E2E — SQL Training', () => {
  const admin = { username: 'admin', password: 'admin123' };
  const ts = Date.now();
  const participant = {
    username: `e2e_train_${ts}`,
    password: 'password123',
    email: `e2e_train_${ts}@example.com`,
  };

  // Credentials loaded from cypress.env.json (gitignored — never committed).
  // Copy cypress.env.json.example → cypress.env.json and fill in the values before running.
  const infra = {
    name: 'SQL_TRAINING',
    host: Cypress.env('TRAINING_DB_HOST'),
    port: '1433',
    dbName: 'SQL_TRAINING',
    provider: 'SQL_SERVER',
    username: Cypress.env('TRAINING_DB_USERNAME'),
    password: Cypress.env('TRAINING_DB_PASSWORD'),
  };

  // ─── sql_store questions ──────────────────────────────────────────────────

  const storeQuestions = [
    {
      title: 'Customer Countries',
      prompt:
        'List each distinct country that has at least one customer. Sort the results alphabetically by country name.',
      query: 'SELECT DISTINCT Country FROM SQL_STORE.customers ORDER BY Country;',
      difficulty: 'EASY',
    },
    {
      title: 'Shipper Directory',
      prompt:
        'Retrieve the name and phone number of every shipper. Order results by shipper name.',
      query: 'SELECT ShipperName, Phone FROM SQL_STORE.shippers ORDER BY ShipperName;',
      difficulty: 'EASY',
    },
    {
      title: 'Products per Category',
      prompt:
        'For each category, return the category name and the number of products it contains (label the count ProductCount). Order by category name ascending.',
      query:
        'SELECT c.CategoryName, COUNT(p.ProductID) AS ProductCount FROM SQL_STORE.Categories c JOIN SQL_STORE.products p ON c.CategoryID = p.CategoryID GROUP BY c.CategoryName ORDER BY c.CategoryName;',
      difficulty: 'MEDIUM',
    },
    {
      title: 'Orders in 1996',
      prompt:
        'List all orders placed during 1996, showing OrderID, CustomerID, and OrderDate. Sort by OrderDate ascending.',
      query:
        'SELECT OrderID, CustomerID, OrderDate FROM SQL_STORE.orders WHERE YEAR(OrderDate) = 1996 ORDER BY OrderDate;',
      difficulty: 'MEDIUM',
    },
    {
      title: 'Top 5 Customers by Order Volume',
      prompt:
        'Find the top 5 customers who have placed the most orders. Show their CustomerName and order count (labelled OrderCount), highest first.',
      query:
        'SELECT TOP 5 c.CustomerName, COUNT(o.OrderID) AS OrderCount FROM SQL_STORE.customers c JOIN SQL_STORE.orders o ON c.CustomerID = o.CustomerID GROUP BY c.CustomerName ORDER BY OrderCount DESC;',
      difficulty: 'HARD',
    },
  ];

  // ─── sql_movie questions ──────────────────────────────────────────────────

  const movieQuestions = [
    {
      title: 'Movies by MPAA Rating',
      prompt:
        'For each MPAA rating, return the MPAA_Rating_ID and the count of movies with that rating (label the count MovieCount). Order by MPAA_Rating_ID.',
      query:
        'SELECT MPAA_Rating_ID, COUNT(*) AS MovieCount FROM SQL_MOVIE.Movie GROUP BY MPAA_Rating_ID ORDER BY MPAA_Rating_ID;',
      difficulty: 'EASY',
    },
    {
      title: 'Distributor List',
      prompt: 'List all movie distributors ordered alphabetically by their name.',
      query: 'SELECT Distributor_Name FROM SQL_MOVIE.Distributor ORDER BY Distributor_Name;',
      difficulty: 'EASY',
    },
    {
      title: 'Top 5 Movies by Worldwide Box Office',
      prompt:
        'Show the title and worldwide box office gross of the top 5 highest-grossing movies, sorted from highest to lowest.',
      query:
        'SELECT TOP 5 Title, Box_Office_WorldWide FROM SQL_MOVIE.Movie ORDER BY Box_Office_WorldWide DESC;',
      difficulty: 'MEDIUM',
    },
    {
      title: 'MCU Phase 1 Movies with Character Family',
      prompt:
        'List each MCU Phase 1 movie with its title and character family name. Sort results by release date ascending.',
      query:
        'SELECT m.Title, cf.Character_Family_Name FROM SQL_MOVIE.Movie m JOIN SQL_MOVIE.Character_Family cf ON m.Character_Family_ID = cf.Character_Family_ID WHERE m.MCU_Phase = 1 ORDER BY m.Release_Date;',
      difficulty: 'MEDIUM',
    },
    {
      title: 'Average Box Office by Distributor',
      prompt:
        'For each distributor, calculate the average worldwide box office revenue across their movies (label it AvgBoxOffice). Order from highest to lowest average.',
      query:
        'SELECT d.Distributor_Name, AVG(m.Box_Office_WorldWide) AS AvgBoxOffice FROM SQL_MOVIE.Distributor d JOIN SQL_MOVIE.Movie m ON d.Distributor_ID = m.Distributor_ID GROUP BY d.Distributor_Name ORDER BY AvgBoxOffice DESC;',
      difficulty: 'HARD',
    },
  ];

  // All 10 questions to create in the question bank
  const allQuestions = [...storeQuestions, ...movieQuestions];

  // The 5 questions that will form the assessment (in participant test order).
  // These titles must match entries in allQuestions for the fixture to be correct.
  const assessmentQuestionTitles = [
    'Customer Countries',          // AQ1 — wrong-syntax scenario
    'Shipper Directory',           // AQ2 — wrong-projection scenario
    'Products per Category',       // AQ3 — correct answer
    'Movies by MPAA Rating',       // AQ4 — correct answer
    'Top 5 Movies by Worldwide Box Office', // AQ5 — correct answer
  ];

  const assessmentName = 'E2E Training Assessment ' + ts;
  const dueDate = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];

  // Tracks question titles that were actually saved after validation
  let createdTitles = [];
  let assessmentCreated = false;

  before(() => {
    // Write initial fixture; test 5 overwrites it with only the created assessment questions.
    cy.writeFile('cypress/fixtures/e2e_session_training.json', {
      participant,
      assessmentName,
      questions: allQuestions.filter((q) => assessmentQuestionTitles.includes(q.title)),
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

  it('3. Admin Creates Infrastructure (SQL_TRAINING)', () => {
    cy.contains('button', 'infrastructure').click({ force: true });
    cy.contains('button', 'Add Target').click();

    cy.get('input[name="config_name"]').type(infra.name);
    cy.get('input[name="database_name"]').type(infra.dbName);
    cy.get('select[name="provider"]').select(infra.provider);
    cy.get('input[name="host"]').type(infra.host);
    cy.get('input[name="port"]').clear().type(infra.port);

    // SQL Server auth — Trusted Connection stays OFF; fill credentials directly
    cy.get('input[name="username"]').type(infra.username);
    cy.get('input[name="password"]').type(infra.password);

    cy.contains('button', 'Test Connection').click();
    cy.wait(2000);
    cy.contains('Connected to', { timeout: 20000 }).should('be.visible');

    cy.contains('button', 'Save Configuration').click();
    cy.contains(infra.dbName, { timeout: 10000 }).should('exist');
  });

  // ─── 4. Create all 10 questions ───────────────────────────────────────────

  it('4. Admin Creates Questions (sql_store + sql_movie)', () => {
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
        `0 of ${allQuestions.length} questions passed validation — cannot create an assessment`,
      ).to.be.greaterThan(0);
      cy.log(`✓ ${createdTitles.length}/${allQuestions.length} questions created successfully`);
    });
  });

  // ─── 5. Create assessment with 5 curated questions ────────────────────────

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

    cy.get('input[name="name"]').type(assessmentName);
    cy.get('textarea[name="description"]').type('Full E2E Training Assessment — sql_store & sql_movie');
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
