
import React, { useState, useMemo } from 'react';
import {
  Download, Trophy, FileOutput, Search, Filter,
  CheckSquare, Square, X, Calendar, Loader2,
  CheckCircle, AlertCircle, MinusCircle, ChevronDown, ChevronRight, Clock,
} from 'lucide-react';
import { ApiResult, ApiResultHistoryItem, ApiAttemptDetail, attemptsApi } from '../../../services/api';

interface QuestionRef {
  _id: number;
  title: string;
}

interface Props {
  results: ApiResult[];
  questions?: QuestionRef[];
}

interface DetailState {
  open: boolean;
  loading: boolean;
  result: ApiResult | null;
  attemptId: number | null;
  detail: ApiAttemptDetail | null;
  error: string | null;
}

function StatusBadge({ status, score }: { status: string; score: number | null }) {
  if (status === 'PASSED') return (
    <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg text-xs font-bold bg-green-50 text-green-700 border border-green-100">
      <Trophy className="w-3 h-3" /> {score != null ? `${score}%` : '—'}
    </span>
  );
  if (status === 'FAILED') return (
    <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg text-xs font-bold bg-red-50 text-red-700 border border-red-100">
      <Trophy className="w-3 h-3" /> {score != null ? `${score}%` : '—'}
    </span>
  );
  return (
    <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg text-xs font-bold bg-slate-100 text-slate-500 border border-slate-200">
      <MinusCircle className="w-3 h-3" /> Pending
    </span>
  );
}

