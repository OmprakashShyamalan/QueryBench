
import React, { useCallback, useEffect, useMemo } from 'react';
import { SchemaMetadata } from '../types';
import { 
  ReactFlow, 
  Background, 
  useNodesState, 
  useEdgesState, 
  Handle, 
  Position, 
  MarkerType,
  ReactFlowProvider,
  useReactFlow,
  Panel
} from '@xyflow/react';
import dagre from 'dagre';
import { Layout } from 'lucide-react';

// --- Custom Node Component ---
const TableNode = ({ data }: any) => {
  return (
    <div className="flex flex-col text-[10px] bg-white rounded-lg overflow-hidden border border-slate-200 shadow-xl min-w-[180px]">
      {/* Table Header */}
      <div className="bg-slate-800 px-3 py-2 text-white font-bold flex items-center justify-between border-b border-slate-700">
        <span className="truncate mr-2 uppercase tracking-wider">{data.label}</span>
        <span className="text-[9px] bg-slate-700 px-1.5 py-0.5 rounded opacity-80">{data.columns.length}</span>
      </div>
      
      {/* Column List */}
      <div className="divide-y divide-slate-100 bg-white">
        {data.columns.map((col: any, idx: number) => (
          <div key={idx} className="px-3 py-1.5 flex items-center justify-between group hover:bg-slate-50 relative">
            <div className="flex items-center gap-1.5 overflow-hidden">
              <div className="w-4 shrink-0 flex justify-center text-[8px] font-black">
                {col.isPrimaryKey && <span className="text-amber-500">PK</span>}
                {col.isForeignKey && <span className="text-blue-500">FK</span>}
              </div>
              <span className={`truncate ${col.isPrimaryKey ? 'font-bold text-slate-900' : 'text-slate-600'}`}>
                {col.name}
              </span>
            </div>
            <span className="text-[8px] text-slate-400 font-mono ml-2 shrink-0 bg-slate-50 px-1 rounded border border-slate-100 uppercase">
              {col.type}
            </span>
            
            <Handle type="source" position={Position.Right} className="!opacity-0 !w-0 !h-0" id={`source-${col.name}`} />
            <Handle type="target" position={Position.Left} className="!opacity-0 !w-0 !h-0" id={`target-${col.name}`} />
          </div>
        ))}
      </div>
    </div>
  );
};

const nodeTypes = { table: TableNode };

const getLayoutedElements = (nodes: any[], edges: any[]) => {
  const dagreGraph = new dagre.graphlib.Graph();
  dagreGraph.setDefaultEdgeLabel(() => ({}));

  const nodeWidth = 220;
  dagreGraph.setGraph({ rankdir: 'LR', nodesep: 50, ranksep: 100 });

  nodes.forEach((node) => {
    const height = 40 + (node.data.columns.length * 28);
    dagreGraph.setNode(node.id, { width: nodeWidth, height });
  });

  edges.forEach((edge) => {
    dagreGraph.setEdge(edge.source, edge.target);
  });

  dagre.layout(dagreGraph);

  const layoutedNodes = nodes.map((node) => {
    const nodeWithPosition = dagreGraph.node(node.id);
    return {
      ...node,
      position: {
        x: nodeWithPosition.x - nodeWidth / 2,
        y: nodeWithPosition.y - nodeWithPosition.height / 2,
      },
    };
  });

  return { nodes: layoutedNodes, edges };
};

interface Props {
  metadata: SchemaMetadata;
}

const SchemaVisualizerInner: React.FC<Props> = ({ metadata }) => {
  const [nodes, setNodes, onNodesChange] = useNodesState([]);
  const [edges, setEdges, onEdgesChange] = useEdgesState([]);
  const { fitView, getNodes } = useReactFlow();

  const { initialNodes, initialEdges } = useMemo(() => {
    const newNodes = metadata.tables.map((table) => ({
      id: table.name,
      type: 'table',
      data: { label: table.name, columns: table.columns },
      position: { x: 0, y: 0 },
      className: 'react-flow__node-table',
    }));

    const newEdges: any[] = [];
    metadata.tables.forEach((table) => {
      table.columns.forEach((col) => {
        if (col.isForeignKey && col.references) {
          newEdges.push({
            id: `e-${table.name}-${col.name}-${col.references.table}`,
            source: table.name,
            target: col.references.table,
            sourceHandle: `source-${col.name}`,
            targetHandle: `target-${col.references.column}`,
            type: 'smoothstep',
            animated: false,
            style: { stroke: '#64748b', strokeWidth: 2 },
            markerEnd: { type: MarkerType.ArrowClosed, color: '#64748b', width: 20, height: 20 },
          });
        }
      });
    });

    return { initialNodes: newNodes, initialEdges: newEdges };
  }, [metadata]);

  useEffect(() => {
    const { nodes: layoutedNodes, edges: layoutedEdges } = getLayoutedElements(initialNodes, initialEdges);
    setNodes(layoutedNodes);
    setEdges(layoutedEdges);
    window.requestAnimationFrame(() => fitView({ padding: 0.2 }));
  }, [initialNodes, initialEdges, fitView, setNodes, setEdges]);

  const onAutoLayout = useCallback(() => {
    const { nodes: layoutedNodes, edges: layoutedEdges } = getLayoutedElements(getNodes(), edges);
    setNodes(layoutedNodes);
    setEdges(layoutedEdges);
    window.requestAnimationFrame(() => fitView({ duration: 800, padding: 0.2 }));
  }, [getNodes, edges, setNodes, setEdges, fitView]);

  return (
    <div className="h-full w-full bg-slate-50 relative group">
      <ReactFlow
        nodes={nodes}
        edges={edges}
        onNodesChange={onNodesChange}
        onEdgesChange={onEdgesChange}
        nodeTypes={nodeTypes}
        fitView
        minZoom={0.05}
        maxZoom={1.5}
        proOptions={{ hideAttribution: true }}
      >
        <Background color="#e2e8f0" gap={20} size={1} />
        <Panel position="top-right" className="flex gap-2">
           <button 
            onClick={onAutoLayout} 
            className="p-2.5 bg-white rounded-xl shadow-lg border border-slate-200 text-slate-600 hover:text-blue-600 hover:border-blue-200 transition-all active:scale-95" 
            title="Auto Layout Diagram"
           >
             <Layout className="w-4 h-4" />
           </button>
        </Panel>
      </ReactFlow>
    </div>
  );
};

const SchemaVisualizer: React.FC<Props> = (props) => {
  return (
    <div className="h-full w-full overflow-hidden">
      <ReactFlowProvider>
        <SchemaVisualizerInner {...props} />
      </ReactFlowProvider>
    </div>
  );
};

export default SchemaVisualizer;
