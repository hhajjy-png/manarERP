// @vitest-environment jsdom
/**
 * Letter Engine — the Workspace.
 *
 * Two things are being protected here.
 *
 *  1. EVERY QUERY IS SERVER-SIDE. The tests assert the PARAMS the client sends, not the
 *     rows that come back. A workspace that filtered its download would pass a
 *     "the right rows are visible" test while showing a total that describes the
 *     download rather than the archive.
 *
 *  2. THE PACK BOUNDARY. No editor, no printing, no preview, no barcode. A source scan
 *     at the foot of the file makes that mechanical rather than a matter of review.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, cleanup, waitFor, fireEvent, within } from '@testing-library/react';
import '@testing-library/jest-dom';
import { MemoryRouter, useLocation } from 'react-router-dom';
import { readFileSync } from 'node:fs';

const { apiMock } = vi.hoisted(() => ({
  apiMock: { get: vi.fn(), post: vi.fn(), delete: vi.fn(), patch: vi.fn() },
}));

vi.mock('../../api/client', () => ({
  api: apiMock,
  errorMessage: (e: unknown) => (e instanceof Error ? e.message : 'خطأ'),
}));

const { permissions } = vi.hoisted(() => ({ permissions: { value: new Set<string>() } }));
vi.mock('../../stores/authStore', () => ({
  useAuth: () => ({ hasPermission: (p: string) => permissions.value.has(p) }),
}));

const { toastMock } = vi.hoisted(() => ({
  toastMock: { ok: vi.fn(), error: vi.fn(), warn: vi.fn(), info: vi.fn() },
}));
vi.mock('../../stores/toastStore', () => ({ useToast: () => toastMock }));

import LetterWorkspace from '../../pages/LetterWorkspace';
import {
  toQueryParams,
  canArchive,
  canUnarchive,
  canCancel,
  canDeleteDraft,
  type LetterListItem,
} from '../../api/lettersApi';

const ALL_PERMISSIONS = ['letters.read', 'letters.create', 'letters.update', 'letters.delete', 'letters.register', 'letters.archive', 'letters.cancel'];

// Explicit return type so the literal is contextually typed — otherwise `status`
// widens to `string` and every capability helper below rejects the fixture.
function row(overrides: Partial<LetterListItem> = {}): LetterListItem {
  return {
    id: 1,
    templateKey: 'officialLetter',
    status: 'REGISTERED',
    isArchived: false,
    reference: 'OL-2026-000001',
    issueDate: '2026-08-03T00:00:00.000Z',
    recipient: { name: 'وزارة الأشغال', title: null, organisation: null },
    subject: 'طلب تمديد مدة العقد',
    createdBy: { id: 7, name: 'admin' },
    registeredBy: { id: 7, name: 'admin' },
    registeredAt: '2026-08-03T09:00:00.000Z',
    archivedAt: null,
    cancelledAt: null,
    cancelReason: null,
    createdAt: '2026-08-01T09:00:00.000Z',
    updatedAt: '2026-08-03T09:00:00.000Z',
    ...overrides,
  };
}

function respondWith(items: ReturnType<typeof row>[], total = items.length) {
  apiMock.get.mockResolvedValue({
    data: { data: { items, meta: { page: 1, pageSize: 20, total, totalPages: Math.max(1, Math.ceil(total / 20)) } } },
  });
}

/** The query params of the most recent list request. */
function lastParams(): Record<string, string> {
  const calls = apiMock.get.mock.calls;
  return calls[calls.length - 1][1].params as Record<string, string>;
}

/** Observes the router so navigation can be asserted without stubbing the hook. */
const routerState = { pathname: '' };

function LocationProbe() {
  routerState.pathname = useLocation().pathname;
  return null;
}

function renderWorkspace() {
  routerState.pathname = '';
  return render(
    <MemoryRouter initialEntries={['/forms/official-letter']}>
      <LetterWorkspace />
      <LocationProbe />
    </MemoryRouter>,
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  localStorage.clear();
  permissions.value = new Set(ALL_PERMISSIONS);
  respondWith([row()]);
});

afterEach(cleanup);

/* ── Landing ───────────────────────────────────────────────────────────── */

