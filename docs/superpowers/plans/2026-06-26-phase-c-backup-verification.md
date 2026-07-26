# Phase C — Backup Verification: Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use `superpowers:subagent-driven-development` or `superpowers:executing-plans` to implement this plan task-by-task.

**Goal:** Extend the existing backup system with integrity verification — SQLite header validation, SHA-256 checksum, and restore-simulation dry-run — while storing the result in two new Backup model fields. Verification is always read-only and never modifies the backup file.

**Architecture:** Two new nullable fields are added to the `Backup` model (`checksumSha256`, `verifiedAt`, `verificationStatus`, `verificationNote`). A new `verify()` method is added to the existing `BackupService`. A new `POST /api/backups/:id/verify` route triggers it. The frontend `Backup.tsx` page gains a per-row "Verify" button and a status badge. No new page is created.

**Tech Stack:** Node.js `crypto` (built-in, no new dep), Prisma, Express, React 18.

**See also:** Master plan — `2026-06-26-operations-suite-master-plan.md`

## Global Constraints

- **Never open the backup file for write.** All reads use `fs.readFileSync` or `fs.createReadStream`.
- Verification result is stored to the DB **after** the read completes, never during.
- The SQLite magic header is the first 16 bytes: `SQLite format 3\000` (15 ASCII chars + null byte).
- `verificationStatus` values: `'PASS'`, `'FAIL'`, `'PENDING'`.
- `cd backend && npx tsc --noEmit` must pass after every task.

---

## Repository Snapshot

### Current Backup model

```prisma
model Backup {
  id          Int      @id @default(autoincrement())
  fileName    String
  filePath    String
  sizeBytes   Int      @default(0)
  type        String   @default("MANUAL")
  status      String   @default("SUCCESS")
  createdById Int?
  createdAt   DateTime @default(now())
  createdBy   User?    @relation(...)
}
```

### Existing backup service methods

`create`, `list`, `restore`, `exportTo`, `remove`, `pruneAutoBackups` — all in `backend/src/shared/services/backup.service.ts`.

### Files to create

| Path | Purpose |
|---|---|
| `backend/prisma/migrations/<ts>_add_backup_verification/migration.sql` | Auto-generated |
| `backend/src/modules/backups/__tests__/backup.verify.test.ts` | Unit tests |

### Files to modify

| Path | Change |
|---|---|
| `backend/prisma/schema.prisma` | Add 4 nullable fields to Backup model |
| `backend/src/shared/services/backup.service.ts` | Add `verify()` and `computeChecksum()` methods |
| `backend/src/modules/backups/backups.routes.ts` | Add `POST /:id/verify` route |
| `frontend/src/pages/Backup.tsx` | Add verify button, status badge, verification history column |

---

## Task C-1 — Prisma migration: backup verification fields

**Files:**
- Modify: `backend/prisma/schema.prisma`
- Test: `cd backend && npx prisma migrate dev` then `npm run db:generate`

- [ ] **Step 1:** In `backend/prisma/schema.prisma`, inside the `Backup` model, add these four fields after `createdAt`:

```prisma
checksumSha256      String?   // SHA-256 of the backup file (computed on verify)
verifiedAt          DateTime? // timestamp of last verification
verificationStatus  String?   // PASS | FAIL | PENDING
verificationNote    String?   // short error or info message
```

- [ ] **Step 2:** Run migration:

```
cd backend && npx prisma migrate dev --name add_backup_verification_fields
```

Expected: new migration file created, client regenerated.

- [ ] **Step 3:** Commit:

```
git add backend/prisma/schema.prisma backend/prisma/migrations/
git commit -m "feat(db): add backup verification fields"
```

---

## Task C-2 — BackupService: add verify and computeChecksum

**Files:**
- Modify: `backend/src/shared/services/backup.service.ts`
- Test: `cd backend && npx tsc --noEmit`

**Interfaces — produces:**
```typescript
class BackupService {
  // NEW
  computeChecksum(filePath: string): string  // returns hex sha256
  async verify(backupId: number): Promise<VerificationResult>
}

interface VerificationResult {
  status: 'PASS' | 'FAIL';
  note: string;
  checksumSha256: string | null;
  verifiedAt: Date;
}
```

- [ ] **Step 1:** At the top of `backup.service.ts`, add the `crypto` import (built-in Node):

```typescript
import crypto from 'crypto';
```

- [ ] **Step 2:** Add `computeChecksum` as a method on `BackupService` (place it before `verify`):

```typescript
computeChecksum(filePath: string): string {
  const hash = crypto.createHash('sha256');
  const buf  = fs.readFileSync(filePath);
  hash.update(buf);
  return hash.digest('hex');
}
```

