import { useCallback, useEffect, useRef, useState } from 'react';
import {
  SectionCard,
  HeroMetric,
  StatusChip,
  Drawer,
  DrawerSection,
  DrawerField,
  DrawerQuickActions,
  Icon,
  type QuickAction,
  type Tone,
} from './explorer/ExplorerKit';
import { composeFromNode, getPageSpec } from '../printing';
import { generateExportFileName, ReportName } from '../utils/exportFilename';
import { downloadTableExcel } from '../utils/exportUtils';
import { dateText } from '../config/modules';
import { useT } from '../lib/i18n';
import { useToast } from '../stores/toastStore';

/**
 * مركز تشخيص الاتصال السحابي — Production UX & Diagnostics Pack v1 + Polish Pack v1.
 *
 * ── ما هو، وما ليس هو ─────────────────────────────────────────────────────────
 *
 * طبقة **عرض بحتة**. لا تتخذ قرار مزامنة، ولا تنادي Google، ولا تلمس منطق OAuth أو
 * محرّك النسخ. كل ما تعرضه محسوب في العملية الرئيسية (`cloudDiagnostics.pure.ts`)
 * ويصلها جاهزًا: العناصر بنبراتها، ومؤشر الصحة واتجاهه، وسجلّ التشخيص، والإجراء
 * المقترح لكل عملية، والتقريران. لهذا لا يوجد في هذا الملف أي حساب حالة — فقط
 * ترجمة رموز إلى عربية، وتخطيط، وتوليد مستندَي الطباعة والتصدير.
 *
 * ── سياسة عدم الاستطلاع ──────────────────────────────────────────────────────
 *
 * لا `setInterval`، ولا تحديث تلقائي. القراءة تحدث في ثلاث لحظات فقط: فتح التبويب ·
 * ضغطة المستخدم · بعد عملية مزامنة (عبر `refreshKey`). والقراءة سلبية تمامًا: صفر
 * نداءات شبكة. ما يلمس Google هو «اختبار الاتصال» و«إصلاح الاتصال» فقط — بضغطة صريحة.
 *
 * ── لغة التصميم ──────────────────────────────────────────────────────────────
 *
 * كل مكوّن من ExplorerKit القائم داخل `.xpl-scope`: `SectionCard` · `HeroMetric` ·
 * `StatusChip` · `DrawerField` · `DrawerQuickActions` · `Drawer`. لا فئة CSS جديدة،
 * ولا لون خارج رموز النظام — فالوضع الداكن وRTL يعملان بالوراثة لا بمعالجة خاصة.
 * الاستثناء الوحيد جذر الطباعة أدناه، وهو **لا يُعرض على الشاشة إطلاقًا**.
 */

type DiagnosticItem = { key: string; status: string; tone: string; icon: string; value: string | null };
type HealthGrade = 'EXCELLENT' | 'GOOD' | 'WARNING' | 'CRITICAL';
type HistoryEntry = { key: string; at: string | null; icon: string; tone: string };
type EngineInfo = {
  engineVersion: string;
  engineUpdatedAt: string;
  oauthModel: string;
  driveApi: string;
  localStorage: string;
  tokenStorage: string;
  encryptionAvailable: boolean;
};
type Diagnostics = {
  items: DiagnosticItem[];
  health: { score: number; grade: HealthGrade; reasons: string[] };
  trend: { lastChangeAt: string | null; previousScore: number | null; lastDropAt: string | null; lastDropDelta: number | null };
  history: HistoryEntry[];
  report: string;
  supportInfo: string;
  snapshot: { engine: EngineInfo; [key: string]: unknown };
};

export type LogEntry = {
  at: string;
  action: string;
  result: string;
  message: string;
  deviceName?: string;
  startedAt?: string;
  durationMs?: number;
  suggestedAction?: 'NONE' | 'RECONNECT' | 'RETRY' | 'RESOLVE_CONFLICT' | 'CHECK_BACKUPS' | 'CHECK_NETWORK';
};