describe('The workspace is the landing surface', () => {
  it('renders the list and never a blank editor', async () => {
    renderWorkspace();
    expect(await screen.findByText('طلب تمديد مدة العقد')).toBeInTheDocument();
    expect(screen.getByText('OL-2026-000001')).toBeInTheDocument();
    // No editing surface of any kind.
    expect(document.querySelector('textarea[data-editor]')).toBeNull();
    expect(document.querySelector('[contenteditable]')).toBeNull();
  });

  it('resolves its title from the registered i18n key', async () => {
    renderWorkspace();
    expect(await screen.findByRole('heading', { name: 'محرر النماذج' })).toBeInTheDocument();
  });

  it('shows a draft as unnumbered rather than blank', async () => {
    respondWith([row({ status: 'DRAFT', reference: null })]);
    renderWorkspace();
    expect(await screen.findByText('— غير مُخصَّص')).toBeInTheDocument();
  });
});

/* ── Server-side querying ──────────────────────────────────────────────── */

describe('Every query goes to the server', () => {
  it('requests the default view: unarchived, first page', async () => {
    renderWorkspace();
    await waitFor(() => expect(apiMock.get).toHaveBeenCalled());
    expect(apiMock.get.mock.calls[0][0]).toBe('/letters');
    expect(lastParams()).toMatchObject({ isArchived: 'false', page: '1', pageSize: '20' });
  });

  it('sends the search term to the backend, debounced', async () => {
    renderWorkspace();
    await screen.findByText('طلب تمديد مدة العقد');

    fireEvent.change(screen.getByLabelText('بحث في الخطابات'), { target: { value: 'تمديد' } });
    await waitFor(() => expect(lastParams().search).toBe('تمديد'), { timeout: 2000 });
  });

  it('sends a status filter as a comma-separated list', async () => {
    renderWorkspace();
    await screen.findByText('طلب تمديد مدة العقد');

    fireEvent.click(screen.getByRole('button', { name: /الفلاتر/ }));
    fireEvent.click(await screen.findByRole('button', { name: 'مسودة' }));
    fireEvent.click(screen.getByRole('button', { name: 'مُسجّل' }));

    await waitFor(() => expect(lastParams().status).toBe('DRAFT,REGISTERED'));
  });

  it('sends registration state rather than inferring it from status', async () => {
    renderWorkspace();
    await screen.findByText('طلب تمديد مدة العقد');

    fireEvent.click(screen.getByRole('button', { name: /الفلاتر/ }));
    fireEvent.click(await screen.findByRole('button', { name: 'يحمل رقمًا مرجعيًا' }));

    await waitFor(() => expect(lastParams().registrationState).toBe('registered'));
  });

  it('cycles the archive toggle through unarchived → archived → both', async () => {
    renderWorkspace();
    await screen.findByText('طلب تمديد مدة العقد');

    // A two-state switch cannot express "both", which is a legitimate view.
    fireEvent.click(screen.getByRole('button', { name: /غير المؤرشف/ }));
    await waitFor(() => expect(lastParams().isArchived).toBe('true'));

    fireEvent.click(screen.getByRole('button', { name: /المؤرشف فقط/ }));
    await waitFor(() => expect(lastParams().isArchived).toBeUndefined());
  });

  it('sends sort instructions to the server and cycles asc → desc → default', async () => {
    renderWorkspace();
    await screen.findByText('طلب تمديد مدة العقد');
    // Re-queried each time rather than cached: a cached node would silently stop
    // receiving clicks if the table were ever re-created between them.
    const header = () => screen.getByRole('button', { name: /الموضوع/ });

    fireEvent.click(header());
    await waitFor(() => expect(lastParams()).toMatchObject({ sortBy: 'subject', sortDir: 'asc' }));

    fireEvent.click(header());
    await waitFor(() => expect(lastParams()).toMatchObject({ sortBy: 'subject', sortDir: 'desc' }));

    fireEvent.click(header());
    await waitFor(() => expect(lastParams().sortBy).toBeUndefined());
  });

  it('sends the page size and returns to page one when it changes', async () => {
    renderWorkspace();
    await screen.findByText('طلب تمديد مدة العقد');

    fireEvent.click(screen.getByRole('button', { name: '50' }));
    await waitFor(() => expect(lastParams()).toMatchObject({ pageSize: '50', page: '1' }));
  });

  it('does not filter, sort or paginate in the browser', async () => {
    // The list renders exactly what the server returned, in the order it arrived.
    respondWith([row({ id: 1, subject: 'ب' }), row({ id: 2, subject: 'أ', reference: 'OL-2026-000002' })]);
    renderWorkspace();
    await screen.findByText('ب');
    const cells = screen.getAllByRole('row').slice(1).map((r) => within(r).getAllByRole('cell')[3].textContent);
    expect(cells).toEqual(['ب', 'أ']);
  });
});

