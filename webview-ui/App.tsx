import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type MouseEvent as ReactMouseEvent,
} from 'react';
import {
  Background,
  Controls,
  Panel,
  ReactFlow,
  ReactFlowProvider,
  applyEdgeChanges,
  applyNodeChanges,
  useReactFlow,
  type Edge,
  type EdgeChange,
  type Node,
  type NodeChange,
  type NodeTypes,
} from '@xyflow/react';
import type { DiagramGraph } from '../src/diagram/graph';
import { buildFlowElements, type FlowElements } from '../src/diagram/flow';
import { layoutDiagram } from '../src/diagram/layout';
import { mergeFlowNodes } from '../src/diagram/positions';
import type { MessageToExtension, MessageToWebview } from '../src/shared/protocol';
import {
  DiagramInteractionContext,
  type DiagramInteractionContextValue,
} from './diagram-interaction-context';
import { TableNode } from './TableNode';

const vscode = window.acquireVsCodeApi();

const nodeTypes: NodeTypes = { table: TableNode };

interface FormState {
  model: string;
  column: string;
  dataType: string;
  description: string;
}

interface ColumnRef {
  model: string;
  column: string;
}

export function App(): JSX.Element {
  const [graph, setGraph] = useState<DiagramGraph | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pendingErrors, setPendingErrors] = useState<string[]>([]);
  const [form, setForm] = useState<FormState>({
    model: '',
    column: '',
    dataType: '',
    description: '',
  });
  const [hoveredEdgeId, setHoveredEdgeId] = useState<string | null>(null);
  const [hoveredColumn, setHoveredColumn] = useState<ColumnRef | null>(null);
  const [layoutTick, setLayoutTick] = useState(0);

  useEffect(() => {
    const listener = (event: MessageEvent<MessageToWebview>): void => {
      const message = event.data;
      switch (message.type) {
        case 'diagram:update':
          setGraph(message.diagram);
          setPendingErrors(message.pendingErrors.map((pending) => `${pending.uri}: ${pending.message}`));
          setError(null);
          break;
        case 'diagram:error':
          setError(message.message);
          break;
      }
    };
    window.addEventListener('message', listener);
    vscode.postMessage({ type: 'webview:ready' } satisfies MessageToExtension);
    return () => window.removeEventListener('message', listener);
  }, []);

  // The layout library re-runs when the graph changes or the user clicks
  // Auto-layout; hover changes only re-derive highlights below, so node
  // positions (and manual drags) stay stable across hovers.
  const flow = useMemo<FlowElements | null>(() => {
    if (graph === null) return null;
    return buildFlowElements(graph, layoutDiagram(graph));
  }, [graph, layoutTick]);

  const activeEdgeIds = useMemo(() => {
    if (flow === null) return new Set<string>();
    const set = new Set<string>();
    if (hoveredEdgeId !== null) set.add(hoveredEdgeId);
    if (hoveredColumn !== null) {
      for (const edge of flow.edges) {
        if (edge.data.sourceColumn === undefined) continue;
        const touches =
          (edge.source === hoveredColumn.model &&
            edge.data.sourceColumn === hoveredColumn.column) ||
          (edge.target === hoveredColumn.model &&
            edge.data.targetColumn === hoveredColumn.column);
        if (touches) set.add(edge.id);
      }
    }
    return set;
  }, [flow, hoveredEdgeId, hoveredColumn]);

  const edges = useMemo<Edge[]>(() => {
    if (flow === null) return [];
    return flow.edges.map((edge) => ({
      ...edge,
      className: activeEdgeIds.has(edge.id) ? 'edge--active' : undefined,
      // Every active edge flows (dashes travel child -> parent): the hovered
      // edge, or all edges touching a hovered column (spec 03).
      animated: activeEdgeIds.has(edge.id),
    }));
  }, [flow, activeEdgeIds]);

  const highlightedColumns = useMemo(() => {
    const byModel = new Map<string, Set<string>>();
    if (flow === null) return byModel;
    const add = (model: string, column: string): void => {
      let set = byModel.get(model);
      if (set === undefined) {
        set = new Set();
        byModel.set(model, set);
      }
      set.add(column);
    };
    if (hoveredColumn !== null) add(hoveredColumn.model, hoveredColumn.column);
    for (const edge of flow.edges) {
      if (!activeEdgeIds.has(edge.id)) continue;
      if (edge.data.sourceColumn !== undefined) add(edge.source, edge.data.sourceColumn);
      if (edge.data.targetColumn !== undefined) add(edge.target, edge.data.targetColumn);
    }
    return byModel;
  }, [flow, activeEdgeIds, hoveredColumn]);

  const onColumnHover = useCallback((model: string, column: string): void => {
    setHoveredColumn({ model, column });
  }, []);

  const onColumnLeave = useCallback((model: string, column: string): void => {
    setHoveredColumn((current) =>
      current !== null && current.model === model && current.column === column
        ? null
        : current,
    );
  }, []);

  const interaction: DiagramInteractionContextValue = useMemo(
    () => ({ highlightedColumns, onColumnHover, onColumnLeave }),
    [highlightedColumns, onColumnHover, onColumnLeave],
  );

  const onEdgeMouseEnter = useCallback((_event: ReactMouseEvent, edge: Edge): void => {
    setHoveredEdgeId(edge.id);
  }, []);

  const onEdgeMouseLeave = useCallback((): void => {
    setHoveredEdgeId(null);
  }, []);

  const onAutoLayout = useCallback((): void => {
    setLayoutTick((tick) => tick + 1);
  }, []);

  const addColumn = (): void => {
    const column = form.column.trim();
    if (column.length === 0 || form.model.length === 0) {
      setError('A model name and column name are required.');
      return;
    }
    vscode.postMessage({
      type: 'diagram:edit',
      edit: {
        kind: 'addColumn',
        model: form.model,
        column: {
          name: column,
          dataType: form.dataType.trim() || undefined,
          description: form.description.trim() || undefined,
        },
      },
    } satisfies MessageToExtension);
  };

  return (
    <main className="app">
      <header className="app__header">
        <h1>dbt Diagram</h1>
        <span className="app__status">{graph ? `${graph.nodes.length} models` : 'loading…'}</span>
      </header>

      {error !== null && <div className="banner banner--error">{error}</div>}
      {pendingErrors.length > 0 && (
        <div className="banner banner--info">
          <strong>Waiting for valid YAML:</strong>
          <ul className="banner__list">
            {pendingErrors.map((entry) => (
              <li key={entry}>{entry}</li>
            ))}
          </ul>
        </div>
      )}

      <section className="form">
        <input
          aria-label="Model name"
          placeholder="Model name"
          value={form.model}
          onChange={(e) => setForm({ ...form, model: e.target.value })}
        />
        <input
          aria-label="Column name"
          placeholder="Column name"
          value={form.column}
          onChange={(e) => setForm({ ...form, column: e.target.value })}
        />
        <input
          aria-label="Data type"
          placeholder="Data type (e.g. numeric)"
          value={form.dataType}
          onChange={(e) => setForm({ ...form, dataType: e.target.value })}
        />
        <input
          aria-label="Description"
          placeholder="Description"
          value={form.description}
          onChange={(e) => setForm({ ...form, description: e.target.value })}
        />
        <button type="button" onClick={addColumn}>
          Add column
        </button>
      </section>

      {graph === null || flow === null ? (
        <p className="empty">No diagram yet.</p>
      ) : (
        <section className="canvas">
          <ReactFlowProvider>
            <DiagramInteractionContext.Provider value={interaction}>
              <DiagramCanvas
                flow={flow}
                edges={edges}
                layoutTick={layoutTick}
                onEdgeMouseEnter={onEdgeMouseEnter}
                onEdgeMouseLeave={onEdgeMouseLeave}
                onAutoLayout={onAutoLayout}
              />
            </DiagramInteractionContext.Provider>
          </ReactFlowProvider>
        </section>
      )}
    </main>
  );
}

