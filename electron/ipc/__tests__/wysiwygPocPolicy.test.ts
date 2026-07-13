import { describe, it, expect } from 'vitest';
import {
  MAX_HTML_BYTES,
  countPdfPages,
  isAllowedWorkerRequestUrl,
  shouldReleaseWorker,
  shouldResetActiveWorker,
  validateWysiwygPayload,
} from '../wysiwygPocPolicy';

// ── Payload admission ────────────────────────────────────────────────────────────
describe('validateWysiwygPayload', () => {
  it('admits valid non-empty HTML', () => {
    const r = validateWysiwygPayload('<html><body>فاتورة</body></html>');
    expect(r).toEqual({ ok: true, html: '<html><body>فاتورة</body></html>' });
  });

  it.each([
    ['empty string', ''],
    ['whitespace only', '   \n\t  '],
    ['null', null],
    ['undefined', undefined],
    ['number', 12345],
    ['object', { html: '<p>x</p>' }],
    ['array', ['<p>x</p>']],
    ['boolean', true],
  ])('rejects %s', (_label, value) => {
    const r = validateWysiwygPayload(value);
    expect(r.ok).toBe(false);
    expect(r).toHaveProperty('error', 'مستند المعاينة غير صالح');
  });

  it('admits a payload EXACTLY at the limit', () => {
    const exact = 'a'.repeat(MAX_HTML_BYTES); // ASCII → 1 byte each
    expect(Buffer.byteLength(exact, 'utf-8')).toBe(MAX_HTML_BYTES);
    expect(validateWysiwygPayload(exact).ok).toBe(true);
  });

  it('rejects one byte over the limit', () => {
    const over = 'a'.repeat(MAX_HTML_BYTES + 1);
    const r = validateWysiwygPayload(over);
    expect(r.ok).toBe(false);
    expect(r).toHaveProperty('error', 'مستند المعاينة أكبر من الحد المسموح');
  });

  it('measures BYTES not characters — Arabic is multi-byte', () => {
    // 'ب' is 2 bytes in UTF-8. Half-the-cap CHARACTERS is over the cap in BYTES.
    const arabic = 'ب'.repeat(MAX_HTML_BYTES / 2 + 1);
    expect(arabic.length).toBeLessThan(MAX_HTML_BYTES); // would pass a naive .length check
    expect(validateWysiwygPayload(arabic).ok).toBe(false); // …but is correctly rejected
  });
});

// ── Worker ownership — the H-1 regression ────────────────────────────────────────
describe('worker ownership (H-1)', () => {
  // Model windows as opaque tokens; the policy never inspects them beyond identity.
  const alive = () => false; // isDestroyed → false
  const dead = () => true;

  it('a job MAY release the worker it is still the owner of', () => {
    const w = { id: 'A' };
    expect(shouldReleaseWorker(w, w, alive)).toBe(true);
  });

  it('a job may NOT release a window that was destroyed', () => {
    const w = { id: 'A' };
    expect(shouldReleaseWorker(w, w, dead)).toBe(false);
  });

  /**
   * THE H-1 SCENARIO. Job A times out; its worker is destroyed and replaced by job B's.
   * Job A's `finally` then runs. It must NOT touch job B's worker.
   *
   * Against the old implementation (which used the module-level `worker` reference),
   * this cleanup navigated job B's live worker to about:blank mid-generation and blanked
   * its preview. The ownership predicate makes that impossible.
   */
  it('a SUPERSEDED job may not release the NEW active worker', () => {
    const jobAWin = { id: 'A' };
    const jobBWin = { id: 'B' }; // the slot moved on while A was still unwinding
    expect(shouldReleaseWorker(jobAWin, jobBWin, alive)).toBe(false);
  });

  it('a job may not release anything when the slot is empty', () => {
    expect(shouldReleaseWorker({ id: 'A' }, null, alive)).toBe(false);
  });

  it('a failed job MAY reset the slot it still owns', () => {
    const w = { id: 'A' };
    expect(shouldResetActiveWorker(w, w)).toBe(true);
  });

  it('a superseded failed job may NOT reset (or destroy) the NEW worker', () => {
    expect(shouldResetActiveWorker({ id: 'A' }, { id: 'B' })).toBe(false);
  });

  it('a failed job may not reset an already-empty slot', () => {
    expect(shouldResetActiveWorker({ id: 'A' }, null)).toBe(false);
  });

  /**
   * Proves the fix is a real regression guard, not a tautology: the OLD cleanup
   * condition — `if (worker && !worker.isDestroyed())`, evaluated against the
   * MODULE-LEVEL slot — returns TRUE for a superseded job and would have navigated
   * job B's live worker to about:blank. The new ownership predicate returns FALSE.
   */
  it('the OLD module-level cleanup would have hijacked job B (the H-1 bug)', () => {
    const oldCleanupWouldTouchTheSlot = <W,>(active: W | null, destroyed: (w: W) => boolean) =>
      active !== null && !destroyed(active);

    const jobAWin = { id: 'A' };   // superseded job, still unwinding
    const activeSlot = { id: 'B' }; // a NEWER job's live worker

    // OLD behaviour: touches whatever is in the slot → job B gets blanked.
    expect(oldCleanupWouldTouchTheSlot(activeSlot, alive)).toBe(true);
    // NEW behaviour: job A owns nothing → inert.
    expect(shouldReleaseWorker(jobAWin, activeSlot, alive)).toBe(false);
  });

  /** End-to-end ownership sequence: A starts → A times out → B starts → A unwinds. */
  it('full timeout→retry sequence leaves job B untouched', () => {
    const winA = { id: 'A' };
    let active: { id: string } | null = winA;

    // 1) Job A times out. It still owns the slot → it may reset it.
    expect(shouldResetActiveWorker(winA, active)).toBe(true);
    active = null; // handler destroys A's window and clears the slot

    // 2) Job B starts on a fresh worker.
    const winB = { id: 'B' };
    active = winB;

    // 3) Job A's `finally` finally runs — it must be inert.
    expect(shouldReleaseWorker(winA, active, alive)).toBe(false);
    expect(shouldResetActiveWorker(winA, active)).toBe(false);

    // 4) Job B is still the active worker and can complete + release normally.
    expect(active).toBe(winB);
    expect(shouldReleaseWorker(winB, active, alive)).toBe(true);
  });
});

