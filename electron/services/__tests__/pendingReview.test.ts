import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'fs';
import os from 'os';
import path from 'path';
import {
  markPendingReview,
  isPendingReview,
  readPendingReview,
  clearPendingReview,
  pendingReviewPath,
  PENDING_REVIEW_FILENAME,
} from '../pendingReview';
import { isSyncTempName } from '../syncTempCleanup';

/**
 * Data Safety Pack v2 — F-05 · علامة «قيد المراجعة».
 *
 * الضمانة المركزية التي تحرسها هذه الاختبارات: **الدلالة هي وجود الملف لا محتواه.**
 * ملف مبتور أو غير قابل للتحليل يجب أن يبقى وسمًا صالحًا — وإلا عاد الاتجاه غير
 * الآمن الذي دفعنا أصلًا إلى عدم وضع الحقل داخل `sync-metadata.json`.
 */

let tmpRoot: string;
let dataDir: string;

beforeEach(() => {
  tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'manar-pending-'));
  dataDir = path.join(tmpRoot, 'data');
  fs.mkdirSync(dataDir, { recursive: true });
});

afterEach(() => {
  fs.rmSync(tmpRoot, { recursive: true, force: true });
});

describe('markPendingReview / isPendingReview', () => {
  it('لا وسم على مجلد بيانات نظيف', () => {
    expect(isPendingReview(dataDir)).toBe(false);
  });

  it('يضع الوسم ويُبلغ بالنجاح', () => {
    expect(markPendingReview(dataDir, { source: 'RESTORE', detail: 'نسخة-قديمة.db' })).toBe(true);
    expect(isPendingReview(dataDir)).toBe(true);
  });

  it('ينشئ مجلد البيانات إن لم يكن موجودًا', () => {
    const fresh = path.join(tmpRoot, 'جديد');
    expect(markPendingReview(fresh, { source: 'RESTORE' })).toBe(true);
    expect(isPendingReview(fresh)).toBe(true);
  });

  it('يحفظ التفاصيل مع طابع زمني', () => {
    markPendingReview(dataDir, { source: 'RESTORE', detail: 'manar-backup-2026-08-05.db' });
    const mark = readPendingReview(dataDir);
    expect(mark?.source).toBe('RESTORE');
    expect(mark?.detail).toBe('manar-backup-2026-08-05.db');
    expect(Number.isFinite(Date.parse(mark!.since))).toBe(true);
  });

  it('وسم ثانٍ يستبدل الأول بلا فشل — استعادتان متتاليتان حالة مشروعة', () => {
    markPendingReview(dataDir, { source: 'RESTORE', detail: 'الأولى.db' });
    expect(markPendingReview(dataDir, { source: 'RESTORE', detail: 'الثانية.db' })).toBe(true);
    expect(readPendingReview(dataDir)?.detail).toBe('الثانية.db');
  });
});

describe('متانة الوسم أمام التلف — جوهر اختيار التصميم', () => {
  it('ملف مبتور يبقى وسمًا صالحًا (الوجود هو الإشارة)', () => {
    markPendingReview(dataDir, { source: 'RESTORE' });
    fs.writeFileSync(pendingReviewPath(dataDir), '{"since": "2026-', 'utf8'); // كتابة مقطوعة

    // هذه هي الحالة التي كان حقلٌ داخل `sync-metadata.json` سيسقط فيها صامتًا
    // فتستأنف المزامنة التلقائية — وهو الاتجاه غير الآمن بالضبط.
    expect(isPendingReview(dataDir)).toBe(true);
    expect(readPendingReview(dataDir)).toBeNull(); // التفاصيل تسقط، لا الوسم
  });

  it('ملف فارغ تمامًا يبقى وسمًا صالحًا', () => {
    fs.writeFileSync(pendingReviewPath(dataDir), '', 'utf8');
    expect(isPendingReview(dataDir)).toBe(true);
  });

  it('محتوى بمصدر غير معروف لا يُقرأ كتفاصيل لكنه يبقى وسمًا', () => {
    fs.writeFileSync(
      pendingReviewPath(dataDir),
      JSON.stringify({ since: '2026-08-13T00:00:00.000Z', source: 'شيء آخر' }),
      'utf8',
    );
    expect(isPendingReview(dataDir)).toBe(true);
    expect(readPendingReview(dataDir)).toBeNull();
  });
});

describe('clearPendingReview', () => {
  it('يرفع الوسم', () => {
    markPendingReview(dataDir, { source: 'RESTORE' });
    clearPendingReview(dataDir);
    expect(isPendingReview(dataDir)).toBe(false);
  });

  it('لا يرمي حين لا يوجد وسم أصلًا (يُستدعى مع كل عملية صريحة)', () => {
    expect(() => clearPendingReview(dataDir)).not.toThrow();
    expect(() => clearPendingReview(path.join(tmpRoot, 'غير-موجود'))).not.toThrow();
  });
});

describe('تكامل مع كنس الملفات المؤقتة', () => {
  it('اسم ملف الوسم لا يطابق أي نمط يمسحه الكنس التلقائي', () => {
    // لو طابق `sync-tmp-*.db` لحذفه الكنس عند بدء التشغيل التالي، فتستأنف
    // المزامنة التلقائية على قاعدة مستعادة بلا مراجعة.
    expect(isSyncTempName(PENDING_REVIEW_FILENAME)).toBe(false);
  });
});
