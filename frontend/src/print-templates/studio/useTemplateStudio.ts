import { useState, useEffect } from 'react';
import { api } from '../../api/client';
import type { TemplateStudioDocumentType, TemplateStudioTemplate } from './templateStudioTypes';
import { parseTemplateStudioSettings, getActiveTemplate } from './templateStudioUtils';

export interface UseTemplateStudioResult {
  activeTemplate: TemplateStudioTemplate | null;
  loading:        boolean;
}

export function useTemplateStudio(
  docType: TemplateStudioDocumentType,
): UseTemplateStudioResult {
  const [activeTemplate, setActiveTemplate] = useState<TemplateStudioTemplate | null>(null);
  const [loading, setLoading]               = useState(true);

  useEffect(() => {
    let cancelled = false;

    api
      .get('/settings')
      .then((res) => {
        if (cancelled) return;
        const settings: Array<{ key: string; value: string }> =
          res.data?.data?.settings ?? [];

        const find = (key: string): string | undefined =>
          settings.find((s) => s.key === key)?.value;

        const studioSettings = parseTemplateStudioSettings(
          find('print.templateStudio.templates'),
        );
        const activeId = find(`print.templateStudio.active.${docType}`) ?? null;
        setActiveTemplate(getActiveTemplate(studioSettings, docType, activeId));
      })
      .catch(() => {
        // silently degrade — null activeTemplate means "use existing template"
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [docType]);

  return { activeTemplate, loading };
}