describe('toQueryParams omits empties so the request says what it asks', () => {
  it('sends nothing for an unfiltered query', () => {
    expect(toQueryParams({})).toEqual({});
  });

  it('omits blank strings and empty status lists', () => {
    expect(toQueryParams({ search: '   ', statuses: [], createdBy: '' })).toEqual({});
  });

  it('sends isArchived=false explicitly — it is a filter, not an absence', () => {
    expect(toQueryParams({ isArchived: false })).toEqual({ isArchived: 'false' });
  });
});

/* ── Actions & lifecycle ───────────────────────────────────────────────── */

describe('Row actions respect the lifecycle', () => {
  it('offers archive but not unarchive on an unarchived letter', async () => {
    renderWorkspace();
    await screen.findByText('طلب تمديد مدة العقد');
    expect(screen.getByRole('button', { name: 'أرشفة' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'إلغاء الأرشفة' })).toBeNull();
  });

  it('offers unarchive but not archive on an archived letter', async () => {
    respondWith([row({ isArchived: true })]);
    renderWorkspace();
    await screen.findByText('طلب تمديد مدة العقد');
    expect(screen.getByRole('button', { name: 'إلغاء الأرشفة' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'أرشفة' })).toBeNull();
  });

  it('offers neither archive nor cancel on a cancelled letter', async () => {
    respondWith([row({ status: 'CANCELLED' })]);
    renderWorkspace();
    await screen.findByText('طلب تمديد مدة العقد');
    expect(screen.queryByRole('button', { name: 'أرشفة' })).toBeNull();
    expect(screen.queryByRole('button', { name: 'إلغاء' })).toBeNull();
  });

  it('offers delete on a draft only', async () => {
    respondWith([row({ status: 'DRAFT', reference: null })]);
    renderWorkspace();
    await screen.findByText('طلب تمديد مدة العقد');
    expect(screen.getByRole('button', { name: 'حذف المسودة' })).toBeInTheDocument();
    // …and cancel is absent, because a draft holds no number to withdraw.
    expect(screen.queryByRole('button', { name: 'إلغاء' })).toBeNull();
  });

  it('demands a reason before a cancellation can be confirmed', async () => {
    renderWorkspace();
    await screen.findByText('طلب تمديد مدة العقد');
    fireEvent.click(screen.getByRole('button', { name: 'إلغاء' }));

    const confirm = await screen.findByRole('button', { name: /تأكيد الإلغاء/ });
    expect(confirm).toBeDisabled();

    fireEvent.change(screen.getByLabelText('سبب الإلغاء'), { target: { value: 'صدر بالخطأ' } });
    expect(screen.getByRole('button', { name: /تأكيد الإلغاء/ })).toBeEnabled();
  });

  it('warns that the reference stays reserved before cancelling', async () => {
    renderWorkspace();
    await screen.findByText('طلب تمديد مدة العقد');
    fireEvent.click(screen.getByRole('button', { name: 'إلغاء' }));
    expect(await screen.findByText(/محجوزًا نهائيًا/)).toBeInTheDocument();
  });

  it('reloads after a mutation so the list never shows a stale state', async () => {
    apiMock.post.mockResolvedValue({ data: { data: {} } });
    renderWorkspace();
    await screen.findByText('طلب تمديد مدة العقد');
    const before = apiMock.get.mock.calls.length;

    fireEvent.click(screen.getByRole('button', { name: 'أرشفة' }));
    await waitFor(() => expect(apiMock.get.mock.calls.length).toBeGreaterThan(before));
  });
});

