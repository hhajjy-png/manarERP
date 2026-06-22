import type { CSSProperties } from 'react';
import type {
  BrandingElementLayout,
  BrandingLayout,
  PrintBrandingLayoutSettings,
  PrintDocumentType,
} from '../engine/types';

// ─── Defaults ────────────────────────────────────────────────────────────────

export const DEFAULT_ELEMENT_LAYOUT: Readonly<BrandingElementLayout> = {
  x: 0,
  y: 0,
  scale: 1,
  opacity: 1,
  zIndex: 1,
};

const DEFAULT_ELEMENT_PAIR: Readonly<BrandingLayout> = {
  signature: { ...DEFAULT_ELEMENT_LAYOUT },
  stamp: { ...DEFAULT_ELEMENT_LAYOUT },
};

export const DEFAULT_BRANDING_LAYOUT: Readonly<PrintBrandingLayoutSettings> = {
  invoice: { ...DEFAULT_ELEMENT_PAIR },
  quotation: { ...DEFAULT_ELEMENT_PAIR },
};

// ─── Clamp ───────────────────────────────────────────────────────────────────

export function clampBrandingElementLayout(el: BrandingElementLayout): BrandingElementLayout {
  return {
    x: Math.max(-80, Math.min(80, el.x)),
    y: Math.max(-60, Math.min(60, el.y)),
    scale: Math.max(0.4, Math.min(2.5, el.scale)),
    opacity: Math.max(0.2, Math.min(1, el.opacity)),
    zIndex: el.zIndex >= 2 ? 2 : 1,
  };
}

// ─── Parse / Serialize ───────────────────────────────────────────────────────

function isElementLayout(v: unknown): v is BrandingElementLayout {
  if (typeof v !== 'object' || v === null) return false;
  const o = v as Record<string, unknown>;
  return (
    typeof o.x === 'number' &&
    typeof o.y === 'number' &&
    typeof o.scale === 'number' &&
    typeof o.opacity === 'number' &&
    typeof o.zIndex === 'number'
  );
}

function isDocLayout(v: unknown): v is BrandingLayout {
  if (typeof v !== 'object' || v === null) return false;
  const o = v as Record<string, unknown>;
  return isElementLayout(o.signature) && isElementLayout(o.stamp);
}

export function parseBrandingLayout(
  value: string | null | undefined,
): PrintBrandingLayoutSettings {
  if (!value) return { ...DEFAULT_BRANDING_LAYOUT };
  try {
    const parsed: unknown = JSON.parse(value);
    if (typeof parsed !== 'object' || parsed === null) return { ...DEFAULT_BRANDING_LAYOUT };
    const p = parsed as Record<string, unknown>;
    return {
      invoice: isDocLayout(p.invoice) ? p.invoice : DEFAULT_ELEMENT_PAIR,
      quotation: isDocLayout(p.quotation) ? p.quotation : DEFAULT_ELEMENT_PAIR,
    };
  } catch {
    return { ...DEFAULT_BRANDING_LAYOUT };
  }
}

export function serializeBrandingLayout(layout: PrintBrandingLayoutSettings): string {
  return JSON.stringify(layout);
}

// ─── Merge ───────────────────────────────────────────────────────────────────

export function mergeBrandingLayout(
  defaults: PrintBrandingLayoutSettings,
  overrides: Partial<PrintBrandingLayoutSettings>,
): PrintBrandingLayoutSettings {
  return {
    invoice: overrides.invoice ?? defaults.invoice,
    quotation: overrides.quotation ?? defaults.quotation,
  };
}

// ─── Lookup ──────────────────────────────────────────────────────────────────

export function getBrandingLayoutForDocument(
  layout: PrintBrandingLayoutSettings | undefined,
  docType: PrintDocumentType,
): BrandingLayout {
  return layout?.[docType] ?? DEFAULT_ELEMENT_PAIR;
}

// ─── CSS helper ──────────────────────────────────────────────────────────────

export function applyBrandingElementStyle(el: BrandingElementLayout): CSSProperties {
  const clamped = clampBrandingElementLayout(el);
  return {
    position: 'relative',
    transform: `translate(${clamped.x}px, ${clamped.y}px) scale(${clamped.scale})`,
    transformOrigin: 'center',
    opacity: clamped.opacity,
    zIndex: clamped.zIndex,
  };
}
