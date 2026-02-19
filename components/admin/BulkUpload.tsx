
import React, { useState } from 'react';
import { Download, Upload, FileText } from 'lucide-react';

interface Props {
  onUpload: (data: string) => void;
  onCancel: () => void;
}

export const BulkUpload: React.FC<Props> = ({ onUpload, onCancel }) => {
  const [input, setInput] = useState('');

  const downloadTemplate = () => {
    const csv = "title,prompt,difficulty,tags,environment_tag,solution_query\nSample,Desc,EASY,tag1,DB1,SELECT * FROM table ORDER BY id";
    const blob = new Blob([csv], { type: 'text/csv' });
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'template.csv';
    a.click();
  };

  return (
    <div className="space-y-4">
      <div className="flex justify-between items-center bg-blue-50 p-4 rounded-2xl border border-blue-100">
        <div className="flex items-center gap-3">
          <FileText className="w-8 h-8 text-blue-600" />
          <p className="text-xs text-blue-700 font-bold">CSV Template Required</p>
        </div>
        <button onClick={downloadTemplate} className="px-4 py-2 bg-white text-blue-600 rounded-xl text-xs font-bold border border-blue-200">
          <Download className="w-4 h-4 inline mr-2" /> Template
        </button>
      </div>
      <textarea 
        value={input} onChange={e => setInput(e.target.value)}
        placeholder="Paste CSV rows here..."
        className="w-full p-4 bg-slate-50 border border-slate-200 rounded-2xl h-64 outline-none font-mono text-xs"
      />
      <div className="flex gap-4">
        <button onClick={onCancel} className="flex-1 py-3 bg-slate-100 rounded-xl font-bold">Cancel</button>
        <button onClick={() => onUpload(input)} className="flex-1 py-3 bg-blue-600 text-white rounded-xl font-bold">Import Data</button>
      </div>
    </div>
  );
};
