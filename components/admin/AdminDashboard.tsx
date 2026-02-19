import React, { useState } from 'react';
import { 
  Layers, ListChecks, Server, UserCheck, FileOutput, 
  Upload, AlertTriangle, RefreshCw, Plus, Search, 
  Filter, CheckCircle, Database, HardDrive, Trash2, 
  Settings, ChevronRight, Activity
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

const AdminDashboard: React.FC = () => {
  const [activeTab, setActiveTab] = useState<'assessments' | 'assignments' | 'results' | 'questions' | 'infrastructure'>('assessments');
  // Fixed: Added 'infrastructure' to the modal type union to resolve type errors in state updates and comparisons.
  const [modal, setModal] = useState<{ type: 'question' | 'bulk' | 'delete' | 'assessment' | 'assign' | 'edit_assignment' | 'bulkQuestionEnv' | 'infrastructure' | null, data: any }>({ type: null, data: null });
  const [bulkEnvTarget, setBulkEnvTarget] = useState('');

  // Mock State
  const [targets] = useState<DatabaseConfig[]>([
    { host: 'sql-prod.internal', port: 1433, database_name: 'HR_Systems', username: 'sa', password_secret_ref: 'kv_secret_01', provider: 'SQL_SERVER' },
    { host: 'pg-dw.internal', port: 5432, database_name: 'Analytics_DW', username: 'pg_admin', password_secret_ref: 'kv_secret_02', provider: 'POSTGRES' }
  ]);
  
  const [questions, setQuestions] = useState<Question[]>([
    { id: 'q1', title: 'Seniority Tiers', prompt: 'Categorize employees by tenure.', solution_query: 'SELECT name, CASE WHEN tenure > 5 THEN "Senior" ELSE "Junior" END as Tier FROM emp ORDER BY tenure DESC', difficulty: 'MEDIUM', tags: ['Case When'], environment_tag: 'HR_Systems', expected_schema_ref: '', valid: true } as any
  ]);
  
  const [assessments, setAssessments] = useState<Assessment[]>([
    { id: 'a1', name: 'SQL Server Core V1', description: 'Internal validation for Data Engineers', duration_minutes: 60, attempts_allowed: 1, questions: [questions[0]], db_config: targets[0], is_published: true }
  ]);
  
  const [assignments, setAssignments] = useState<(Assignment & { user_name: string; user_email: string })[]>([
    { id: 'asgn1', assessment: assessments[0], participant_id: 'u1', due_date: '2024-12-31', status: 'PENDING', user_name: 'John Developer', user_email: 'j.dev@corp.com' }
  ]);

  const handleSaveQuestion = (q: any) => {
    setQuestions(prev => q.id ? prev.map(item => item.id === q.id ? q : item) : [...prev, { ...q, id: `q-${Date.now()}` }]);
    setModal({ type: null, data: null });
  };

  const handleSaveAssessment = (a: any) => {
     setAssessments(prev => a.id ? prev.map(item => item.id === a.id ? a : item) : [...prev, { ...a, id: `a-${Date.now()}` }]);
     setModal({ type: null, data: null });
  };

  const handleBulkAssign = (assessmentId: string, emails: string[]) => {
    const assessment = assessments.find(a => a.id === assessmentId);
    if (!assessment) return;
    
    const newAssignments = emails.map(email => ({
      id: `asgn-${Date.now()}-${Math.random()}`,
      assessment: assessment,
      participant_id: email,
      due_date: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString().split('T')[0],
      status: 'PENDING' as const,
      user_name: email.split('@')[0],
      user_email: email
    }));

    setAssignments(prev => [...prev, ...newAssignments]);
    setModal({ type: null, data: null });
  };

  return (
    <div className="max-w-7xl mx-auto px-4 py-8">
      {/* Admin Quick Stats */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-8">
        {[
          { label: 'Total Assessments', value: assessments.length, icon: Layers, color: 'text-blue-600', bg: 'bg-blue-50' },
          { label: 'Active Assignments', value: assignments.length, icon: UserCheck, color: 'text-emerald-600', bg: 'bg-emerald-50' },
          { label: 'Master Questions', value: questions.length, icon: ListChecks, color: 'text-indigo-600', bg: 'bg-indigo-50' },
          { label: 'System Targets', value: targets.length, icon: Server, color: 'text-amber-600', bg: 'bg-amber-50' },
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

      {/* Navigation Tabs */}
      <div className="flex gap-1 mb-8 bg-slate-200/50 p-1.5 rounded-2xl w-fit overflow-x-auto max-w-full">
        {(['assessments', 'assignments', 'results', 'questions', 'infrastructure'] as const).map(tab => (
          <button
            key={tab} onClick={() => setActiveTab(tab)}
            className={`px-6 py-2.5 rounded-xl font-bold text-sm capitalize flex items-center gap-2 transition-all whitespace-nowrap ${activeTab === tab ? 'bg-white text-blue-600 shadow-sm' : 'text-slate-500 hover:text-slate-700'}`}
          >
            {tab === 'assessments' && <Layers className="w-4 h-4" />}
            {tab === 'assignments' && <UserCheck className="w-4 h-4" />}
            {tab === 'results' && <FileOutput className="w-4 h-4" />}
            {tab === 'questions' && <ListChecks className="w-4 h-4" />}
            {tab === 'infrastructure' && <Server className="w-4 h-4" />}
            {tab}
          </button>
        ))}
      </div>

      {/* Primary Content Branching */}
      <div className="animate-in fade-in slide-in-from-bottom-2 duration-400">
        {activeTab === 'assessments' && (
          <AssessmentsTab 
            assessments={assessments} 
            onAdd={() => setModal({ type: 'assessment', data: { duration_minutes: 60, questions: [] } })} 
            onEdit={(a) => setModal({ type: 'assessment', data: a })}
            onBulkDelete={(ids) => setAssessments(prev => prev.filter(a => !ids.includes(a.id)))}
          />
        )}
        
        {activeTab === 'assignments' && (
          <AssignmentsTab 
            assignments={assignments} 
            onBulkAssign={() => setModal({ type: 'assign', data: null })} 
            onEdit={(as) => setModal({ type: 'edit_assignment', data: as })}
            onBulkDelete={(ids) => setAssignments(prev => prev.filter(a => !ids.includes(a.id)))}
            onBulkStatusUpdate={(ids, status) => setAssignments(prev => prev.map(a => ids.includes(a.id) ? { ...a, status } : a))}
          />
        )}

        {activeTab === 'results' && <ResultsTab results={[]} />}
        
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
             onBulkDelete={(ids) => setQuestions(prev => prev.filter(q => !ids.includes(q.id)))}
             onBulkEnvChange={(ids) => { setModal({ type: 'bulkQuestionEnv', data: ids }); setBulkEnvTarget(''); }}
          />
        )}
      </div>

      {/* Global Admin Modals */}
      <Modal 
        isOpen={modal.type === 'question'} 
        onClose={() => setModal({ type: null, data: null })} 
        title={modal.data?.id ? 'Edit Question' : 'New Master Question'}
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
        isOpen={modal.type === 'infrastructure'} 
        onClose={() => setModal({ type: null, data: null })} 
        title="Database Connection Target"
        icon={<Server className="w-6 h-6 text-blue-600" />}
      >
        <div className="space-y-6">
          <div className="bg-slate-50 p-4 rounded-xl border border-slate-100 flex items-center gap-3">
             <Activity className="w-5 h-5 text-emerald-500" />
             <p className="text-xs text-slate-500">Connections are validated via the Secure Evaluation Gateway.</p>
          </div>
          <div className="grid grid-cols-2 gap-4">
             <div className="col-span-2">
               <label className="block text-xs font-bold text-slate-400 uppercase tracking-widest mb-2">Display Name</label>
               <input type="text" value={modal.data?.database_name || ''} className="w-full p-3 bg-slate-50 border border-slate-200 rounded-xl outline-none" />
             </div>
             <div>
               <label className="block text-xs font-bold text-slate-400 uppercase tracking-widest mb-2">Host</label>
               <input type="text" value={modal.data?.host || ''} className="w-full p-3 bg-slate-50 border border-slate-200 rounded-xl outline-none font-mono text-xs" />
             </div>
             <div>
               <label className="block text-xs font-bold text-slate-400 uppercase tracking-widest mb-2">Provider</label>
               <select className="w-full p-3 bg-slate-50 border border-slate-200 rounded-xl outline-none">
                 <option>SQL_SERVER</option>
                 <option>POSTGRES</option>
               </select>
             </div>
          </div>
          <div className="flex gap-4 pt-4">
            <button onClick={() => setModal({ type: null, data: null })} className="flex-1 py-3 bg-slate-100 rounded-xl font-bold">Cancel</button>
            <button className="flex-1 py-3 bg-blue-600 text-white rounded-xl font-bold">Save Configuration</button>
          </div>
        </div>
      </Modal>

      {/* ... Other Modals (AssessmentEditor, BulkAssign, etc) ... */}
    </div>
  );
};

export default AdminDashboard;