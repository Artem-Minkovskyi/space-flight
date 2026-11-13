import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: ['tests/**/*.test.ts'],
    exclude: ['tests/determinism.test.ts', 'node_modules/**', 'dist/**'],
    environment: 'node',
    testTimeout: 10000,
    coverage: {
      provider: 'v8',
      include: ['shared/**/*.ts'],
      exclude: ['shared/types.ts'],
      reporter: ['text', 'html'],
      thresholds: { lines: 85, functions: 85, statements: 85, branches: 65 },
    },
  },
});
