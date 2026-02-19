
import React from 'react';
import { Plus, Server, HardDrive, Settings, Trash2 } from 'lucide-react';
import { DatabaseConfig } from '../../../types';

interface Props {
  targets: DatabaseConfig[];
  onAdd: () => void;
  onEdit: (t: DatabaseConfig) => void;
}

export const InfrastructureTab: React.FC<Props> = ({ targets, onAdd, onEdit }) => {
  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <div>
          <h2 className="text-xl font-bold text-gray-900">Infrastructure</h2>
          <p className="text-xs text-slate-500">Connection endpoints for assessment evaluations.</p>
        </div>
        <button onClick={onAdd} className="flex items-center gap-2 px-6 py-2 bg-slate-900 text-white rounded-xl text-sm font-bold hover:bg-slate-800 transition">
          <Plus className="w-4 h-4" /> Add Target
        </button>
      </div>
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        {targets.map(target => (
          <div key={target.database_name} className="bg-white rounded-2xl border border-slate-200 p-6 hover:border-blue-300 transition group">
            <div className="flex justify-between items-start mb-4">
              <div className="flex items-center gap-3">
                <div className="p-3 bg-slate-100 rounded-xl text-slate-600 group-hover:bg-blue-50 group-hover:text-blue-600 transition">
                  <HardDrive className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="font-bold text-slate-900">{target.database_name}</h3>
                  <p className="text-[10px] font-mono text-slate-400">{target.host}:{target.port}</p>
                </div>
              </div>
              <button onClick={() => onEdit(target)} className="p-2 text-slate-400 hover:text-blue-600 transition">
                <Settings className="w-4 h-4" />
              </button>
            </div>
            <div className="flex items-center gap-2 text-[10px] font-bold text-slate-400 uppercase tracking-widest bg-slate-50 px-2 py-1 rounded w-fit">
              <Server className="w-3 h-3" /> {target.provider}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
};
