
import React, { useState, useEffect } from 'react';
import { Role, User } from './types';
import ParticipantDashboard from './components/ParticipantDashboard';
import AdminDashboard from './components/admin/AdminDashboard';
import AssessmentView from './components/AssessmentView';
import { LoginView } from './components/auth/LoginView';
import { authApi } from './services/api';
import { Database, LogOut } from 'lucide-react';

const App: React.FC = () => {
  const [user, setUser] = useState<User | null>(null);
  const [isAuthenticating, setIsAuthenticating] = useState(false);
  const [loginError, setLoginError] = useState<string | null>(null);
  const [activeAssessmentId, setActiveAssessmentId] = useState<string | null>(null);
  // true while we're checking the session on first load
  const [sessionChecking, setSessionChecking] = useState(true);

  // Restore session on page load
  useEffect(() => {
    authApi.me()
      .then(apiUser => {
        setUser({
          id: String(apiUser.id),
          email: apiUser.email,
          name: apiUser.name,
          role: apiUser.role === 'ADMIN' ? Role.ADMIN : Role.PARTICIPANT,
        });
      })
      .catch(() => {
        // No active session — stay on login page
      })
      .finally(() => setSessionChecking(false));
  }, []);

  const handleCredentialLogin = async (username: string, password: string) => {
    setIsAuthenticating(true);
    setLoginError(null);
    try {
      const apiUser = await authApi.login(username, password);
      setUser({
        id: String(apiUser.id),
        email: apiUser.email,
        name: apiUser.name,
        role: apiUser.role === 'ADMIN' ? Role.ADMIN : Role.PARTICIPANT,
      });
    } catch (err: unknown) {
      setLoginError(err instanceof Error ? err.message : 'Login failed. Please try again.');
    } finally {
      setIsAuthenticating(false);
    }
  };

  const handleLogout = async () => {
    try {
      await authApi.logout();
    } catch {
      // Proceed with logout even if the request fails
    }
    setUser(null);
    setActiveAssessmentId(null);
    setLoginError(null);
  };

  if (sessionChecking) {
    return (
      <div className="flex items-center justify-center min-h-screen bg-[#0f172a]">
        <div className="w-8 h-8 border-2 border-blue-600/30 border-t-blue-600 rounded-full animate-spin" />
      </div>
    );
  }

  if (!user) {
    return (
      <LoginView
        onCredentialLogin={handleCredentialLogin}
        isAuthenticating={isAuthenticating}
        error={loginError}
      />
    );
  }

  // Assessment View Branch (Full Screen)
  if (activeAssessmentId) {
    return (
      <AssessmentView
        assessmentId={activeAssessmentId}
        onExit={() => setActiveAssessmentId(null)}
      />
    );
  }

  // Dashboard Layout Branch
  return (
    <div className="min-h-screen bg-gray-50 flex flex-col">
      <header className="bg-white border-b border-gray-200 sticky top-0 z-50">
        <div className="max-w-7xl mx-auto px-4 h-16 flex items-center justify-between">
          <div className="flex items-center gap-2 cursor-pointer" onClick={() => setActiveAssessmentId(null)}>
            <div className="p-1.5 bg-blue-600 rounded shadow-lg shadow-blue-500/20">
              <Database className="w-5 h-5 text-white" />
            </div>
            <span className="text-xl font-bold text-gray-900 tracking-tight">QueryBench</span>
          </div>

          <div className="flex items-center gap-6">
            <div className="flex flex-col items-end">
              <span className="text-xs font-bold text-gray-900">{user.name}</span>
              <span className="text-[10px] text-gray-400 font-bold uppercase tracking-widest">{user.role}</span>
            </div>
            <div className="h-8 w-px bg-gray-200"></div>
            <button
              onClick={handleLogout}
              className="p-2 text-gray-400 hover:text-red-600 transition"
              title="Sign Out"
            >
              <LogOut className="w-5 h-5" />
            </button>
          </div>
        </div>
      </header>

      <main className="flex-1">
        {user.role === Role.ADMIN ? (
          <AdminDashboard />
        ) : (
          <ParticipantDashboard onStartAssessment={(id) => setActiveAssessmentId(id)} />
        )}
      </main>
    </div>
  );
};

export default App;
