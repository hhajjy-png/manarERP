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

        setBranding({
          signatures,
          stamps,
          signatureUrl: defaultSignature?.imageUrl || undefined,
          stampUrl: defaultStamp?.imageUrl || undefined,
          showSignature: defaultSignature ? defaultSignature.show : true,
          showStamp: defaultStamp ? defaultStamp.show : true,
          brandingLayout,
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
