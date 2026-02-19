
import React, { useState, useMemo } from 'react';
import { Download, Trophy, FileOutput, Search, Filter, CheckSquare, Square, X, Calendar, User, Mail } from 'lucide-react';

interface ResultItem {
  id: string;
  participant_name: string;
  participant_email: string;
  assessment_name: string;
  score: number;
  status: 'PASSED' | 'FAILED';
  submitted_at: string;
}

// Mock Data for MVP visualization
const MOCK_RESULTS: ResultItem[] = [
  { id: 'r1', participant_name: 'Jane Doe', participant_email: 'jane.doe@company.com', assessment_name: 'SQL Server Core V1', score: 92, status: 'PASSED', submitted_at: '2023-11-15' },
  { id: 'r2', participant_name: 'John Smith', participant_email: 'john.smith@company.com', assessment_name: 'SQL Server Core V1', score: 45, status: 'FAILED', submitted_at: '2023-11-16' },
  { id: 'r3', participant_name: 'Alice Johnson', participant_email: 'alice.j@company.com', assessment_name: 'PostgreSQL Advanced', score: 88, status: 'PASSED', submitted_at: '2023-11-10' },
  { id: 'r4', participant_name: 'Bob Brown', participant_email: 'bob.b@company.com', assessment_name: 'SQL Server Core V1', score: 76, status: 'PASSED', submitted_at: '2023-11-12' },
  { id: 'r5', participant_name: 'Charlie Davis', participant_email: 'charlie.d@company.com', assessment_name: 'PostgreSQL Advanced', score: 60, status: 'FAILED', submitted_at: '2023-11-18' },
  { id: 'r6', participant_name: 'David Evans', participant_email: 'david.e@company.com', assessment_name: 'Data Analysis Fundamentals', score: 95, status: 'PASSED', submitted_at: '2023-11-20' },
  { id: 'r7', participant_name: 'Eve Foster', participant_email: 'eve.f@company.com', assessment_name: 'SQL Server Core V1', score: 82, status: 'PASSED', submitted_at: '2023-11-21' },
];

interface Props {
  results: any[];
}

