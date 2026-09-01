/**
 * Pure orchestration (spec 38) of the "Open SQL file" action against a small
 * host port. Keeping the sequencing here means the VS Code editor and
 * findFiles calls live only in `src/vscode/sqlFiles.ts` and this logic is
 * unit-testable.
 * Pure logic — MUST NOT import `vscode`.
 */

/** Everything `openModelSql` needs from the extension host. */
export interface OpenSqlHost {
  /** The currently known `.sql` path for `model`, or undefined. */
  lookup(model: string): string | undefined;
  /** Re-scans the workspace and returns the fresh model -> path index. */
  rescan(): Promise<Map<string, string>>;
  /** Opens or focuses the file; must not move the caret in an open tab. */
  open(fsPath: string): Promise<void>;
  /** Pushes the fresh availability set to the webview (`model:sqlFiles`). */
  publish(models: string[]): void;
  /** Reports a failure to the webview's error banner. */
  postError(message: string): void;
}

/**
 * Opens the `.sql` file for `model`, re-scanning the workspace once when the
 * cached index does not know it (or when a cached path fails to open,
 * e.g. it was deleted since the last scan).
 */
export async function openModelSql(host: OpenSqlHost, model: string): Promise<void> {
  const cached = host.lookup(model);
  if (cached !== undefined) {
    try {
      await host.open(cached);
      return;
    } catch {
      // Fall through to the rescan branch below: the cache was stale.
    }
  }

  const fresh = await host.rescan();
  host.publish([...fresh.keys()]);

  const fsPath = fresh.get(model);
  if (fsPath === undefined) {
    host.postError(`No .sql file found for "${model}"`);
    return;
  }

  try {
    await host.open(fsPath);
  } catch {
    host.postError(`Could not open ${fsPath}`);
  }
}
