/**
 * Calibration Studio — Measurement Assistant.
 *
 * The operator prints the field-marker test sheet, measures how far each field
 * printed from where it should, and enters that displacement in millimetres. The
 * Assistant converts it to a coordinate correction (see utils/chequeGeometry), shows
 * a live before/after summary and a confidence read-out, and emits a proposal the
 * parent renders as a ghost overlay. It NEVER saves on its own — applying is
 * confirm-gated in the parent and always creates a new template version.
 */
import { useEffect, useMemo, useState } from 'react';
import {
  applyCorrection,
  computeConfidence,
  mmToPercentCorrection,
  type CalibrationGeometry,
  type CorrectionResult,
} from '../../utils/chequeGeometry';
import { FIELD_KEYS, FIELD_LABEL_KEYS, type ChequeTemplate, type FieldKey } from '../../utils/chequeTemplate';
import { useT } from '../../lib/i18n';

export interface CorrectionProposal {
  scope: 'field' | 'all';
  rightMm: number;
  downMm: number;
  proposedTemplate: ChequeTemplate;
  affectedFields: FieldKey[];
  anyClamped: boolean;
  maxRemainingMm: number;
}

interface Props {
  template: ChequeTemplate;
  selectedField: FieldKey;
  geometry: CalibrationGeometry;
  /** A correction from this session was already saved as a new template version. */
  savedAsVersion: boolean;
  onProposalChange: (p: CorrectionProposal | null) => void;
  onApply: (p: CorrectionProposal) => void;
  applyBusy: boolean;
}

