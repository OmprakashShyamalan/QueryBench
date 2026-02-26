const API_BASE = '/api/v1';

function getCsrfToken(): string | null {
  const match = document.cookie.match(/csrftoken=([^;]+)/);
  return match ? match[1] : null;
}

async function apiFetch<T>(path: string, options: RequestInit = {}): Promise<T> {
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    ...(options.headers as Record<string, string>),
  };

  const csrfToken = getCsrfToken();
  if (csrfToken) {
    headers['X-CSRFToken'] = csrfToken;
  }

  const response = await fetch(`${API_BASE}${path}`, {
    ...options,
    credentials: 'include',
    headers,
  });

  if (!response.ok) {
    let errorMessage = `Request failed (${response.status})`;
    try {
      const data = await response.json();
      errorMessage = data.error || data.detail || errorMessage;
    } catch {
      // ignore parse errors
    }
    throw new Error(errorMessage);
  }

  // 204 No Content (DELETE) has no body
  if (response.status === 204) return undefined as unknown as T;
  return response.json() as Promise<T>;
}

// ─── Auth ────────────────────────────────────────────────────────────────────

export interface ApiUser {
  id: number;
  username: string;
  email: string;
  name: string;
  role: 'ADMIN' | 'PARTICIPANT';
}

export const authApi = {
  login: (username: string, password: string) =>
    apiFetch<ApiUser>('/auth/login/', { method: 'POST', body: JSON.stringify({ username, password }) }),
  logout: () =>
    apiFetch<{ message: string }>('/auth/logout/', { method: 'POST' }),
  me: () => apiFetch<ApiUser>('/auth/me/'),
};

// ─── Shared types ────────────────────────────────────────────────────────────

export interface ApiDatabaseConfig {
  id: number;
  config_name: string;
  host: string;
  port: number;
  database_name: string;
  trusted_connection: boolean;
  username: string;
  password_secret_ref: string;
  provider: 'SQL_SERVER' | 'POSTGRES' | 'SQLITE';
}

export interface ApiQuestion {
  id: number;
  title: string;
  prompt: string;
  difficulty: 'EASY' | 'MEDIUM' | 'HARD';
  tags: string[];
  expected_schema_ref: string | null;
  solution_query: string;
  is_validated: boolean;
  created_by: number | null;
  created_at: string;
}

export interface ApiAssessment {
  id: number;
  name: string;
  description: string;
  duration_minutes: number;
  attempts_allowed: number;
  db_config: number;
  db_config_detail: ApiDatabaseConfig | null;
  questions_count: number;
  question_ids: number[];
  is_published: boolean;
  created_at: string;
}

export interface ApiAssessmentFull extends ApiAssessment {
  questions_data: ApiQuestion[];
}

export interface ApiAssignment {
  id: number;
  assessment: number;
  assessment_name: string;
  assessment_detail: ApiAssessment | null;
  user: number;
  user_name: string;
  user_email: string;
  due_date: string;
  status: 'PENDING' | 'IN_PROGRESS' | 'COMPLETED' | 'EXPIRED';
  created_at: string;
}

export interface ApiResult {
  id: number;
  participant_name: string;
  participant_email: string;
  assessment_name: string;
  score: number | null;
  result_status: 'PASSED' | 'FAILED' | 'PENDING';
  submitted_at: string;
  submitted_date: string | null;
}

export interface ApiAttempt {
  id: number;
  assignment: number;
  started_at: string;
  submitted_at: string | null;
  score: number | null;
}

export interface ApiSubmitResult {
  status: 'CORRECT' | 'INCORRECT' | 'ERROR';
  feedback?: string;
  execution_metadata?: { duration_ms: number; rows_returned: number };
}

export interface ApiFinalizeResult {
  score: number;
  correct: number;
  total: number;
  submitted_at: string;
}

export interface ApiQueryResult {
  columns: string[];
  rows: (string | number | null)[][];
  execution_time_ms: number;
  error?: string;
}

export interface ApiValidationResult {
  status: 'CORRECT' | 'INCORRECT' | 'ERROR';
  feedback?: string;
  execution_metadata?: { duration_ms: number; rows_returned: number };
}

export interface ApiSchemaTable {
  name: string;
  columns: {
    name: string;
    type: string;
    isNullable: boolean;
    isPrimaryKey: boolean;
    isForeignKey: boolean;
    references?: { table: string; column: string };
  }[];
}

export interface ApiSchema {
  tables: ApiSchemaTable[];
  error?: string;
}

// ─── Resource APIs ───────────────────────────────────────────────────────────

export const configsApi = {
  list: () => apiFetch<ApiDatabaseConfig[]>('/configs/'),
  create: (data: Omit<ApiDatabaseConfig, 'id'>) =>
    apiFetch<ApiDatabaseConfig>('/configs/', { method: 'POST', body: JSON.stringify(data) }),
  update: (id: number, data: Partial<ApiDatabaseConfig>) =>
    apiFetch<ApiDatabaseConfig>(`/configs/${id}/`, { method: 'PATCH', body: JSON.stringify(data) }),
  delete: (id: number) =>
    apiFetch<void>(`/configs/${id}/`, { method: 'DELETE' }),
};

