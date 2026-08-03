/**
 * P0 pack boundary — proof that nothing from a later pack leaked in.
 *
 * The instruction for this pack was explicit: foundation only, and nothing from P1 or
 * later. That is easy to promise in a report and easy to violate by accident — a
 * convenience component here, a fetch helper there. So it is asserted mechanically.
 *
 * Each check below corresponds to a pack that must NOT be present yet:
 *
 *   · No React component            → the document list is P5, the editor P7
 *   · No HTTP client / fetch        → persistence and the API are P2
 *   · No DOM construction           → the canvas is P3
 *   · No branding / print imports   → signature & barcode are P6, printing P8
 *   · No routing                    → navigation lands with the list in P5
 *
 * It also carries INV-6 at the source level: the engine may not so much as mention
 * `innerHTML` or `dangerouslySetInnerHTML`, because the model is the source of truth
 * and there is no HTML round trip anywhere in it.
 */
import { describe, it, expect } from 'vitest';
import { readdirSync, statSync } from 'fs';
import { dirname, resolve } from 'path';
import { readEngineSources, matchingLines, ENGINE_ROOT } from './engineSourceScan';

const SOURCES = readEngineSources();

/** Every import specifier in the engine, with the file it appears in. */
function importSpecifiers(): { file: string; specifier: string }[] {
  const found: { file: string; specifier: string }[] = [];
  for (const file of SOURCES) {
    for (const match of file.code.matchAll(/from\s+['"]([^'"]+)['"]/g)) {
      found.push({ file: file.relativePath, specifier: match[1] });
    }
    for (const match of file.code.matchAll(/import\s*\(\s*['"]([^'"]+)['"]\s*\)/g)) {
      found.push({ file: file.relativePath, specifier: match[1] });
    }
  }
  return found;
}

