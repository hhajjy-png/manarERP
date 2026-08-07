/**
 * Document Automation — the Document Properties panel.
 *
 * ══════════════════════════════════════════════════════════════════════════
 *  EVERY FIGURE HERE IS DERIVED. NOTHING IS STORED FOR THIS PANEL'S BENEFIT.
 * ══════════════════════════════════════════════════════════════════════════
 * Word count comes from the statistics module the status bar already uses, the page
 * count from the paginator, the object count from the layout layer, the versions from
 * the letter's own stamp. Adding a `wordCount` column would have meant a number that
 * could disagree with the document — and it would, the first time a letter was edited
 * by an older build.
 *
 * The panel is therefore a VIEW, and the only thing it can get wrong is arithmetic
 * that is tested elsewhere.
 */

import { Icon } from '../../explorer/ExplorerKit';
import { type DocumentStats, LANGUAGE_LABEL_AR, type DocumentLanguage } from '../../../letters/editor/documentStats';
import { type ResizableRail } from './useResizableRail';
import RailResizeHandle from './RailResizeHandle';
import './document-properties.css';

export interface DocumentPropertiesProps {
  readonly reference: string | null;
  readonly statusLabel: string;
  readonly templateName: string;
  readonly authorName: string | null;
  readonly createdAt: string | null;
  readonly updatedAt: string | null;
  readonly lastSavedAt: Date | null;
  readonly versions: { templateVersion: number; layoutVersion: number; barcodeVersion: number };
  readonly contentModelVersion: number;
  readonly language: DocumentLanguage;
  readonly stats: DocumentStats;
  readonly pageCount: number;
  readonly objectCount: number;
  readonly variableCount: number;
  readonly conditionCount: number;
  readonly onClose: () => void;
  readonly resize: ResizableRail;
}

/** ISO → a readable local date and time. Empty for a missing value. */
function moment(iso: string | null | undefined): string {
  if (!iso) return '—';
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return '—';
  return `${date.toLocaleDateString('en-GB')} · ${date.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' })}`;
}

function n(value: number): string {
  return value.toLocaleString('en-US');
}

export default function DocumentPropertiesPanel(props: DocumentPropertiesProps) {
  const { stats, resize } = props;

  return (
    <aside
      className="dpp-panel lc-rail-in"
      aria-label="خصائص المستند"
      ref={resize.railRef}
      style={{ '--rail-w': `${resize.width}px` } as React.CSSProperties}
    >
      <RailResizeHandle
        handleRef={resize.handleRef}
        label="تغيير عرض لوحة الخصائص"
        edge="after"
        onPointerDown={resize.startDrag}
        onKeyDown={resize.onHandleKeyDown}
      />
      <div className="dpp-head">
        <Icon name="info" />
        <span className="dpp-title">خصائص المستند</span>
        <button type="button" className="dpp-close" onClick={props.onClose} aria-label="إغلاق خصائص المستند">
          <Icon name="close" />
        </button>
      </div>

      <Section title="الهوية">
        <Row label="الرقم المرجعي" value={props.reference ?? 'مسودة — لم يُخصَّص بعد'} mono={props.reference !== null} />
        <Row label="الحالة" value={props.statusLabel} />
        <Row label="القالب" value={props.templateName} />
        <Row label="اللغة" value={LANGUAGE_LABEL_AR[props.language]} />
      </Section>

      <Section title="السجل">
        <Row label="المُنشئ" value={props.authorName ?? '—'} />
        <Row label="تاريخ الإنشاء" value={moment(props.createdAt)} />
        <Row label="آخر تعديل" value={moment(props.updatedAt)} />
        <Row
          label="آخر حفظ"
          value={props.lastSavedAt ? moment(props.lastSavedAt.toISOString()) : 'لم يُحفظ في هذه الجلسة'}
        />
      </Section>

      <Section title="المحتوى">
        <Row label="الصفحات" value={n(props.pageCount)} />
        <Row label="الفقرات" value={n(stats.paragraphs)} />
        <Row label="العناوين" value={n(stats.headings)} />
        <Row label="الكلمات" value={n(stats.words)} />
        <Row label="الأحرف" value={`${n(stats.characters)} (${n(stats.charactersNoSpaces)} بلا مسافات)`} />
        <Row label="زمن القراءة" value={stats.readingMinutes > 0 ? `~${n(stats.readingMinutes)} دقيقة` : '—'} />
        <Row label="عناصر التصميم" value={n(props.objectCount)} />
        <Row label="المتغيّرات المستخدَمة" value={n(props.variableCount)} />
        <Row label="الفقرات الشرطية" value={n(props.conditionCount)} />
      </Section>

      {/* The four version axes. Shown together because a fidelity question is never
          about one of them — "why does this reprint differ?" is answered by the
          combination, and splitting them across sections would hide that. */}
      <Section title="الإصدارات">
        <Row label="إصدار القالب" value={n(props.versions.templateVersion)} mono />
        <Row label="إصدار التخطيط" value={n(props.versions.layoutVersion)} mono />
        <Row label="إصدار الباركود" value={n(props.versions.barcodeVersion)} mono />
        <Row label="إصدار نموذج المحتوى" value={n(props.contentModelVersion)} mono />
      </Section>
    </aside>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="dpp-section">
      <h3 className="dpp-section-title">{title}</h3>
      <dl className="dpp-rows">{children}</dl>
    </section>
  );
}

function Row({ label, value, mono }: { label: string; value: string; mono?: boolean }) {
  return (
    <div className="dpp-row">
      <dt>{label}</dt>
      <dd className={mono ? 'is-mono' : undefined} dir={mono ? 'ltr' : undefined}>{value}</dd>
    </div>
  );
}
