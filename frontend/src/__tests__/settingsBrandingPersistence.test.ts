import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';

/**
 * Multi-Signature & Stamp Persistence Fix v1.
 *
 * The defect this locks down: before this fix, adding a signature, uploading its image,
 * deleting one, changing the default or toggling visibility only mutated React state.
 * The single «حفظ» button at the top of the page was the ONLY writer, so anything the
 * user did in the signatures/stamps section and did not explicitly save was lost on
 * reload — which is exactly what "a second signature will not save" looked like.
 *
 * These are source-level assertions, the same technique `approvalSectionBranding` uses:
 * the behaviour lives in one page component whose full render pulls in the whole app
 * shell, and what matters here is *which persistence path each handler takes* — a
 * property of the wiring, not of the rendered DOM. The data itself (what survives a
 * save → reload) is covered for real in `printTemplates/brandingAssets.test.ts`.
 */
const settings = readFileSync('src/pages/Settings.tsx', 'utf8');
const assets = readFileSync('src/print-templates/branding/brandingAssets.ts', 'utf8');

/** The body of a named function declaration in the source, up to the closing brace. */
function fn(source: string, name: string): string {
  const start = source.indexOf(`function ${name}(`);
  expect(start, `${name} not found`).toBeGreaterThan(-1);
  return source.slice(start, source.indexOf('\n  }', start));
}

describe('every asset mutation persists itself', () => {
  it.each([
    ['addAsset'],
    ['removeAsset'],
    ['setAssetAsDefault'],
    ['toggleAssetShow'],
  ])('%s writes immediately', (name) => {
    expect(fn(settings, name)).toContain("'now'");
  });

  it('an uploaded image is written immediately, not left in local state', () => {
    const upload = fn(settings, 'handleAssetFileUpload');
    expect(upload).toContain('setBrandingAssetImage');
    expect(upload).toContain("'now'");
  });

  it('only free-text edits are debounced, so typing a name is not one PUT per keystroke', () => {
    expect(fn(settings, 'updateAssetField')).toContain("'debounced'");
    expect(settings).toContain('ASSET_TEXT_SAVE_DEBOUNCE_MS');
  });

  it('mutateAssets is the single funnel — state, ref and persistence never drift apart', () => {
    const mutate = fn(settings, 'mutateAssets');
    expect(mutate).toContain('assetsRef.current = next');
    expect(mutate).toContain('setAssets(next)');
    expect(mutate).toContain('persistAssets(next)');
    expect(mutate).toContain('scheduleAssetSave()');
  });
});

describe('the write itself', () => {
  it('always sends the newest full snapshot, never a stale closure', () => {
    expect(settings).toContain('saveAssets(next: Record<BrandingAssetKind, BrandingAsset[]> = assetsRef.current)');
  });

  it('serializes the PUTs so two quick edits cannot land out of order', () => {
    expect(fn(settings, 'persistAssets')).toContain('assetSaveChain.current');
  });

  it('flushes a pending text edit when the page unmounts', () => {
    expect(settings).toContain('clearTimeout(assetSaveTimer.current)');
    expect(settings).toContain('assetSaveTimer.current = undefined');
  });

  it('the top Save button still writes the assets — it confirms, it is not the only path', () => {
    const save = fn(settings, 'save');
    expect(save).toContain('cancelPendingAssetSave()');
    expect(save).toContain('await saveAssets()');
  });

  it('writes through the existing keys only — no new setting, no schema change', () => {
    expect(fn(settings, 'saveAssets')).toContain('brandingAssetSettingsRows');
    expect(assets).toContain("list: 'print.signatures'");
    expect(assets).toContain("list: 'print.stamps'");
    expect(assets).toContain("legacyImage: 'print.signatureImage'");
    expect(assets).toContain("legacyImage: 'print.stampImage'");
  });
});

describe('failure is visible where it happened', () => {
  it('an upload error is stored per asset, not page-wide', () => {
    const upload = fn(settings, 'handleAssetFileUpload');
    expect(upload).toContain('setAssetError(kind, id');
    expect(upload).not.toContain('setBrandingError');
  });

  it('the card renders its own error', () => {
    expect(settings).toContain('assetErrors[refKey(asset.id)]');
  });

  it('a failed save is reported, never swallowed', () => {
    expect(fn(settings, 'persistAssets')).toContain('toast.error(errorMessage(err))');
  });
});

describe('ids cannot collide', () => {
  it('Settings mints ids through the shared generator, not the clock', () => {
    expect(fn(settings, 'addAsset')).toContain('newBrandingAssetId(kind)');
    expect(settings).not.toContain('Date.now()}`');
  });

  it('the generator prefers crypto.randomUUID', () => {
    expect(assets).toContain('crypto?.randomUUID?.()');
  });
});

describe('nothing outside Settings storage was touched', () => {
  it('Settings still reads and writes only the branding-asset module', () => {
    expect(settings).not.toContain('CompanyPrintData');
    expect(settings).not.toContain('useBrandingSelection');
  });

  it('the asset module holds no layout, ink or document-rendering concern', () => {
    expect(assets).not.toContain('inkMode');
    expect(assets).not.toContain('BrandingLayout');
    expect(assets).not.toContain('brandingLayout');
  });
});
