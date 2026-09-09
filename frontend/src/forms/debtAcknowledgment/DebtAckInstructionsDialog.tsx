/**
 * «تعليمات مهمة قبل التوقيع والاستخدام» + المصادر القانونية + التنبيه — **على الشاشة وحدها**.
 *
 * ═══ لماذا خرجت من المستند ═══
 * قرار مالك المنتج: هذه الصفحة إرشادٌ لمن يملأ النموذج، لا جزءٌ من الإقرار الذي
 * يوقّعه المدين. فما عاد لها أن تُطبع ولا أن تُعدّ صفحةً في المستند. **ولم يُحذف منها
 * حرف**: نصّها الثلاثيّ باقٍ كما نُقل من ملفات DOCX في `content.ar/en/hi.ts`
 * (`guidanceTitle` · `guidanceRows` · `sourcesHeading` · `sources` · `disclaimer`)،
 * ويُقرأ هنا من الحزمة نفسها — بلا اختصار ولا إعادة صياغة ولا ترجمة وقت التشغيل.
 *
 * ═══ ولماذا مكوّن مستقلّ خارج القالب ═══
 * `FormLayout` يضع أبناءه داخل `.form-page` — وهي **العقدة الوحيدة** التي تُستنسخ إلى
 * المعاينة الدقيقة وإلى الطباعة وإلى تصدير PDF. فلو عاش هذا الحوار هناك لبلغ الورق
 * ساعةَ فتحه. لذلك يُصيَّر خارج `FormLayout` كلّه (شقيقًا له كما يفعل حوار المعاينة
 * الدقيقة)، فلا يدخل شجرة الطباعة أصلًا — لا مفتوحًا ولا مغلقًا، ولا حاجة إلى
 * `.no-print` ليحرسه.
 *
 * ═══ اللغة ═══
 * الحوار يتبع لغة **القالب** المختار لا لغة الواجهة: من يقرأ نموذجًا هنديًّا يقرأ
 * تعليماته الهندية. والنصّ يأتي من حزمة تلك اللغة مباشرةً، فلا يمرّ بقاموس الواجهة
 * ولا بأي ترجمة آلية.
 */
import Modal from '../../components/Modal';
import { useT } from '../../lib/i18n';
import { DEBT_ACK_CONTENT } from './DebtAcknowledgmentTemplate';
import type { DebtAckLang } from './debtAcknowledgmentModel';

interface Props {
  lang: DebtAckLang;
  onClose: () => void;
}

export default function DebtAckInstructionsDialog({ lang, onClose }: Props) {
  const { t } = useT();
  const c = DEBT_ACK_CONTENT[lang];

  return (
    <Modal
      title={c.guidanceTitle}
      size="lg"
      onClose={onClose}
      footer={
        <button type="button" className="btn" onClick={onClose}>
          {t('page.debtAck.ok')}
        </button>
      }
    >
      <div dir={c.dir} lang={lang} data-eda-instructions style={{ lineHeight: 1.7 }}>
        <table className="table" style={{ width: '100%', borderCollapse: 'collapse', marginBottom: 16 }}>
          <tbody>
            {c.guidanceRows.map((row) => (
              <tr key={row.label}>
                <th
                  scope="row"
                  style={{
                    width: '25%',
                    textAlign: c.dir === 'rtl' ? 'right' : 'left',
                    verticalAlign: 'top',
                    padding: '6px 8px',
                    color: 'var(--primary)',
                    fontWeight: 700,
                  }}
                >
                  {row.label}
                </th>
                <td style={{ padding: '6px 8px', verticalAlign: 'top' }}>{row.text}</td>
              </tr>
            ))}
          </tbody>
        </table>

        <h4 style={{ margin: '0 0 6px', color: 'var(--primary)' }}>{c.sourcesHeading}</h4>
        <ul style={{ margin: '0 0 14px', paddingInlineStart: 20, fontSize: 13 }}>
          {c.sources.map((source) => (
            <li key={source} style={{ marginBottom: 3 }}>
              {source}
            </li>
          ))}
        </ul>

        <p style={{ margin: 0, fontWeight: 700, color: 'var(--red)', fontSize: 13 }}>{c.disclaimer}</p>
      </div>
    </Modal>
  );
}