/** نبرات الوحدة النقية مطابقة لنبرات ExplorerKit — بلا أي لون خارج النظام. */
const TONES: Record<string, Tone> = { green: 'green', red: 'red', orange: 'orange', blue: 'blue', neutral: 'neutral' };

/** الحالات التي تكون **القيمة** فيها هي المعلومة الحقيقية لا كلمة الحالة. */
const VALUE_PRIMARY = new Set(['at', 'known', 'measured']);

const GRADE_TONE: Record<HealthGrade, Tone> = { EXCELLENT: 'green', GOOD: 'green', WARNING: 'orange', CRITICAL: 'red' };
const GRADE_KEY: Record<HealthGrade, string> = {
  EXCELLENT: 'diag.health.excellent',
  GOOD: 'diag.health.good',
  WARNING: 'diag.health.warning',
  CRITICAL: 'diag.health.critical',
};

const LOG_ICON: Record<string, string> = {
  UPLOAD: 'cloud_upload',
  DOWNLOAD: 'cloud_download',
  AUTH: 'key',
  DISCONNECT: 'link_off',
  CONFLICT: 'error',
  RESCUE_BACKUP: 'shield',
};

/** §1 — أقصى ما يُعرض في سجلّ العمليات. الأقدم يبقى في جدول السجلّ الكامل أسفل الصفحة. */
const MAX_LOG_ROWS = 20;

/** رموز الحالة الثلاثة: ✓ نجاح · ✕ فشل · ⚠ ما بينهما (تعارض/تخطٍّ/إعادة محاولة). */
function resultGlyph(result: string): { glyph: string; tone: Tone } {
  if (result === 'SUCCESS') return { glyph: '✓', tone: 'green' };
  if (result === 'FAILED') return { glyph: '✕', tone: 'red' };
  if (result === 'RETRY') return { glyph: '⚠', tone: 'orange' };
  return { glyph: '⚠', tone: 'neutral' };
}

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1048576) return `${(bytes / 1024).toFixed(1)} KB`;
  if (bytes < 1073741824) return `${(bytes / 1048576).toFixed(2)} MB`;
  return `${(bytes / 1073741824).toFixed(2)} GB`;
}

/**
 * نسخ إلى الحافظة مع مسار احتياطي.
 *
 * `navigator.clipboard` غير مضمون في نافذة تُحمَّل عبر `file://` (سياق قد لا يُعدّ
 * آمنًا)، وهي حالة الإنتاج المُعبَّأ بالضبط. الفشل الصامت هنا يعني زرًّا يبدو أنه
 * عمل ولم يعمل — لذلك يوجد مسار ثانٍ صريح، ونتيجة النسخ تُبلَّغ للمستخدم دائمًا.
 */
async function copyToClipboard(text: string): Promise<boolean> {
  try {
    if (navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(text);
      return true;
    }
  } catch {
    // نُكمل إلى المسار الاحتياطي
  }
  try {
    const area = document.createElement('textarea');
    area.value = text;
    area.setAttribute('readonly', '');
    area.style.position = 'fixed';
    area.style.opacity = '0';
    document.body.appendChild(area);
    area.select();
    const ok = document.execCommand('copy');
    document.body.removeChild(area);
    return ok;
  } catch {
    return false;
  }
}

interface Props {
  /** يتغيّر بعد كل عملية مزامنة في اللوحة الأمّ ⇒ إعادة قراءة واحدة، بلا استطلاع. */
  refreshKey: number;
  /** سجلّ المزامنة القائم — يُغذّي سجلّ العمليات بلا أي مصدر بيانات جديد. */
  log: LogEntry[];
  canManage: boolean;
  busy: boolean;
  /** هل يوجد فشل قابل لإعادة المحاولة الآن؟ يُفعِّل إجراء «إعادة المحاولة». */
  canRetry: boolean;
  /** المنحة ميتة ⇒ يظهر «إصلاح الاتصال» بدل الإجراءات العادية (§4). */
  needsReauth: boolean;
  onReconnect: () => void;
  onRetry: () => void;
  onOpenLog: () => void;
  /** يُستدعى بعد إصلاح ناجح ليُحدّث اللوحة الأمّ حالتها وسجلّها. */
  onRepaired: () => void;
}

