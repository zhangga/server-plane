import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    globals: true,
    include: ['tests/**/*.test.ts', 'web/src/**/*.test.ts', 'web/src/**/*.test.tsx'],
    setupFiles: ['web/src/testSetup.ts'],
  },
});
