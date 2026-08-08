import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import { prisma, disconnectDatabase } from '../../config/database';
import { env } from '../../config/env';
import { AppError } from '../../core/errors/AppError';
import { logger } from '../../core/utils/logger';

/** استخراج مسار ملف قاعدة البيانات من DATABASE_URL (صيغة file:./...). */
function resolveDbPath(): string {
  const url = env.DATABASE_URL.replace(/^file:/, '');
  return path.resolve(process.cwd(), url);
}

function ensureDir(dir: string) {
  fs.mkdirSync(dir, { recursive: true });
}

function timestamp(): string {
  return new Date().toISOString().replace(/[:.]/g, '-');
}

/** تصنيف النسخة — يظهر في سجلّ مركز النسخ الاحتياطي ويحدّد سياسة الاحتفاظ. */
export type BackupType = 'MANUAL' | 'AUTO' | 'SCHEDULED' | 'RESCUE';

/**
 * بادئة اسم الملف لكل تصنيف — نسخة الإنقاذ تحمل بادئة مميّزة حتى يُعرَف أصلها من
 * اسم الملف وحده على القرص، لا من سجلّ القاعدة فقط.
 */
const FILE_PREFIX: Record<BackupType, string> = {
  MANUAL: 'manar-backup-',
  AUTO: 'manar-backup-',
  SCHEDULED: 'manar-backup-',
  RESCUE: 'manar-rescue-',
};

export class BackupService {
  /**
   * المسار الفعلي لملف نسخة احتياطية **على هذا الجهاز الآن**
   * (Zero Data Loss Certification Pack v1).
   *
   * العمود `filePath` يخزّن مسارًا مطلقًا كُتب لحظة إنشاء النسخة. ثلاثة أحداث
   * واقعية تُبطله بينما الملف نفسه سليم على القرص:
   *   • استعادة قاعدة على جهاز آخر (اسم مستخدم Windows مختلف).
   *   • تغيير `productName` أو `appId` — ينقل `userData` ومعه مجلد النسخ كاملًا.
   *   • نقل مجلد النسخ يدويًا إلى قرص آخر.
   * في كل هذه الحالات كانت كل نسخة في القائمة تصبح غير قابلة للاستعادة برسالة
   * «ملف النسخة غير موجود» رغم وجود الملف فعلًا — أي فقدان قدرة تعافٍ لا فقدان ملف.
   *
   * الاشتقاق من `BACKUP_DIR` الحالي + اسم الملف يعالج ذلك، والرجوع إلى المسار
   * المخزَّن يحفظ الحالات القديمة التي كُتبت خارج المجلد الحالي — فلا يخسر أحد شيئًا.
   */
  resolveBackupFile(backup: { fileName: string; filePath: string }): string {
    const derived = path.join(path.resolve(process.cwd(), env.BACKUP_DIR), path.basename(backup.fileName));
    if (fs.existsSync(derived)) return derived;
    return backup.filePath;
  }

  /** إنشاء نسخة احتياطية من ملف قاعدة البيانات. */
  async create(type: BackupType, createdById?: number) {
    const dbPath = resolveDbPath();
    if (!fs.existsSync(dbPath)) throw AppError.internal('ملف قاعدة البيانات غير موجود');

    const backupDir = path.resolve(process.cwd(), env.BACKUP_DIR);
    ensureDir(backupDir);

    const fileName = `${FILE_PREFIX[type] ?? 'manar-backup-'}${timestamp()}.db`;
    const filePath = path.join(backupDir, fileName);

    try {
      // ضمان كتابة كل المعاملات على القرص قبل النسخ
      await prisma.$queryRawUnsafe('PRAGMA wal_checkpoint(FULL);').catch(() => undefined);
      fs.copyFileSync(dbPath, filePath);
      const { size } = fs.statSync(filePath);

      const record = await prisma.backup.create({
        data: { fileName, filePath, sizeBytes: size, type, status: 'SUCCESS', createdById: createdById ?? null },
      });
      logger.info(`تم إنشاء نسخة احتياطية: ${fileName} (${size} بايت)`);
      return record;
    } catch (err) {
      logger.error('فشل إنشاء النسخة الاحتياطية', { error: err });
      await prisma.backup.create({
        data: { fileName, filePath, sizeBytes: 0, type, status: 'FAILED', createdById: createdById ?? null },
      });
      throw AppError.internal('فشل إنشاء النسخة الاحتياطية');
    }
  }

