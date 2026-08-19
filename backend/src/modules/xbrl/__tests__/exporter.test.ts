import { describe, expect, it } from 'vitest';

/**
 * بنية التصدير.
 *
 * الاختبار المحوري: **لا مخرَج رسمي بلا تصنيف رسمي**، والرسالة نصّها جزء من العقد.
 */
import {
  InternalPreviewExporter,
  resolveExporter,
  XbrlExporter,
} from '../export/exporter';
import { NO_OFFICIAL_TAXONOMY_MESSAGE, XBRL_EXPORT_FORMATS } from '../xbrl.constants';
import { validateReadiness } from '../domain/validation.engine';
import { buildAccountRows, computeReadinessScore } from '../domain/readiness.score';
import { concept, dataset, mapping, taxonomy } from './fixtures';

function requestFor(ds: ReturnType<typeof dataset>) {
  const validation = validateReadiness(ds);
  const accounts = buildAccountRows(ds);
  return {
    dataset: ds,
    report: {
      generatedAt: new Date().toISOString(),
      taxonomy: ds.taxonomy,
      context: ds.context,
      company: ds.company,
      trialBalance: ds.trialBalance,
      equation: ds.equation,
      score: computeReadinessScore(accounts, validation, ds.hasOfficialTaxonomy),
      validation,
      accounts,
    },
  };
}

describe('XbrlExporter — الحاجز الرسمي', () => {
  const exporter = new XbrlExporter();

  it('يرفض التصدير بلا تصنيف رسمي بالرسالة المتفق عليها حرفيًا', async () => {
    await expect(exporter.export(requestFor(dataset()))).rejects.toThrow(NO_OFFICIAL_TAXONOMY_MESSAGE);
  });

  it('يرفض حتى مع تصنيف مفعَّل ما دام غير رسمي', async () => {
    const ds = dataset({ taxonomy: taxonomy({ status: 'ACTIVE', isOfficial: false }) });
    await expect(exporter.export(requestFor(ds))).rejects.toThrow(NO_OFFICIAL_TAXONOMY_MESSAGE);
  });

  it('يرفض حتى حين تكون كل الفحوص ناجحة والربط مكتملًا', async () => {
    const ds = dataset({ hasOfficialTaxonomy: false });
    expect(validateReadiness(ds).errorCount).toBe(0);
    await expect(exporter.export(requestFor(ds))).rejects.toThrow(NO_OFFICIAL_TAXONOMY_MESSAGE);
  });

  it('يُصرّح بأنه يُنتج مخرجًا رسميًا — ولذلك يُحرَس', () => {
    expect(exporter.producesOfficialOutput).toBe(true);
  });

  it('يشرح سبب عدم التوفر بدل الفشل الصامت', () => {
    expect(exporter.unavailableReason(requestFor(dataset()))).toBe(NO_OFFICIAL_TAXONOMY_MESSAGE);
  });
});

describe('InternalPreviewExporter — معاينة داخلية لا تدّعي شيئًا', () => {
  const exporter = new InternalPreviewExporter();

  it('يوسم المخرَج بأنه غير رسمي ويرفق تنويهًا صريحًا', async () => {
    const result = await exporter.export(requestFor(dataset()));
    expect(result.isOfficial).toBe(false);
    expect(result.disclaimerAr).toMatch(/ليس مستند XBRL رسميًا/);
    expect(result.format).toBe(XBRL_EXPORT_FORMATS.INTERNAL_PREVIEW);
  });

  it('لا يذكر QAYD ولا instance document في اسم الصيغة', () => {
    expect(exporter.format).not.toMatch(/QAYD|INSTANCE/i);
  });

  it('يُخرج الحسابات المربوطة فقط، ويعدّ غير المربوطة', async () => {
    const ds = dataset({
      concepts: [concept({ id: 10, conceptCode: 'Assets' })],
      accountMappings: [mapping({ id: 1, accountId: 1, conceptId: 10 })],
    });
    const result = await exporter.export(requestFor(ds));
    const payload = result.payload as { facts: unknown[]; unmappedAccounts: number };
    expect(payload.facts).toHaveLength(1);
    expect(payload.unmappedAccounts).toBe(4);
  });

  it('يحمل العملة والدقة من سياق التقرير — KWD بثلاث منازل', async () => {
    const result = await exporter.export(requestFor(dataset()));
    const payload = result.payload as { facts: { currency: string; decimals: number }[] };
    expect(payload.facts[0].currency).toBe('KWD');
    expect(payload.facts[0].decimals).toBe(3);
  });
});

describe('resolveExporter', () => {
  it('يُرجع المُصدِّر المطابق للصيغة', () => {
    expect(resolveExporter(XBRL_EXPORT_FORMATS.XBRL_INSTANCE)).toBeInstanceOf(XbrlExporter);
    expect(resolveExporter(XBRL_EXPORT_FORMATS.INTERNAL_PREVIEW)).toBeInstanceOf(InternalPreviewExporter);
  });

  it('يرفض صيغة غير معروفة بدل الرجوع إلى صيغة افتراضية صامتة', () => {
    expect(() => resolveExporter('QAYD_OFFICIAL_PACKAGE')).toThrow(/صيغة تصدير غير معروفة/);
  });
});
