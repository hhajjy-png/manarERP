import { describe, it, expect } from 'vitest';
import {
  BRANDING_ASSET_KEYS,
  NO_ASSET,
  brandingAssetSettingsRows,
  defaultSelectionId,
  findDefaultAsset,
  parseBrandingAssets,
  resolveAssetById,
  selectableAssets,
  serializeBrandingAssets,
  type BrandingAsset,
} from '../../print-templates/branding/brandingAssets';

const SIG_A = 'data:image/png;base64,AAA';
const SIG_B = 'data:image/png;base64,BBB';

function asset(over: Partial<BrandingAsset> = {}): BrandingAsset {
  return { id: 'sig-1', name: '', title: '', imageUrl: SIG_A, show: true, isDefault: true, ...over };
}

describe('parseBrandingAssets — reading the stored list', () => {
  it('reads a JSON list and keeps its order', () => {
    const raw = JSON.stringify([
      { id: 'a', name: 'المدير', title: 'GM', imageUrl: SIG_A, show: true, isDefault: false },
      { id: 'b', name: 'المحاسب', title: '', imageUrl: SIG_B, show: true, isDefault: true },
    ]);
    const list = parseBrandingAssets({ raw, idPrefix: 'sig' });
    expect(list.map((a) => a.id)).toEqual(['a', 'b']);
    expect(list[1].isDefault).toBe(true);
  });

  it('generates ids for entries that have none', () => {
    const raw = JSON.stringify([{ imageUrl: SIG_A }, { imageUrl: SIG_B }]);
    const list = parseBrandingAssets({ raw, idPrefix: 'stamp' });
    expect(list.map((a) => a.id)).toEqual(['stamp-1', 'stamp-2']);
  });

  it('treats a missing `show` as visible', () => {
    const raw = JSON.stringify([{ id: 'a', imageUrl: SIG_A }]);
    expect(parseBrandingAssets({ raw, idPrefix: 'sig' })[0].show).toBe(true);
  });

  it('forces exactly one default when the stored list flags none', () => {
    const raw = JSON.stringify([{ id: 'a', imageUrl: SIG_A }, { id: 'b', imageUrl: SIG_B }]);
    const list = parseBrandingAssets({ raw, idPrefix: 'sig' });
    expect(list.filter((a) => a.isDefault).map((a) => a.id)).toEqual(['a']);
  });

  it('forces exactly one default when the stored list flags several', () => {
    const raw = JSON.stringify([
      { id: 'a', imageUrl: SIG_A, isDefault: true },
      { id: 'b', imageUrl: SIG_B, isDefault: true },
    ]);
    const list = parseBrandingAssets({ raw, idPrefix: 'sig' });
    expect(list.filter((a) => a.isDefault).map((a) => a.id)).toEqual(['a']);
  });

  it('migrates the legacy single-image key when no list is stored', () => {
    const list = parseBrandingAssets({ raw: undefined, legacyImage: SIG_A, idPrefix: 'stamp' });
    expect(list).toEqual([
      { id: 'stamp-1', name: '', title: '', imageUrl: SIG_A, show: true, isDefault: true },
    ]);
  });

  it("carries the legacy 'false' visibility flag into the migrated asset", () => {
    const list = parseBrandingAssets({ raw: undefined, legacyImage: SIG_A, legacyShow: 'false', idPrefix: 'sig' });
    expect(list[0].show).toBe(false);
  });

  it('falls back to the legacy key when the stored JSON is corrupt — a bad setting must not blank the document', () => {
    const list = parseBrandingAssets({ raw: '{not json', legacyImage: SIG_A, idPrefix: 'sig' });
    expect(list[0].imageUrl).toBe(SIG_A);
  });

  it('falls back to the legacy key when the stored list is empty', () => {
    const list = parseBrandingAssets({ raw: '[]', legacyImage: SIG_B, idPrefix: 'sig' });
    expect(list[0].imageUrl).toBe(SIG_B);
  });

  it('returns an empty list when neither the list nor the legacy key holds anything', () => {
    expect(parseBrandingAssets({ raw: undefined, legacyImage: '', idPrefix: 'sig' })).toEqual([]);
  });

  it('skips non-object entries instead of throwing', () => {
    const raw = JSON.stringify([null, 'x', { id: 'a', imageUrl: SIG_A }]);
    expect(parseBrandingAssets({ raw, idPrefix: 'sig' }).map((a) => a.id)).toEqual(['a']);
  });
});

describe('findDefaultAsset — same preference order the old mirror key used', () => {
  it('prefers the visible default', () => {
    const list = [
      asset({ id: 'a', isDefault: false }),
      asset({ id: 'b', isDefault: true, imageUrl: SIG_B }),
    ];
    expect(findDefaultAsset(list)?.id).toBe('b');
  });

  it('falls back to the first visible asset when the default is hidden', () => {
    const list = [
      asset({ id: 'a', isDefault: true, show: false }),
      asset({ id: 'b', isDefault: false, imageUrl: SIG_B }),
    ];
    expect(findDefaultAsset(list)?.id).toBe('b');
  });

  it('falls back to the first slot when every asset is hidden', () => {
    const list = [asset({ id: 'a', show: false }), asset({ id: 'b', show: false })];
    expect(findDefaultAsset(list)?.id).toBe('a');
  });

  it('returns undefined for an empty list', () => {
    expect(findDefaultAsset([])).toBeUndefined();
  });
});

