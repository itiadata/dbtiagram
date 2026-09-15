import * as vscode from 'vscode';
import type { GroupPickerCandidate } from '../shared/protocol';

interface GroupTablePickItem extends vscode.QuickPickItem { id: string }

export function pickGroupTables(
  candidates: readonly GroupPickerCandidate[],
  selected: ReadonlySet<string> = new Set(),
): Promise<string[] | undefined> {
  return new Promise((resolve) => {
    const picker = vscode.window.createQuickPick<GroupTablePickItem>();
    picker.placeholder = 'Select one or more tables';
    picker.canSelectMany = true;
    picker.items = candidates.map(({ id, label }) => ({ id, label }));
    picker.selectedItems = picker.items.filter((item) => selected.has(item.id));
    const allowEmpty = selected.size > 0;
    let accepted = false;
    picker.onDidAccept(() => {
      if (!allowEmpty && picker.selectedItems.length === 0) return;
      accepted = true;
      resolve([...picker.selectedItems].map((item) => item.id));
      picker.hide();
    });
    picker.onDidHide(() => {
      if (!accepted) resolve(undefined);
      picker.dispose();
    });
    picker.show();
  });
}

export async function promptGroupName(currentName?: string): Promise<string | undefined> {
  const value = await vscode.window.showInputBox({
    prompt: currentName === undefined ? 'Enter a group name' : 'Rename group',
    value: currentName,
    validateInput: (value) => value.trim() === '' ? 'Enter a group name' : undefined,
  });
  return value?.trim();
}
