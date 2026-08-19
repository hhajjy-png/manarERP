/**
 * البيانات الأولية (Seed):
 *  1. الصلاحيات لكل وحدة
 *  2. الأدوار السبعة وربطها بالصلاحيات
 *  3. مستخدم مدير نظام افتراضي
 *  4. إعدادات الشركة الأساسية
 *
 * التشغيل: npm run prisma:seed
 */
import { PrismaClient } from '@prisma/client';
import bcrypt from 'bcryptjs';
import { SYSTEM_ACCOUNTS } from '../src/modules/accounting/accounting.accounts';

const prisma = new PrismaClient();

const ROLES = {
  SYSTEM_ADMIN: 'SYSTEM_ADMIN',
  GENERAL_MANAGER: 'GENERAL_MANAGER',
  ACCOUNTANT: 'ACCOUNTANT',
  PROJECT_MANAGER: 'PROJECT_MANAGER',
  EQUIPMENT_MANAGER: 'EQUIPMENT_MANAGER',
  HR_MANAGER: 'HR_MANAGER',
  STANDARD_USER: 'STANDARD_USER',
};

const ROLE_DISPLAY: Record<string, string> = {
  SYSTEM_ADMIN: 'مدير النظام',
  GENERAL_MANAGER: 'المدير العام',
  ACCOUNTANT: 'المحاسب',
  PROJECT_MANAGER: 'مدير العقود',
  EQUIPMENT_MANAGER: 'مسؤول المعدات',
  HR_MANAGER: 'مسؤول الموارد البشرية',
  STANDARD_USER: 'مستخدم عادي',
};

