/**
 * بنية التصدير — Export Architecture.
 *
 * ═══ الحدّ الصارم لهذه المرحلة ═══
 * لا يُنتج هذا الملف — ولا أي ملف في الحزمة — مستند XBRL رسميًا ولا حزمة QAYD ولا
 * instance document يدّعي التوافق. المحاوَلة تُرفض برسالة واحدة ثابتة:
 *
 *     «لم يتم تثبيت Taxonomy رسمية معتمدة للتصدير بعد...»
 *
 * الرفض ليس عيبًا في التنفيذ بل هو **المطلوب**: إخراج ملف يُقدَّم إلى جهة رسمية بناءً
 * على تصنيف مخترَع داخليًا أسوأ من عدم إخراج شيء.
 *
 * ما يُنتَج هنا فعلًا هو `INTERNAL_PREVIEW`: مجموعة بيانات داخلية موحَّدة الشكل،
 * موسومة صراحةً بأنها غير رسمية، لأغراض المراجعة والتطوير وحدها.
 *
 * ═══ نقطة التوسعة المستقبلية ═══
 * عند وصول المواصفة الرسمية يُضاف مُصدِّر جديد يحقّق `FinancialReportingExporter`
 * ويُسجَّل في `EXPORTERS` أدناه. لا يتغيّر شيء في النموذج ولا في الربط ولا في الواجهة.
 */
import { AppError } from '../../../core/errors/AppError';
import {
  NO_OFFICIAL_TAXONOMY_MESSAGE,
  XBRL_EXPORT_FORMATS,
} from '../xbrl.constants';
import type { ReadinessDataset, ReadinessReport } from '../xbrl.types';

export interface ExportRequest {
  dataset: ReadinessDataset;
  report: ReadinessReport;
}

export interface ExportResult {
  format: string;
  /** `false` دائمًا في v1 — يقرؤه العميل بدل أن يستنتج من اسم الصيغة. */
  isOfficial: boolean;
  /** تحذير معروض للمستخدم مع أي مخرَج غير رسمي. */
  disclaimerAr: string;
  generatedAt: string;
  payload: unknown;
}

/**
 * عقد المُصدِّرات. أي صيغة مستقبلية (XBRL, iXBRL, حزمة QAYD) تدخل من هنا وحدها.
 */
export interface FinancialReportingExporter {
  readonly format: string;
  /** هل يُنتج هذا المُصدِّر مخرجًا يُقدَّم إلى جهة رسمية؟ */
  readonly producesOfficialOutput: boolean;
  /** يشرح سبب عدم إمكانية التصدير الآن، أو `null` إن كان متاحًا. */
  unavailableReason(request: ExportRequest): string | null;
  export(request: ExportRequest): Promise<ExportResult>;
}

const INTERNAL_DISCLAIMER =
  'مخرَج داخلي لأغراض المراجعة والتطوير فقط — ليس مستند XBRL رسميًا ولا حزمة QAYD، ولا يصلح للتقديم إلى أي جهة رسمية.';

/**
 * مُصدِّر المعاينة الداخلية.
 *
 * يُطبِّع البيانات إلى شكل واحد يسهل فحصه بصريًا، ويصف كل قيمة بمفهومها المربوط إن
 * وُجد. لا namespace ولا schemaRef ولا سياق XBRL: تسمية هذه المخرَجات بمصطلحات XBRL
 * الرسمية تجعلها تبدو صالحة للتقديم وهي ليست كذلك.
 */
export class InternalPreviewExporter implements FinancialReportingExporter {
  readonly format = XBRL_EXPORT_FORMATS.INTERNAL_PREVIEW;
  readonly producesOfficialOutput = false;

  unavailableReason(): string | null {
    return null; // متاح دائمًا — لأنه لا يدّعي شيئًا.
  }

  async export({ dataset, report }: ExportRequest): Promise<ExportResult> {
    const conceptById = new Map(dataset.concepts.map((c) => [c.id, c]));

    const facts = report.accounts
      .filter((row) => row.conceptId != null)
      .map((row) => {
        const concept = conceptById.get(row.conceptId!);
        return {
          accountCode: row.code,
          accountName: row.name,
          conceptCode: concept?.conceptCode ?? null,
          conceptLabelAr: concept?.labelAr ?? null,
          statementType: concept?.statementType ?? null,
          value: row.balance,
          currency: dataset.context?.currency ?? 'KWD',
          decimals: dataset.context?.decimals ?? 3,
        };
      });

    return {
      format: this.format,
      isOfficial: false,
      disclaimerAr: INTERNAL_DISCLAIMER,
      generatedAt: new Date().toISOString(),
      payload: {
        entity: {
          name: dataset.company.name,
          identifier: dataset.context?.entityIdentifier ?? null,
          scheme: dataset.context?.entityScheme ?? null,
        },
        period: dataset.context
          ? { start: dataset.context.periodStart, end: dataset.context.periodEnd, instant: dataset.context.instantDate }
          : null,
        taxonomy: dataset.taxonomy
          ? { code: dataset.taxonomy.code, version: dataset.taxonomy.version, isOfficial: dataset.taxonomy.isOfficial }
          : null,
        unmappedAccounts: report.accounts.filter((r) => r.mappingStatus === 'UNMAPPED').length,
        facts,
      },
    };
  }
}

/**
 * مُصدِّر XBRL الرسمي — **حاجز مقصود**، لا تنفيذ ناقص.
 *
 * يرفض دائمًا في v1 لأن `isOfficial` لا يصير `true` بأي مسار متاح للمستخدم. عندما
 * يصل مستورد تصنيف رسمي، يبدأ هذا الشرط بالمرور من تلقاء نفسه، ويُستبدل جسم `export`
 * بتوليد instance document حقيقي وفق المواصفة المنشورة.
 */
export class XbrlExporter implements FinancialReportingExporter {
  readonly format = XBRL_EXPORT_FORMATS.XBRL_INSTANCE;
  readonly producesOfficialOutput = true;

  unavailableReason({ dataset }: ExportRequest): string | null {
    if (!dataset.taxonomy?.isOfficial) return NO_OFFICIAL_TAXONOMY_MESSAGE;
    // لم يُكتب بعد: الشرط أعلاه لا يمكن أن يمرّ في v1، وهذا السطر هو نقطة الاستئناف.
    return NO_OFFICIAL_TAXONOMY_MESSAGE;
  }

  async export(request: ExportRequest): Promise<ExportResult> {
    const reason = this.unavailableReason(request);
    // لا مسار نجاح في v1: الوصول إلى هنا بلا سبب رفض يعني أن أحدًا أضاف تصنيفًا
    // رسميًا بلا مُصدِّر مقابل — وهو خطأ برمجي يستحق الانفجار لا مخرَجًا صامتًا.
    throw AppError.badRequest(reason ?? NO_OFFICIAL_TAXONOMY_MESSAGE);
  }
}

export const EXPORTERS: Record<string, FinancialReportingExporter> = {
  [XBRL_EXPORT_FORMATS.INTERNAL_PREVIEW]: new InternalPreviewExporter(),
  [XBRL_EXPORT_FORMATS.XBRL_INSTANCE]: new XbrlExporter(),
};

export function resolveExporter(format: string): FinancialReportingExporter {
  const exporter = EXPORTERS[format];
  if (!exporter) throw AppError.badRequest(`صيغة تصدير غير معروفة: ${format}`);
  return exporter;
}
