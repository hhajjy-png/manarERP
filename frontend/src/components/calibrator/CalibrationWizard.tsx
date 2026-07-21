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
import { useT } from '../../lib/i18n';
import { bankLabel } from '../../utils/chequeTemplate';

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
  { icon: 'print', titleKey: 'calib.wizard.step1.title', bodyKey: 'calib.wizard.step1.body' },
  { icon: 'straighten', titleKey: 'calib.wizard.step2.title', bodyKey: 'calib.wizard.step2.body' },
  { icon: 'edit', titleKey: 'calib.wizard.step3.title', bodyKey: 'calib.wizard.step3.body' },
  { icon: 'layers', titleKey: 'calib.wizard.step4.title', bodyKey: 'calib.wizard.step4.body' },
  { icon: 'save', titleKey: 'calib.wizard.step5.title', bodyKey: 'calib.wizard.step5.body' },
];

export default function CalibrationWizard(props: Props) {
  const { bank, onPrint, onClose, applied } = props;
  const { t } = useT();
  const [step, setStep] = useState(0);
  const isMeasureStep = step >= 2; // steps 3–5 use the Assistant

  return (
    <div className="chq-wiz__scrim" onClick={(e) => e.target === e.currentTarget && onClose()}>
      <div className="chq-wiz" role="dialog" aria-label={t('a11y.calib.wizard')}>
        <div className="chq-wiz__head">
          <div>
            <strong>{t('a11y.calib.wizard')}</strong>
            <span>{bankLabel(bank, t)}</span>
          </div>
          <button type="button" className="chq-btn chq-btn--ghost" onClick={onClose}>{t('action.skip')}</button>
        </div>

        {/* progress */}
        <ol className="chq-wiz__steps">
          {STEPS.map((s, i) => (
            <li key={s.titleKey} className={i === step ? 'is-active' : i < step ? 'is-done' : ''}>
              <span className="material-symbols-outlined" aria-hidden="true">{i < step ? 'check' : s.icon}</span>
              <em>{t(s.titleKey)}</em>
            </li>
          ))}
        </ol>

        {applied ? (
          <div className="chq-wiz__done">
            <span className="material-symbols-outlined" aria-hidden="true">task_alt</span>
            <strong>{t('msg.calib.correction_saved_title')}</strong>
            <p>{t('msg.calib.correction_saved_body')}</p>
            <div className="chq-wiz__foot">
              <button type="button" className="chq-btn chq-btn--ghost" onClick={onPrint}>{t('action.calib.print_verify_sheet')}</button>
              <button type="button" className="chq-btn chq-btn--primary" onClick={onClose}>{t('action.finish')}</button>
            </div>
          </div>
        ) : (
          <>
            <div className="chq-wiz__body">
              <div className="chq-wiz__guide">
                <span className="material-symbols-outlined chq-wiz__guide-icon" aria-hidden="true">{STEPS[step].icon}</span>
                <h4>{t(STEPS[step].titleKey)}</h4>
                <p>{t(STEPS[step].bodyKey)}</p>
                {step === 0 && (
                  <button type="button" className="chq-btn chq-btn--primary" onClick={onPrint}>
                    <span className="material-symbols-outlined" aria-hidden="true">print</span> {t('action.calib.print_test_sheet')}
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
                {t('action.prev')}
              </button>
              <span className="chq-wiz__count">{step + 1} / {STEPS.length}</span>
              {step < STEPS.length - 1 ? (
                <button type="button" className="chq-btn chq-btn--primary" onClick={() => setStep((s) => Math.min(STEPS.length - 1, s + 1))}>
                  {t('action.next')}
                </button>
              ) : (
                <button type="button" className="chq-btn chq-btn--ghost" onClick={onClose}>{t('action.close')}</button>
              )}
            </div>
          </>
        )}
      </div>
    </div>
  );
}