export const ResultsTab: React.FC<Props> = ({ results, questions = [] }) => {
  const [searchTerm, setSearchTerm] = useState('');
  const [assessmentFilter, setAssessmentFilter] = useState('');
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [expandedIds, setExpandedIds] = useState<Set<string>>(new Set());
  const [detailState, setDetailState] = useState<DetailState>({
    open: false, loading: false, result: null, attemptId: null, detail: null, error: null,
  });

  const uniqueAssessments = Array.from(new Set(results.map(r => r.assessment_name)));

  const filteredData = useMemo(() => results.filter(r => {
    const matchesSearch =
      r.participant_name.toLowerCase().includes(searchTerm.toLowerCase()) ||
      r.participant_email.toLowerCase().includes(searchTerm.toLowerCase());
    const matchesAssessment = assessmentFilter ? r.assessment_name === assessmentFilter : true;
    return matchesSearch && matchesAssessment;
  }), [results, searchTerm, assessmentFilter]);

  const toggleAll = () => {
    if (selectedIds.size === filteredData.length && filteredData.length > 0) {
      setSelectedIds(new Set());
    } else {
      setSelectedIds(new Set(filteredData.map(r => String(r.id))));
    }
  };

  const toggleOne = (id: string) => {
    const next = new Set(selectedIds);
    if (next.has(id)) next.delete(id); else next.add(id);
    setSelectedIds(next);
  };

  const toggleExpand = (id: string) => {
    const next = new Set(expandedIds);
    if (next.has(id)) next.delete(id); else next.add(id);
    setExpandedIds(next);
  };

  const handleViewDetails = async (result: ApiResult, attemptId: number) => {
    setDetailState({ open: true, loading: true, result, attemptId, detail: null, error: null });
    try {
      const detail = await attemptsApi.get(attemptId);
      setDetailState(prev => ({ ...prev, loading: false, detail }));
    } catch (e: unknown) {
      setDetailState(prev => ({ ...prev, loading: false, error: e instanceof Error ? e.message : 'Failed to load details.' }));
    }
  };

  const closeDetail = () => setDetailState({ open: false, loading: false, result: null, attemptId: null, detail: null, error: null });

  const handleExport = () => {
    const rowsToExport = selectedIds.size > 0
      ? results.filter(r => selectedIds.has(String(r.id)))
      : filteredData;
    const csv = [
      ['Participant', 'Email', 'Assessment', 'Best Score', 'Status', 'Date', 'Total Attempts'],
      ...rowsToExport.map(r => [
        r.participant_name, r.participant_email, r.assessment_name,
        r.score ?? '', r.result_status, r.submitted_date ?? '', r.attempts_count,
      ]),
    ].map(row => row.join(',')).join('\n');
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement('a');
    link.href = URL.createObjectURL(blob);
    link.download = `assessment_results_${new Date().toISOString().split('T')[0]}.csv`;
    link.click();
  };

  const exportLabel = selectedIds.size > 0
    ? `Export Selected (${selectedIds.size})`
    : (searchTerm || assessmentFilter) ? `Export Filtered (${filteredData.length})` : `Export All (${results.length})`;

  return (
    <div className="space-y-6">
      {/* Toolbar */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <h2 className="text-xl font-bold text-gray-900">Assessment Results</h2>
        <button
          onClick={handleExport}
          className="flex items-center gap-2 px-4 py-2 bg-slate-100 text-slate-600 rounded-xl text-sm font-bold border border-slate-200 hover:bg-slate-200 transition shadow-sm"
        >
          <Download className="w-4 h-4" /> {exportLabel}
        </button>
      </div>

      {/* Filter bar */}
      <div className="bg-white p-4 rounded-2xl border border-slate-200 shadow-sm flex flex-col md:flex-row gap-4 items-center">
        <div className="relative flex-1 w-full">
          <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
          <input
            type="text"
            placeholder="Search participants..."
            value={searchTerm}
            onChange={e => setSearchTerm(e.target.value)}
            className="w-full pl-9 pr-4 py-2 bg-slate-50 border border-slate-200 rounded-xl text-sm font-medium outline-none focus:ring-2 focus:ring-blue-100 transition"
          />
        </div>
        <div className="relative w-full md:w-64">
          <Filter className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
          <select
            value={assessmentFilter}
            onChange={e => setAssessmentFilter(e.target.value)}
            className="w-full pl-9 pr-8 py-2 bg-slate-50 border border-slate-200 rounded-xl text-sm font-bold text-slate-600 outline-none appearance-none cursor-pointer"
          >
            <option value="">All Assessments</option>
            {uniqueAssessments.map(a => <option key={a} value={a}>{a}</option>)}
          </select>
        </div>
        {(searchTerm || assessmentFilter) && (
          <button
            onClick={() => { setSearchTerm(''); setAssessmentFilter(''); }}
            className="p-2 text-slate-400 hover:text-slate-600 hover:bg-slate-100 rounded-lg transition"
          >
            <X className="w-4 h-4" />
          </button>
        )}
      </div>

      {/* Table */}
      <div className="bg-white rounded-3xl border border-slate-200 overflow-hidden shadow-sm">
        <table className="w-full text-left border-collapse">
          <thead className="bg-slate-50 border-b border-slate-200">
            <tr>
              <th className="px-6 py-4 w-12">
                <button onClick={toggleAll} className="text-slate-400 hover:text-slate-600">
                  {filteredData.length > 0 && selectedIds.size === filteredData.length
                    ? <CheckSquare className="w-5 h-5 text-blue-600" />
                    : <Square className="w-5 h-5" />}
                </button>
              </th>
              <th className="px-6 py-4 text-[10px] font-bold text-slate-400 uppercase tracking-widest">Participant</th>
              <th className="px-6 py-4 text-[10px] font-bold text-slate-400 uppercase tracking-widest">Assessment</th>
              <th className="px-6 py-4 text-[10px] font-bold text-slate-400 uppercase tracking-widest">Best Score</th>
              <th className="px-6 py-4 text-[10px] font-bold text-slate-400 uppercase tracking-widest">Date</th>
              <th className="px-6 py-4 text-[10px] font-bold text-slate-400 uppercase tracking-widest">Attempts</th>
              <th className="px-6 py-4 text-[10px] font-bold text-slate-400 uppercase tracking-widest text-right">Action</th>
            </tr>
          </thead>
          <tbody>
            {filteredData.length === 0 && (
              <tr>
                <td colSpan={7} className="px-6 py-12 text-center text-slate-400 text-sm italic">
                  No results found matching your filters.
                </td>
              </tr>
            )}
            {filteredData.map(r => {
              const rowId = String(r.id);
              const isExpanded = expandedIds.has(rowId);
              const hasHistory = r.attempts_count > 1;
              return (
                <React.Fragment key={rowId}>
                  {/* ── Main row ── */}
                  <tr className={`border-t border-slate-100 hover:bg-slate-50 transition ${selectedIds.has(rowId) ? 'bg-blue-50/30' : ''}`}>
                    <td className="px-6 py-4">
                      <button onClick={() => toggleOne(rowId)} className="text-slate-400 hover:text-slate-600">
                        {selectedIds.has(rowId) ? <CheckSquare className="w-5 h-5 text-blue-600" /> : <Square className="w-5 h-5" />}
                      </button>
                    </td>
                    <td className="px-6 py-4">
                      <div className="flex items-center gap-3">
                        <div className="w-8 h-8 rounded-full bg-slate-100 flex items-center justify-center text-slate-500 font-bold text-xs">
                          {r.participant_name.charAt(0).toUpperCase()}
                        </div>
                        <div>
                          <p className="font-bold text-slate-900 text-sm">{r.participant_name}</p>
                          <p className="text-[10px] text-slate-400">{r.participant_email}</p>
                        </div>
                      </div>
                    </td>
                    <td className="px-6 py-4 text-sm font-medium text-slate-600">{r.assessment_name}</td>
                    <td className="px-6 py-4"><StatusBadge status={r.result_status} score={r.score} /></td>
                    <td className="px-6 py-4">
                      <span className="text-xs text-slate-500 font-medium flex items-center gap-1.5">
                        <Calendar className="w-3 h-3 text-slate-400" /> {r.submitted_date ?? '—'}
                      </span>
                    </td>
                    <td className="px-6 py-4">
                      {hasHistory ? (
                        <button
                          onClick={() => toggleExpand(rowId)}
                          className="flex items-center gap-1 text-xs font-bold text-blue-600 bg-blue-50 hover:bg-blue-100 px-2.5 py-1 rounded-lg transition"
                        >
                          {isExpanded ? <ChevronDown className="w-3.5 h-3.5" /> : <ChevronRight className="w-3.5 h-3.5" />}
                          {r.attempts_count} attempts
                        </button>
                      ) : (
                        <span className="text-xs text-slate-400">1 attempt</span>
                      )}
                    </td>
                    <td className="px-6 py-4 text-right">
                      <button
                        onClick={() => handleViewDetails(r, r.id)}
                        className="text-blue-600 hover:text-blue-700 font-bold text-xs flex items-center gap-1 justify-end bg-blue-50 px-3 py-1.5 rounded-lg hover:bg-blue-100 transition w-fit ml-auto"
                      >
                        <FileOutput className="w-3.5 h-3.5" /> Details
                      </button>
                    </td>
                  </tr>

                  {/* ── History sub-rows ── */}
                  {isExpanded && hasHistory && (
                    <tr className="border-t border-slate-100 bg-slate-50/70">
                      <td colSpan={7} className="px-6 py-3">
                        <div className="ml-11 border border-slate-200 rounded-xl overflow-hidden">
                          <table className="w-full text-xs">
                            <thead>
                              <tr className="bg-slate-100 border-b border-slate-200">
                                <th className="px-4 py-2 text-left font-bold text-slate-400 uppercase tracking-widest text-[10px]">Attempt</th>
                                <th className="px-4 py-2 text-left font-bold text-slate-400 uppercase tracking-widest text-[10px]">Score</th>
                                <th className="px-4 py-2 text-left font-bold text-slate-400 uppercase tracking-widest text-[10px]">Date</th>
                                <th className="px-4 py-2 text-right font-bold text-slate-400 uppercase tracking-widest text-[10px]">Details</th>
                              </tr>
                            </thead>
                            <tbody className="divide-y divide-slate-100">
                              {r.history.map((h: ApiResultHistoryItem, idx: number) => (
                                <tr key={h.id} className={`${h.id === r.id ? 'bg-blue-50/50' : 'bg-white'} hover:bg-slate-50 transition`}>
                                  <td className="px-4 py-2.5 font-medium text-slate-600">
                                    #{r.attempts_count - idx}
                                    {h.id === r.id && (
                                      <span className="ml-2 text-[10px] bg-blue-100 text-blue-700 px-1.5 py-0.5 rounded font-bold">best</span>
                                    )}
                                  </td>
                                  <td className="px-4 py-2.5">
                                    <StatusBadge status={h.result_status} score={h.score} />
                                  </td>
                                  <td className="px-4 py-2.5 text-slate-500 flex items-center gap-1">
                                    <Clock className="w-3 h-3 text-slate-400" /> {h.submitted_date ?? '—'}
                                  </td>
                                  <td className="px-4 py-2.5 text-right">
                                    <button
                                      onClick={() => handleViewDetails(r, h.id)}
                                      className="text-blue-500 hover:text-blue-700 font-bold text-[10px] flex items-center gap-1 ml-auto bg-blue-50 hover:bg-blue-100 px-2 py-1 rounded transition"
                                    >
                                      <FileOutput className="w-3 h-3" /> View
                                    </button>
                                  </td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        </div>
                      </td>
                    </tr>
                  )}
                </React.Fragment>
              );
            })}
          </tbody>
        </table>
      </div>

      {/* Detail modal */}
      {detailState.open && detailState.result && (
        <div className="fixed inset-0 z-[200] flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-slate-900/60 backdrop-blur-sm" onClick={closeDetail} />
          <div className="relative z-10 bg-white rounded-3xl w-full max-w-3xl max-h-[85vh] flex flex-col shadow-2xl border border-slate-100 animate-in zoom-in-95 duration-200">
            {/* Header */}
            <div className="p-6 border-b border-slate-100 flex items-start justify-between shrink-0">
              <div>
                <h3 className="text-xl font-bold text-slate-900">{detailState.result.participant_name}</h3>
                <p className="text-sm text-slate-500 mt-0.5">
                  {detailState.result.participant_email} · {detailState.result.assessment_name}
                  {detailState.result.attempts_count > 1 && (
                    <span className="ml-2 text-[11px] bg-slate-100 text-slate-500 px-2 py-0.5 rounded font-bold">
                      {detailState.result.attempts_count} total attempts
                    </span>
                  )}
                </p>
              </div>
              <div className="flex items-center gap-3">
                {detailState.detail && (
                  <StatusBadge
                    status={detailState.result.history.find(h => h.id === detailState.attemptId)?.result_status ?? detailState.result.result_status}
                    score={detailState.result.history.find(h => h.id === detailState.attemptId)?.score ?? detailState.result.score}
                  />
                )}
                <button onClick={closeDetail} className="p-2 hover:bg-slate-100 rounded-full text-slate-400 transition">
                  <X className="w-5 h-5" />
                </button>
              </div>
            </div>

            {/* Body */}
            <div className="overflow-y-auto flex-1 p-6">
              {detailState.loading && (
                <div className="flex items-center justify-center py-16 gap-3 text-slate-400">
                  <Loader2 className="w-5 h-5 animate-spin" />
                  <span className="text-sm">Loading answers...</span>
                </div>
              )}
              {detailState.error && (
                <div className="py-8 text-center text-sm text-red-500 bg-red-50 rounded-2xl border border-red-100 p-4">
                  {detailState.error}
                </div>
              )}
              {!detailState.loading && !detailState.error && detailState.detail && (
                <div className="space-y-4">
                  {detailState.detail.answers.length === 0 ? (
                    <p className="text-center text-sm text-slate-400 py-8 italic">No answers recorded for this attempt.</p>
                  ) : detailState.detail.answers.map(ans => {
                    const qtitle = questions.find(q => q._id === ans.question)?.title ?? `Question #${ans.question}`;
                    const isCorrect = ans.status === 'CORRECT';
                    const isIncorrect = ans.status === 'INCORRECT';
                    return (
                      <div key={ans.id} className={`border rounded-2xl overflow-hidden ${isCorrect ? 'border-green-200' : isIncorrect ? 'border-red-200' : 'border-slate-200'}`}>
                        <div className={`px-4 py-2.5 flex items-center justify-between ${isCorrect ? 'bg-green-50' : isIncorrect ? 'bg-red-50' : 'bg-slate-50'}`}>
                          <span className="text-sm font-bold text-slate-800">{qtitle}</span>
                          <span className={`inline-flex items-center gap-1 text-[10px] font-bold px-2 py-1 rounded-lg border ${isCorrect ? 'bg-green-100 text-green-700 border-green-200' : isIncorrect ? 'bg-red-100 text-red-700 border-red-200' : 'bg-slate-100 text-slate-500 border-slate-200'}`}>
                            {isCorrect ? <CheckCircle className="w-3 h-3" /> : isIncorrect ? <AlertCircle className="w-3 h-3" /> : <MinusCircle className="w-3 h-3" />}
                            {ans.status}
                          </span>
                        </div>
                        <div className="p-4 space-y-2">
                          <pre className="text-xs font-mono bg-slate-900 text-emerald-300 p-3 rounded-xl overflow-x-auto whitespace-pre-wrap break-all leading-relaxed">
                            {ans.participant_query || '(no query submitted)'}
                          </pre>
                          {ans.feedback && (
                            <p className="text-xs text-slate-600 bg-slate-50 p-2.5 rounded-lg border border-slate-100">
                              <span className="font-bold text-slate-700">Feedback: </span>{ans.feedback}
                            </p>
                          )}
                          {ans.execution_time_ms != null && (
                            <p className="text-[10px] text-slate-400">Execution time: {ans.execution_time_ms}ms</p>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
