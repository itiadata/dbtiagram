/**
 * The `note` React Flow node (spec 16): a resizable sticky note with in-place
 * text editing, or a small icon when collapsed.
 *
 * Being a real node type means dragging, canvas coordinates, pan/zoom and
 * selection all come from React Flow for free, exactly as for `TableNode`.
 */
import { useEffect, useRef, useState } from 'react';
import { useReactFlow, type NodeProps } from '@xyflow/react';
import {
  NOTE_MIN_HEIGHT,
  NOTE_MIN_WIDTH,
  type DiagramNote,
} from '../src/diagram/layoutFile';
import { SquareText } from './icons';

export interface NoteNodeData extends Record<string, unknown> {
  note: DiagramNote;
  collapsed: boolean;
  onTextChange: (id: string, text: string) => void;
  onResize: (id: string, width: number, height: number) => void;
  onToggleCollapsed: (id: string) => void;
}

/** The tooltip for a collapsed note: its first non-empty line. */
function firstLine(text: string): string {
  const line = text.split('\n').find((candidate) => candidate.trim() !== '');
  return line === undefined ? 'Empty note' : line.trim();
}

export function NoteNode(props: NodeProps): JSX.Element {
  const data = props.data as NoteNodeData;
  const { note, collapsed, onTextChange, onResize, onToggleCollapsed } = data;
  const { getZoom } = useReactFlow();

  // The textarea is uncontrolled between commits: typing stays local and the
  // note (and therefore the layout file) is only updated on blur.
  const [draft, setDraft] = useState(note.text);
  useEffect(() => setDraft(note.text), [note.text]);

  // Live size during a grip drag, so the note tracks the cursor before commit.
  const [size, setSize] = useState({ width: note.width, height: note.height });
  useEffect(
    () => setSize({ width: note.width, height: note.height }),
    [note.width, note.height],
  );
  const dragRef = useRef<{ x: number; y: number; width: number; height: number } | null>(null);

  if (collapsed) {
    return (
      <button
        type="button"
        className="note note--collapsed"
        title={firstLine(note.text)}
        onDoubleClick={() => onToggleCollapsed(note.id)}
      >
        <SquareText size={16} />
      </button>
    );
  }

  const onGripPointerDown = (event: React.PointerEvent<HTMLDivElement>): void => {
    event.stopPropagation();
    event.currentTarget.setPointerCapture(event.pointerId);
    dragRef.current = {
      x: event.clientX,
      y: event.clientY,
      width: size.width,
      height: size.height,
    };
  };

  const onGripPointerMove = (event: React.PointerEvent<HTMLDivElement>): void => {
    const start = dragRef.current;
    if (start === null) {
      return;
    }
    // Screen pixels are divided by the zoom so the corner stays under the
    // cursor at any zoom level.
    const zoom = getZoom();
    setSize({
      width: Math.max(start.width + (event.clientX - start.x) / zoom, NOTE_MIN_WIDTH),
      height: Math.max(start.height + (event.clientY - start.y) / zoom, NOTE_MIN_HEIGHT),
    });
  };

  const onGripPointerUp = (event: React.PointerEvent<HTMLDivElement>): void => {
    if (dragRef.current === null) {
      return;
    }
    dragRef.current = null;
    event.currentTarget.releasePointerCapture(event.pointerId);
    onResize(note.id, size.width, size.height);
  };

  return (
    <div className="note" style={{ width: size.width, height: size.height }}>
      {/* The drag handle (see useNotes): dragging the body would fight the textarea. */}
      <div className="note__header" onDoubleClick={() => onToggleCollapsed(note.id)}>
        <span className="note__title">Note</span>
      </div>
      <textarea
        className="note__text nodrag nowheel"
        value={draft}
        placeholder="Write a note…"
        onChange={(event) => setDraft(event.target.value)}
        onBlur={() => onTextChange(note.id, draft)}
      />
      <div
        className="note__grip nodrag nowheel"
        role="presentation"
        onPointerDown={onGripPointerDown}
        onPointerMove={onGripPointerMove}
        onPointerUp={onGripPointerUp}
      />
    </div>
  );
}
