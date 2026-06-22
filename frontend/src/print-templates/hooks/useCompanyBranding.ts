import { useState, useEffect } from 'react';
import { api, errorMessage } from '../../api/client';

export interface CompanyBranding {
  signatureUrl: string | undefined;
  stampUrl: string | undefined;
  showSignature: boolean;
  showStamp: boolean;
  loading: boolean;
  error: string | undefined;
}

export function useCompanyBranding(): CompanyBranding {
  const [branding, setBranding] = useState<CompanyBranding>({
    signatureUrl: undefined,
    stampUrl: undefined,
    showSignature: true,
    showStamp: true,
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

        const parseImage = (key: string): string | undefined => {
          const val = find(key);
          return val && val.length > 0 ? val : undefined;
        };

        const parseBool = (key: string): boolean => {
          const val = find(key);
          if (val === undefined) return true;
          return val === 'true';
        };

        setBranding({
          signatureUrl: parseImage('print.signatureImage'),
          stampUrl: parseImage('print.stampImage'),
          showSignature: parseBool('print.showSignature'),
          showStamp: parseBool('print.showStamp'),
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
