import { useEffect, useState } from 'react';
import { api } from '../api/client';

/**
 * حالة قفل الفترة المالية — تُقرأ من `GET /settings/period-lock`.
 *
 * تُخبَّأ على مستوى الوحدة: النماذج المتعددة تشترك في نفس القيمة دون إعادة جلب،
 * وتُبطَّل عند تحديث الإعدادات (شاشة القفل تنادي `invalidatePeriodLock`).
 */
export interface PeriodLockState {
  lockBeforeDate: string | null; // 'YYYY-MM-DD' أو null (لا قفل)
  canOverride: boolean;
  loading: boolean;
}

let cache: { lockBeforeDate: string | null; canOverride: boolean } | null = null;
let inflight: Promise<{ lockBeforeDate: string | null; canOverride: boolean }> | null = null;
const listeners = new Set<() => void>();

async function fetchLock() {
  if (cache) return cache;
  if (!inflight) {
    inflight = api
      .get('/settings/period-lock')
      .then((r) => {
        cache = {
          lockBeforeDate: r.data?.data?.lockBeforeDate ?? null,
          canOverride: !!r.data?.data?.canOverride,
        };
        return cache;
      })
      .catch(() => {
        cache = { lockBeforeDate: null, canOverride: false };
        return cache;
      })
      .finally(() => { inflight = null; });
  }
  return inflight;
}

/** يُبطِل التخبئة ويُعيد التحميل — يُنادى بعد تغيير القفل من الإعدادات. */
export function invalidatePeriodLock() {
  cache = null;
  listeners.forEach((l) => l());
}

export function usePeriodLock(): PeriodLockState {
  const [state, setState] = useState<PeriodLockState>(() =>
    cache ? { ...cache, loading: false } : { lockBeforeDate: null, canOverride: false, loading: true },
  );

  useEffect(() => {
    let alive = true;
    const load = () => {
      fetchLock().then((v) => { if (alive) setState({ ...v, loading: false }); });
    };
    load();
    listeners.add(load);
    return () => { alive = false; listeners.delete(load); };
  }, []);

  return state;
}