describe('Capability helpers mirror the backend lifecycle', () => {
  it('archive/unarchive are permitted on anything not cancelled', () => {
    for (const status of ['DRAFT', 'REGISTERED', 'PRINTED', 'SUPERSEDED'] as const) {
      expect(canArchive(row({ status, isArchived: false }))).toBe(true);
      expect(canUnarchive(row({ status, isArchived: true }))).toBe(true);
    }
    expect(canArchive(row({ status: 'CANCELLED', isArchived: false }))).toBe(false);
    expect(canUnarchive(row({ status: 'CANCELLED', isArchived: true }))).toBe(false);
  });

  it('cancel is offered on every non-draft, non-cancelled state', () => {
    expect(canCancel(row({ status: 'DRAFT' }))).toBe(false);
    expect(canCancel(row({ status: 'CANCELLED' }))).toBe(false);
    for (const status of ['REGISTERED', 'PRINTED', 'SUPERSEDED'] as const) {
      expect(canCancel(row({ status }))).toBe(true);
    }
  });

  it('delete is draft-only', () => {
    expect(canDeleteDraft(row({ status: 'DRAFT' }))).toBe(true);
    for (const status of ['REGISTERED', 'PRINTED', 'SUPERSEDED', 'CANCELLED'] as const) {
      expect(canDeleteDraft(row({ status }))).toBe(false);
    }
  });
});

/* ── Permissions ───────────────────────────────────────────────────────── */

describe('Actions the user cannot perform are not offered', () => {
  it('hides New Draft without letters.create', async () => {
    permissions.value = new Set(['letters.read']);
    renderWorkspace();
    await screen.findByText('طلب تمديد مدة العقد');
    expect(screen.queryByRole('button', { name: /خطاب جديد/ })).toBeNull();
  });

  it('hides archive without letters.archive', async () => {
    permissions.value = new Set(['letters.read']);
    renderWorkspace();
    await screen.findByText('طلب تمديد مدة العقد');
    expect(screen.queryByRole('button', { name: 'أرشفة' })).toBeNull();
  });

  it('hides cancel and delete without their permissions', async () => {
    permissions.value = new Set(['letters.read']);
    respondWith([row({ status: 'DRAFT', reference: null })]);
    renderWorkspace();
    await screen.findByText('طلب تمديد مدة العقد');
    expect(screen.queryByRole('button', { name: 'إلغاء' })).toBeNull();
    expect(screen.queryByRole('button', { name: 'حذف المسودة' })).toBeNull();
  });
});

/* ── Selection & bulk ──────────────────────────────────────────────────── */

describe('Selection and bulk archiving', () => {
  it('shows bulk actions once something is selected', async () => {
    renderWorkspace();
    await screen.findByText('طلب تمديد مدة العقد');
    expect(screen.queryByText(/محدَّد/)).toBeNull();

    fireEvent.click(screen.getByLabelText('تحديد OL-2026-000001'));
    expect(await screen.findByText(/1 محدَّد/)).toBeInTheDocument();
  });

  it('select-all covers the visible page', async () => {
    respondWith([row({ id: 1 }), row({ id: 2, reference: 'OL-2026-000002' })]);
    renderWorkspace();
    await screen.findAllByText('طلب تمديد مدة العقد');

    fireEvent.click(screen.getByLabelText('تحديد كل الصفحة'));
    expect(await screen.findByText(/2 محدَّد/)).toBeInTheDocument();
  });

  it('posts the selected ids to the bulk endpoint', async () => {
    apiMock.post.mockResolvedValue({ data: { data: { succeeded: [1], failed: [] } } });
    renderWorkspace();
    await screen.findByText('طلب تمديد مدة العقد');

    fireEvent.click(screen.getByLabelText('تحديد OL-2026-000001'));
    // Scoped to the selection bar: the row action carries the same label, and the
    // whole point of this test is that the BULK button was pressed.
    const bar = await screen.findByRole('region', { name: 'إجراءات التحديد' });
    fireEvent.click(within(bar).getByRole('button', { name: /^أرشفة$/ }));

    await waitFor(() => expect(apiMock.post).toHaveBeenCalledWith('/letters/bulk-archive', { ids: [1] }));
  });

  it('reports partial success honestly rather than claiming a clean sweep', async () => {
    apiMock.post.mockResolvedValue({
      data: { data: { succeeded: [1], failed: [{ id: 2, ok: false, reason: 'الخطاب ملغى' }] } },
    });
    respondWith([row({ id: 1 }), row({ id: 2, reference: 'OL-2026-000002' })]);
    renderWorkspace();
    await screen.findAllByText('طلب تمديد مدة العقد');

    fireEvent.click(screen.getByLabelText('تحديد كل الصفحة'));
    const bar = await screen.findByRole('region', { name: 'إجراءات التحديد' });
    fireEvent.click(within(bar).getByRole('button', { name: /^أرشفة$/ }));

    await waitFor(() => expect(toastMock.warn).toHaveBeenCalled());
    expect(toastMock.warn.mock.calls[0][0]).toMatch(/تعذّرت على 1/);
  });
});

