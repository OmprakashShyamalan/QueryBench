
import React, { useState } from 'react';
import { 
  Settings, Plus, Users, LayoutDashboard, Database, 
  FileOutput, Search, Filter, Server, Lock, Globe, 
  ShieldCheck, CheckCircle2, AlertTriangle, UserPlus, 
  Calendar, ArrowRight, Trash2, Clock, X, Info, ListChecks,
  ChevronRight, Layers, Tag, HardDrive, Key, Eye, EyeOff, Code, AlignLeft, 
  AlertCircle, CheckCircle, RefreshCw, Upload, Download, FileText, UserCheck
} from 'lucide-react';
import { Assessment, Question, DatabaseConfig, User, Role, Assignment } from '../types';

const BANNED_TOKENS = ['DROP', 'DELETE', 'UPDATE', 'INSERT', 'TRUNCATE', 'ALTER', 'EXEC', 'MERGE', 'GRANT', 'REVOKE'];

const AdminDashboard: React.FC = () => {
  const [activeTab, setActiveTab] = useState<'questions' | 'assessments' | 'assignments' | 'results' | 'infrastructure'>('assessments');
  const [results, setResults] = useState<any[]>([]);
  const [resultsLoading, setResultsLoading] = useState(false);
  const [resultsError, setResultsError] = useState<string | null>(null);
  const [showAssessmentDetail, setShowAssessmentDetail] = useState<any | null>(null);
  const [showPassword, setShowPassword] = useState(false);
  
  // Data States
  const [targets, setTargets] = useState<DatabaseConfig[]>([
    {
      host: 'sql-prod.internal.net',
      port: 1433,
      database_name: 'HR_Systems',
      username: 'svc_assessment_runner',
      password: '••••••••••••',
      password_secret_ref: 'KV_SQL_PASS_01',
      provider: 'SQL_SERVER'
    },
    {
      host: 'pg-dev.internal.net',
      port: 5432,
      database_name: 'Public_Data',
      username: 'pg_runner',
      password: '••••••••••••',
      password_secret_ref: 'KV_PG_PASS',
      provider: 'POSTGRES'
    }
  ]);

  const [questions, setQuestions] = useState<(Question & { valid: boolean })[]>([
    { 
      id: 'q1', 
      title: 'Customer Lifetime Value', 
      solution_query: 'SELECT customer_id, SUM(amount) FROM orders GROUP BY customer_id ORDER BY 2 DESC', 
      valid: true, 
      prompt: 'Calculate the total spent by each customer across all orders. Return customer_id and total_spent.', 
      tags: ['Aggregations'],
      environment_tag: 'HR_Systems',
      difficulty: 'MEDIUM',
      expected_schema_ref: 'sales_schema'
    }
  ]);

  const [assessments, setAssessments] = useState<Assessment[]>([
    {
      id: 'a1',
      name: 'SQL Server - High Load Evaluation',
      description: 'Production-ready hiring assessment using TOP 100 slices.',
      duration_minutes: 60,
      attempts_allowed: 1,
      is_published: true,
      questions: [questions[0]],
      db_config: targets[0]
    }
  ]);

  const [assignments, setAssignments] = useState<(Assignment & { user_name: string; user_email: string })[]>([
    {
      id: 'asgn-01',
      user_name: 'John Developer',
      user_email: 'j.dev@company.com',
      participant_id: 'u-101',
      due_date: '2024-12-25',
      status: 'PENDING',
      assessment: assessments[0]
    }
  ]);

  // Modal states
  const [modalType, setModalType] = useState<'assign' | 'assessment' | 'question' | 'infrastructure' | 'bulkUpload' | 'bulkAssign' | 'confirmDelete' | null>(null);
  const [editingItem, setEditingItem] = useState<any>(null);
  const [validationErrors, setValidationErrors] = useState<Record<string, string>>({});
  const [sqlValidationStatus, setSqlValidationStatus] = useState<{ status: 'idle' | 'validating' | 'success' | 'error', message?: string }>({ status: 'idle' });
  const [bulkInput, setBulkInput] = useState('');

  const stats = [
    { label: 'Active Participants', value: '412', icon: Users, color: 'text-blue-600', bg: 'bg-blue-50' },
    { label: 'Total Assessments', value: assessments.length.toString(), icon: Database, color: 'text-indigo-600', bg: 'bg-indigo-50' },
    { label: 'Infrastructure Targets', value: targets.length.toString(), icon: Server, color: 'text-amber-600', bg: 'bg-amber-50' },
  ];

  // Fetch results when Results tab is active
  React.useEffect(() => {
    if (activeTab === 'results') {
      setResultsLoading(true);
      setResultsError(null);
      import('../services/api').then(api => {
        api.resultsApi.list()
          .then(setResults)
          .catch(e => setResultsError(e.message || 'Failed to load results'))
          .finally(() => setResultsLoading(false));
      });
    }
  }, [activeTab]);

  // Export results as CSV
  const exportResultsCsv = () => {
    if (!results || results.length === 0) return;
    const headers = Object.keys(results[0]);
    const csvRows = [headers.join(',')];
    for (const row of results) {
      csvRows.push(headers.map(h => JSON.stringify(row[h] ?? '')).join(','));
    }
    const csvContent = 'data:text/csv;charset=utf-8,' + csvRows.join('\n');
    const encodedUri = encodeURI(csvContent);
    const link = document.createElement('a');
    link.setAttribute('href', encodedUri);
    link.setAttribute('download', 'assessment_results.csv');
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const downloadCsvTemplate = () => {
    const headers = "title,prompt,difficulty,tags,environment_tag,solution_query,expected_schema_ref";
    const sampleRow = "Sample Query,Find all active users.,EASY,Basic,HR_Systems,SELECT * FROM users ORDER BY id;,user_schema";
    const csvContent = "data:text/csv;charset=utf-8," + headers + "\n" + sampleRow;
    const encodedUri = encodeURI(csvContent);
    const link = document.createElement("a");
    link.setAttribute("href", encodedUri);
    link.setAttribute("download", "question_import_template.csv");
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const handleBulkUpload = () => {
    // Basic CSV simulation parser
    const rows = bulkInput.split('\n').filter(row => row.trim() !== '');
    if (rows.length < 2) {
      setValidationErrors({ bulk: 'No data detected.' });
      return;
    }

    const newQuestions: (Question & { valid: boolean })[] = [];
    const headers = rows[0].split(',').map(h => h.trim().toLowerCase());

    for (let i = 1; i < rows.length; i++) {
      const values = rows[i].split(',').map(v => v.trim());
      const q: any = {};
      headers.forEach((h, idx) => {
        if (h === 'tags') q[h] = values[idx] ? values[idx].split(';') : [];
        else q[h] = values[idx];
      });

      newQuestions.push({
        ...q,
        id: `q-bulk-${Date.now()}-${i}`,
        difficulty: (q.difficulty?.toUpperCase() || 'EASY') as any,
        valid: true,
      } as any);
    }

    setQuestions(prev => [...prev, ...newQuestions]);
    closeModal();
  };

  const handleBulkAssign = () => {
    if (!editingItem?.assessment) {
      setValidationErrors({ bulkAssign: 'Please select an assessment.' });
      return;
    }
    const emails = bulkInput.split(/[\n,]+/).map(e => e.trim()).filter(e => e !== '');
    if (emails.length === 0) {
      setValidationErrors({ bulkAssign: 'No valid emails found.' });
      return;
    }

    const newAssignments = emails.map(email => ({
      id: `asgn-bulk-${Date.now()}-${email}`,
      user_name: email.split('@')[0],
      user_email: email,
      participant_id: `u-${email}`,
      due_date: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString().split('T')[0],
      status: 'PENDING' as any,
      assessment: editingItem.assessment
    }));

    setAssignments(prev => [...prev, ...newAssignments]);
    closeModal();
  };

  const validateSolutionSQL = async () => {
    if (!editingItem?.solution_query) {
      setSqlValidationStatus({ status: 'error', message: 'SQL Query cannot be empty.' });
      return;
    }

    setSqlValidationStatus({ status: 'validating' });
    await new Promise(r => setTimeout(r, 800));

    const sql = editingItem.solution_query.trim().toUpperCase();
    
    if (!sql.startsWith('SELECT') && !sql.startsWith('WITH')) {
      setSqlValidationStatus({ status: 'error', message: 'Must start with SELECT or WITH.' });
      return;
    }

    for (const token of BANNED_TOKENS) {
      if (new RegExp(`\\b${token}\\b`).test(sql)) {
        setSqlValidationStatus({ status: 'error', message: `Security violation: ${token} is disallowed.` });
        return;
      }
    }

    if (!sql.includes('ORDER BY')) {
      setSqlValidationStatus({ status: 'error', message: 'ORDER BY is mandatory for scoring.' });
      return;
    }

    setSqlValidationStatus({ status: 'success', message: 'SQL successfully validated for security and determinism.' });
  };

  const validateForm = (): boolean => {
    const errors: Record<string, string> = {};
    
    if (modalType === 'question') {
      if (!editingItem.title?.trim()) errors.title = 'Question Title is required.';
      if (!editingItem.prompt?.trim()) errors.prompt = 'Assessment Prompt is required.';
      if (!editingItem.solution_query?.trim()) errors.solution_query = 'Solution SQL is required.';
      if (!editingItem.environment_tag) errors.environment_tag = 'Target environment must be selected.';
    }

    if (modalType === 'infrastructure') {
      if (!editingItem.database_name?.trim()) errors.database_name = 'Database name is required.';
      if (!editingItem.host?.trim()) errors.host = 'Host address is required.';
      if (!editingItem.username?.trim()) errors.username = 'Username is required.';
    }

    setValidationErrors(errors);
    return Object.keys(errors).length === 0;
  };

  const handleSave = () => {
    if (!modalType) return;
    if (modalType === 'confirmDelete') {
      setQuestions(prev => prev.filter(q => q.id !== editingItem.id));
      closeModal();
      return;
    }
    if (!validateForm()) return;

    if (modalType === 'infrastructure') {
      const existingIndex = targets.findIndex(t => t.database_name === editingItem.database_name);
      if (existingIndex > -1) {
        setTargets(prev => prev.map(t => t.database_name === editingItem.database_name ? editingItem : t));
      } else {
        setTargets(prev => [...prev, editingItem]);
      }
    } else if (modalType === 'assessment') {
      if (editingItem.id) {
        setAssessments(prev => prev.map(a => a.id === editingItem.id ? editingItem : a));
      } else {
        setAssessments(prev => [...prev, { ...editingItem, id: `a-${Date.now()}`, questions: [] }]);
      }
    } else if (modalType === 'question') {
      const isNew = !editingItem.id;
      const questionWithMeta = { 
        ...editingItem, 
        id: isNew ? `q-${Date.now()}` : editingItem.id, 
        valid: sqlValidationStatus.status === 'success' || editingItem.valid
      };

      if (isNew) {
        setQuestions(prev => [...prev, questionWithMeta]);
      } else {
        setQuestions(prev => prev.map(q => q.id === editingItem.id ? questionWithMeta : q));
      }
    }

    closeModal();
  };

  const closeModal = () => {
    setModalType(null);
    setEditingItem(null);
    setValidationErrors({});
    setSqlValidationStatus({ status: 'idle' });
    setShowPassword(false);
    setBulkInput('');
  };

  return (
    <div className="max-w-7xl mx-auto px-4 py-8 relative">
      {/* Universal Modal */}
      {modalType && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-slate-900/60 backdrop-blur-sm" onClick={closeModal}></div>
          <div className="bg-white rounded-3xl p-8 max-w-2xl w-full shadow-2xl relative z-10 border border-slate-100 max-h-[90vh] overflow-y-auto animate-in zoom-in-95 duration-200">
            <div className="flex justify-between items-center mb-6">
               <h3 className="text-2xl font-bold text-slate-900 flex items-center gap-2">
                {modalType === 'infrastructure' && <><Server className="w-6 h-6 text-blue-600" /> Infrastructure Target</>}
                {modalType === 'assessment' && <><Database className="w-6 h-6 text-blue-600" /> Assessment Config</>}
                {modalType === 'question' && <><ShieldCheck className="w-6 h-6 text-blue-600" /> Question Editor</>}
                {modalType === 'bulkUpload' && <><Upload className="w-6 h-6 text-blue-600" /> Bulk Import Questions</>}
                {modalType === 'bulkAssign' && <><UserCheck className="w-6 h-6 text-blue-600" /> Bulk Assignment</>}
                {modalType === 'confirmDelete' && <><AlertTriangle className="w-6 h-6 text-red-600" /> Delete Question</>}
              </h3>
              <button onClick={closeModal} className="p-2 hover:bg-slate-100 rounded-full text-slate-400 transition">
                <X className="w-5 h-5" />
              </button>
            </div>
            
            <div className="space-y-6">
              {/* DELETE CONFIRMATION */}
              {modalType === 'confirmDelete' && (
                <div className="text-center py-4">
                  <p className="text-slate-600 mb-8 text-lg">
                    Are you sure you want to delete <span className="font-bold text-slate-900">"{editingItem?.title}"</span>? This action cannot be undone.
                  </p>
                </div>
              )}

              {/* BULK UPLOAD FORM */}
              {modalType === 'bulkUpload' && (
                <div className="space-y-4">
                  <div className="flex justify-between items-center bg-blue-50 p-4 rounded-2xl border border-blue-100">
                    <div className="flex items-center gap-3">
                      <FileText className="w-8 h-8 text-blue-600" />
                      <div>
                        <p className="text-sm font-bold text-blue-900">Import Template</p>
                        <p className="text-xs text-blue-700">Download the required CSV format.</p>
                      </div>
                    </div>
                    <button 
                      onClick={downloadCsvTemplate}
                      className="flex items-center gap-2 px-4 py-2 bg-white text-blue-600 rounded-xl text-xs font-bold hover:bg-blue-50 border border-blue-200 transition"
                    >
                      <Download className="w-4 h-4" /> Download .CSV
                    </button>
                  </div>
                  <div>
                    <label className="block text-xs font-bold text-slate-400 uppercase tracking-widest mb-2">Paste CSV Data</label>
                    <textarea 
                      value={bulkInput}
                      onChange={e => setBulkInput(e.target.value)}
                      placeholder="title,prompt,difficulty,tags,environment_tag,solution_query,expected_schema_ref..."
                      className="w-full p-4 bg-slate-50 border border-slate-200 rounded-2xl h-64 outline-none font-mono text-xs leading-relaxed"
                    ></textarea>
                    {validationErrors.bulk && <p className="text-red-500 text-xs mt-2 font-bold">{validationErrors.bulk}</p>}
                  </div>
                </div>
              )}

              {/* BULK ASSIGN FORM */}
              {modalType === 'bulkAssign' && (
                <div className="space-y-6">
                  <div>
                    <label className="block text-xs font-bold text-slate-400 uppercase tracking-widest mb-2">Target Assessment</label>
                    <select 
                      value={editingItem?.assessment?.id || ''} 
                      onChange={e => {
                        const a = assessments.find(as => as.id === e.target.value);
                        setEditingItem({...editingItem, assessment: a});
                      }}
                      className="w-full p-3 bg-blue-50 border border-blue-200 rounded-xl outline-none font-bold text-blue-700"
                    >
                      <option value="">Select Assessment...</option>
                      {assessments.map(a => <option key={a.id} value={a.id}>{a.name}</option>)}
                    </select>
                  </div>
                  <div>
                    <label className="block text-xs font-bold text-slate-400 uppercase tracking-widest mb-2">Participant Emails (Comma or New Line separated)</label>
                    <textarea 
                      value={bulkInput}
                      onChange={e => setBulkInput(e.target.value)}
                      placeholder="user1@company.com&#10;user2@company.com"
                      className="w-full p-4 bg-slate-50 border border-slate-200 rounded-2xl h-48 outline-none text-sm"
                    ></textarea>
                    {validationErrors.bulkAssign && <p className="text-red-500 text-xs mt-2 font-bold">{validationErrors.bulkAssign}</p>}
                  </div>
                </div>
              )}

              {/* QUESTION EDITOR FORM */}
              {modalType === 'question' && (
                <div className="space-y-5">
                  <div className="grid grid-cols-2 gap-4">
                    <div className="col-span-2">
                      <label className="block text-xs font-bold text-slate-400 uppercase tracking-widest mb-2 flex justify-between">
                        <span>Question Title</span>
                        {validationErrors.title && <span className="text-red-500 normal-case">{validationErrors.title}</span>}
                      </label>
                      <input 
                        type="text" 
                        value={editingItem?.title || ''} 
                        onChange={e => setEditingItem({...editingItem, title: e.target.value})}
                        className={`w-full p-3 bg-slate-50 border ${validationErrors.title ? 'border-red-300' : 'border-slate-200'} rounded-xl outline-none font-medium`} 
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-bold text-slate-400 uppercase tracking-widest mb-2">Environment Target</label>
                      <select 
                        value={editingItem?.environment_tag || ''} 
                        onChange={e => setEditingItem({...editingItem, environment_tag: e.target.value})}
                        className="w-full p-3 bg-blue-50 border border-blue-200 rounded-xl outline-none font-bold text-blue-700"
                      >
                        <option value="">Select Database...</option>
                        {targets.map(t => <option key={t.database_name} value={t.database_name}>{t.database_name}</option>)}
                      </select>
                    </div>
                    <div>
                      <label className="block text-xs font-bold text-slate-400 uppercase tracking-widest mb-2">Difficulty</label>
                      <select 
                        value={editingItem?.difficulty || 'EASY'} 
                        onChange={e => setEditingItem({...editingItem, difficulty: e.target.value})}
                        className="w-full p-3 bg-slate-50 border border-slate-200 rounded-xl outline-none font-medium"
                      >
                        <option value="EASY">Easy</option>
                        <option value="MEDIUM">Medium</option>
                        <option value="HARD">Hard</option>
                      </select>
                    </div>
                  </div>
                  <div>
                    <label className="block text-xs font-bold text-slate-400 uppercase tracking-widest mb-2">Assessment Prompt</label>
                    <textarea 
                      value={editingItem?.prompt || ''} 
                      onChange={e => setEditingItem({...editingItem, prompt: e.target.value})}
                      className="w-full p-4 bg-slate-50 border border-slate-200 rounded-2xl h-32 outline-none"
                    ></textarea>
                  </div>
                  <div>
                    <div className="flex justify-between items-center mb-2">
                      <label className="block text-xs font-bold text-slate-400 uppercase tracking-widest">Solution SQL</label>
                      <button onClick={validateSolutionSQL} className="text-[10px] text-blue-600 font-bold bg-blue-50 px-2 py-0.5 rounded hover:bg-blue-100">Validate</button>
                    </div>
                    <textarea 
                      value={editingItem?.solution_query || ''} 
                      onChange={e => setEditingItem({...editingItem, solution_query: e.target.value})}
                      className="w-full p-4 bg-slate-900 text-emerald-400 font-mono text-sm border border-slate-700 rounded-2xl h-40 outline-none shadow-inner"
                    ></textarea>
                    {sqlValidationStatus.status !== 'idle' && (
                      <div className={`mt-2 p-3 rounded-xl border flex items-center gap-2 text-xs ${sqlValidationStatus.status === 'success' ? 'bg-emerald-50 border-emerald-100 text-emerald-700' : 'bg-red-50 border-red-100 text-red-700'}`}>
                        {sqlValidationStatus.status === 'success' ? <CheckCircle className="w-4 h-4" /> : <AlertCircle className="w-4 h-4" />}
                        {sqlValidationStatus.message}
                      </div>
                    )}
                  </div>
                </div>
              )}
            </div>

            <div className="flex gap-4 mt-8 pt-6 border-t border-slate-100">
              <button onClick={closeModal} className="flex-1 py-3 px-6 bg-slate-100 text-slate-600 rounded-xl font-bold hover:bg-slate-200 transition">
                Cancel
              </button>
              <button 
                onClick={modalType === 'bulkUpload' ? handleBulkUpload : modalType === 'bulkAssign' ? handleBulkAssign : handleSave} 
                className={`flex-1 py-3 px-6 text-white rounded-xl font-bold transition shadow-lg ${modalType === 'confirmDelete' ? 'bg-red-600 hover:bg-red-700 shadow-red-200' : 'bg-blue-600 hover:bg-blue-700 shadow-blue-200'}`}
              >
                {modalType === 'confirmDelete' ? 'Delete Permanently' : modalType === 'bulkUpload' ? 'Import All' : modalType === 'bulkAssign' ? 'Create Assignments' : (editingItem?.id ? 'Update' : 'Create')}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Stats Bar */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-10">
        {stats.map(stat => (
          <div key={stat.label} className="bg-white p-6 rounded-2xl shadow-sm border border-gray-100 flex items-center gap-5">
            <div className={`p-4 rounded-xl ${stat.bg}`}>
              <stat.icon className={`w-6 h-6 ${stat.color}`} />
            </div>
            <div>
              <p className="text-sm font-medium text-gray-500">{stat.label}</p>
              <p className="text-3xl font-extrabold text-gray-900">{stat.value}</p>
            </div>
          </div>
        ))}
      </div>

      {/* Tabs */}
      <div className="flex flex-wrap gap-1 mb-8 bg-gray-200/50 p-1.5 rounded-2xl w-fit">
        {(['assessments', 'assignments', 'questions', 'results', 'infrastructure'] as const).map(tab => (
          <button
            key={tab}
            onClick={() => setActiveTab(tab)}
            className={`px-6 py-2.5 rounded-xl font-bold text-sm transition-all capitalize flex items-center gap-2 ${
              activeTab === tab ? 'bg-white text-blue-600 shadow-md' : 'text-gray-500 hover:text-gray-700'
            }`}
          >
            {tab === 'assessments' && <Layers className="w-4 h-4" />}
            {tab === 'assignments' && <UserPlus className="w-4 h-4" />}
            {tab === 'questions' && <ListChecks className="w-4 h-4" />}
            {tab === 'results' && <FileOutput className="w-4 h-4" />}
            {tab === 'infrastructure' && <Server className="w-4 h-4" />}
            {tab}
          </button>
        ))}
      </div>
      {/* Content: Results */}
      {activeTab === 'results' && (
        <div className="space-y-6">
          <div className="flex justify-between items-center">
            <h2 className="text-xl font-bold text-gray-900">Assessment Results</h2>
            <button
              onClick={exportResultsCsv}
              className="flex items-center gap-2 px-6 py-2 bg-blue-600 text-white rounded-xl text-sm font-bold hover:bg-blue-700 transition"
              disabled={results.length === 0}
            >
              <Download className="w-4 h-4" /> Export CSV
            </button>
          </div>
          {resultsLoading ? (
            <div className="p-8 text-center text-slate-500">Loading results...</div>
          ) : resultsError ? (
            <div className="p-8 text-center text-red-500">{resultsError}</div>
          ) : results.length === 0 ? (
            <div className="p-8 text-center text-slate-400">No results found.</div>
          ) : (
            <div className="overflow-x-auto bg-white rounded-2xl border border-slate-200 shadow-sm">
              <table className="min-w-full text-xs">
                <thead>
                  <tr>
                    <th className="px-4 py-2">Participant</th>
                    <th className="px-4 py-2">Email</th>
                    <th className="px-4 py-2">Assessment</th>
                    <th className="px-4 py-2">Score</th>
                    <th className="px-4 py-2">Status</th>
                    <th className="px-4 py-2">Submitted</th>
                    <th className="px-4 py-2">Details</th>
                  </tr>
                </thead>
                <tbody>
                  {results.map((r: any) => (
                    <tr key={r.id} className="border-t last:border-b-0">
                      <td className="px-4 py-2 font-bold">{r.participant_name}</td>
                      <td className="px-4 py-2">{r.participant_email}</td>
                      <td className="px-4 py-2">{r.assessment_name}</td>
                      <td className="px-4 py-2">{r.score ?? '-'}</td>
                      <td className="px-4 py-2">{r.result_status}</td>
                      <td className="px-4 py-2">{r.submitted_date || r.submitted_at}</td>
                      <td className="px-4 py-2">
                        <button className="text-blue-600 underline text-xs" onClick={() => setShowAssessmentDetail(r)}>
                          View
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
          {/* Assessment Details Modal */}
          {showAssessmentDetail && (
            <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
              <div className="absolute inset-0 bg-slate-900/60 backdrop-blur-sm" onClick={() => setShowAssessmentDetail(null)}></div>
              <div className="bg-white rounded-3xl p-8 max-w-lg w-full shadow-2xl relative z-10 border border-slate-100">
                <h3 className="text-2xl font-bold text-slate-900 mb-2">Assessment Details</h3>
                <div className="space-y-2 text-sm text-slate-700">
                  <div><b>Participant:</b> {showAssessmentDetail.participant_name}</div>
                  <div><b>Email:</b> {showAssessmentDetail.participant_email}</div>
                  <div><b>Assessment:</b> {showAssessmentDetail.assessment_name}</div>
                  <div><b>Score:</b> {showAssessmentDetail.score ?? '-'}</div>
                  <div><b>Status:</b> {showAssessmentDetail.result_status}</div>
                  <div><b>Submitted:</b> {showAssessmentDetail.submitted_date || showAssessmentDetail.submitted_at}</div>
                </div>
                <button onClick={() => setShowAssessmentDetail(null)} className="mt-6 px-6 py-2 bg-slate-700 text-white font-bold rounded-xl hover:bg-slate-600 transition w-full">Close</button>
              </div>
            </div>
          )}
        </div>
      )}

      {/* Content: Assignments */}
      {activeTab === 'assignments' && (
        <div className="space-y-6">
          <div className="flex justify-between items-center">
             <h2 className="text-xl font-bold text-gray-900">Active Assignments</h2>
             <div className="flex gap-3">
               <button 
                onClick={() => setModalType('bulkAssign')}
                className="flex items-center gap-2 px-6 py-2 bg-slate-900 text-white rounded-xl text-sm font-bold hover:bg-slate-800 transition shadow-lg"
               >
                 <UserCheck className="w-4 h-4" /> Bulk Assign
               </button>
             </div>
          </div>
          <div className="bg-white rounded-3xl border border-slate-200 overflow-hidden shadow-sm">
            {assignments.map(as => (
              <div key={as.id} className="p-5 border-b last:border-0 flex justify-between items-center hover:bg-slate-50 transition">
                <div>
                  <p className="font-bold text-slate-900">{as.user_name}</p>
                  <p className="text-[10px] text-slate-400 font-mono">{as.user_email}</p>
                  <div className="flex items-center gap-4 mt-2">
                    <span className="text-[10px] font-bold text-blue-600 bg-blue-50 px-2 py-0.5 rounded">{as.assessment.name}</span>
                    <span className="text-[10px] text-slate-400">Due: {as.due_date}</span>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                   <span className={`text-[10px] font-bold px-2 py-0.5 rounded ${as.status === 'COMPLETED' ? 'bg-emerald-50 text-emerald-600' : 'bg-amber-50 text-amber-600'}`}>
                    {as.status}
                   </span>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Content: Infrastructure */}
      {activeTab === 'infrastructure' && (
        <div className="space-y-6">
          <div className="flex justify-between items-center">
            <div>
              <h2 className="text-xl font-bold text-gray-900">Infrastructure Targets</h2>
              <p className="text-xs text-slate-500">Secure connection endpoints for the query evaluation engine.</p>
            </div>
            <button 
              onClick={() => { setModalType('infrastructure'); setEditingItem({ provider: 'SQL_SERVER', port: 1433 }); }}
              className="flex items-center gap-2 px-6 py-2 bg-slate-900 text-white rounded-xl text-sm font-bold hover:bg-slate-800 transition"
            >
              <Plus className="w-4 h-4" /> New Target
            </button>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {targets.map(target => (
              <div key={target.database_name} className="bg-white rounded-2xl border border-slate-200 p-6 hover:border-blue-300 transition shadow-sm group">
                <div className="flex justify-between items-start mb-6">
                  <div className="flex items-center gap-3">
                    <div className="p-3 bg-slate-100 rounded-xl text-slate-600 group-hover:bg-blue-50 group-hover:text-blue-600 transition">
                      <HardDrive className="w-6 h-6" />
                    </div>
                    <div>
                      <h3 className="font-bold text-slate-900">{target.database_name}</h3>
                      <p className="text-[10px] font-mono text-slate-400">{target.host}:{target.port}</p>
                    </div>
                  </div>
                  <div className="flex gap-1">
                    <button onClick={() => { setModalType('infrastructure'); setEditingItem(target); }} className="p-2 text-slate-400 hover:text-blue-600 transition">
                      <Settings className="w-4 h-4" />
                    </button>
                    <button onClick={() => setTargets(prev => prev.filter(t => t.database_name !== target.database_name))} className="p-2 text-slate-400 hover:text-red-600 transition">
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Content: Question Library */}
      {activeTab === 'questions' && (
        <div className="space-y-6">
           <div className="flex justify-between items-center">
             <h2 className="text-xl font-bold text-gray-900">Question Library</h2>
             <div className="flex gap-3">
                <button 
                  onClick={() => setModalType('bulkUpload')}
                  className="flex items-center gap-2 px-6 py-2 bg-slate-100 text-slate-600 rounded-xl text-sm font-bold hover:bg-slate-200 border border-slate-200 transition"
                >
                  <Upload className="w-4 h-4" /> Import
                </button>
                <button 
                  onClick={() => { setModalType('question'); setEditingItem({ difficulty: 'EASY', environment_tag: targets[0]?.database_name }); }}
                  className="flex items-center gap-2 px-6 py-2 bg-slate-900 text-white rounded-xl text-sm font-bold hover:bg-slate-800 transition shadow-lg"
                >
                  <Plus className="w-4 h-4" /> Create Question
                </button>
             </div>
           </div>
           <div className="bg-white rounded-3xl border border-slate-200 overflow-hidden shadow-sm">
             {questions.map(q => (
               <div key={q.id} className="p-5 border-b last:border-0 hover:bg-slate-50 transition flex justify-between items-center group">
                 <div className="flex items-center gap-4">
                   <div className={`p-3 rounded-2xl ${q.difficulty === 'HARD' ? 'bg-red-50 text-red-600' : q.difficulty === 'MEDIUM' ? 'bg-amber-50 text-amber-600' : 'bg-green-50 text-green-600'}`}>
                      <Code className="w-5 h-5" />
                   </div>
                   <div>
                     <p className="font-bold text-slate-900">{q.title}</p>
                     <div className="flex gap-3 mt-1.5 items-center">
                        <span className="text-[10px] uppercase font-bold text-slate-400 tracking-widest flex items-center gap-1.5">
                          <Database className="w-3 h-3" /> {q.environment_tag}
                        </span>
                        <div className="w-1 h-1 bg-slate-300 rounded-full"></div>
                        {!q.valid && <span className="text-[10px] text-red-500 font-bold uppercase tracking-widest flex items-center gap-1"><AlertTriangle className="w-3 h-3" /> Needs Validation</span>}
                        {q.valid && <span className="text-[10px] text-emerald-500 font-bold uppercase tracking-widest flex items-center gap-1"><CheckCircle className="w-3 h-3" /> Validated</span>}
                     </div>
                   </div>
                 </div>
                 <div className="flex items-center gap-2">
                    <button onClick={() => { setModalType('question'); setEditingItem(q); }} className="p-2.5 bg-slate-100 text-slate-600 rounded-xl hover:bg-blue-600 hover:text-white transition">
                      <Settings className="w-4 h-4" />
                    </button>
                    <button onClick={() => { setModalType('confirmDelete'); setEditingItem(q); }} className="p-2.5 bg-slate-100 text-slate-600 rounded-xl hover:bg-red-600 hover:text-white transition">
                      <Trash2 className="w-4 h-4" />
                    </button>
                 </div>
               </div>
             ))}
           </div>
        </div>
      )}

      {/* Content: Assessments */}
      {activeTab === 'assessments' && (
        <div className="space-y-6">
          <div className="flex justify-between items-center">
            <h2 className="text-xl font-bold text-gray-900">Assessments</h2>
            <button onClick={() => { setModalType('assessment'); setEditingItem({ duration_minutes: 60, db_config: targets[0] }); }} className="flex items-center gap-2 px-6 py-2 bg-blue-600 text-white rounded-xl text-sm font-bold hover:bg-blue-700 transition">
              <Plus className="w-4 h-4" /> Create Assessment
            </button>
          </div>
          <div className="grid grid-cols-1 gap-6">
            {assessments.map(a => (
              <div key={a.id} className="bg-white rounded-3xl border border-slate-200 p-6 flex flex-col md:flex-row md:items-center justify-between gap-6 hover:border-blue-300 transition shadow-sm">
                <div>
                  <h3 className="text-lg font-bold text-slate-900">{a.name}</h3>
                  <div className="flex gap-4 mt-2">
                    <span className="flex items-center gap-1 text-xs font-medium text-slate-500"><Server className="w-3 h-3" /> {a.db_config?.database_name}</span>
                    <span className="flex items-center gap-1 text-xs font-medium text-slate-500"><Clock className="w-3 h-3" /> {a.duration_minutes}m</span>
                    <span className="flex items-center gap-1 text-xs font-medium text-slate-500"><ListChecks className="w-3 h-3" /> {a.questions.length} Questions</span>
                  </div>
                </div>
                <button onClick={() => { setModalType('assessment'); setEditingItem(a); }} className="p-3 bg-slate-50 text-slate-500 rounded-2xl hover:bg-slate-100 transition">
                  <Settings className="w-5 h-5" />
                </button>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
};

export default AdminDashboard;
