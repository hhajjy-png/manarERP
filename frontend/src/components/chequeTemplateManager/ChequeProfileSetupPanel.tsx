import { A4_LANDSCAPE_MM, SETUP_PLACEHOLDER_SURFACE_CM } from '../../modules/chequePrint';
import type { BankChequeProfileDefinition } from '../../modules/chequePrint';
import './chequeProfileSetupPanel.css';

/**
 * SETUP STATE for a registered bank whose cheque has not been measured yet.
 *
 * The calibration studio needs a document to edit — a surface, a field table,
 * coordinates. A bank awaiting its physical specimen has none of those, and the
 * one thing that must never happen is filling them in from another bank. So the
 * studio does not open a designer here: it states what the profile is, what it
 * is missing, and that printing stays blocked until those measurements exist.
 *
 * The sheet drawn below is a NEUTRAL A4-proportioned outline (see
 * `SETUP_PLACEHOLDER_SURFACE_CM`) with no cheque area inside it — deliberately
 * not any bank's cheque size, and never a print profile: the printability guard
 * still refuses the template, so nothing here can become ink.
 *
 * It renders no cheque photo at all. A bank with no image of its own shows an
 * empty sheet, which is the honest state.
 */

type Props = {
  profile: BankChequeProfileDefinition;
};

/** What has to arrive with the physical cheque before this profile can print. */
const REQUIRED_INPUTS: { label: string; hint: string }[] = [
  { label: 'أبعاد الشيك الفعلية', hint: 'العرض × الارتفاع بالمليمتر، مقيسة من الشيك الأصلي' },
  { label: 'موضع الشيك على ورقة A4', hint: 'إحداثيات الزاوية العليا اليسرى لمنطقة الشيك على الورقة' },
  { label: 'صورة الشيك للمعاينة', hint: 'صورة هذا البنك وحده — معاينة فقط ولا تدخل الطباعة الفعلية' },
  { label: 'إحداثيات المستفيد', hint: 'الموضع والعرض والارتفاع بالمليمتر داخل الشيك' },
  { label: 'إحداثيات التاريخ', hint: 'كتلة واحدة بخانات اليوم والشهر والسنة داخلها' },
  { label: 'إحداثيات المبلغ بالأرقام', hint: 'داخل المربع المطبوع على الشيك' },
  { label: 'إحداثيات التفقيط', hint: 'مع ارتفاع يسمح بسطرين عند الحاجة' },
];

export default function ChequeProfileSetupPanel({ profile }: Props) {
  return (
    <div className="cpsp-root" dir="rtl">
      <div className="cpsp-head">
        <span className="material-symbols-outlined cpsp-head-icon" aria-hidden="true">rule</span>
        <div>
          <strong className="cpsp-title">{profile.displayName}</strong>
          <span className="cpsp-status" data-testid="cpsp-status">غير معاير — يلزم شيك أصلي</span>
        </div>
      </div>

      <p className="cpsp-lede">
        هذا القالب مسجَّل ومربوط بالبنك، لكن شيكه الأصلي لم يُقَس بعد. الطباعة الفعلية
        موقوفة لهذا البنك، ولا تُستعار أبعاد أو إحداثيات أو صورة أي قالب آخر —
        الحبر في غير موضعه على شيك حقيقي أسوأ من عدم الطباعة.
      </p>

      <div className="cpsp-body">
        <div className="cpsp-sheet-col">
          {/* Neutral empty sheet: A4 proportions, no cheque area, no photo. */}
          <div
            className="cpsp-sheet"
            data-testid="cpsp-placeholder-sheet"
            style={{ aspectRatio: `${SETUP_PLACEHOLDER_SURFACE_CM.widthCm} / ${SETUP_PLACEHOLDER_SURFACE_CM.heightCm}` }}
          >
            <span className="cpsp-sheet-caption">
              {`A4 ${A4_LANDSCAPE_MM.widthMm} × ${A4_LANDSCAPE_MM.heightMm} مم`}
              <em>لم تُحدَّد منطقة الشيك بعد</em>
            </span>
          </div>
        </div>

        <div className="cpsp-req-col">
          <strong className="cpsp-req-title">المطلوب لاعتماد هذا القالب</strong>
          <ul className="cpsp-req-list">
            {REQUIRED_INPUTS.map((item) => (
              <li key={item.label}>
                <span className="material-symbols-outlined" aria-hidden="true">radio_button_unchecked</span>
                <span>
                  <strong>{item.label}</strong>
                  <em>{item.hint}</em>
                </span>
              </li>
            ))}
          </ul>
          <p className="cpsp-note">
            بعد إدخالها يُفتح هذا القالب في استوديو المعايرة نفسه الذي يستخدمه قالب
            الخليج، وتُحفظ معايرته في مفتاحه المستقل <code>{profile.settingKey}</code>.
          </p>
        </div>
      </div>
    </div>
  );
}
