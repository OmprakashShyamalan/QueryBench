import React, { useState, useEffect, useCallback } from 'react';
import {
  Layers, ListChecks, Server, UserCheck, FileOutput,
  Upload, RefreshCw, Plus, Activity, Users, KeyRound, Trash2
} from 'lucide-react';
import { Question, DatabaseConfig, Assessment, Assignment } from '../../types';
import { Modal } from '../ui/Modal';
import { QuestionEditor } from './QuestionEditor';
import { BulkUpload } from './BulkUpload';
import { AssessmentEditor } from './AssessmentEditor';
import { BulkAssign } from './BulkAssign';
import { AssignmentEditor } from './AssignmentEditor';
import { AssessmentsTab } from './tabs/AssessmentsTab';
import { InfrastructureTab } from './tabs/InfrastructureTab';
import { AssignmentsTab } from './tabs/AssignmentsTab';
import { ResultsTab } from './tabs/ResultsTab';
import { QuestionsTab } from './tabs/QuestionsTab';
import {
  configsApi, questionsApi, assessmentsApi, assignmentsApi, resultsApi, usersApi,
  ApiDatabaseConfig, ApiQuestion, ApiAssessment, ApiAssignment, ApiResult, ApiParticipant,
} from '../../services/api';
import { Download } from 'lucide-react';

// ─── Mappers: API response → frontend types ──────────────────────────────────

type ConfigWithId = DatabaseConfig & { _id: number };
type QuestionWithId = Question & { _id: number };
type AssessmentWithId = Assessment & { _id: number };
type AssignmentRow = Assignment & { _id: number; user_name: string; user_email: string };

function mapConfig(c: ApiDatabaseConfig): ConfigWithId {
  return {
    _id: c.id,
    host: c.host,
    port: c.port,
    database_name: c.database_name,
    trusted_connection: c.trusted_connection,
    username: c.username,
    password_secret_ref: c.password_secret_ref,
    provider: c.provider,
  };
}

function mapQuestion(q: ApiQuestion): QuestionWithId {
  return {
    _id: q.id,
    id: String(q.id),
    title: q.title,
    prompt: q.prompt,
    difficulty: q.difficulty,
    tags: q.tags ?? [],
    environment_tag: q.expected_schema_ref ?? '',
    expected_schema_ref: q.expected_schema_ref ?? '',
    solution_query: q.solution_query,
    valid: q.is_validated,
  } as QuestionWithId & { valid: boolean };
}

function mapAssessment(a: ApiAssessment, configs: ConfigWithId[], allQuestions: QuestionWithId[]): AssessmentWithId {
  const cfg = a.db_config_detail
    ? mapConfig(a.db_config_detail)
    : configs.find(c => c._id === a.db_config) ?? configs[0];
  const linkedQs = allQuestions.filter(q => (a.question_ids ?? []).includes(q._id));
  return {
    _id: a.id,
    id: String(a.id),
    name: a.name,
    description: a.description,
    duration_minutes: a.duration_minutes,
    attempts_allowed: a.attempts_allowed,
    is_published: a.is_published,
    questions: linkedQs,
    db_config: cfg ?? { host: '', port: 1433, database_name: '', username: '', password_secret_ref: '', provider: 'SQL_SERVER', default_schema: 'dbo', schema_filter: '' },
  };
}

function mapAssignment(a: ApiAssignment, assessments: AssessmentWithId[]): AssignmentRow {
  const assessment = assessments.find(as => as._id === a.assessment)
    ?? { _id: a.assessment, id: String(a.assessment), name: a.assessment_name, description: '', duration_minutes: 0, attempts_allowed: 1, is_published: false, questions: [], db_config: { host: '', port: 1433, database_name: '', username: '', password_secret_ref: '', provider: 'SQL_SERVER' as const, default_schema: 'dbo', schema_filter: '' } };
  return {
    _id: a.id,
    id: String(a.id),
    assessment,
    participant_id: String(a.user),
    due_date: a.due_date,
    status: a.status,
    user_name: a.user_name,
    user_email: a.user_email,
  };
}

// ─── Component ───────────────────────────────────────────────────────────────

