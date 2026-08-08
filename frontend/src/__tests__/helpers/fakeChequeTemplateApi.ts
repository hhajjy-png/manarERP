/**
 * In-memory stand-in for `/api/cheque-designer-templates` (Cheque Template
 * Persistence Migration Pack v1).
 *
 * It mirrors the REAL service semantics — including the two idempotency guards
 * on the legacy import and the "first template becomes default" /
 * "deleting the default promotes the newest survivor" rules — so a frontend
 * test that passes here is testing the contract the backend actually
 * implements, not a convenient fiction. The backend's own suite pins the same
 * rules against Prisma.
 *
 * `requests` records every call, which is what lets a test assert that reads
 * really go to the database rather than to browser storage.
 */

export interface FakeTemplateRow {
  id: string;
  name: string;
  isDefault: boolean;
  surface: { widthCm: number; heightCm: number };
  fields: unknown[];
  createdAt: string;
  updatedAt: string;
}

interface FakeState {
  templates: FakeTemplateRow[];
  marker: { at: string; count: number; reason: string } | null;
  /** Legacy Cheque Template Recovery Pack v1 — a SEPARATE durable marker. */
  recoveryMarker: { at: string; count: number; reason: string } | null;
  requests: { method: string; url: string }[];
  /** When set, every call rejects — used to prove failures stay non-destructive. */
  offline: boolean;
  nextId: number;
}

export const fakeTemplateDb: FakeState = {
  templates: [],
  marker: null,
  recoveryMarker: null,
  requests: [],
  offline: false,
  nextId: 1,
};

export function resetFakeTemplateDb(): void {
  fakeTemplateDb.templates = [];
  fakeTemplateDb.marker = null;
  fakeTemplateDb.recoveryMarker = null;
  fakeTemplateDb.requests = [];
  fakeTemplateDb.offline = false;
  fakeTemplateDb.nextId = 1;
}

/** Pre-populate the "database" — the "a machine that already has templates" case. */
export function seedFakeTemplates(rows: FakeTemplateRow[]): void {
  fakeTemplateDb.templates = rows.map((r) => ({ ...r }));
}

function envelope<T>(data: T) {
  return { data: { success: true, data } };
}

function notFound(): never {
  throw Object.assign(new Error('Not Found'), { response: { status: 404 } });
}

function guardOnline(): void {
  if (fakeTemplateDb.offline) throw Object.assign(new Error('Network Error'), { response: undefined });
}

function record(method: string, url: string): void {
  fakeTemplateDb.requests.push({ method, url });
}

function byUpdatedAtDesc(a: FakeTemplateRow, b: FakeTemplateRow): number {
  return b.updatedAt.localeCompare(a.updatedAt);
}

function clearDefaults(): void {
  for (const t of fakeTemplateDb.templates) t.isDefault = false;
}

function idFromUrl(url: string, suffix = ''): string {
  const tail = url.slice('/cheque-designer-templates/'.length);
  const raw = suffix ? tail.slice(0, tail.length - suffix.length) : tail;
  return decodeURIComponent(raw);
}

