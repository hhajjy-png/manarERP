import { describe, it, expect } from 'vitest';
import { validateEquipmentRow } from '../equipment';

/**
 * Equipment Data Pack v1 — الحقول الجديدة في الاستيراد.
 * العقد: الأعمدة الأربعة اختيارية بالكامل، ومفاتيح الأعمدة القديمة لم تتغيّر —
 * فملفّ استيراد قديم (بلا الأعمدة الجديدة) يمرّ كما كان تمامًا.
 */

const OLD_FILE_ROW = {
  code: 'EQ-1',
  type: 'قلاب',
  ownerName: 'المنار',
  driverName: 'أحمد',
  plateNumber: '12345',
  registrationExpiry: '2027-01-06',
  status: 'WORKING',
};

describe('validateEquipmentRow — الأعمدة الجديدة', () => {
  it('يستوعب رقم القاعدة والصنع وسنة الصنع واللون', () => {
    const { valid, normalized } = validateEquipmentRow({
      ...OLD_FILE_ROW,
      chassisNumber: ' JT123456789 ',
      manufacturer: 'Toyota',
      manufactureYear: '2019',
      color: 'أبيض',
    });
    expect(valid).toBe(true);
    expect(normalized).toMatchObject({
      chassisNumber: 'JT123456789', // يُشذَّب كبقية النصوص
      manufacturer: 'Toyota',
      manufactureYear: 2019,
      color: 'أبيض',
    });
  });

  it('ملفّ قديم بلا الأعمدة الجديدة: صالح، والقيم غير محدَّدة (لا فراغات مصطنعة)', () => {
    const { valid, normalized } = validateEquipmentRow(OLD_FILE_ROW);
    expect(valid).toBe(true);
    expect(normalized?.chassisNumber).toBeUndefined();
    expect(normalized?.color).toBeUndefined();
    // الحقول القديمة كما كانت
    expect(normalized).toMatchObject({ code: 'EQ-1', type: 'قلاب', plateNumber: '12345' });
  });

  it('خلايا فارغة تُعامَل كغياب لا كنصّ فارغ', () => {
    const { normalized } = validateEquipmentRow({ ...OLD_FILE_ROW, chassisNumber: '', color: '   ' });
    expect(normalized?.chassisNumber).toBeUndefined();
    expect(normalized?.color).toBe(''); // مسافات فقط ⇒ تُشذَّب إلى نصّ فارغ
  });

  it('«الشكل» ما زال يُقرأ من المفتاح `type` نفسه، وغيابه خطأ كما كان', () => {
    const { valid, errors } = validateEquipmentRow({ code: 'EQ-2' });
    expect(valid).toBe(false);
    expect(errors.join(' ')).toContain('type');
  });
});
