
import React, { useState, useEffect, useRef } from 'react';
import { QueryResult, SchemaMetadata } from '../types';
import { 
  Play, Send, ChevronLeft, ChevronRight, X, AlertCircle, 
  CheckCircle, BookOpen, Network, Grid, Search, Loader2, CheckSquare, AlertOctagon
} from 'lucide-react';
import CodeMirror from '@uiw/react-codemirror';
import { sql } from '@codemirror/lang-sql';
import { autocompletion, CompletionContext, CompletionResult } from '@codemirror/autocomplete';
import SchemaVisualizer from './SchemaVisualizer';
import { assessmentsApi, attemptsApi, schemaApi, assignmentsApi, ApiAttempt, ApiAssessmentFull, ApiSubmitResult, ApiQuestion, ApiValidationResult } from '../services/api';
import { AssessmentHeader } from './AssessmentView/AssessmentHeader';

interface Props {
  assessmentId: string;
  onExit: () => void;
}

const AssessmentView: React.FC<Props> = ({ assessmentId: assignmentId, onExit }) => {
  // Data state
  const [assessment, setAssessment] = useState<ApiAssessmentFull | null>(null);
  const [attempt, setAttempt] = useState<ApiAttempt | null>(null);
  const [schema, setSchema] = useState<SchemaMetadata | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // UI state
  const [currentQuestionIndex, setCurrentQuestionIndex] = useState(0);
  const [activeTab, setActiveTab] = useState<'prompt' | 'explorer' | 'diagram'>('prompt');
  
  // Interaction state
  const [queries, setQueries] = useState<Record<string, string>>({});
  const [result, setResult] = useState<QueryResult | null>(null);
  const [isExecuting, setIsExecuting] = useState(false);
  const [validationResult, setValidationResult] = useState<ApiValidationResult | null>(null);
  const [isValidating, setIsValidating] = useState(false);
  const [isFinished, setIsFinished] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [showConfirmModal, setShowConfirmModal] = useState(false);
  const [schemaSearch, setSchemaSearch] = useState('');
  
  // Timer
  const [timeLeft, setTimeLeft] = useState(3600);
  const timerRef = useRef<number | null>(null);

  // Resizing State (Percentages)
  const [sidebarWidth, setSidebarWidth] = useState(30); 
  const [resultsHeight, setResultsHeight] = useState(35);
  const containerRef = useRef<HTMLDivElement>(null);
  const rightPaneRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const loadData = async () => {
      try {
        setIsLoading(true);
        setError(null);
        
        const attempt = await assignmentsApi.startAttempt(Number(assignmentId));
        setAttempt(attempt);

        const assignment = await assignmentsApi.get(Number(assignmentId));
        const assessmentData = await assessmentsApi.full(assignment.assessment);
        setAssessment(assessmentData);
        setTimeLeft(assessmentData.duration_minutes * 60);

        if (assessmentData.db_config) {
          const schemaData = await schemaApi.get(assessmentData.db_config);
          setSchema(schemaData);
        } else {
          setSchema({ tables: [] });
        }
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to load assessment data.');
      } finally {
        setIsLoading(false);
      }
    };
    loadData();
  }, [assignmentId]);

  useEffect(() => {
    if (!isLoading && !isFinished) {
      timerRef.current = window.setInterval(() => {
        setTimeLeft(prev => {
          if (prev <= 1) {
            if (timerRef.current) clearInterval(timerRef.current);
            // Auto-submit
            finalizeSubmission();
            return 0;
          }
          return prev - 1;
        });
      }, 1000);
    }
    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
    };
  }, [isLoading, isFinished]);

  const handleExecute = async () => {
    if (!assessment || !attempt) return;
    const currentQuestion = assessment.questions_data[currentQuestionIndex];
    const query = queries[currentQuestion.id] || '';
    
    if (!query.trim()) {
      setResult({ columns: [], rows: [], execution_time_ms: 0, error: "Cannot execute an empty query." });
      setValidationResult(null);
      return;
    }

    setIsExecuting(true);
    setResult(null);
    setValidationResult(null);
    try {
      const resultData = await attemptsApi.runQuery(query, assessment.db_config);
      setResult(resultData);

      // Validate the query against expected solution
      if (!resultData.error) {
        setIsValidating(true);
        try {
          const validation = await attemptsApi.validateQuery(query, currentQuestion.id, assessment.db_config);
          setValidationResult(validation);
        } catch (err) {
          // If validation fails, don't break the UI - just log it
          console.warn('Query validation failed (non-critical):', err);
          setValidationResult({
            status: 'ERROR',
            feedback: 'Real-time validation unavailable. Your query has executed successfully.'
          });
        } finally {
          setIsValidating(false);
        }
      }
    } catch (err: unknown) {
      setResult({
        columns: [],
        rows: [],
        execution_time_ms: 0,
        error: err instanceof Error ? err.message : 'An unknown error occurred.',
      });
      setValidationResult(null);
    } finally {
      setIsExecuting(false);
    }
  };

  const finalizeSubmission = async () => {
    if (!attempt || !assessment) return;
    setIsSubmitting(true);
    if (timerRef.current) clearInterval(timerRef.current);

    try {
      const submissions: Promise<ApiSubmitResult>[] = assessment.questions_data.map(q => {
        const query = queries[q.id] || '';
        return attemptsApi.submitAnswer(attempt.id, q.id, query);
      });
      await Promise.all(submissions);
      await attemptsApi.finalize(attempt.id);
      setIsFinished(true);
    } catch (err) {
      alert('An error occurred while submitting your answers, but your attempt has been recorded.');
      setIsFinished(true); 
    } finally {
      setIsSubmitting(false);
      setShowConfirmModal(false);
    }
  };

  const handleQuestionChange = (index: number) => {
    setCurrentQuestionIndex(index);
    setResult(null);
    setValidationResult(null);
  };
  
  // Enhanced SQL Autocomplete with schema metadata and smart matching
  const sqlAutocomplete = (context: CompletionContext) => {
    if (!schema) return null;
    
    const word = context.matchBefore(/[\w.]*[\w]*/i);
    if (!word || word.text.length === 0) return null;

    const completions: any = {
      Tables: [],
      Columns: [],
      Keywords: [],
      Functions: [],
    };

    const matchText = word.text.toLowerCase();
    
    // 1. Add all table names with high boost priority
    schema.tables.forEach(table => {
      if (table.name.toLowerCase().startsWith(matchText) || matchText.length === 0) {
        completions.Tables.push({
          label: table.name,
          type: 'class',
          info: `Table (${table.columns.length} columns)`,
          boost: 100,
          detail: `${table.columns.length} columns`,
        });
      }
    });

    // 2. Add column names (both with and without table prefix)
    schema.tables.forEach(table => {
      table.columns.forEach(col => {
        const colLower = col.name.toLowerCase();
        
        // Show both unprefixed and prefixed versions
        if (colLower.startsWith(matchText) || matchText.length === 0) {
          // Unprefixed column name
          completions.Columns.push({
            label: col.name,
            type: 'property',
            info: `${col.type} (from ${table.name})`,
            boost: 90,
            detail: `${table.name}.${col.name}`,
          });
          
          // Also add prefixed version
          const prefixed = `${table.name}.${col.name}`;
          if (prefixed.toLowerCase().startsWith(matchText)) {
            completions.Columns.push({
              label: prefixed,
              type: 'property',
              info: `${col.type}`,
              boost: 85,
            });
          }
        }
      });
    });

    // 3. SQL Keywords - comprehensive list with common functions
    const keywords = [
      'SELECT', 'FROM', 'WHERE', 'AND', 'OR', 'NOT',
      'JOIN', 'LEFT JOIN', 'INNER JOIN', 'RIGHT JOIN', 'FULL JOIN', 'CROSS JOIN',
      'ON', 'USING',
      'ORDER BY', 'GROUP BY', 'HAVING',
      'DISTINCT', 'ALL',
      'LIMIT', 'OFFSET', 'TOP',
      'AS', 'CASE', 'WHEN', 'THEN', 'ELSE', 'END',
      'IN', 'BETWEEN', 'LIKE', 'IS', 'NULL',
      'UNION', 'UNION ALL', 'INTERSECT', 'EXCEPT',
      'WITH', 'CTE',
      'COUNT', 'SUM', 'AVG', 'MIN', 'MAX',
      'CONCAT', 'SUBSTRING', 'UPPER', 'LOWER', 'TRIM',
      'CAST', 'CONVERT', 'DATEDIFF', 'GETDATE',
    ];

    keywords.forEach(kw => {
      if (kw.toLowerCase().startsWith(matchText)) {
        completions.Keywords.push({
          label: kw,
          type: 'keyword',
          boost: 70,
        });
      }
    });

    // Flatten and sort by relevance
    let allOptions: any[] = [];
    const sections = [completions.Tables, completions.Columns, completions.Keywords];
    sections.forEach(section => {
      allOptions = allOptions.concat(section.sort((a: any, b: any) => (b.boost || 0) - (a.boost || 0)));
    });

    // Deduplicate by label (keep first occurrence with highest boost)
    const seen = new Set<string>();
    allOptions = allOptions.filter(opt => {
      if (seen.has(opt.label.toLowerCase())) return false;
      seen.add(opt.label.toLowerCase());
      return true;
    });

    return {
      from: word.from,
      options: allOptions.slice(0, 100), // Increased limit for better coverage
    };
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

  // --- Render logic ---

  if (isLoading) {
    return (
      <div className="flex flex-col items-center justify-center h-screen bg-slate-50">
        <Loader2 className="w-8 h-8 text-blue-500 animate-spin mb-4" />
        <p className="text-sm font-medium text-slate-500">Loading assessment...</p>
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex flex-col items-center justify-center h-screen bg-slate-50 p-8">
        <AlertCircle className="w-12 h-12 text-red-500 mb-4" />
        <h2 className="text-xl font-bold text-slate-800 mb-2">Failed to Load</h2>
        <p className="text-sm text-red-600 bg-red-50 p-4 rounded-xl max-w-md w-full text-center mb-6">{error}</p>
        <button onClick={onExit} className="px-6 py-2 bg-slate-700 text-white font-bold rounded-xl hover:bg-slate-600 transition">
          Return to Dashboard
        </button>
      </div>
    );
  }
  
  if (isFinished) {
    return (
      <div className="flex flex-col items-center justify-center p-12 text-center h-screen bg-white">
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

  if (!assessment) return null; // Should not happen if not loading and no error

  const currentQuestion: ApiQuestion = assessment.questions_data[currentQuestionIndex];
  const currentQuery = queries[currentQuestion.id] || `-- Write your query for: ${currentQuestion.title}\n`;
  const filteredTables = schema?.tables.filter(t => 
    t.name.toLowerCase().includes(schemaSearch.toLowerCase())
  ) || [];

  return (
    <div className="flex flex-col h-screen overflow-hidden bg-slate-50">
      {showConfirmModal && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-slate-900/60 backdrop-blur-sm" onClick={() => !isSubmitting && setShowConfirmModal(false)}></div>
          <div className="bg-white rounded-3xl p-8 max-w-md w-full shadow-2xl relative z-10 border border-slate-100">
            <h3 className="text-2xl font-bold text-slate-900 mb-2">Finalize Attempt?</h3>
            <p className="text-slate-500 mb-8 leading-relaxed">You have {timeLeft > 0 ? new Date(timeLeft * 1000).toISOString().substr(11, 8) : 'no time'} remaining.</p>
            <div className="flex gap-4">
              <button onClick={() => setShowConfirmModal(false)} className="flex-1 py-4 bg-slate-100 text-slate-600 rounded-2xl font-bold">Back</button>
              <button onClick={finalizeSubmission} className="flex-1 py-4 bg-blue-600 text-white rounded-2xl font-bold flex items-center justify-center gap-2">
                {isSubmitting ? <Loader2 className="w-5 h-5 animate-spin" /> : 'Confirm'}
              </button>
            </div>
          </div>
        </div>
      )}

      <AssessmentHeader
        assessmentName={assessment.name}
        onExit={onExit}
        timeLeft={timeLeft}
        onSubmit={() => setShowConfirmModal(true)}
      />

      <div className="flex-1 flex overflow-hidden" ref={containerRef}>
        <div style={{ width: `${sidebarWidth}%` }} className="bg-white border-r border-gray-200 flex flex-col relative shrink-0">
          <div className="p-4 border-b border-gray-100 bg-slate-50/30">
            <div className="flex items-center gap-2 mb-3 text-[10px] font-bold text-slate-400 uppercase tracking-widest"><Grid className="w-3 h-3" /> Step Navigator</div>
            <div className="flex flex-wrap gap-1.5">
              {assessment.questions_data.map((q, idx) => (
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

          <div className="flex-1 overflow-y-auto p-6">
            {activeTab === 'prompt' && (
              <div className="animate-in fade-in duration-300">
                <span className={`px-2 py-0.5 rounded-full text-[9px] font-bold uppercase tracking-wider border mb-3 inline-block ${currentQuestion.difficulty === 'HARD' ? 'bg-red-50 text-red-600' : 'bg-green-50 text-green-600'}`}>{currentQuestion.difficulty}</span>
                <h2 className="text-xl font-bold text-slate-900 mb-4">{currentQuestion.title}</h2>
                <p className="text-sm text-slate-700 leading-relaxed mb-8" dangerouslySetInnerHTML={{ __html: currentQuestion.prompt.replace(/\n/g, '<br/>') }} />
                <div className="bg-slate-50 border border-slate-200 rounded-xl p-4 text-[11px] text-slate-500 space-y-2">
                  <p className="font-bold text-slate-400 uppercase tracking-widest mb-1">Constraints</p>
                  <p>• Max 5000 result rows.</p>
                  <p>• 5 second query timeout.</p>
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
                {schema ? <SchemaVisualizer metadata={schema} /> : <div className="p-12 text-center text-slate-400 text-xs">No diagram data.</div>}
              </div>
            )}
          </div>

          <div className="p-4 border-t border-gray-100 bg-slate-50 flex items-center justify-between shrink-0">
             <button disabled={currentQuestionIndex === 0} onClick={() => handleQuestionChange(currentQuestionIndex - 1)} className="p-2.5 rounded-xl border border-slate-200 bg-white text-slate-600 hover:text-blue-600 disabled:opacity-30 transition-all"><ChevronLeft className="w-5 h-5" /></button>
             <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">{currentQuestionIndex + 1} / {assessment.questions_data.length}</span>
             <button disabled={currentQuestionIndex === assessment.questions_data.length - 1} onClick={() => handleQuestionChange(currentQuestionIndex + 1)} className="p-2.5 rounded-xl border border-slate-200 bg-white text-slate-600 hover:text-blue-600 disabled:opacity-30 transition-all"><ChevronRight className="w-5 h-5" /></button>
          </div>
        </div>

        <div className="w-1.5 hover:w-2.5 bg-slate-200 hover:bg-blue-400 cursor-col-resize transition-all z-20 flex items-center justify-center shrink-0" onMouseDown={handleHorizontalResizeStart}><div className="w-0.5 h-8 bg-slate-300 rounded" /></div>

        <div className="flex-1 flex flex-col bg-slate-900 min-w-0" ref={rightPaneRef}>
          <div className="bg-slate-800 px-4 py-2 border-b border-slate-700 flex justify-between items-center h-14 shrink-0">
            <span className="text-[10px] text-slate-500 font-mono tracking-widest uppercase flex items-center gap-2"><div className="w-2 h-2 rounded-full bg-blue-500 animate-pulse" /> Workspace</span>
            <button onClick={handleExecute} disabled={isExecuting || isValidating} className="bg-blue-600 hover:bg-blue-500 text-white px-5 py-2 rounded-lg font-bold text-xs transition flex items-center gap-2 disabled:opacity-50">{isExecuting || isValidating ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <><Play className="w-3.5 h-3.5" /> Run Query</>}</button>
          </div>

          <div className="flex-1 relative overflow-hidden">
            <CodeMirror 
              value={currentQuery} 
              height="100%" 
              theme="dark" 
              extensions={[
                sql(), 
                autocompletion({ 
                  override: [sqlAutocomplete],
                  maxRenderedOptions: 100,
                })
              ]} 
              onChange={(value) => setQueries(prev => ({...prev, [currentQuestion.id]: value}))} 
              className="h-full text-sm font-mono" 
              basicSetup={{ 
                lineNumbers: true, 
                autocompletion: true, 
                bracketMatching: true,
                highlightActiveLine: true,
                foldGutter: true,
              }}
            />
          </div>

          <div className="h-1.5 hover:h-2.5 bg-slate-700 hover:bg-blue-500 cursor-row-resize transition-all z-20 w-full flex justify-center items-center shrink-0" onMouseDown={handleVerticalResizeStart}><div className="h-0.5 w-8 bg-slate-500 rounded" /></div>

          <div style={{ height: `${resultsHeight}%` }} className="bg-slate-800 border-t border-slate-700 overflow-auto shrink-0 custom-scrollbar flex flex-col">
            {/* Validation Indicator */}
            {validationResult && (
              <div className={`px-8 py-4 border-b border-slate-700 flex items-start gap-4 ${validationResult.status === 'CORRECT' ? 'bg-green-950/30' : validationResult.status === 'INCORRECT' ? 'bg-amber-950/30' : 'bg-slate-800/50'}`}>
                <div className="flex items-center gap-3 flex-1">
                  {validationResult.status === 'CORRECT' ? (
                    <>
                      <CheckCircle className="w-5 h-5 text-green-400 shrink-0 mt-0.5" />
                      <div>
                        <h5 className="font-bold text-xs uppercase tracking-wider text-green-300">✓ Query Correct!</h5>
                        <p className="text-xs text-green-200 opacity-90 mt-1">Your query matches the expected output perfectly!</p>
                        {validationResult.execution_metadata && (
                          <p className="text-xs text-green-300 opacity-75 mt-1">Execution time: {validationResult.execution_metadata.duration_ms}ms | Rows returned: {validationResult.execution_metadata.rows_returned}</p>
                        )}
                      </div>
                    </>
                  ) : validationResult.status === 'INCORRECT' ? (
                    <>
                      <AlertOctagon className="w-5 h-5 text-amber-400 shrink-0 mt-0.5" />
                      <div className="w-full">
                        <h5 className="font-bold text-xs uppercase tracking-wider text-amber-300">✗ Result Mismatch</h5>
                        <p className="text-xs text-amber-200 opacity-90 mt-1.5"><strong>Issue:</strong> {validationResult.feedback || 'Your query does not match the expected output.'}</p>
                        
                        <div className="mt-3 bg-amber-900/30 border border-amber-700/40 rounded px-3 py-2">
                          <p className="text-xs text-amber-200 font-mono space-y-1">
                            <span className="block">💡 <strong>What to check:</strong></span>
                            {validationResult.feedback?.toLowerCase().includes('column') && (
                              <span className="block text-amber-100">• Verify column names and order match the solution</span>
                            )}
                            {validationResult.feedback?.toLowerCase().includes('row') && (
                              <span className="block text-amber-100">• Check your WHERE clause and filters</span>
                            )}
                            {validationResult.feedback?.toLowerCase().includes('order') && (
                              <span className="block text-amber-100">• Verify your ORDER BY clause for correct sorting</span>
                            )}
                            {!validationResult.feedback?.toLowerCase().includes('column') && !validationResult.feedback?.toLowerCase().includes('row') && !validationResult.feedback?.toLowerCase().includes('order') && (
                              <>
                                <span className="block text-amber-100">• Verify your WHERE conditions</span>
                                <span className="block text-amber-100">• Check your JOIN conditions if applicable</span>
                                <span className="block text-amber-100">• Review GROUP BY and ORDER BY clauses</span>
                              </>
                            )}
                          </p>
                        </div>
                      </div>
                    </>
                  ) : (
                    <>
                      <AlertCircle className="w-5 h-5 text-slate-400 shrink-0 mt-0.5" />
                      <div>
                        <h5 className="font-bold text-xs uppercase tracking-wider text-slate-300">Validation Skipped</h5>
                        <p className="text-xs text-slate-200 opacity-90 mt-1">{validationResult.feedback || 'Validation could not be performed.'}</p>
                      </div>
                    </>
                  )}
                </div>
              </div>
            )}

            {/* Query Results */}
            {result?.error ? (
              <div className="p-8 flex flex-col gap-4">
                <div className="flex items-start gap-4 text-red-400 bg-red-950/20 p-4 rounded-lg">
                  <AlertCircle className="w-6 h-6 shrink-0 mt-0.5" />
                  <div className="flex-1">
                    <h5 className="font-bold text-xs uppercase tracking-wider mb-2 text-red-300">Query Execution Failed</h5>
                    <p className="text-xs font-medium opacity-90 leading-relaxed">{result.error}</p>
                  </div>
                </div>
                
                <div className="bg-slate-700/20 p-4 rounded-lg border border-slate-600/30">
                  <p className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-3">Debugging Steps:</p>
                  <ol className="text-xs text-slate-300 space-y-1.5 leading-relaxed list-decimal list-inside">
                    <li>Click the <strong>Explorer</strong> tab on the left to see <strong>all available tables</strong></li>
                    <li>Verify that your table name matches exactly (including case)</li>
                    <li>Verify column names match exactly as shown in Explorer</li>
                    <li>Ensure you have an <strong>ORDER BY</strong> clause</li>
                    <li>Check for correct SQL syntax (WHERE, JOIN, GROUP BY)</li>
                  </ol>
                </div>

                {schema && schema.tables.length > 0 && (
                  <div className="bg-slate-800/50 p-4 rounded-lg border border-slate-600/30">
                    <p className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-2">Available Tables:</p>
                    <div className="flex flex-wrap gap-2">
                      {schema.tables.map(table => (
                        <div key={table.name} className="bg-slate-700/50 px-3 py-1.5 rounded-lg text-xs font-mono text-slate-300 border border-slate-600/50">
                          {table.name}
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            ) : result ? (
               <table className="w-full text-left text-xs text-slate-300 border-separate border-spacing-0 flex-1"><thead className="sticky top-0 bg-slate-800 z-10"><tr>{result.columns.map(col => <th key={col} className="px-6 py-4 font-bold uppercase text-[9px] tracking-widest text-slate-500 border-b border-slate-700">{col}</th>)}</tr></thead><tbody className="divide-y divide-slate-700/50">{result.rows.map((row, i) => <tr key={i} className="hover:bg-slate-700/20 transition group">{row.map((cell, j) => <td key={j} className="px-6 py-3 font-mono text-[10px] text-slate-400 group-hover:text-white">{String(cell === null ? 'NULL' : cell)}</td>)}</tr>)}</tbody></table>
            ) : (
              <div className="h-full flex flex-col items-center justify-center text-slate-600 text-[10px] italic gap-3 px-12 text-center"><div className="p-4 bg-slate-700/30 rounded-full"><Play className="w-6 h-6 opacity-20" /></div><p className="font-bold uppercase tracking-widest text-slate-500">Execution Output</p><p>Run your query to preview the dataset.</p></div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

export default AssessmentView;
