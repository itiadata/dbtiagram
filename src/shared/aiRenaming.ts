export const AI_RENAMING_RULES_RELATIVE_PATH = '.dbtiagram/ai_renaming_rules.md' as const;

export const AI_RENAMING_UNAVAILABLE_REASON = 'AI renaming requires .dbtiagram/ai_renaming_rules.md in the dbt project root.' as const;

export function hasAiRenamingRules(rules: string | undefined): rules is string {
  return rules !== undefined && rules.trim() !== '';
}
