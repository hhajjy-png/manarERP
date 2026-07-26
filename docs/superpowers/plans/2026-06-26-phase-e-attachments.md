# Phase E — Attachments Center: Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use `superpowers:subagent-driven-development` or `superpowers:executing-plans` to implement this plan task-by-task.

**Goal:** Introduce a generic file-attachment system across Customers, Contracts, Invoices, Employees, Suppliers, Equipment, and Expenses. Files are stored locally in `data/attachments/<entityType>/<entityId>/`. Attachments can be uploaded, previewed (via Electron shell), replaced, and deleted. All actions are audit-logged.

**Architecture:** A new generic `Attachment` Prisma model replaces the per-entity `ContractDocument` pattern (ContractDocument is left intact for backward compatibility). `multer` handles multipart uploads in the Express backend. Two new Electron IPC channels expose native file-open dialog and `shell.openPath`. A reusable `AttachmentsPanel` React component is embedded in existing pages.

**Tech Stack:** Express, `multer` (new dep), Prisma, Node.js `fs`, Electron `shell` + `dialog`, React 18, TypeScript.

**See also:** Master plan — `2026-06-26-operations-suite-master-plan.md`

## Global Constraints

- Accepted MIME types: `application/pdf`, `application/vnd.openxmlformats-officedocument.wordprocessingml.document`, `image/jpeg`, `image/png`, `image/gif`, `image/webp`.
- Max file size: **10 MB** per upload.
- File storage path: `<ATTACHMENTS_DIR>/<entityType>/<entityId>/<uuid>-<originalname>` — never the original filename alone (prevents collisions).
- `ContractDocument` model and its routes/service code are **not modified** — Phase E runs parallel.
- Audit every upload and deletion via `recordAudit`.
- `cd backend && npx tsc --noEmit` and `cd frontend && npx tsc --noEmit` must pass after every task.

---

## Repository Snapshot

### Files to create

| Path | Purpose |
|---|---|
| `backend/prisma/migrations/<ts>_add_attachment/migration.sql` | Auto-generated |
| `backend/src/modules/attachments/attachments.routes.ts` | CRUD + upload routes |
| `backend/src/modules/attachments/attachments.service.ts` | Business logic + file I/O |
| `backend/src/modules/attachments/attachments.schema.ts` | Zod schemas |
| `backend/src/modules/attachments/__tests__/attachments.service.test.ts` | Unit tests |
| `electron/ipc/attachments.ipc.ts` | IPC: openFileDialog, openAttachment |
| `frontend/src/components/AttachmentsPanel.tsx` | Reusable panel component |

### Files to modify

| Path | Change |
|---|---|
| `backend/prisma/schema.prisma` | Add `Attachment` model |
| `backend/src/config/constants.ts` | Add `'attachments'` to MODULES |
| `backend/src/config/env.ts` | Add `ATTACHMENTS_DIR` env var |
| `backend/src/app.ts` | Register attachments router |
| `electron/main.ts` | Register attachments IPC |
| `electron/preload.ts` | Expose `window.manar.openFileDialog`, `window.manar.openAttachment` |
| `frontend/src/pages/Invoices.tsx` | Embed `<AttachmentsPanel>` |
| `frontend/src/pages/Expenses.tsx` | Embed `<AttachmentsPanel>` |

---

## Task E-1 — Prisma: add Attachment model

**Files:**
- Modify: `backend/prisma/schema.prisma`
- Test: `cd backend && npx prisma migrate dev` then `npm run db:generate`

- [ ] **Step 1:** In `schema.prisma`, add the `Attachment` model (place it after `ContractDocument`):

```prisma
model Attachment {
  id           Int      @id @default(autoincrement())
  entityType   String   // CUSTOMER | CONTRACT | INVOICE | EMPLOYEE | SUPPLIER | EXPENSE | EQUIPMENT
  entityId     Int
  title        String
  fileName     String   // stored filename (uuid prefix)
  originalName String   // original upload filename
  filePath     String   // absolute path on disk
  fileSize     Int      @default(0) // bytes
  mimeType     String?
  uploadedById Int?
  uploadedAt   DateTime @default(now())

  uploadedBy User? @relation("AttachmentUploader", fields: [uploadedById], references: [id])

  @@index([entityType, entityId])
  @@index([uploadedAt])
  @@map("attachments")
}
```

