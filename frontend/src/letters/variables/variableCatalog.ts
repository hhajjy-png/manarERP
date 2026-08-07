/**
 * Letter Engine — the Variable Catalogue (Professional Document Automation v1).
 *
 * ══════════════════════════════════════════════════════════════════════════
 *  A VARIABLE IS A NAMED READING OF DATA THE ERP ALREADY OWNS.
 * ══════════════════════════════════════════════════════════════════════════
 * It is not a formula, not an expression and not a script. Each entry below names a
 * value, says where that value comes from, and says whether the letter must first be
 * BOUND to a record for it to have one. There is no arithmetic and no concatenation —
 * the moment a variable could compute, the catalogue would become a programming
 * language expressed in JSON, which is the failure mode the template registry's own
 * header warns about.
 *
 * ── THE BINDING PROBLEM, AND WHY IT IS SOLVED IN THE DOCUMENT ────────────
 * `Letter` has no foreign key to Employee, Contract or Project — eleven of the
 * eighteen variables therefore have no source until the author says WHICH employee
 * this letter is about. That choice is stored in the document's own JSON (see
 * `variables/bindingTypes`), which is why the whole engine needs no schema change: a
 * binding is document content, exactly as the recipient's name is.
 *
 * ── RESOLUTION IS LIVE ON A DRAFT AND FROZEN AT REGISTRATION ─────────────
 * While a letter is a draft, `{{Salary}}` shows today's salary. At registration the
 * resolved values are frozen into the snapshot alongside the barcode payload and the
 * signature image — for exactly the same reason. A pay rise must never rewrite a
 * letter that has already been issued and handed over.
 */

/** Which panel section a variable is browsed under. */
export type VariableCategory =
  | 'company'
  | 'employee'
  | 'contract'
  | 'project'
  | 'finance'
  | 'hr'
  | 'dates'
  | 'system';

export const VARIABLE_CATEGORIES: readonly VariableCategory[] = [
  'company',
  'employee',
  'contract',
  'project',
  'finance',
  'hr',
  'dates',
  'system',
];

export const VARIABLE_CATEGORY_LABELS_AR: Readonly<Record<VariableCategory, string>> = {
  company: 'الشركة',
  employee: 'الموظف',
  contract: 'العقود',
  project: 'المشاريع',
  finance: 'المالية',
  hr: 'الموارد البشرية',
  dates: 'التواريخ',
  system: 'النظام',
};

export const VARIABLE_CATEGORY_ICONS: Readonly<Record<VariableCategory, string>> = {
  company: 'apartment',
  employee: 'badge',
  contract: 'description',
  project: 'construction',
  finance: 'payments',
  hr: 'groups',
  dates: 'event',
  system: 'settings',
};

/**
 * What a variable needs bound before it can resolve.
 *
 * `none` resolves from the company settings, the session or the clock — always
 * available. The other three need the author to pick a record.
 */
export type VariableBindingKind = 'none' | 'employee' | 'contract' | 'project';

export interface VariableDescriptor {
  /** The token name, without braces. Case-sensitive. */
  readonly name: string;
  readonly category: VariableCategory;
  readonly labelAr: string;
  /** Shown in the browser so an author knows what they are inserting. */
  readonly descriptionAr: string;
  readonly requires: VariableBindingKind;
  /** What the browser shows as an example before anything is bound. */
  readonly sampleAr: string;
  /**
   * Why this variable cannot resolve in THIS ERP, if it cannot.
   *
   * ══════════════════════════════════════════════════════════════════════════
   *  A VARIABLE WITH NO DATA SOURCE IS DECLARED, DISABLED AND EXPLAINED —
   *  NEVER SILENTLY OFFERED.
   * ══════════════════════════════════════════════════════════════════════════
   * Two of the eighteen the specification asked for have nothing behind them: the
   * `Employee` model carries no manager field, and there is no `Project` model at all
   * (only `ProjectPrice`, which is a price list). Offering them anyway would let an
   * author insert a token that can NEVER resolve, which E18 would then block the print
   * over — a trap with no way out.
   *
   * So they are listed, greyed, and carry the reason. The day the ERP gains an
   * `Employee.managerId` or a `Project` model, deleting one line here turns the
   * variable on with no other change.
   */
  readonly unavailableReasonAr?: string;
}

/**
 * The eighteen variables, in browse order within each category.
 *
 * A CLOSED set. A template cannot introduce one and a document cannot invent one — the
 * insert picker only ever offers a name from this list.
 *
 * Nothing validates a token once it is in the document, though (Form Editor UX
 * Rebuild v2 deleted `E18_unresolvedVariable` and `E19_unknownVariable` along with
 * every other blocking rule): a document containing `{{Bogus}}`, or `{{Salary}}` with
 * no employee bound, prints exactly as typed. `resolveTokens` (`variableSyntax.ts`)
 * substitutes what it can and leaves the rest as literal text — the editor assists, it
 * does not refuse.
 */
