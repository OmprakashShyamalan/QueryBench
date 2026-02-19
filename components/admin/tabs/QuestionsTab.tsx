
import React, { useState } from 'react';
import { ShieldCheck, Plus, Upload, Settings, Trash2, Database, CheckSquare, Square, CheckCircle, AlertTriangle, RefreshCw } from 'lucide-react';
import { Question } from '../../../types';

interface Props {
  questions: Question[];
  onImport: () => void;
  onCreate: () => void;
  onEdit: (q: Question) => void;
  onDelete: (q: Question) => void; // Single delete
  onBulkDelete: (ids: string[]) => void; // Bulk delete
  onBulkEnvChange: (ids: string[]) => void; // Bulk environment change
}

export const QuestionsTab: React.FC<Props> = ({ questions, onImport, onCreate, onEdit, onDelete, onBulkDelete, onBulkEnvChange }) => {
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());

  const toggleAll = () => {
    if (selectedIds.size === questions.length) {
      setSelectedIds(new Set());
    } else {
      setSelectedIds(new Set(questions.map(q => q.id)));
    }
  };

  const toggleOne = (id: string) => {
    const next = new Set(selectedIds);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    setSelectedIds(next);
  };

  const handleBulkDelete = () => {
    if (confirm(`Permanently delete ${selectedIds.size} questions?`)) {
      onBulkDelete(Array.from(selectedIds));
      setSelectedIds(new Set());
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <h2 className="text-xl font-bold text-gray-900">Question Library</h2>
        <div className="flex gap-2">
           {selectedIds.size > 0 ? (
            <div className="flex gap-2 animate-in fade-in">
              <button 
                onClick={handleBulkDelete}
                className="flex items-center gap-2 px-3 py-2 bg-red-50 text-red-600 border border-red-100 rounded-xl text-xs font-bold hover:bg-red-100 transition"
              >
                <Trash2 className="w-3.5 h-3.5" /> Delete ({selectedIds.size})
              </button>
              <button 
                onClick={() => { onBulkEnvChange(Array.from(selectedIds)); setSelectedIds(new Set()); }}
                className="flex items-center gap-2 px-3 py-2 bg-blue-50 text-blue-600 border border-blue-100 rounded-xl text-xs font-bold hover:bg-blue-100 transition"
              >
                <RefreshCw className="w-3.5 h-3.5" /> Change Target
              </button>
            </div>
          ) : (
            <button onClick={onImport} className="px-4 py-2 bg-slate-100 rounded-xl text-sm font-bold border border-slate-200 flex items-center gap-2 hover:bg-slate-200 transition text-slate-600">
              <Upload className="w-4 h-4"/> Import
            </button>
          )}
          <button onClick={onCreate} className="px-4 py-2 bg-slate-900 text-white rounded-xl text-sm font-bold flex items-center gap-2 hover:bg-slate-800 transition shadow-lg shadow-slate-200">
            <Plus className="w-4 h-4"/> Create
          </button>
        </div>
      </div>
      <div className="bg-white rounded-3xl border border-slate-200 overflow-hidden shadow-sm">
        <table className="w-full text-left border-collapse">
          <thead className="bg-slate-50 border-b border-slate-200">
            <tr>
              <th className="px-6 py-4 w-12">
                <button onClick={toggleAll} className="text-slate-400 hover:text-slate-600">
                  {questions.length > 0 && selectedIds.size === questions.length ? <CheckSquare className="w-5 h-5 text-blue-600" /> : <Square className="w-5 h-5" />}
                </button>
              </th>
              <th className="px-6 py-4 text-[10px] font-bold text-slate-400 uppercase tracking-widest">Question</th>
              <th className="px-6 py-4 text-[10px] font-bold text-slate-400 uppercase tracking-widest">Difficulty</th>
              <th className="px-6 py-4 text-[10px] font-bold text-slate-400 uppercase tracking-widest">Target</th>
              <th className="px-6 py-4 text-[10px] font-bold text-slate-400 uppercase tracking-widest text-right">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {questions.map(q => (
              <tr key={q.id} className={`hover:bg-slate-50 transition ${selectedIds.has(q.id) ? 'bg-blue-50/30' : ''}`}>
                <td className="px-6 py-4">
                  <button onClick={() => toggleOne(q.id)} className="text-slate-400 hover:text-slate-600">
                    {selectedIds.has(q.id) ? <CheckSquare className="w-5 h-5 text-blue-600" /> : <Square className="w-5 h-5" />}
                  </button>
                </td>
                <td className="px-6 py-4">
                  <div className="flex items-center gap-3">
                    <div className={`p-2 rounded-lg ${q.difficulty === 'HARD' ? 'bg-red-50 text-red-600' : q.difficulty === 'MEDIUM' ? 'bg-amber-50 text-amber-600' : 'bg-green-50 text-green-600'}`}>
                      <ShieldCheck className="w-4 h-4"/>
                    </div>
                    <div>
                      <p className="font-bold text-slate-900 text-sm">{q.title}</p>
                      {(q as any).valid ? (
                         <span className="text-[10px] text-emerald-600 flex items-center gap-1 font-medium"><CheckCircle className="w-3 h-3"/> SQL Validated</span>
                      ) : (
                         <span className="text-[10px] text-red-500 flex items-center gap-1 font-medium"><AlertTriangle className="w-3 h-3"/> Needs Validation</span>
                      )}
                    </div>
                  </div>
                </td>
                <td className="px-6 py-4">
                  <span className={`text-[10px] font-bold px-2 py-1 rounded border ${q.difficulty === 'HARD' ? 'bg-red-50 text-red-600 border-red-100' : q.difficulty === 'MEDIUM' ? 'bg-amber-50 text-amber-600 border-amber-100' : 'bg-green-50 text-green-600 border-green-100'}`}>
                    {q.difficulty}
                  </span>
                </td>
                <td className="px-6 py-4">
                  <span className="text-xs font-bold text-slate-500 flex items-center gap-1.5">
                    <Database className="w-3.5 h-3.5 text-slate-400" /> {q.environment_tag}
                  </span>
                </td>
                <td className="px-6 py-4 text-right flex justify-end gap-2">
                  <button onClick={() => onEdit(q)} className="p-2 text-slate-400 hover:text-blue-600 hover:bg-blue-50 rounded-lg transition">
                    <Settings className="w-4 h-4" />
                  </button>
                  <button onClick={() => onDelete(q)} className="p-2 text-slate-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition">
                    <Trash2 className="w-4 h-4" />
                  </button>
                </td>
              </tr>
            ))}
            {questions.length === 0 && (
              <tr>
                <td colSpan={5} className="px-6 py-12 text-center text-slate-400 text-sm italic">No questions found.</td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
};
