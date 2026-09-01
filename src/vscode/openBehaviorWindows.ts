/**
 * VS Code-facing: resolves where a new diagram panel should be created for
 * the current "Open new diagrams" setting (spec 23), and tracks this
 * extension's separate-window tab groups for "Separate window (reuse)".
 *
 * The four-way decision itself is pure (`../shared/openBehaviorPlacement`);
 * this module only supplies the live `tabGroups`/`moveEditorToNewWindow`
 * lookups and turns the decision into real `ViewColumn` values.
 */
import * as vscode from 'vscode';
import { decidePlacement } from '../shared/openBehaviorPlacement';
import type { OpenBehavior } from '../shared/openBehavior';

export interface PanelPlacement {
  showOptions: vscode.ViewColumn | { viewColumn: vscode.ViewColumn; preserveFocus?: boolean };
  /** Called after the panel is created, to move it to a new window and/or record its group. */
  afterCreate: (panel: vscode.WebviewPanel) => Promise<void>;
}

/**
 * Tab groups this extension has previously moved into a separate window, kept
 * by object reference so membership in the live `tabGroups.all` list can be
 * checked directly — VS Code drops a group from that list once its window
 * closes, which is exactly the "self-healing" signal spec 23 relies on.
 */
const trackedGroups: vscode.TabGroup[] = [];

/** Prunes closed windows, then returns a still-open tracked group, if any. */
function findReuseTarget(): vscode.TabGroup | undefined {
  const live = vscode.window.tabGroups.all;
  for (let i = trackedGroups.length - 1; i >= 0; i -= 1) {
    if (!live.includes(trackedGroups[i])) {
      trackedGroups.splice(i, 1);
    }
  }
  return trackedGroups[0];
}

/**
 * The tab group holding a webview panel in `viewColumn`, if found.
 *
 * Takes the column rather than the panel because the one caller that runs
 * during teardown (`untrackPanel`) has only a DISPOSED panel to hand, and
 * `WebviewPanel.viewColumn` throws "Webview is disposed" once that happens.
 */
function findGroupForColumn(viewColumn: vscode.ViewColumn): vscode.TabGroup | undefined {
  return vscode.window.tabGroups.all.find(
    (group) =>
      group.viewColumn === viewColumn &&
      group.tabs.some((tab) => tab.input instanceof vscode.TabInputWebview),
  );
}

/** Resolves where a new diagram panel should be created for `behavior`. */
export function resolvePlacement(behavior: OpenBehavior): PanelPlacement {
  const reuseTarget = findReuseTarget();
  const decision = decidePlacement(
    behavior,
    reuseTarget === undefined ? undefined : { viewColumn: reuseTarget.viewColumn },
  );

  switch (decision.kind) {
    case 'active':
      return { showOptions: vscode.ViewColumn.Active, afterCreate: async () => undefined };
    case 'beside':
      return { showOptions: vscode.ViewColumn.Beside, afterCreate: async () => undefined };
    case 'column':
      return {
        showOptions: { viewColumn: decision.viewColumn as vscode.ViewColumn },
        afterCreate: async () => undefined,
      };
    case 'newWindow':
      return {
        showOptions: vscode.ViewColumn.Active,
        afterCreate: async (panel) => {
          panel.reveal();
          await vscode.commands.executeCommand('workbench.action.moveEditorToNewWindow');
          // Best-effort (spec 23): compacts the just-created window's own
          // chrome. `enableCompactAuxiliaryWindow` targets whichever window
          // currently has focus, which is the new one right after the move.
          try {
            await vscode.commands.executeCommand('workbench.action.enableCompactAuxiliaryWindow');
          } catch {
            // Older VS Code builds may not have this command; degrade silently.
          }
          if (decision.shouldTrack) {
            const group = findGroupForColumn(panel.viewColumn ?? vscode.ViewColumn.Active);
            if (group !== undefined) {
              trackedGroups.push(group);
            }
          }
        },
      };
  }
}

/**
 * Forgets a tracked window (panel disposed / group no longer found).
 *
 * Callers must pass the column captured while the panel was still ALIVE:
 * `DiagramPanel.dispose` runs after `onDidDispose`, and may additionally await
 * a save prompt first, so reading `panel.viewColumn` at that point throws
 * "Webview is disposed" and the untrack silently never happened.
 */
export function untrackPanel(viewColumn: vscode.ViewColumn | undefined): void {
  if (viewColumn === undefined) {
    return;
  }
  const group = findGroupForColumn(viewColumn);
  if (group === undefined) {
    return;
  }
  const index = trackedGroups.indexOf(group);
  if (index !== -1) {
    trackedGroups.splice(index, 1);
  }
}