  /** قائمة النسخ الاحتياطية. */
  async list() {
    return prisma.backup.findMany({
      orderBy: { createdAt: 'desc' },
      include: { createdBy: { select: { username: true, fullName: true } } },
    });
  }

  /**
   * استعادة قاعدة البيانات من نسخة.
   * تُنشئ نسخة أمان من الحالة الحالية أولًا، ثم تستبدل الملف.
   * يجب إعادة تشغيل الخدمة بعدها (يتولاها Electron Main).
   */
  async restore(backupId: number) {
    const backup = await prisma.backup.findUnique({ where: { id: backupId } });
    if (!backup) throw AppError.notFound('النسخة الاحتياطية غير موجودة');
    // المسار المشتقّ لا المخزَّن — فتبقى النسخ قابلة للاستعادة بعد انتقال مجلد
    // البيانات (تغيير productName/appId، أو جهاز جديد). انظر `resolveBackupFile`.
    const sourcePath = this.resolveBackupFile(backup);
    if (!fs.existsSync(sourcePath)) throw AppError.badRequest('ملف النسخة غير موجود على القرص');

    const dbPath = resolveDbPath();

    // نسخة أمان قبل الاستعادة
    const safetyDir = path.resolve(process.cwd(), env.BACKUP_DIR, 'pre-restore');
    ensureDir(safetyDir);
    if (fs.existsSync(dbPath)) {
      fs.copyFileSync(dbPath, path.join(safetyDir, `before-restore-${timestamp()}.db`));
    }

    await disconnectDatabase();
    fs.copyFileSync(sourcePath, dbPath);
    logger.warn(`تمت استعادة قاعدة البيانات من ${backup.fileName} — يجب إعادة تشغيل الخدمة`);

    return { restored: true, requiresRestart: true, fileName: backup.fileName };
  }

  /** تصدير نسخة إلى مسار خارجي يختاره المستخدم. */
  async exportTo(targetPath: string) {
    const dbPath = resolveDbPath();
    if (!fs.existsSync(dbPath)) throw AppError.internal('ملف قاعدة البيانات غير موجود');
    ensureDir(path.dirname(targetPath));
    await prisma.$queryRawUnsafe('PRAGMA wal_checkpoint(FULL);').catch(() => undefined);
    fs.copyFileSync(dbPath, targetPath);
    return { exported: true, path: targetPath };
  }

  /** حذف نسخة احتياطية (ملف + سجل). */
  async remove(backupId: number) {
    const backup = await prisma.backup.findUnique({ where: { id: backupId } });
    if (!backup) throw AppError.notFound('النسخة الاحتياطية غير موجودة');
    // المسار المشتقّ — فيُحذف الملف فعلًا حتى بعد انتقال مجلد البيانات، بدل ترك
    // ملف يتيم على القرص وسجلّ محذوف في القاعدة.
    const target = this.resolveBackupFile(backup);
    if (fs.existsSync(target)) fs.unlinkSync(target);
    await prisma.backup.delete({ where: { id: backupId } });
    return { deleted: true };
  }

  /** حساب SHA-256 checksum لملف (قراءة فقط — لا كتابة). */
  computeChecksum(filePath: string): string {
    const hash = crypto.createHash('sha256');
    const buf  = fs.readFileSync(filePath);
    hash.update(buf);
    return hash.digest('hex');
  }

