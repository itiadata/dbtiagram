/**
 * Inbound layout message handling (spec 13/14), extracted from `panel.ts`
 * (spec 17).
 *
 * These handlers never import `vscode`: every host interaction goes through the
 * injected `LayoutHost`, and paths are plain `fsPath` strings. That makes the
 * whole layout protocol unit-testable with a stub host, without the Electron
 * host.
 */
import {
  applyLayout,
  defaultLayoutName,
  DiagramLayoutParseError,
  type DiagramLayout,
} from '../diagram/layoutFile';
import type { MessageToWebview } from '../shared/protocol';

/** The saved layout file a panel currently writes back to. */
export interface ActiveLayout {
  fsPath: string;
  name: string;
}

/** Everything the layout handlers need from the owning panel. */
export interface LayoutHost {
  postMessage(message: MessageToWebview): void;
  getActiveLayout(): ActiveLayout | undefined;
  setActiveLayout(active: ActiveLayout | undefined): void;
  /** Reads and parses a layout file; rejects on missing/invalid files. */
  readLayout(fsPath: string): Promise<DiagramLayout>;
  /** Writes a layout file and records the write as self-inflicted. */
  writeLayout(fsPath: string, layout: DiagramLayout): Promise<void>;
  /** Save-dialog; `undefined` when the user cancels. */
  promptForLayoutPath(defaultName: string): Promise<string | undefined>;
  /** Names of every model currently loaded, for reconciling the layout. */
  knownModelNames(): Set<string>;
  /** The panel re-titles itself to the layout's stored name. */
  onLayoutOpened(name: string): void;
  /** The panel re-keys and re-titles itself after a first save (spec 14). */
  onLayoutSaved(fsPath: string, name: string): void;
  /** Re-publishes the diagram to the webview. */
  republish(): void;
}

/** Layout entries naming models that no longer exist, in file order. */
function missingModels(host: LayoutHost, layout: DiagramLayout): string[] {
  return applyLayout(layout, host.knownModelNames()).missing;
}

export function publishActiveLayout(host: LayoutHost): void {
  const active = host.getActiveLayout();
  host.postMessage({
    type: 'layout:active',
    path: active?.fsPath ?? null,
    name: active?.name ?? null,
  });
}

/**
 * Opens a saved layout file: parses it, reconciles it against the models that
 * currently exist, and tells the webview to apply it (spec 13).
 */
export async function openLayout(host: LayoutHost, fsPath: string): Promise<void> {
  let layout: DiagramLayout;
  try {
    layout = await host.readLayout(fsPath);
  } catch (err) {
    const detail = err instanceof DiagramLayoutParseError ? err.message : String(err);
    host.postMessage({
      type: 'diagram:error',
      message: `Could not open ${defaultLayoutName(fsPath)}: ${detail}`,
    });
    return;
  }

  host.setActiveLayout({ fsPath, name: layout.name });
  host.onLayoutOpened(layout.name);
  host.republish();
  host.postMessage({ type: 'layout:apply', layout, missing: missingModels(host, layout) });
  publishActiveLayout(host);
}

/**
 * Re-reads the active layout from disk and re-applies it in the webview. Used
 * on `webview:ready`, where the panel's first `layout:apply` may have raced
 * the webview's message listener.
 */
export async function sendActiveLayout(host: LayoutHost): Promise<void> {
  const active = host.getActiveLayout();
  if (active === undefined) {
    return;
  }
  try {
    const layout = await host.readLayout(active.fsPath);
    host.setActiveLayout({ fsPath: active.fsPath, name: layout.name });
    host.postMessage({ type: 'layout:apply', layout, missing: missingModels(host, layout) });
  } catch {
    // The file vanished or became invalid after it was opened; the diagram
    // stays as it is and the next explicit open reports the error.
  }
}

/**
 * Handles the explicit "Save diagram" action: writes to the active layout, or
 * prompts for a path when there is none. Cancelling the dialog is a no-op.
 */
export async function saveLayout(host: LayoutHost, layout: DiagramLayout): Promise<void> {
  let target = host.getActiveLayout()?.fsPath;
  if (target === undefined) {
    target = await host.promptForLayoutPath(layout.name);
    if (target === undefined) {
      return;
    }
  }

  const named: DiagramLayout = { ...layout, name: defaultLayoutName(target) };
  try {
    await host.writeLayout(target, named);
  } catch (err) {
    host.postMessage({
      type: 'diagram:error',
      message: `Could not save diagram: ${err instanceof Error ? err.message : String(err)}`,
    });
    return;
  }

  host.setActiveLayout({ fsPath: target, name: named.name });
  host.onLayoutSaved(target, named.name);
  publishActiveLayout(host);
}

/** Debounced live write-back; a no-op while no layout is active. */
export async function writeActiveLayout(
  host: LayoutHost,
  layout: DiagramLayout,
): Promise<void> {
  const active = host.getActiveLayout();
  if (active === undefined) {
    return;
  }
  try {
    await host.writeLayout(active.fsPath, { ...layout, name: active.name });
  } catch (err) {
    host.postMessage({
      type: 'diagram:error',
      message: `Could not update diagram: ${err instanceof Error ? err.message : String(err)}`,
    });
  }
}
