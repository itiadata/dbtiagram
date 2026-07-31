import { describe, expect, it } from 'vitest';
import { globToRegExp, matchesGlob } from '../../../src/shared/glob';

describe('matchesGlob', () => {
  it('matches the default model glob against absolute forward-slash paths', () => {
    expect(matchesGlob('C:/repo/models/orders.yml', '**/models/**/*.yml')).toBe(true);
    expect(matchesGlob('C:/repo/models/nested/deep/orders.yml', '**/models/**/*.yml')).toBe(true);
  });

  it('matches Windows backslash paths by normalizing separators', () => {
    expect(matchesGlob('C:\\repo\\models\\orders.yml', '**/models/**/*.yml')).toBe(true);
    expect(matchesGlob('C:\\repo\\models\\nested\\orders.yml', '**/models/**/*.yml')).toBe(true);
  });

  it('lets a leading **/ match zero path segments', () => {
    expect(matchesGlob('models/orders.yml', '**/models/**/*.yml')).toBe(true);
    expect(matchesGlob('orders.yml', '**/models/**/*.yml')).toBe(false);
  });

  it('does not match files outside a models dir or with other extensions', () => {
    expect(matchesGlob('src/marts/orders.yml', '**/models/**/*.yml')).toBe(false);
    expect(matchesGlob('models/orders.yaml', '**/models/**/*.yml')).toBe(false);
    expect(matchesGlob('src/models/orders.txt', '**/models/**/*.yml')).toBe(false);
    expect(matchesGlob('orders.yml', '**/models/**/*.yml')).toBe(false);
  });

  it('never lets a single * cross a path separator', () => {
    expect(matchesGlob('models/orders.yml', '**/models/*.yml')).toBe(true);
    expect(matchesGlob('models/nested/orders.yml', '**/models/*.yml')).toBe(false);
    expect(matchesGlob('orders.yml', '*.yml')).toBe(true);
    expect(matchesGlob('models/orders.yml', '*.yml')).toBe(false);
  });

  it('matches a bare **/ across any depth including none', () => {
    expect(matchesGlob('orders.yml', '**/*.yml')).toBe(true);
    expect(matchesGlob('a/b/orders.yml', '**/*.yml')).toBe(true);
  });

  it('supports ? for a single character', () => {
    expect(matchesGlob('models/orders.yml', '**/models/orders.?ml')).toBe(true);
    expect(matchesGlob('models/orders.yaml', '**/models/orders.??l')).toBe(false);
  });

  it('supports character classes and negation', () => {
    expect(matchesGlob('models/orders.yml', '**/models/orders.[a-z]ml')).toBe(true);
    expect(matchesGlob('models/orders.yml', '**/models/orders.[0-9]ml')).toBe(false);
    expect(matchesGlob('models/orders.yml', '**/models/orders.[!a]ml')).toBe(true);
  });

  it('supports {a,b} alternation', () => {
    expect(matchesGlob('models/orders.yml', '**/{models,sources}/orders.yml')).toBe(true);
    expect(matchesGlob('sources/orders.yml', '**/{models,sources}/orders.yml')).toBe(true);
    expect(matchesGlob('staging/orders.yml', '**/{staging,marts}/*.yml')).toBe(true);
    expect(matchesGlob('models/orders.yml', '**/{staging,marts}/*.yml')).toBe(false);
  });

  it('treats regex special characters in the pattern literally', () => {
    expect(matchesGlob('a.b.yml', '**/*.yml')).toBe(true);
    expect(matchesGlob('aXb.yml', '**/a.b.yml')).toBe(false);
    expect(matchesGlob('a.b.yml', '**/a.b.yml')).toBe(true);
  });

  it('compiles to an anchored regex', () => {
    const re = globToRegExp('**/models/**/*.yml');
    expect(re.source.startsWith('^')).toBe(true);
    expect(re.source.endsWith('$')).toBe(true);
  });
});
