
import React, { useState, useRef } from 'react';
import { UserCheck, Search, CheckSquare, Square, Calendar, Upload, ClipboardList, AlertCircle, CheckCircle } from 'lucide-react';
import { Assessment } from '../../types';
import { ApiParticipant } from '../../services/api';
import { assignmentsTextApi } from '../../services/api';

interface Props {
  assessments: Assessment & { _id: number }[];
  users: ApiParticipant[];
  onAssign: (assessmentId: string, userIds: number[], dueDate: string) => void;
  onCancel: () => void;
}

const getDefaultDueDate = () => new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];

export const BulkAssign: React.FC<Props> = ({ assessments, users, onAssign, onCancel }) => {
  const [mode, setMode] = useState<'pick' | 'text'>('text');
  const [selectedAssessmentId, setSelectedAssessmentId] = useState('');
  const [dueDate, setDueDate] = useState(getDefaultDueDate);

  // ── Pick-from-list mode ──────────────────────────────────────────────────
  const [selectedUserIds, setSelectedUserIds] = useState<Set<number>>(new Set());
  const [search, setSearch] = useState('');

  const participants = users.filter(u => u.role === 'PARTICIPANT');
  const filtered = participants.filter(u =>
    !search ||
    u.name.toLowerCase().includes(search.toLowerCase()) ||
    u.username.toLowerCase().includes(search.toLowerCase()) ||
    u.email.toLowerCase().includes(search.toLowerCase())
  );
  const allSelected = filtered.length > 0 && selectedUserIds.size === filtered.length;

  const toggleUser = (id: number) => {
    const next = new Set(selectedUserIds);
    if (next.has(id)) next.delete(id); else next.add(id);
    setSelectedUserIds(next);
  };
  const toggleAll = () => {
    if (allSelected) setSelectedUserIds(new Set());
    else setSelectedUserIds(new Set(filtered.map(u => u.id)));
  };

  // ── Text / file mode ─────────────────────────────────────────────────────
  const [rawText, setRawText] = useState('');
  const [textLoading, setTextLoading] = useState(false);
  const [textResult, setTextResult] = useState<{ created: number; errors: { identifier: string; error: string }[] } | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = ev => setRawText(ev.target?.result as string ?? '');
    reader.readAsText(file);
    e.target.value = '';
  };

  const parseIdentifiers = (text: string): string[] =>
    text
      .split(/[\n,]+/)
      .map(s => s.trim())
      .filter(Boolean);

  const handleTextAssign = async () => {
    const identifiers = parseIdentifiers(rawText);
    if (!selectedAssessmentId || identifiers.length === 0 || !dueDate) return;

    const assessment = assessments.find(a => a.id === selectedAssessmentId);
    if (!assessment) return;

    setTextLoading(true);
    setTextResult(null);
    try {
      const res = await assignmentsTextApi.bulkAssignByText(assessment._id, identifiers, dueDate);
      setTextResult({ created: res.created.length, errors: res.errors });
      if (res.errors.length === 0) {
        setTimeout(onCancel, 1200);
      }
    } catch (e: unknown) {
      alert(e instanceof Error ? e.message : 'Failed to assign.');
    } finally {
      setTextLoading(false);
    }
  };

  // ── Shared header ────────────────────────────────────────────────────────
  const sharedHeader = (
    <div className="space-y-4">
      <div>
        <label className="block text-xs font-bold text-slate-400 uppercase tracking-widest mb-2">Target Assessment</label>
        <select
          name="assessment_id"
          value={selectedAssessmentId}
          onChange={e => setSelectedAssessmentId(e.target.value)}
          className="w-full p-3 bg-blue-50 border border-blue-200 rounded-xl outline-none font-bold text-blue-700 text-sm"
        >
          <option value="">Select Assessment...</option>
          {assessments.map(a => <option key={a.id} value={a.id}>{a.name}</option>)}
        </select>
      </div>

      <div>
        <label className="block text-xs font-bold text-slate-400 uppercase tracking-widest mb-2 flex items-center gap-1.5">
          <Calendar className="w-3.5 h-3.5" /> Due Date
        </label>
        <input
          name="due_date"
          type="date"
          value={dueDate}
          min={new Date().toISOString().split('T')[0]}
          onChange={e => setDueDate(e.target.value)}
          className="w-full p-3 bg-white border border-slate-200 rounded-xl outline-none text-sm font-medium text-slate-700"
        />
      </div>

      {/* Mode toggle */}
      <div className="flex gap-1 bg-slate-100 p-1 rounded-xl">
        <button
          onClick={() => setMode('text')}
          className={`flex-1 py-2 rounded-lg text-xs font-bold flex items-center justify-center gap-1.5 transition-all ${mode === 'text' ? 'bg-white text-slate-800 shadow-sm' : 'text-slate-400 hover:text-slate-600'}`}
        >
          <ClipboardList className="w-3.5 h-3.5" /> Paste / Upload
        </button>
        <button
          onClick={() => setMode('pick')}
          className={`flex-1 py-2 rounded-lg text-xs font-bold flex items-center justify-center gap-1.5 transition-all ${mode === 'pick' ? 'bg-white text-slate-800 shadow-sm' : 'text-slate-400 hover:text-slate-600'}`}
        >
          <Search className="w-3.5 h-3.5" /> Pick from List
        </button>
      </div>
    </div>
  );

  // ── Text mode UI ─────────────────────────────────────────────────────────
  if (mode === 'text') {
    const identifiers = parseIdentifiers(rawText);
    return (
      <div className="space-y-5">
        {sharedHeader}

        <div>
          <div className="flex items-center justify-between mb-2">
            <label className="text-xs font-bold text-slate-400 uppercase tracking-widest">
              Usernames or Emails
              {identifiers.length > 0 && (
                <span className="ml-2 px-2 py-0.5 bg-blue-100 text-blue-700 rounded-full text-[10px]">
                  {identifiers.length} found
                </span>
              )}
            </label>
            <button
              onClick={() => fileRef.current?.click()}
              className="flex items-center gap-1.5 text-[11px] font-bold text-slate-500 hover:text-blue-600 bg-slate-100 hover:bg-blue-50 px-3 py-1.5 rounded-lg transition"
            >
              <Upload className="w-3.5 h-3.5" /> Upload .txt / .csv
            </button>
            <input ref={fileRef} type="file" accept=".txt,.csv" className="hidden" onChange={handleFileUpload} />
          </div>
          <textarea
            name="identifiers"
            value={rawText}
            onChange={e => { setRawText(e.target.value); setTextResult(null); }}
            placeholder={`Enter one per line or comma-separated:\n\njohn.doe\njane.smith@company.com\nbob, alice@example.com`}
            className="w-full p-4 bg-slate-50 border border-slate-200 rounded-xl outline-none text-sm font-mono leading-relaxed h-40 resize-none"
          />
          <p className="text-[11px] text-slate-400 mt-1">Accepts usernames or email addresses — comma, newline, or mixed.</p>
        </div>

        {textResult && (
          <div className={`p-4 rounded-xl border text-sm space-y-1 ${textResult.errors.length === 0 ? 'bg-emerald-50 border-emerald-200' : 'bg-amber-50 border-amber-200'}`}>
            <p className="flex items-center gap-2 font-bold text-slate-800">
              <CheckCircle className="w-4 h-4 text-emerald-600" /> {textResult.created} assignment{textResult.created !== 1 ? 's' : ''} created
            </p>
            {textResult.errors.map((e, i) => (
              <p key={i} className="flex items-start gap-2 text-amber-800 text-xs">
                <AlertCircle className="w-3.5 h-3.5 shrink-0 mt-0.5 text-amber-600" />
                <span><strong>{e.identifier}</strong>: {e.error}</span>
              </p>
            ))}
          </div>
        )}

        <div className="flex gap-4 pt-2">
          <button onClick={onCancel} className="flex-1 py-3 bg-slate-100 rounded-xl font-bold text-slate-600">Cancel</button>
          <button
            onClick={handleTextAssign}
            disabled={!selectedAssessmentId || identifiers.length === 0 || !dueDate || textLoading}
            className="flex-1 py-3 bg-slate-900 text-white rounded-xl font-bold flex items-center justify-center gap-2 hover:bg-slate-800 disabled:opacity-40 disabled:cursor-not-allowed transition"
          >
            <UserCheck className="w-4 h-4" />
            {textLoading ? 'Assigning...' : `Assign ${identifiers.length > 0 ? `(${identifiers.length})` : 'Users'}`}
          </button>
        </div>
      </div>
    );
  }

  // ── Pick-from-list mode UI ────────────────────────────────────────────────
  return (
    <div className="space-y-5">
      {sharedHeader}

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
            <div className="flex items-center gap-3 px-4 py-2.5 bg-slate-50 border-b border-slate-200 cursor-pointer hover:bg-slate-100 transition" onClick={toggleAll}>
              {allSelected ? <CheckSquare className="w-4 h-4 text-blue-600 shrink-0" /> : <Square className="w-4 h-4 text-slate-400 shrink-0" />}
              <span className="text-xs font-bold text-slate-500">
                {allSelected ? 'Deselect all' : `Select all (${filtered.length})`}
              </span>
            </div>
            <div className="max-h-52 overflow-y-auto divide-y divide-slate-100">
              {filtered.length === 0 ? (
                <div className="py-6 text-center text-sm text-slate-400">No users match your search.</div>
              ) : filtered.map(u => (
                <div
                  key={u.id}
                  onClick={() => toggleUser(u.id)}
                  className={`flex items-center gap-3 px-4 py-3 cursor-pointer transition ${selectedUserIds.has(u.id) ? 'bg-blue-50' : 'hover:bg-slate-50'}`}
                >
                  {selectedUserIds.has(u.id) ? <CheckSquare className="w-4 h-4 text-blue-600 shrink-0" /> : <Square className="w-4 h-4 text-slate-400 shrink-0" />}
                  <div className="min-w-0">
                    <p className="text-sm font-medium text-slate-900 truncate">{u.name}</p>
                    <p className="text-[11px] text-slate-400 truncate">@{u.username}{u.email ? ` · ${u.email}` : ''}</p>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>

      <div className="flex gap-4 pt-2">
        <button onClick={onCancel} className="flex-1 py-3 bg-slate-100 rounded-xl font-bold text-slate-600">Cancel</button>
        <button
          onClick={() => selectedAssessmentId && selectedUserIds.size > 0 && dueDate && onAssign(selectedAssessmentId, Array.from(selectedUserIds), dueDate)}
          disabled={!selectedAssessmentId || selectedUserIds.size === 0 || !dueDate}
          className="flex-1 py-3 bg-slate-900 text-white rounded-xl font-bold flex items-center justify-center gap-2 hover:bg-slate-800 disabled:opacity-40 disabled:cursor-not-allowed transition"
        >
          <UserCheck className="w-4 h-4" />
          Assign {selectedUserIds.size > 0 ? `(${selectedUserIds.size})` : 'Users'}
        </button>
      </div>
    </div>
  );
};