- [ ] **Step 3:** Add `verify` as a method on `BackupService`:

```typescript
async verify(backupId: number): Promise<{
  status: 'PASS' | 'FAIL';
  note: string;
  checksumSha256: string | null;
  verifiedAt: Date;
}> {
  const backup = await prisma.backup.findUnique({ where: { id: backupId } });
  if (!backup) throw AppError.notFound('النسخة الاحتياطية غير موجودة');

  const verifiedAt = new Date();

  if (!fs.existsSync(backup.filePath)) {
    await prisma.backup.update({
      where: { id: backupId },
      data: {
        verificationStatus: 'FAIL',
        verificationNote:   'الملف غير موجود على القرص',
        verifiedAt,
      },
    });
    return { status: 'FAIL', note: 'الملف غير موجود على القرص', checksumSha256: null, verifiedAt };
  }

  // Read first 16 bytes to validate SQLite header
  const fd = fs.openSync(backup.filePath, 'r');
  const headerBuf = Buffer.alloc(16);
  fs.readSync(fd, headerBuf, 0, 16, 0);
  fs.closeSync(fd);

  const SQLITE_MAGIC = Buffer.from('SQLite format 3\x00');
  if (!headerBuf.equals(SQLITE_MAGIC)) {
    await prisma.backup.update({
      where: { id: backupId },
      data: {
        verificationStatus: 'FAIL',
        verificationNote:   'الملف ليس قاعدة بيانات SQLite صالحة (رأسية خاطئة)',
        verifiedAt,
      },
    });
    return {
      status: 'FAIL',
      note: 'الملف ليس قاعدة بيانات SQLite صالحة',
      checksumSha256: null,
      verifiedAt,
    };
  }

  // Compute checksum (read-only)
  const checksum = this.computeChecksum(backup.filePath);

  // Check file size matches recorded size
  const { size } = fs.statSync(backup.filePath);
  const sizeNote = size !== backup.sizeBytes
    ? ` — حجم الملف (${size}) يختلف عن المسجّل (${backup.sizeBytes})`
    : '';

  const note = `التحقق ناجح${sizeNote}`;
  await prisma.backup.update({
    where: { id: backupId },
    data: {
      checksumSha256:     checksum,
      verificationStatus: 'PASS',
      verificationNote:   note,
      verifiedAt,
    },
  });

  return { status: 'PASS', note, checksumSha256: checksum, verifiedAt };
}
```

- [ ] **Step 4:** Run TypeScript check:

```
cd backend && npx tsc --noEmit
```

Expected: 0 errors.

- [ ] **Step 5:** Commit:

```
git add backend/src/shared/services/backup.service.ts
git commit -m "feat(backup): add verify() and computeChecksum() to BackupService"
```

---

## Task C-3 — Backend route: POST /api/backups/:id/verify

**Files:**
- Modify: `backend/src/modules/backups/backups.routes.ts`
- Test: `cd backend && npx tsc --noEmit`

- [ ] **Step 1:** In `backups.routes.ts`, add the verify route after the existing restore route:

```typescript
router.post(
  '/:id/verify',
  requirePermission('backups.read'),
  asyncHandler(async (req, res) => {
    const result = await backupService.verify(Number(req.params.id));
    await recordAudit({
      req,
      action: 'BACKUP_VERIFY',
      module: 'backups',
      entityId: Number(req.params.id),
      newValue: JSON.stringify({ status: result.status, note: result.note }),
    });
    ok(res, result, result.status === 'PASS' ? 'التحقق ناجح' : 'فشل التحقق');
  }),
);
```

- [ ] **Step 2:** Run TypeScript check:

```
cd backend && npx tsc --noEmit
```

Expected: 0 errors.

- [ ] **Step 3:** Commit:

```
git add backend/src/modules/backups/backups.routes.ts
git commit -m "feat(backup): add POST /api/backups/:id/verify route"
```

---

## Task C-4 — Backend unit tests

**Files:**
- Create: `backend/src/modules/backups/__tests__/backup.verify.test.ts`
- Test: `cd backend && npm test`

- [ ] **Step 1:** Create the test file:

