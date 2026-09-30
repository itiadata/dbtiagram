import type { ModelRenamePlan } from '../dbt/modelRename';

export interface ModelRenameFileHost {
  readText(path: string): Promise<string>;
  writeText(path: string, text: string): Promise<void>;
  exists(path: string): Promise<boolean>;
  rename(from: string, to: string): Promise<void>;
}

export function formatModelRenameImpact(plan: ModelRenamePlan): string {
  const paths = plan.textFiles.map((file) => file.path).join('\n');
  const rename = plan.sqlRename === undefined
    ? 'No model SQL file was renamed'
    : `Renamed: ${plan.sqlRename.from} -> ${plan.sqlRename.to}`;
  return `Updated files:\n${paths}\n\n${rename}`;
}

export async function executeModelRename(host: ModelRenameFileHost, plan: ModelRenamePlan): Promise<void> {
  const files = [...plan.textFiles].sort((a, b) => a.path.localeCompare(b.path));
  for (const file of files) if (await currentOrMissing(host, file.path) !== file.before) throw divergent(file.path);
  if (plan.sqlRename !== undefined) {
    if (!(await host.exists(plan.sqlRename.from))) throw divergent(plan.sqlRename.from);
    if (await host.exists(plan.sqlRename.to)) throw divergent(plan.sqlRename.to);
  }
  const completed: typeof files = []; let renamed = false;
  try {
    for (const file of files) { await host.writeText(file.path, file.after); completed.push(file); }
    if (plan.sqlRename !== undefined) { await host.rename(plan.sqlRename.from, plan.sqlRename.to); renamed = true; }
  } catch (error) {
    const failures: string[] = [];
    if (renamed && plan.sqlRename !== undefined) try { await host.rename(plan.sqlRename.to, plan.sqlRename.from); } catch (rollback) { failures.push(String(rollback)); }
    for (const file of completed.reverse()) try { await host.writeText(file.path, file.before); } catch (rollback) { failures.push(String(rollback)); }
    if (failures.length > 0) throw new Error(`Model rename failed and rollback was incomplete: ${failures.join('; ')}`);
    throw error;
  }
}
async function currentOrMissing(host: ModelRenameFileHost, path: string): Promise<string | undefined> { try { return await host.readText(path); } catch { return undefined; } }
function divergent(path: string): Error { return new Error(`Cannot restore model rename: ${path} no longer matches the recorded state`); }
