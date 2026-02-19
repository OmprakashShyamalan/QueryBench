
import React, { useState } from 'react';
import { UserCheck, Clock, CheckCircle, AlertCircle, Settings, Trash2, CheckSquare, Square, RefreshCcw } from 'lucide-react';
import { Assignment } from '../../../types';

interface AssignmentWithMeta extends Assignment {
  user_name: string;
  user_email: string;
}

interface Props {
  assignments: AssignmentWithMeta[];
  onBulkAssign: () => void;
  onEdit: (assignment: AssignmentWithMeta) => void;
  onBulkDelete: (ids: string[]) => void;
  onBulkStatusUpdate: (ids: string[], status: 'PENDING' | 'IN_PROGRESS' | 'COMPLETED' | 'EXPIRED') => void;
}

export const AssignmentsTab: React.FC<Props> = ({ assignments, onBulkAssign, onEdit, onBulkDelete, onBulkStatusUpdate }) => {
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());

  const toggleAll = () => {
    if (selectedIds.size === assignments.length) {
      setSelectedIds(new Set());
    } else {
      setSelectedIds(new Set(assignments.map(a => a.id)));
    }
  };

  const toggleOne = (id: string) => {
    const next = new Set(selectedIds);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    setSelectedIds(next);
  };

  const handleBulkStatus = (status: 'PENDING' | 'IN_PROGRESS' | 'COMPLETED' | 'EXPIRED') => {
    onBulkStatusUpdate(Array.from(selectedIds), status);
    setSelectedIds(new Set());
  };

  const handleBulkDelete = () => {
    if (confirm(`Delete ${selectedIds.size} assignments?`)) {
      onBulkDelete(Array.from(selectedIds));
      setSelectedIds(new Set());
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
         <h2 className="text-xl font-bold text-gray-900">Active Assignments</h2>
         <div className="flex gap-3">
           {selectedIds.size > 0 ? (
             <div className="flex gap-2 animate-in fade-in">
               <button 
                onClick={handleBulkDelete}
                className="flex items-center gap-2 px-3 py-2 bg-red-50 text-red-600 border border-red-100 rounded-xl text-xs font-bold hover:bg-red-100 transition"
               >
                 <Trash2 className="w-3.5 h-3.5" /> Delete ({selectedIds.size})
               </button>
               <div className="h-auto w-px bg-slate-200 mx-1"></div>
               <button onClick={() => handleBulkStatus('PENDING')} className="px-3 py-2 bg-slate-100 text-slate-600 rounded-xl text-xs font-bold hover:bg-slate-200">Set Pending</button>
               <button onClick={() => handleBulkStatus('COMPLETED')} className="px-3 py-2 bg-emerald-50 text-emerald-600 border border-emerald-100 rounded-xl text-xs font-bold hover:bg-emerald-100">Set Completed</button>
             </div>
           ) : (
             <button 
              onClick={onBulkAssign}
              className="flex items-center gap-2 px-6 py-2 bg-slate-900 text-white rounded-xl text-sm font-bold hover:bg-slate-800 transition shadow-lg shadow-slate-200"
             >
               <UserCheck className="w-4 h-4" /> Bulk Assign
             </button>
           )}
         </div>
      </div>
      <div className="bg-white rounded-3xl border border-slate-200 overflow-hidden shadow-sm">
        <table className="w-full text-left border-collapse">
          <thead className="bg-slate-50 border-b border-slate-200">
            <tr>
              <th className="px-6 py-4 w-12">
                <button onClick={toggleAll} className="text-slate-400 hover:text-slate-600">
                  {assignments.length > 0 && selectedIds.size === assignments.length ? <CheckSquare className="w-5 h-5 text-blue-600" /> : <Square className="w-5 h-5" />}
                </button>
              </th>
              <th className="px-6 py-4 text-[10px] font-bold text-slate-400 uppercase tracking-widest">Participant</th>
              <th className="px-6 py-4 text-[10px] font-bold text-slate-400 uppercase tracking-widest">Assessment</th>
              <th className="px-6 py-4 text-[10px] font-bold text-slate-400 uppercase tracking-widest">Due Date</th>
              <th className="px-6 py-4 text-[10px] font-bold text-slate-400 uppercase tracking-widest">Status</th>
              <th className="px-6 py-4 text-[10px] font-bold text-slate-400 uppercase tracking-widest text-right">Edit</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {assignments.map(as => (
              <tr key={as.id} className={`hover:bg-slate-50 transition ${selectedIds.has(as.id) ? 'bg-blue-50/30' : ''}`}>
                <td className="px-6 py-4">
                  <button onClick={() => toggleOne(as.id)} className="text-slate-400 hover:text-slate-600">
                    {selectedIds.has(as.id) ? <CheckSquare className="w-5 h-5 text-blue-600" /> : <Square className="w-5 h-5" />}
                  </button>
                </td>
                <td className="px-6 py-4">
                  <p className="font-bold text-slate-900 text-sm">{as.user_name}</p>
                  <p className="text-[10px] text-slate-400 font-mono">{as.user_email}</p>
                </td>
                <td className="px-6 py-4">
                  <span className="text-xs font-bold text-blue-600 bg-blue-50 px-2 py-1 rounded border border-blue-100">{as.assessment.name}</span>
                </td>
                <td className="px-6 py-4">
                  <span className="text-xs text-slate-500 font-mono flex items-center gap-1">
                    <Clock className="w-3 h-3" /> {as.due_date}
                  </span>
                </td>
                <td className="px-6 py-4">
                   <span className={`text-[10px] font-bold px-2 py-1 rounded-lg flex items-center gap-1.5 w-fit ${
                     as.status === 'COMPLETED' ? 'bg-emerald-50 text-emerald-600 border border-emerald-100' : 
                     as.status === 'PENDING' ? 'bg-slate-100 text-slate-500 border border-slate-200' :
                     'bg-amber-50 text-amber-600 border border-amber-100'
                   }`}>
                    {as.status === 'COMPLETED' ? <CheckCircle className="w-3 h-3" /> : as.status === 'IN_PROGRESS' ? <RefreshCcw className="w-3 h-3" /> : <AlertCircle className="w-3 h-3" />}
                    {as.status}
                   </span>
                </td>
                <td className="px-6 py-4 text-right">
                   <button 
                     onClick={() => onEdit(as)}
                     className="p-2 text-slate-400 hover:text-blue-600 hover:bg-blue-50 rounded-lg transition"
                   >
                     <Settings className="w-4 h-4" />
                   </button>
                </td>
              </tr>
            ))}
            {assignments.length === 0 && (
              <tr>
                <td colSpan={6} className="px-6 py-12 text-center text-slate-400 text-sm italic">No active assignments.</td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
};