export default function MeasurementAssistant({
  template,
  selectedField,
  geometry,
  savedAsVersion,
  onProposalChange,
  onApply,
  applyBusy,
}: Props) {
  const { t } = useT();
  const [scope, setScope] = useState<'field' | 'all'>('field');
  const [rightMm, setRightMm] = useState(0);
  const [downMm, setDownMm] = useState(0);
  // Distinguishes "operator entered 0 mm" (a real, perfect measurement) from
  // "operator has not measured yet" — the two must not read the same confidence.
  const [previewed, setPreviewed] = useState(false);

  const affectedFields = useMemo<FieldKey[]>(
    () => (scope === 'all' ? FIELD_KEYS : [selectedField]),
    [scope, selectedField],
  );

  // Per-field correction results (for the before/after table).
  const results = useMemo<Record<string, CorrectionResult>>(() => {
    const out: Record<string, CorrectionResult> = {};
    for (const fk of affectedFields) {
      out[fk] = mmToPercentCorrection(template[fk], rightMm, downMm, geometry);
    }
    return out;
  }, [affectedFields, template, rightMm, downMm, geometry]);

  const hasMeasurements = rightMm !== 0 || downMm !== 0;
  const anyClamped = Object.values(results).some((r) => r.clamped);
  const maxRemainingMm = Math.max(Math.abs(rightMm), Math.abs(downMm));

  const proposedTemplate = useMemo<ChequeTemplate>(() => {
    let next = template;
    for (const fk of affectedFields) next = applyCorrection(next, fk, results[fk]);
    return next;
  }, [template, affectedFields, results]);

  const confidence = useMemo(
    () => computeConfidence({ previewed, maxRemainingMm, clamped: anyClamped, savedAsVersion }),
    [previewed, maxRemainingMm, anyClamped, savedAsVersion],
  );

  // Emit the proposal (or null when there is nothing to apply) for the ghost overlay.
  useEffect(() => {
    if (!hasMeasurements) {
      onProposalChange(null);
      return;
    }
    onProposalChange({ scope, rightMm, downMm, proposedTemplate, affectedFields, anyClamped, maxRemainingMm });
  }, [hasMeasurements, scope, rightMm, downMm, proposedTemplate, affectedFields, anyClamped, maxRemainingMm, onProposalChange]);

  function reset() {
    setRightMm(0);
    setDownMm(0);
    setPreviewed(false);
  }

  return (
    <div className="chq-ma">
      <div className="chq-ma__head">
        <span className="material-symbols-outlined" aria-hidden="true">straighten</span>
        <div>
          <strong>{t('sec.calib.measurement_assistant')}</strong>
          <p>{t('hint.calib.measurement_assistant_subtitle')}</p>
        </div>
      </div>

      {/* Confidence */}
      <div className={`chq-ma__confidence chq-ma__confidence--${confidence.tone}`}>
        <span className="material-symbols-outlined" aria-hidden="true">
          {confidence.level === 'excellent' ? 'verified' : confidence.level === 'good' ? 'check_circle' : 'tune'}
        </span>
        <div>
          <strong>{confidence.label}</strong>
          <span>{confidence.hint}</span>
        </div>
      </div>

      {/* Scope */}
      <div className="chq-ma__scope" role="group" aria-label={t('a11y.calib.correction_scope')}>
        <button type="button" className={scope === 'field' ? 'is-active' : ''} onClick={() => setScope('field')}>
          {t('lbl.calib.current_field_prefix', { field: t(FIELD_LABEL_KEYS[selectedField]) })}
        </button>
        <button type="button" className={scope === 'all' ? 'is-active' : ''} onClick={() => setScope('all')}>
          {t('lbl.calib.all_fields')}
        </button>
      </div>

      {/* mm inputs */}
      <div className="chq-ma__inputs">
        <label>
          <span>{t('lbl.calib.offset_x_hint')}</span>
          <input
            type="number"
            step={0.5}
            aria-label={t('a11y.calib.offset_x_mm')}
            value={rightMm}
            onChange={(e) => { setRightMm(safeNum(e.target.value)); setPreviewed(true); }}
          />
        </label>
        <label>
          <span>{t('lbl.calib.offset_y_hint')}</span>
          <input
            type="number"
            step={0.5}
            aria-label={t('a11y.calib.offset_y_mm')}
            value={downMm}
            onChange={(e) => { setDownMm(safeNum(e.target.value)); setPreviewed(true); }}
          />
        </label>
      </div>

      {/* Live correction / before-after */}
      {hasMeasurements ? (
        <div className="chq-ma__preview">
          <div className="chq-ma__preview-head">{t('sec.calib.proposed_correction')}</div>
          <table>
            <thead>
              <tr><th>{t('col.calib.field')}</th><th>{t('col.calib.current')}</th><th>{t('col.calib.proposed')}</th><th>Δ</th></tr>
            </thead>
            <tbody>
              {affectedFields.map((fk) => {
                const r = results[fk];
                return (
                  <tr key={fk} className={r.clamped ? 'is-clamped' : ''}>
                    <td>{t(FIELD_LABEL_KEYS[fk])}</td>
                    <td>{template[fk].left.toFixed(1)} / {template[fk].top.toFixed(1)}</td>
                    <td>{r.newLeft.toFixed(1)} / {r.newTop.toFixed(1)}</td>
                    <td>{r.dLeftPct >= 0 ? '+' : ''}{r.dLeftPct.toFixed(2)} / {r.dTopPct >= 0 ? '+' : ''}{r.dTopPct.toFixed(2)}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
          {anyClamped && (
            <p className="chq-ma__warn">
              <span className="material-symbols-outlined" aria-hidden="true">warning</span>
              {t('msg.calib.clamped_hint')}
            </p>
          )}
          <p className="chq-ma__ghost-hint">
            <span className="material-symbols-outlined" aria-hidden="true">layers</span>
            {t('hint.calib.ghost_preview_explain')}
          </p>
        </div>
      ) : previewed ? (
        <p className="chq-ma__empty">{t('msg.calib.zero_offset')}</p>
      ) : (
        <p className="chq-ma__empty">{t('hint.calib.enter_offset')}</p>
      )}

      {/* Actions */}
      <div className="chq-ma__actions">
        <button
          type="button"
          className="chq-btn chq-btn--primary"
          disabled={!hasMeasurements || applyBusy}
          onClick={() => hasMeasurements && onApply({ scope, rightMm, downMm, proposedTemplate, affectedFields, anyClamped, maxRemainingMm })}
        >
          {applyBusy ? t('msg.saving_ellipsis') : t('action.calib.apply_as_new_version')}
        </button>
        <button type="button" className="chq-btn chq-btn--ghost" onClick={reset} disabled={!hasMeasurements || applyBusy}>
          {t('action.undo')}
        </button>
      </div>
    </div>
  );
}

function safeNum(v: string): number {
  const n = parseFloat(v);
  return isNaN(n) ? 0 : n;
}