Also add the back-relation to the `User` model:
```prisma
// In model User { ... }
uploadedAttachments  Attachment[]  @relation("AttachmentUploader")
```

- [ ] **Step 2:** Run migration:

```
cd backend && npx prisma migrate dev --name add_attachment_model
```

Expected: migration created, client regenerated.

- [ ] **Step 3:** Commit:

```
git add backend/prisma/schema.prisma backend/prisma/migrations/
git commit -m "feat(db): add Attachment model"
```

---

## Task E-2 — Backend config: add ATTACHMENTS_DIR and module constant

**Files:**
- Modify: `backend/src/config/env.ts`
- Modify: `backend/src/config/constants.ts`
- Test: `cd backend && npx tsc --noEmit`

- [ ] **Step 1:** In `env.ts`, add to the Zod schema:

```typescript
ATTACHMENTS_DIR: z.string().default('./data/attachments'),
```

- [ ] **Step 2:** In `constants.ts`, add `'attachments'` to the `MODULES` array.

- [ ] **Step 3:** Run TypeScript check:

```
cd backend && npx tsc --noEmit
```

Expected: 0 errors.

- [ ] **Step 4:** Commit:

```
git add backend/src/config/env.ts backend/src/config/constants.ts
git commit -m "feat(config): add ATTACHMENTS_DIR and attachments module"
```

---

## Task E-3 — Install multer

**Files:**
- Modify: `backend/package.json` (via npm install)
- Test: `cd backend && npx tsc --noEmit`

- [ ] **Step 1:** Install multer and its types:

```
cd backend && npm install multer && npm install --save-dev @types/multer
```

Expected: `multer` appears in `dependencies`, `@types/multer` in `devDependencies`.

- [ ] **Step 2:** Run TypeScript check:

```
cd backend && npx tsc --noEmit
```

Expected: 0 errors.

- [ ] **Step 3:** Commit:

```
git add backend/package.json backend/package-lock.json
git commit -m "feat(deps): add multer for file upload"
```

---

## Task E-4 — Attachments service

**Files:**
- Create: `backend/src/modules/attachments/attachments.schema.ts`
- Create: `backend/src/modules/attachments/attachments.service.ts`
- Test: `cd backend && npx tsc --noEmit`

**Interfaces — produces:**
```typescript
export const ALLOWED_MIME_TYPES: string[]   // 6 types
export const ALLOWED_ENTITY_TYPES: string[] // 7 types
export class AttachmentsService {
  async list(entityType: string, entityId: number): Promise<Attachment[]>
  async remove(id: number, userId: number, req: Request): Promise<void>
  storageDir(entityType: string, entityId: number): string
}
```

- [ ] **Step 1:** Create `backend/src/modules/attachments/attachments.schema.ts`:

```typescript
import { z } from 'zod';

export const ALLOWED_ENTITY_TYPES = [
  'CUSTOMER', 'CONTRACT', 'INVOICE', 'EMPLOYEE', 'SUPPLIER', 'EXPENSE', 'EQUIPMENT',
] as const;

export const ALLOWED_MIME_TYPES = [
  'application/pdf',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'image/jpeg',
  'image/png',
  'image/gif',
  'image/webp',
] as const;

export const listQuerySchema = z.object({
  entityType: z.enum(ALLOWED_ENTITY_TYPES),
  entityId:   z.coerce.number().int().positive(),
});

export const deleteParamSchema = z.object({
  id: z.coerce.number().int().positive(),
});
```

- [ ] **Step 2:** Create `backend/src/modules/attachments/attachments.service.ts`:

```typescript
import fs from 'fs';
import path from 'path';
import type { Request } from 'express';
import { prisma } from '@config/database';
import { env } from '@config/env';
import { AppError } from '@core/errors/AppError';
import { recordAudit } from '@core/middleware/audit';

export class AttachmentsService {
  storageDir(entityType: string, entityId: number): string {
    const dir = path.resolve(process.cwd(), env.ATTACHMENTS_DIR, entityType, String(entityId));
    fs.mkdirSync(dir, { recursive: true });
    return dir;
  }

  async list(entityType: string, entityId: number) {
    return prisma.attachment.findMany({
      where: { entityType, entityId },
      orderBy: { uploadedAt: 'desc' },
      include: { uploadedBy: { select: { username: true, fullName: true } } },
    });
  }

  async remove(id: number, userId: number, req: Request): Promise<void> {
    const att = await prisma.attachment.findUnique({ where: { id } });
    if (!att) throw AppError.notFound('المرفق غير موجود');

    if (fs.existsSync(att.filePath)) {
      fs.unlinkSync(att.filePath);
    }

    await prisma.attachment.delete({ where: { id } });

    await recordAudit({
      req,
      action: 'DELETE',
      module: 'attachments',
      entityId: id,
      oldValue: JSON.stringify({
        entityType: att.entityType,
        entityId:   att.entityId,
        fileName:   att.originalName,
      }),
    });
  }
}

export const attachmentsService = new AttachmentsService();
```

