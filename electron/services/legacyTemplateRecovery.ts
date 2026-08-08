import fs from 'fs';
import path from 'path';
import { findLatestValue } from './legacyLevelDb.pure';

/**
 * Legacy Cheque Template Recovery Pack v1 — scanner.
 *
 * Cheque designer templates created before the move to SQLite live in a
 * Chromium `localStorage` store inside an OLD `userData` folder. Chromium
 * partitions `localStorage` by `userData` path AND by page origin, and BOTH
 * changed under this application:
 *
 *   - the `userData` path moved when `productName` was introduced
 *     (`package.json`, commit 0d88a50d, 2026-08-07): Electron resolves the
 *     folder from `productName` when present and from `name` otherwise, so
 *     `%AppData%\manar-erp` became `%AppData%\Al Manar ERP`;
 *   - packaged builds made before that commit used the electron-builder
 *     `productName` of the day, `نظام المنار` (`electron-builder.yml`, from the
 *     initial commit until 0d88a50d);
 *   - the origin differs between the dev server (`http://localhost:5173`) and
 *     the packaged app (`file://`).
 *
 * Every candidate below therefore comes from the project's OWN history rather
 * than from guesswork, and the scan is origin-blind on purpose.
 *
 * This module only READS. It never opens a LevelDB handle, never takes its
 * `LOCK` file, never writes, never deletes, and never touches the current
 * profile. Importing what it finds is the database's job, through the ordinary
 * template service — see `chequeDesignerTemplates.service.ts`.
 */

/** The browser-storage key the designer used before the move to SQLite. */
export const LEGACY_STORAGE_KEY = 'chequeDesigner.templates.v1';

/**
 * Legacy `userData` folder names, in the order they were introduced.
 *
 *   `manar-erp`     — `package.json` `name`, used by Electron whenever no
 *                     `productName` was set: every dev run, and every packaged
 *                     build whose app package.json carried only `name`.
 *   `نظام المنار`    — electron-builder `productName` before 0d88a50d, so the
 *                     folder any pre-2026-08-07 INSTALLED build wrote to.
 *   `Electron`      — Electron's own fallback folder name, which appears
 *                     whenever the app name could not be resolved from
 *                     package.json (observed on real machines).
 *
 * The CURRENT folder (`Al Manar ERP`) is deliberately absent: templates still
 * sitting in the current profile are handled by the ordinary in-page migration,
 * which runs first and owns that case.
 */
export const LEGACY_USER_DATA_NAMES = ['manar-erp', 'نظام المنار', 'Electron'] as const;

export interface RecoveredTemplatePayload {
  /** Raw templates exactly as stored — no field is inspected or rewritten here. */
  templates: unknown[];
  /** Where they came from, for the report and the audit trail. */
  source: { userDataName: string; leveldbPath: string; origin: string; file: string };
}

export interface RecoveryScanResult {
  found: RecoveredTemplatePayload | null;
  /** Every path considered and what happened, so a "nothing found" is explainable. */
  inspected: { path: string; outcome: string }[];
}

/** Candidate `Local Storage/leveldb` directories, newest naming first. */
export function legacyLevelDbPaths(appDataRoot: string): { userDataName: string; leveldbPath: string }[] {
  return LEGACY_USER_DATA_NAMES.map((userDataName) => ({
    userDataName,
    leveldbPath: path.join(appDataRoot, userDataName, 'Local Storage', 'leveldb'),
  }));
}

/**
 * Order files the way LevelDB itself resolves recency: SSTables first, then
 * write-ahead logs, each group by ascending file number. The last value seen
 * for a key therefore wins — and an explicit deletion in a later log wins over
 * an earlier value, so a store the user deliberately cleared stays cleared.
 */
function orderedStoreFiles(dir: string): { name: string; bytes: Buffer }[] {
  const fileNumber = (name: string): number => Number.parseInt(name.replace(/\D/g, ''), 10) || 0;
  const names = fs
    .readdirSync(dir)
    .filter((n) => n.endsWith('.ldb') || n.endsWith('.log'))
    .sort((a, b) => {
      const aIsLog = a.endsWith('.log') ? 1 : 0;
      const bIsLog = b.endsWith('.log') ? 1 : 0;
      return aIsLog !== bIsLog ? aIsLog - bIsLog : fileNumber(a) - fileNumber(b);
    });

  const files: { name: string; bytes: Buffer }[] = [];
  for (const name of names) {
    try {
      files.push({ name, bytes: fs.readFileSync(path.join(dir, name)) });
    } catch {
      /* a file that cannot be read is simply not considered */
    }
  }
  return files;
}

/**
 * Scan every known legacy location for a usable template store and return the
 * FIRST one that yields templates.
 *
 * Nothing here is fatal. A missing folder, an unreadable file, a corrupt
 * LevelDB, valid JSON of the wrong shape, or a store holding zero templates all
 * resolve to "nothing found, here is why" — never to an exception. Recovery is
 * an opportunistic convenience; it must never be able to stop the application
 * from starting.
 */
export function scanLegacyChequeTemplates(appDataRoot: string): RecoveryScanResult {
  const inspected: { path: string; outcome: string }[] = [];

  for (const candidate of legacyLevelDbPaths(appDataRoot)) {
    const { userDataName, leveldbPath } = candidate;
    try {
      if (!fs.existsSync(leveldbPath)) {
        inspected.push({ path: leveldbPath, outcome: 'absent' });
        continue;
      }
      const files = orderedStoreFiles(leveldbPath);
      if (files.length === 0) {
        inspected.push({ path: leveldbPath, outcome: 'no-store-files' });
        continue;
      }

      const hit = findLatestValue(files, LEGACY_STORAGE_KEY);
      if (!hit) {
        inspected.push({ path: leveldbPath, outcome: 'key-absent-or-deleted' });
        continue;
      }

      const templates = parseTemplates(hit.value);
      if (templates === null) {
        inspected.push({ path: leveldbPath, outcome: 'unreadable-payload' });
        continue;
      }
      if (templates.length === 0) {
        inspected.push({ path: leveldbPath, outcome: 'store-empty' });
        continue;
      }

      inspected.push({ path: leveldbPath, outcome: `found:${templates.length}` });
      return {
        found: {
          templates,
          source: { userDataName, leveldbPath, origin: hit.origin, file: hit.file },
        },
        inspected,
      };
    } catch (err) {
      inspected.push({ path: leveldbPath, outcome: `error:${(err as Error).message}` });
    }
  }

  return { found: null, inspected };
}

/**
 * Read the stored payload without interpreting any template.
 *
 * Templates are passed through EXACTLY as they were written — every field,
 * coordinate, style property, timestamp and any property this version has never
 * heard of. The only checks made are the ones needed to know a record is a
 * template at all; anything beyond that is validated once, centrally, by the
 * backend's Zod schema, which is also what carries unknown properties through.
 */
function parseTemplates(raw: string): unknown[] | null {
  try {
    const parsed = JSON.parse(raw) as { templates?: unknown };
    if (!parsed || !Array.isArray(parsed.templates)) return null;
    return parsed.templates.filter(
      (t): t is Record<string, unknown> =>
        typeof t === 'object' && t !== null && typeof (t as { id?: unknown }).id === 'string',
    );
  } catch {
    return null;
  }
}
