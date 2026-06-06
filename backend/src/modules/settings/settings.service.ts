import { Request } from 'express';
import { prisma } from '../../config/database';
import { recordAudit } from '../../core/middleware/audit';

export class SettingsService {
  /** كل الإعدادات مجمّعة حسب المجموعة. */
  async getAll() {
    const rows = await prisma.setting.findMany({ orderBy: { group: 'asc' } });
    const grouped: Record<string, Record<string, string>> = {};
    for (const r of rows) {
      (grouped[r.group] ??= {})[r.key] = r.value;
    }
    return { settings: rows, grouped };
  }

  async get(key: string) {
    return prisma.setting.findUnique({ where: { key } });
  }

  /** تحديث/إنشاء عدة إعدادات دفعة واحدة. */
  async updateMany(updates: { key: string; value: string; group?: string }[], req: Request) {
    const results = await prisma.$transaction(
      updates.map((u) =>
        prisma.setting.upsert({
          where: { key: u.key },
          update: { value: u.value },
          create: { key: u.key, value: u.value, group: u.group ?? 'general' },
        }),
      ),
    );
    await recordAudit({ req, action: 'UPDATE', module: 'settings', newValue: updates.map((u) => u.key) });
    return results;
  }
}

export const settingsService = new SettingsService();
