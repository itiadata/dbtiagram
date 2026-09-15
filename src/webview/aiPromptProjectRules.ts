import {
  AI_RENAMING_RULES_RELATIVE_PATH,
  hasAiRenamingRules,
} from '../shared/aiRenaming';

export interface AiPromptProjectRulesHost {
  parent(uri: string): string | undefined;
  join(base: string, ...segments: string[]): string;
  sameUri(left: string, right: string): boolean;
  isFile(uri: string): Promise<boolean>;
  readText(uri: string): Promise<string | undefined>;
}

export async function loadAiRenamingRulesFromProject(
  host: AiPromptProjectRulesHost,
  modelFileUri: string,
  workspaceFolderUri: string,
): Promise<string | undefined> {
  let directory = host.parent(modelFileUri);
  while (directory !== undefined) {
    const marker = host.join(directory, 'dbt_project.yml');
    if (await host.isFile(marker)) {
      const rules = await host.readText(host.join(directory, ...AI_RENAMING_RULES_RELATIVE_PATH.split('/')));
      return hasAiRenamingRules(rules) ? rules : undefined;
    }
    if (host.sameUri(directory, workspaceFolderUri)) return undefined;
    directory = host.parent(directory);
  }
  return undefined;
}
