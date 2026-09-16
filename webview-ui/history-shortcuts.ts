export interface HistoryKeyInput {
  key: string;
  ctrlKey: boolean;
  metaKey: boolean;
  shiftKey: boolean;
  editable: boolean;
}

export function historyShortcut(input: HistoryKeyInput): 'undo' | 'redo' | null {
  if (input.editable || (!input.ctrlKey && !input.metaKey)) return null;
  const key = input.key.toLowerCase();
  if (key === 'z') return input.shiftKey ? 'redo' : 'undo';
  if (key === 'y') return 'redo';
  return null;
}
