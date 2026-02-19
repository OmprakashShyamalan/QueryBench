import React from 'react';
import { Database, ShieldCheck, User as UserIcon, Building2 } from 'lucide-react';
import { Role } from '../../types';

interface Props {
  onLogin: (role: Role) => void;
  onMicrosoftLogin: () => void;
  isAuthenticating: boolean;
}

export const LoginView: React.FC<Props> = ({ onLogin, onMicrosoftLogin, isAuthenticating }) => {
  return (
    <div className="flex flex-col items-center justify-center min-h-screen bg-[#0f172a] text-white">
      <div className="absolute inset-0 overflow-hidden pointer-events-none">
        <div className="absolute -top-[25%] -left-[10%] w-[50%] h-[50%] bg-blue-600/10 blur-[120px] rounded-full"></div>
        <div className="absolute -bottom-[25%] -right-[10%] w-[50%] h-[50%] bg-indigo-600/10 blur-[120px] rounded-full"></div>
      </div>

      <div className="w-full max-w-md p-10 bg-slate-800/50 backdrop-blur-xl rounded-3xl shadow-2xl border border-white/10 relative z-10">
        <div className="flex flex-col items-center mb-10">
          <div className="p-4 bg-blue-600 rounded-2xl shadow-lg shadow-blue-500/20 mb-6">
            <Database className="w-10 h-10" />
          </div>
          <h1 className="text-4xl font-extrabold tracking-tight">QueryBench</h1>
          <p className="text-slate-400 mt-2 text-center text-sm font-medium tracking-wide">The Enterprise SQL Assessment Platform</p>
        </div>
        
        <div className="space-y-4">
          <button 
            onClick={onMicrosoftLogin}
            disabled={isAuthenticating}
            className="w-full py-4 px-6 bg-white hover:bg-slate-100 text-slate-900 transition-all rounded-2xl font-bold flex items-center justify-center gap-3 shadow-xl disabled:opacity-70"
          >
            {isAuthenticating ? (
              <div className="w-5 h-5 border-2 border-slate-900/30 border-t-slate-900 rounded-full animate-spin"></div>
            ) : (
              <>
                <svg className="w-5 h-5" viewBox="0 0 23 23"><path fill="#f35325" d="M1 1h10v10H1z"/><path fill="#81bc06" d="M12 1h10v10H12z"/><path fill="#05a6f0" d="M1 12h10v10H1z"/><path fill="#ffba08" d="M12 12h10v10H12z"/></svg>
                Sign in with Microsoft
              </>
            )}
          </button>

          <div className="flex items-center gap-4 py-4">
            <div className="flex-1 h-px bg-slate-700"></div>
            <span className="text-[10px] font-bold text-slate-500 uppercase tracking-widest">Local Override</span>
            <div className="flex-1 h-px bg-slate-700"></div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <button onClick={() => onLogin(Role.ADMIN)} className="py-3 px-4 bg-slate-700/50 hover:bg-slate-700 rounded-xl text-xs font-semibold flex items-center justify-center gap-2 border border-slate-600 transition">
              <ShieldCheck className="w-3.5 h-3.5" /> Admin
            </button>
            <button onClick={() => onLogin(Role.PARTICIPANT)} className="py-3 px-4 bg-slate-700/50 hover:bg-slate-700 rounded-xl text-xs font-semibold flex items-center justify-center gap-2 border border-slate-600 transition">
              <UserIcon className="w-3.5 h-3.5" /> Participant
            </button>
          </div>
        </div>
        
        <div className="mt-10 pt-6 border-t border-slate-700/50 text-[10px] text-slate-500 text-center flex items-center justify-center gap-2 font-medium">
          <Building2 className="w-3 h-3" /> INTERNAL USE ONLY
        </div>
      </div>
    </div>
  );
};