/* ── States ────────────────────────────────────────────────────────────── */

describe('Empty, loading and error states', () => {
  it('distinguishes "no letters yet" from "no matches"', async () => {
    respondWith([], 0);
    renderWorkspace();
    expect(await screen.findByText('لا خطابات بعد')).toBeInTheDocument();

    fireEvent.change(screen.getByLabelText('بحث في الخطابات'), { target: { value: 'nothing' } });
    expect(await screen.findByText('لا نتائج مطابقة', {}, { timeout: 2000 })).toBeInTheDocument();
  });

  it('surfaces a load failure instead of showing an empty list', async () => {
    apiMock.get.mockRejectedValue(new Error('تعذّر الاتصال بالخادم'));
    renderWorkspace();
    expect(await screen.findByRole('alert')).toHaveTextContent('تعذّر الاتصال بالخادم');
  });

  it('shows a busy indicator while the first page loads', () => {
    apiMock.get.mockReturnValue(new Promise(() => {}));
    renderWorkspace();
    expect(screen.getByLabelText(/جار|Loading|تحميل/i)).toBeInTheDocument();
  });
});

/* ── Details panel ─────────────────────────────────────────────────────── */

describe('Open and details are separate actions', () => {
  it('“Open” navigates to the composer rather than opening a panel', async () => {
    // The verb gained a real destination once the composer existed; the read-only
    // audit panel moved to its own action instead of competing for the same word.
    renderWorkspace();
    await screen.findByText('طلب تمديد مدة العقد');

    fireEvent.click(screen.getByRole('button', { name: 'فتح' }));
    await waitFor(() => expect(routerState.pathname).toBe('/forms/official-letter/1'));
  });

  it('“Details” shows the read-only audit trail, and no editor', async () => {
    renderWorkspace();
    await screen.findByText('طلب تمديد مدة العقد');
    fireEvent.click(screen.getByRole('button', { name: 'التفاصيل' }));

    // Scoped to the drawer — "سجّله" is also a column header in the table behind it.
    const drawer = await screen.findByRole('dialog');
    expect(within(drawer).getByText('سجّله')).toBeInTheDocument();
    expect(within(drawer).getByText('تاريخ التسجيل')).toBeInTheDocument();
    expect(document.querySelector('[contenteditable]')).toBeNull();
  });
});

/* ── Pack boundary ─────────────────────────────────────────────────────── */

describe('P2 boundary — the workspace contains nothing from a later pack', () => {
  const SOURCES = [
    readFileSync('src/pages/LetterWorkspace.tsx', 'utf8'),
    readFileSync('src/api/lettersApi.ts', 'utf8'),
  ].join('\n');
  const code = SOURCES.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/.*$/gm, '$1');

  it('has no editor, rich text or block model', () => {
    for (const forbidden of ['contentEditable', 'contenteditable', 'BlockDocument', 'blockTypes', 'createBlock', 'InlineSpan']) {
      expect(code, `found "${forbidden}"`).not.toContain(forbidden);
    }
  });

  it('has no printing, PDF or preview path', () => {
    for (const forbidden of ['printCurrentView', 'composeStyledFromNode', 'exportPdfFromHtml', 'createPrintJob', 'submitPrintJob', 'window.print']) {
      expect(code, `found "${forbidden}"`).not.toContain(forbidden);
    }
  });

  it('has no barcode, signature or geometry surface', () => {
    for (const forbidden of ['QRCode', 'toDataURL', 'useCompanyBranding', 'BrandingAssetPicker', 'geometryRegistry', 'reservedZonesMm', 'FontPicker']) {
      expect(code, `found "${forbidden}"`).not.toContain(forbidden);
    }
  });

  it('does not call the register endpoint — issuing a number is not a workspace action', () => {
    // Scoped to the PAGE, not to the shared API client: P7 added `registerLetter` to
    // `lettersApi.ts` for the composer, which is the right home for it. The guarantee
    // being protected is that the workspace never issues a number, and that is a fact
    // about this page.
    const page = readFileSync('src/pages/LetterWorkspace.tsx', 'utf8');
    expect(page).not.toContain('/register');
    expect(page).not.toContain('registerLetter');
  });
});