export const fakeApi = {
  async get(url: string) {
    guardOnline();
    record('GET', url);
    if (url === '/cheque-designer-templates') {
      return envelope([...fakeTemplateDb.templates].sort(byUpdatedAtDesc));
    }
    if (url === '/cheque-designer-templates/default') {
      return envelope(fakeTemplateDb.templates.find((t) => t.isDefault) ?? null);
    }
    if (url === '/cheque-designer-templates/legacy-import') {
      return envelope({ done: fakeTemplateDb.marker !== null });
    }
    if (url === '/cheque-designer-templates/legacy-recovery') {
      // The same three server-side preconditions the real service evaluates.
      if (fakeTemplateDb.recoveryMarker) return envelope({ eligible: false, reason: 'already-recovered' });
      if (fakeTemplateDb.marker) return envelope({ eligible: false, reason: 'already-migrated' });
      if (fakeTemplateDb.templates.length > 0) return envelope({ eligible: false, reason: 'db-not-empty' });
      return envelope({ eligible: true, reason: 'eligible' });
    }
    const row = fakeTemplateDb.templates.find((t) => t.id === idFromUrl(url));
    if (!row) notFound();
    return envelope(row);
  },

  async post(url: string, body: any) {
    guardOnline();
    record('POST', url);

    if (url === '/cheque-designer-templates/legacy-import') {
      // Guard 1 — durable marker: the question is asked exactly once per database.
      if (fakeTemplateDb.marker) {
        return envelope({ imported: false, count: 0, reason: 'already-migrated' });
      }
      // Guard 2 — a database that already holds templates is never overwritten.
      if (fakeTemplateDb.templates.length > 0) {
        fakeTemplateDb.marker = { at: new Date().toISOString(), count: 0, reason: 'db-not-empty' };
        return envelope({ imported: false, count: 0, reason: 'db-not-empty' });
      }
      let defaultSeen = false;
      for (const t of body.templates as FakeTemplateRow[]) {
        const isDefault = Boolean(t.isDefault) && !defaultSeen;
        if (isDefault) defaultSeen = true;
        const createdAt = t.createdAt ?? new Date().toISOString();
        fakeTemplateDb.templates.push({
          id: t.id,
          name: t.name,
          isDefault,
          surface: { ...t.surface },
          fields: JSON.parse(JSON.stringify(t.fields ?? [])),
          createdAt,
          updatedAt: t.updatedAt ?? createdAt,
        });
      }
      fakeTemplateDb.marker = { at: new Date().toISOString(), count: body.templates.length, reason: 'imported' };
      return envelope({ imported: true, count: body.templates.length, reason: 'imported' });
    }

    if (url === '/cheque-designer-templates/legacy-recovery') {
      // Every precondition is re-checked here, exactly as the real service does,
      // so a client that ignored the status probe still cannot import twice.
      if (fakeTemplateDb.recoveryMarker) return envelope({ recovered: false, count: 0, reason: 'already-recovered' });
      if (fakeTemplateDb.marker) return envelope({ recovered: false, count: 0, reason: 'already-migrated' });
      if (fakeTemplateDb.templates.length > 0) {
        fakeTemplateDb.recoveryMarker = { at: new Date().toISOString(), count: 0, reason: 'db-not-empty' };
        return envelope({ recovered: false, count: 0, reason: 'db-not-empty' });
      }
      let recoveryDefaultSeen = false;
      for (const t of body.templates as FakeTemplateRow[]) {
        const isDefault = Boolean(t.isDefault) && !recoveryDefaultSeen;
        if (isDefault) recoveryDefaultSeen = true;
        const createdAt = t.createdAt ?? new Date().toISOString();
        fakeTemplateDb.templates.push({
          id: t.id,
          name: t.name,
          isDefault,
          surface: { ...t.surface },
          fields: JSON.parse(JSON.stringify(t.fields ?? [])),
          createdAt,
          updatedAt: t.updatedAt ?? createdAt,
        });
      }
      fakeTemplateDb.recoveryMarker = { at: new Date().toISOString(), count: body.templates.length, reason: 'recovered' };
      return envelope({ recovered: true, count: body.templates.length, reason: 'recovered' });
    }

    // Create
    const now = new Date().toISOString();
    const becomesDefault = body.makeDefault === true || fakeTemplateDb.templates.length === 0;
    if (becomesDefault) clearDefaults();
    const row: FakeTemplateRow = {
      id: `tpl-fake-${fakeTemplateDb.nextId++}`,
      name: body.name,
      isDefault: becomesDefault,
      surface: { ...body.surface },
      fields: JSON.parse(JSON.stringify(body.fields ?? [])),
      createdAt: now,
      updatedAt: now,
    };
    fakeTemplateDb.templates.push(row);
    return envelope(row);
  },

  async put(url: string, body: any) {
    guardOnline();
    record('PUT', url);
    const row = fakeTemplateDb.templates.find((t) => t.id === idFromUrl(url));
    if (!row) notFound();
    if (body.name !== undefined) row.name = body.name;
    row.surface = { ...body.surface };
    row.fields = JSON.parse(JSON.stringify(body.fields ?? []));
    row.updatedAt = new Date().toISOString();
    return envelope(row);
  },

  async patch(url: string, body?: any) {
    guardOnline();
    record('PATCH', url);
    if (url.endsWith('/default')) {
      const row = fakeTemplateDb.templates.find((t) => t.id === idFromUrl(url, '/default'));
      if (!row) notFound();
      clearDefaults();
      row.isDefault = true; // deliberately does NOT touch updatedAt — list order is stable
      return envelope(row);
    }
    const row = fakeTemplateDb.templates.find((t) => t.id === idFromUrl(url, '/name'));
    if (!row) notFound();
    row.name = body.name;
    row.updatedAt = new Date().toISOString();
    return envelope(row);
  },

  async delete(url: string) {
    guardOnline();
    record('DELETE', url);
    const id = idFromUrl(url);
    const victim = fakeTemplateDb.templates.find((t) => t.id === id);
    if (!victim) notFound();
    fakeTemplateDb.templates = fakeTemplateDb.templates.filter((t) => t.id !== id);
    if (victim.isDefault) {
      const survivor = [...fakeTemplateDb.templates].sort(byUpdatedAtDesc)[0];
      if (survivor) survivor.isDefault = true;
    }
    return { data: { success: true } };
  },
};
