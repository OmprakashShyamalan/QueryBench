
import React, { useState } from 'react';
import { Calendar, CheckCircle, Clock, User, AlertCircle } from 'lucide-react';
import { Assignment } from '../../types';

interface Props {
  assignment: Assignment & { user_name: string; user_email: string };
  onSave: (updated: Assignment) => void;
  onCancel: () => void;
}

export const AssignmentEditor: React.FC<Props> = ({ assignment, onSave, onCancel }) => {
  const [data, setData] = useState(assignment);

  return (
    <div className="space-y-6">
      <div className="bg-slate-50 p-4 rounded-2xl border border-slate-100 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="p-2 bg-white rounded-lg border border-slate-200 shadow-sm text-slate-400">
            <User className="w-5 h-5" />
          </div>
          <div>
            <p className="text-sm font-bold text-slate-900">{data.user_name}</p>
            <p className="text-xs text-slate-500 font-mono">{data.user_email}</p>
          </div>
        </div>
        <div className="text-right">
           <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Assessment</p>
           <p className="text-xs font-bold text-blue-600">{data.assessment.name}</p>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-4">
        <div>
          <label className="block text-xs font-bold text-slate-400 uppercase tracking-widest mb-2 flex items-center gap-2">
            <Calendar className="w-3.5 h-3.5" /> Due Date
          </label>
          <input 
            type="date" 
            value={data.due_date} 
            onChange={e => setData({...data, due_date: e.target.value})}
            className="w-full p-3 bg-white border border-slate-200 rounded-xl outline-none font-medium text-slate-700" 
          />
        </div>
        <div>
          <label className="block text-xs font-bold text-slate-400 uppercase tracking-widest mb-2 flex items-center gap-2">
            <Clock className="w-3.5 h-3.5" /> Status
          </label>
          <select 
            value={data.status} 
            onChange={e => setData({...data, status: e.target.value as any})}
            className="w-full p-3 bg-white border border-slate-200 rounded-xl outline-none font-bold text-slate-700"
          >
            <option value="PENDING">Pending</option>
            <option value="IN_PROGRESS">In Progress</option>
            <option value="COMPLETED">Completed</option>
            <option value="EXPIRED">Expired</option>
          </select>
        </div>
      </div>

      <div className="bg-blue-50 p-4 rounded-xl border border-blue-100 flex gap-3 items-start">
         <AlertCircle className="w-5 h-5 text-blue-600 shrink-0 mt-0.5" />
         <p className="text-xs text-blue-700 leading-relaxed">
           Changing the status to <strong>COMPLETED</strong> will prevent further attempts. Extending the due date allows a user to retry if attempts remain.
         </p>
      </div>

      <div className="flex gap-4 pt-2">
        <button onClick={onCancel} className="flex-1 py-3 bg-slate-100 rounded-xl font-bold text-slate-600 hover:bg-slate-200">Cancel</button>
        <button onClick={() => onSave(data)} className="flex-1 py-3 bg-slate-900 text-white rounded-xl font-bold flex items-center justify-center gap-2 hover:bg-slate-800 shadow-lg">
          <CheckCircle className="w-4 h-4" /> Save Changes
        </button>
      </div>
    </div>
  );
};
