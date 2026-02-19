
import React, { useState, useEffect, useRef } from 'react';
import { Question, QueryResult, Assessment, SchemaMetadata } from '../types';
import { 
  Play, Send, ChevronLeft, ChevronRight, X, AlertCircle, 
  CheckCircle, Database as DBIcon, Info, Loader2, 
  BookOpen, Network, Grid, Search, Key, Link as LinkIcon
} from 'lucide-react';
import CodeMirror from '@uiw/react-codemirror';
import { sql } from '@codemirror/lang-sql';
import SchemaVisualizer from './SchemaVisualizer';

interface Props {
  assessmentId: string;
  onExit: () => void;
}

const AssessmentView: React.FC<Props> = ({ assessmentId, onExit }) => {
  const [currentQuestionIndex, setCurrentQuestionIndex] = useState(0);
  const [activeTab, setActiveTab] = useState<'prompt' | 'explorer' | 'diagram'>('prompt');
  
  // State for queries per question to prevent data loss on navigation
  const [queries, setQueries] = useState<Record<string, string>>({});
  const [result, setResult] = useState<QueryResult | null>(null);
  const [isExecuting, setIsExecuting] = useState(false);
  const [timeLeft, setTimeLeft] = useState(3600);
  const [isFinished, setIsFinished] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [showConfirmModal, setShowConfirmModal] = useState(false);
  const [schemaSearch, setSchemaSearch] = useState('');
  
  // Resizing State (Percentages)
  const [sidebarWidth, setSidebarWidth] = useState(30); 
  const [resultsHeight, setResultsHeight] = useState(35);
  const containerRef = useRef<HTMLDivElement>(null);
  const rightPaneRef = useRef<HTMLDivElement>(null);

  const timerRef = useRef<number | null>(null);

  const mockSchema: SchemaMetadata = {
    tables: [
      {
        name: 'employees',
        columns: [
          { name: 'emp_id', type: 'INT', isNullable: false, isPrimaryKey: true, isForeignKey: false },
          { name: 'name', type: 'NVARCHAR(255)', isNullable: false, isPrimaryKey: false, isForeignKey: false },
          { name: 'salary', type: 'DECIMAL(18,2)', isNullable: false, isPrimaryKey: false, isForeignKey: false },
          { name: 'dept_id', type: 'INT', isNullable: false, isPrimaryKey: false, isForeignKey: true, references: { table: 'departments', column: 'dept_id' } },
        ]
      },
      {
        name: 'departments',
        columns: [
          { name: 'dept_id', type: 'INT', isNullable: false, isPrimaryKey: true, isForeignKey: false },
          { name: 'dept_name', type: 'NVARCHAR(100)', isNullable: false, isPrimaryKey: false, isForeignKey: false },
          { name: 'location', type: 'NVARCHAR(100)', isNullable: true, isPrimaryKey: false, isForeignKey: false },
        ]
      },
      {
        name: 'orders',
        columns: [
            { name: 'order_id', type: 'INT', isNullable: false, isPrimaryKey: true, isForeignKey: false },
            { name: 'customer_id', type: 'INT', isNullable: false, isPrimaryKey: false, isForeignKey: false },
            { name: 'amount', type: 'DECIMAL(10,2)', isNullable: false, isPrimaryKey: false, isForeignKey: false },
            { name: 'order_date', type: 'DATETIME', isNullable: false, isPrimaryKey: false, isForeignKey: false }
        ]
      }
    ]
  };

  const assessmentData: Assessment = {
    id: assessmentId,
    name: 'SQL Server - Technical Assessment',
    description: 'Advanced technical assessment for internal candidates.',
    duration_minutes: 60,
    attempts_allowed: 1,
    is_published: true,
    db_config: {
      host: 'sql-prod.internal.net',
      port: 1433,
      database_name: 'HR_Systems',
      username: 'svc_runner',
      password_secret_ref: 'SECURE_VAULT_REF',
      provider: 'SQL_SERVER'
    },
    questions: [
      {
        id: 'q1',
        title: 'High-Value Employees',
        prompt: 'Identify employees earning > 100k. Include their department name. Sort by salary descending.',
        difficulty: 'EASY',
        tags: ['Filtering', 'Joins'],
        environment_tag: 'HR_Systems',
        expected_schema_ref: 'hr_schema',
        solution_query: 'SELECT e.name, e.salary, d.dept_name FROM employees e JOIN departments d ON e.dept_id = d.dept_id WHERE e.salary > 100000 ORDER BY e.salary DESC',
        schema_metadata: mockSchema
      },
      {
        id: 'q2',
        title: 'Revenue by Department',
        prompt: 'Calculate total salary expenditure for each department. Only show departments with more than 1 employee.',
        difficulty: 'MEDIUM',
        tags: ['Aggregations', 'Group By'],
        environment_tag: 'HR_Systems',
        expected_schema_ref: 'hr_schema',
        solution_query: 'SELECT d.dept_name, SUM(e.salary) as total_salary FROM employees e JOIN departments d ON e.dept_id = d.dept_id GROUP BY d.dept_name HAVING COUNT(e.emp_id) > 1 ORDER BY total_salary DESC',
        schema_metadata: mockSchema
      },
      {
        id: 'q3',
        title: 'Recent Large Orders',
        prompt: 'List all orders with an amount greater than 500 placed in the last 30 days.',
        difficulty: 'MEDIUM',
        tags: ['Date Functions', 'Filtering'],
        environment_tag: 'HR_Systems',
        expected_schema_ref: 'sales_schema',
        solution_query: 'SELECT * FROM orders WHERE amount > 500 AND order_date >= DATEADD(day, -30, GETDATE()) ORDER BY order_date DESC',
        schema_metadata: mockSchema
      },
      {
        id: 'q4',
        title: 'Salary Percentiles',
        prompt: 'Calculate the salary percentile for each employee using window functions.',
        difficulty: 'HARD',
        tags: ['Window Functions'],
        environment_tag: 'HR_Systems',
        expected_schema_ref: 'hr_schema',
        solution_query: 'SELECT name, salary, PERCENT_RANK() OVER (ORDER BY salary) as percentile FROM employees ORDER BY percentile DESC',
        schema_metadata: mockSchema
      },
      {
        id: 'q5',
        title: 'Unassigned Departments',
        prompt: 'Find all departments that currently have no employees assigned to them.',
        difficulty: 'EASY',
        tags: ['Outer Joins'],
        environment_tag: 'HR_Systems',
        expected_schema_ref: 'hr_schema',
        solution_query: 'SELECT d.dept_name FROM departments d LEFT JOIN employees e ON d.dept_id = e.dept_id WHERE e.emp_id IS NULL ORDER BY d.dept_name',
        schema_metadata: mockSchema
      }
    ]
  };

  const currentQuestion = assessmentData.questions[currentQuestionIndex];
  const currentQuery = queries[currentQuestion.id] || `-- Write your query for: ${currentQuestion.title}\nSELECT *\nFROM ${currentQuestion.id === 'q3' ? 'orders' : 'employees'}\nORDER BY 1;`;

  useEffect(() => {
    timerRef.current = window.setInterval(() => {
      setTimeLeft(prev => {
        if (prev <= 1) {
          if (timerRef.current) clearInterval(timerRef.current);
          return 0;
        }
        return prev - 1;
      });
    }, 1000);

    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
    };
  }, []);

  const formatTime = (seconds: number) => {
    const h = Math.floor(seconds / 3600);
    const m = Math.floor((seconds % 3600) / 60);
    const s = seconds % 60;
    return `${h.toString().padStart(2, '0')}:${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
  };

  const handleExecute = async () => {
    const query = queries[currentQuestion.id] || '';
    const upperQuery = query.toUpperCase();
    
    if (!upperQuery.includes('ORDER BY')) {
       setResult({
        columns: [],
        rows: [],
        execution_time_ms: 0,
        error: "Validation Error: ORDER BY is mandatory to ensure deterministic results. Please add an ORDER BY clause."
      });
      return;
    }

    setIsExecuting(true);
    setResult(null);
    
    await new Promise(r => setTimeout(r, 800));
    
    const dangerousTokens = ['DROP', 'DELETE', 'UPDATE', 'INSERT', 'TRUNCATE', 'ALTER', 'EXEC'];
    if (dangerousTokens.some(token => upperQuery.includes(token))) {
      setResult({
        columns: [],
        rows: [],
        execution_time_ms: 0,
        error: "Security Access Denied: Unauthorized command detected. Only SELECT statements are permitted."
      });
      setIsExecuting(false);
      return;
    }

    setResult({
      columns: ['name', 'salary', 'dept_name'],
      rows: [
        ['John Doe', 125000, 'Engineering'],
        ['Jane Smith', 110000, 'Marketing'],
      ],
      execution_time_ms: 45
    });
    setIsExecuting(false);
  };

  const finalizeSubmission = async () => {
    setIsSubmitting(true);
    if (timerRef.current) clearInterval(timerRef.current);
    await new Promise(r => setTimeout(r, 1500));
    setIsSubmitting(false);
    setShowConfirmModal(false);
    setIsFinished(true);
  };

  // --- Resizing Event Handlers ---
  const handleHorizontalResizeStart = (e: React.MouseEvent) => {
    e.preventDefault();
    const containerWidth = containerRef.current?.offsetWidth || window.innerWidth;
    const onMouseMove = (moveEvent: MouseEvent) => {
      const deltaPercent = (moveEvent.clientX / containerWidth) * 100;
      setSidebarWidth(Math.min(Math.max(deltaPercent, 15), 60));
    };
    const onMouseUp = () => {
      document.removeEventListener('mousemove', onMouseMove);
      document.removeEventListener('mouseup', onMouseUp);
      document.body.style.cursor = 'default';
    };
    document.addEventListener('mousemove', onMouseMove);
    document.addEventListener('mouseup', onMouseUp);
    document.body.style.cursor = 'col-resize';
  };

  const handleVerticalResizeStart = (e: React.MouseEvent) => {
    e.preventDefault();
    const containerHeight = rightPaneRef.current?.offsetHeight || window.innerHeight;
    const startY = e.clientY;
    const startHeight = resultsHeight;
    const onMouseMove = (moveEvent: MouseEvent) => {
      const deltaY = moveEvent.clientY - startY;
      const deltaPercent = (deltaY / containerHeight) * 100;
      setResultsHeight(Math.min(Math.max(startHeight - deltaPercent, 10), 80));
    };
    const onMouseUp = () => {
      document.removeEventListener('mousemove', onMouseMove);
      document.removeEventListener('mouseup', onMouseUp);
      document.body.style.cursor = 'default';
    };
    document.addEventListener('mousemove', onMouseMove);
    document.addEventListener('mouseup', onMouseUp);
    document.body.style.cursor = 'row-resize';
  };

  const handleQuestionChange = (index: number) => {
    setCurrentQuestionIndex(index);
    setResult(null); 
  };

  if (isFinished) {
    return (
      <div className="flex flex-col items-center justify-center p-12 text-center h-[calc(100vh-64px)] bg-white">
        <div className="w-24 h-24 bg-green-100 text-green-600 rounded-full flex items-center justify-center mb-8 animate-bounce">
          <CheckCircle className="w-12 h-12" />
        </div>
        <h1 className="text-5xl font-extrabold text-slate-900 mb-4 tracking-tight">Assessment Submitted</h1>
        <p className="text-slate-500 max-w-lg mx-auto mb-10 text-lg leading-relaxed">
          The evaluation engine is now validating your query logic against the target schema.
        </p>
        <button onClick={onExit} className="px-10 py-4 bg-slate-900 text-white font-bold rounded-2xl hover:bg-slate-800 transition shadow-2xl flex items-center gap-2">
          Return to Dashboard <ChevronRight className="w-5 h-5" />
        </button>
      </div>
    );
  }

  const filteredTables = currentQuestion.schema_metadata?.tables.filter(t => 
    t.name.toLowerCase().includes(schemaSearch.toLowerCase())
  ) || [];

  return (
    <div className="flex flex-col h-screen overflow-hidden bg-slate-50">
      {showConfirmModal && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-slate-900/60 backdrop-blur-sm" onClick={() => !isSubmitting && setShowConfirmModal(false)}></div>
          <div className="bg-white rounded-3xl p-8 max-w-md w-full shadow-2xl relative z-10 border border-slate-100">
            <h3 className="text-2xl font-bold text-slate-900 mb-2">Finalize Attempt?</h3>
            <p className="text-slate-500 mb-8 leading-relaxed">You have {timeLeft > 0 ? formatTime(timeLeft) : 'no time'} remaining.</p>
            <div className="flex gap-4">
              <button onClick={() => setShowConfirmModal(false)} className="flex-1 py-4 bg-slate-100 text-slate-600 rounded-2xl font-bold">Back</button>
              <button onClick={finalizeSubmission} className="flex-1 py-4 bg-blue-600 text-white rounded-2xl font-bold flex items-center justify-center gap-2">
                {isSubmitting ? <Loader2 className="w-5 h-5 animate-spin" /> : 'Confirm'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Persistent Header */}
      <div className="bg-white border-b border-gray-200 px-6 py-3 flex items-center justify-between shadow-sm z-10 shrink-0">
        <div className="flex items-center gap-6">
          <button onClick={onExit} className="p-2 hover:bg-gray-100 rounded-lg text-gray-400 transition"><X className="w-5 h-5" /></button>
          <div className="h-6 w-[1px] bg-gray-200"></div>
          <div>
            <span className="text-xs font-bold text-gray-400 uppercase tracking-widest block">Assessment</span>
            <span className="text-sm font-bold text-gray-900">{assessmentData.name}</span>
          </div>
        </div>
        <div className="flex items-center gap-6">
            <div className="flex flex-col items-end">
                <span className="text-[10px] text-gray-400 font-bold uppercase tracking-widest">Time Remaining</span>
                <span className={`text-sm font-mono font-bold ${timeLeft < 300 ? 'text-red-600 animate-pulse' : 'text-slate-900'}`}>{formatTime(timeLeft)}</span>
            </div>
            <button onClick={() => setShowConfirmModal(true)} className="bg-green-600 hover:bg-green-700 text-white font-bold px-6 py-2.5 rounded-xl shadow-lg transition flex items-center gap-2 active:scale-95">
              Finish <Send className="w-4 h-4" />
            </button>
        </div>
      </div>

      <div className="flex-1 flex overflow-hidden" ref={containerRef}>
        {/* Resizable Sidebar */}
        <div style={{ width: `${sidebarWidth}%` }} className="bg-white border-r border-gray-200 flex flex-col relative shrink-0">
          
          {/* Question Navigator Matrix */}
          <div className="p-4 border-b border-gray-100 bg-slate-50/30">
            <div className="flex items-center gap-2 mb-3 text-[10px] font-bold text-slate-400 uppercase tracking-widest"><Grid className="w-3 h-3" /> Step Navigator</div>
            <div className="flex flex-wrap gap-1.5">
              {assessmentData.questions.map((q, idx) => (
                <button
                  key={q.id}
                  onClick={() => handleQuestionChange(idx)}
                  className={`w-8 h-8 rounded-lg text-xs font-bold flex items-center justify-center transition-all border ${idx === currentQuestionIndex ? 'bg-blue-600 border-blue-600 text-white shadow-md' : queries[q.id] ? 'bg-emerald-50 border-emerald-200 text-emerald-600' : 'bg-white border-slate-200 text-slate-400 hover:border-slate-300'}`}
                >
                  {idx + 1}
                </button>
              ))}
            </div>
          </div>

          {/* 3-Tab Header */}
          <div className="flex border-b border-gray-100 px-2 shrink-0">
            <button onClick={() => setActiveTab('prompt')} className={`flex-1 py-3 text-[10px] font-bold uppercase tracking-widest flex items-center justify-center gap-1.5 transition-all relative ${activeTab === 'prompt' ? 'text-blue-600' : 'text-slate-400 hover:text-slate-600'}`}>
              <BookOpen className="w-3.5 h-3.5" /> Prompt {activeTab === 'prompt' && <div className="absolute bottom-0 left-0 right-0 h-0.5 bg-blue-600" />}
            </button>
            <button onClick={() => setActiveTab('explorer')} className={`flex-1 py-3 text-[10px] font-bold uppercase tracking-widest flex items-center justify-center gap-1.5 transition-all relative ${activeTab === 'explorer' ? 'text-blue-600' : 'text-slate-400 hover:text-slate-600'}`}>
              <Search className="w-3.5 h-3.5" /> Explorer {activeTab === 'explorer' && <div className="absolute bottom-0 left-0 right-0 h-0.5 bg-blue-600" />}
            </button>
            <button onClick={() => setActiveTab('diagram')} className={`flex-1 py-3 text-[10px] font-bold uppercase tracking-widest flex items-center justify-center gap-1.5 transition-all relative ${activeTab === 'diagram' ? 'text-blue-600' : 'text-slate-400 hover:text-slate-600'}`}>
              <Network className="w-3.5 h-3.5" /> Diagram {activeTab === 'diagram' && <div className="absolute bottom-0 left-0 right-0 h-0.5 bg-blue-600" />}
            </button>
          </div>

          {/* Tab Content */}
          <div className="flex-1 overflow-y-auto p-6">
            {activeTab === 'prompt' && (
              <div className="animate-in fade-in duration-300">
                <span className={`px-2 py-0.5 rounded-full text-[9px] font-bold uppercase tracking-wider border mb-3 inline-block ${currentQuestion.difficulty === 'HARD' ? 'bg-red-50 text-red-600' : 'bg-green-50 text-green-600'}`}>{currentQuestion.difficulty}</span>
                <h2 className="text-xl font-bold text-slate-900 mb-4">{currentQuestion.title}</h2>
                <p className="text-sm text-slate-700 leading-relaxed mb-8">{currentQuestion.prompt}</p>
                <div className="bg-slate-50 border border-slate-200 rounded-xl p-4 text-[11px] text-slate-500 space-y-2">
                  <p className="font-bold text-slate-400 uppercase tracking-widest mb-1">Constraints</p>
                  <p>• Mandatory <strong>ORDER BY</strong> clause.</p>
                  <p>• Max 100 result rows evaluated.</p>
                </div>
              </div>
            )}

            {activeTab === 'explorer' && (
              <div className="animate-in fade-in duration-300 flex flex-col h-full">
                <div className="relative mb-4"><Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" /><input type="text" placeholder="Search tables..." value={schemaSearch} onChange={(e) => setSchemaSearch(e.target.value)} className="w-full pl-9 pr-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs outline-none" /></div>
                <div className="space-y-4 overflow-y-auto pr-1 flex-1">
                  {filteredTables.map(table => (
                    <div key={table.name} className="border border-slate-100 rounded-xl bg-white overflow-hidden shadow-sm">
                      <div className="bg-slate-800 px-3 py-1.5 text-white text-[10px] font-bold flex justify-between uppercase tracking-wider">{table.name} <span className="text-slate-400">{table.columns.length}</span></div>
                      <div className="p-1">{table.columns.map(col => <div key={col.name} className="flex items-center justify-between text-[10px] px-2 py-1 hover:bg-slate-50 rounded"><span>{col.name}</span><span className="text-slate-400 uppercase text-[8px]">{col.type}</span></div>)}</div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {activeTab === 'diagram' && (
              <div className="h-full animate-in fade-in duration-300 border border-slate-100 rounded-2xl overflow-hidden shadow-inner">
                {currentQuestion.schema_metadata ? <SchemaVisualizer metadata={currentQuestion.schema_metadata} /> : <div className="p-12 text-center text-slate-400 text-xs">No diagram data.</div>}
              </div>
            )}
          </div>

          {/* Sidebar linear navigation */}
          <div className="p-4 border-t border-gray-100 bg-slate-50 flex items-center justify-between shrink-0">
             <button disabled={currentQuestionIndex === 0} onClick={() => handleQuestionChange(currentQuestionIndex - 1)} className="p-2.5 rounded-xl border border-slate-200 bg-white text-slate-600 hover:text-blue-600 disabled:opacity-30 transition-all"><ChevronLeft className="w-5 h-5" /></button>
             <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">{currentQuestionIndex + 1} / {assessmentData.questions.length}</span>
             <button disabled={currentQuestionIndex === assessmentData.questions.length - 1} onClick={() => handleQuestionChange(currentQuestionIndex + 1)} className="p-2.5 rounded-xl border border-slate-200 bg-white text-slate-600 hover:text-blue-600 disabled:opacity-30 transition-all"><ChevronRight className="w-5 h-5" /></button>
          </div>
        </div>

        {/* Horizontal Splitter */}
        <div className="w-1.5 hover:w-2.5 bg-slate-200 hover:bg-blue-400 cursor-col-resize transition-all z-20 flex items-center justify-center shrink-0" onMouseDown={handleHorizontalResizeStart}><div className="w-0.5 h-8 bg-slate-300 rounded" /></div>

        {/* Right Editor/Results Workspace */}
        <div className="flex-1 flex flex-col bg-slate-900 min-w-0" ref={rightPaneRef}>
          <div className="bg-slate-800 px-4 py-2 border-b border-slate-700 flex justify-between items-center h-14 shrink-0">
            <span className="text-[10px] text-slate-500 font-mono tracking-widest uppercase flex items-center gap-2"><div className="w-2 h-2 rounded-full bg-blue-500 animate-pulse" /> Workspace</span>
            <button onClick={handleExecute} disabled={isExecuting} className="bg-blue-600 hover:bg-blue-500 text-white px-5 py-2 rounded-lg font-bold text-xs transition flex items-center gap-2 disabled:opacity-50">{isExecuting ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <><Play className="w-3.5 h-3.5" /> Run Query</>}</button>
          </div>

          <div className="flex-1 relative overflow-hidden">
            <CodeMirror value={currentQuery} height="100%" theme="dark" extensions={[sql()]} onChange={(value) => setQueries(prev => ({...prev, [currentQuestion.id]: value}))} className="h-full text-sm font-mono" basicSetup={{ lineNumbers: true, autocompletion: true, bracketMatching: true }} />
          </div>

          {/* Vertical Splitter */}
          <div className="h-1.5 hover:h-2.5 bg-slate-700 hover:bg-blue-500 cursor-row-resize transition-all z-20 w-full flex justify-center items-center shrink-0" onMouseDown={handleVerticalResizeStart}><div className="h-0.5 w-8 bg-slate-500 rounded" /></div>

          {/* Results Area */}
          <div style={{ height: `${resultsHeight}%` }} className="bg-slate-800 border-t border-slate-700 overflow-auto shrink-0 custom-scrollbar">
            {result?.error ? (
              <div className="p-8 flex items-start gap-4 text-red-400 bg-red-950/20"><AlertCircle className="w-6 h-6 shrink-0 mt-0.5" /><div><h5 className="font-bold text-xs uppercase tracking-wider mb-1 text-red-300">Runtime Error</h5><p className="text-xs font-medium opacity-90 leading-relaxed">{result.error}</p></div></div>
            ) : result ? (
               <table className="w-full text-left text-xs text-slate-300 border-separate border-spacing-0"><thead className="sticky top-0 bg-slate-800 z-10"><tr>{result.columns.map(col => <th key={col} className="px-6 py-4 font-bold uppercase text-[9px] tracking-widest text-slate-500 border-b border-slate-700">{col}</th>)}</tr></thead><tbody className="divide-y divide-slate-700/50">{result.rows.map((row, i) => <tr key={i} className="hover:bg-slate-700/20 transition group">{row.map((cell, j) => <td key={j} className="px-6 py-3 font-mono text-[10px] text-slate-400 group-hover:text-white">{String(cell)}</td>)}</tr>)}</tbody></table>
            ) : (
              <div className="h-full flex flex-col items-center justify-center text-slate-600 text-[10px] italic gap-3 px-12 text-center"><div className="p-4 bg-slate-700/30 rounded-full"><Play className="w-6 h-6 opacity-20" /></div><p className="font-bold uppercase tracking-widest text-slate-500">Execution Output</p><p>Run your query to preview the dataset. Only SELECT statements with ORDER BY are permitted.</p></div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

export default AssessmentView;