export const ResultsTab: React.FC<Props> = ({ results }) => {
  // Use mock data if props are empty for MVP demo
  const data = results.length > 0 ? results : MOCK_RESULTS;

  const [searchTerm, setSearchTerm] = useState('');
  const [assessmentFilter, setAssessmentFilter] = useState('');
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());

  // Unique assessments for dropdown
  const uniqueAssessments = Array.from(new Set(data.map(r => r.assessment_name)));

  const filteredData = useMemo(() => {
    return data.filter(r => {
      const matchesSearch = r.participant_name.toLowerCase().includes(searchTerm.toLowerCase()) || 
                            r.participant_email.toLowerCase().includes(searchTerm.toLowerCase());
      const matchesAssessment = assessmentFilter ? r.assessment_name === assessmentFilter : true;
      return matchesSearch && matchesAssessment;
    });
  }, [data, searchTerm, assessmentFilter]);

  const toggleAll = () => {
    if (selectedIds.size === filteredData.length && filteredData.length > 0) {
      setSelectedIds(new Set());
    } else {
      setSelectedIds(new Set(filteredData.map(r => r.id)));
    }
  };

  const toggleOne = (id: string) => {
    const next = new Set(selectedIds);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    setSelectedIds(next);
  };

  const handleExport = () => {
    const rowsToExport = selectedIds.size > 0 
      ? data.filter(r => selectedIds.has(r.id))
      : filteredData;

    const csvContent = [
      ['Participant', 'Email', 'Assessment', 'Score', 'Status', 'Date'],
      ...rowsToExport.map(r => [r.participant_name, r.participant_email, r.assessment_name, r.score, r.status, r.submitted_at])
    ].map(e => e.join(",")).join("\n");

    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement("a");
    link.href = URL.createObjectURL(blob);
    link.download = `assessment_results_${new Date().toISOString().split('T')[0]}.csv`;
    link.click();
  };

  const exportLabel = selectedIds.size > 0 
    ? `Export Selected (${selectedIds.size})` 
    : (searchTerm || assessmentFilter) 
      ? `Export Filtered (${filteredData.length})` 
      : `Export All (${data.length})`;

  return (
    <div className="space-y-6">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <h2 className="text-xl font-bold text-gray-900">Assessment Results</h2>
        <button 
          onClick={handleExport}
          className="flex items-center gap-2 px-4 py-2 bg-slate-100 text-slate-600 rounded-xl text-sm font-bold border border-slate-200 hover:bg-slate-200 transition shadow-sm"
        >
          <Download className="w-4 h-4" /> {exportLabel}
        </button>
      </div>

      {/* Filter Bar */}
      <div className="bg-white p-4 rounded-2xl border border-slate-200 shadow-sm flex flex-col md:flex-row gap-4 items-center">
        <div className="relative flex-1 w-full">
          <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
          <input 
            type="text" 
            placeholder="Search participants..." 
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="w-full pl-9 pr-4 py-2 bg-slate-50 border border-slate-200 rounded-xl text-sm font-medium outline-none focus:ring-2 focus:ring-blue-100 transition"
          />
        </div>
        <div className="relative w-full md:w-64">
          <Filter className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
          <select 
            value={assessmentFilter}
            onChange={(e) => setAssessmentFilter(e.target.value)}
            className="w-full pl-9 pr-8 py-2 bg-slate-50 border border-slate-200 rounded-xl text-sm font-bold text-slate-600 outline-none focus:ring-2 focus:ring-blue-100 transition appearance-none cursor-pointer"
          >
            <option value="">All Assessments</option>
            {uniqueAssessments.map(a => (
              <option key={a} value={a}>{a}</option>
            ))}
          </select>
        </div>
        {(searchTerm || assessmentFilter) && (
          <button 
            onClick={() => { setSearchTerm(''); setAssessmentFilter(''); }}
            className="p-2 text-slate-400 hover:text-slate-600 hover:bg-slate-100 rounded-lg transition"
            title="Clear Filters"
          >
            <X className="w-4 h-4" />
          </button>
        )}
      </div>

      <div className="bg-white rounded-3xl border border-slate-200 overflow-hidden shadow-sm">
        <table className="w-full text-left border-collapse">
          <thead className="bg-slate-50 border-b border-slate-200">
            <tr>
              <th className="px-6 py-4 w-12">
                <button onClick={toggleAll} className="text-slate-400 hover:text-slate-600">
                  {filteredData.length > 0 && selectedIds.size === filteredData.length ? <CheckSquare className="w-5 h-5 text-blue-600" /> : <Square className="w-5 h-5" />}
                </button>
              </th>
              <th className="px-6 py-4 text-[10px] font-bold text-slate-400 uppercase tracking-widest">Participant</th>
              <th className="px-6 py-4 text-[10px] font-bold text-slate-400 uppercase tracking-widest">Assessment</th>
              <th className="px-6 py-4 text-[10px] font-bold text-slate-400 uppercase tracking-widest">Score</th>
              <th className="px-6 py-4 text-[10px] font-bold text-slate-400 uppercase tracking-widest">Date</th>
              <th className="px-6 py-4 text-[10px] font-bold text-slate-400 uppercase tracking-widest text-right">Action</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {filteredData.map((r) => (
              <tr key={r.id} className={`hover:bg-slate-50 transition ${selectedIds.has(r.id) ? 'bg-blue-50/30' : ''}`}>
                <td className="px-6 py-4">
                  <button onClick={() => toggleOne(r.id)} className="text-slate-400 hover:text-slate-600">
                    {selectedIds.has(r.id) ? <CheckSquare className="w-5 h-5 text-blue-600" /> : <Square className="w-5 h-5" />}
                  </button>
                </td>
                <td className="px-6 py-4">
                  <div className="flex items-center gap-3">
                    <div className="w-8 h-8 rounded-full bg-slate-100 flex items-center justify-center text-slate-500 font-bold text-xs">
                      {r.participant_name.charAt(0)}
                    </div>
                    <div>
                      <p className="font-bold text-slate-900 text-sm">{r.participant_name}</p>
                      <p className="text-[10px] text-slate-400 flex items-center gap-1">
                         {r.participant_email}
                      </p>
                    </div>
                  </div>
                </td>
                <td className="px-6 py-4 text-sm font-medium text-slate-600">
                  {r.assessment_name}
                </td>
                <td className="px-6 py-4">
                  <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs font-bold border ${r.score >= 70 ? 'bg-green-50 text-green-700 border-green-100' : 'bg-red-50 text-red-700 border-red-100'}`}>
                    <Trophy className="w-3 h-3" /> {r.score}%
                  </span>
                </td>
                <td className="px-6 py-4">
                  <span className="text-xs text-slate-500 font-medium flex items-center gap-1.5">
                    <Calendar className="w-3 h-3 text-slate-400" /> {r.submitted_at}
                  </span>
                </td>
                <td className="px-6 py-4 text-right">
                  <button className="text-blue-600 hover:text-blue-700 font-bold text-xs flex items-center gap-1 justify-end bg-blue-50 px-3 py-1.5 rounded-lg hover:bg-blue-100 transition w-fit ml-auto">
                    <FileOutput className="w-3.5 h-3.5" /> Details
                  </button>
                </td>
              </tr>
            ))}
            {filteredData.length === 0 && (
              <tr>
                <td colSpan={6} className="px-6 py-12 text-center text-slate-400 text-sm italic">
                  No results found matching your filters.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
};