const AdminDashboard: React.FC = () => {
  const [activeTab, setActiveTab] = useState<'assessments' | 'assignments' | 'results' | 'questions' | 'infrastructure' | 'users'>('assessments');
  const [modal, setModal] = useState<{ type: 'question' | 'bulk' | 'delete' | 'assessment' | 'assign' | 'edit_assignment' | 'bulkQuestionEnv' | 'infrastructure' | 'create_user' | 'reset_password' | 'bulk_import_users' | null; data: any }>({ type: null, data: null });
  const [bulkEnvTarget, setBulkEnvTarget] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [targets, setTargets] = useState<ConfigWithId[]>([]);
  const [questions, setQuestions] = useState<QuestionWithId[]>([]);
  const [assessments, setAssessments] = useState<AssessmentWithId[]>([]);
  const [assignments, setAssignments] = useState<AssignmentRow[]>([]);
  const [results, setResults] = useState<ApiResult[]>([]);
  const [users, setUsers] = useState<ApiParticipant[]>([]);

  const loadAll = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [cfgs, qs, as, asgns, us] = await Promise.all([
        configsApi.list(),
        questionsApi.list(),
        assessmentsApi.list(),
        assignmentsApi.list(),
        usersApi.list(),
      ]);
      const mappedCfgs = cfgs.map(mapConfig);
      const mappedQs = qs.map(mapQuestion);
      const mappedAs = as.map(a => mapAssessment(a, mappedCfgs, mappedQs));
      const mappedAsgns = asgns.map(a => mapAssignment(a, mappedAs));
      setTargets(mappedCfgs);
      setQuestions(mappedQs);
      setAssessments(mappedAs);
      setAssignments(mappedAsgns);
      setUsers(us);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Failed to load data.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { loadAll(); }, [loadAll]);

  // Lazy-load results only when the Results tab becomes active
  const [resultsLoading, setResultsLoading] = useState(false);
  const [resultsError, setResultsError] = useState<string | null>(null);
  useEffect(() => {
    if (activeTab !== 'results') return;
    setResultsLoading(true);
    setResultsError(null);
    resultsApi.list()
      .then(setResults)
      .catch(e => setResultsError(e instanceof Error ? e.message : 'Failed to load results.'))
      .finally(() => setResultsLoading(false));
  }, [activeTab]);

  // ─── Question handlers ──────────────────────────────────────────────────

  const handleSaveQuestion = async (q: any) => {
    const payload = {
      title: q.title,
      prompt: q.prompt,
      difficulty: q.difficulty,
      tags: q.tags ?? [],
      expected_schema_ref: q.environment_tag || q.expected_schema_ref || '',
      solution_query: q.solution_query,
      is_validated: !!(q as any).valid,
      created_by: null,
    };
    try {
      if (q._id) {
        await questionsApi.update(q._id, payload);
      } else {
        await questionsApi.create(payload);
      }
      setModal({ type: null, data: null });
      await loadAll();
    } catch (e: unknown) {
      alert(e instanceof Error ? e.message : 'Failed to save question.');
    }
  };

  const handleDeleteQuestion = async (q: QuestionWithId) => {
    try {
      await questionsApi.delete(q._id);
      setModal({ type: null, data: null });
      await loadAll();
    } catch (e: unknown) {
      alert(e instanceof Error ? e.message : 'Failed to delete question.');
    }
  };

  const handleBulkDeleteQuestions = async (ids: string[]) => {
    try {
      await Promise.all(ids.map(id => {
        const q = questions.find(q => q.id === id);
        return q ? questionsApi.delete(q._id) : Promise.resolve();
      }));
      await loadAll();
    } catch (e: unknown) {
      alert(e instanceof Error ? e.message : 'Failed to delete questions.');
    }
  };

  // ─── Assessment handlers ────────────────────────────────────────────────

  const handleSaveAssessment = async (a: any) => {
    const dbConfigId = a.db_config?._id ?? targets[0]?._id;
    const payload = {
      name: a.name,
      description: a.description ?? '',
      duration_minutes: a.duration_minutes,
      attempts_allowed: a.attempts_allowed,
      is_published: a.is_published ?? false,
      db_config: dbConfigId,
    };
    try {
      let saved: { id: number };
      if (a._id) {
        saved = await assessmentsApi.update(a._id, payload);
      } else {
        saved = await assessmentsApi.create(payload);
      }
      // Persist the question selection via the set_questions action
      const questionIds = (a.questions ?? [])
        .map((q: any) => q._id)
        .filter((id: any) => typeof id === 'number');
      await assessmentsApi.setQuestions(saved.id, questionIds);
      setModal({ type: null, data: null });
      await loadAll();
    } catch (e: unknown) {
      alert(e instanceof Error ? e.message : 'Failed to save assessment.');
    }
  };

  const handleBulkDeleteAssessments = async (ids: string[]) => {
    try {
      await Promise.all(ids.map(id => {
        const a = assessments.find(a => a.id === id);
        return a ? assessmentsApi.delete(a._id) : Promise.resolve();
      }));
      await loadAll();
    } catch (e: unknown) {
      alert(e instanceof Error ? e.message : 'Failed to delete assessments.');
    }
  };

  // ─── Infrastructure handlers ────────────────────────────────────────────

  const handleDeleteTarget = async (t: ConfigWithId) => {
    if (!window.confirm(`Delete "${t.database_name}"? This cannot be undone.`)) return;
    try {
      await configsApi.delete(t._id);
      await loadAll();
    } catch (e: unknown) {
      alert(e instanceof Error ? e.message : 'Failed to delete target.');
    }
  };

  // ─── Assignment handlers ────────────────────────────────────────────────

  const handleBulkAssign = async (assessmentId: string, userIds: number[], dueDate: string) => {
    const assessment = assessments.find(a => a.id === assessmentId);
    if (!assessment) return;
    try {
      const result = await assignmentsApi.bulkAssign(assessment._id, userIds, dueDate);
      if (result.errors.length > 0) {
        const msgs = result.errors.map(e => `User ${(e as any).user_id}: ${e.error}`).join('\n');
        alert(`Some assignments could not be created:\n${msgs}`);
      }
      setModal({ type: null, data: null });
      await loadAll();
    } catch (e: unknown) {
      alert(e instanceof Error ? e.message : 'Failed to assign.');
    }
  };

  const handleEditAssignment = async (a: AssignmentRow, updates: Partial<AssignmentRow>) => {
    try {
      await assignmentsApi.update(a._id, {
        status: updates.status as any,
        due_date: updates.due_date,
      });
      setModal({ type: null, data: null });
      await loadAll();
    } catch (e: unknown) {
      alert(e instanceof Error ? e.message : 'Failed to update assignment.');
    }
  };

  const handleBulkDeleteAssignments = async (ids: string[]) => {
    try {
      await Promise.all(ids.map(id => {
        const a = assignments.find(a => a.id === id);
        return a ? assignmentsApi.delete(a._id) : Promise.resolve();
      }));
      await loadAll();
    } catch (e: unknown) {
      alert(e instanceof Error ? e.message : 'Failed to delete assignments.');
    }
  };

  const handleBulkStatusUpdate = async (ids: string[], status: string) => {
    try {
      await Promise.all(ids.map(id => {
        const a = assignments.find(a => a.id === id);
        return a ? assignmentsApi.update(a._id, { status: status as any }) : Promise.resolve();
      }));
      await loadAll();
    } catch (e: unknown) {
      alert(e instanceof Error ? e.message : 'Failed to update statuses.');
    }
  };

  const handleBulkEnvChange = async (ids: string[], newTarget: string) => {
    try {
      await Promise.all(ids.map(id => {
        const q = questions.find(q => q.id === id);
        return q ? questionsApi.update(q._id, { expected_schema_ref: newTarget }) : Promise.resolve();
      }));
      setModal({ type: null, data: null });
      await loadAll();
    } catch (e: unknown) {
      alert(e instanceof Error ? e.message : 'Failed to update questions.');
    }
  };

  // ─── User handlers ──────────────────────────────────────────────────────

  const handleCreateUser = async (form: {
    username: string; email: string; password: string;
    first_name: string; last_name: string; role: 'ADMIN' | 'PARTICIPANT';
  }) => {
    try {
      await usersApi.create(form);
      setModal({ type: null, data: null });
      await loadAll();
    } catch (e: unknown) {
      alert(e instanceof Error ? e.message : 'Failed to create user.');
    }
  };

  const handleResetPassword = async (userId: number, password: string) => {
    try {
      await usersApi.resetPassword(userId, password);
      setModal({ type: null, data: null });
    } catch (e: unknown) {
      alert(e instanceof Error ? e.message : 'Failed to reset password.');
    }
  };

  const handleDeleteUser = async (userId: number) => {
    if (!confirm('Delete this user? This cannot be undone.')) return;
    try {
      await usersApi.delete(userId);
      await loadAll();
    } catch (e: unknown) {
      alert(e instanceof Error ? e.message : 'Failed to delete user.');
    }
  };

  // ─── Render ─────────────────────────────────────────────────────────────

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64 gap-3 text-slate-400">
        <RefreshCw className="w-5 h-5 animate-spin" />
        <span className="text-sm font-medium">Loading...</span>
      </div>
    );
  }

  if (error) {
    return (
      <div className="max-w-lg mx-auto mt-16 p-6 bg-red-50 border border-red-200 rounded-2xl text-center">
        <p className="text-sm font-bold text-red-700 mb-4">{error}</p>
        <button onClick={loadAll} className="px-4 py-2 bg-red-600 text-white rounded-xl text-sm font-bold">Retry</button>
      </div>
    );
  }

  return (
    <div className="max-w-7xl mx-auto px-4 py-8">
      {/* Stats */}
      <div className="grid grid-cols-2 md:grid-cols-5 gap-4 mb-8">
        {[
          { label: 'Total Assessments', value: assessments.length, icon: Layers, color: 'text-blue-600', bg: 'bg-blue-50' },
          { label: 'Active Assignments', value: assignments.length, icon: UserCheck, color: 'text-emerald-600', bg: 'bg-emerald-50' },
          { label: 'Master Questions', value: questions.length, icon: ListChecks, color: 'text-indigo-600', bg: 'bg-indigo-50' },
          { label: 'System Targets', value: targets.length, icon: Server, color: 'text-amber-600', bg: 'bg-amber-50' },
          { label: 'Total Users', value: users.length, icon: Users, color: 'text-violet-600', bg: 'bg-violet-50' },
        ].map(stat => (
          <div key={stat.label} className="bg-white p-5 rounded-2xl border border-slate-200 shadow-sm flex items-center gap-4">
            <div className={`p-3 rounded-xl ${stat.bg} ${stat.color}`}>
              <stat.icon className="w-5 h-5" />
            </div>
            <div>
              <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">{stat.label}</p>
              <p className="text-xl font-black text-slate-900">{stat.value}</p>
            </div>
          </div>
        ))}
      </div>

      {/* Tabs */}
      <div className="flex gap-1 mb-8 bg-slate-200/50 p-1.5 rounded-2xl w-fit overflow-x-auto max-w-full">
        {(['assessments', 'assignments', 'results', 'questions', 'infrastructure', 'users'] as const).map(tab => (
          <button
            key={tab} onClick={() => setActiveTab(tab)}
            className={`px-6 py-2.5 rounded-xl font-bold text-sm capitalize flex items-center gap-2 transition-all whitespace-nowrap ${activeTab === tab ? 'bg-white text-blue-600 shadow-sm' : 'text-slate-500 hover:text-slate-700'}`}
          >
            {tab === 'assessments' && <Layers className="w-4 h-4" />}
            {tab === 'assignments' && <UserCheck className="w-4 h-4" />}
            {tab === 'results' && <FileOutput className="w-4 h-4" />}
            {tab === 'questions' && <ListChecks className="w-4 h-4" />}
            {tab === 'infrastructure' && <Server className="w-4 h-4" />}
            {tab === 'users' && <Users className="w-4 h-4" />}
            {tab}
          </button>
        ))}
      </div>

      {/* Content */}
      <div className="animate-in fade-in slide-in-from-bottom-2 duration-400">
        {activeTab === 'assessments' && (
          <AssessmentsTab
            assessments={assessments}
            onAdd={() => setModal({ type: 'assessment', data: { duration_minutes: 60, questions: [] } })}
            onEdit={(a) => setModal({ type: 'assessment', data: a })}
            onBulkDelete={handleBulkDeleteAssessments}
          />
        )}

        {activeTab === 'assignments' && (
          <AssignmentsTab
            assignments={assignments}
            onBulkAssign={() => setModal({ type: 'assign', data: null })}
            onEdit={(a) => setModal({ type: 'edit_assignment', data: a })}
            onBulkDelete={handleBulkDeleteAssignments}
            onBulkStatusUpdate={handleBulkStatusUpdate}
          />
        )}

        {activeTab === 'results' && (
          resultsLoading ? (
            <div className="flex items-center justify-center h-64 gap-3 text-slate-400">
              <RefreshCw className="w-5 h-5 animate-spin" />
              <span className="text-sm font-medium">Loading results...</span>
            </div>
          ) : resultsError ? (
            <div className="max-w-lg mx-auto mt-8 p-6 bg-red-50 border border-red-200 rounded-2xl text-center">
              <p className="text-sm font-bold text-red-700">{resultsError}</p>
            </div>
          ) : (
            <ResultsTab results={results} questions={questions} />
          )
        )}

        {activeTab === 'infrastructure' && (
          <InfrastructureTab
            targets={targets}
            onAdd={() => setModal({ type: 'infrastructure', data: { provider: 'SQL_SERVER', port: 1433 } })}
            onEdit={(t) => setModal({ type: 'infrastructure', data: t })}
            onDelete={(t: ConfigWithId) => handleDeleteTarget(t)}
          />
        )}

        {activeTab === 'questions' && (
          <QuestionsTab
            questions={questions}
            onImport={() => setModal({ type: 'bulk', data: null })}
            onCreate={() => setModal({ type: 'question', data: { difficulty: 'EASY', environment_tag: targets[0]?.database_name } })}
            onEdit={(q) => setModal({ type: 'question', data: q })}
            onDelete={(q) => setModal({ type: 'delete', data: q })}
            onBulkDelete={handleBulkDeleteQuestions}
            onBulkEnvChange={(ids) => { setModal({ type: 'bulkQuestionEnv', data: ids }); setBulkEnvTarget(''); }}
          />
        )}

        {activeTab === 'users' && (
          <div>
            <div className="flex justify-between items-center mb-6">
              <div>
                <h2 className="text-lg font-bold text-slate-900">Users</h2>
                <p className="text-xs text-slate-400 mt-0.5">Manage participant and admin accounts</p>
              </div>
              <div className="flex items-center gap-3">
                <button
                  onClick={() => setModal({ type: 'bulk_import_users', data: null })}
                  className="flex items-center gap-2 px-4 py-2.5 bg-slate-100 text-slate-600 rounded-xl font-bold text-sm hover:bg-slate-200 border border-slate-200 transition-colors"
                >
                  <Upload className="w-4 h-4" /> Bulk Import
                </button>
                <button
                  onClick={() => setModal({ type: 'create_user', data: null })}
                  className="flex items-center gap-2 px-4 py-2.5 bg-blue-600 text-white rounded-xl font-bold text-sm hover:bg-blue-700 transition-colors"
                >
                  <Plus className="w-4 h-4" /> Add User
                </button>
              </div>
            </div>

            <div className="bg-white rounded-2xl border border-slate-200 overflow-hidden">
              <table className="w-full text-sm">
                <thead>
                  <tr className="bg-slate-50 border-b border-slate-200">
                    <th className="px-6 py-3 text-left text-xs font-bold text-slate-400 uppercase tracking-widest">Name</th>
                    <th className="px-6 py-3 text-left text-xs font-bold text-slate-400 uppercase tracking-widest">Username</th>
                    <th className="px-6 py-3 text-left text-xs font-bold text-slate-400 uppercase tracking-widest">Email</th>
                    <th className="px-6 py-3 text-left text-xs font-bold text-slate-400 uppercase tracking-widest">Role</th>
                    <th className="px-6 py-3 text-right text-xs font-bold text-slate-400 uppercase tracking-widest">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {users.map(u => (
                    <tr key={u.id} className="hover:bg-slate-50 transition-colors">
                      <td className="px-6 py-4 font-medium text-slate-900">{u.name}</td>
                      <td className="px-6 py-4 font-mono text-xs text-slate-500">{u.username}</td>
                      <td className="px-6 py-4 text-slate-500">{u.email || <span className="text-slate-300 italic">—</span>}</td>
                      <td className="px-6 py-4">
                        <span className={`inline-flex px-2.5 py-1 rounded-full text-xs font-bold ${u.role === 'ADMIN' ? 'bg-violet-100 text-violet-700' : 'bg-emerald-100 text-emerald-700'}`}>
                          {u.role}
                        </span>
                      </td>
                      <td className="px-6 py-4">
                        <div className="flex items-center justify-end gap-3">
                          <button
                            onClick={() => setModal({ type: 'reset_password', data: u })}
                            className="flex items-center gap-1.5 text-xs font-bold text-slate-500 hover:text-blue-600 transition-colors"
                            title="Reset password"
                          >
                            <KeyRound className="w-3.5 h-3.5" /> Reset PW
                          </button>
                          <button
                            onClick={() => handleDeleteUser(u.id)}
                            className="flex items-center gap-1.5 text-xs font-bold text-slate-400 hover:text-red-600 transition-colors"
                            title="Delete user"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                  {users.length === 0 && (
                    <tr>
                      <td colSpan={5} className="px-6 py-16 text-center">
                        <Users className="w-8 h-8 text-slate-200 mx-auto mb-3" />
                        <p className="text-sm text-slate-400">No users yet. Add one to get started.</p>
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </div>

      {/* ── Modals ── */}

      <Modal
        isOpen={modal.type === 'question'}
        onClose={() => setModal({ type: null, data: null })}
        title={modal.data?._id ? 'Edit Question' : 'New Master Question'}
        icon={<ListChecks className="w-6 h-6 text-blue-600" />}
        maxWidth="max-w-5xl"
      >
        <QuestionEditor
          item={modal.data} targets={targets}
          onSave={handleSaveQuestion}
          onCancel={() => setModal({ type: null, data: null })}
        />
      </Modal>

      <Modal
        isOpen={modal.type === 'delete'}
        onClose={() => setModal({ type: null, data: null })}
        title="Delete Question"
        icon={<ListChecks className="w-6 h-6 text-red-500" />}
      >
        <div className="space-y-6">
          <p className="text-sm text-slate-600">
            Are you sure you want to delete <strong>{modal.data?.title}</strong>? This cannot be undone.
          </p>
          <div className="flex gap-4">
            <button onClick={() => setModal({ type: null, data: null })} className="flex-1 py-3 bg-slate-100 rounded-xl font-bold text-sm">Cancel</button>
            <button onClick={() => handleDeleteQuestion(modal.data)} className="flex-1 py-3 bg-red-600 text-white rounded-xl font-bold text-sm">Delete</button>
          </div>
        </div>
      </Modal>

      <Modal
        isOpen={modal.type === 'assessment'}
        onClose={() => setModal({ type: null, data: null })}
        title={modal.data?._id ? 'Edit Assessment' : 'New Assessment'}
        icon={<Layers className="w-6 h-6 text-blue-600" />}
        maxWidth="max-w-3xl"
      >
        <AssessmentEditor
          item={modal.data} targets={targets} questions={questions}
          onSave={handleSaveAssessment}
          onCancel={() => setModal({ type: null, data: null })}
        />
      </Modal>

      <Modal
        isOpen={modal.type === 'assign'}
        onClose={() => setModal({ type: null, data: null })}
        title="Bulk Assign Assessment"
        icon={<UserCheck className="w-6 h-6 text-blue-600" />}
      >
        <BulkAssign
          assessments={assessments}
          users={users}
          onAssign={handleBulkAssign}
          onCancel={() => setModal({ type: null, data: null })}
        />
      </Modal>

      <Modal
        isOpen={modal.type === 'edit_assignment'}
        onClose={() => setModal({ type: null, data: null })}
        title="Edit Assignment"
        icon={<UserCheck className="w-6 h-6 text-blue-600" />}
      >
        <AssignmentEditor
          assignment={modal.data}
          onSave={(updates) => handleEditAssignment(modal.data, updates)}
          onCancel={() => setModal({ type: null, data: null })}
        />
      </Modal>

      <Modal
        isOpen={modal.type === 'bulk'}
        onClose={() => setModal({ type: null, data: null })}
        title="Bulk Import Questions"
        icon={<Upload className="w-6 h-6 text-blue-600" />}
      >
        <BulkUpload
          onUpload={async (csvText) => {
            try {
              const lines = csvText.trim().split('\n').filter((l: string) => l.trim());
              if (lines.length < 2) { alert('No data rows found. Check your CSV format.'); return; }
              const headers = lines[0].split(',').map((h: string) => h.trim());
              const rows = lines.slice(1).map((line: string) => {
                const values = line.split(',').map((v: string) => v.trim());
                const obj: Record<string, string> = {};
                headers.forEach((h: string, i: number) => { obj[h] = values[i] || ''; });
                return obj;
              });
              await Promise.all(rows.map((r) => questionsApi.create({
                title: r.title,
                prompt: r.prompt,
                difficulty: ((r.difficulty?.toUpperCase() || 'EASY') as 'EASY' | 'MEDIUM' | 'HARD'),
                tags: (r.tags || '').split(';').map((t: string) => t.trim()).filter(Boolean),
                expected_schema_ref: r.environment_tag || '',
                solution_query: r.solution_query,
                is_validated: false,
                created_by: null,
              })));
              await loadAll();
              setModal({ type: null, data: null });
            } catch (e: unknown) {
              alert(e instanceof Error ? e.message : 'Import failed.');
            }
          }}
          onCancel={() => setModal({ type: null, data: null })}
        />
      </Modal>

      <Modal
        isOpen={modal.type === 'infrastructure'}
        onClose={() => setModal({ type: null, data: null })}
        title="Database Connection Target"
        icon={<Server className="w-6 h-6 text-blue-600" />}
      >
        <InfraConfigForm
          initial={modal.data}
          onSave={async (data) => {
            try {
              if (data._id) {
                await configsApi.update(data._id, data);
              } else {
                await configsApi.create(data);
              }
              setModal({ type: null, data: null });
              await loadAll();
            } catch (e: unknown) {
              alert(e instanceof Error ? e.message : 'Failed to save config.');
            }
          }}
          onCancel={() => setModal({ type: null, data: null })}
        />
      </Modal>

      <Modal
        isOpen={modal.type === 'create_user'}
        onClose={() => setModal({ type: null, data: null })}
        title="Add New User"
        icon={<Users className="w-6 h-6 text-blue-600" />}
      >
        <UserCreateForm
          onSave={handleCreateUser}
          onCancel={() => setModal({ type: null, data: null })}
        />
      </Modal>

      <Modal
        isOpen={modal.type === 'reset_password'}
        onClose={() => setModal({ type: null, data: null })}
        title={`Reset Password — ${modal.data?.username}`}
        icon={<KeyRound className="w-6 h-6 text-blue-600" />}
      >
        <ResetPasswordForm
          onSave={(pw) => handleResetPassword(modal.data.id, pw)}
          onCancel={() => setModal({ type: null, data: null })}
        />
      </Modal>

      <Modal
        isOpen={modal.type === 'bulkQuestionEnv'}
        onClose={() => setModal({ type: null, data: null })}
        title={`Change Target (${(modal.data as string[] | null)?.length ?? 0} questions)`}
        icon={<RefreshCw className="w-6 h-6 text-blue-600" />}
      >
        <div className="space-y-5">
          <p className="text-sm text-slate-500">
            Select a new database target for the <strong>{(modal.data as string[] | null)?.length}</strong> selected question{(modal.data as string[] | null)?.length !== 1 ? 's' : ''}.
          </p>
          <div>
            <label className="block text-xs font-bold text-slate-400 uppercase tracking-widest mb-2">Target Database</label>
            <select
              value={bulkEnvTarget}
              onChange={e => setBulkEnvTarget(e.target.value)}
              className="w-full p-3 bg-blue-50 border border-blue-200 rounded-xl outline-none font-bold text-blue-700 text-sm"
            >
              <option value="">Select Target...</option>
              {targets.map(t => <option key={t.database_name} value={t.database_name}>{t.database_name}</option>)}
            </select>
          </div>
          <div className="flex gap-4">
            <button onClick={() => setModal({ type: null, data: null })} className="flex-1 py-3 bg-slate-100 rounded-xl font-bold text-sm">Cancel</button>
            <button
              onClick={() => bulkEnvTarget && handleBulkEnvChange(modal.data as string[], bulkEnvTarget)}
              disabled={!bulkEnvTarget}
              className="flex-1 py-3 bg-blue-600 text-white rounded-xl font-bold text-sm disabled:opacity-40 disabled:cursor-not-allowed hover:bg-blue-700 transition"
            >
              Apply Changes
            </button>
          </div>
        </div>
      </Modal>

      <Modal
        isOpen={modal.type === 'bulk_import_users'}
        onClose={() => setModal({ type: null, data: null })}
        title="Bulk Import Users"
        icon={<Upload className="w-6 h-6 text-blue-600" />}
        maxWidth="max-w-2xl"
      >
        <BulkImportUsersForm
          onImport={async (rows) => {
            try {
              const res = await usersApi.bulkImport(rows);
              const msg = `${res.created.length} user(s) created.${res.errors.length ? `\n\nErrors:\n${res.errors.map(e => `• ${e.username}: ${e.error}`).join('\n')}` : ''}`;
              alert(msg);
              await loadAll();
              if (res.errors.length === 0) setModal({ type: null, data: null });
            } catch (e: unknown) {
              alert(e instanceof Error ? e.message : 'Bulk import failed.');
            }
          }}
          onCancel={() => setModal({ type: null, data: null })}
        />
      </Modal>
    </div>
  );
};

// ─── Inline infra config form ────────────────────────────────────────────────

const InfraConfigForm: React.FC<{ initial: any; onSave: (d: any) => void; onCancel: () => void }> = ({ initial, onSave, onCancel }) => {
  const isNew = !initial?._id;
  const [form, setForm] = useState({
    _id: initial?._id,
    config_name: initial?.config_name ?? initial?.database_name ?? '',
    host: initial?.host ?? '',
    port: initial?.port ?? 1433,
    database_name: initial?.database_name ?? '',
    trusted_connection: initial?.trusted_connection ?? false,
    username: initial?.username ?? '',
    password_secret_ref: initial?.password_secret_ref ?? '',
    provider: initial?.provider ?? 'SQL_SERVER',
    default_schema: initial?.default_schema ?? 'dbo',
    schema_filter: initial?.schema_filter ?? '',
  });
  const [testStatus, setTestStatus] = useState<'idle' | 'testing' | 'ok' | 'fail'>(isNew ? 'idle' : 'ok');
  const [testMsg, setTestMsg] = useState('');

  // Reset test whenever a connection-relevant field changes
  const set = (k: string, v: any) => {
    setForm((f: typeof form) => ({ ...f, [k]: v }));
    setTestStatus('idle');
    setTestMsg('');
  };

  const handleTest = async () => {
    setTestStatus('testing');
    setTestMsg('');
    try {
      const res = await configsApi.testConnection({
        host: form.host,
        port: form.port,
        database_name: form.database_name,
        trusted_connection: form.trusted_connection,
        username: form.username,
        password_secret_ref: form.password_secret_ref,
      });
      setTestStatus(res.success ? 'ok' : 'fail');
      setTestMsg(res.message);
    } catch (e: unknown) {
      setTestStatus('fail');
      setTestMsg(e instanceof Error ? e.message : 'Test failed.');
    }
  };

  const canSave = !isNew || testStatus === 'ok';

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-2 gap-4">
        <div className="col-span-2">
          <label className="block text-xs font-bold text-slate-400 uppercase tracking-widest mb-2">Display Name</label>
          <input name="config_name" value={form.config_name} onChange={e => set('config_name', e.target.value)} className="w-full p-3 bg-slate-50 border border-slate-200 rounded-xl outline-none text-sm" />
        </div>
        <div>
          <label className="block text-xs font-bold text-slate-400 uppercase tracking-widest mb-2">Database Name</label>
          <input name="database_name" value={form.database_name} onChange={e => set('database_name', e.target.value)} className="w-full p-3 bg-slate-50 border border-slate-200 rounded-xl outline-none font-mono text-xs" />
        </div>
        <div>
          <label className="block text-xs font-bold text-slate-400 uppercase tracking-widest mb-2">Provider</label>
          <select name="provider" value={form.provider} onChange={e => set('provider', e.target.value)} className="w-full p-3 bg-slate-50 border border-slate-200 rounded-xl outline-none text-sm">
            <option>SQL_SERVER</option>
            <option>POSTGRES</option>
            <option>SQLITE</option>
          </select>
        </div>
        <div>
          <label className="block text-xs font-bold text-slate-400 uppercase tracking-widest mb-2">Host</label>
          <input name="host" value={form.host} onChange={e => set('host', e.target.value)} className="w-full p-3 bg-slate-50 border border-slate-200 rounded-xl outline-none font-mono text-xs" />
        </div>
        <div>
          <label className="block text-xs font-bold text-slate-400 uppercase tracking-widest mb-2">Port</label>
          <input name="port" type="text" inputMode="numeric" value={form.port} onChange={(e: React.ChangeEvent<HTMLInputElement>) => { const v = e.target.value.replace(/\D/g, ''); set('port', v === '' ? 0 : Number(v)); }} className="w-full p-3 bg-slate-50 border border-slate-200 rounded-xl outline-none text-sm" />
        </div>
      </div>

      {/* Auth section */}
      <div className="border border-slate-200 rounded-xl overflow-hidden">
        <div className="flex items-center justify-between px-4 py-3 bg-slate-50 border-b border-slate-200">
          <div>
            <p className="text-xs font-bold text-slate-700">Trusted Connection</p>
            <p className="text-[11px] text-slate-400 mt-0.5">Use Windows Authentication — no credentials required</p>
          </div>
          <button
            type="button"
            onClick={() => set('trusted_connection', !form.trusted_connection)}
            className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${form.trusted_connection ? 'bg-blue-600' : 'bg-slate-300'}`}
          >
            <span className={`inline-block h-4 w-4 transform rounded-full bg-white shadow transition-transform ${form.trusted_connection ? 'translate-x-6' : 'translate-x-1'}`} />
          </button>
        </div>

        {!form.trusted_connection && (
          <div className="grid grid-cols-2 gap-4 p-4">
            <div>
              <label className="block text-xs font-bold text-slate-400 uppercase tracking-widest mb-2">Username</label>
              <input
                name="username"
                value={form.username}
                onChange={e => set('username', e.target.value)}
                placeholder="sa"
                className="w-full p-3 bg-slate-50 border border-slate-200 rounded-xl outline-none text-sm"
              />
            </div>
            <div>
              <label className="block text-xs font-bold text-slate-400 uppercase tracking-widest mb-2">Password</label>
              <input
                name="password_secret_ref"
                type="password"
                value={form.password_secret_ref}
                onChange={e => set('password_secret_ref', e.target.value)}
                placeholder="••••••••"
                className="w-full p-3 bg-slate-50 border border-slate-200 rounded-xl outline-none text-sm"
              />
            </div>
          </div>
        )}

        {form.trusted_connection && (
          <div className="px-4 py-3 flex items-center gap-2 text-xs text-slate-400">
            <Activity className="w-4 h-4 text-emerald-500" />
            Windows Authentication is enabled — credentials are not required.
          </div>
        )}
      </div>

      {/* Schema Settings */}
      <div className="grid grid-cols-2 gap-4">
        <div>
          <label className="block text-xs font-bold text-slate-400 uppercase tracking-widest mb-1">Default Schema</label>
          <p className="text-[10px] text-slate-400 mb-2">Used for unqualified table names (e.g. <span className="font-mono">dbo</span>)</p>
          <input
            name="default_schema"
            value={form.default_schema}
            onChange={e => set('default_schema', e.target.value)}
            placeholder="dbo"
            className="w-full p-3 bg-slate-50 border border-slate-200 rounded-xl outline-none font-mono text-xs"
          />
        </div>
        <div>
          <label className="block text-xs font-bold text-slate-400 uppercase tracking-widest mb-1">Schema Filter</label>
          <p className="text-[10px] text-slate-400 mb-2">Explorer only shows this schema's tables. Leave blank for all schemas.</p>
          <input
            name="schema_filter"
            value={form.schema_filter}
            onChange={e => set('schema_filter', e.target.value)}
            placeholder="(all schemas)"
            className="w-full p-3 bg-slate-50 border border-slate-200 rounded-xl outline-none font-mono text-xs"
          />
        </div>
      </div>

      {/* Test connection */}
      <div className="flex items-center gap-4">
        <button
          type="button"
          onClick={handleTest}
          disabled={testStatus === 'testing' || !form.host || !form.database_name}
          className="px-5 py-2.5 bg-slate-100 border border-slate-200 text-slate-700 rounded-xl font-bold text-sm hover:bg-slate-200 disabled:opacity-40 disabled:cursor-not-allowed transition flex items-center gap-2"
        >
          {testStatus === 'testing' ? <RefreshCw className="w-4 h-4 animate-spin" /> : <Activity className="w-4 h-4" />}
          {testStatus === 'testing' ? 'Testing…' : 'Test Connection'}
        </button>
        {testMsg && (
          <p className={`text-xs font-semibold ${testStatus === 'ok' ? 'text-emerald-600' : 'text-red-500'}`}>
            {testStatus === 'ok' ? '✓' : '✗'} {testMsg}
          </p>
        )}
      </div>

      <div className="flex gap-4 pt-2">
        <button onClick={onCancel} className="flex-1 py-3 bg-slate-100 rounded-xl font-bold text-sm">Cancel</button>
        <button
          onClick={() => canSave && onSave(form)}
          disabled={!canSave}
          title={isNew && testStatus !== 'ok' ? 'Test the connection before saving' : undefined}
          className="flex-1 py-3 bg-blue-600 text-white rounded-xl font-bold text-sm disabled:opacity-40 disabled:cursor-not-allowed hover:bg-blue-700 transition"
        >
          Save Configuration
        </button>
      </div>
    </div>
  );
};

// ─── Create user form ─────────────────────────────────────────────────────────

const UserCreateForm: React.FC<{
  onSave: (d: { username: string; email: string; password: string; first_name: string; last_name: string; role: 'ADMIN' | 'PARTICIPANT' }) => void;
  onCancel: () => void;
}> = ({ onSave, onCancel }) => {
  const [form, setForm] = useState({ first_name: '', last_name: '', username: '', email: '', password: '', role: 'PARTICIPANT' as 'ADMIN' | 'PARTICIPANT' });
  const [showPw, setShowPw] = useState(false);
  const set = (k: string, v: string) => setForm(f => ({ ...f, [k]: v }));
  const valid = form.username.trim() && form.password.trim();

  return (
    <div className="space-y-5">
      <div className="grid grid-cols-2 gap-4">
        <div>
          <label className="block text-xs font-bold text-slate-400 uppercase tracking-widest mb-2">First Name</label>
          <input name="first_name" value={form.first_name} onChange={e => set('first_name', e.target.value)} placeholder="Jane" className="w-full p-3 bg-slate-50 border border-slate-200 rounded-xl outline-none text-sm" />
        </div>
        <div>
          <label className="block text-xs font-bold text-slate-400 uppercase tracking-widest mb-2">Last Name</label>
          <input name="last_name" value={form.last_name} onChange={e => set('last_name', e.target.value)} placeholder="Doe" className="w-full p-3 bg-slate-50 border border-slate-200 rounded-xl outline-none text-sm" />
        </div>
      </div>

      <div>
        <label className="block text-xs font-bold text-slate-400 uppercase tracking-widest mb-2">Username <span className="text-red-400">*</span></label>
        <input name="username" value={form.username} onChange={e => set('username', e.target.value)} placeholder="jdoe" className="w-full p-3 bg-slate-50 border border-slate-200 rounded-xl outline-none font-mono text-sm" />
      </div>

      <div>
        <label className="block text-xs font-bold text-slate-400 uppercase tracking-widest mb-2">Email</label>
        <input name="email" type="email" value={form.email} onChange={e => set('email', e.target.value)} placeholder="jane.doe@company.com" className="w-full p-3 bg-slate-50 border border-slate-200 rounded-xl outline-none text-sm" />
      </div>

      <div>
        <label className="block text-xs font-bold text-slate-400 uppercase tracking-widest mb-2">Password <span className="text-red-400">*</span></label>
        <div className="relative">
          <input
            type={showPw ? 'text' : 'password'}
            name="password"
            value={form.password}
            onChange={e => set('password', e.target.value)}
            placeholder="Min 8 characters"
            className="w-full p-3 pr-20 bg-slate-50 border border-slate-200 rounded-xl outline-none text-sm"
          />
          <button type="button" onClick={() => setShowPw(v => !v)} className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-slate-400 hover:text-slate-600 font-bold">
            {showPw ? 'Hide' : 'Show'}
          </button>
        </div>
      </div>

      <div>
        <label className="block text-xs font-bold text-slate-400 uppercase tracking-widest mb-2">Role</label>
        <div className="flex gap-3">
          {(['PARTICIPANT', 'ADMIN'] as const).map(r => (
            <button
              key={r} type="button"
              onClick={() => set('role', r)}
              className={`flex-1 py-2.5 rounded-xl font-bold text-sm border-2 transition-all ${form.role === r ? (r === 'ADMIN' ? 'border-violet-500 bg-violet-50 text-violet-700' : 'border-emerald-500 bg-emerald-50 text-emerald-700') : 'border-slate-200 text-slate-400'}`}
            >
              {r}
            </button>
          ))}
        </div>
      </div>

      <div className="flex gap-4 pt-2">
        <button onClick={onCancel} className="flex-1 py-3 bg-slate-100 rounded-xl font-bold text-sm">Cancel</button>
        <button
          onClick={() => valid && onSave(form)}
          disabled={!valid}
          className="flex-1 py-3 bg-blue-600 text-white rounded-xl font-bold text-sm disabled:opacity-40 disabled:cursor-not-allowed hover:bg-blue-700 transition-colors"
        >
          Create User
        </button>
      </div>
    </div>
  );
};

// ─── Reset password form ──────────────────────────────────────────────────────

const ResetPasswordForm: React.FC<{ onSave: (pw: string) => void; onCancel: () => void }> = ({ onSave, onCancel }) => {
  const [password, setPassword] = useState('');
  const [showPw, setShowPw] = useState(false);

  return (
    <div className="space-y-5">
      <p className="text-sm text-slate-500">Enter a new password for this user. They will need to use it on their next login.</p>
      <div>
        <label className="block text-xs font-bold text-slate-400 uppercase tracking-widest mb-2">New Password</label>
        <div className="relative">
          <input
            type={showPw ? 'text' : 'password'}
            value={password}
            onChange={e => setPassword(e.target.value)}
            placeholder="New password"
            className="w-full p-3 pr-20 bg-slate-50 border border-slate-200 rounded-xl outline-none text-sm"
          />
          <button type="button" onClick={() => setShowPw(v => !v)} className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-slate-400 hover:text-slate-600 font-bold">
            {showPw ? 'Hide' : 'Show'}
          </button>
        </div>
      </div>
      <div className="flex gap-4 pt-2">
        <button onClick={onCancel} className="flex-1 py-3 bg-slate-100 rounded-xl font-bold text-sm">Cancel</button>
        <button
          onClick={() => password.trim() && onSave(password)}
          disabled={!password.trim()}
          className="flex-1 py-3 bg-blue-600 text-white rounded-xl font-bold text-sm disabled:opacity-40 disabled:cursor-not-allowed"
        >
          Reset Password
        </button>
      </div>
    </div>
  );
};

// ─── Bulk import users form ───────────────────────────────────────────────────

const USER_CSV_TEMPLATE = `first_name,last_name,username,email,password,role
Jane,Doe,jdoe,jane.doe@company.com,Temp@1234,PARTICIPANT
John,Smith,jsmith,john.smith@company.com,Temp@1234,PARTICIPANT
Admin,User,admin2,admin@company.com,Admin@1234,ADMIN`;

type UserRow = {
  username: string; email: string; password: string;
  first_name: string; last_name: string; role: 'ADMIN' | 'PARTICIPANT';
};

const BulkImportUsersForm: React.FC<{
  onImport: (rows: UserRow[]) => Promise<void>;
  onCancel: () => void;
}> = ({ onImport, onCancel }) => {
  const [csvText, setCsvText] = useState('');
  const [loading, setLoading] = useState(false);
  const [parseError, setParseError] = useState<string | null>(null);
  const fileRef = React.useRef<HTMLInputElement>(null);

  const downloadTemplate = () => {
    const blob = new Blob([USER_CSV_TEMPLATE], { type: 'text/csv' });
    const link = document.createElement('a');
    link.href = URL.createObjectURL(blob);
    link.download = 'user_import_template.csv';
    link.click();
  };

  const handleFile = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = ev => setCsvText(ev.target?.result as string ?? '');
    reader.readAsText(file);
    e.target.value = '';
  };

  const parseCsv = (text: string): { rows: UserRow[]; error: string | null } => {
    const lines = text.trim().split('\n').filter(l => l.trim());
    if (lines.length < 2) return { rows: [], error: 'Need at least one data row.' };
    const headers = lines[0].split(',').map(h => h.trim().toLowerCase());
    const required = ['username', 'password'];
    for (const r of required) {
      if (!headers.includes(r)) return { rows: [], error: `Missing required column: ${r}` };
    }
    const rows: UserRow[] = [];
    for (let i = 1; i < lines.length; i++) {
      const vals = lines[i].split(',').map(v => v.trim());
      const obj: Record<string, string> = {};
      headers.forEach((h, idx) => { obj[h] = vals[idx] ?? ''; });
      const role = (obj['role'] || 'PARTICIPANT').toUpperCase();
      rows.push({
        username: obj['username'] ?? '',
        email: obj['email'] ?? '',
        password: obj['password'] ?? '',
        first_name: obj['first_name'] ?? '',
        last_name: obj['last_name'] ?? '',
        role: role === 'ADMIN' ? 'ADMIN' : 'PARTICIPANT',
      });
    }
    return { rows, error: null };
  };

  const handleImport = async () => {
    const { rows, error } = parseCsv(csvText);
    if (error) { setParseError(error); return; }
    setParseError(null);
    setLoading(true);
    try {
      await onImport(rows);
    } finally {
      setLoading(false);
    }
  };

  const { rows: preview } = parseCsv(csvText);

  return (
    <div className="space-y-5">
      {/* Template download */}
      <div className="flex items-center justify-between bg-blue-50 border border-blue-100 p-4 rounded-2xl">
        <div>
          <p className="text-sm font-bold text-blue-900">CSV Template</p>
          <p className="text-xs text-blue-600 mt-0.5">Columns: first_name, last_name, username, email, password, role</p>
          <p className="text-[11px] text-blue-500 mt-0.5">Role must be <strong>PARTICIPANT</strong> or <strong>ADMIN</strong></p>
        </div>
        <button onClick={downloadTemplate} className="flex items-center gap-2 px-4 py-2 bg-white text-blue-600 border border-blue-200 rounded-xl text-xs font-bold hover:bg-blue-50 transition">
          <Download className="w-4 h-4" /> Download
        </button>
      </div>

      {/* File upload + paste */}
      <div>
        <div className="flex items-center justify-between mb-2">
          <label className="text-xs font-bold text-slate-400 uppercase tracking-widest">
            Paste CSV or Upload File
            {preview.length > 0 && (
              <span className="ml-2 px-2 py-0.5 bg-blue-100 text-blue-700 rounded-full text-[10px]">{preview.length} users</span>
            )}
          </label>
          <button onClick={() => fileRef.current?.click()} className="flex items-center gap-1.5 text-[11px] font-bold text-slate-500 hover:text-blue-600 bg-slate-100 hover:bg-blue-50 px-3 py-1.5 rounded-lg transition">
            <Upload className="w-3.5 h-3.5" /> Upload CSV
          </button>
          <input ref={fileRef} type="file" accept=".csv,.txt" className="hidden" onChange={handleFile} />
        </div>
        <textarea
          value={csvText}
          onChange={e => { setCsvText(e.target.value); setParseError(null); }}
          placeholder="first_name,last_name,username,email,password,role&#10;Jane,Doe,jdoe,jane@company.com,Pass@123,PARTICIPANT"
          className="w-full p-4 bg-slate-50 border border-slate-200 rounded-xl outline-none text-xs font-mono h-40 resize-none leading-relaxed"
        />
        {parseError && <p className="text-xs text-red-500 font-bold mt-1">{parseError}</p>}
      </div>

      <div className="flex gap-4 pt-2">
        <button onClick={onCancel} className="flex-1 py-3 bg-slate-100 rounded-xl font-bold text-sm">Cancel</button>
        <button
          onClick={handleImport}
          disabled={preview.length === 0 || loading}
          className="flex-1 py-3 bg-blue-600 text-white rounded-xl font-bold text-sm disabled:opacity-40 disabled:cursor-not-allowed hover:bg-blue-700 transition"
        >
          {loading ? 'Importing...' : `Import ${preview.length > 0 ? `(${preview.length})` : 'Users'}`}
        </button>
      </div>
    </div>
  );
};

export default AdminDashboard;
