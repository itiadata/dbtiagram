import { describe, expect, it } from 'vitest';
import { historyShortcut } from '../../../webview-ui/history-shortcuts';

describe('history shortcuts', () => {
  const key = (value: string, ctrlKey = false, metaKey = false, shiftKey = false, editable = false) => historyShortcut({ key: value, ctrlKey, metaKey, shiftKey, editable });
  it('classifies Windows and macOS shortcuts', () => expect([key('z', true), key('y', true), key('z', true, false, true), key('z', false, true), key('z', false, true, true)]).toEqual(['undo', 'redo', 'redo', 'undo', 'redo']));
  it('ignores editable targets and unrelated keys', () => expect([key('z', true, false, false, true), key('k', true)]).toEqual([null, null]));
});