describe('P0 boundary — the engine is pure TypeScript foundation', () => {
  it('finds engine sources to scan', () => {
    expect(SOURCES.length).toBeGreaterThan(10);
  });

  it('contains no .tsx file — no React component exists yet', () => {
    // Components arrive with the document list (P5) and the canvas (P3).
    const tsxFiles: string[] = [];
    const walk = (dir: string): void => {
      for (const entry of readdirSync(dir)) {
        const full = `${dir}/${entry}`;
        if (statSync(full).isDirectory()) walk(full);
        else if (entry.endsWith('.tsx')) tsxFiles.push(full);
      }
    };
    walk(ENGINE_ROOT);
    expect(tsxFiles, `React component(s) found:\n${tsxFiles.join('\n')}`).toEqual([]);
  });

  it('imports nothing outside the engine except the shared Font Registry', () => {
    // INV-5 mandates reusing the existing Font Registry, so that one escape is
    // sanctioned. Anything else reaching out of `src/letters/` would be an
    // integration, and every integration belongs to a later pack.
    //
    // The specifier is RESOLVED rather than pattern-matched: counting `../` segments
    // says nothing on its own, because how far a relative path reaches depends on how
    // deep the importing file sits. A module three directories down can write
    // `../../registry/...` and still be well inside the engine.
    const offenders = importSpecifiers().filter(({ file, specifier }) => {
      if (!specifier.startsWith('.')) return true; // a package import
      const resolved = resolve(dirname(resolve(ENGINE_ROOT, file)), specifier).replace(/\\/g, '/');
      if (resolved.startsWith(`${ENGINE_ROOT.replace(/\\/g, '/')}/`)) return false;
      return !resolved.endsWith('styles/fontRegistry');
    });
    expect(
      offenders.map((o) => `${o.file} → ${o.specifier}`),
      'Import(s) outside the engine boundary',
    ).toEqual([]);
  });

  it('imports no framework, HTTP client or router', () => {
    const forbidden = ['react', 'react-dom', 'react-router', 'axios', 'zustand', 'qrcode', '@prisma'];
    const offenders = importSpecifiers().filter(({ specifier }) =>
      forbidden.some((pkg) => specifier === pkg || specifier.startsWith(`${pkg}/`)),
    );
    expect(offenders.map((o) => `${o.file} → ${o.specifier}`)).toEqual([]);
  });

  it('performs no network call — persistence and the API are a later pack', () => {
    const pattern = /\bfetch\s*\(|XMLHttpRequest|axios\.|\.post\s*\(|\.patch\s*\(/;
    const hits = SOURCES.flatMap((f) => matchingLines(f, pattern));
    expect(hits, `Network call(s) in the engine:\n${hits.join('\n')}`).toEqual([]);
  });

  it('constructs no DOM — the canvas is a later pack', () => {
    const pattern = /document\.(createElement|querySelector|getElementById|body)|new\s+(?:HTML|DocumentFragment)/;
    const hits = SOURCES.flatMap((f) => matchingLines(f, pattern));
    expect(hits, `DOM construction in the engine:\n${hits.join('\n')}`).toEqual([]);
  });

  it('INV-6 — never mentions HTML injection, parsing or serialisation', () => {
    const pattern = /innerHTML|outerHTML|dangerouslySetInnerHTML|DOMParser|parseFromString|insertAdjacentHTML/;
    const hits = SOURCES.flatMap((f) => matchingLines(f, pattern));
    expect(hits, `HTML round-trip surface in the engine:\n${hits.join('\n')}`).toEqual([]);
  });

  it('INV-12 — imports nothing from the branding system; it only names slots', () => {
    // The signature and stamp integration is P6, and it must reuse the EXISTING
    // company branding system. P0 declares slots and imports not one branding symbol.
    const pattern = /useCompanyBranding|useBrandingSelection|BrandingAssetPicker|DesignableBrandingImage|brandingLayout/i;
    const hits = SOURCES.flatMap((f) => matchingLines(f, pattern));
    expect(hits, `Branding integration in the engine:\n${hits.join('\n')}`).toEqual([]);
  });

  it('INV-13 — imports nothing from the barcode or printing engines', () => {
    const pattern = /composeStyledFromNode|createPrintJob|submitPrintJob|exportPdfFromHtml|QRCode|toDataURL/;
    const hits = SOURCES.flatMap((f) => matchingLines(f, pattern));
    expect(hits, `Print/barcode integration in the engine:\n${hits.join('\n')}`).toEqual([]);
  });

  it('INV-11 — declares no route and no navigation entry', () => {
    // Entry is only through Administrative Forms, and that wiring lands with the
    // document list. Nothing here touches the forms registry, the router or the sidebar.
    const pattern = /createHashRouter|<Route|useNavigate|FORM_CARDS|formsRegistry/;
    const hits = SOURCES.flatMap((f) => matchingLines(f, pattern));
    expect(hits, `Navigation surface in the engine:\n${hits.join('\n')}`).toEqual([]);
  });

  it('registers no feature flag — the engine flag lands with the first visible pack', () => {
    const pattern = /LETTER_ENGINE_V1|isFlagEnabled/;
    const hits = SOURCES.flatMap((f) => matchingLines(f, pattern));
    expect(hits, `Feature-flag wiring in the engine:\n${hits.join('\n')}`).toEqual([]);
  });

  it('leaves no TODO or FIXME behind', () => {
    const pattern = /\bTODO\b|\bFIXME\b|\bXXX\b|\bHACK\b/;
    const hits = SOURCES.flatMap((f) => matchingLines(f, pattern));
    expect(hits, `Unresolved marker(s):\n${hits.join('\n')}`).toEqual([]);
  });

  it('leaves no console statement behind', () => {
    const pattern = /\bconsole\.(log|warn|error|debug|info)\s*\(/;
    const hits = SOURCES.flatMap((f) => matchingLines(f, pattern));
    expect(hits, `console statement(s):\n${hits.join('\n')}`).toEqual([]);
  });
});
