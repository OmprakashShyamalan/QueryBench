
import React, { useState, useEffect } from 'react';
import { Assignment } from '../types';
import { ClipboardList, Clock, CheckCircle2, ArrowRight, BookOpen, Calendar, Lock, Database, RefreshCw } from 'lucide-react';
import { assignmentsApi, ApiAssignment } from '../services/api';

interface Props {
  onStartAssessment: (id: string) => void;
}

function mapAssignment(a: ApiAssignment): Assignment {
  const detail = a.assessment_detail;
  return {
    id: String(a.id),
    assessment: {
      id: String(a.assessment),
      name: a.assessment_name,
      description: detail?.description ?? '',
      duration_minutes: detail?.duration_minutes ?? 60,
      attempts_allowed: detail?.attempts_allowed ?? 1,
      questions: [],
      is_published: detail?.is_published ?? true,
      db_config: detail?.db_config_detail
        ? {
            host: detail.db_config_detail.host,
            port: detail.db_config_detail.port,
            database_name: detail.db_config_detail.database_name,
            username: detail.db_config_detail.username,
            password_secret_ref: detail.db_config_detail.password_secret_ref,
            provider: detail.db_config_detail.provider,
          }
        : { host: '', port: 1433, database_name: '', username: '', password_secret_ref: '', provider: 'SQL_SERVER' },
    },
    participant_id: String(a.user),
    due_date: a.due_date,
    status: a.status,
  };
}