- [ ] **Step 3:** Run TypeScript check:

```
cd backend && npx tsc --noEmit
```

Expected: 0 errors.

- [ ] **Step 4:** Commit:

```
git add backend/src/modules/attachments/
git commit -m "feat(attachments): add attachments service and schema"
```

---

## Task E-5 — Attachments routes

**Files:**
- Create: `backend/src/modules/attachments/attachments.routes.ts`
- Modify: `backend/src/app.ts`
- Test: `cd backend && npx tsc --noEmit`

- [ ] **Step 1:** Create `backend/src/modules/attachments/attachments.routes.ts`:

```typescript
import path from 'path';
import { Router } from 'express';
import multer from 'multer';
import { randomUUID } from 'crypto';
import { authenticate } from '@core/middleware/auth.middleware';
import { requirePermission } from '@core/middleware/rbac.middleware';
import { asyncHandler } from '@core/utils/asyncHandler';
import { ok, created } from '@core/utils/response';
import { recordAudit } from '@core/middleware/audit';
import { AppError } from '@core/errors/AppError';
import { prisma } from '@config/database';
import { attachmentsService } from './attachments.service';
import { listQuerySchema, deleteParamSchema, ALLOWED_MIME_TYPES, ALLOWED_ENTITY_TYPES } from './attachments.schema';

const MAX_FILE_SIZE = 10 * 1024 * 1024; // 10 MB

const upload = multer({
  storage: multer.diskStorage({
    destination: (req, _file, cb) => {
      const { entityType, entityId } = req.query as { entityType: string; entityId: string };
      const dir = attachmentsService.storageDir(entityType, Number(entityId));
      cb(null, dir);
    },
    filename: (_req, file, cb) => {
      const ext = path.extname(file.originalname);
      cb(null, `${randomUUID()}${ext}`);
    },
  }),
  limits: { fileSize: MAX_FILE_SIZE },
  fileFilter: (_req, file, cb) => {
    if ((ALLOWED_MIME_TYPES as readonly string[]).includes(file.mimetype)) {
      cb(null, true);
    } else {
      cb(new Error(`نوع الملف غير مسموح: ${file.mimetype}`));
    }
  },
});

const router = Router();
router.use(authenticate);

router.get(
  '/',
  requirePermission('attachments.read'),
  asyncHandler(async (req, res) => {
    const { entityType, entityId } = listQuerySchema.parse(req.query);
    ok(res, await attachmentsService.list(entityType, entityId));
  }),
);

router.post(
  '/',
  requirePermission('attachments.create'),
  upload.single('file'),
  asyncHandler(async (req, res) => {
    if (!req.file) throw AppError.badRequest('لم يتم رفع أي ملف');

    const { entityType, entityId } = listQuerySchema.parse(req.query);
    const title: string = (req.body.title as string) || req.file.originalname;

    if (!(ALLOWED_ENTITY_TYPES as readonly string[]).includes(entityType)) {
      throw AppError.badRequest('نوع الكيان غير مسموح');
    }

    const att = await prisma.attachment.create({
      data: {
        entityType,
        entityId:     Number(entityId),
        title,
        fileName:     req.file.filename,
        originalName: req.file.originalname,
        filePath:     req.file.path,
        fileSize:     req.file.size,
        mimeType:     req.file.mimetype,
        uploadedById: req.user!.userId,
      },
    });

    await recordAudit({
      req,
      action: 'CREATE',
      module: 'attachments',
      entityId: att.id,
      newValue: JSON.stringify({ entityType, entityId, fileName: att.originalName }),
    });

    created(res, att, 'تم رفع المرفق');
  }),
);

router.delete(
  '/:id',
  requirePermission('attachments.delete'),
  asyncHandler(async (req, res) => {
    const { id } = deleteParamSchema.parse(req.params);
    await attachmentsService.remove(id, req.user!.userId, req);
    ok(res, null, 'تم حذف المرفق');
  }),
);

export default router;
```

