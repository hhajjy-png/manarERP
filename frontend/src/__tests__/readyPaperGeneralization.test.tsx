// @vitest-environment jsdom
import { describe, it, expect, afterEach } from 'vitest';
import { render, cleanup } from '@testing-library/react';
import '@testing-library/jest-dom';
import { readFileSync, readdirSync } from 'node:fs';
import { MemoryRouter } from 'react-router-dom';
import { ROUTER_FUTURE } from './helpers/router';
import FormLayout from '../forms/shared/FormLayout';
import { PRINT_PROFILES, SELECTABLE_PROFILE_IDS } from '../forms/shared/printProfiles';

/**
 * Ready Paper — generalization guard.
 *
 * The letterhead behaviour is keyed off ONE PrintProfile flag
 * (`PRINT_PROFILES['ready-paper'].logoHeader`) and implemented once in
 * FormLayout/FormHeader, so every form that renders a `ready-paper` document
 * inherits it automatically — today's forms and any future one. These tests pin
 * that contract: the values that were approved on paper, the single central
 * route, and the profiles/forms that must stay untouched.
 */

afterEach(cleanup);

const strip = (src: string) =>
  src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\{\/\*[\s\S]*?\*\/\}/g, '').replace(/\/\/.*$/gm, '');

const PAGES_DIR = 'src/pages';
const pageFiles = readdirSync(PAGES_DIR).filter((f) => f.endsWith('.tsx'));
const pageSrc = new Map(pageFiles.map((f) => [f, strip(readFileSync(`${PAGES_DIR}/${f}`, 'utf8'))]));

/** Pages that expose the print-profile switcher — i.e. can reach `ready-paper`. */
const togglePages = pageFiles.filter((f) => pageSrc.get(f)!.includes('PrintProfileToggle'));
/** The one page that deliberately removes `ready-paper` from that switcher. */
const isExempt = (f: string) => /excludeIds=\{\[\s*'ready-paper'\s*\]\}/.test(pageSrc.get(f)!);

function renderProfile(profile: string, extra: Record<string, unknown> = {}) {
  return render(
    <MemoryRouter future={ROUTER_FUTURE}>
      <FormLayout
        ready={false}
        formNumber="F-1"
        title="عنوان"
        profile={profile}
        qrData={{ formType: 't', formNumber: 'F-1', entityName: 'x', entityId: 1 }}
        {...extra}
      >
        <div>BODY</div>
      </FormLayout>
    </MemoryRouter>,
  );
}
const headerOf = (c: HTMLElement) =>
  (c.querySelector('img') as HTMLElement | null)?.parentElement?.parentElement as HTMLElement | undefined;
const printCss = (c: HTMLElement) => c.querySelector('style')!.textContent!;

// ── Central route ────────────────────────────────────────────────────────────
describe('Ready Paper — one central route, no per-form logic', () => {
  it('every page that can reach ready-paper renders it through FormLayout (so none needs its own workaround)', () => {
    expect(togglePages.length).toBeGreaterThan(1);
    const offenders = togglePages
      .filter((f) => !isExempt(f))
      .filter((f) => !pageSrc.get(f)!.includes('<FormLayout'));
    expect(offenders).toEqual([]);
  });

  it('no page carries its own ready-paper / letterhead-overlay logic — the profile flag is the only switch', () => {
    const offenders = pageFiles.filter((f) => {
      const s = pageSrc.get(f)!;
      return /logoHeader|data-page-logo-header|overlayTop|overlayInset|READY_PAPER_/.test(s);
    });
    expect(offenders).toEqual([]);
  });

  it('the shared print layer holds no experimental or Salary-Certificate-specific branch', () => {
    for (const file of ['FormLayout.tsx', 'FormHeader.tsx', 'formPdfDocument.ts']) {
      const src = readFileSync(`src/forms/shared/${file}`, 'utf8');
      expect(src).not.toMatch(/experimental/i);
      expect(src).not.toMatch(/salary-?certificate/i);
    }
  });

  it('the behaviour is driven by the PrintProfile flag, and only ready-paper sets it', () => {
    expect(PRINT_PROFILES['ready-paper'].logoHeader).toBe(true);
    for (const id of Object.keys(PRINT_PROFILES).filter((k) => k !== 'ready-paper')) {
      expect(PRINT_PROFILES[id].logoHeader).toBe(false);
    }
  });
});

