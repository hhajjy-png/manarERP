/**
 * Single source of truth for the employment contract's "First Party" (employer)
 * authorized signatories. All contract surfaces (params form, printed template)
 * must read from this list — never hardcode a name/civil ID separately.
 */
export interface AuthorizedSignatory {
  id: string;
  nameAr: string;
  nameEn: string;
  civilId: string;
}

export const AUTHORIZED_SIGNATORIES: AuthorizedSignatory[] = [
  {
    id: 'hassan-falah-nayef-alhajji',
    nameAr: 'حسن فلاح نايف الحاجي',
    nameEn: 'HASSAN FALAH NAIF ALHAJI',
    civilId: '282081000827',
  },
  {
    id: 'ghanem-hassan-nayef-alhajji',
    nameAr: 'غانم حسن نايف الحجي',
    nameEn: 'GHANEM HASSAN NAIEF AL HAJJI',
    civilId: '277042701747',
  },
  {
    id: 'mohammad-tuwari-alhussaini',
    nameAr: 'محمد طواري محمد الحسيني',
    nameEn: 'MOHAMMAD TUWARI MOHAMMAD ALHUSSAINI',
    civilId: '284112601932',
  },
];

export const DEFAULT_AUTHORIZED_SIGNATORY_ID = AUTHORIZED_SIGNATORIES[0].id;

export function getAuthorizedSignatory(id: string | undefined): AuthorizedSignatory {
  return AUTHORIZED_SIGNATORIES.find(s => s.id === id) ?? AUTHORIZED_SIGNATORIES[0];
}