// الوحدة: الإجراءات المتاحة لها
const MODULE_ACTIONS: Record<string, string[]> = {
  dashboard: ['read'],
  customers: ['read', 'create', 'update', 'delete', 'export'],
  employees: ['read', 'create', 'update', 'delete', 'export'],
  attendance: ['read', 'create', 'update', 'delete', 'export'],
  payroll: ['read', 'create', 'update', 'delete', 'approve', 'export', 'pay', 'generate', 'payslip', 'adjust', 'cancel'],
  equipment: ['read', 'create', 'update', 'delete', 'export'],
  maintenance: ['read', 'create', 'update', 'delete', 'export'],
  contracts: ['read', 'create', 'update', 'delete', 'export'],
  invoices: ['read', 'create', 'update', 'delete', 'approve', 'export'],
  suppliers: ['read', 'create', 'update', 'delete', 'export'],
  expenses: ['read', 'create', 'update', 'delete', 'approve', 'export'],
  transactions: ['read', 'create', 'update', 'delete', 'export'],
  reports: ['read', 'export'],
  users: ['read', 'create', 'update', 'delete'],
  roles: ['read', 'update'],
  audit: ['read', 'export'],
  backups: ['read', 'create', 'update'],
  settings: ['read', 'update'],
  inventory: ['read', 'create', 'update', 'delete', 'export', 'approve', 'cancel'],
  cheques: ['read', 'create', 'update', 'print', 'cancel'],
  import: ['read', 'create'],
  prices: ['read', 'create', 'update', 'delete'],
  forms: ['read', 'create', 'print'],
  statements:   ['read', 'export'],
  // Financial Center Phase 2 — reporting modules
  aging:        ['read', 'export'],
  gl:           ['read', 'export'],
  trialbalance: ['read', 'export'],
  journal:      ['read', 'export', 'reverse'],
  finreports:   ['read', 'export'],
  // Historical Financial Data Readiness — تجاوز قفل الفترة المحاسبية.
  // لا يُمنح لأي دور افتراضيًا (مدير النظام يتجاوز الـ RBAC أصلًا)؛ يُمنح يدويًا من شاشة الأدوار.
  financial:    ['overrideLock'],
  // financialdashboard is seeded separately (compound module name)
  integrations:      ['read', 'configure', 'run'],
  payrollBankImport:    ['read', 'create', 'export'],
  bankStatementImport:  ['read', 'create', 'export', 'reconcile', 'delete'],
  expirations:          ['read', 'export'],
  attachments:          ['read', 'create', 'delete'],
  // تحليل الشغل والعمولة — أداة تحليل داخلية. لا `approve` ولا `post`: لا سير
  // موافقات ولا ترحيل محاسبي أصلًا، فمفتاح اعتماد هنا يوهم بأثر لا وجود له.
  workAnalysis:         ['read', 'create', 'update', 'delete', 'export', 'print'],
  // محرك الخطابات — هوية المستند ودورة حياته.
  //   register / cancel مفصولتان عمدًا عن create/update: هما الإجراءان الوحيدان
  //   اللذان لا رجعة فيهما (حرق رقم مرجعي دائم، وسحب مستند صادر)، فتفويض شخص
  //   بكتابة المسودات يجب ألّا يفوّضه بأيّهما.
  //   delete موجودة لأن حذف **المسودات** مسموح — والخدمة ترفض حذف أي خطاب يحمل
  //   رقمًا مرجعيًا مهما كانت الصلاحية الممنوحة.
  //   لا `print`: الطباعة وتصدير PDF من حزم لاحقة، ومفتاح صلاحية بلا مسار خلفه
  //   يظهر في شاشة الأدوار كقدرة لا تفعل شيئًا.
  letters:              ['read', 'create', 'update', 'delete', 'register', 'archive', 'cancel'],
  // مستحقات الموظف الشهرية — وحدة مستقلة عن الرواتب.
  //   `approve` حالة تنظيمية لا قفل: من يملكها يعتمد الحسبة، ومن يملك `update` يظلّ
  //   قادرًا على تعديلها بعد الاعتماد. لا مفتاح «إعادة فتح» لأنه لا يوجد قفل يُفتح.
  //   `delete` موجود لأن حذف حسبة معتمدة مسموح صراحةً في تصميم الوحدة.
  //   `print` يحرس مسارَي بيانات الطباعة (الكشف المختصر والتقرير التفصيلي).
  employeeCompensation: ['read', 'create', 'update', 'delete', 'approve', 'print'],
  // جاهزية XBRL — أقل مجموعة ممكنة، ثلاثة مفاتيح لا أكثر:
  //   read     — مطالعة الجاهزية والربط ونتائج التحقق واللقطات.
  //   manage   — إنشاء/تعديل/حذف التصنيفات والمفاهيم والربط وسياق التقرير.
  //   snapshot — إنشاء لقطة إصدار مالي. مفصول عن `manage` لأنه الإجراء الوحيد الذي
  //              لا رجعة فيه هنا: اللقطة لا تُعدَّل ولا تُحذف بأي مسار.
  // لا `export`: لا يوجد تصدير رسمي في هذه المرحلة أصلًا، ومفتاح بلا مسار خلفه
  // يظهر في شاشة الأدوار كقدرة لا تفعل شيئًا.
  xbrl: ['read', 'manage', 'snapshot'],
};

const ACTION_AR: Record<string, string> = {
  read: 'عرض',
  create: 'إضافة',
  update: 'تعديل',
  delete: 'حذف',
  approve: 'اعتماد',
  export: 'تصدير',
  pay: 'صرف',
  generate: 'توليد',
  payslip: 'قسيمة راتب',
  adjust: 'تسوية',
  cancel:    'إلغاء',
  print:     'طباعة',
  configure: 'ضبط الإعدادات',
  run:       'تشغيل',
  reconcile: 'مطابقة',
  overrideLock: 'تجاوز قفل الفترة',
  reverse:   'عكس قيد',
  register:  'تسجيل وإصدار رقم مرجعي',
  archive:   'أرشفة',
  manage:    'إدارة',
  snapshot:  'إنشاء لقطة',
};

// مصفوفة صلاحيات كل دور (قائمة وحدات بصلاحية كاملة، أو مفاتيح محددة)
function keysForModules(modules: string[]): string[] {
  const keys: string[] = [];
  for (const m of modules) {
    for (const a of MODULE_ACTIONS[m] ?? []) keys.push(`${m}.${a}`);
  }
  return keys;
}

function readOnly(modules: string[]): string[] {
  return modules.filter((m) => MODULE_ACTIONS[m]?.includes('read')).map((m) => `${m}.read`);
}

