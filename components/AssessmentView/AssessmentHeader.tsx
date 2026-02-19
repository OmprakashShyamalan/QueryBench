
import React from 'react';
import { X, Send, Clock, Info } from 'lucide-react';

interface Props {
  name: string;
  timeLeft: number;
  onExit: () => void;
  onFinish: () => void;
}

export const AssessmentHeader: React.FC<Props> = ({ name, timeLeft, onExit, onFinish }) => {
  const formatTime = (s: number) => {
    const m = Math.floor(s / 60);
    const sec = s % 60;
    return `${m}:${sec.toString().padStart(2, '0')}`;
  };

  return (
    <div className="bg-white border-b border-gray-200 px-6 py-3 flex items-center justify-between shadow-sm z-10">
      <div className="flex items-center gap-6">
        <button onClick={onExit} className="p-2 hover:bg-gray-100 rounded-lg text-gray-400"><X className="w-5 h-5" /></button>
        <div>
          <span className="text-[10px] font-bold text-gray-400 uppercase tracking-widest block">Assessment</span>
          <span className="text-sm font-bold text-gray-900">{name}</span>
        </div>
      </div>
      <div className="flex items-center gap-6">
        <div className="flex flex-col items-end">
          <span className="text-[10px] text-gray-400 font-bold uppercase tracking-widest">Time</span>
          <span className={`text-sm font-mono font-bold ${timeLeft < 300 ? 'text-red-600 animate-pulse' : 'text-slate-900'}`}>{formatTime(timeLeft)}</span>
        </div>
        <button onClick={onFinish} className="bg-green-600 text-white font-bold px-6 py-2 rounded-xl flex items-center gap-2">Finish <Send className="w-4 h-4" /></button>
      </div>
    </div>
  );
};
