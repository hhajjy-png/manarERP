export type FormCategory = 'hr' | 'ops';

export interface FormCard {
  key: string;
  route: string;
  /**
   * مفتاح i18n الوحيد لعنوان هذا النموذج — يُحلّ عبر t(titleKey) في كل مكان يعرض
   * العنوان (بطاقة مركز النماذج، قائمة «نماذج الموظف»، ومثاليًا نفس المفتاح الذي
   * تستخدمه شاشة النموذج نفسها لعنوانها وlabel المستند). هذا هو مصدر الحقيقة
   * الوحيد لهوية العنوان؛ القيمة الفعلية المترجَمة (عربي/إنجليزي) تعيش في
   * `frontend/src/lib/i18n.ts` حصرًا — لا نص عنوان حرفي في هذا الملف أو في أي
   * مستهلك له (انظر `formsRegistryTranslationAudit.test.ts`).
   */
  titleKey: string;
  description: string;
  descriptionEn: string;
  icon: string;
  category: FormCategory;
  requiresEmployee?: boolean;
  /**
   * الموظف **اختياري**: يمكن الطباعة بموظف مختار (فتُملأ بياناته تلقائيًا) أو بلا موظف
   * إطلاقًا — فتفتح الشاشة على مُحدِّد النمط: «موظف موجود» أو «موظف جديد (إدخال يدوي)».
   * عقد العمل هو الوحيد الذي يملك مسار إدخال يدوي **للطباعة فقط** (لا يُنشئ سجل موظف).
   */
  employeeOptional?: boolean;
}

/**
 * سجل النماذج الإدارية الوحيد — مصدر الحقيقة لصفحة النماذج (`Forms.tsx`) **وقائمة
 * «نماذج الموظف»** المنبثقة من درج الموظف. أي نموذج جديد يُضاف هنا يظهر تلقائيًا في
 * كليهما؛ لا تُكرّر هذه البيانات في أي مكان آخر.
 */
export const FORM_CARDS: FormCard[] = [
  { key: 'salary-certificate', route: 'salary-certificate', titleKey: 'page.salaryCert.title', description: 'شهادة رسمية تُثبت راتب الموظف الشهري للجهات الطالبة.', descriptionEn: 'An official certificate confirming the employee’s monthly salary for requesting parties.', icon: '📋', category: 'hr' },
  { key: 'to-whom-it-may-concern', route: 'to-whom-it-may-concern', titleKey: 'page.towhom.title', description: 'شهادة عمل عامة لتقديمها للجهات الخارجية.', descriptionEn: 'A general employment certificate for submission to external parties.', icon: '📄', category: 'hr' },
  { key: 'leave-request', route: 'leave-request', titleKey: 'page.leaveReq.title', description: 'نموذج طلب إجازة سنوية أو مرضية أو طارئة.', descriptionEn: 'A form for requesting annual, sick, or emergency leave.', icon: '🗓️', category: 'hr' },
  { key: 'return-to-work', route: 'return-to-work', titleKey: 'page.returnToWork.title', description: 'إشعار رسمي بعودة الموظف من الإجازة.', descriptionEn: 'An official notice of the employee’s return from leave.', icon: '↩️', category: 'hr' },
  { key: 'salary-advance', route: 'salary-advance', titleKey: 'page.salaryAdv.title', description: 'نموذج طلب سلفة مالية يُخصم من الراتب الشهري.', descriptionEn: 'A form for requesting a salary advance deducted from the monthly salary.', icon: '💰', category: 'hr' },
  { key: 'resignation', route: 'resignation', titleKey: 'page.resignation.title', description: 'نموذج استقالة رسمي مع تحديد آخر يوم عمل.', descriptionEn: 'An official resignation form specifying the last working day.', icon: '✉️', category: 'hr' },
  { key: 'employee-warning', route: 'employee-warning', titleKey: 'page.warning.title', description: 'نموذج إنذار رسمي للموظف يُحدد درجة المخالفة وسببها.', descriptionEn: 'An official warning notice for the employee specifying the violation level and reason.', icon: '⚠️', category: 'hr' },
  { key: 'performance-evaluation', route: 'performance-evaluation', titleKey: 'page.perfEval.title', description: 'نموذج تقييم الأداء السنوي بمعايير موضوعية.', descriptionEn: 'An annual performance evaluation form with objective criteria.', icon: '⭐', category: 'hr' },
  { key: 'employment-contract', route: 'employment-contract', titleKey: 'page.contract.doc_title', description: 'نموذج عقد العمل الرسمي الصادر عن الهيئة العامة للقوى العاملة، ثنائي اللغة (عربي / إنجليزي). يمكن طباعته لموظف مسجّل أو لموظف جديد بإدخال يدوي (للطباعة فقط).', descriptionEn: 'The official bilingual (Arabic/English) employment contract form issued by the Public Authority for Manpower. It can be printed for a registered employee or a new employee via manual entry (print only).', icon: '📝', category: 'hr', employeeOptional: true },
  { key: 'quotation', route: 'quotation', titleKey: 'page.quotation.title', description: 'نموذج عرض سعر رسمي للعملاء يتضمن جدول الأسعار والشروط.', descriptionEn: 'An official price quotation form for clients, including a price schedule and terms.', icon: '📊', category: 'ops', requiresEmployee: false },
  { key: 'purchase-request', route: 'purchase-request', titleKey: 'page.purchaseReq.title', description: 'نموذج طلب شراء داخلي مع جدول المواد والكميات وبيانات الاعتماد.', descriptionEn: 'An internal purchase request form with a materials/quantities table and approval details.', icon: '🛒', category: 'ops', requiresEmployee: false },
  { key: 'receipt-voucher', route: 'receipt-voucher', titleKey: 'voucher.receipt.title', description: 'سند قبض رسمي لتوثيق المبالغ المستلمة نقداً أو بشيك أو تحويل بنكي.', descriptionEn: 'An official receipt voucher documenting amounts received in cash, cheque, or bank transfer.', icon: '🧾', category: 'ops', requiresEmployee: false },
];

/** النماذج المرتبطة بموظف — أساس قائمة «نماذج الموظف» المنبثقة من الدرج. */
export const EMPLOYEE_FORM_CARDS: FormCard[] = FORM_CARDS.filter((c) => c.requiresEmployee !== false);