export const VARIABLES = {
  /* ── Company — from the existing company settings ────────────────────── */
  Company: {
    name: 'Company',
    category: 'company',
    labelAr: 'اسم الشركة',
    descriptionAr: 'الاسم الرسمي للشركة كما هو مسجَّل في إعدادات النظام.',
    requires: 'none',
    sampleAr: 'شركة المنار الدولية',
  },
  Department: {
    name: 'Department',
    category: 'company',
    labelAr: 'الإدارة',
    descriptionAr: 'إدارة الموظف المرتبط بالخطاب.',
    requires: 'employee',
    sampleAr: 'الإدارة الهندسية',
  },
  Address: {
    name: 'Address',
    category: 'company',
    labelAr: 'عنوان الشركة',
    descriptionAr: 'العنوان الرسمي للشركة من إعدادات النظام.',
    requires: 'none',
    sampleAr: 'الكويت — الشويخ الصناعية',
  },

  /* ── Employee — needs a bound employee ───────────────────────────────── */
  Employee: {
    name: 'Employee',
    category: 'employee',
    labelAr: 'اسم الموظف',
    descriptionAr: 'الاسم الكامل للموظف المرتبط بالخطاب.',
    requires: 'employee',
    sampleAr: 'أحمد محمد',
  },
  JobTitle: {
    name: 'JobTitle',
    category: 'employee',
    labelAr: 'المسمّى الوظيفي',
    descriptionAr: 'المسمّى الوظيفي المسجَّل للموظف.',
    requires: 'employee',
    sampleAr: 'مهندس موقع',
  },
  Nationality: {
    name: 'Nationality',
    category: 'employee',
    labelAr: 'الجنسية',
    descriptionAr: 'جنسية الموظف كما هي في ملفه.',
    requires: 'employee',
    sampleAr: 'كويتي',
  },
  CivilId: {
    name: 'CivilId',
    category: 'employee',
    labelAr: 'الرقم المدني',
    descriptionAr: 'الرقم المدني للموظف.',
    requires: 'employee',
    sampleAr: '290010112345',
  },
  Phone: {
    name: 'Phone',
    category: 'employee',
    labelAr: 'هاتف الموظف',
    descriptionAr: 'رقم هاتف الموظف المسجَّل.',
    requires: 'employee',
    sampleAr: '99887766',
  },
  Email: {
    name: 'Email',
    category: 'employee',
    labelAr: 'بريد الموظف',
    descriptionAr: 'البريد الإلكتروني للموظف.',
    requires: 'employee',
    sampleAr: 'name@example.com',
  },
  Manager: {
    name: 'Manager',
    category: 'hr',
    labelAr: 'المدير المباشر',
    descriptionAr: 'اسم المدير المباشر للموظف.',
    requires: 'employee',
    sampleAr: 'خالد العلي',
    unavailableReasonAr:
      'لا يحتوي ملف الموظف في النظام على حقل للمدير المباشر، فلا مصدر لهذه القيمة. ' +
      'يعمل هذا المتغيّر تلقائيًا عند إضافة الحقل إلى وحدة الموظفين.',
  },

  /* ── Finance ─────────────────────────────────────────────────────────── */
  Salary: {
    name: 'Salary',
    category: 'finance',
    labelAr: 'الراتب',
    descriptionAr: 'الراتب الأساسي للموظف بالدينار الكويتي، بثلاث منازل عشرية.',
    requires: 'employee',
    sampleAr: '1,250.000 د.ك',
  },

  /* ── Contracts and projects ──────────────────────────────────────────── */
  Contract: {
    name: 'Contract',
    category: 'contract',
    labelAr: 'رقم العقد',
    descriptionAr: 'الرقم المرجعي للعقد المرتبط بالخطاب.',
    requires: 'contract',
    sampleAr: 'CT-2026-018',
  },
  Project: {
    name: 'Project',
    category: 'project',
    labelAr: 'اسم المشروع',
    descriptionAr: 'اسم المشروع المرتبط بالخطاب.',
    requires: 'project',
    sampleAr: 'صيانة طرق منطقة الجهراء',
    unavailableReasonAr:
      'لا توجد وحدة «مشاريع» في النظام حاليًا — الموجود هو «أسعار المشاريع» وهي قائمة أسعار ' +
      'لا سجل مشروع. يعمل هذا المتغيّر تلقائيًا عند إضافة الوحدة.',
  },

  /* ── Dates — from the clock, always available ────────────────────────── */
  Today: {
    name: 'Today',
    category: 'dates',
    labelAr: 'تاريخ اليوم',
    descriptionAr: 'تاريخ اليوم بالتنسيق المعتمد في النظام.',
    requires: 'none',
    sampleAr: '2026-08-06',
  },
  CurrentDate: {
    name: 'CurrentDate',
    category: 'dates',
    labelAr: 'تاريخ الخطاب',
    descriptionAr: 'تاريخ إصدار الخطاب كما هو مُدخَل في قسم التاريخ — لا تاريخ اليوم.',
    requires: 'none',
    sampleAr: '2026-08-01',
  },
  CurrentTime: {
    name: 'CurrentTime',
    category: 'dates',
    labelAr: 'الوقت الحالي',
    descriptionAr: 'الوقت لحظة فتح الخطاب. يُجمَّد عند التسجيل.',
    requires: 'none',
    sampleAr: '14:35',
  },

  /* ── System ──────────────────────────────────────────────────────────── */
  Reference: {
    name: 'Reference',
    category: 'system',
    labelAr: 'الرقم المرجعي',
    descriptionAr: 'الرقم المرجعي الدائم للخطاب. لا يوجد قبل التسجيل.',
    requires: 'none',
    sampleAr: 'OL-2026-000123',
  },
  CurrentUser: {
    name: 'CurrentUser',
    category: 'system',
    labelAr: 'المستخدم الحالي',
    descriptionAr: 'اسم المستخدم الذي يحرّر الخطاب.',
    requires: 'none',
    sampleAr: 'مدير النظام',
  },
} as const satisfies Record<string, VariableDescriptor>;

