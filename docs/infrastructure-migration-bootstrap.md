# Infrastructure Pack — Migration & Reference-Data Bootstrap (design only)

> **Status:** design. Nothing in this document is implemented.
> **Origin:** the HTTP 400 incident on `/api/letters` (2026-08-03).
> **Scope of the eventual pack:** backend startup sequence + deployment path only.

---

## 1. The headline finding

**The migration bootstrap already exists, and it already does everything asked for.**

`backend/src/server.ts:38` calls `runPendingMigrations()` as the first statement of
`startServer()`, before `initDatabase()`, inside the `try` whose `catch` routes to
`crashSafely()` → `process.exit(1)`.

`backend/src/core/utils/migrate.ts` runs `prisma migrate deploy` against the user's
database and rethrows on failure.

Measured against the four requirements:

| Requirement | Status | Where |
|---|---|---|
| Detect pending migrations | ✅ Met | inherent to `migrate deploy` |
| Execute `migrate deploy` at backend startup | ✅ Met | `server.ts:38` |
| Abort startup if migration fails | ✅ Met | `migrate.ts:31` `throw` → `crashSafely` → `exit(1)` |
| Log the result clearly | ✅ Met | `migrate.ts:22,28,30` via winston |

**A production installation has never required anyone to remember `migrate deploy`.**
It runs on every launch, and the service refuses to start on an inconsistent schema.

### Correction to the P2 bug report

That report stated production would show the same HTTP 400 until someone ran
`migrate deploy` there. **That was wrong.** A packaged installation applies pending
migrations automatically at startup and would have self-healed on first launch. This
matters for release planning, so it is corrected here rather than left standing.

---

## 2. Then why was the letters migration never applied?

One line — `migrate.ts:17`:

```ts
export function runPendingMigrations(): void {
  if (!isProd) return;          // ← development is excluded, by design
```

Development is excluded deliberately: the documented dev workflow is `npm run db:migrate`
(`prisma migrate dev`). The letter-engine migration was authored in development, and
`migrate dev` was never run — correctly so, because on this repository's **pre-existing
drift** it would have dropped `printed_cheques` and `professional_form_templates`.

So the incident was not a missing mechanism. It was a **development-only blind spot**
in an otherwise sound one, made permanent by a drift that makes the documented dev
command unsafe to run.

---

## 3. Production preconditions — verified, all hold

The bootstrap depends on three things being true of the packaged app. All were checked:

| Precondition | Verified |
|---|---|
| `prisma/schema.prisma` + `prisma/migrations/**` are packaged | ✅ `electron-builder.yml` → `extraResources: backend/prisma → backend/prisma` |
| The Prisma CLI resolves at runtime (`require.resolve('prisma')`) | ✅ `extraResources: backend/node_modules` with filter `**/*` |
| `process.cwd()` of the forked backend makes `path.resolve(cwd,'prisma',…)` correct | ✅ `backendLauncher.ts:46` sets `cwd = path.join(resourcesPath,'backend')` |

---

## 4. The gap that actually still exists: reference data

`migrate deploy` creates **tables**. It never inserts **rows**, and the seed never runs
automatically anywhere — verified: no reference to `seed` in `server.ts`,
`migrate.ts`, or `backendLauncher.ts`.

That is why the seven `letters.*` `Permission` rows had to be created by hand
(`backend/scripts/one-time/create-letters-permissions.ts`) even after the migration
succeeded. The consequence was invisible to an administrator, because `SYSTEM_ADMIN`
bypasses RBAC — the module worked for the only person likely to test it while no other
role could ever be granted access.

**Every future module that adds permission keys will hit this same wall.** Automating
migrations without automating permission reconciliation leaves the more insidious half
of the problem in place: a missing table fails loudly, a missing permission row fails
silently and only for non-administrators.

---

## 5. Proposed architecture

Two independent stages, in this order, both idempotent:

```
startServer()
  ├── 1. runPendingMigrations()          [EXISTS — extend to development]
  │        prisma migrate deploy · abort on failure
  ├── 2. await initDatabase()            [exists]
  ├── 3. await reconcilePermissions()    [NEW — the actual gap]
  │        upsert MODULES × ACTIONS · never revoke · abort on failure
  ├── 4. await reconcileSequencesOnStartup()  [exists]
  └── 5. app.listen()
```

### Safest integration point

**Stage 3, between `initDatabase()` and `app.listen()`** — `server.ts:43`, immediately
before the existing `reconcileSequencesOnStartup()` call.

The reasoning:

- It needs a live Prisma client, so it cannot sit beside stage 1.
- It must complete **before the port opens**. No request may ever observe a
  half-permissioned system; binding the socket first would create a window in which
  authorisation answers differ from one second to the next.
- It belongs in the same `try` as the existing startup steps, so failure reaches
  `crashSafely()` on the path already proven by migrations.

### Failure policy

**Abort startup**, matching migrations. A partially-reconciled permission table is a
security-relevant inconsistency, not a degraded feature — refusing to start is the
honest response, and it is the behaviour the existing code already establishes for a
schema it cannot trust.

`reconcileSequencesOnStartup()` is deliberately the opposite (never throws) because it
is a safety net that corrects data, not a preconditio; stage 3 should not copy it.

---

## 6. Risks the pack must close

| # | Risk | Note |
|---|---|---|
| 1 | **Dev drift blocks the dev workflow.** `printed_cheques` and `professional_form_templates` would be dropped by `migrate dev`. | Pre-existing, unrelated to the Letter Engine, and now the direct cause of a real outage. `migrate deploy` is unaffected (it never diffs), so enabling stage 1 in dev is safe — but the drift itself should be resolved first, or `migrate dev` stays unusable. |
| 2 | **No backup before migrating.** A failed migration on a user's live database has no automatic rollback. | The pack should snapshot the DB file before applying pending migrations, mirroring what was done by hand during the incident. Cheap for SQLite. |
| 3 | **Concurrent startup.** SQLite has no advisory lock; a fast restart (watch mode, or the EADDRINUSE recovery path) could run two `migrate deploy` processes at once. | Needs a lock file or a single-instance guard. |
| 4 | **`stdio: 'inherit'` in a packaged app.** Prisma's own output goes to a stdout nobody reads — exactly the diagnostic loss the incident suffered from. | Capture the child's output and route it through winston instead. |
| 5 | **Enabling stage 1 in development changes developer workflow.** | Recommend opt-out via env var rather than opt-in, so the safe path is the default and the escape hatch is explicit. |
| 6 | **The shipped template DB is a copy of `backend/data/manar.db`.** | It must be regenerated before a build or first-run installs start from a stale schema. Self-heals via stage 1, but the template should be clean regardless. |

---

## 7. Explicitly out of scope for the eventual pack

- Any change to `prisma migrate dev` behaviour or to the documented dev workflow beyond
  stage 1's gate.
- Resolving the schema drift itself — related, but its own decision with its own risk.
- Running the full `prisma/seed.ts` at startup. It upserts the default administrator,
  among much else; stage 3 must reconcile **permission definitions only**, never
  identities, credentials, or role grants. Which role may send official correspondence
  stays an administrative decision.
