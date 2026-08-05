import { useState, useEffect } from 'react';
import { api, errorMessage } from '../../api/client';
import type { PrintBrandingLayoutSettings } from '../engine/types';
import type { PrintTextStyleSettings } from '../engine/textStyleTypes';
import type { StaticTextOverrides } from '../designer/staticTextTypes';
import type { AllLayoutOverrides } from '../designer/layoutOverrideTypes';
import { parseBrandingLayout } from '../utils/brandingLayout';
import { parseTextStyleSettings } from '../utils/textStyleOverrides';
import { parseStaticTextOverrides } from '../designer/staticTextUtils';
import { parseAllLayouts } from '../designer/layoutOverrideUtils';
import {
  BRANDING_ASSET_KEYS,
  findDefaultAsset,
  parseBrandingAssets,
  type BrandingAsset,
} from '../branding/brandingAssets';

/** The operator-authored barcode text. Empty strings mean "never set". */
export interface BarcodeContent {
  reference: string;
  subject: string;
  details: string;
  /**
   * The last NON-EMPTY reference ever saved — remembered, never printed.
   *
   * It exists because Reset must be able to clear the printed reference WITHOUT
   * destroying the sequence: after «إعادة تعيين» + حفظ, `reference` is empty (so the
   * sheet carries no caption) while this still holds the number the next suggestion
   * counts from. Folding the two into one value is what would make Reset silently
   * restart the numbering at nothing.
   */
  lastReference: string;
}

/** The settings keys those fields live in — one plain string each. */
export const BARCODE_CONTENT_KEYS = {
  reference: 'print.barcode.reference',
  subject: 'print.barcode.subject',
  details: 'print.barcode.details',
  lastReference: 'print.barcode.lastReference',
} as const;

export const EMPTY_BARCODE_CONTENT: Readonly<BarcodeContent> = {
  reference: '',
  subject: '',
  details: '',
  lastReference: '',
};

export interface CompanyBranding {
  /** Every signature the company has registered, in Settings order. */
  signatures: BrandingAsset[];
  /** Every stamp the company has registered, in Settings order. */
  stamps: BrandingAsset[];
  /**
   * Default-asset shortcuts. Kept so surfaces that never offer a choice (the Settings
   * calibration preview, existing callers) keep behaving exactly as before: they are
   * the default signature/stamp, which is what the legacy single-image keys held.
   */
  signatureUrl: string | undefined;
  stampUrl: string | undefined;
  showSignature: boolean;
  showStamp: boolean;
  brandingLayout: PrintBrandingLayoutSettings | undefined;
  /**
   * Barcode Content Settings v1 — what the barcode element ENCODES, as three plain
   * strings the operator types.
   *
   * Deliberately three ordinary settings values (`print.barcode.*`, group `print`) and
   * not a serialized record: they are free text with no shape to validate, so they need
   * no parser, no schema and no migration — exactly like the string settings the
   * Settings page already stores. They ride the ONE `/settings` request this hook
   * already makes, so reading them costs no extra round-trip.
   *
   * `reference` doubles as the LAST reference used: it is what the barcode prints and
   * what the settings dialog increments from. One value, not a value plus a counter —
   * a separate counter is the thing that can drift out of step with what was printed.
   */
  barcodeContent: BarcodeContent;
  textStyleOverrides: PrintTextStyleSettings | undefined;
  staticTextOverrides: StaticTextOverrides | undefined;
  layoutOverrides: AllLayoutOverrides;
  loading: boolean;
  error: string | undefined;
}

export function useCompanyBranding(): CompanyBranding {
  const [branding, setBranding] = useState<CompanyBranding>({
    signatures: [],
    stamps: [],
    signatureUrl: undefined,
    stampUrl: undefined,
    showSignature: true,
    showStamp: true,
    brandingLayout: undefined,
    barcodeContent: { ...EMPTY_BARCODE_CONTENT },
    textStyleOverrides: undefined,
    staticTextOverrides: undefined,
    layoutOverrides: { invoice: {}, quotation: {} },
    loading: true,
    error: undefined,
  });

  useEffect(() => {
    let cancelled = false;
    api
      .get('/settings')
      .then((res) => {
        if (cancelled) return;
        const settings: Array<{ key: string; value: string }> =
          res.data?.data?.settings ?? [];

        const find = (key: string): string | undefined => {
          const entry = settings.find((s) => s.key === key);
          return entry?.value;
        };

        const readAssets = (kind: 'signature' | 'stamp'): BrandingAsset[] => {
          const keys = BRANDING_ASSET_KEYS[kind];
          return parseBrandingAssets({
            raw: find(keys.list),
            legacyImage: find(keys.legacyImage),
            legacyShow: find(keys.legacyShow),
            idPrefix: kind === 'signature' ? 'sig' : 'stamp',
          });
        };

        const signatures = readAssets('signature');
        const stamps = readAssets('stamp');
        const defaultSignature = findDefaultAsset(signatures);
        const defaultStamp = findDefaultAsset(stamps);

        const layoutRaw = find('print.brandingLayout');
        const brandingLayout = layoutRaw ? parseBrandingLayout(layoutRaw) : undefined;

        const textStyleRaw = find('print.textStyleOverrides');
        const textStyleOverrides = textStyleRaw
          ? parseTextStyleSettings(textStyleRaw)
          : undefined;

        const staticTextRaw = find('print.staticTextOverrides');
        const staticTextOverrides = staticTextRaw
          ? parseStaticTextOverrides(staticTextRaw)
          : undefined;

        const layoutOverrides = parseAllLayouts(find('print.layoutOverrides'));

        // Plain strings — an absent key is simply "" (never set), which is the same
        // thing the operator sees after clearing a field. No parsing, no defaults.
        const savedReference = find(BARCODE_CONTENT_KEYS.reference) ?? '';
        const barcodeContent: BarcodeContent = {
          reference: savedReference,
          subject: find(BARCODE_CONTENT_KEYS.subject) ?? '',
          details: find(BARCODE_CONTENT_KEYS.details) ?? '',
          // Falls back to the reference itself, so a record saved before Reset existed
          // (three keys, no fourth) still suggests from the number it actually holds.
          lastReference: find(BARCODE_CONTENT_KEYS.lastReference) ?? savedReference,
        };

        setBranding({
          signatures,
          stamps,
          signatureUrl: defaultSignature?.imageUrl || undefined,
          stampUrl: defaultStamp?.imageUrl || undefined,
          showSignature: defaultSignature ? defaultSignature.show : true,
          showStamp: defaultStamp ? defaultStamp.show : true,
          brandingLayout,
          barcodeContent,
          textStyleOverrides,
          staticTextOverrides,
          layoutOverrides,
          loading: false,
          error: undefined,
        });
      })
      .catch((e) => {
        if (cancelled) return;
        setBranding((prev) => ({
          ...prev,
          loading: false,
          error: errorMessage(e),
        }));
      });
    return () => {
      cancelled = true;
    };
  }, []);

  return branding;
}
