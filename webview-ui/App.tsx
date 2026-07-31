import { useEffect, useState } from 'react';
import type { DiagramGraph, TableNode } from '../src/diagram/graph';
import type { MessageToExtension, MessageToWebview } from '../src/shared/protocol';

const vscode = window.acquireVsCodeApi();

interface FormState {
  model: string;
  column: string;
  dataType: string;
  description: string;
}

export function App(): JSX.Element {
  const [graph, setGraph] = useState<DiagramGraph | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [form, setForm] = useState<FormState>({
    model: '',
    column: '',
    dataType: '',
    description: '',
  });

  useEffect(() => {
    const listener = (event: MessageEvent<MessageToWebview>): void => {
      const message = event.data;
      switch (message.type) {
        case 'diagram:update':
          setGraph(message.diagram);
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

      {graph === null ? (
        <p className="empty">No diagram yet.</p>
      ) : (
        <svg className="canvas" width="100%" height="100%" viewBox="0 0 1400 800" aria-label="Table diagram">
          {graph.edges.map((edge) => {
            const source = nodePosition(graph.nodes, edge.source);
            const target = nodePosition(graph.nodes, edge.target);
            if (source === null || target === null) return null;
            return (
              <line
                key={`${edge.source}->${edge.target}`}
                className="edge"
                x1={source.x}
                y1={source.y}
                x2={target.x}
                y2={target.y}
              />
            );
          })}
          {graph.nodes.map((node, index) => (
            <g key={node.id} transform={`translate(${columnPosition(index).x}, ${columnPosition(index).y})`}>
              <NodeCard node={node} />
            </g>
          ))}
        </svg>
      )}
    </main>
  );
}

function NodeCard({ node }: { node: TableNode }): JSX.Element {
  return (
    <g className="node">
      <rect className="node__frame" width={240} height={36 + node.columns.length * 24} rx={6} />
      <title>{node.description ?? node.label}</title>
      <text className="node__title" x={120} y={24} textAnchor="middle">
        {node.label}
      </text>
      {node.columns.map((column, i) => (
        <g key={column.name} transform={`translate(0, ${44 + i * 24})`}>
          <line className="node__divider" x1={8} x2={232} />
          <text className="node__column" x={12} y={16}>
            {column.name}
          </text>
          {column.dataType !== undefined && (
            <text className="node__type" x={228} y={16} textAnchor="end">
              {column.dataType}
            </text>
          )}
          {column.description !== undefined && (
            <title>{column.description}</title>
          )}
        </g>
      ))}
    </g>
  );
}

function nodePosition(nodes: TableNode[], id: string): { x: number; y: number } | null {
  const index = nodes.findIndex((n) => n.id === id);
  if (index === -1) return null;
  return columnPosition(index);
}

function columnPosition(index: number): { x: number; y: number } {
  const x = 60 + (index % 4) * 320;
  const y = 80 + Math.floor(index / 4) * 240;
  return { x, y };
}
