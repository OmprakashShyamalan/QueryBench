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
    db_config: cfg ?? { host: '', port: 1433, database_name: '', username: '', password_secret_ref: '', provider: 'SQL_SERVER' },
  };
}

function mapAssignment(a: ApiAssignment, assessments: AssessmentWithId[]): AssignmentRow {
  const assessment = assessments.find(as => as._id === a.assessment)
    ?? { _id: a.assessment, id: String(a.assessment), name: a.assessment_name, description: '', duration_minutes: 0, attempts_allowed: 1, is_published: false, questions: [], db_config: { host: '', port: 1433, database_name: '', username: '', password_secret_ref: '', provider: 'SQL_SERVER' as const } };
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
  const [modal, setModal] = useState<{ type: 'question' | 'bulk' | 'delete' | 'assessment' | 'assign' | 'edit_assignment' | 'bulkQuestionEnv' | 'infrastructure' | 'create_user' | 'reset_password' | null; data: any }>({ type: null, data: null });
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
      const [cfgs, qs, as, asgns, res, us] = await Promise.all([
        configsApi.list(),
        questionsApi.list(),
        assessmentsApi.list(),
        assignmentsApi.list(),
        resultsApi.list(),
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
      setResults(res);
      setUsers(us);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Failed to load data.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { loadAll(); }, [loadAll]);

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
      await loadAll();
      setModal({ type: null, data: null });
    } catch (e: unknown) {
      alert(e instanceof Error ? e.message : 'Failed to save question.');
    }
  };

  const handleDeleteQuestion = async (q: QuestionWithId) => {
    try {
      await questionsApi.delete(q._id);
      await loadAll();
      setModal({ type: null, data: null });
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
      await loadAll();
      setModal({ type: null, data: null });
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

  // ─── Assignment handlers ────────────────────────────────────────────────

  const handleBulkAssign = async (assessmentId: string, userIds: number[]) => {
    const assessment = assessments.find(a => a.id === assessmentId);
    if (!assessment) return;
    const dueDate = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString();
    try {
      const result = await assignmentsApi.bulkAssign(assessment._id, userIds, dueDate);
      if (result.errors.length > 0) {
        const msgs = result.errors.map(e => `User ${(e as any).user_id}: ${e.error}`).join('\n');
        alert(`Some assignments could not be created:\n${msgs}`);
      }
      await loadAll();
      setModal({ type: null, data: null });
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
      await loadAll();
      setModal({ type: null, data: null });
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

  // ─── User handlers ──────────────────────────────────────────────────────

  const handleCreateUser = async (form: {
    username: string; email: string; password: string;
    first_name: string; last_name: string; role: 'ADMIN' | 'PARTICIPANT';
  }) => {
    try {
      await usersApi.create(form);
      await loadAll();
      setModal({ type: null, data: null });
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

        {activeTab === 'results' && <ResultsTab results={results} />}

        {activeTab === 'infrastructure' && (
          <InfrastructureTab
            targets={targets}
            onAdd={() => setModal({ type: 'infrastructure', data: { provider: 'SQL_SERVER', port: 1433 } })}
            onEdit={(t) => setModal({ type: 'infrastructure', data: t })}
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
              <button
                onClick={() => setModal({ type: 'create_user', data: null })}
                className="flex items-center gap-2 px-4 py-2.5 bg-blue-600 text-white rounded-xl font-bold text-sm hover:bg-blue-700 transition-colors"
              >
                <Plus className="w-4 h-4" /> Add User
              </button>
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
          onUpload={async (rows) => {
            try {
              await Promise.all(rows.map((r: any) => questionsApi.create({
                title: r.title,
                prompt: r.prompt,
                difficulty: r.difficulty,
                tags: (r.tags || '').split(',').map((t: string) => t.trim()).filter(Boolean),
                expected_schema_ref: r.environment_tag || '',
                solution_query: r.solution_query,
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
              await loadAll();
              setModal({ type: null, data: null });
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
    </div>
  );
};

// ─── Inline infra config form ────────────────────────────────────────────────

const InfraConfigForm: React.FC<{ initial: any; onSave: (d: any) => void; onCancel: () => void }> = ({ initial, onSave, onCancel }) => {
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
  });
  const set = (k: string, v: any) => setForm(f => ({ ...f, [k]: v }));

  return (
    <div className="space-y-6">
      <div className="bg-slate-50 p-4 rounded-xl border border-slate-100 flex items-center gap-3">
        <Activity className="w-5 h-5 text-emerald-500" />
        <p className="text-xs text-slate-500">Connections are validated via the Secure Evaluation Gateway.</p>
      </div>

      <div className="grid grid-cols-2 gap-4">
        <div className="col-span-2">
          <label className="block text-xs font-bold text-slate-400 uppercase tracking-widest mb-2">Display Name</label>
          <input value={form.config_name} onChange={e => set('config_name', e.target.value)} className="w-full p-3 bg-slate-50 border border-slate-200 rounded-xl outline-none text-sm" />
        </div>
        <div>
          <label className="block text-xs font-bold text-slate-400 uppercase tracking-widest mb-2">Database Name</label>
          <input value={form.database_name} onChange={e => set('database_name', e.target.value)} className="w-full p-3 bg-slate-50 border border-slate-200 rounded-xl outline-none font-mono text-xs" />
        </div>
        <div>
          <label className="block text-xs font-bold text-slate-400 uppercase tracking-widest mb-2">Provider</label>
          <select value={form.provider} onChange={e => set('provider', e.target.value)} className="w-full p-3 bg-slate-50 border border-slate-200 rounded-xl outline-none text-sm">
            <option>SQL_SERVER</option>
            <option>POSTGRES</option>
            <option>SQLITE</option>
          </select>
        </div>
        <div>
          <label className="block text-xs font-bold text-slate-400 uppercase tracking-widest mb-2">Host</label>
          <input value={form.host} onChange={e => set('host', e.target.value)} className="w-full p-3 bg-slate-50 border border-slate-200 rounded-xl outline-none font-mono text-xs" />
        </div>
        <div>
          <label className="block text-xs font-bold text-slate-400 uppercase tracking-widest mb-2">Port</label>
          <input type="number" value={form.port} onChange={e => set('port', Number(e.target.value))} className="w-full p-3 bg-slate-50 border border-slate-200 rounded-xl outline-none text-sm" />
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
                value={form.username}
                onChange={e => set('username', e.target.value)}
                placeholder="sa"
                className="w-full p-3 bg-slate-50 border border-slate-200 rounded-xl outline-none text-sm"
              />
            </div>
            <div>
              <label className="block text-xs font-bold text-slate-400 uppercase tracking-widest mb-2">Password</label>
              <input
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

      <div className="flex gap-4 pt-2">
        <button onClick={onCancel} className="flex-1 py-3 bg-slate-100 rounded-xl font-bold text-sm">Cancel</button>
        <button onClick={() => onSave(form)} className="flex-1 py-3 bg-blue-600 text-white rounded-xl font-bold text-sm">Save Configuration</button>
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
          <input value={form.first_name} onChange={e => set('first_name', e.target.value)} placeholder="Jane" className="w-full p-3 bg-slate-50 border border-slate-200 rounded-xl outline-none text-sm" />
        </div>
        <div>
          <label className="block text-xs font-bold text-slate-400 uppercase tracking-widest mb-2">Last Name</label>
          <input value={form.last_name} onChange={e => set('last_name', e.target.value)} placeholder="Doe" className="w-full p-3 bg-slate-50 border border-slate-200 rounded-xl outline-none text-sm" />
        </div>
      </div>

      <div>
        <label className="block text-xs font-bold text-slate-400 uppercase tracking-widest mb-2">Username <span className="text-red-400">*</span></label>
        <input value={form.username} onChange={e => set('username', e.target.value)} placeholder="jdoe" className="w-full p-3 bg-slate-50 border border-slate-200 rounded-xl outline-none font-mono text-sm" />
      </div>

      <div>
        <label className="block text-xs font-bold text-slate-400 uppercase tracking-widest mb-2">Email</label>
        <input type="email" value={form.email} onChange={e => set('email', e.target.value)} placeholder="jane.doe@company.com" className="w-full p-3 bg-slate-50 border border-slate-200 rounded-xl outline-none text-sm" />
      </div>

      <div>
        <label className="block text-xs font-bold text-slate-400 uppercase tracking-widest mb-2">Password <span className="text-red-400">*</span></label>
        <div className="relative">
          <input
            type={showPw ? 'text' : 'password'}
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

export default AdminDashboard;