export default function CloudDiagnosticsCard({
  refreshKey, log, canManage, busy, canRetry, needsReauth, onReconnect, onRetry, onOpenLog, onRepaired,
}: Props) {
  const { t } = useT();
  const toast = useToast();
  const [diag, setDiag] = useState<Diagnostics | null>(null);
  const [loading, setLoading] = useState(true);
  const [testing, setTesting] = useState(false);
  const [repairing, setRepairing] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [detail, setDetail] = useState<LogEntry | null>(null);
  const printRootRef = useRef<HTMLDivElement | null>(null);

  const load = useCallback(async () => {
    if (!window.manar?.syncGetDiagnostics) { setLoading(false); return; }
    setLoading(true);
    try {
      setDiag(await window.manar.syncGetDiagnostics());
    } catch {
      // تبقى البطاقة على آخر حالة معروفة — لا رسالة تقنية خام للمستخدم
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load, refreshKey]);

  const rows = log.slice(0, MAX_LOG_ROWS);

  // ── تنسيقات مشتركة ──────────────────────────────────────────────────────────

  /** «3.8 ثانية» — وأقل من ثانية تُقال كما هي بدل «0.0 ثانية» التي تبدو خطأً. */
  const durationText = (ms: number | undefined): string | null => {
    if (typeof ms !== 'number') return null;
    if (ms < 1000) return t('diag.unit.ms');
    return `${(ms / 1000).toFixed(1)} ${t('diag.unit.seconds')}`;
  };

  /** يترجم رمز الحالة: مفتاح خاص بالعنصر أولًا، ثم المفتاح العام، ثم الرمز كما هو. */
  const statusText = (item: DiagnosticItem): string => {
    const key = item.key === 'systemStatus' ? `cloudsync.status.${item.status}` : `diag.status.${item.status}`;
    const label = t(key);
    return label === key ? item.status : label;
  };

  /** نصّ الشارة: القيمة نفسها حين تكون هي المعلومة، وإلا كلمة الحالة. */
  const chipText = (item: DiagnosticItem): string => {
    if (!VALUE_PRIMARY.has(item.status) || !item.value) return statusText(item);
    if (item.key === 'lastSync' || item.key === 'lastUpload' || item.key === 'lastDownload') return dateText(item.value);
    if (item.key === 'localVersion' || item.key === 'cloudVersion') return `#${item.value}`;
    if (item.key === 'driveStorage') {
      const [used, limit] = item.value.split('/');
      return `${formatBytes(Number(used))} / ${formatBytes(Number(limit))}`;
    }
    return item.value;
  };

  /** سطر تفصيلي صغير تحت الشارة — يظهر فقط حين يضيف معلومة غير مكرّرة. */
  const detailText = (item: DiagnosticItem): string | null => {
    if (VALUE_PRIMARY.has(item.status) || !item.value) return null;
    if (item.key === 'accessToken' || item.key === 'lastConflictCheck') return dateText(item.value);
    return item.value;
  };

  // ── الإجراءات ───────────────────────────────────────────────────────────────

  async function testConnection() {
    if (!window.manar?.syncTestConnection) return;
    setTesting(true);
    try {
      const result = await window.manar.syncTestConnection();
      const message = result.message ?? result.error;
      if (result.ok) toast.ok(message ?? t('btn.diag.test'));
      else if (result.busy) toast.warn(message ?? t('msg.cloudsync.busy_rejected'));
      else toast.error(message ?? t('msg.cloudsync.sync_fail'));
    } finally {
      setTesting(false);
      load();
    }
  }

  /**
   * §4 — الإصلاح بضغطة واحدة. الترتيب كله في العملية الرئيسية (فصل ← ربط ← اختبار)
   * حتى لا تتفرّق خطوات التعافي بين طبقتين. الواجهة تُبلّغ وتُحدّث فقط.
   */
  async function repair() {
    if (!window.manar?.syncRepairConnection) return;
    setRepairing(true);
    toast.warn(t('msg.diag.repairing'));
    try {
      const result = await window.manar.syncRepairConnection();
      if (result.ok) toast.ok(result.message);
      else toast.error(result.message);
    } finally {
      setRepairing(false);
      load();
      onRepaired();
    }
  }

  async function copy(text: string) {
    const copied = await copyToClipboard(text);
    if (copied) toast.ok(t('msg.diag.copied'));
    else toast.error(t('msg.diag.copy_failed'));
  }

  /**
   * §7 — PDF عبر مسار الطباعة الرسمي للمشروع: `composeFromNode` (نفس الهيكل والخط
   * المضمَّن وقواعد `@page` التي تستخدمها بقية التقارير) ثم `exportPdfFromHtml`.
   * الجذر المطبوع أدناه مبنيّ بأنماط سطرية، فلا يعتمد على أي CSS للتطبيق ويخرج
   * متطابقًا سواء كان التطبيق في الوضع الفاتح أو الداكن.
   */
  async function printPdf() {
    const node = printRootRef.current;
    if (typeof window.manar?.exportPdfFromHtml !== 'function' || !node) {
      toast.error(t('msg.diag.pdf_unavailable'));
      return;
    }
    setExporting(true);
    try {
      const html = composeFromNode({
        node,
        pageSpec: getPageSpec('a4-portrait'),
        title: t('diag.print.title'),
        lang: 'ar',
      });
      const result = await window.manar.exportPdfFromHtml(
        html,
        generateExportFileName({ reportName: ReportName.Report, extension: 'pdf' }),
      );
      if (result?.canceled) return;
      if (result?.success && result.path) toast.ok(`${t('msg.diag.pdf_saved')}${result.path}`);
      else toast.error(result?.error ?? t('msg.diag.pdf_failed'));
    } catch {
      toast.error(t('msg.diag.pdf_failed'));
    } finally {
      setExporting(false);
    }
  }

  /**
   * §8 — ورقة Excel واحدة منظّمة عبر محرّك التصدير المشترك نفسه
   * (`downloadTableExcel`)، بترويسة تحمل الصحة ومعلومات المحرّك ثم جدول العناصر
   * ثم الأحداث. لا محرّك تصدير ثانٍ ولا صيغة خاصة.
   */
  function exportExcel() {
    if (!diag) return;
    try {
      const engine = diag.snapshot.engine;
      const prelude: (string | number)[][] = [
        [t('diag.print.title')],
        [t('diag.print.generated'), dateText(new Date().toISOString())],
        [t('diag.health.title'), `${diag.health.score}%`, t(GRADE_KEY[diag.health.grade])],
        [t('diag.info.engineVersion'), engine.engineVersion],
        [t('diag.info.driveApi'), engine.driveApi],
        [t('diag.info.encryption'), engine.encryptionAvailable ? t('diag.info.encryption_on') : t('diag.info.encryption_off')],
        [],
      ];

      type Row = { section: string; item: string; state: string; detail: string };
      const rowsOut: Row[] = [
        ...diag.items.map((item) => ({
          section: t('section.diag.title'),
          item: t(`diag.item.${item.key}`),
          state: chipText(item),
          detail: detailText(item) ?? '',
        })),
        ...diag.history.map((h) => ({
          section: t('section.diag.history'),
          item: t(`diag.history.${h.key}`),
          state: h.at ? dateText(h.at) : t('diag.history.never'),
          detail: '',
        })),
        ...rows.map((entry) => ({
          section: t('diag.print.events'),
          item: `${resultGlyph(entry.result).glyph} ${t(`cloudsync.action.${entry.action.toLowerCase()}`)}`,
          state: dateText(entry.at),
          detail: [durationText(entry.durationMs), entry.message].filter(Boolean).join(' — '),
        })),
      ];

      downloadTableExcel<Row>(
        rowsOut,
        [
          { header: t('col.cloudsync.action'), value: (r) => r.section },
          { header: t('diag.print.item'), value: (r) => r.item },
          { header: t('diag.print.state'), value: (r) => r.state },
          { header: t('diag.print.detail'), value: (r) => r.detail },
        ],
        generateExportFileName({ reportName: ReportName.Report, extension: 'xlsx' }),
        'Diagnostics',
        undefined,
        prelude,
      );
      toast.ok(t('msg.diag.excel_done'));
    } catch {
      toast.error(t('msg.diag.excel_failed'));
    }
  }

  if (!window.manar?.syncGetDiagnostics) {
    return null; // بناء preload أقدم — البطاقة إضافية، وغيابها لا يكسر الصفحة
  }

  const anyBusy = busy || testing || repairing || exporting;

  /**
   * §4 — «إصلاح الاتصال» يحلّ محلّ «إعادة الربط» عند موت المنحة تحديدًا: زرّ واحد
   * يفعل الخطوات الأربع بدل أن يتذكّرها المستخدم. وفي الحالة العادية يبقى زرّ
   * الربط كما هو، فلا يظهر إجراء إصلاح لشيء غير معطوب.
   */
  const actions: QuickAction[] = [
    { key: 'test', icon: 'network_check', label: t('btn.diag.test'), onClick: testConnection, disabled: !canManage || anyBusy },
    needsReauth
      ? { key: 'repair', icon: 'build', label: t('btn.diag.repair'), tone: 'primary' as const, onClick: repair, disabled: !canManage || anyBusy }
      : { key: 'reconnect', icon: 'link', label: t('btn.cloudsync.reconnect'), tone: 'primary' as const, onClick: onReconnect, disabled: !canManage || anyBusy },
    { key: 'retry', icon: 'refresh', label: t('btn.cloudsync.retry'), onClick: onRetry, disabled: !canRetry || anyBusy },
    { key: 'log', icon: 'history', label: t('btn.diag.open_log'), onClick: onOpenLog },
    { key: 'print', icon: 'print', label: t('btn.diag.print'), onClick: printPdf, disabled: !diag || anyBusy },
    { key: 'excel', icon: 'table_view', label: t('btn.diag.excel'), onClick: exportExcel, disabled: !diag || anyBusy },
    { key: 'report', icon: 'content_copy', label: t('btn.diag.copy_report'), onClick: () => diag && copy(diag.report), disabled: !diag },
    { key: 'support', icon: 'support_agent', label: t('btn.diag.copy_support'), onClick: () => diag && copy(diag.supportInfo), disabled: !diag },
    { key: 'refresh', icon: 'sync', label: t('btn.diag.refresh'), onClick: load, disabled: loading || anyBusy },
  ];

  /** §5 — سطر واحد تحت النسبة يقول إن كانت مستقرّة أم هبطت للتوّ. */
  const trendLine = (): string => {
    if (!diag?.trend.lastChangeAt) return t('diag.trend.stable');
    const change = `${t('diag.trend.last_change')}: ${dateText(diag.trend.lastChangeAt)}`;
    const from = diag.trend.previousScore === null
      ? ''
      : ` · ${t('diag.trend.from_to', { prev: String(diag.trend.previousScore), curr: String(diag.health.score) })}`;
    const drop = diag.trend.lastDropAt
      ? ` · ${t('diag.trend.last_drop')}: ${dateText(diag.trend.lastDropAt)} (${t('diag.trend.drop_by', { points: String(diag.trend.lastDropDelta ?? 0) })})`
      : '';
    return `${change}${from}${drop}`;
  };

  const engine = diag?.snapshot.engine;

  return (
    <div className="xpl-scope" style={{ marginBottom: 16 }}>
      <SectionCard title={t('section.diag.title')} icon="stethoscope">
        {diag && (
          <div style={{ marginBottom: 14 }}>
            <HeroMetric
              icon="monitor_heart"
              label={t('diag.health.title')}
              value={`${diag.health.score}%`}
              sub={
                <span style={{ display: 'inline-flex', flexWrap: 'wrap', alignItems: 'center', gap: 8 }}>
                  <StatusChip tone={GRADE_TONE[diag.health.grade]}>{t(GRADE_KEY[diag.health.grade])}</StatusChip>
                  <span>{trendLine()}</span>
                </span>
              }
            />
          </div>
        )}

        <DrawerQuickActions actions={actions} />

        {(testing || repairing) && (
          <div className="alert warn" style={{ margin: '14px 0 0' }}>
            ⏳ {repairing ? t('msg.diag.repairing') : t('msg.diag.testing')}
          </div>
        )}

        {diag && (
          <div className="xpl-info-grid" style={{ marginTop: 14 }}>
            {diag.items.map((item) => (
              <DrawerField
                key={item.key}
                label={t(`diag.item.${item.key}`)}
                value={
                  <span style={{ display: 'inline-flex', flexDirection: 'column', gap: 2, alignItems: 'flex-start' }}>
                    <StatusChip tone={TONES[item.tone] ?? 'neutral'} icon={item.icon}>{chipText(item)}</StatusChip>
                    {detailText(item) && <span className="xpl-metric-sub">{detailText(item)}</span>}
                  </span>
                }
              />
            ))}
          </div>
        )}

        {/* §3 — ستّ حقائق يسألها الدعم الفني أولًا، مشتقّة من السجلّ القائم بلا مصدر جديد. */}
        {diag && (
          <DrawerSection title={t('section.diag.history')}>
            <div className="xpl-info-grid">
              {diag.history.map((h) => (
                <DrawerField
                  key={h.key}
                  label={t(`diag.history.${h.key}`)}
                  value={
                    <StatusChip tone={h.at ? (TONES[h.tone] ?? 'neutral') : 'neutral'} icon={h.icon}>
                      {h.at ? dateText(h.at) : t('diag.history.never')}
                    </StatusChip>
                  }
                />
              ))}
            </div>
          </DrawerSection>
        )}

        {/* §1 — سجلّ العمليات: النتيجة والمدّة واللون، وكل صفّ يفتح تفاصيله (§2). */}
        <DrawerSection title={t('section.diag.log')}>
          {rows.length === 0 ? (
            <div className="xpl-metric-sub">{t('diag.log.empty')}</div>
          ) : (
            <ul className="xpl-timeline">
              {rows.map((entry, index) => {
                const { glyph, tone } = resultGlyph(entry.result);
                const duration = durationText(entry.durationMs);
                return (
                  <li className="xpl-timeline-item" key={`${entry.at}-${index}`}>
                    <span className={`xpl-timeline-dot xpl-dot--${tone}`}>
                      <Icon name={LOG_ICON[entry.action] ?? 'bolt'} />
                    </span>
                    <button
                      type="button"
                      onClick={() => setDetail(entry)}
                      style={{
                        flex: 1, minWidth: 0, background: 'none', border: 'none', padding: 0,
                        font: 'inherit', color: 'inherit', cursor: 'pointer', textAlign: 'start',
                      }}
                      aria-label={`${t('diag.drawer.title')} — ${t(`cloudsync.action.${entry.action.toLowerCase()}`)}`}
                    >
                      <span className="xpl-timeline-body">
                        <span className="xpl-timeline-title">
                          {glyph} {t(`cloudsync.action.${entry.action.toLowerCase()}`)} — {t(`cloudsync.result.${entry.result.toLowerCase()}`)}
                        </span>
                        <span className="xpl-timeline-meta">
                          {duration ? `${t('diag.log.duration', { value: duration })} · ` : ''}{entry.message}
                        </span>
                      </span>
                    </button>
                    <span className="xpl-timeline-time">{dateText(entry.at)}</span>
                  </li>
                );
              })}
            </ul>
          )}
        </DrawerSection>

        {/* §6 — تعريف المحرّك: للتشخيص فقط، لا يتغيّر بتغيّر الحالة. */}
        {engine && (
          <DrawerSection title={t('section.diag.info')}>
            <div className="xpl-info-grid">
              <DrawerField label={t('diag.info.engineVersion')} value={engine.engineVersion} ltr />
              <DrawerField label={t('diag.info.engineUpdatedAt')} value={engine.engineUpdatedAt} ltr />
              <DrawerField label={t('diag.info.oauthModel')} value={engine.oauthModel} ltr />
              <DrawerField label={t('diag.info.driveApi')} value={engine.driveApi} ltr />
              <DrawerField label={t('diag.info.localStorage')} value={engine.localStorage} ltr />
              <DrawerField label={t('diag.info.tokenStorage')} value={engine.tokenStorage} ltr />
              <DrawerField
                label={t('diag.info.encryption')}
                value={
                  <StatusChip tone={engine.encryptionAvailable ? 'green' : 'orange'} icon={engine.encryptionAvailable ? 'lock' : 'lock_open'}>
                    {engine.encryptionAvailable ? t('diag.info.encryption_on') : t('diag.info.encryption_off')}
                  </StatusChip>
                }
              />
            </div>
          </DrawerSection>
        )}
      </SectionCard>

      {/* §2 — تفاصيل العملية في نفس Drawer المستخدم في بقية النظام. */}
      {detail && (
        <Drawer title={t('diag.drawer.title')} onClose={() => setDetail(null)}>
          <DrawerSection>
            <div className="xpl-info-grid">
              <DrawerField label={t('diag.drawer.operation')} value={t(`cloudsync.action.${detail.action.toLowerCase()}`)} />
              <DrawerField
                label={t('diag.drawer.result')}
                value={
                  <StatusChip tone={resultGlyph(detail.result).tone}>
                    {t(`cloudsync.result.${detail.result.toLowerCase()}`)}
                  </StatusChip>
                }
              />
              <DrawerField label={t('diag.drawer.started')} value={detail.startedAt ? dateText(detail.startedAt) : '—'} />
              <DrawerField label={t('diag.drawer.ended')} value={dateText(detail.at)} />
              <DrawerField label={t('diag.drawer.duration')} value={durationText(detail.durationMs) ?? '—'} />
              <DrawerField label={t('diag.drawer.device')} value={detail.deviceName ?? '—'} />
            </div>
          </DrawerSection>

          {detail.result !== 'SUCCESS' && (
            <DrawerSection title={t('diag.drawer.reason')}>
              <div className="xpl-timeline-title">{detail.message}</div>
            </DrawerSection>
          )}

          <DrawerSection title={t('diag.drawer.suggested')}>
            <StatusChip
              tone={detail.suggestedAction && detail.suggestedAction !== 'NONE' ? 'orange' : 'green'}
              icon={detail.suggestedAction && detail.suggestedAction !== 'NONE' ? 'lightbulb' : 'check_circle'}
            >
              {t(`diag.action.${detail.suggestedAction ?? 'NONE'}`)}
            </StatusChip>
          </DrawerSection>
        </Drawer>
      )}

      {/*
        §7 — جذر الطباعة. الغلاف `display:none` يمنع ظهوره على الشاشة، بينما الجذر
        نفسه بلا `display:none` — فـ`node.outerHTML` الذي يلتقطه المُركِّب يخرج نظيفًا
        وقابلًا للعرض. أنماطه سطرية بالكامل: مستقلّ عن سمة التطبيق (فاتح/داكن) وعن
        أي CSS خارجي، فالمخرَج ثابت مهما كانت حالة الشاشة.
      */}
      <div style={{ display: 'none' }} aria-hidden="true">
        <div
          ref={printRootRef}
          dir="rtl"
          style={{ fontFamily: 'Cairo, Tahoma, sans-serif', color: '#0f172a', fontSize: '12px', lineHeight: 1.8 }}
        >
          <h1 style={{ fontSize: '18px', margin: '0 0 4px', textAlign: 'center' }}>{t('diag.print.title')}</h1>
          <div style={{ textAlign: 'center', fontSize: '11px', color: '#64748b', marginBottom: '14px' }}>
            {t('diag.print.generated')}: {dateText(new Date().toISOString())}
          </div>

          {diag && (
            <>
              <div style={{ border: '1px solid #e2e8f0', borderRadius: '8px', padding: '10px', marginBottom: '12px' }}>
                <strong>{t('diag.health.title')}: {diag.health.score}% — {t(GRADE_KEY[diag.health.grade])}</strong>
                <div style={{ fontSize: '11px', color: '#64748b' }}>{trendLine()}</div>
              </div>

              <table style={{ width: '100%', borderCollapse: 'collapse', marginBottom: '14px' }}>
                <thead>
                  <tr style={{ background: '#f1f5f9' }}>
                    <th style={{ border: '1px solid #e2e8f0', padding: '5px', textAlign: 'start' }}>{t('diag.print.item')}</th>
                    <th style={{ border: '1px solid #e2e8f0', padding: '5px', textAlign: 'start' }}>{t('diag.print.state')}</th>
                    <th style={{ border: '1px solid #e2e8f0', padding: '5px', textAlign: 'start' }}>{t('diag.print.detail')}</th>
                  </tr>
                </thead>
                <tbody>
                  {diag.items.map((item) => (
                    <tr key={item.key}>
                      <td style={{ border: '1px solid #e2e8f0', padding: '5px' }}>{t(`diag.item.${item.key}`)}</td>
                      <td style={{ border: '1px solid #e2e8f0', padding: '5px' }}>{chipText(item)}</td>
                      <td style={{ border: '1px solid #e2e8f0', padding: '5px' }}>{detailText(item) ?? ''}</td>
                    </tr>
                  ))}
                </tbody>
              </table>

              <h2 style={{ fontSize: '14px', margin: '0 0 6px' }}>{t('section.diag.history')}</h2>
              <table style={{ width: '100%', borderCollapse: 'collapse', marginBottom: '14px' }}>
                <tbody>
                  {diag.history.map((h) => (
                    <tr key={h.key}>
                      <td style={{ border: '1px solid #e2e8f0', padding: '5px' }}>{t(`diag.history.${h.key}`)}</td>
                      <td style={{ border: '1px solid #e2e8f0', padding: '5px' }}>{h.at ? dateText(h.at) : t('diag.history.never')}</td>
                    </tr>
                  ))}
                </tbody>
              </table>

              <h2 style={{ fontSize: '14px', margin: '0 0 6px' }}>{t('section.diag.info')}</h2>
              <table style={{ width: '100%', borderCollapse: 'collapse', marginBottom: '14px' }}>
                <tbody>
                  {engine && ([
                    ['diag.info.engineVersion', engine.engineVersion],
                    ['diag.info.engineUpdatedAt', engine.engineUpdatedAt],
                    ['diag.info.oauthModel', engine.oauthModel],
                    ['diag.info.driveApi', engine.driveApi],
                    ['diag.info.localStorage', engine.localStorage],
                    ['diag.info.tokenStorage', engine.tokenStorage],
                    ['diag.info.encryption', engine.encryptionAvailable ? t('diag.info.encryption_on') : t('diag.info.encryption_off')],
                  ] as const).map(([key, value]) => (
                    <tr key={key}>
                      <td style={{ border: '1px solid #e2e8f0', padding: '5px', width: '30%' }}>{t(key)}</td>
                      <td style={{ border: '1px solid #e2e8f0', padding: '5px' }} dir="ltr">{value}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </>
          )}

          <h2 style={{ fontSize: '14px', margin: '0 0 6px' }}>{t('diag.print.events')}</h2>
          <table style={{ width: '100%', borderCollapse: 'collapse', marginBottom: '14px' }}>
            <tbody>
              {rows.map((entry, index) => (
                <tr key={`${entry.at}-${index}`}>
                  <td style={{ border: '1px solid #e2e8f0', padding: '5px', whiteSpace: 'nowrap' }}>{dateText(entry.at)}</td>
                  <td style={{ border: '1px solid #e2e8f0', padding: '5px' }}>
                    {resultGlyph(entry.result).glyph} {t(`cloudsync.action.${entry.action.toLowerCase()}`)}
                  </td>
                  <td style={{ border: '1px solid #e2e8f0', padding: '5px' }}>{durationText(entry.durationMs) ?? ''}</td>
                  <td style={{ border: '1px solid #e2e8f0', padding: '5px' }}>{entry.message}</td>
                </tr>
              ))}
            </tbody>
          </table>

          <h2 style={{ fontSize: '14px', margin: '0 0 6px' }}>{t('diag.print.errors')}</h2>
          <div>{(diag?.snapshot.lastError as string | null) ?? t('diag.print.none')}</div>
        </div>
      </div>
    </div>
  );
}