export const questionsApi = {
  list: () => apiFetch<ApiQuestion[]>('/questions/'),
  create: (data: Omit<ApiQuestion, 'id' | 'created_at'>) =>
    apiFetch<ApiQuestion>('/questions/', { method: 'POST', body: JSON.stringify(data) }),
  update: (id: number, data: Partial<ApiQuestion>) =>
    apiFetch<ApiQuestion>(`/questions/${id}/`, { method: 'PATCH', body: JSON.stringify(data) }),
  delete: (id: number) =>
    apiFetch<void>(`/questions/${id}/`, { method: 'DELETE' }),
};

export const assessmentsApi = {
  list: () => apiFetch<ApiAssessment[]>('/assessments/'),
  create: (data: Omit<ApiAssessment, 'id' | 'created_at' | 'db_config_detail' | 'questions_count' | 'question_ids'>) =>
    apiFetch<ApiAssessment>('/assessments/', { method: 'POST', body: JSON.stringify(data) }),
  update: (id: number, data: Partial<Omit<ApiAssessment, 'db_config_detail' | 'questions_count' | 'question_ids'>>) =>
    apiFetch<ApiAssessment>(`/assessments/${id}/`, { method: 'PATCH', body: JSON.stringify(data) }),
  delete: (id: number) =>
    apiFetch<void>(`/assessments/${id}/`, { method: 'DELETE' }),
  setQuestions: (id: number, questionIds: number[]) =>
    apiFetch<ApiAssessment>(`/assessments/${id}/set_questions/`, { method: 'POST', body: JSON.stringify({ question_ids: questionIds }) }),
  full: (id: number) =>
    apiFetch<ApiAssessmentFull>(`/assessments/${id}/full/`),
};

export const assignmentsApi = {
  list: () => apiFetch<ApiAssignment[]>('/assignments/'),
  listMine: () => apiFetch<ApiAssignment[]>('/assignments/?me=true'),
  get: (id: number) => apiFetch<ApiAssignment>(`/assignments/${id}/`),
  update: (id: number, data: Partial<Pick<ApiAssignment, 'status' | 'due_date'>>) =>
    apiFetch<ApiAssignment>(`/assignments/${id}/`, { method: 'PATCH', body: JSON.stringify(data) }),
  delete: (id: number) =>
    apiFetch<void>(`/assignments/${id}/`, { method: 'DELETE' }),
  bulkAssign: (assessmentId: number, userIds: number[], dueDate: string) =>
    apiFetch<{ created: ApiAssignment[]; errors: { user_id: number; error: string }[] }>(
      '/assignments/bulk_assign/',
      { method: 'POST', body: JSON.stringify({ assessment_id: assessmentId, user_ids: userIds, due_date: dueDate }) },
    ),
  startAttempt: (id: number) =>
    apiFetch<ApiAttempt>(`/assignments/${id}/start_attempt/`, { method: 'POST' }),
};

export const attemptsApi = {
  runQuery: (query: string, configId?: number) =>
    apiFetch<ApiQueryResult>('/attempts/run_query/', {
      method: 'POST',
      body: JSON.stringify({ query, ...(configId !== undefined ? { config_id: configId } : {}) }),
    }),
  validateQuery: (query: string, questionId: number, configId?: number) =>
    apiFetch<ApiValidationResult>('/attempts/validate_query/', {
      method: 'POST',
      body: JSON.stringify({ query, question_id: questionId, ...(configId !== undefined ? { config_id: configId } : {}) }),
    }),
  submitAnswer: (attemptId: number, questionId: number, query: string) =>
    apiFetch<ApiSubmitResult>(`/attempts/${attemptId}/submit_answer/`, {
      method: 'POST',
      body: JSON.stringify({ question_id: questionId, query }),
    }),
  finalize: (attemptId: number) =>
    apiFetch<ApiFinalizeResult>(`/attempts/${attemptId}/finalize/`, { method: 'POST' }),
};

export const schemaApi = {
  get: (configId: number) => apiFetch<ApiSchema>(`/schema/?config_id=${configId}`),
};

export const resultsApi = {
  list: () => apiFetch<ApiResult[]>('/results/'),
};

// ─── User management ──────────────────────────────────────────────────────────

export interface ApiParticipant {
  id: number;
  username: string;
  email: string;
  name: string;
  role: 'ADMIN' | 'PARTICIPANT';
}

export const usersApi = {
  list: () => apiFetch<ApiParticipant[]>('/users/'),
  create: (data: {
    username: string;
    email: string;
    password: string;
    first_name?: string;
    last_name?: string;
    role: 'ADMIN' | 'PARTICIPANT';
  }) => apiFetch<ApiParticipant>('/users/', { method: 'POST', body: JSON.stringify(data) }),
  resetPassword: (id: number, password: string) =>
    apiFetch<ApiParticipant>(`/users/${id}/`, { method: 'PATCH', body: JSON.stringify({ password }) }),
  delete: (id: number) => apiFetch<void>(`/users/${id}/`, { method: 'DELETE' }),
};
