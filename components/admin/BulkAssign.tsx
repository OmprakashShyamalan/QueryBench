
import React, { useState } from 'react';
import { UserCheck, Search, CheckSquare, Square } from 'lucide-react';
import { Assessment } from '../../types';
import { ApiParticipant } from '../../services/api';

interface Props {
  assessments: Assessment[];
  users: ApiParticipant[];
  onAssign: (assessmentId: string, userIds: number[]) => void;
  onCancel: () => void;
}

export const BulkAssign: React.FC<Props> = ({ assessments, users, onAssign, onCancel }) => {
  const [selectedAssessmentId, setSelectedAssessmentId] = useState('');
  const [selectedUserIds, setSelectedUserIds] = useState<Set<number>>(new Set());
  const [search, setSearch] = useState('');

  // Only show participants, not admins
  const participants = users.filter(u => u.role === 'PARTICIPANT');
  const filtered = participants.filter(u =>
    !search ||
    u.name.toLowerCase().includes(search.toLowerCase()) ||
    u.username.toLowerCase().includes(search.toLowerCase()) ||
    u.email.toLowerCase().includes(search.toLowerCase())
  );

  const toggleUser = (id: number) => {
    const next = new Set(selectedUserIds);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    setSelectedUserIds(next);
  };

  const toggleAll = () => {
    if (selectedUserIds.size === filtered.length && filtered.length > 0) {
      setSelectedUserIds(new Set());
    } else {
      setSelectedUserIds(new Set(filtered.map(u => u.id)));
    }
  };

  const handleAssign = () => {
    if (selectedAssessmentId && selectedUserIds.size > 0) {
      onAssign(selectedAssessmentId, Array.from(selectedUserIds));
    }
  };

  const allSelected = filtered.length > 0 && selectedUserIds.size === filtered.length;

  return (
    <div className="space-y-5">
      {/* Assessment selector */}
      <div>
        <label className="block text-xs font-bold text-slate-400 uppercase tracking-widest mb-2">Target Assessment</label>
        <select
          value={selectedAssessmentId}
          onChange={e => setSelectedAssessmentId(e.target.value)}
          className="w-full p-3 bg-blue-50 border border-blue-200 rounded-xl outline-none font-bold text-blue-700 text-sm"
        >
          <option value="">Select Assessment...</option>
          {assessments.map(a => <option key={a.id} value={a.id}>{a.name}</option>)}
        </select>
      </div>

      {/* User picker */}
      <div>
        <div className="flex items-center justify-between mb-2">
          <label className="text-xs font-bold text-slate-400 uppercase tracking-widest">
            Select Participants
            {selectedUserIds.size > 0 && (
              <span className="ml-2 px-2 py-0.5 bg-blue-100 text-blue-700 rounded-full text-[10px]">
                {selectedUserIds.size} selected
              </span>
            )}
          </label>
        </div>

        {/* Search */}
        <div className="relative mb-2">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-slate-400" />
          <input
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Search by name, username, or email..."
            className="w-full pl-9 pr-3 py-2.5 bg-slate-50 border border-slate-200 rounded-xl outline-none text-sm"
          />
        </div>

        {participants.length === 0 ? (
          <div className="py-8 text-center text-sm text-slate-400 bg-slate-50 rounded-xl border border-slate-200">
            No participants found. Add users in the <strong>Users</strong> tab first.
          </div>
        ) : (
          <div className="border border-slate-200 rounded-xl overflow-hidden">
            {/* Select all row */}
            <div
              className="flex items-center gap-3 px-4 py-2.5 bg-slate-50 border-b border-slate-200 cursor-pointer hover:bg-slate-100 transition"
              onClick={toggleAll}
            >
              {allSelected
                ? <CheckSquare className="w-4 h-4 text-blue-600 shrink-0" />
                : <Square className="w-4 h-4 text-slate-400 shrink-0" />}
              <span className="text-xs font-bold text-slate-500">
                {allSelected ? 'Deselect all' : `Select all (${filtered.length})`}
              </span>
            </div>

            {/* User list */}
            <div className="max-h-52 overflow-y-auto divide-y divide-slate-100">
              {filtered.length === 0 ? (
                <div className="py-6 text-center text-sm text-slate-400">No users match your search.</div>
              ) : (
                filtered.map(u => (
                  <div
                    key={u.id}
                    onClick={() => toggleUser(u.id)}
                    className={`flex items-center gap-3 px-4 py-3 cursor-pointer transition ${selectedUserIds.has(u.id) ? 'bg-blue-50' : 'hover:bg-slate-50'}`}
                  >
                    {selectedUserIds.has(u.id)
                      ? <CheckSquare className="w-4 h-4 text-blue-600 shrink-0" />
                      : <Square className="w-4 h-4 text-slate-400 shrink-0" />}
                    <div className="min-w-0">
                      <p className="text-sm font-medium text-slate-900 truncate">{u.name}</p>
                      <p className="text-[11px] text-slate-400 truncate">
                        @{u.username}{u.email ? ` · ${u.email}` : ''}
                      </p>
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>
        )}
      </div>

      <div className="flex gap-4 pt-2">
        <button onClick={onCancel} className="flex-1 py-3 bg-slate-100 rounded-xl font-bold text-slate-600">
          Cancel
        </button>
        <button
          onClick={handleAssign}
          disabled={!selectedAssessmentId || selectedUserIds.size === 0}
          className="flex-1 py-3 bg-slate-900 text-white rounded-xl font-bold flex items-center justify-center gap-2 hover:bg-slate-800 disabled:opacity-40 disabled:cursor-not-allowed transition"
        >
          <UserCheck className="w-4 h-4" />
          Assign {selectedUserIds.size > 0 ? `(${selectedUserIds.size})` : 'Users'}
        </button>
      </div>
    </div>
  );
};