describe('defaultSelectionId — what a form pre-selects', () => {
  it('pre-selects the default asset', () => {
    expect(defaultSelectionId([asset({ id: 'a' })])).toBe('a');
  });

  it('pre-selects nothing when the only asset has no image yet', () => {
    expect(defaultSelectionId([asset({ imageUrl: '' })])).toBe(NO_ASSET);
  });

  it('pre-selects nothing when every asset is hidden', () => {
    expect(defaultSelectionId([asset({ show: false })])).toBe(NO_ASSET);
  });

  it('pre-selects nothing when the company registered no assets', () => {
    expect(defaultSelectionId([])).toBe(NO_ASSET);
  });
});

describe('resolveAssetById — turning a choice into an image', () => {
  const list = [
    asset({ id: 'a' }),
    asset({ id: 'b', imageUrl: SIG_B, isDefault: false }),
    asset({ id: 'hidden', show: false, isDefault: false }),
    asset({ id: 'blank', imageUrl: '', isDefault: false }),
  ];

  it('resolves a selected id to its asset', () => {
    expect(resolveAssetById(list, 'b')?.imageUrl).toBe(SIG_B);
  });

  it('resolves "none" to undefined', () => {
    expect(resolveAssetById(list, NO_ASSET)).toBeUndefined();
  });

  it('resolves an unknown id to undefined instead of guessing a substitute', () => {
    expect(resolveAssetById(list, 'deleted-id')).toBeUndefined();
  });

  it('refuses a hidden asset even when explicitly selected', () => {
    expect(resolveAssetById(list, 'hidden')).toBeUndefined();
  });

  it('refuses an asset with no image', () => {
    expect(resolveAssetById(list, 'blank')).toBeUndefined();
  });
});

describe('selectableAssets — what the picker offers', () => {
  it('offers only visible assets that carry an image', () => {
    const list = [
      asset({ id: 'ok' }),
      asset({ id: 'hidden', show: false }),
      asset({ id: 'blank', imageUrl: '' }),
    ];
    expect(selectableAssets(list).map((a) => a.id)).toEqual(['ok']);
  });
});

describe('serializeBrandingAssets', () => {
  it('round-trips a list through parse', () => {
    const list = [asset({ id: 'a', name: 'المدير' }), asset({ id: 'b', imageUrl: SIG_B, isDefault: false })];
    const parsed = parseBrandingAssets({ raw: serializeBrandingAssets(list), idPrefix: 'sig' });
    expect(parsed).toEqual(list);
  });

  it('normalizes the default flag on the way out', () => {
    const raw = serializeBrandingAssets([asset({ id: 'a', isDefault: false }), asset({ id: 'b', isDefault: false })]);
    expect(JSON.parse(raw).map((a: BrandingAsset) => a.isDefault)).toEqual([true, false]);
  });
});

describe('brandingAssetSettingsRows — persistence contract', () => {
  it('writes the list plus both legacy mirrors for signatures', () => {
    const rows = brandingAssetSettingsRows('signature', [asset({ id: 'a' })]);
    expect(rows.map((r) => r.key)).toEqual([
      BRANDING_ASSET_KEYS.signature.list,
      BRANDING_ASSET_KEYS.signature.legacyImage,
      BRANDING_ASSET_KEYS.signature.legacyShow,
    ]);
    expect(rows[1].value).toBe(SIG_A);
    expect(rows[2].value).toBe('true');
    expect(rows.every((r) => r.group === 'print')).toBe(true);
  });

  it('writes the list plus both legacy mirrors for stamps', () => {
    const rows = brandingAssetSettingsRows('stamp', [asset({ id: 'a', imageUrl: SIG_B })]);
    expect(rows.map((r) => r.key)).toEqual([
      BRANDING_ASSET_KEYS.stamp.list,
      BRANDING_ASSET_KEYS.stamp.legacyImage,
      BRANDING_ASSET_KEYS.stamp.legacyShow,
    ]);
    expect(rows[1].value).toBe(SIG_B);
  });

  it('mirrors the DEFAULT asset, not the first one, so old readers keep printing the same image', () => {
    const rows = brandingAssetSettingsRows('signature', [
      asset({ id: 'a', isDefault: false }),
      asset({ id: 'b', imageUrl: SIG_B, isDefault: true }),
    ]);
    expect(rows[1].value).toBe(SIG_B);
  });

  it('mirrors a hidden default as an empty image and false visibility', () => {
    const rows = brandingAssetSettingsRows('stamp', [asset({ id: 'a', show: false })]);
    expect(rows[2].value).toBe('false');
  });

  it('clears the legacy mirrors when the last asset is deleted', () => {
    const rows = brandingAssetSettingsRows('stamp', []);
    expect(rows[1].value).toBe('');
    expect(rows[2].value).toBe('false');
  });
});
