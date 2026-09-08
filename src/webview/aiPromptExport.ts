import { aiPromptBatch, buildAiRenameTypePrompt } from '../dbt/aiPrompt';
import type { AiPromptRequest } from '../dbt/aiPrompt';
import type { ModelDefinition } from '../dbt/types';

export interface AiPromptClipboard {
  copy(text: string): Promise<void>;
}

export interface AiPromptExportHost {
  findModel(name: string): ModelDefinition | undefined;
  clipboard: AiPromptClipboard;
}

export async function copyAiRenameTypePrompt(host: AiPromptExportHost, request: AiPromptRequest): Promise<void> {
  const model = host.findModel(request.model);
  if (model === undefined) throw new Error(`Model "${request.model}" is no longer available.`);
  const batch = aiPromptBatch(model, request);
  if (batch.columns.length === 0) throw new Error(`Model "${model.name}" has no eligible columns to export.`);
  await host.clipboard.copy(buildAiRenameTypePrompt(batch));
}
