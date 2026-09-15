import { hasAiRenamingRules } from '../shared/aiRenaming';

export interface AiPromptModelFile {
  uri: string;
  models: string[];
}

export interface AiPromptRulesLoader {
  load(modelFileUri: string): Promise<string | undefined>;
}

export async function availableAiRenamingModels(
  files: readonly AiPromptModelFile[],
  loader: AiPromptRulesLoader,
): Promise<string[]> {
  const available: string[] = [];
  const seen = new Set<string>();
  for (const file of files) {
    const rules = await loader.load(file.uri);
    if (!hasAiRenamingRules(rules)) continue;
    for (const model of file.models) {
      if (seen.has(model)) continue;
      seen.add(model);
      available.push(model);
    }
  }
  return available;
}