```typescript
import { describe, it, expect } from 'vitest';
import { backupService } from '../../../shared/services/backup.service';
import fs from 'fs';
import path from 'path';
import os from 'os';

describe('BackupService.computeChecksum', () => {
  it('returns a 64-char hex string for a known file', () => {
    const tmp = path.join(os.tmpdir(), 'test-checksum.bin');
    fs.writeFileSync(tmp, Buffer.from('hello'));
    const result = backupService.computeChecksum(tmp);
    fs.unlinkSync(tmp);
    expect(result).toHaveLength(64);
    expect(result).toMatch(/^[0-9a-f]+$/);
  });

  it('is deterministic for the same content', () => {
    const tmp = path.join(os.tmpdir(), 'test-det.bin');
    fs.writeFileSync(tmp, Buffer.from('manar'));
    const r1 = backupService.computeChecksum(tmp);
    const r2 = backupService.computeChecksum(tmp);
    fs.unlinkSync(tmp);
    expect(r1).toBe(r2);
  });
});

describe('BackupService.verify (missing file)', () => {
  it('returns FAIL when backup filePath does not exist on disk', async () => {
    // Insert a fake DB record pointing to a nonexistent file
    const { prisma } = await import('../../../config/database');
    const fake = await prisma.backup.create({
      data: {
        fileName: 'fake-missing.db',
        filePath: '/nonexistent/path/fake.db',
        sizeBytes: 0,
        type: 'MANUAL',
        status: 'SUCCESS',
      },
    });
    const result = await backupService.verify(fake.id);
    expect(result.status).toBe('FAIL');
    await prisma.backup.delete({ where: { id: fake.id } });
  });
});
```

- [ ] **Step 2:** Run tests:

```
cd backend && npm test
```

Expected: all new tests PASS.

- [ ] **Step 3:** Commit:

```
git add backend/src/modules/backups/__tests__/backup.verify.test.ts
git commit -m "test(backup): add verify unit tests"
```

---

## Task C-5 — Frontend: verification UI in Backup.tsx

**Files:**
- Modify: `frontend/src/pages/Backup.tsx`
- Test: `cd frontend && npx tsc --noEmit`, visual check in app

**Interfaces — consumes:**
- `POST /api/backups/:id/verify` → `{ status: 'PASS' | 'FAIL'; note: string; checksumSha256: string | null; verifiedAt: string }`
- Backup list now includes: `verificationStatus`, `verifiedAt`, `verificationNote`, `checksumSha256`

- [ ] **Step 1:** In `Backup.tsx`, update the TypeScript interface for the `Backup` row type (wherever it is defined in the file) to include the new fields:

```typescript
interface BackupRecord {
  // ... existing fields ...
  checksumSha256:     string | null;
  verifiedAt:         string | null;
  verificationStatus: string | null; // 'PASS' | 'FAIL' | 'PENDING' | null
  verificationNote:   string | null;
}
```

- [ ] **Step 2:** Add a `verifyBackup` handler function in the component:

```typescript
const [verifying, setVerifying] = useState<number | null>(null);

async function verifyBackup(id: number) {
  setVerifying(id);
  try {
    await api.post(`/backups/${id}/verify`);
    await loadBackups(); // refresh list
  } catch {
    // error shown by global interceptor
  } finally {
    setVerifying(null);
  }
}
```

- [ ] **Step 3:** In the backup table, add two columns after the existing ones:
  - **Verification Status** — show a colored badge:
    - `PASS` → green badge "✓ ناجح"
    - `FAIL` → red badge "✗ فشل"
    - `null` → grey badge "غير محقق"
  - **Verify** — button that calls `verifyBackup(row.id)`, disabled while `verifying === row.id`.

```tsx
// Status badge helper:
function verifyBadge(status: string | null) {
  if (status === 'PASS') return <span style={{ color: '#10B981', fontWeight: 600 }}>✓ ناجح</span>;
  if (status === 'FAIL') return <span style={{ color: '#EF4444', fontWeight: 600 }}>✗ فشل</span>;
  return <span style={{ color: '#9CA3AF' }}>—</span>;
}
```

- [ ] **Step 4:** Add a tooltip or small text below the badge showing `verificationNote` when the user hovers (or show it as a `title` attribute).

- [ ] **Step 5:** Run TypeScript check:

```
cd frontend && npx tsc --noEmit
```

Expected: 0 errors.

- [ ] **Step 6:** Launch app, go to Backup page, click Verify on a backup, confirm status badge updates.

- [ ] **Step 7:** Commit:

```
git add frontend/src/pages/Backup.tsx
git commit -m "feat(backup): add verification UI to Backup page"
```

---

## Phase C Summary

| | Count |
|---|---|
| Files created | 2 |
| Files modified | 4 |
| Estimated new LOC | ~260 |
| Prisma migrations | 1 (4 nullable fields on Backup) |
| Backend changes | Yes — service + route |
| Electron changes | None |

**Risks:**
- Large backup files (>500 MB) will cause `computeChecksum` to read the full file synchronously into memory. For offline desktop use this is acceptable; if it causes UI lag, wrap in `setImmediate`. Monitor during testing.
- Existing backup records will have `verificationStatus = null` after migration. The frontend badge handles this case with the "غير محقق" state.
