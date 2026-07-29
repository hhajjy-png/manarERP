import { describe, it, expect, vi } from 'vitest';
import {
  BRANDING_ASSET_KEYS,
  NO_ASSET,
  appendBrandingAsset,
  brandingAssetSettingsRows,
  defaultSelectionId,
  findDefaultAsset,
  newBrandingAssetId,
  parseBrandingAssets,
  removeBrandingAsset,
  resolveAssetById,
  selectableAssets,
  serializeBrandingAssets,
  setBrandingAssetImage,
  setDefaultBrandingAsset,
  toggleBrandingAssetVisibility,
  updateBrandingAssetField,
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

// ─── Persistence Fix v1 ──────────────────────────────────────────────────────

describe('newBrandingAssetId — unique ids', () => {
  it('prefixes by kind', () => {
    expect(newBrandingAssetId('signature').startsWith('sig-')).toBe(true);
    expect(newBrandingAssetId('stamp').startsWith('stamp-')).toBe(true);
  });

  it('never repeats, even for ids minted inside the same millisecond', () => {
    const ids = new Set(Array.from({ length: 500 }, () => newBrandingAssetId('signature')));
    expect(ids.size).toBe(500);
  });

  it('still yields unique ids when crypto.randomUUID is unavailable', () => {
    vi.stubGlobal('crypto', undefined);
    try {
      const ids = new Set(Array.from({ length: 500 }, () => newBrandingAssetId('stamp')));
      expect(ids.size).toBe(500);
    } finally {
      vi.unstubAllGlobals();
    }
  });
});

describe('list operations — the only way Settings mutates a list', () => {
  const two: BrandingAsset[] = [
    asset({ id: 'a', name: 'أول', isDefault: true }),
    asset({ id: 'b', name: 'ثانٍ', imageUrl: SIG_B, isDefault: false }),
  ];

  it('appends an empty visible slot and never mutates the input', () => {
    const list = appendBrandingAsset(two, 'c');
    expect(list.map((a) => a.id)).toEqual(['a', 'b', 'c']);
    expect(list[2]).toMatchObject({ imageUrl: '', show: true, isDefault: false });
    expect(two).toHaveLength(2);
  });

  it('makes the very first asset of a kind the default', () => {
    expect(appendBrandingAsset([], 'only')[0].isDefault).toBe(true);
  });

  it('promotes the first remaining asset when the default is deleted', () => {
    const list = removeBrandingAsset(two, 'a');
    expect(list.map((a) => a.id)).toEqual(['b']);
    expect(list[0].isDefault).toBe(true);
  });

  it('leaves the existing default alone when a non-default is deleted', () => {
    const list = removeBrandingAsset(two, 'b');
    expect(list.map((a) => a.id)).toEqual(['a']);
    expect(list[0].isDefault).toBe(true);
  });

  it('moves the default flag and leaves exactly one', () => {
    const list = setDefaultBrandingAsset(two, 'b');
    expect(list.filter((a) => a.isDefault).map((a) => a.id)).toEqual(['b']);
  });

  it('toggles visibility of one asset only', () => {
    const list = toggleBrandingAssetVisibility(two, 'b');
    expect(list[0].show).toBe(true);
    expect(list[1].show).toBe(false);
  });

  it('edits one text field of one asset only', () => {
    const list = updateBrandingAssetField(two, 'b', 'title', 'GM');
    expect(list[1]).toMatchObject({ name: 'ثانٍ', title: 'GM' });
    expect(list[0].title).toBe('');
  });

  it('sets an image on one asset only', () => {
    const list = setBrandingAssetImage(two, 'a', SIG_B);
    expect(list[0].imageUrl).toBe(SIG_B);
    expect(list[1].imageUrl).toBe(SIG_B);
    expect(two[0].imageUrl).toBe(SIG_A);
  });
});

describe('round-trip — several assets survive save → reload', () => {
  /** Exactly what Settings does: mutate, serialize to rows, read the rows back. */
  function reload(list: BrandingAsset[], idPrefix: string): BrandingAsset[] {
    const kind = idPrefix === 'sig' ? 'signature' : 'stamp';
    const rows = brandingAssetSettingsRows(kind, list);
    const byKey = Object.fromEntries(rows.map((r) => [r.key, r.value]));
    const keys = BRANDING_ASSET_KEYS[kind];
    return parseBrandingAssets({
      raw: byKey[keys.list],
      legacyImage: byKey[keys.legacyImage],
      legacyShow: byKey[keys.legacyShow],
      idPrefix,
    });
  }

  it('keeps two signatures with their names, images and single default', () => {
    let list = appendBrandingAsset(appendBrandingAsset([], 'sig-a'), 'sig-b');
    list = setBrandingAssetImage(list, 'sig-a', SIG_A);
    list = setBrandingAssetImage(list, 'sig-b', SIG_B);
    list = updateBrandingAssetField(list, 'sig-b', 'name', 'المدير المالي');

    const back = reload(list, 'sig');
    expect(back).toHaveLength(2);
    expect(back.map((a) => a.id)).toEqual(['sig-a', 'sig-b']);
    expect(back.map((a) => a.imageUrl)).toEqual([SIG_A, SIG_B]);
    expect(back[1].name).toBe('المدير المالي');
    expect(back.filter((a) => a.isDefault).map((a) => a.id)).toEqual(['sig-a']);
  });

  it('keeps two stamps and mirrors the chosen default for legacy readers', () => {
    let list = appendBrandingAsset(appendBrandingAsset([], 'stamp-a'), 'stamp-b');
    list = setBrandingAssetImage(list, 'stamp-a', SIG_A);
    list = setBrandingAssetImage(list, 'stamp-b', SIG_B);
    list = setDefaultBrandingAsset(list, 'stamp-b');

    const rows = brandingAssetSettingsRows('stamp', list);
    expect(rows[1].value).toBe(SIG_B); // legacy mirror follows the new default

    const back = reload(list, 'stamp');
    expect(back).toHaveLength(2);
    expect(back.filter((a) => a.isDefault).map((a) => a.id)).toEqual(['stamp-b']);
  });

  it('survives edit → delete → reload without losing the survivor', () => {
    let list = appendBrandingAsset(appendBrandingAsset([], 'sig-a'), 'sig-b');
    list = setBrandingAssetImage(list, 'sig-a', SIG_A);
    list = setBrandingAssetImage(list, 'sig-b', SIG_B);
    list = setDefaultBrandingAsset(list, 'sig-b');
    list = removeBrandingAsset(list, 'sig-b');

    const back = reload(list, 'sig');
    expect(back.map((a) => a.id)).toEqual(['sig-a']);
    expect(back[0].isDefault).toBe(true);
    expect(back[0].imageUrl).toBe(SIG_A);
  });

  it('a hidden asset survives the round-trip as hidden, not as deleted', () => {
    let list = appendBrandingAsset(appendBrandingAsset([], 'sig-a'), 'sig-b');
    list = setBrandingAssetImage(list, 'sig-a', SIG_A);
    list = setBrandingAssetImage(list, 'sig-b', SIG_B);
    list = toggleBrandingAssetVisibility(list, 'sig-b');

    const back = reload(list, 'sig');
    expect(back).toHaveLength(2);
    expect(back[1].show).toBe(false);
    expect(selectableAssets(back).map((a) => a.id)).toEqual(['sig-a']);
  });

  it('an image-less slot round-trips without displacing the real assets', () => {
    let list = appendBrandingAsset([], 'sig-a');
    list = setBrandingAssetImage(list, 'sig-a', SIG_A);
    list = appendBrandingAsset(list, 'sig-empty');

    const back = reload(list, 'sig');
    expect(back.map((a) => a.id)).toEqual(['sig-a', 'sig-empty']);
    expect(selectableAssets(back).map((a) => a.id)).toEqual(['sig-a']);
  });
});
