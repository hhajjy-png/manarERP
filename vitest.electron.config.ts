import { defineConfig } from 'vitest/config';

/**
 * Electron main-process unit tests.
 *
 * Separate from the frontend/backend suites because this code is Node/CommonJS and has
 * no DOM. Only the PURE policy layer is covered here (`electron/**\/*.test.ts`) — it has
 * no `electron` imports, so it runs without an Electron runtime.
 *
 * Packaging scripts (`scripts/**`) share this suite rather than getting their own config:
 * same runtime (Node/CommonJS, no DOM), same reason for existing (they decide what the
 * shipped application contains). A silent bug there — e.g. a PE parser that reports "no
 * prerequisites" because it failed to parse — produces an installer that fails on a clean
 * machine, which is exactly the class of failure the Electron contract tests guard against.
 */
export default defineConfig({
  test: {
    name: 'electron',
    environment: 'node',
    include: ['electron/**/__tests__/**/*.test.ts', 'scripts/__tests__/**/*.test.ts'],
  },
});
