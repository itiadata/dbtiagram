/**
 * Sticky note state (spec 16): the persisted notes array, the runtime-only
 * collapse map, the React Flow node projection, and every mutation callback.
 *
 * Two distinct collapse values live here. `note.collapsedByDefault` is
 * persisted and decides how a note renders the moment a diagram is opened;
 * `collapsedNow` is webview-only, so double-clicking a note to peek at it never
 * writes to disk.
 */
import { useCallback, useMemo, useState } from 'react';
import type { Node, NodeChange } from '@xyflow/react';
import { createNote, NOTE_MIN_HEIGHT, NOTE_MIN_WIDTH, type DiagramNote } from '../../src/diagram/layoutFile';

export interface NotesState {
  /** The persisted notes, in insertion order. */
  notes: DiagramNote[];
  /** React Flow nodes of type 'note', carrying data + callbacks. */
  noteNodes: Node[];
  noteIds: ReadonlySet<string>;
  /** Applies position/select/remove changes that belong to notes. */
  applyNoteNodeChanges: (changes: NodeChange[]) => void;
  /** Creates a note at canvas coordinates and returns its new id. */
  addNote: (x: number, y: number) => string;
  updateNoteText: (id: string, text: string) => void;
  resizeNote: (id: string, width: number, height: number) => void;
  deleteNote: (id: string) => void;
  setCollapsedByDefault: (id: string, value: boolean) => void;
  /** Runtime-only toggle; never persisted. */
  toggleCollapsedNow: (id: string) => void;
  isCollapsed: (id: string) => boolean;
  /** Seeds from an opened layout and resets every runtime collapse state. */
  applyLayoutNotes: (notes: DiagramNote[]) => void;
  /** Ids of currently selected notes, for the Delete key. */
  selectedNoteIds: string[];
}

/** Six lowercase hex characters — enough to keep note ids unique per diagram. */
function newNoteId(): string {
  const bytes = new Uint8Array(3);
  crypto.getRandomValues(bytes);
  return `n-${Array.from(bytes, (byte) => byte.toString(16).padStart(2, '0')).join('')}`;
}

export function useNotes(): NotesState {
  const [notes, setNotes] = useState<DiagramNote[]>([]);
  const [collapsedNow, setCollapsedNow] = useState<Map<string, boolean>>(new Map());
  const [selected, setSelected] = useState<ReadonlySet<string>>(new Set());

  const noteIds = useMemo(() => new Set(notes.map((note) => note.id)), [notes]);

  const isCollapsed = useCallback(
    (id: string): boolean => {
      const runtime = collapsedNow.get(id);
      if (runtime !== undefined) {
        return runtime;
      }
      return notes.find((note) => note.id === id)?.collapsedByDefault ?? false;
    },
    [collapsedNow, notes],
  );

  const addNote = useCallback((x: number, y: number): string => {
    const id = newNoteId();
    setNotes((current) => [...current, createNote(x, y, id)]);
    return id;
  }, []);

  const updateNoteText = useCallback((id: string, text: string): void => {
    setNotes((current) => current.map((note) => (note.id === id ? { ...note, text } : note)));
  }, []);

  const resizeNote = useCallback((id: string, width: number, height: number): void => {
    setNotes((current) =>
      current.map((note) =>
        note.id === id
          ? {
              ...note,
              width: Math.max(width, NOTE_MIN_WIDTH),
              height: Math.max(height, NOTE_MIN_HEIGHT),
            }
          : note,
      ),
    );
  }, []);

  const deleteNote = useCallback((id: string): void => {
    setNotes((current) => current.filter((note) => note.id !== id));
    setCollapsedNow((current) => {
      if (!current.has(id)) return current;
      const next = new Map(current);
      next.delete(id);
      return next;
    });
    setSelected((current) => {
      if (!current.has(id)) return current;
      const next = new Set(current);
      next.delete(id);
      return next;
    });
  }, []);

  const setCollapsedByDefault = useCallback(
    (id: string, value: boolean): void => {
      // Changing the default must not move the note on screen (spec 16), so the
      // current effective state is pinned into the runtime map first. The next
      // time the diagram is opened, `applyLayoutNotes` clears that pin and the
      // new default takes over.
      setCollapsedNow((current) =>
        current.has(id) ? current : new Map(current).set(id, isCollapsed(id)),
      );
      setNotes((current) =>
        current.map((note) => (note.id === id ? { ...note, collapsedByDefault: value } : note)),
      );
    },
    [isCollapsed],
  );

  const toggleCollapsedNow = useCallback(
    (id: string): void => {
      // Inverts the *effective* state: a note showing its default still flips
      // the way the user expects on the very first double-click.
      const next = !isCollapsed(id);
      setCollapsedNow((current) => new Map(current).set(id, next));
    },
    [isCollapsed],
  );

  const applyLayoutNotes = useCallback((incoming: DiagramNote[]): void => {
    setNotes(incoming.map((note) => ({ ...note })));
    setCollapsedNow(new Map());
    setSelected(new Set());
  }, []);

  // React Flow reports position/select/remove per node; only the ones belonging
  // to notes reach here (DiagramCanvas partitions by id).
  const applyNoteNodeChanges = useCallback((changes: NodeChange[]): void => {
    for (const change of changes) {
      if (change.type === 'position' && change.position !== undefined) {
        const { id, position } = change;
        setNotes((current) =>
          current.map((note) =>
            note.id === id ? { ...note, x: position.x, y: position.y } : note,
          ),
        );
      } else if (change.type === 'select') {
        const { id, selected: isSelected } = change;
        setSelected((current) => {
          const next = new Set(current);
          if (isSelected) next.add(id);
          else next.delete(id);
          return next;
        });
      } else if (change.type === 'remove') {
        const { id } = change;
        setNotes((current) => current.filter((note) => note.id !== id));
      }
    }
  }, []);

  const noteNodes = useMemo<Node[]>(
    () =>
      notes.map((note) => {
        const collapsed = isCollapsed(note.id);
        const isSelectedNode = selected.has(note.id);
        return {
          id: note.id,
          type: 'note',
          position: { x: note.x, y: note.y },
          // Notes paint behind tables; a selected note lifts above its peers
          // (but still below every table card).
          zIndex: isSelectedNode ? 5 : 0,
          selected: isSelectedNode,
          selectable: true,
          // Expanded notes drag by their header only, so the textarea stays
          // usable; a collapsed icon drags as a whole.
          dragHandle: collapsed ? undefined : '.note__header',
          data: {
            note,
            collapsed,
            onTextChange: updateNoteText,
            onResize: resizeNote,
            onToggleCollapsed: toggleCollapsedNow,
          },
        };
      }),
    [notes, isCollapsed, selected, updateNoteText, resizeNote, toggleCollapsedNow],
  );

  return {
    notes,
    noteNodes,
    noteIds,
    applyNoteNodeChanges,
    addNote,
    updateNoteText,
    resizeNote,
    deleteNote,
    setCollapsedByDefault,
    toggleCollapsedNow,
    isCollapsed,
    applyLayoutNotes,
    selectedNoteIds: useMemo(() => [...selected], [selected]),
  };
}