- [ ] **Step 2:** In `backend/src/app.ts`, import and register:

```typescript
import attachmentsRouter from '@modules/attachments/attachments.routes';
// inside app setup:
app.use('/api/attachments', attachmentsRouter);
```

- [ ] **Step 3:** Run TypeScript check:

```
cd backend && npx tsc --noEmit
```

Expected: 0 errors.

- [ ] **Step 4:** Commit:

```
git add backend/src/modules/attachments/attachments.routes.ts backend/src/app.ts
git commit -m "feat(attachments): register attachments API"
```

---

## Task E-6 — Electron: IPC for file open dialog and shell preview

**Files:**
- Create: `electron/ipc/attachments.ipc.ts`
- Modify: `electron/main.ts`
- Modify: `electron/preload.ts`
- Test: `tsc -p electron/tsconfig.json --noEmit`

- [ ] **Step 1:** Create `electron/ipc/attachments.ipc.ts`:

```typescript
import { BrowserWindow, dialog, ipcMain, shell } from 'electron';

export function registerAttachmentsIpc() {
  ipcMain.handle('attachments:openFileDialog', async () => {
    const win = BrowserWindow.getFocusedWindow();
    const result = await dialog.showOpenDialog(win!, {
      title: 'اختر ملفًا للإرفاق',
      properties: ['openFile'],
      filters: [
        { name: 'Documents & Images', extensions: ['pdf', 'docx', 'jpg', 'jpeg', 'png', 'gif', 'webp'] },
      ],
    });
    return result.canceled ? null : result.filePaths[0] ?? null;
  });

  ipcMain.handle('attachments:openPath', async (_e, filePath: string) => {
    const err = await shell.openPath(filePath);
    return err || null; // null = success, string = error message
  });
}
```

- [ ] **Step 2:** In `electron/main.ts`, import and call:

```typescript
import { registerAttachmentsIpc } from './ipc/attachments.ipc';
// Inside bootstrap():
registerAttachmentsIpc();
```

- [ ] **Step 3:** In `electron/preload.ts`, inside the `contextBridge.exposeInMainWorld('manar', { ... })` block, add:

```typescript
openFileDialog: (): Promise<string | null> =>
  ipcRenderer.invoke('attachments:openFileDialog'),
openAttachment: (filePath: string): Promise<string | null> =>
  ipcRenderer.invoke('attachments:openPath', filePath),
```

- [ ] **Step 4:** Run TypeScript check:

```
tsc -p electron/tsconfig.json --noEmit
```

Expected: 0 errors.

- [ ] **Step 5:** Commit:

```
git add electron/ipc/attachments.ipc.ts electron/main.ts electron/preload.ts
git commit -m "feat(electron): add attachments IPC (openFileDialog, openPath)"
```

---

## Task E-7 — Seed: attachments permissions

**Files:**
- Modify: `backend/prisma/seed.ts`
- Test: `cd backend && npx prisma db seed`

- [ ] **Step 1:** In `seed.ts`, add these permission keys to the appropriate role permission arrays:

- `SYSTEM_ADMIN` → `attachments.read`, `attachments.create`, `attachments.delete`
- `GENERAL_MANAGER` → `attachments.read`, `attachments.create`, `attachments.delete`
- `ACCOUNTANT` → `attachments.read`, `attachments.create`, `attachments.delete`
- `PROJECT_MANAGER` → `attachments.read`, `attachments.create`, `attachments.delete`
- `HR_MANAGER` → `attachments.read`, `attachments.create`, `attachments.delete`
- `EQUIPMENT_MANAGER` → `attachments.read`, `attachments.create`
- `STANDARD_USER` → `attachments.read`

- [ ] **Step 2:** Run seed:

```
cd backend && npx prisma db seed
```

Expected: seed completes without errors.

- [ ] **Step 3:** Commit:

```
git add backend/prisma/seed.ts
git commit -m "feat(seed): add attachments permissions"
```

---

## Task E-8 — Frontend: AttachmentsPanel component

**Files:**
- Create: `frontend/src/components/AttachmentsPanel.tsx`
- Test: `cd frontend && npx tsc --noEmit`

