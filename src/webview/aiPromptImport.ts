import { planAiRenameTypeImport } from '../dbt/aiPromptImport';
import type { ModelEdit } from '../dbt/edit';
import type { ModelDefinition } from '../dbt/types';

export interface AiPromptImportClipboard { paste(): Promise<string>; }
export interface AiPromptImportNotifier { completed(updated: number, rejected: number): Promise<void>; failed(message: string): Promise<void>; }
export interface AiPromptImportHost { findModel(name: string): ModelDefinition | undefined; clipboard: AiPromptImportClipboard; notifier: AiPromptImportNotifier; applyAndPersist(edit: ModelEdit): Promise<void>; }

export async function importAiRenameTypeClipboardResponse(host: AiPromptImportHost, model: string): Promise<void> {
  const current = host.findModel(model);
  if (current === undefined) throw new Error(`Model "${model}" is no longer available.`);
  const clipboardText = await host.clipboard.paste();
  let plan;
  try { plan = planAiRenameTypeImport(current, clipboardText); } catch (error) { await host.notifier.failed(error instanceof Error ? error.message : String(error)); return; }
  if (plan.accepted.length > 0) await host.applyAndPersist({ kind: 'applyAiPromptImport', model, columns: plan.accepted });
  await host.notifier.completed(plan.accepted.length, plan.rejected.length);
}
