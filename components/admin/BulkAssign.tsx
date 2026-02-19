
import React, { useState } from 'react';
import { UserCheck } from 'lucide-react';
import { Assessment } from '../../types';

interface Props {
  assessments: Assessment[];
  onAssign: (assessmentId: string, emails: string[]) => void;
  onCancel: () => void;
}

export const BulkAssign: React.FC<Props> = ({ assessments, onAssign, onCancel }) => {
  const [selectedAssessmentId, setSelectedAssessmentId] = useState('');
  const [emails, setEmails] = useState('');

  const handleAssign = () => {
    const emailList = emails.split(/[\n,]+/).map(e => e.trim()).filter(e => e !== '');
    if (selectedAssessmentId && emailList.length > 0) {
      onAssign(selectedAssessmentId, emailList);
    }
  };

  return (
    <div className="space-y-6">
      <div>
        <label className="block text-xs font-bold text-slate-400 uppercase tracking-widest mb-2">Target Assessment</label>
        <select 
          value={selectedAssessmentId} 
          onChange={e => setSelectedAssessmentId(e.target.value)}
          className="w-full p-3 bg-blue-50 border border-blue-200 rounded-xl outline-none font-bold text-blue-700"
        >
          <option value="">Select Assessment...</option>
          {assessments.map(a => <option key={a.id} value={a.id}>{a.name}</option>)}
        </select>
      </div>
      <div>
        <label className="block text-xs font-bold text-slate-400 uppercase tracking-widest mb-2">Participant Emails</label>
        <textarea 
          value={emails}
          onChange={e => setEmails(e.target.value)}
          placeholder="john.doe@company.com&#10;jane.smith@company.com"
          className="w-full p-4 bg-slate-50 border border-slate-200 rounded-2xl h-48 outline-none text-sm font-mono"
        ></textarea>
        <p className="text-[10px] text-slate-400 mt-2">Separate emails by new line or comma.</p>
      </div>
      <div className="flex gap-4 pt-4">
        <button onClick={onCancel} className="flex-1 py-3 bg-slate-100 rounded-xl font-bold text-slate-600">Cancel</button>
        <button onClick={handleAssign} className="flex-1 py-3 bg-slate-900 text-white rounded-xl font-bold flex items-center justify-center gap-2 hover:bg-slate-800">
          <UserCheck className="w-4 h-4" /> Assign Users
        </button>
      </div>
    </div>
  );
};
