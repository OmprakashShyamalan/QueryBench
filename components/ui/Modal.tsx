
import React from 'react';
import { X } from 'lucide-react';

interface ModalProps {
  isOpen: boolean;
  onClose: () => void;
  title: string;
  icon?: React.ReactNode;
  children: React.ReactNode;
  footer?: React.ReactNode;
  maxWidth?: string;
}

export const Modal: React.FC<ModalProps> = ({ isOpen, onClose, title, icon, children, footer, maxWidth = 'max-w-2xl' }) => {
  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-slate-900/60 backdrop-blur-sm" onClick={onClose}></div>
      <div className={`bg-white rounded-3xl p-8 ${maxWidth} w-full shadow-2xl relative z-10 border border-slate-100 max-h-[90vh] overflow-y-auto animate-in zoom-in-95 duration-200`}>
        <div className="flex justify-between items-center mb-6">
          <h3 className="text-2xl font-bold text-slate-900 flex items-center gap-2">
            {icon} {title}
          </h3>
          <button onClick={onClose} className="p-2 hover:bg-slate-100 rounded-full text-slate-400 transition">
            <X className="w-5 h-5" />
          </button>
        </div>
        <div className="space-y-6">{children}</div>
        {footer && (
          <div className="flex gap-4 mt-8 pt-6 border-t border-slate-100">
            {footer}
          </div>
        )}
      </div>
    </div>
  );
};
