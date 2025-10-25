import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    testTimeout: 120000,
    includeSource: ['tests/**/*.test.ts'],
    coverage: {
      provider: 'v8',
      include: ['packages/**/*.ts'],
      exclude: ['**/*.d.ts', '**/node_modules/**'],
    },
  },
});
