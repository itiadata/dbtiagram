import { describe, expect, it } from 'vitest';
import {
  AI_RENAMING_RULES_RELATIVE_PATH,
  AI_RENAMING_UNAVAILABLE_REASON,
  hasAiRenamingRules,
} from '../../../src/shared/aiRenaming';

describe('AI renaming rules', () => {
  it('defines the project rules path and unavailable reason', () => {
    expect(AI_RENAMING_RULES_RELATIVE_PATH).toBe('.dbtiagram/ai_renaming_rules.md');
    expect(AI_RENAMING_UNAVAILABLE_REASON).toBe('AI renaming requires .dbtiagram/ai_renaming_rules.md in the dbt project root.');
  });

  it('accepts only non-blank rules', () => {
    expect([undefined, '', ' \r\n ', 'Use ACME names.\n'].map(hasAiRenamingRules)).toEqual([false, false, false, true]);
  });
});
