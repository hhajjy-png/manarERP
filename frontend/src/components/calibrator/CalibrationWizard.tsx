/**
 * Calibration Studio — first-run Printer Calibration Wizard.
 *
 * A skippable 5-step guide: print → measure → enter → preview → save. It does not
 * own calibration state; it reuses MeasurementAssistant for the measurement steps
 * and delegates printing/saving to the parent. Skipping or finishing simply closes
 * it — it never interferes with the standard calibration controls.
 */
import { useState } from 'react';
import MeasurementAssistant from './MeasurementAssistant';
import type { CorrectionProposal } from './MeasurementAssistant';
import type { CalibrationGeometry } from '../../utils/chequeGeometry';
import type { ChequeTemplate, FieldKey } from '../../utils/chequeTemplate';

interface Props {
  bank: string;
  template: ChequeTemplate;
  selectedField: FieldKey;
  geometry: CalibrationGeometry;
  applied: boolean;
  applyBusy: boolean;
  onProposalChange: (p: CorrectionProposal | null) => void;
  onApply: (p: CorrectionProposal) => void;
  onPrint: () => void;
  onClose: () => void;
}

const STEPS = [
  { icon: 'print', title: 'اطبع ورقة الاختبار', body: 'اطبع ورقة اختبار المحاذاة (علامات الحقول فقط) على ورقة عادية بمقياس 100٪ وبلا هوامش، ثم ضعها خلف/فوق الشيك الفعلي.' },
  { icon: 'straighten', title: 'قِس الإزاحة', body: 'قارن مواضع علامات الحقول على الورقة بالمواضع الصحيحة على الشيك. قِس مقدار الانزياح بالمليمترات أفقياً ورأسياً.' },
  { icon: 'edit', title: 'أدخل القياسات', body: 'أدخل الإزاحة المقيسة. الإشارة: + يمين/أسفل، − يسار/أعلى.' },
  { icon: 'layers', title: 'عاين التصحيح', body: 'راجع معاينة «قبل/بعد» على لوحة المعايرة (الخط المتقطّع = المقترح) وتأكّد من مؤشّر الثقة.' },
  { icon: 'save', title: 'احفظ كنسخة جديدة', body: 'اضغط «تطبيق كنسخة جديدة». تُحفظ نسخة جديدة دون المساس بالنسخ السابقة.' },
];

export default function CalibrationWizard(props: Props) {
  const { bank, onPrint, onClose, applied } = props;
  const [step, setStep] = useState(0);
  const isMeasureStep = step >= 2; // steps 3–5 use the Assistant

  return (
    <div className="chq-wiz__scrim" onClick={(e) => e.target === e.currentTarget && onClose()}>
      <div className="chq-wiz" role="dialog" aria-label="معالج معايرة الطابعة">
        <div className="chq-wiz__head">
          <div>
            <strong>معالج معايرة الطابعة</strong>
            <span>{bank}</span>
          </div>
          <button type="button" className="chq-btn chq-btn--ghost" onClick={onClose}>تخطّي</button>
        </div>

        {/* progress */}
        <ol className="chq-wiz__steps">
          {STEPS.map((s, i) => (
            <li key={s.title} className={i === step ? 'is-active' : i < step ? 'is-done' : ''}>
              <span className="material-symbols-outlined" aria-hidden="true">{i < step ? 'check' : s.icon}</span>
              <em>{s.title}</em>
            </li>
          ))}
        </ol>

        {applied ? (
          <div className="chq-wiz__done">
            <span className="material-symbols-outlined" aria-hidden="true">task_alt</span>
            <strong>تم حفظ التصحيح كنسخة جديدة</strong>
            <p>يمكنك إعادة طباعة ورقة الاختبار للتأكد من المحاذاة، أو إغلاق المعالج.</p>
            <div className="chq-wiz__foot">
              <button type="button" className="chq-btn chq-btn--ghost" onClick={onPrint}>طباعة ورقة تحقّق</button>
              <button type="button" className="chq-btn chq-btn--primary" onClick={onClose}>إنهاء</button>
            </div>
          </div>
        ) : (
          <>
            <div className="chq-wiz__body">
              <div className="chq-wiz__guide">
                <span className="material-symbols-outlined chq-wiz__guide-icon" aria-hidden="true">{STEPS[step].icon}</span>
                <h4>{STEPS[step].title}</h4>
                <p>{STEPS[step].body}</p>
                {step === 0 && (
                  <button type="button" className="chq-btn chq-btn--primary" onClick={onPrint}>
                    <span className="material-symbols-outlined" aria-hidden="true">print</span> طباعة ورقة الاختبار
                  </button>
                )}
              </div>

              {isMeasureStep && (
                <div className="chq-wiz__assistant">
                  <MeasurementAssistant
                    template={props.template}
                    selectedField={props.selectedField}
                    geometry={props.geometry}
                    savedAsVersion={applied}
                    onProposalChange={props.onProposalChange}
                    onApply={props.onApply}
                    applyBusy={props.applyBusy}
                  />
                </div>
              )}
            </div>

            <div className="chq-wiz__foot">
              <button type="button" className="chq-btn chq-btn--ghost" onClick={() => setStep((s) => Math.max(0, s - 1))} disabled={step === 0}>
                السابق
              </button>
              <span className="chq-wiz__count">{step + 1} / {STEPS.length}</span>
              {step < STEPS.length - 1 ? (
                <button type="button" className="chq-btn chq-btn--primary" onClick={() => setStep((s) => Math.min(STEPS.length - 1, s + 1))}>
                  التالي
                </button>
              ) : (
                <button type="button" className="chq-btn chq-btn--ghost" onClick={onClose}>إغلاق</button>
              )}
            </div>
          </>
        )}
      </div>
    </div>
  );
}