interface DiagramCanvasProps {
  flow: FlowElements;
  edges: Edge[];
  layoutTick: number;
  onEdgeMouseEnter: (event: ReactMouseEvent, edge: Edge) => void;
  onEdgeMouseLeave: () => void;
  onAutoLayout: () => void;
}

function DiagramCanvas({
  flow,
  edges,
  layoutTick,
  onEdgeMouseEnter,
  onEdgeMouseLeave,
  onAutoLayout,
}: DiagramCanvasProps): JSX.Element {
  const { fitView } = useReactFlow();
  const [rfNodes, setRfNodes] = useState<Node[]>([]);
  const [rfEdges, setRfEdges] = useState<Edge[]>([]);
  const lastTickRef = useRef(layoutTick);
  const lastIdsRef = useRef<string[]>([]);
  const firstFitRef = useRef(true);

  // Adopt each new diagram without disturbing the layout: existing nodes keep
  // their current position (manual drags and the previous arrangement survive),
  // only brand-new ids receive an automatic slot, and vanished ids are dropped.
  // Auto-layout (layoutTick bump) resets every node to the fresh dagre
  // arrangement. The view re-fits only on the first render, when the node set
  // grows, or after Auto-layout — never on ordinary live edits — so pan/zoom
  // survives typing (spec 04).
  useEffect(() => {
    const reset = layoutTick !== lastTickRef.current;
    lastTickRef.current = layoutTick;
    setRfNodes((current) => (reset ? flow.nodes : mergeFlowNodes(flow.nodes, current)));

    const ids = flow.nodes.map((node) => node.id);
    const added = ids.filter((id) => !lastIdsRef.current.includes(id)).length > 0;
    lastIdsRef.current = ids;
    const isFirst = firstFitRef.current;
    firstFitRef.current = false;
    if (isFirst || added || reset) {
      void fitView({ padding: 0.15, maxZoom: 1 });
    }
  }, [flow, layoutTick, fitView]);

  useEffect(() => {
    setRfEdges(edges);
  }, [edges]);

  const onNodesChange = useCallback((changes: NodeChange[]): void => {
    setRfNodes((current) => applyNodeChanges(changes, current));
  }, []);

  const onEdgesChange = useCallback((changes: EdgeChange[]): void => {
    setRfEdges((current) => applyEdgeChanges(changes, current));
  }, []);

  return (
    <ReactFlow
      nodes={rfNodes}
      edges={rfEdges}
      onNodesChange={onNodesChange}
      onEdgesChange={onEdgesChange}
      nodeTypes={nodeTypes}
      fitView
      fitViewOptions={{ padding: 0.15, maxZoom: 1 }}
      nodesConnectable={false}
      proOptions={{ hideAttribution: false }}
      onEdgeMouseEnter={onEdgeMouseEnter}
      onEdgeMouseLeave={onEdgeMouseLeave}
      minZoom={0.1}
      maxZoom={2}
    >
      <Background gap={16} size={1} />
      <Controls />
      <Panel position="top-right">
        <button type="button" className="panel-button" onClick={onAutoLayout}>
          Auto-layout
        </button>
      </Panel>
    </ReactFlow>
  );
}