export type VariableName = keyof typeof VARIABLES;

export const VARIABLE_NAMES = Object.keys(VARIABLES) as VariableName[];

/* ── Queries ────────────────────────────────────────────────────────────── */

/** A variable known at compile time. */
export function getVariable(name: VariableName): VariableDescriptor {
  return VARIABLES[name];
}

/**
 * Lookup by an UNTRUSTED name — one read out of a stored document.
 *
 * Own-property check rather than direct indexing, so a stored `"constructor"` cannot
 * reach the prototype chain and return a function that survives an `undefined` check
 * before failing on first property access. The same guard the template registry uses,
 * for the same reason.
 */
export function findVariable(name: string | null | undefined): VariableDescriptor | undefined {
  if (!name) return undefined;
  if (!Object.prototype.hasOwnProperty.call(VARIABLES, name)) return undefined;
  return (VARIABLES as Record<string, VariableDescriptor>)[name];
}

export function isVariableName(name: string | null | undefined): name is VariableName {
  return findVariable(name) !== undefined;
}

export function getAllVariables(): VariableDescriptor[] {
  return VARIABLE_NAMES.map((name) => VARIABLES[name]);
}

/** Can this variable ever resolve in this build? */
export function isVariableAvailable(variable: VariableDescriptor): boolean {
  return variable.unavailableReasonAr === undefined;
}

/**
 * Variables an author may actually insert.
 *
 * The browser lists every variable — an author should be able to see that
 * `{{Manager}}` exists and why it is greyed — but only these can be inserted, which is
 * what keeps E18 from becoming a trap with no way out.
 */
export function insertableVariables(): VariableDescriptor[] {
  return getAllVariables().filter(isVariableAvailable);
}

/** Variables in one category, in catalogue order. */
export function variablesInCategory(category: VariableCategory): VariableDescriptor[] {
  return getAllVariables().filter((variable) => variable.category === category);
}

/**
 * Match a search across name, label and description.
 *
 * Description is included deliberately: an author looking for "الرقم المدني" should
 * find `CivilId` without knowing the English token, and someone searching "تاريخ"
 * should find all three date variables rather than only the one whose label starts
 * with it.
 */
export function searchVariables(query: string): VariableDescriptor[] {
  const needle = query.trim().toLowerCase();
  if (needle.length === 0) return getAllVariables();
  return getAllVariables().filter(
    (variable) =>
      variable.name.toLowerCase().includes(needle) ||
      variable.labelAr.includes(needle) ||
      variable.descriptionAr.includes(needle),
  );
}

/** Which bindings a set of variables needs. Drives which pickers the browser shows. */
export function requiredBindings(names: readonly string[]): VariableBindingKind[] {
  const needed = new Set<VariableBindingKind>();
  for (const name of names) {
    const variable = findVariable(name);
    if (variable && variable.requires !== 'none') needed.add(variable.requires);
  }
  return [...needed];
}