const ParticipantDashboard: React.FC<Props> = ({ onStartAssessment }) => {
  const [assignments, setAssignments] = useState<Assignment[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    assignmentsApi.listMine()
      .then(data => setAssignments(data.map(mapAssignment)))
      .catch(e => setError(e instanceof Error ? e.message : 'Failed to load assignments.'))
      .finally(() => setLoading(false));
  }, []);

  const pendingAssignments = assignments.filter(a => a.status === 'PENDING' || a.status === 'IN_PROGRESS');
  const completedAssignments = assignments.filter(a => a.status === 'COMPLETED');

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64 gap-3 text-slate-400">
        <RefreshCw className="w-5 h-5 animate-spin" />
        <span className="text-sm font-medium">Loading your assignments...</span>
      </div>
    );
  }

  if (error) {
    return (
      <div className="max-w-lg mx-auto mt-16 p-6 bg-red-50 border border-red-200 rounded-2xl text-center">
        <p className="text-sm font-bold text-red-700">{error}</p>
      </div>
    );
  }

  return (
    <div className="max-w-7xl mx-auto px-4 py-12">
      <div className="mb-10 flex flex-col md:flex-row md:items-end justify-between gap-6">
        <div>
          <h1 className="text-3xl font-extrabold text-gray-900 tracking-tight">Assigned Assessments</h1>
          <p className="text-gray-500 mt-2 text-lg">Securely access your assigned SQL challenges and track your growth.</p>
        </div>
        <div className="flex items-center gap-2 text-xs font-bold text-slate-400 uppercase tracking-widest bg-slate-100 px-4 py-2 rounded-full border border-slate-200">
          <Lock className="w-3.5 h-3.5" /> Assigned Access Only
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        {/* Active Assignments */}
        <div className="lg:col-span-2 space-y-6">
          <h2 className="text-xl font-bold flex items-center gap-2 text-slate-900">
            <div className="w-8 h-8 bg-blue-100 text-blue-600 rounded-lg flex items-center justify-center">
              <ClipboardList className="w-4 h-4" />
            </div>
            Assigned to You
          </h2>

          <div className="grid gap-4">
            {pendingAssignments.length > 0 ? (
              pendingAssignments.map(a => (
                <div key={a.id} className="bg-white rounded-3xl p-6 shadow-sm border border-gray-100 flex items-center justify-between hover:shadow-xl hover:border-blue-100 transition-all group relative overflow-hidden">
                  {a.status === 'IN_PROGRESS' && (
                    <div className="absolute top-0 left-0 bottom-0 w-1 bg-blue-600"></div>
                  )}
                  <div className="flex-1">
                    <div className="flex items-center gap-2 mb-1">
                      <h3 className="text-xl font-bold text-slate-800 group-hover:text-blue-600 transition">{a.assessment.name}</h3>
                      {a.status === 'IN_PROGRESS' && (
                        <span className="px-2 py-0.5 rounded text-[10px] font-bold uppercase bg-blue-50 text-blue-600 border border-blue-100">
                          Resuming
                        </span>
                      )}
                    </div>
                    <p className="text-gray-500 text-sm mt-1 line-clamp-1 max-w-xl">{a.assessment.description}</p>
                    <div className="flex flex-wrap items-center gap-4 mt-6">
                      <span className="flex items-center gap-1.5 text-xs font-bold text-slate-500 bg-slate-50 px-2.5 py-1.5 rounded-lg border border-slate-100">
                        <Clock className="w-3.5 h-3.5 text-blue-500" /> {a.assessment.duration_minutes}m
                      </span>
                      <span className="flex items-center gap-1.5 text-xs font-bold text-slate-500 bg-slate-50 px-2.5 py-1.5 rounded-lg border border-slate-100">
                        <BookOpen className="w-3.5 h-3.5 text-indigo-500" /> {a.assessment.attempts_allowed} attempt{a.assessment.attempts_allowed !== 1 ? 's' : ''}
                      </span>
                      <span className="flex items-center gap-1.5 text-xs font-bold text-slate-500 bg-slate-50 px-2.5 py-1.5 rounded-lg border border-slate-100">
                        <Calendar className="w-3.5 h-3.5 text-amber-500" /> Due {new Date(a.due_date).toLocaleDateString()}
                      </span>
                    </div>
                  </div>
                  <button
                    onClick={() => onStartAssessment(a.id)}
                    className="ml-6 py-3.5 px-8 bg-slate-900 text-white rounded-2xl font-bold flex items-center gap-3 hover:bg-blue-600 transition shadow-xl active:scale-95 shrink-0"
                  >
                    {a.status === 'IN_PROGRESS' ? 'Resume' : 'Begin'} <ArrowRight className="w-4 h-4" />
                  </button>
                </div>
              ))
            ) : (
              <div className="bg-slate-50 border border-dashed border-slate-200 rounded-3xl p-12 text-center text-slate-400">
                No active assessments assigned to you at this time.
              </div>
            )}
          </div>

          <h2 className="text-xl font-bold flex items-center gap-2 pt-8 text-slate-900">
            <div className="w-8 h-8 bg-green-100 text-green-600 rounded-lg flex items-center justify-center">
              <CheckCircle2 className="w-4 h-4" />
            </div>
            Completion History
          </h2>
          <div className="grid gap-4">
            {completedAssignments.length > 0 ? completedAssignments.map(a => (
              <div key={a.id} className="bg-gray-50 rounded-2xl p-6 border border-gray-100 flex items-center justify-between opacity-80">
                <div>
                  <h3 className="text-lg font-bold text-gray-700">{a.assessment.name}</h3>
                  <p className="text-gray-500 text-sm mt-1">Completed via Assignment Access</p>
                </div>
                <span className="text-[10px] text-green-600 font-bold uppercase tracking-widest bg-green-50 px-2 py-0.5 rounded border border-green-100">Completed</span>
              </div>
            )) : (
              <div className="text-sm text-slate-400 italic">No completed assessments yet.</div>
            )}
          </div>
        </div>

        {/* Sidebar */}
        <div className="space-y-6">
          <div className="bg-gradient-to-br from-slate-900 to-slate-800 rounded-3xl p-8 text-white shadow-2xl relative overflow-hidden">
            <div className="absolute top-0 right-0 p-4 opacity-10">
              <Database className="w-24 h-24" />
            </div>
            <h3 className="text-lg font-bold mb-6 relative z-10">Assignment Metrics</h3>
            <div className="space-y-6 relative z-10">
              <div className="flex justify-between items-end">
                <span className="text-slate-400 text-sm font-medium">Assigned Tasks</span>
                <span className="text-2xl font-bold">{assignments.length}</span>
              </div>
              <div className="flex justify-between items-end">
                <span className="text-slate-400 text-sm font-medium">Pending</span>
                <span className="text-2xl font-bold">{pendingAssignments.length}</span>
              </div>
              <div className="flex justify-between items-end border-t border-slate-700 pt-6">
                <span className="text-slate-400 text-sm font-medium">Completed</span>
                <span className="text-2xl font-bold text-green-400">{completedAssignments.length}</span>
              </div>
            </div>
          </div>

          <div className="bg-white rounded-3xl p-8 shadow-sm border border-gray-100">
            <h3 className="text-xs font-bold text-slate-400 uppercase tracking-widest mb-6">Access Rules</h3>
            <ul className="space-y-4">
              <li className="flex gap-3">
                <div className="w-1.5 h-1.5 rounded-full bg-blue-500 mt-1.5 shrink-0"></div>
                <p className="text-xs text-slate-600 leading-relaxed">Assessments are <strong>private</strong> and assigned by admins.</p>
              </li>
              <li className="flex gap-3">
                <div className="w-1.5 h-1.5 rounded-full bg-blue-500 mt-1.5 shrink-0"></div>
                <p className="text-xs text-slate-600 leading-relaxed">Attempts are <strong>logged</strong> and verified against master schemas.</p>
              </li>
              <li className="flex gap-3">
                <div className="w-1.5 h-1.5 rounded-full bg-blue-500 mt-1.5 shrink-0"></div>
                <p className="text-xs text-slate-600 leading-relaxed">Execution is capped at <strong>5 seconds</strong> per query run.</p>
              </li>
            </ul>
          </div>
        </div>
      </div>
    </div>
  );
};

export default ParticipantDashboard;
