-- QueryBench - Master Schema DDL
-- Target: SQL Server 2019+

CREATE DATABASE QueryBench;
GO

USE QueryBench;
GO

-- 1. Database Configurations (Target systems for evaluation)
CREATE TABLE database_configs (
    id INT IDENTITY(1,1) PRIMARY KEY,
    config_name NVARCHAR(100) NOT NULL,
    host NVARCHAR(255) NOT NULL,
    port INT DEFAULT 1433,
    database_name NVARCHAR(128) NOT NULL,
    username NVARCHAR(128) NOT NULL,
    password_secret_ref NVARCHAR(255) NOT NULL, -- KeyVault reference
    provider NVARCHAR(50) NOT NULL CHECK (provider IN ('SQL_SERVER', 'POSTGRES', 'SQLITE')),
    created_at DATETIME2 DEFAULT GETDATE()
);

-- 2. Users and Roles
CREATE TABLE users (
    id INT IDENTITY(1,1) PRIMARY KEY,
    email NVARCHAR(255) NOT NULL UNIQUE,
    full_name NVARCHAR(255) NOT NULL,
    user_role NVARCHAR(50) NOT NULL CHECK (user_role IN ('ADMIN', 'REVIEWER', 'PARTICIPANT')),
    auth_source NVARCHAR(50) DEFAULT 'Local' CHECK (auth_source IN ('Local', 'Microsoft')),
    external_id NVARCHAR(255) NULL, -- MS Entra ID / OIDC subject
    created_at DATETIME2 DEFAULT GETDATE()
);

-- 3. Master Question Library
CREATE TABLE questions (
    id INT IDENTITY(1,1) PRIMARY KEY,
    title NVARCHAR(255) NOT NULL,
    prompt NVARCHAR(MAX) NOT NULL,
    difficulty NVARCHAR(20) NOT NULL CHECK (difficulty IN ('EASY', 'MEDIUM', 'HARD')),
    tags NVARCHAR(MAX), -- JSON string of tags
    expected_schema_ref NVARCHAR(255),
    solution_query NVARCHAR(MAX) NOT NULL, -- The "Gold Standard" query
    created_by INT FOREIGN KEY REFERENCES Users(id),
    created_at DATETIME2 DEFAULT GETDATE()
);

-- 4. Assessments (Test Headers)
CREATE TABLE assessments (
    id INT IDENTITY(1,1) PRIMARY KEY,
    name NVARCHAR(255) NOT NULL,
    description NVARCHAR(MAX),
    duration_minutes INT DEFAULT 60,
    attempts_allowed INT DEFAULT 1,
    db_config_id INT FOREIGN KEY REFERENCES DatabaseConfigs(id),
    is_published BIT DEFAULT 0,
    created_at DATETIME2 DEFAULT GETDATE()
);

-- 5. Assessment-Question Mapping (Many-to-Many)
CREATE TABLE assessment_questions (
    assessment_id INT FOREIGN KEY REFERENCES Assessments(id),
    question_id INT FOREIGN KEY REFERENCES Questions(id),
    sort_order INT DEFAULT 0,
    weight DECIMAL(5,2) DEFAULT 1.0,
    PRIMARY KEY (assessment_id, question_id)
);

-- 6. Assignments (Giving a test to a user)
CREATE TABLE assignments (
    id INT IDENTITY(1,1) PRIMARY KEY,
    assessment_id INT FOREIGN KEY REFERENCES Assessments(id),
    user_id INT FOREIGN KEY REFERENCES Users(id),
    due_date DATETIME2,
    status NVARCHAR(50) DEFAULT 'PENDING' CHECK (status IN ('PENDING', 'IN_PROGRESS', 'COMPLETED', 'EXPIRED')),
    created_at DATETIME2 DEFAULT GETDATE()
);

-- 7. Attempts (A specific instance of a user taking a test)
CREATE TABLE attempts (
    id INT IDENTITY(1,1) PRIMARY KEY,
    assignment_id INT FOREIGN KEY REFERENCES Assignments(id),
    started_at DATETIME2 DEFAULT GETDATE(),
    submitted_at DATETIME2 NULL,
    score DECIMAL(5,2) NULL,
    review_notes NVARCHAR(MAX) NULL
);

-- 8. Attempt Answers (Per-question response)
CREATE TABLE attempt_answers (
    id INT IDENTITY(1,1) PRIMARY KEY,
    attempt_id INT FOREIGN KEY REFERENCES Attempts(id),
    question_id INT FOREIGN KEY REFERENCES Questions(id),
    participant_query NVARCHAR(MAX),
    status NVARCHAR(20) DEFAULT 'NOT_ATTEMPTED' CHECK (status IN ('CORRECT', 'INCORRECT', 'NOT_ATTEMPTED')),
    execution_time_ms INT NULL,
    error_message NVARCHAR(MAX) NULL,
    feedback NVARCHAR(MAX) NULL
);

-- Performance Indexes
CREATE INDEX IX_assignments_user ON assignments(user_id);
CREATE INDEX IX_attempts_assignment ON attempts(assignment_id);
CREATE INDEX IX_questions_difficulty ON questions(difficulty);
GO