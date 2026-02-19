
import React from 'react';
import { Assignment } from '../types';
// Add missing Database icon to the imports
import { ClipboardList, Clock, CheckCircle2, ArrowRight, BookOpen, Calendar, Lock, Database } from 'lucide-react';

interface Props {
  onStartAssessment: (id: string) => void;
}

const ParticipantDashboard: React.FC<Props> = ({ onStartAssessment }) => {
  // Mock Data: Only assessments assigned to this specific user
  const assignments: Assignment[] = [
    {
      id: 'as1',
      assessment: {
        id: 'a1',
        name: 'PostgreSQL Core Competency',
        description: 'Internal benchmark for advanced joins, aggregations, and window functions.',
        duration_minutes: 60,
        attempts_allowed: 1,
        questions: [],
        is_published: true,
        db_config: {
          host: 'pg-prod.internal.net',
          port: 5432,
          database_name: 'Assessments_DB',
          username: 'participant_user',
          password_secret_ref: 'KV_PG_PWD',
          provider: 'POSTGRES'
        }
      },
      participant_id: 'u1',
      due_date: '2024-12-31',
      status: 'PENDING'
    },
    {
      id: 'as2',
      assessment: {
        id: 'a2',
        name: 'Internal Data Analysis Fundamentals',
        description: 'Standardized assessment for basic SELECT, WHERE, and GROUP BY operations.',
        duration_minutes: 30,
        attempts_allowed: 2,
        questions: [],
        is_published: true,
        db_config: {
          host: 'sql-lite-demo.internal.net',
          port: 1433,
          database_name: 'Public_Data',
          username: 'guest_analyst',
          password_secret_ref: 'KV_SQL_PWD',
          provider: 'SQL_SERVER'
        }
      },
      participant_id: 'u1',
      due_date: '2024-11-15',
      status: 'COMPLETED'
    }
  ];

  const pendingAssignments = assignments.filter(a => a.status === 'PENDING' || a.status === 'IN_PROGRESS');
  const completedAssignments = assignments.filter(a => a.status === 'COMPLETED');

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
                        <BookOpen className="w-3.5 h-3.5 text-indigo-500" /> 5 Challenges
                      </span>
                      <span className="flex items-center gap-1.5 text-xs font-bold text-slate-500 bg-slate-50 px-2.5 py-1.5 rounded-lg border border-slate-100">
                        <Calendar className="w-3.5 h-3.5 text-amber-500" /> Due {new Date(a.due_date).toLocaleDateString()}
                      </span>
                    </div>
                  </div>
                  <button 
                    onClick={() => onStartAssessment(a.assessment.id)}
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
            {completedAssignments.map(a => (
              <div key={a.id} className="bg-gray-50 rounded-2xl p-6 border border-gray-100 flex items-center justify-between opacity-80">
                <div>
                  <h3 className="text-lg font-bold text-gray-700">{a.assessment.name}</h3>
                  <p className="text-gray-500 text-sm mt-1">Completed via Assignment Access</p>
                </div>
                <div className="text-right">
                  <span className="block text-2xl font-extrabold text-slate-900">92%</span>
                  <span className="text-[10px] text-green-600 font-bold uppercase tracking-widest bg-green-50 px-2 py-0.5 rounded border border-green-100">Verified Pass</span>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Sidebar info */}
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
                <span className="text-slate-400 text-sm font-medium">Average Performance</span>
                <span className="text-2xl font-bold">88.5%</span>
              </div>
              <div className="flex justify-between items-end border-t border-slate-700 pt-6">
                <span className="text-slate-400 text-sm font-medium">Rank in Group</span>
                <span className="text-2xl font-bold text-blue-400">#42</span>
              </div>
            </div>
          </div>
          
          <div className="bg-white rounded-3xl p-8 shadow-sm border border-gray-100">
            <h3 className="text-xs font-bold text-slate-400 uppercase tracking-widest mb-6 flex items-center gap-2">
               Access Rules
            </h3>
            <ul className="space-y-4">
              <li className="flex gap-3">
                <div className="w-1.5 h-1.5 rounded-full bg-blue-500 mt-1.5 shrink-0"></div>
                <p className="text-xs text-slate-600 leading-relaxed">
                  Assessments are <strong>private</strong> and assigned by admins.
                </p>
              </li>
              <li className="flex gap-3">
                <div className="w-1.5 h-1.5 rounded-full bg-blue-500 mt-1.5 shrink-0"></div>
                <p className="text-xs text-slate-600 leading-relaxed">
                  Attempts are <strong>logged</strong> and verified against master schemas.
                </p>
              </li>
              <li className="flex gap-3">
                <div className="w-1.5 h-1.5 rounded-full bg-blue-500 mt-1.5 shrink-0"></div>
                <p className="text-xs text-slate-600 leading-relaxed">
                  Execution is capped at <strong>5 seconds</strong> per query run.
                </p>
              </li>
            </ul>
          </div>
        </div>
      </div>
    </div>
  );
};

export default ParticipantDashboard;
