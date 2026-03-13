
export enum Role {
  ADMIN = 'ADMIN',
  REVIEWER = 'REVIEWER',
  PARTICIPANT = 'PARTICIPANT'
}

export interface User {
  id: string;
  email: string;
  role: Role;
  name: string;
  authSource?: 'Microsoft' | 'Local';
}

export interface ColumnMetadata {
  name: string;
  type: string;
  isNullable: boolean;
  isPrimaryKey: boolean;
  isForeignKey: boolean;
  references?: { table: string; schema: string; qualifiedTable: string; column: string };
}

export interface TableMetadata {
  name: string;
  schema: string;
  qualifiedName: string;
  columns: ColumnMetadata[];
}

export interface SchemaMetadata {
  tables: TableMetadata[];
}

export interface DatabaseConfig {
  id: number;
  config_name?: string;
  host: string;
  port: number;
  database_name: string;
  trusted_connection?: boolean;
  username: string;
  password?: string; // Direct password entry for MVP/Dev
  password_secret_ref: string; // Reference to Azure Key Vault / Environment Variable
  provider: 'SQL_SERVER' | 'POSTGRES' | 'SQLITE';
  default_schema: string;   // Default schema for unqualified name resolution (e.g. "dbo")
  schema_filter: string;    // When set, explorer only shows tables in this schema
}

export interface Question {
  id: string;
  title: string;
  prompt: string;
  difficulty: 'EASY' | 'MEDIUM' | 'HARD';
  tags: string[];
  environment_tag: string;
  expected_schema_ref: string;
  solution_query: string;
  order_sensitive: boolean;
  schema_metadata?: SchemaMetadata;
}

export interface Assessment {
  id: string;
  name: string;
  description: string;
  duration_minutes: number;
  attempts_allowed: number;
  questions: Question[];
  db_config: DatabaseConfig;
  is_published: boolean;
}

export interface Assignment {
  id: string;
  assessment: Assessment;
  participant_id: string;
  due_date: string;
  status: 'PENDING' | 'IN_PROGRESS' | 'COMPLETED' | 'EXPIRED';
}

export interface QueryResult {
  columns: string[];
  rows: any[][];
  execution_time_ms: number;
  error?: string;
}

export interface AttemptAnswer {
  question_id: string;
  query: string;
  status: 'CORRECT' | 'INCORRECT' | 'NOT_ATTEMPTED';
  feedback?: string;
}

export interface Attempt {
  id: string;
  assignment_id: string;
  started_at: string;
  submitted_at?: string;
  score?: number;
  answers: AttemptAnswer[];
}
