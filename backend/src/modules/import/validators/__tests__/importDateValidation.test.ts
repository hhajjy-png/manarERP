import { describe, it, expect } from 'vitest';
import { validateEmployeeRow } from '../employees';
import { validateEquipmentRow } from '../equipment';

/**
 * Project-Wide Date Display, Export & Import Consistency Pack v1 — الاستيراد.
 *
 * العيب المُصحَّح: تواريخ الموظفين والمعدات كانت تُحلَّل بـ
 * `parseImportDate(v) ?? undefined` — فأي قيمة يكتبها المستخدم وتفشل في التحليل
 * تُسقَط **بصمت**، ويُستورَد الصفّ «صالحًا» وقد ضاع منه تاريخ. نفس الحالة في
 * العقود/المصروفات/الفواتير كانت تُنتج خطأ صفّ منذ البداية — فالتصحيح توحيدٌ على
 * الآلية القائمة، لا آلية جديدة.
 *
 * ما **لم** يتغيّر عمدًا: مجموعة الصيغ المقبولة. `parseImportDate` يقبل
 * `YYYY-MM-DD` والرقم التسلسلي لـExcel و`DD/MM/YYYY` (عرف الكويت والخليج،
 * موثّق ومغطّى باختبارات في `shared/utils/__tests__/dateParse.test.ts`). تضييق
 * ذلك كان سيكسر ملفّات استيراد إنتاجية قائمة — انظر تقرير التوافق.
 */

const EMPLOYEE_BASE = { code: 'E-001', fullName: 'أحمد' };
const EQUIPMENT_BASE = { code: 'EQ-001', type: 'قلاب' };

const employeeRow = (extra: Record<string, unknown>) =>
  validateEmployeeRow({ ...EMPLOYEE_BASE, ...extra });

const equipmentRow = (extra: Record<string, unknown>) =>
  validateEquipmentRow({ ...EQUIPMENT_BASE, ...extra });

describe('J) الصيغة القانونية YYYY-MM-DD مقبولة كما هي', () => {
  it('موظف — hireDate بصيغة قانونية يُقبَل ويصل كتاريخ صحيح', () => {
    const r = employeeRow({ hireDate: '2026-08-02' });
    expect(r.valid).toBe(true);
    expect(r.normalized?.hireDate?.getFullYear()).toBe(2026);
    expect(r.normalized?.hireDate?.getMonth()).toBe(7); // أغسطس (0-based)
    expect(r.normalized?.hireDate?.getDate()).toBe(2);
  });

  it('موظف — 2026-02-08 يبقى 8 فبراير، بلا انقلاب إلى أغسطس', () => {
    const r = employeeRow({ birthDate: '2026-02-08' });
    expect(r.valid).toBe(true);
    expect(r.normalized?.birthDate?.getMonth()).toBe(1); // فبراير
    expect(r.normalized?.birthDate?.getDate()).toBe(8);
  });

  it('معدة — registrationExpiry بصيغة قانونية يُقبَل', () => {
    const r = equipmentRow({ registrationExpiry: '2028-02-29' }); // يوم كبيس
    expect(r.valid).toBe(true);
    expect(r.normalized?.registrationExpiry?.getDate()).toBe(29);
  });
});

describe('L) تاريخ مستحيل أو غير قابل للتحليل → خطأ صفّ، لا إسقاط صامت', () => {
  it('موظف — 2026-02-30 يُرفض الصفّ برسالة تذكر الحقل والصيغة', () => {
    const r = employeeRow({ hireDate: '2026-02-30' });
    expect(r.valid).toBe(false);
    expect(r.normalized).toBeNull();
    expect(r.errors.join(' ')).toContain('hireDate');
    expect(r.errors.join(' ')).toContain('YYYY-MM-DD');
  });

  it('موظف — نص لا يمتّ للتاريخ بصلة يُرفض بدل أن يُهمَل', () => {
    const r = employeeRow({ passportExpiry: 'غير معروف' });
    expect(r.valid).toBe(false);
    expect(r.errors.join(' ')).toContain('passportExpiry');
  });

  it('موظف — كل تاريخ فاسد يُبلَّغ عنه على حدة (لا يقف عند الأول)', () => {
    const r = employeeRow({ passportExpiry: 'x', residencyExpiry: 'y', hireDate: 'z' });
    expect(r.valid).toBe(false);
    const joined = r.errors.join(' ');
    for (const key of ['passportExpiry', 'residencyExpiry', 'hireDate']) {
      expect(joined).toContain(key);
    }
  });

  it('معدة — تاريخ فاسد يُرفض الصفّ (كان يُستورَد «صالحًا» بتاريخ مفقود)', () => {
    const r = equipmentRow({ purchaseDate: '2026-04-31' }); // أبريل 30 يومًا
    expect(r.valid).toBe(false);
    expect(r.errors.join(' ')).toContain('purchaseDate');
  });

  it('الخلية الفارغة تبقى «غير مذكورة» — لا خطأ ولا قيمة', () => {
    const r = employeeRow({ hireDate: '', birthDate: null });
    expect(r.valid).toBe(true);
    expect(r.normalized?.hireDate).toBeUndefined();
    expect(r.normalized?.birthDate).toBeUndefined();
  });

  it('الصفّ الخالي من أي عمود تاريخ يبقى صالحًا (ملفّ قديم)', () => {
    expect(employeeRow({}).valid).toBe(true);
    expect(equipmentRow({}).valid).toBe(true);
  });
});

describe('M) الصيغ الخارجية المدعومة فعليًا لم تُكسَر', () => {
  it('الرقم التسلسلي لـExcel (خلية تاريخ أصلية) ما يزال مدعومًا', () => {
    // 45876 = 2025-08-02 في تقويم Excel 1900.
    const r = employeeRow({ hireDate: 45876 });
    expect(r.valid).toBe(true);
    expect(r.normalized?.hireDate).toBeInstanceOf(Date);
  });

  it('DD/MM/YYYY يبقى مقبولًا — عقد إنتاجي موثّق، لم تمسّه هذه الحزمة', () => {
    const r = employeeRow({ hireDate: '02/08/2026' });
    expect(r.valid).toBe(true);
    // يُفسَّر يومًا-أولًا (2 أغسطس)، وهو السلوك الموثّق والمغطّى في dateParse.test.ts.
    expect(r.normalized?.hireDate?.getMonth()).toBe(7);
    expect(r.normalized?.hireDate?.getDate()).toBe(2);
  });
});
