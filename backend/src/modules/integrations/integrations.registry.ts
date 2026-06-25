import type { IntegrationDefinition } from './integrations.types';

/**
 * Static registry of all integrations.
 *
 * Phase 1 rule: status drives UI only — no runtime execution for 'planned' or 'comingSoon'.
 * Extension point: add new entries here; the service picks them up automatically.
 *
 * Phase 2: Bank Statement Import (Excel/CSV parsing, bank format profiles, preview, validation, duplicate detection)
 * Phase 3: Bank Reconciliation Assistant (auto matching, manual matching, cheque matching, safe approval before posting)
 * Phase 4: Cloud Backup (provider connectors, encryption, optional sync)
 * Phase 5: Connector SDK (registry-driven connectors, run logs, connector health)
 */
export const INTEGRATION_REGISTRY: IntegrationDefinition[] = [
  {
    id:          'payroll-bank-import',
    nameAr:      'استيراد رواتب البنك',
    nameEn:      'Payroll Bank Import',
    category:    'bank',
    descriptionAr: 'استيراد ملفات الرواتب من البنك (Excel / CSV) ومطابقتها مع سجلات الموظفين لتأكيد صرف الرواتب.',
    descriptionEn: 'Import payroll files from the bank and match them against employee records to confirm salary disbursements.',
    status:      'available',
    maturity:    'stable',
    capabilities: [
      { id: 'excel-import',   labelAr: 'استيراد Excel' },
      { id: 'employee-match', labelAr: 'مطابقة الموظفين' },
      { id: 'analytics',      labelAr: 'تحليل الرواتب' },
    ],
    requiredPermissions: ['import.read', 'import.create'],
    targetRoute:  '/payroll/bank-import',
    settingsSchema: [
      { key: 'enabled', labelAr: 'تفعيل التكامل', type: 'boolean', defaultValue: true },
      { key: 'notes',   labelAr: 'ملاحظات',        type: 'text',    defaultValue: '' },
    ],
  },

  {
    id:          'bank-statement-import',
    nameAr:      'استيراد كشف البنك',
    nameEn:      'Bank Statement Import',
    category:    'bank',
    descriptionAr: 'استيراد كشوف الحسابات البنكية بتنسيقات متعددة (Excel, CSV) وعرضها مع إمكانية التحقق والتنظيف قبل الترحيل.',
    descriptionEn: 'Import bank statements in multiple formats (Excel, CSV) with preview, validation, and duplicate detection before posting.',
    status:      'available',
    maturity:    'stable',
    capabilities: [
      { id: 'multi-format',        labelAr: 'تنسيقات متعددة (Excel / CSV)' },
      { id: 'preview-validate',    labelAr: 'معاينة وتحقق' },
      { id: 'duplicate-detection', labelAr: 'كشف المكررات' },
      { id: 'smart-matching',      labelAr: 'مطابقة ذكية (7 مصادر بيانات)' },
      { id: 'reconciliation',      labelAr: 'مساحة المطابقة البنكية' },
    ],
    requiredPermissions: ['bankStatementImport.create'],
    targetRoute:  '/bank-statement-import',
    settingsSchema: [
      { key: 'enabled', labelAr: 'تفعيل التكامل', type: 'boolean', defaultValue: false },
      { key: 'notes',   labelAr: 'ملاحظات',        type: 'text',    defaultValue: '' },
    ],
  },

  {
    id:          'bank-reconciliation',
    nameAr:      'مساعد المطابقة البنكية',
    nameEn:      'Bank Reconciliation Assistant',
    category:    'bank',
    descriptionAr: 'مطابقة تلقائية ويدوية بين حركات البنك وقيود النظام — رسوم بنكية، شيكات، مدفوعات — مع موافقة قبل الترحيل.',
    descriptionEn: 'Automatic and manual matching of bank transactions against system entries — bank fees, cheques, payments — with approval before posting.',
    status:      'planned',
    maturity:    'planned',
    capabilities: [
      { id: 'auto-match',    labelAr: 'مطابقة تلقائية' },
      { id: 'cheque-match',  labelAr: 'مطابقة الشيكات' },
      { id: 'safe-approval', labelAr: 'موافقة آمنة قبل الترحيل' },
    ],
    requiredPermissions: ['integrations.run'],
    targetRoute:  null,
    settingsSchema: [
      { key: 'enabled', labelAr: 'تفعيل التكامل', type: 'boolean', defaultValue: false },
      { key: 'notes',   labelAr: 'ملاحظات',        type: 'text',    defaultValue: '' },
    ],
  },

  {
    id:          'cloud-backup',
    nameAr:      'النسخ الاحتياطي السحابي',
    nameEn:      'Cloud Backup',
    category:    'backup',
    descriptionAr: 'إرسال نسخ احتياطية مشفرة إلى مزود سحابي (OneDrive / Google Drive) بجانب النسخ المحلي الموجود.',
    descriptionEn: 'Send encrypted backups to a cloud provider (OneDrive / Google Drive) alongside the existing local backup.',
    status:      'planned',
    maturity:    'planned',
    capabilities: [
      { id: 'encryption',     labelAr: 'تشفير AES-256' },
      { id: 'provider-sync',  labelAr: 'مزامنة المزود السحابي' },
      { id: 'retention',      labelAr: 'سياسة الاحتفاظ' },
    ],
    requiredPermissions: ['backups.create'],
    targetRoute:  null,
    settingsSchema: [
      { key: 'enabled', labelAr: 'تفعيل التكامل', type: 'boolean', defaultValue: false },
      { key: 'notes',   labelAr: 'ملاحظات',        type: 'text',    defaultValue: '' },
    ],
  },

  {
    id:          'enhanced-excel-import',
    nameAr:      'استيراد Excel المحسّن',
    nameEn:      'Enhanced Excel Import',
    category:    'import',
    descriptionAr: 'استيراد دفعي للبيانات من ملفات Excel للعملاء والعقود والموظفين والموردين والمصروفات والأسعار.',
    descriptionEn: 'Bulk data import from Excel files for customers, contracts, employees, suppliers, expenses, and prices.',
    status:      'available',
    maturity:    'stable',
    capabilities: [
      { id: 'multi-entity', labelAr: '7 جهات (عملاء، عقود، موظفون…)' },
      { id: 'fk-resolve',   labelAr: 'ربط المراجع تلقائياً' },
      { id: 'validation',   labelAr: 'تحقق وتقرير الأخطاء' },
    ],
    requiredPermissions: ['import.read', 'import.create'],
    targetRoute:  '/import',
    settingsSchema: [
      { key: 'enabled', labelAr: 'تفعيل التكامل', type: 'boolean', defaultValue: true },
      { key: 'notes',   labelAr: 'ملاحظات',        type: 'text',    defaultValue: '' },
    ],
  },

  {
    id:          'connector-sdk',
    nameAr:      'حزمة تطوير الموصّلات',
    nameEn:      'Connector SDK',
    category:    'future',
    descriptionAr: 'منصة لبناء موصّلات مخصصة — سجل تشغيل، فحص الصحة، واجهة توصيل قياسية.',
    descriptionEn: 'Platform for building custom connectors — run logs, health checks, and a standard plug interface.',
    status:      'comingSoon',
    maturity:    'foundation',
    capabilities: [
      { id: 'registry-driven', labelAr: 'تسجيل تلقائي' },
      { id: 'run-logs',        labelAr: 'سجل تشغيل' },
      { id: 'health-checks',   labelAr: 'فحص الصحة' },
    ],
    requiredPermissions: [],
    targetRoute:  null,
    settingsSchema: [],
  },
];

export function findIntegration(id: string): IntegrationDefinition | undefined {
  return INTEGRATION_REGISTRY.find((i) => i.id === id);
}
