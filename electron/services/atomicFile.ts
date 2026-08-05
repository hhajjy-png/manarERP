import fs from 'fs';
import path from 'path';

/**
 * Production Hardening Pack v1 — P0-6
 * كتابة ذرّية للملفات الحسّاسة (write temp → fsync → rename).
 *
 * ── المشكلة التي يغلقها ────────────────────────────────────────────────────────
 *
 * `sync-metadata.json` و`gdrive-token.dat` كانا يُكتبان بـ`fs.writeFileSync` مباشرة
 * فوق الملف القائم. انقطاع كهرباء أو إغلاق قسري أثناء الكتابة يترك ملفًا **مبتورًا**:
 *
 *   • `sync-metadata.json` تالف ⇒ `loadMetadata` يبتلع الخطأ ويُعيد القيم الافتراضية
 *     ⇒ `lastSyncedHash = null` ⇒ القرار التالي يرى «تغيّر محلي **و** تغيّر سحابي»
 *     ⇒ **تعارض كاذب** يُعرض على المستخدم بلا سبب حقيقي.
 *   • `gdrive-token.dat` تالف ⇒ فقدان الاتصال بحساب Google بلا سبب مفهوم.
 *
 * ── الضمانة ────────────────────────────────────────────────────────────────────
 *
 * `rename` داخل نفس المجلد عملية ذرّية على مستوى نظام الملفات (NTFS عبر
 * `MoveFileEx`+`REPLACE_EXISTING`، وrename(2) على POSIX): القارئ يرى إما المحتوى
 * القديم كاملًا أو الجديد كاملًا — ولا شيء بينهما أبدًا. و`fsyncSync` قبل الاستبدال
 * يضمن أن بايتات المحتوى الجديد وصلت القرص فعلًا قبل أن يشير إليها الاسم النهائي،
 * فلا يُستبدل ملف سليم بمؤشّر إلى بيانات لم تُكتب بعد.
 *
 * الملف المؤقّت يعيش في **نفس المجلد** (شرط ذرّية `rename` — لا عبور أقراص)، وباسم
 * لا يطابق أي نمط يمسحه `syncTempCleanup` (`sync-tmp-*.db`) فلا يُحذف تحت الكتابة.
 */

let counter = 0;

function tempPathFor(filePath: string): string {
  counter += 1;
  const dir = path.dirname(filePath);
  const base = path.basename(filePath);
  return path.join(dir, `.${base}.atomic-${process.pid}-${counter}.tmp`);
}

/**
 * يكتب الملف ذرّيًا. يرمي عند الفشل الحقيقي (قرص ممتلئ، صلاحيات) تمامًا كما كان
 * `writeFileSync` يفعل — سلوك المُستدعين لم يتغيّر، تغيّرت ضمانة السلامة فقط.
 */
export function writeFileAtomicSync(
  filePath: string,
  data: string | Buffer,
  opts: { mode?: number } = {},
): void {
  const tmp = tempPathFor(filePath);
  const mode = opts.mode;

  try {
    // `wx` = إنشاء حصري: لا نكتب أبدًا فوق ملف مؤقّت قائم لعملية أخرى جارية.
    const fd = fs.openSync(tmp, 'wx', mode);
    try {
      fs.writeFileSync(fd, data);
      // إفراغ مخازن نظام التشغيل إلى القرص قبل الاستبدال — بلا هذا قد ينجح
      // `rename` بينما محتوى الملف الجديد ما زال في الذاكرة فيضيع بانقطاع الكهرباء.
      fs.fsyncSync(fd);
    } finally {
      fs.closeSync(fd);
    }

    // بعض أنظمة الملفات على ويندوز لا تُطبّق الوضع عند الإنشاء بدقّة — تثبيت صريح.
    if (mode !== undefined) {
      try { fs.chmodSync(tmp, mode); } catch { /* أفضل جهد — لا يُفشل الكتابة */ }
    }

    fs.renameSync(tmp, filePath);
  } catch (err) {
    // لا نترك بقايا مؤقتة خلفنا مهما كان سبب الفشل.
    try { if (fs.existsSync(tmp)) fs.unlinkSync(tmp); } catch { /* أفضل جهد */ }
    throw err;
  }
}
