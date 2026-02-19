
import React, { useState } from 'react';
import { Plus, Clock, ListChecks, Server, Settings, Trash2, CheckSquare, Square } from 'lucide-react';
import { Assessment } from '../../../types';

interface Props {
  assessments: Assessment[];
  onAdd: () => void;
  onEdit: (a: Assessment) => void;
  onBulkDelete: (ids: string[]) => void;
}

export const AssessmentsTab: React.FC<Props> = ({ assessments, onAdd, onEdit, onBulkDelete }) => {
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());

  const toggleAll = () => {
    if (selectedIds.size === assessments.length) {
      setSelectedIds(new Set());
    } else {
      setSelectedIds(new Set(assessments.map(a => a.id)));
    }
  };

  const toggleOne = (id: string) => {
    const next = new Set(selectedIds);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    setSelectedIds(next);
  };

  const handleBulkDelete = () => {
    if (confirm(`Delete ${selectedIds.size} assessments?`)) {
      onBulkDelete(Array.from(selectedIds));
      setSelectedIds(new Set());
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <h2 className="text-xl font-bold text-gray-900">Assessments</h2>
        <div className="flex gap-2">
          {selectedIds.size > 0 && (
            <button 
              onClick={handleBulkDelete}
              className="flex items-center gap-2 px-4 py-2 bg-red-50 text-red-600 border border-red-100 rounded-xl text-sm font-bold hover:bg-red-100 transition animate-in fade-in"
            >
              <Trash2 className="w-4 h-4" /> Delete ({selectedIds.size})
            </button>
          )}
          <button onClick={onAdd} className="flex items-center gap-2 px-6 py-2 bg-blue-600 text-white rounded-xl text-sm font-bold hover:bg-blue-700 transition shadow-lg shadow-blue-200">
            <Plus className="w-4 h-4" /> Create Assessment
          </button>
        </div>
      </div>

      <div className="bg-white rounded-3xl border border-slate-200 overflow-hidden shadow-sm">
        <table className="w-full text-left border-collapse">
          <thead className="bg-slate-50 border-b border-slate-200">
            <tr>
              <th className="px-6 py-4 w-12">
                <button onClick={toggleAll} className="text-slate-400 hover:text-slate-600">
                  {assessments.length > 0 && selectedIds.size === assessments.length ? <CheckSquare className="w-5 h-5 text-blue-600" /> : <Square className="w-5 h-5" />}
                </button>
              </th>
              <th className="px-6 py-4 text-[10px] font-bold text-slate-400 uppercase tracking-widest">Name</th>
              <th className="px-6 py-4 text-[10px] font-bold text-slate-400 uppercase tracking-widest">Config</th>
              <th className="px-6 py-4 text-[10px] font-bold text-slate-400 uppercase tracking-widest text-right">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {assessments.map(a => (
              <tr key={a.id} className={`hover:bg-slate-50 transition ${selectedIds.has(a.id) ? 'bg-blue-50/30' : ''}`}>
                <td className="px-6 py-4">
                  <button onClick={() => toggleOne(a.id)} className="text-slate-400 hover:text-slate-600">
                    {selectedIds.has(a.id) ? <CheckSquare className="w-5 h-5 text-blue-600" /> : <Square className="w-5 h-5" />}
                  </button>
                </td>
                <td className="px-6 py-4">
                  <span className="block font-bold text-slate-900 text-sm">{a.name}</span>
                  <div className="flex gap-3 mt-1">
                    <span className="flex items-center gap-1 text-[10px] font-medium text-slate-500 bg-slate-100 px-1.5 py-0.5 rounded"><Clock className="w-3 h-3" /> {a.duration_minutes}m</span>
                    <span className="flex items-center gap-1 text-[10px] font-medium text-slate-500 bg-slate-100 px-1.5 py-0.5 rounded"><ListChecks className="w-3 h-3" /> {a.questions.length} Qs</span>
                  </div>
                </td>
                <td className="px-6 py-4">
                  <div className="flex items-center gap-2">
                    <Server className="w-4 h-4 text-slate-400" />
                    <span className="text-xs font-bold text-slate-600">{a.db_config?.database_name}</span>
                  </div>
                </td>
                <td className="px-6 py-4 text-right">
                  <button onClick={() => onEdit(a)} className="p-2 text-slate-400 hover:text-blue-600 hover:bg-blue-50 rounded-lg transition">
                    <Settings className="w-4 h-4" />
                  </button>
                </td>
              </tr>
            ))}
            {assessments.length === 0 && (
              <tr>
                <td colSpan={4} className="px-6 py-12 text-center text-slate-400 text-sm italic">No assessments found.</td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
};
