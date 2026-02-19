
import React, { useState } from 'react';
import { Clock, Database, AlignLeft, ListChecks, Search, Filter } from 'lucide-react';
import { Assessment, DatabaseConfig, Question } from '../../types';

interface Props {
  item: Partial<Assessment>;
  targets: DatabaseConfig[];
  questions: Question[];
  onSave: (item: any) => void;
  onCancel: () => void;
}

export const AssessmentEditor: React.FC<Props> = ({ item, targets, questions, onSave, onCancel }) => {
  const [editingItem, setEditingItem] = useState<Partial<Assessment>>(item);
  const [filterText, setFilterText] = useState('');

  const filteredQuestions = questions.filter(q => 
    q.title.toLowerCase().includes(filterText.toLowerCase()) || 
    q.tags.some(t => t.toLowerCase().includes(filterText.toLowerCase()))
  );

  return (
    <div className="space-y-5">
      <div className="grid grid-cols-2 gap-4">
        <div className="col-span-2">
          <label className="block text-xs font-bold text-slate-400 uppercase tracking-widest mb-2">Assessment Name</label>
          <input 
            type="text" 
            value={editingItem.name || ''} 
            onChange={e => setEditingItem({...editingItem, name: e.target.value})}
            className="w-full p-3 bg-slate-50 border border-slate-200 rounded-xl outline-none font-bold text-slate-900" 
            placeholder="e.g. Q3 SQL Proficiency"
          />
        </div>
        <div>
          <label className="block text-xs font-bold text-slate-400 uppercase tracking-widest mb-2 flex items-center gap-2">
            <Clock className="w-3.5 h-3.5" /> Duration (Minutes)
          </label>
          <input 
            type="number" 
            value={editingItem.duration_minutes || 60} 
            onChange={e => setEditingItem({...editingItem, duration_minutes: parseInt(e.target.value)})}
            className="w-full p-3 bg-slate-50 border border-slate-200 rounded-xl outline-none" 
          />
        </div>
        <div>
          <label className="block text-xs font-bold text-slate-400 uppercase tracking-widest mb-2 flex items-center gap-2">
            <Database className="w-3.5 h-3.5" /> Database Target
          </label>
          <select 
            value={editingItem.db_config?.database_name || ''} 
            onChange={e => {
              const target = targets.find(t => t.database_name === e.target.value);
              setEditingItem({...editingItem, db_config: target});
            }}
            className="w-full p-3 bg-blue-50 border border-blue-200 rounded-xl outline-none text-blue-700 font-bold"
          >
            <option value="">Select Target...</option>
            {targets.map(t => <option key={t.database_name} value={t.database_name}>{t.database_name}</option>)}
          </select>
        </div>
      </div>

      <div>
        <label className="block text-xs font-bold text-slate-400 uppercase tracking-widest mb-2 flex items-center gap-2">
          <AlignLeft className="w-3.5 h-3.5" /> Description
        </label>
        <textarea 
          value={editingItem.description || ''} 
          onChange={e => setEditingItem({...editingItem, description: e.target.value})}
          className="w-full p-4 bg-slate-50 border border-slate-200 rounded-2xl h-24 outline-none resize-none"
          placeholder="Briefly describe the goal of this assessment..."
        />
      </div>

      <div>
        <div className="flex justify-between items-end mb-2">
          <label className="block text-xs font-bold text-slate-400 uppercase tracking-widest flex items-center gap-2">
            <ListChecks className="w-3.5 h-3.5" /> Questions included ({editingItem.questions?.length || 0})
          </label>
          <div className="relative">
             <Search className="w-3.5 h-3.5 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
             <input 
               type="text" 
               value={filterText}
               onChange={e => setFilterText(e.target.value)}
               placeholder="Filter questions..."
               className="pl-8 pr-3 py-1.5 text-xs bg-slate-100 border-transparent rounded-lg focus:bg-white focus:ring-2 focus:ring-blue-100 outline-none transition-all w-48"
             />
          </div>
        </div>
        <div className="bg-slate-50 border border-slate-200 rounded-xl p-4 h-48 overflow-y-auto space-y-2">
           {filteredQuestions.length === 0 ? (
             <p className="text-xs text-slate-400 text-center py-4 italic">No matching questions found.</p>
           ) : filteredQuestions.map(q => {
             const isSelected = editingItem.questions?.some(sq => sq.id === q.id);
             return (
               <div key={q.id} className="flex items-center justify-between p-2 rounded-lg hover:bg-white hover:shadow-sm transition-all border border-transparent hover:border-slate-100">
                 <div className="flex items-center gap-3">
                   <input 
                    type="checkbox" 
                    checked={isSelected}
                    onChange={() => {
                      const current = editingItem.questions || [];
                      if (isSelected) {
                        setEditingItem({...editingItem, questions: current.filter(x => x.id !== q.id)});
                      } else {
                        setEditingItem({...editingItem, questions: [...current, q]});
                      }
                    }}
                    className="w-4 h-4 rounded text-blue-600 focus:ring-blue-500 cursor-pointer"
                   />
                   <div>
                      <span className="text-sm font-medium text-slate-700 block">{q.title}</span>
                      <span className="text-[10px] text-slate-400 uppercase font-bold tracking-widest">{q.difficulty} • {q.tags.join(', ')}</span>
                   </div>
                 </div>
                 {isSelected && <span className="text-[10px] font-bold text-blue-600 bg-blue-50 px-2 py-0.5 rounded">Selected</span>}
               </div>
             );
           })}
        </div>
      </div>

      <div className="flex gap-4 pt-4 border-t border-slate-100">
        <button onClick={onCancel} className="flex-1 py-3 bg-slate-100 rounded-xl font-bold text-slate-600 hover:bg-slate-200">Cancel</button>
        <button onClick={() => onSave(editingItem)} className="flex-1 py-3 bg-blue-600 text-white rounded-xl font-bold hover:bg-blue-700 shadow-lg shadow-blue-200">
          Save Assessment
        </button>
      </div>
    </div>
  );
};
