import { prisma } from '@config/database';
import type { ReportBranding } from './reportTypes';

/** Reads company info from the Settings table and returns a ReportBranding object. */
export async function loadReportBranding(): Promise<ReportBranding> {
  const rows = await prisma.setting.findMany({
    where: {
      key: {
        in: [
          'company.name',
          'company.nameEn',
          'company.address',
          'company.phone',
          'company.email',
          'company.website',
          'company.commercialReg',
          'company.primaryColor',
          'company.footer',
        ],
      },
    },
  });

  const m: Record<string, string> = Object.fromEntries(rows.map((r) => [r.key, r.value]));

  return {
    companyNameAr:  m['company.name']          ?? 'شركة المنار الدولية لإنشاء وإصلاح الطرق والشوارع والأرصفة ومستلزمات الطرق ذ.م.م',
    companyNameEn:  m['company.nameEn']         || undefined,
    address:        m['company.address']        || undefined,
    phone:          m['company.phone']          || undefined,
    email:          m['company.email']          || undefined,
    website:        m['company.website']        || undefined,
    commercialReg:  m['company.commercialReg']  || undefined,
    primaryColor:   m['company.primaryColor']   || undefined,
    footer:         m['company.footer']         || undefined,
  };
}
