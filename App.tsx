
import React, { useState } from 'react';
import { Role, User } from './types';
import ParticipantDashboard from './components/ParticipantDashboard';
import AdminDashboard from './components/admin/AdminDashboard';
import AssessmentView from './components/AssessmentView';
import { LoginView } from './components/auth/LoginView';
import { Database, LogOut, ShieldCheck } from 'lucide-react';

const App: React.FC = () => {
  const [user, setUser] = useState<User | null>(null);
  const [isAuthenticating, setIsAuthenticating] = useState(false);
  const [activeAssessmentId, setActiveAssessmentId] = useState<string | null>(null);

  const handleMicrosoftLogin = async () => {
    setIsAuthenticating(true);
    await new Promise(resolve => setTimeout(resolve, 1000));
    setUser({
      id: 'ms-9921',
      email: 'jane.doe@company.com',
      name: 'Jane Doe',
      role: Role.PARTICIPANT,
      authSource: 'Microsoft'
    });
    setIsAuthenticating(false);
  };

  const handleLocalLogin = (role: Role) => {
    setUser({
      id: 'u-local',
      email: `${role.toLowerCase()}@local.dev`,
      name: `${role.charAt(0)}${role.slice(1).toLowerCase()} User`,
      role: role,
      authSource: 'Local'
    });
  };

  const handleLogout = () => {
    setUser(null);
    setActiveAssessmentId(null);
  };

  if (!user) {
    return <LoginView onLogin={handleLocalLogin} onMicrosoftLogin={handleMicrosoftLogin} isAuthenticating={isAuthenticating} />;
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
