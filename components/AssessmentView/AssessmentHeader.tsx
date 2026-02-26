
import React from 'react';
import { Send, X } from 'lucide-react';

interface Props {
  assessmentName: string;
  onExit: () => void;
  timeLeft: number;
  onSubmit: () => void;
}

const formatTime = (seconds: number) => {
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = seconds % 60;
  return `${h.toString().padStart(2, '0')}:${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
};

export const AssessmentHeader: React.FC<Props> = ({ assessmentName, onExit, timeLeft, onSubmit }) => {
  return (
    <div className="bg-white border-b border-gray-200 px-6 py-3 flex items-center justify-between shadow-sm z-10 shrink-0">
      <div className="flex items-center gap-6">
        <button onClick={onExit} className="p-2 hover:bg-gray-100 rounded-lg text-gray-400 transition">
          <X className="w-5 h-5" />
        </button>
        <div className="h-6 w-[1px] bg-gray-200"></div>
        <div>
          <span className="text-xs font-bold text-gray-400 uppercase tracking-widest block">Assessment</span>
          <span className="text-sm font-bold text-gray-900">{assessmentName}</span>
        </div>
      </div>
      <div className="flex items-center gap-6">
        <div className="flex flex-col items-end">
          <span className="text-[10px] text-gray-400 font-bold uppercase tracking-widest">Time Remaining</span>
          <span className={`text-sm font-mono font-bold ${timeLeft < 300 ? 'text-red-600 animate-pulse' : 'text-slate-900'}`}>
            {formatTime(timeLeft)}
          </span>
        </div>
        <button
          onClick={onSubmit}
          className="bg-green-600 hover:bg-green-700 text-white font-bold px-6 py-2.5 rounded-xl shadow-lg transition flex items-center gap-2 active:scale-95"
        >
          Finish <Send className="w-4 h-4" />
        </button>
      </div>
    </div>
  );
};
