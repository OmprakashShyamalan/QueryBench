import React, { useState } from 'react';
import { Database, Building2, LogIn, Eye, EyeOff } from 'lucide-react';

interface Props {
  onCredentialLogin: (username: string, password: string) => Promise<void>;
  isAuthenticating: boolean;
  error?: string | null;
}

export const LoginView: React.FC<Props> = ({ onCredentialLogin, isAuthenticating, error }) => {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!username.trim() || !password) return;
    await onCredentialLogin(username.trim(), password);
  };

  return (
    <div className="flex flex-col items-center justify-center min-h-screen bg-[#0f172a] text-white">
      <div className="absolute inset-0 overflow-hidden pointer-events-none">
        <div className="absolute -top-[25%] -left-[10%] w-[50%] h-[50%] bg-blue-600/10 blur-[120px] rounded-full"></div>
        <div className="absolute -bottom-[25%] -right-[10%] w-[50%] h-[50%] bg-indigo-600/10 blur-[120px] rounded-full"></div>
      </div>

      <div className="w-full max-w-md p-10 bg-slate-800/50 backdrop-blur-xl rounded-3xl shadow-2xl border border-white/10 relative z-10">
        {/* Header */}
        <div className="flex flex-col items-center mb-10">
          <div className="p-4 bg-blue-600 rounded-2xl shadow-lg shadow-blue-500/20 mb-6">
            <Database className="w-10 h-10" />
          </div>
          <h1 className="text-4xl font-extrabold tracking-tight">QueryBench</h1>
          <p className="text-slate-400 mt-2 text-center text-sm font-medium tracking-wide">
            The Enterprise SQL Assessment Platform
          </p>
        </div>

        {/* Login Form */}
        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-xs font-semibold text-slate-400 uppercase tracking-widest mb-1.5">
              Username
            </label>
            <input
              type="text"
              value={username}
              onChange={e => setUsername(e.target.value)}
              autoComplete="username"
              autoFocus
              disabled={isAuthenticating}
              placeholder="Enter your username"
              className="w-full px-4 py-3 bg-slate-900/60 border border-slate-600 focus:border-blue-500 focus:ring-1 focus:ring-blue-500 rounded-xl text-white placeholder-slate-500 text-sm outline-none transition disabled:opacity-50"
            />
          </div>

          <div>
            <label className="block text-xs font-semibold text-slate-400 uppercase tracking-widest mb-1.5">
              Password
            </label>
            <div className="relative">
              <input
                type={showPassword ? 'text' : 'password'}
                value={password}
                onChange={e => setPassword(e.target.value)}
                autoComplete="current-password"
                disabled={isAuthenticating}
                placeholder="Enter your password"
                className="w-full px-4 py-3 pr-11 bg-slate-900/60 border border-slate-600 focus:border-blue-500 focus:ring-1 focus:ring-blue-500 rounded-xl text-white placeholder-slate-500 text-sm outline-none transition disabled:opacity-50"
              />
              <button
                type="button"
                onClick={() => setShowPassword(v => !v)}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-500 hover:text-slate-300 transition"
                tabIndex={-1}
              >
                {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
              </button>
            </div>
          </div>

          {error && (
            <div className="px-4 py-3 bg-red-500/10 border border-red-500/30 rounded-xl text-sm text-red-400 font-medium">
              {error}
            </div>
          )}

          <button
            type="submit"
            disabled={isAuthenticating || !username.trim() || !password}
            className="w-full py-3.5 px-6 bg-blue-600 hover:bg-blue-500 disabled:bg-blue-600/40 disabled:cursor-not-allowed text-white font-bold rounded-xl flex items-center justify-center gap-2.5 transition shadow-lg shadow-blue-600/20"
          >
            {isAuthenticating ? (
              <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
            ) : (
              <LogIn className="w-4 h-4" />
            )}
            {isAuthenticating ? 'Signing in...' : 'Sign In'}
          </button>
        </form>

        <div className="mt-8 pt-6 border-t border-slate-700/50 text-[10px] text-slate-500 text-center flex items-center justify-center gap-2 font-medium">
          <Building2 className="w-3 h-3" /> INTERNAL USE ONLY
        </div>
      </div>
    </div>
  );
};