async function main() {
  console.log('▶ بدء البيانات الأولية...');

  // 1) الصلاحيات
  const allPermissionKeys: { key: string; module: string; action: string; description: string }[] = [];
  for (const [module, actions] of Object.entries(MODULE_ACTIONS)) {
    for (const action of actions) {
      allPermissionKeys.push({
        key: `${module}.${action}`,
        module,
        action,
        description: `${ACTION_AR[action]} - ${module}`,
      });
    }
  }
  for (const p of allPermissionKeys) {
    await prisma.permission.upsert({ where: { key: p.key }, update: {}, create: p });
  }
  // financialdashboard.read uses a compound module name not in the MODULE_ACTIONS loop
  await prisma.permission.upsert({
    where:  { key: 'financialdashboard.read' },
    update: {},
    create: {
      key:         'financialdashboard.read',
      module:      'financialdashboard',
      action:      'read',
      description: 'عرض - لوحة التحكم المالية',
    },
  });
  console.log(`  ✓ ${allPermissionKeys.length + 1} صلاحية`);

  const permByKey = new Map(
    (await prisma.permission.findMany()).map((p) => [p.key, p.id]),
  );

  // 2) خريطة صلاحيات الأدوار
  const allKeys = allPermissionKeys.map((p) => p.key);
  const rolePermissionMap: Record<string, string[]> = {
    SYSTEM_ADMIN: allKeys,
    // financial.overrideLock مستثناة عمدًا: تجاوز فترة مقفلة قرار إداري صريح يُمنح يدويًا.
    GENERAL_MANAGER: allKeys.filter(
      (k) => !k.startsWith('users.') && k !== 'settings.update' && k !== 'financial.overrideLock',
    ),
    ACCOUNTANT: [
      ...keysForModules(['invoices', 'expenses', 'transactions', 'suppliers', 'reports', 'customers', 'cheques', 'statements']),
      ...keysForModules(['aging', 'gl', 'trialbalance', 'journal', 'finreports']),
      // جاهزية XBRL — المحاسب هو مالك إعداد التقارير المالية، فله المفاتيح الثلاثة.
      // لا أثر محاسبي لأيٍّ منها: الوحدة لا تكتب خارج جداول `xbrl_*`.
      ...keysForModules(['xbrl']),
      ...readOnly(['dashboard', 'contracts', 'employees', 'equipment', 'payroll', 'audit']),
      'forms.read',
      'forms.print',
      'payroll.export',
      'payroll.pay',
      'payroll.payslip',
      'inventory.read',
      'inventory.export',
      'prices.read',
      // المحاسب يقرأ التحليل ويصدّره/يطبعه، ولا ينشئه: الأداة تشغيلية لا محاسبية.
      'workAnalysis.read',
      'workAnalysis.export',
      'workAnalysis.print',
      // المحاسب يطالع مستحقات الموظف ويطبعها، ولا ينشئها ولا يعتمدها: الوحدة تشغيلية
      // بيد الموارد البشرية، ولا تُرحَّل إلى المحاسبة أصلًا.
      'employeeCompensation.read',
      'employeeCompensation.print',
      'import.read',
      'import.create',
      'financialdashboard.read',
      'integrations.read',
      'integrations.run',
      'payrollBankImport.read',
      'payrollBankImport.create',
      'payrollBankImport.export',
      'bankStatementImport.read',
      'bankStatementImport.create',
      'bankStatementImport.export',
      'bankStatementImport.reconcile',
      'bankStatementImport.delete',
      'expirations.read',
      'attachments.read',
      'attachments.create',
      'attachments.delete',
    ],
    PROJECT_MANAGER: [
      // تحليل الشغل والعمولة صلاحية كاملة: مالك القرار التسعيري هو من يحلّل الهامش
      // قبل إصدار الفاتورة.
      ...keysForModules(['contracts', 'prices', 'reports', 'workAnalysis']),
      ...readOnly(['dashboard', 'customers', 'equipment', 'invoices', 'expenses', 'suppliers']),
      'inventory.read',
      'forms.read',
      'statements.read',
      'aging.read',
      'financialdashboard.read',
      'integrations.read',
      'payrollBankImport.read',
      'bankStatementImport.read',
      'expirations.read',
      'attachments.read',
      'attachments.create',
    ],
    EQUIPMENT_MANAGER: [
      ...keysForModules(['equipment', 'maintenance', 'reports']),
      'inventory.read',
      'inventory.create',
      'inventory.update',
      'inventory.delete',
      'inventory.approve',
      'inventory.export',
      ...readOnly(['dashboard', 'contracts', 'suppliers']),
      'forms.read',
      'expirations.read',
      'attachments.read',
      'attachments.create',
    ],
    HR_MANAGER: [
      // مسؤول الموارد البشرية هو مالك وحدة مستحقات الموظف الشهرية — صلاحية كاملة.
      ...keysForModules(['employees', 'attendance', 'payroll', 'reports', 'forms', 'employeeCompensation']),
      ...readOnly(['dashboard']),
      'import.read',
      'import.create',
      'payrollBankImport.read',
      'payrollBankImport.create',
      'payrollBankImport.export',
      'expirations.read',
      'attachments.read',
      'attachments.create',
      'attachments.delete',
    ],
    STANDARD_USER: [
      ...readOnly(['dashboard', 'customers', 'contracts', 'equipment', 'prices']),
      'statements.read',
      'attachments.read',
    ],
  };

  // 3) إنشاء الأدوار + ربط الصلاحيات
  for (const [name, displayName] of Object.entries(ROLE_DISPLAY)) {
    const role = await prisma.role.upsert({
      where: { name },
      update: { displayName, isSystem: true },
      create: { name, displayName, isSystem: true, description: displayName },
    });

    const keys = [...new Set(rolePermissionMap[name] ?? [])];
    for (const key of keys) {
      const permissionId = permByKey.get(key);
      if (!permissionId) continue;
      await prisma.rolePermission.upsert({
        where: { roleId_permissionId: { roleId: role.id, permissionId } },
        update: {},
        create: { roleId: role.id, permissionId },
      });
    }
    console.log(`  ✓ دور: ${displayName} (${keys.length} صلاحية)`);
  }

  // 4) مدير النظام الافتراضي
  const adminRole = await prisma.role.findUniqueOrThrow({ where: { name: ROLES.SYSTEM_ADMIN } });
  const existingAdmin = await prisma.user.findUnique({ where: { username: 'admin' } });
  if (!existingAdmin) {
    await prisma.user.create({
      data: {
        username: 'admin',
        passwordHash: await bcrypt.hash('Admin@123', 10),
        fullName: 'مدير النظام',
        roleId: adminRole.id,
        isActive: true,
      },
    });
    console.log('  ✓ مستخدم افتراضي: admin / Admin@123  (غيّر كلمة المرور فورًا)');
  }

  // 5) إعدادات الشركة
  const settings = [
    { key: 'company.name', value: 'شركة المنار الدولية لإنشاء وإصلاح الطرق والشوارع والأرصفة ومستلزمات الطرق ذ.م.م', group: 'company' },
    { key: 'company.country', value: 'الكويت', group: 'company' },
    { key: 'company.phone', value: '', group: 'company' },
    { key: 'company.address', value: '', group: 'company' },
    // الشركة في الكويت ولا يوجد نظام ضريبي — العملة دينار كويتي
    { key: 'finance.taxEnabled', value: 'false', group: 'finance' },
    { key: 'finance.taxRate', value: '0', group: 'finance' },
    { key: 'finance.currency', value: 'KWD', group: 'finance' },
    { key: 'finance.currencyLabel', value: 'د.ك', group: 'finance' },
    { key: 'finance.decimals', value: '3', group: 'finance' },
    { key: 'backup.autoEnabled', value: 'true', group: 'backup' },
    { key: 'backup.cron', value: '0 2 * * *', group: 'backup' },
  ];
  for (const s of settings) {
    await prisma.setting.upsert({ where: { key: s.key }, update: {}, create: s });
  }
  console.log(`  ✓ ${settings.length} إعداد`);

  // 6) دليل الحسابات الأساسي (Chart of Accounts) — مطلوب لترحيل القيد المزدوج
  for (const acc of SYSTEM_ACCOUNTS) {
    await prisma.account.upsert({
      where: { code: acc.code },
      update: {},
      create: { code: acc.code, name: acc.name, type: acc.type, normalBalance: acc.normalBalance, isActive: true },
    });
  }
  console.log(`  ✓ ${SYSTEM_ACCOUNTS.length} حساب في دليل الحسابات`);

  console.log('✅ اكتملت البيانات الأولية.');
}

main()
  .catch((e) => {
    console.error('✖ فشلت البيانات الأولية:', e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