// ── Employment Contract exemption ────────────────────────────────────────────
describe('Ready Paper — Employment Contract stays fully exempt', () => {
  it('removes ready-paper from its switcher and never routes through FormLayout', () => {
    const src = pageSrc.get('EmploymentContract.tsx')!;
    expect(src).toContain('PrintProfileToggle');
    expect(isExempt('EmploymentContract.tsx')).toBe(true);
    expect(src).not.toContain('<FormLayout');
  });

  it('is the ONLY page exempted', () => {
    expect(togglePages.filter(isExempt)).toEqual(['EmploymentContract.tsx']);
  });
});

// ── Approved values (verified on physical paper) ─────────────────────────────
describe('Ready Paper — the approved geometry values are pinned', () => {
  it('preview offset is 2.5mm', () => {
    expect(headerOf(renderProfile('ready-paper').container)!.style.top).toBe('2.5mm');
  });

  it('print-only compensation is top 5mm with a single uniform scale of 0.93 about the top centre', () => {
    const rule = /\[data-page-logo-header\]\s*\{([^}]*)\}/.exec(printCss(renderProfile('ready-paper').container))![1];
    expect(rule).toMatch(/top:\s*5mm\s*!important/);
    expect(rule).toMatch(/transform:\s*scale\(0\.93\)/);
    expect(rule).toContain('transform-origin: top center');
    expect(rule).not.toMatch(/scale\([^)]*,|scaleX|scaleY/); // never non-uniform
  });

  it('the page keeps its A4 model: @page margin 0 with the profile margins as .form-page padding', () => {
    const css = printCss(renderProfile('ready-paper').container);
    expect(css).toContain('@page { size: A4; margin: 0; }');
    expect(css).toMatch(/\.form-page\s*\{[^}]*?padding:\s*40mm 10mm 20mm 10mm\s*!important;/);
  });

  it('PRINT_PROFILES margins are untouched', () => {
    expect(PRINT_PROFILES['ready-paper'].margins).toEqual({
      top: '40mm', right: '10mm', bottom: '20mm', left: '10mm',
    });
  });

  it('the divider rule is suppressed on the ready-paper letterhead', () => {
    const h = headerOf(renderProfile('ready-paper').container)!;
    expect(h.style.borderBottomStyle).toBe('none');
    expect(h.style.paddingBottom).toBe('0px');
  });

  it('the letterhead adds NO flow height — it is absolutely positioned and no spacer precedes the content', () => {
    const { container } = renderProfile('ready-paper');
    const h = headerOf(container)!;
    expect(h.style.position).toBe('absolute');
    // The title block follows the header directly: nothing was inserted to make
    // room for it, so the content cannot have been pushed down.
    expect((h.nextElementSibling as HTMLElement).textContent).toContain('عنوان');
    const formPage = container.querySelector('.form-page') as HTMLElement;
    expect(formPage.previousElementSibling?.classList.contains('no-print')).toBe(false);
  });
});

// ── Everything else must be untouched ────────────────────────────────────────
describe('Ready Paper — no other profile or header is affected', () => {
  it.each(['plain-a4', 'letterhead'] as const)('%s keeps the original page-margin model and emits no letterhead rule', (profile) => {
    const { container } = renderProfile(profile);
    const css = printCss(container);
    const m = PRINT_PROFILES[profile].margins;
    expect(css).toContain(`@page { size: A4; margin: ${m.top} ${m.right} ${m.bottom} ${m.left}; }`);
    expect(css).toMatch(/\.form-page\s*\{[^}]*?padding:\s*0\s*!important;/);
    expect(css).not.toContain('data-page-logo-header');
    expect(container.querySelector('img')).toBeNull();
  });

  it('Payment Voucher keeps its own in-flow logo header: divider, padding, no overlay, no print compensation', () => {
    const { container } = renderProfile('payment-voucher', { useLogoHeader: true });
    const h = headerOf(container)!;
    expect(h.style.position).not.toBe('absolute');
    expect(h.style.borderBottom).toContain('3px solid');
    expect(h.style.paddingBottom).toBe('10px');
    expect(h.hasAttribute('data-page-logo-header')).toBe(false);
    expect(printCss(container)).not.toContain('data-page-logo-header');
  });

  it('ready-paper remains a normal user-selectable shell alongside the other two', () => {
    expect(SELECTABLE_PROFILE_IDS).toEqual(['plain-a4', 'letterhead', 'ready-paper']);
  });
});