**Interfaces — produces:**
```typescript
interface Props {
  entityType: 'CUSTOMER' | 'CONTRACT' | 'INVOICE' | 'EMPLOYEE' | 'SUPPLIER' | 'EXPENSE' | 'EQUIPMENT';
  entityId: number;
  readOnly?: boolean;
}
export default function AttachmentsPanel(props: Props): JSX.Element
```

- [ ] **Step 1:** Create `frontend/src/components/AttachmentsPanel.tsx`:

```typescript
import { useEffect, useState, useRef } from 'react';
import { api, errorMessage } from '../api/client';

interface Attachment {
  id: number;
  title: string;
  originalName: string;
  filePath: string;
  fileSize: number;
  mimeType: string | null;
  uploadedAt: string;
  uploadedBy: { username: string; fullName: string | null } | null;
}

interface Props {
  entityType: 'CUSTOMER' | 'CONTRACT' | 'INVOICE' | 'EMPLOYEE' | 'SUPPLIER' | 'EXPENSE' | 'EQUIPMENT';
  entityId: number;
  readOnly?: boolean;
}

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export default function AttachmentsPanel({ entityType, entityId, readOnly = false }: Props) {
  const [attachments, setAttachments] = useState<Attachment[]>([]);
  const [loading, setLoading] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [titleInput, setTitleInput] = useState('');
  const fileRef = useRef<HTMLInputElement>(null);

  async function load() {
    setLoading(true);
    try {
      const r = await api.get<Attachment[]>('/attachments', {
        params: { entityType, entityId },
      });
      setAttachments(r.data);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { load(); }, [entityType, entityId]);

  async function handleUpload() {
    const file = fileRef.current?.files?.[0];
    if (!file) return;
    const formData = new FormData();
    formData.append('file', file);
    formData.append('title', titleInput || file.name);

    setUploading(true);
    try {
      await api.post('/attachments', formData, {
        params: { entityType, entityId },
        headers: { 'Content-Type': 'multipart/form-data' },
      });
      setTitleInput('');
      if (fileRef.current) fileRef.current.value = '';
      await load();
    } catch (e) {
      alert(errorMessage(e));
    } finally {
      setUploading(false);
    }
  }

  async function handleDelete(id: number) {
    if (!confirm('هل تريد حذف هذا المرفق؟')) return;
    try {
      await api.delete(`/attachments/${id}`);
      await load();
    } catch (e) {
      alert(errorMessage(e));
    }
  }

  async function handleOpen(filePath: string) {
    if (window.manar?.openAttachment) {
      const err = await window.manar.openAttachment(filePath);
      if (err) alert(`تعذّر فتح الملف: ${err}`);
    }
  }

  return (
    <div style={{ marginTop: 16 }}>
      <strong style={{ fontSize: 13, color: '#374151' }}>المرفقات ({attachments.length})</strong>

      {!readOnly && (
        <div style={{ display: 'flex', gap: 8, marginTop: 10, flexWrap: 'wrap' }}>
          <input
            type="text"
            placeholder="عنوان المرفق (اختياري)"
            value={titleInput}
            onChange={e => setTitleInput(e.target.value)}
            style={{ flex: 1, minWidth: 140, fontSize: 13 }}
          />
          <input
            ref={fileRef}
            type="file"
            accept=".pdf,.docx,.jpg,.jpeg,.png,.gif,.webp"
            style={{ flex: 2, fontSize: 13 }}
          />
          <button onClick={handleUpload} disabled={uploading} className="btn-primary" style={{ fontSize: 13 }}>
            {uploading ? 'جارٍ الرفع…' : 'رفع'}
          </button>
        </div>
      )}

      {loading ? (
        <div style={{ marginTop: 10, color: '#9CA3AF', fontSize: 13 }}>جارٍ التحميل…</div>
      ) : attachments.length === 0 ? (
        <div style={{ marginTop: 10, color: '#9CA3AF', fontSize: 13 }}>لا توجد مرفقات</div>
      ) : (
        <table style={{ width: '100%', marginTop: 10, fontSize: 13, borderCollapse: 'collapse' }}>
          <thead>
            <tr style={{ background: '#F9FAFB', borderBottom: '1px solid #E5E7EB' }}>
              <th style={{ textAlign: 'right', padding: '6px 8px' }}>العنوان</th>
              <th style={{ textAlign: 'right', padding: '6px 8px' }}>الحجم</th>
              <th style={{ textAlign: 'right', padding: '6px 8px' }}>التاريخ</th>
              <th style={{ padding: '6px 8px' }}></th>
            </tr>
          </thead>
          <tbody>
            {attachments.map(att => (
              <tr key={att.id} style={{ borderBottom: '1px solid #F3F4F6' }}>
                <td style={{ padding: '6px 8px' }}>
                  <button
                    onClick={() => handleOpen(att.filePath)}
                    style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#3B82F6', textAlign: 'right', padding: 0 }}
                  >
                    {att.title || att.originalName}
                  </button>
                </td>
                <td style={{ padding: '6px 8px', color: '#6B7280' }}>{formatBytes(att.fileSize)}</td>
                <td style={{ padding: '6px 8px', color: '#6B7280' }}>
                  {new Date(att.uploadedAt).toLocaleDateString('ar-KW')}
                </td>
                <td style={{ padding: '6px 8px' }}>
                  {!readOnly && (
                    <button
                      onClick={() => handleDelete(att.id)}
                      style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#EF4444', fontSize: 13 }}
                    >
                      حذف
                    </button>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}
```

