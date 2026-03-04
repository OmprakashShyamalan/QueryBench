
import React, { useState, useRef } from 'react';
import { ShieldCheck, Code, AlignLeft, RefreshCw, AlertCircle, CheckCircle, Play, Loader2 } from 'lucide-react';
import { Question, DatabaseConfig } from '../../types';
import CodeMirror from '@uiw/react-codemirror';
import { sql } from '@codemirror/lang-sql';
import { attemptsApi } from '../../services/api';

interface Props {
  item: any;
  targets: DatabaseConfig[];
  onSave: (item: any) => void;
  onCancel: () => void;
}

export const QuestionEditor: React.FC<Props> = ({ item, targets, onSave, onCancel }) => {
  const [editingItem, setEditingItem] = useState(item || { difficulty: 'EASY', tags: [], solution_query: '' });
  const [status, setStatus] = useState<{ type: 'idle' | 'validating' | 'success' | 'error', msg?: string }>({ type: 'idle' });
  const [isValidating, setIsValidating] = useState(false);
  // Ref always holds the latest query value; avoids reading stale closure state
  // when validateSQL is called immediately after fast Cypress typing (delay:0).
  const solutionQueryRef = useRef<string>(item?.solution_query || '');

  const validateSQL = async () => {
    setIsValidating(true);
    setStatus({ type: 'validating' });

    const query = solutionQueryRef.current.trim();
    const queryUpper = query.toUpperCase();
    const dangerous = ['DROP', 'DELETE', 'TRUNCATE', 'ALTER', 'UPDATE', 'INSERT'];

    // Static checks first — fast-fail before hitting the DB
    if (dangerous.some(t => queryUpper.includes(t))) {
      setStatus({ type: 'error', msg: 'Security violation: DDL/DML tokens detected.' });
      setIsValidating(false);
      return;
    }
    if (!queryUpper.includes('SELECT')) {
      setStatus({ type: 'error', msg: 'Syntax Error: No valid SELECT projection found.' });
      setIsValidating(false);
      return;
    }
    if (!queryUpper.includes('ORDER BY')) {
      setStatus({ type: 'error', msg: 'Determinism Error: ORDER BY is required for deterministic scoring.' });
      setIsValidating(false);
      return;
    }

    // Resolve the selected target database config
    // Note: AdminDashboard maps the API id to _id, so use _id with fallback to id
    const config = targets.find(t => t.database_name === editingItem.environment_tag);
    if (!config) {
      setStatus({ type: 'error', msg: 'Select a target database environment before validating.' });
      setIsValidating(false);
      return;
    }
    const configId: number | undefined = (config as any)._id ?? (config as any).id;
    if (!configId) {
      setStatus({ type: 'error', msg: 'Could not resolve database config ID. Try reloading the page.' });
      setIsValidating(false);
      return;
    }

    // Actually execute the query against the selected database
    try {
      const result = await attemptsApi.runQuery(query, configId);
      if (result.error) {
        setStatus({ type: 'error', msg: `Database Error: ${result.error}` });
      } else {
        setStatus({
          type: 'success',
          msg: `Query executed successfully — ${result.rows.length} row(s) returned in ${Math.round(result.execution_time_ms)}ms.`,
        });
        setEditingItem({ ...editingItem, valid: true });
      }
    } catch (err) {
      setStatus({ type: 'error', msg: err instanceof Error ? err.message : 'Execution failed.' });
    }

    setIsValidating(false);
  };

  return (
    <div className="flex flex-col gap-6">
      <div className="grid grid-cols-3 gap-6">
        {/* Metadata Controls */}
        <div className="col-span-1 space-y-5">
           <div>
            <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-2">Target Database Environment</label>
            <select 
              name="environment_tag"
              value={editingItem.environment_tag || ''} 
              onChange={e => setEditingItem({...editingItem, environment_tag: e.target.value})}
              className="w-full p-3 bg-blue-50 border border-blue-200 rounded-xl outline-none text-blue-700 font-bold text-sm"
            >
              {targets.map(t => <option key={t.database_name} value={t.database_name}>{t.database_name}</option>)}
            </select>
          </div>

          <div>
            <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-2">Question Difficulty</label>
            <div className="grid grid-cols-3 gap-2">
               {['EASY', 'MEDIUM', 'HARD'].map(d => (
                 <button 
                  key={d}
                  name={`difficulty-${d}`}
                  onClick={() => setEditingItem({...editingItem, difficulty: d})}
                  className={`py-2 rounded-lg text-[10px] font-bold border transition-all ${editingItem.difficulty === d ? 'bg-slate-900 text-white border-slate-900' : 'bg-white text-slate-400 border-slate-200'}`}
                 >
                   {d}
                 </button>
               ))}
            </div>
          </div>

          <div>
            <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-2 flex items-center gap-2">
              <AlignLeft className="w-3 h-3" /> Question Title
            </label>
            <input 
              name="title"
              type="text" value={editingItem.title || ''} 
              onChange={e => setEditingItem({...editingItem, title: e.target.value})}
              placeholder="e.g. Employee Tenure Analysis"
              className="w-full p-3 bg-slate-50 border border-slate-200 rounded-xl outline-none text-sm font-medium" 
            />
          </div>

          <div>
            <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-2 flex items-center gap-2">
              <Code className="w-3 h-3" /> Prompt Instructions
            </label>
            <textarea 
              name="prompt"
              value={editingItem.prompt || ''} 
              onChange={e => setEditingItem({...editingItem, prompt: e.target.value})}
              placeholder="Provide clear instructions for the participant..."
              className="w-full p-4 bg-slate-50 border border-slate-200 rounded-2xl h-48 outline-none text-sm leading-relaxed"
            />
          </div>
        </div>

        {/* SQL Editor / Playground */}
        <div className="col-span-2 flex flex-col h-full min-h-[500px] border border-slate-200 rounded-2xl overflow-hidden shadow-sm">
          <div className="bg-slate-800 px-4 py-2 flex justify-between items-center shrink-0">
             <span className="text-[10px] text-slate-400 font-mono tracking-widest uppercase">Solution Playground (SQL Server)</span>
             <button 
              onClick={validateSQL}
              disabled={isValidating}
              className="px-4 py-1.5 bg-blue-600 text-white text-[10px] font-bold rounded-lg hover:bg-blue-500 transition flex items-center gap-2"
             >
               {isValidating ? <Loader2 className="w-3 h-3 animate-spin" /> : <Play className="w-3 h-3" />}
               Validate Logic
             </button>
          </div>
          
          <div className="flex-1 bg-slate-900 relative">
            <CodeMirror 
              value={editingItem.solution_query || ''} 
              theme="dark"
              height="100%"
              extensions={[sql()]}
              onChange={value => { solutionQueryRef.current = value; setEditingItem({...editingItem, solution_query: value}); }}
              className="h-full text-sm font-mono"
            />
          </div>

          <div className={`p-4 border-t transition-colors ${status.type === 'success' ? 'bg-emerald-50 border-emerald-100' : status.type === 'error' ? 'bg-red-50 border-red-100' : 'bg-slate-50 border-slate-100'}`}>
            {status.type === 'validating' ? (
              <p className="text-[10px] text-slate-400 italic text-center flex items-center justify-center gap-2">
                <Loader2 className="w-3 h-3 animate-spin inline-block" /> Running query against database...
              </p>
            ) : status.type === 'success' || status.type === 'error' ? (
              <div className={`flex items-start gap-3 text-xs ${status.type === 'success' ? 'text-emerald-700' : 'text-red-700'}`}>
                {status.type === 'success' ? <CheckCircle className="w-4 h-4 shrink-0 mt-0.5" /> : <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />}
                <div>
                   <p className="font-bold mb-0.5 uppercase tracking-wider">{status.type === 'success' ? 'Validation Passed' : 'Validation Failed'}</p>
                   <p className="opacity-80 leading-relaxed">{status.msg}</p>
                </div>
              </div>
            ) : (
              <p className="text-[10px] text-slate-400 italic text-center">Verify the query logic to enable this question for assessments.</p>
            )}
          </div>
        </div>
      </div>

      <div className="flex gap-4 pt-6 border-t border-slate-100">
        <button onClick={onCancel} className="flex-1 py-3.5 bg-slate-100 text-slate-600 rounded-2xl font-bold hover:bg-slate-200 transition">Cancel</button>
        <button 
          onClick={() => onSave(editingItem)} 
          className="flex-[2] py-3.5 bg-slate-900 text-white rounded-2xl font-bold hover:bg-slate-800 transition shadow-xl active:scale-95"
        >
          {item?.id ? 'Update Master Library' : 'Create New Question'}
        </button>
      </div>
    </div>
  );
};
