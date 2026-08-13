import { defineConfig } from 'vitest/config';
import path from 'path';

export default defineConfig({
  resolve: {
    alias: {
      '@core': path.resolve(__dirname, 'src/core'),
      '@modules': path.resolve(__dirname, 'src/modules'),
      '@config': path.resolve(__dirname, 'src/config'),
      '@shared': path.resolve(__dirname, 'src/shared'),
    },
  },
  test: {
    globals: false,
    /**
     * Test Isolation Pack v1 — طبقتا حماية لقاعدة بيانات التطوير.
     *
     * `setupFiles`  — تُنفَّذ **قبل** شجرة وحدات كل ملف اختبار، فتُعيد توجيه
     *                 DATABASE_URL و BACKUP_DIR و ATTACHMENTS_DIR و DATA_DIR إلى
     *                 صندوق رملي في مجلد المؤقتات. `dotenv` لا يستبدل قيمة موجودة،
     *                 فقيمة `.env` (قاعدة التطوير) لا تصل التطبيق أثناء الاختبار
     *                 مهما كان ترتيب الاستيراد. المنع الفعلي يعيش هنا.
     *
     * `globalSetup` — يلتقط بصمة SHA-256 لقاعدة التطوير قبل أول اختبار ويقارنها
     *                 بعد آخر واحد، فيُفشل التشغيل كله إن تغيّرت. الإثبات يعيش هنا.
     */
    setupFiles: ['./vitest.setup.ts'],
    globalSetup: ['./vitest.globalSetup.ts'],
  },
});
