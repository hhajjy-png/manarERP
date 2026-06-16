export const WORK_TYPES = ['نقل اسفلت', 'يومية مالينج', 'يومية اسفلت', 'نقل انقاض'] as const;
export const DEFAULT_WORK_TYPE = 'نقل اسفلت';

export function composeDescription(workType: string, location: string): string {
  const wt = workType.trim();
  const loc = location.trim();
  if (wt && loc) return `${wt} — ${loc}`;
  return wt || loc;
}

export function parseDescription(desc: string): { workType: string; location: string } {
  const sep = ' — ';
  const idx = desc.indexOf(sep);
  if (idx !== -1) {
    const wt = desc.slice(0, idx).trim();
    const loc = desc.slice(idx + sep.length).trim();
    return { workType: wt || DEFAULT_WORK_TYPE, location: loc };
  }
  return { workType: DEFAULT_WORK_TYPE, location: desc };
}