- [ ] **Step 2:** Add the `window.manar` type declaration. In `frontend/src/vite-env.d.ts` or wherever global types are declared:

```typescript
interface Window {
  manar?: {
    // ... existing declarations ...
    openFileDialog?: () => Promise<string | null>;
    openAttachment?: (filePath: string) => Promise<string | null>;
  };
}
```

- [ ] **Step 3:** Run TypeScript check:

```
cd frontend && npx tsc --noEmit
```

Expected: 0 errors.

- [ ] **Step 4:** Commit:

```
git add frontend/src/components/AttachmentsPanel.tsx frontend/src/vite-env.d.ts
git commit -m "feat(attachments): add AttachmentsPanel component"
```

---

## Task E-9 — Integrate AttachmentsPanel into Invoices and Expenses

**Files:**
- Modify: `frontend/src/pages/Invoices.tsx`
- Modify: `frontend/src/pages/Expenses.tsx`
- Test: `cd frontend && npx tsc --noEmit`, visual check in app

- [ ] **Step 1:** In `Invoices.tsx`, find where the invoice detail / drawer / modal is rendered. Import `AttachmentsPanel` and embed it when an invoice is selected:

```tsx
import AttachmentsPanel from '../components/AttachmentsPanel';

// Inside the detail/drawer panel, after existing invoice details:
{selectedInvoice && (
  <AttachmentsPanel entityType="INVOICE" entityId={selectedInvoice.id} />
)}
```

- [ ] **Step 2:** In `Expenses.tsx`, do the same when an expense record is selected or in its detail view:

```tsx
import AttachmentsPanel from '../components/AttachmentsPanel';

{selectedExpense && (
  <AttachmentsPanel entityType="EXPENSE" entityId={selectedExpense.id} />
)}
```

- [ ] **Step 3:** Run TypeScript check:

```
cd frontend && npx tsc --noEmit
```

Expected: 0 errors.

- [ ] **Step 4:** Launch app, open an invoice, confirm the AttachmentsPanel appears. Upload a PDF, confirm it appears in the list. Click the title, confirm the file opens. Delete it, confirm it disappears.

- [ ] **Step 5:** Commit:

```
git add frontend/src/pages/Invoices.tsx frontend/src/pages/Expenses.tsx
git commit -m "feat(attachments): integrate AttachmentsPanel into Invoices and Expenses"
```

---

## Phase E Summary

| | Count |
|---|---|
| Files created | 6 |
| Files modified | 8 |
| Estimated new LOC | ~780 |
| Prisma migrations | 1 (Attachment model) |
| Backend changes | Yes — new module + multer |
| Electron changes | Yes — 2 new IPC channels |

**Risks:**
- `multer` uses disk storage; uploaded files remain on disk even if the DB record creation fails. The route must be tested for partial-failure behavior. Mitigation: if `prisma.attachment.create` throws, the uploaded file at `req.file.path` should be deleted in the catch block. Add this cleanup in the route handler.
- `shell.openPath` on Windows opens the file with the default application. PDFs will open in the default PDF viewer. This is correct behavior.
- The `ContractDocument` model and its UI are not removed. Users who already have contract documents will continue to see them in the existing contract documents tab. Phase E adds parallel attachment support.
- `window.manar` type declarations: confirm that `electron/preload.ts` uses a TypeScript interface that matches the declaration added in `vite-env.d.ts`.
