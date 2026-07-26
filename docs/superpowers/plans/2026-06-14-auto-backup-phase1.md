# Auto Backup Enhancements Phase 1 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Extend the existing Electron-side backup scheduler with settings-driven config, audit logging, dashboard widget, retention cleanup, and startup catch-up.

**Architecture:** The Electron main process generates a one-time `INTERNAL_SECRET` (UUID) on startup and passes it to the backend child process via env var. A new `/api/internal/` Express router (protected by `X-Internal-Secret` header, no JWT) handles: reading backup settings and recording completed auto backups with their Prisma `Backup` record + `AuditLog`. The scheduler reads settings at startup via this internal API and calls it after each successful file copy.

**Tech Stack:** node-cron (Electron main), Node.js `http` module (internal HTTP calls from main process), Express router (internal API), Prisma (Backup + AuditLog + Setting models), React (LastAutoBackupCard dashboard component).

---

## File Map

**Created:**
- `backend/src/modules/backups/internal.routes.ts` — internal Express router (no JWT, INTERNAL_SECRET only)
- `frontend/src/components/dashboard/LastAutoBackupCard.tsx` — dashboard widget

**Modified:**
- `backend/src/config/env.ts` — add `INTERNAL_SECRET` env var (optional)
- `backend/src/shared/services/backup.service.ts` — add `pruneAutoBackups(keep)`
- `backend/src/modules/backups/backups.routes.ts` — add `GET /last-auto`
- `backend/src/app.ts` — register `/api/internal` router
- `electron/services/backendLauncher.ts` — pass `INTERNAL_SECRET` to forked process env
- `electron/services/backupScheduler.ts` — full refactor (filename, settings read, HTTP record, catch-up, reconfigure)
- `electron/main.ts` — generate secret, await scheduler, fire catch-up
- `electron/ipc/backup.ipc.ts` — add `backup:reconfigure` IPC handler
- `electron/preload.ts` — expose `backupReconfigure()` via contextBridge
- `frontend/src/api/client.ts` — add `backupReconfigure` to `Window.manar` type
- `frontend/src/pages/Dashboard.tsx` — import and render `LastAutoBackupCard`
- `frontend/src/pages/Settings.tsx` — add backup.auto.* fields + call reconfigure on save
- `frontend/src/lib/i18n.ts` — add translation keys for new fields

---

## Task 1: Backend — env.ts + internal router

**Files:**
- Modify: `backend/src/config/env.ts`
- Create: `backend/src/modules/backups/internal.routes.ts`

- [ ] Add `INTERNAL_SECRET` to env schema (optional string, default empty):
```typescript
INTERNAL_SECRET: z.string().optional().default(''),
```

- [ ] Create `internal.routes.ts` with two routes:
  - `GET /api/internal/backup-settings` — reads backup.auto.* from Setting table, returns defaults if missing
  - `POST /api/internal/auto-backup` — receives `{fileName, filePath, sizeBytes}`, creates Backup record + AuditLog, calls pruneAutoBackups

---

## Task 2: Backend — backup.service.ts + backups.routes.ts

**Files:**
- Modify: `backend/src/shared/services/backup.service.ts`
- Modify: `backend/src/modules/backups/backups.routes.ts`

- [ ] Add `pruneAutoBackups(keep: number): Promise<string[]>` method to BackupService
  - Query all AUTO backups ordered by createdAt DESC
  - Slice beyond `keep`, delete files + Prisma records
  - Return array of deleted file names

- [ ] Add `GET /last-auto` to backups routes:
  - Protected by existing `requirePermission('backups.read')`
  - Returns `prisma.backup.findFirst({ where: { type: 'AUTO', status: 'SUCCESS' }, orderBy: { createdAt: 'desc' } })`

---

## Task 3: Backend — app.ts

- [ ] Import and register `/api/internal` router in `backend/src/app.ts`

---

## Task 4: Electron — backendLauncher.ts

- [ ] Modify `startBackend(internalSecret?: string)` to accept secret parameter
- [ ] Add `INTERNAL_SECRET: internalSecret ?? ''` to the env object passed to fork

---

## Task 5: Electron — backupScheduler.ts (full refactor)

**New behavior:**
- `startBackupScheduler(secret)` — reads settings from `GET /api/internal/backup-settings`, starts cron
- `runCatchupIfNeeded(secret)` — checks last AUTO backup on disk; if before last scheduled time, runs one backup
- `reconfigureBackupScheduler()` — re-reads settings, restarts cron
- `runAutoBackup()` — copies file with `manar_AUTO_YYYY-MM-DD_HH-mm-ss.db` format, then calls `POST /api/internal/auto-backup`

---

## Task 6: Electron — main.ts

- [ ] Import `randomUUID` from `crypto`
- [ ] Generate `const INTERNAL_SECRET = randomUUID()` before bootstrap
- [ ] `await startBackend(INTERNAL_SECRET)`
- [ ] `await startBackupScheduler(INTERNAL_SECRET)`
- [ ] `runCatchupIfNeeded(INTERNAL_SECRET).catch(console.error)` (non-blocking)

---

## Task 7: Electron — IPC + preload

- [ ] `backup.ipc.ts`: add `ipcMain.handle('backup:reconfigure', async () => { await reconfigureBackupScheduler(); return { ok: true }; })`
- [ ] `preload.ts`: add `backupReconfigure: (): Promise<{ ok: boolean }> => ipcRenderer.invoke('backup:reconfigure')`

---

## Task 8: Frontend — LastAutoBackupCard.tsx + Dashboard

- [ ] Create `LastAutoBackupCard.tsx` — fetches `GET /api/backups/last-auto`, shows date + time + size or "لا توجد نسخة احتياطية"
- [ ] Add to `Dashboard.tsx` stats grid (7th card after the 6 OpsCards)

---

## Task 9: Frontend — Settings.tsx + i18n.ts

- [ ] Add 3 new FIELDS entries with special types (checkbox, time, number)
- [ ] Initialize state with defaults for backup.auto.* keys
- [ ] After successful save, call `window.manar?.backupReconfigure()`
- [ ] Add translation strings to `i18n.ts` for AR and EN

---

## Settings Keys

| Key | Default | Type |
|---|---|---|
| `backup.auto.enabled` | `'true'` | checkbox → 'true'/'false' string |
| `backup.auto.time` | `'02:00'` | time input (HH:mm) |
| `backup.auto.retention` | `'30'` | number input |

## Filename Format

`manar_AUTO_YYYY-MM-DD_HH-mm-ss.db`

## Audit Actions

| Event | action | module | payload |
|---|---|---|---|
| Successful auto backup | `AUTO_BACKUP` | `system` | `{ fileName, fileSize, retentionCount }` |
| Retention cleanup | `AUTO_BACKUP_CLEANUP` | `system` | `{ deletedFiles: string[] }` |
