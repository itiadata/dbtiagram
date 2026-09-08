import { defineConfig } from 'vitest/config';

export default defineConfig({
  plugins: [{
    name: 'markdown-as-text',
    transform(source, id) {
      return id.endsWith('.md') ? { code: `export default ${JSON.stringify(source)};`, map: null } : undefined;
    },
  }],
  test: {
    include: ['test/unit/**/*.test.ts'],
    environment: 'node',
    // Compact output keeps the inner feedback loop readable: a passing run
    // prints a single summary line instead of per-test output, and failures
    // report bounded diffs rather than dumping whole objects.
    reporters: ['dot'],
    // Bound assertion-failure output so a failing run reports the mismatch
    // instead of dumping whole model objects.
    chaiConfig: { truncateThreshold: 400 },
  },
});