  /**
   * التحقق من سلامة نسخة احتياطية:
   * 1. التحقق من وجود الملف.
   * 2. التحقق من رأسية SQLite (أول 16 بايت).
   * 3. حساب SHA-256 وتخزينه.
   * الملف لا يُفتح أبدًا للكتابة — قراءة فقط.
   */
  async verify(backupId: number): Promise<{
    status: 'PASS' | 'FAIL';
    note: string;
    checksumSha256: string | null;
    verifiedAt: Date;
  }> {
    const backup = await prisma.backup.findUnique({ where: { id: backupId } });
    if (!backup) throw AppError.notFound('النسخة الاحتياطية غير موجودة');

    const verifiedAt = new Date();

    // المسار المشتقّ — وإلا رُصدت كل نسخة سليمة على أنها «مفقودة» بمجرّد انتقال
    // مجلد البيانات، فتُفقد الثقة بالنسخ الاحتياطية وهي موجودة فعلًا.
    const backupFile = this.resolveBackupFile(backup);

    if (!fs.existsSync(backupFile)) {
      await prisma.backup.update({
        where: { id: backupId },
        data: {
          verificationStatus: 'FAIL',
          verificationNote:   'الملف غير موجود على القرص',
          verifiedAt,
        },
      });
      return { status: 'FAIL', note: 'الملف غير موجود على القرص', checksumSha256: null, verifiedAt };
    }

    // Read first 16 bytes to validate SQLite header
    const fd = fs.openSync(backupFile, 'r');
    const headerBuf = Buffer.alloc(16);
    fs.readSync(fd, headerBuf, 0, 16, 0);
    fs.closeSync(fd);

    const SQLITE_MAGIC = Buffer.from('SQLite format 3\x00');
    if (!headerBuf.equals(SQLITE_MAGIC)) {
      await prisma.backup.update({
        where: { id: backupId },
        data: {
          verificationStatus: 'FAIL',
          verificationNote:   'الملف ليس قاعدة بيانات SQLite صالحة (رأسية خاطئة)',
          verifiedAt,
        },
      });
      return {
        status: 'FAIL',
        note: 'الملف ليس قاعدة بيانات SQLite صالحة',
        checksumSha256: null,
        verifiedAt,
      };
    }

    // Compute checksum (read-only)
    const checksum = this.computeChecksum(backupFile);

    // Check file size matches recorded size
    const { size } = fs.statSync(backupFile);
    const sizeNote = size !== backup.sizeBytes
      ? ` — حجم الملف (${size}) يختلف عن المسجّل (${backup.sizeBytes})`
      : '';

    const note = `التحقق ناجح${sizeNote}`;
    await prisma.backup.update({
      where: { id: backupId },
      data: {
        checksumSha256:     checksum,
        verificationStatus: 'PASS',
        verificationNote:   note,
        verifiedAt,
      },
    });

    return { status: 'PASS', note, checksumSha256: checksum, verifiedAt };
  }

  /**
   * حذف النسخ القديمة من تصنيف واحد ما يزيد عن عدد `keep`.
   * يحذف الملف من القرص + السجل من قاعدة البيانات.
   * لا يمسّ النسخ اليدوية أو نسخ ما قبل الاستعادة، ولا أي تصنيف آخر.
   *
   * التصنيف وسيط لأن لكل نوع سياسة احتفاظ مستقلّة: النسخ التلقائية يحكمها إعداد
   * المستخدم `backup.auto.retention`، بينما نسخ الإنقاذ (RESCUE) لها حدّ ثابت
   * خاص بها — فلا تُزاحم إحداهما الأخرى ولا تُحذف نسخة إنقاذ بسبب إعداد الجدولة.
   */
  async pruneAutoBackups(keep: number, type: BackupType = 'AUTO'): Promise<string[]> {
    const autoBackups = await prisma.backup.findMany({
      where: { type },
      orderBy: { createdAt: 'desc' },
    });

    if (autoBackups.length <= keep) return [];

    const toDelete = autoBackups.slice(keep);
    const deletedFiles: string[] = [];

    for (const b of toDelete) {
      try {
        // المسار المشتقّ — بدونه كان التقليم بعد انتقال مجلد البيانات يحذف السجلّ
        // ويترك الملف على القرص إلى الأبد، فينمو المجلد بلا حدّ بلا أثر في القائمة.
        const target = this.resolveBackupFile(b);
        if (fs.existsSync(target)) {
          fs.unlinkSync(target);
          deletedFiles.push(b.fileName);
        }
      } catch {
        // تجاهل أخطاء حذف الملف — لا تزال تُزال من السجل
      }
      await prisma.backup.delete({ where: { id: b.id } });
    }

    return deletedFiles;
  }
}

export const backupService = new BackupService();
