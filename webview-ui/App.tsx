import { useEffect, useMemo, useState } from 'react';
import type { DiagramGraph, TableNode } from '../src/diagram/graph';
import type { BundleSegment, EdgeBundle, NodeLayout } from '../src/diagram/layout';
import { layoutDiagram } from '../src/diagram/layout';
import type { MessageToExtension, MessageToWebview } from '../src/shared/protocol';

const vscode = window.acquireVsCodeApi();

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

/** Every column a bundle touches, on both the source and the target side. */
function bundleColumns(bundle: EdgeBundle): ColumnRef[] {
  return [
    ...bundle.sourceColumns.map((column) => ({ model: bundle.source, column })),
    ...bundle.targetColumns.map((column) => ({ model: bundle.target, column })),
  ];
}

function segmentToPath(segment: BundleSegment): string {
  if (segment.kind === 'line') {
    return `M ${segment.from.x} ${segment.from.y} L ${segment.to.x} ${segment.to.y}`;
  }
  return `M ${segment.from.x} ${segment.from.y} C ${segment.control1.x} ${segment.control1.y}, ${segment.control2.x} ${segment.control2.y}, ${segment.to.x} ${segment.to.y}`;
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
  const [hoveredBundleId, setHoveredBundleId] = useState<string | null>(null);
  const [hoveredColumn, setHoveredColumn] = useState<ColumnRef | null>(null);

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

  const layout = useMemo(() => (graph === null ? null : layoutDiagram(graph)), [graph]);

  const highlightedColumns = useMemo(() => {
    if (layout === null) return new Set<string>();
    const set = new Set<string>();
    if (hoveredColumn !== null) {
      set.add(`${hoveredColumn.model}\u0000${hoveredColumn.column}`);
    }
    for (const bundle of layout.bundles) {
      const active =
        bundle.id === hoveredBundleId ||
        (hoveredColumn !== null &&
          bundleColumns(bundle).some(
            (ref) => ref.model === hoveredColumn.model && ref.column === hoveredColumn.column,
          ));
      if (!active) continue;
      for (const ref of bundleColumns(bundle)) {
        set.add(`${ref.model}\u0000${ref.column}`);
      }
    }
    return set;
  }, [layout, hoveredBundleId, hoveredColumn]);

  const isBundleActive = (bundle: EdgeBundle): boolean => {
    if (bundle.id === hoveredBundleId) return true;
    if (hoveredColumn === null) return false;
    return bundleColumns(bundle).some(
      (ref) => ref.model === hoveredColumn.model && ref.column === hoveredColumn.column,
    );
  };

  const hoverColumn = (model: string, column: string): void => {
    setHoveredColumn({ model, column });
  };

  const unhoverColumn = (model: string, column: string): void => {
    setHoveredColumn((current) =>
      current?.model === model && current?.column === column ? null : current,
    );
  };

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

      {graph === null || layout === null ? (
        <p className="empty">No diagram yet.</p>
      ) : (
        <svg className="canvas" width="100%" height="100%" viewBox="0 0 1400 800" aria-label="Table diagram">
          {layout.bundles.map((bundle) => {
            const active = isBundleActive(bundle);
            return (
              <g
                key={bundle.id}
                className={`edge-bundle${active ? ' edge-bundle--hovered' : ''}`}
                onMouseEnter={() => setHoveredBundleId(bundle.id)}
                onMouseLeave={() =>
                  setHoveredBundleId((current) => (current === bundle.id ? null : current))
                }
              >
                <title>{bundle.title}</title>
                {bundle.segments.map((segment, index) => (
                  <path key={index} d={segmentToPath(segment)} />
                ))}
              </g>
            );
          })}
          {layout.nodes.map((nodeLayout) => {
            const node = graph.nodes.find((n) => n.id === nodeLayout.id);
            if (node === undefined) return null;
            return (
              <g key={node.id} transform={`translate(${nodeLayout.x}, ${nodeLayout.y})`}>
                <NodeCard
                  node={node}
                  layout={nodeLayout}
                  highlighted={highlightedColumns}
                  onColumnHover={hoverColumn}
                  onColumnLeave={unhoverColumn}
                />
              </g>
            );
          })}
        </svg>
      )}
    </main>
  );
}

interface NodeCardProps {
  node: TableNode;
  layout: NodeLayout;
  highlighted: Set<string>;
  onColumnHover: (model: string, column: string) => void;
  onColumnLeave: (model: string, column: string) => void;
}

function NodeCard({ node, layout, highlighted, onColumnHover, onColumnLeave }: NodeCardProps): JSX.Element {
  return (
    <g className="node">
      <rect className="node__frame" width={layout.width} height={layout.height} rx={6} />
      <title>{node.description ?? node.label}</title>
      <text className="node__title" x={layout.width / 2} y={24} textAnchor="middle">
        {node.label}
      </text>
      {node.columns.map((column, index) => {
        const rowY = layout.columnY[index] - 12 - layout.y;
        const isHighlighted = highlighted.has(`${node.id}\u0000${column.name}`);
        return (
          <g
            key={column.name}
            className="node__row"
            transform={`translate(0, ${rowY})`}
            onMouseEnter={() => onColumnHover(node.id, column.name)}
            onMouseLeave={() => onColumnLeave(node.id, column.name)}
          >
            {isHighlighted && (
              <rect
                className="node__column-highlight"
                x={2}
                y={2}
                width={layout.width - 4}
                height={20}
                rx={3}
              />
            )}
            <line className="node__divider" x1={8} x2={layout.width - 8} />
            <text className="node__column" x={12} y={16}>
              {column.name}
            </text>
            {column.dataType !== undefined && (
              <text className="node__type" x={layout.width - 12} y={16} textAnchor="end">
                {column.dataType}
              </text>
            )}
            {column.description !== undefined && <title>{column.description}</title>}
          </g>
        );
      })}
    </g>
  );
}
