import { aiPromptBatch, buildAiRenameTypePrompt } from '../dbt/aiPrompt';
import type { AiPromptBatch, AiPromptRequest } from '../dbt/aiPrompt';
import type { ModelDefinition } from '../dbt/types';
import { AI_RENAMING_UNAVAILABLE_REASON, hasAiRenamingRules } from '../shared/aiRenaming';

export interface AiPromptClipboard {
  copy(text: string): Promise<void>;
}

export interface AiPromptExportHost {
  findModel(name: string): ModelDefinition | undefined;
  loadRules(model: string): Promise<string | undefined>;
  clipboard: AiPromptClipboard;
}

export async function copyAiRenameTypePrompt(host: AiPromptExportHost, request: AiPromptRequest): Promise<AiPromptBatch> {
  const model = host.findModel(request.model);
  if (model === undefined) throw new Error(`Model "${request.model}" is no longer available.`);
  const rules = await host.loadRules(request.model);
  if (!hasAiRenamingRules(rules)) throw new Error(AI_RENAMING_UNAVAILABLE_REASON);
  const batch = aiPromptBatch(model, request);
  if (batch.columns.length === 0) throw new Error(`Model "${model.name}" has no eligible columns to export.`);
  await host.clipboard.copy(buildAiRenameTypePrompt(batch, rules));
  return batch;
}