// ── Worker request policy ────────────────────────────────────────────────────────
describe('isAllowedWorkerRequestUrl', () => {
  it.each([
    'file:///C:/Users/x/temp/doc.html',
    'data:font/ttf;base64,AAAA',
    'blob:null/1234-5678',
    'about:blank',
  ])('allows the self-contained scheme: %s', (url) => {
    expect(isAllowedWorkerRequestUrl(url, null)).toBe(true);
  });

  it.each([
    'http://evil.example/x.png',
    'https://cdn.example/font.woff2',
    'ws://evil.example/socket',
    'wss://evil.example/socket',
    'ftp://evil.example/f',
    'chrome-extension://abc/x.js',
  ])('blocks the external scheme (production, no dev origin): %s', (url) => {
    expect(isAllowedWorkerRequestUrl(url, null)).toBe(false);
  });

  it('blocks localhost too when there is no dev origin (packaged app)', () => {
    expect(isAllowedWorkerRequestUrl('http://localhost:5173/assets/logo.png', null)).toBe(false);
  });

  it('allows EXACTLY the dev origin when running under Vite', () => {
    const dev = 'http://localhost:5173';
    expect(isAllowedWorkerRequestUrl('http://localhost:5173/assets/logo.png', dev)).toBe(true);
    expect(isAllowedWorkerRequestUrl('http://localhost:5173/', dev)).toBe(true);
  });

  it('the dev exception is ORIGIN-bounded, not prefix-bounded', () => {
    const dev = 'http://localhost:5173';
    // The classic prefix-matching bug — must NOT pass.
    expect(isAllowedWorkerRequestUrl('http://localhost:5173.evil.com/x', dev)).toBe(false);
    expect(isAllowedWorkerRequestUrl('http://localhost:5174/x', dev)).toBe(false);
    expect(isAllowedWorkerRequestUrl('https://localhost:5173/x', dev)).toBe(false); // scheme differs
    expect(isAllowedWorkerRequestUrl('http://evil.com/?u=http://localhost:5173', dev)).toBe(false);
  });

  it('rejects unparseable input', () => {
    expect(isAllowedWorkerRequestUrl('', null)).toBe(false);
    expect(isAllowedWorkerRequestUrl('not a url', null)).toBe(false);
  });
});

// ── Page count ───────────────────────────────────────────────────────────────────
describe('countPdfPages', () => {
  /** Minimal Chromium-shaped PDF: a /Pages tree node + N /Page leaf objects. */
  const pdf = (pageObjects: number) => {
    let s = '%PDF-1.4\n1 0 obj\n<< /Type /Pages /Count ' + pageObjects + ' >>\nendobj\n';
    for (let i = 0; i < pageObjects; i++) {
      s += `${i + 2} 0 obj\n<< /Type /Page /Parent 1 0 R >>\nendobj\n`;
    }
    s += '%%EOF';
    return new Uint8Array(Buffer.from(s, 'latin1'));
  };

  it('counts one page', () => {
    expect(countPdfPages(pdf(1))).toBe(1);
  });

  it('counts multiple pages', () => {
    expect(countPdfPages(pdf(17))).toBe(17);
    expect(countPdfPages(pdf(86))).toBe(86);
  });

  it('does NOT count the /Pages tree node as a page', () => {
    // pdf(3) contains exactly one "/Type /Pages" and three "/Type /Page".
    expect(countPdfPages(pdf(3))).toBe(3);
  });

  it('does not count longer keys such as /PageLabels', () => {
    const bytes = new Uint8Array(
      Buffer.from('%PDF-1.4\n<< /Type /Pages >>\n<< /Type /PageLabels >>\n<< /Type /Page >>\n%%EOF', 'latin1'),
    );
    expect(countPdfPages(bytes)).toBe(1);
  });

  it('tolerates /Type/Page with no space', () => {
    const bytes = new Uint8Array(Buffer.from('%PDF-1.4\n<< /Type/Page >>\n%%EOF', 'latin1'));
    expect(countPdfPages(bytes)).toBe(1);
  });

  it('returns null (unknown) — never 0 — for a PDF with no page objects', () => {
    const bytes = new Uint8Array(Buffer.from('%PDF-1.4\n<< /Type /Pages /Count 0 >>\n%%EOF', 'latin1'));
    expect(countPdfPages(bytes)).toBeNull();
  });

  it.each([
    ['empty bytes', new Uint8Array(0)],
    ['null', null],
    ['undefined', undefined],
  ])('returns null for %s', (_label, value) => {
    expect(countPdfPages(value as Uint8Array | null | undefined)).toBeNull();
  });

  it('refuses to count tokens in bytes that are not a PDF', () => {
    // Non-PDF content that merely CONTAINS the token must not yield a confident count.
    const notPdf = new Uint8Array(Buffer.from('<html>/Type /Page /Type /Page</html>', 'latin1'));
    expect(countPdfPages(notPdf)).toBeNull();
  });

  it('a real Chromium PDF header is required', () => {
    const bogusHeader = new Uint8Array(Buffer.from('%PDG-1.4\n<< /Type /Page >>', 'latin1'));
    expect(countPdfPages(bogusHeader)).toBeNull();
  });
});
