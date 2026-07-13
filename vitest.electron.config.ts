import { defineConfig } from 'vitest/config';

/**
 * Electron main-process unit tests.
 *
 * Separate from the frontend/backend suites because this code is Node/CommonJS and has
 * no DOM. Only the PURE policy layer is covered here (`electron/**\/*.test.ts`) — it has
 * no `electron` imports, so it runs without an Electron runtime.
 */
export default defineConfig({
  test: {
    name: 'electron',
    environment: 'node',
    include: ['electron/**/__tests__/**/*.test.ts'],
  },
});
