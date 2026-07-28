/**
 * Central registry for the company's **signature** and **stamp** assets.
 *
 * One asset list per kind, stored as JSON in the existing `Setting` key/value table:
 *   signature → `print.signatures`   (already existed; previously written but never read)
 *   stamp     → `print.stamps`       (new — the stamp used to be a single image)
 *
 * The pre-existing single-image keys (`print.signatureImage`, `print.stampImage`,
 * `print.showSignature`, `print.showStamp`) are kept as **mirrors of the default
 * asset**. They are what every old build and every not-yet-migrated database has, so
 * `parseBrandingAssets` migrates from them and Settings keeps writing them. That is the
 * whole backward-compatibility contract — nothing else reads raw settings keys.
 *
 * This module is pure (no React, no api): parsing, normalizing, serializing and
 * resolving. The React layer is `useCompanyBranding` (load) + `useBrandingSelection`
 * (per-print choice) + `BrandingAssetPicker` (UI).
 */

export type BrandingAssetKind = 'signature' | 'stamp';

export interface BrandingAsset {
  id: string;
  /** Free-text label shown in the picker (e.g. "المدير العام"). */
  name: string;
  /** Optional job title — descriptive only, never printed by itself. */
  title: string;
  /** PNG data URL produced by the Settings uploader. Empty = slot with no image yet. */
  imageUrl: string;
  /** Whether this asset may appear in documents at all. */
  show: boolean;
  /** Exactly one asset per list carries this flag; it is the pre-selected one. */
  isDefault: boolean;
}

interface AssetKeyGroup {
  /** JSON array of `BrandingAsset`. */
  list: string;
  /** Legacy single-image key — mirror of the default asset's image. */
  legacyImage: string;
  /** Legacy visibility key — mirror of the default asset's `show`. */
  legacyShow: string;
}

export const BRANDING_ASSET_KEYS: Record<BrandingAssetKind, AssetKeyGroup> = {
  signature: {
    list: 'print.signatures',
    legacyImage: 'print.signatureImage',
    legacyShow: 'print.showSignature',
  },
  stamp: {
    list: 'print.stamps',
    legacyImage: 'print.stampImage',
    legacyShow: 'print.showStamp',
  },
};

/**
 * Selection sentinel for "no asset". An empty string — not `null` — so it can sit in a
 * `<select value>` and round-trip through the DOM without a null-vs-empty branch.
 */
export const NO_ASSET = '';

function asString(value: unknown): string {
  return typeof value === 'string' ? value : '';
}

/** One raw JSON entry → a fully-populated asset, or `null` when unusable. */
function normalizeAsset(raw: unknown, index: number, idPrefix: string): BrandingAsset | null {
  if (typeof raw !== 'object' || raw === null) return null;
  const rec = raw as Record<string, unknown>;
  const id = asString(rec.id) || `${idPrefix}-${index + 1}`;
  return {
    id,
    name: asString(rec.name),
    title: asString(rec.title),
    imageUrl: asString(rec.imageUrl),
    // Absent `show` means visible — matches how the legacy boolean keys defaulted.
    show: rec.show !== false,
    isDefault: rec.isDefault === true,
  };
}

/** Guarantees exactly one `isDefault` (the first flagged one, else the first asset). */
function withSingleDefault(list: BrandingAsset[]): BrandingAsset[] {
  if (list.length === 0) return list;
  const defaultIndex = list.findIndex((a) => a.isDefault);
  const chosen = defaultIndex >= 0 ? defaultIndex : 0;
  return list.map((asset, i) => ({ ...asset, isDefault: i === chosen }));
}

export interface ParseAssetsInput {
  /** Raw value of the JSON list key. */
  raw: string | undefined;
  /** Raw value of the legacy single-image key — used only when `raw` yields nothing. */
  legacyImage?: string;
  /** Raw value of the legacy visibility key ('true' | 'false'). */
  legacyShow?: string;
  /** Prefix for generated ids when an entry has none. */
  idPrefix: string;
}

/**
 * Parses a stored asset list, falling back to the legacy single-image keys.
 *
 * Malformed JSON is treated as "no list" rather than an error: a corrupt setting must
 * not blank out a document that the legacy key can still render.
 */
export function parseBrandingAssets(input: ParseAssetsInput): BrandingAsset[] {
  if (input.raw) {
    try {
      const parsed: unknown = JSON.parse(input.raw);
      if (Array.isArray(parsed)) {
        const assets = parsed
          .map((entry, i) => normalizeAsset(entry, i, input.idPrefix))
          .filter((a): a is BrandingAsset => a !== null);
        if (assets.length > 0) return withSingleDefault(assets);
      }
    } catch {
      /* fall through to the legacy keys */
    }
  }
  if (input.legacyImage) {
    return [
      {
        id: `${input.idPrefix}-1`,
        name: '',
        title: '',
        imageUrl: input.legacyImage,
        show: input.legacyShow !== 'false',
        isDefault: true,
      },
    ];
  }
  return [];
}

export function serializeBrandingAssets(list: BrandingAsset[]): string {
  return JSON.stringify(withSingleDefault(list));
}

/**
 * The asset the legacy mirror keys point at, and the one a document starts with.
 *
 * Preference order — visible default, then any visible asset, then the first slot. This
 * reproduces exactly what the Settings page already wrote to `print.signatureImage`, so
 * existing databases keep resolving to the same signature they printed before.
 */
export function findDefaultAsset(list: BrandingAsset[]): BrandingAsset | undefined {
  return list.find((a) => a.isDefault && a.show) ?? list.find((a) => a.show) ?? list[0];
}

/** Id to pre-select in a picker: the default asset when printable, else "none". */
export function defaultSelectionId(list: BrandingAsset[]): string {
  const asset = findDefaultAsset(list);
  return asset && asset.show && asset.imageUrl ? asset.id : NO_ASSET;
}

/** Resolves a selection id to its asset. `NO_ASSET`, unknown ids and hidden or
 *  image-less assets all resolve to `undefined` — i.e. "print nothing". */
export function resolveAssetById(
  list: BrandingAsset[],
  id: string | undefined,
): BrandingAsset | undefined {
  if (!id) return undefined;
  const asset = list.find((a) => a.id === id);
  return asset && asset.show && asset.imageUrl ? asset : undefined;
}

/** Assets a picker should offer — visible slots that actually carry an image. */
export function selectableAssets(list: BrandingAsset[]): BrandingAsset[] {
  return list.filter((a) => a.show && a.imageUrl);
}

/**
 * The three settings rows that persist one asset list: the list itself plus the two
 * legacy mirrors. Callers hand this straight to `PUT /settings`.
 */
export function brandingAssetSettingsRows(
  kind: BrandingAssetKind,
  list: BrandingAsset[],
): { key: string; value: string; group: string }[] {
  const keys = BRANDING_ASSET_KEYS[kind];
  const fallback = findDefaultAsset(list);
  return [
    { key: keys.list, value: serializeBrandingAssets(list), group: 'print' },
    { key: keys.legacyImage, value: fallback?.imageUrl ?? '', group: 'print' },
    { key: keys.legacyShow, value: fallback?.show ? 'true' : 'false', group: 'print' },
  ];
}
