import { useState } from 'react';
import { api, errorMessage } from '../../api/client';
import { useT } from '../../lib/i18n';
import { Button, Dialog, DialogSection } from '../../components/explorer/ExplorerKit';
import '../../components/explorer/explorer-kit.css';
import { nextReferenceNumber } from '../../forms/shared/formNumber';
import {
  BARCODE_CONTENT_KEYS,
  type BarcodeContent,
} from '../hooks/useCompanyBranding';

/**
 * What the barcode SAYS — the three operator-authored fields, edited in the standard
 * system dialog.
 *
 * This component owns text and nothing else. It does not know the barcode's position,
 * size, angle, opacity, layer or visibility: those live in the branding designer and are
 * untouched by anything here. Splitting it that way is what keeps "what it encodes" and
 * "where it sits" from growing into one tangled surface.
 *
 * PERSISTENCE IS THE SETTINGS ENDPOINT THIS PAGE ALREADY WRITES TO — the same
 * `PUT /settings` call Design Mode's Save makes, with three plain string rows in the
 * `print` group. No table, no endpoint, no store, and no serializer: the values are free
 * text, so there is no shape to encode or validate. `PeriodLockSettings` persists a
 * settings key from a component in exactly this way.
 */
interface Props {
  /** The saved values — also what the reference suggestion is derived from. */
  content: BarcodeContent;
  onSaved: (content: BarcodeContent) => void;
  onClose: () => void;
}

/** Field hint — the kit has no hint class, so it borrows the kit's own muted token. */
const HINT_STYLE: React.CSSProperties = {
  fontSize: 11.5,
  color: 'var(--xpl-muted)',
  marginTop: 1,
};

export default function BarcodeContentDialog({ content, onSaved, onClose }: Props) {
  const { t } = useT();

  /**
   * What the reference suggestion counts from: the reference currently saved, or — when
   * that was cleared by Reset — the last non-empty one, which is exactly what
   * `lastReference` is kept for.
   */
  const suggestionBase = content.reference.trim() || content.lastReference.trim();

  /**
   * The draft opens on the NEXT reference, and on the subject and details EXACTLY as they
   * were last saved — so a run of similar documents is a matter of confirming, not
   * retyping. Only the reference is transformed; the two text fields are carried over
   * untouched, because a subject the system rewrote would be worse than no memory at all.
   *
   * `nextReferenceNumber` returns its input unchanged when there is no trailing number
   * (or nothing saved yet), so a first-time open shows an empty box and a free-text
   * reference like «قرار إداري» is offered back as-is. Seeded in a lazy initialiser, so
   * typing over the proposal is never undone by a re-render.
   */
  const [draft, setDraft] = useState<BarcodeContent>(() => ({
    ...content,
    reference: nextReferenceNumber(suggestionBase),
  }));
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | undefined>(undefined);

  /** True while the reference box still holds the untouched proposal. */
  const suggested = suggestionBase !== '' && draft.reference === nextReferenceNumber(suggestionBase);

  function patch(next: Partial<BarcodeContent>) {
    setDraft((prev) => ({ ...prev, ...next }));
  }

  /**
   * Clears the three fields IN THIS WINDOW only.
   *
   * `lastReference` is deliberately left alone, so the numbering survives: clear, save a
   * sheet with no reference on it, and the next open still proposes the number after the
   * last real one. Nothing is written here — Reset stages, Save commits — so closing the
   * window after a Reset leaves the saved values exactly as they were.
   */
  function resetFields() {
    setDraft((prev) => ({ ...prev, reference: '', subject: '', details: '' }));
  }

  async function save() {
    setSaving(true);
    setError(undefined);
    // Trimmed on the way IN, so the saved reference is exactly what prints and exactly
    // what the next suggestion increments — a stray space would silently defeat both.
    const reference = draft.reference.trim();
    const next: BarcodeContent = {
      reference,
      subject: draft.subject.trim(),
      details: draft.details.trim(),
      // Advances only on a real reference; a cleared one leaves the memory standing.
      lastReference: reference || content.lastReference,
    };
    try {
      await api.put('/settings', {
        settings: [
          { key: BARCODE_CONTENT_KEYS.reference, value: next.reference, group: 'print' },
          { key: BARCODE_CONTENT_KEYS.subject, value: next.subject, group: 'print' },
          { key: BARCODE_CONTENT_KEYS.details, value: next.details, group: 'print' },
          { key: BARCODE_CONTENT_KEYS.lastReference, value: next.lastReference, group: 'print' },
        ],
      });
      onSaved(next);
      onClose();
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setSaving(false);
    }
  }

  return (
    <Dialog
      icon="qr_code_2"
      title={t('dlg.barcode_content.title')}
      subtitle={t('dlg.barcode_content.subtitle')}
      size="md"
      onClose={onClose}
      footer={
        <>
          <Button variant="primary" icon="save" busy={saving} onClick={() => { void save(); }}>
            {t('action.save')}
          </Button>
          <Button
            variant="secondary"
            icon="restart_alt"
            onClick={resetFields}
            title={t('note.barcode.reset_keeps_memory')}
          >
            {t('action.reset')}
          </Button>
          <Button variant="ghost" onClick={onClose}>{t('action.cancel')}</Button>
        </>
      }
    >
      {error && (
        <div className="xpl-form-error">
          <span className="material-symbols-outlined">error</span>{error}
        </div>
      )}

      <DialogSection title={t('field.barcode.reference')} icon="tag">
        <div className="xpl-field xpl-field--full">
          <label htmlFor="barcode-reference">{t('field.barcode.reference')}</label>
          <input
            id="barcode-reference"
            className="xpl-input"
            value={draft.reference}
            placeholder={t('ph.barcode.reference')}
            onChange={(e) => patch({ reference: e.target.value })}
            autoFocus
          />
          <small style={HINT_STYLE}>
            {suggested ? t('note.barcode.suggested') : t('note.barcode.reference_optional')}
          </small>
        </div>
      </DialogSection>

      <DialogSection title={t('field.barcode.subject')} icon="subject">
        <div className="xpl-field xpl-field--full">
          <label htmlFor="barcode-subject">{t('field.barcode.subject')}</label>
          <input
            id="barcode-subject"
            className="xpl-input"
            value={draft.subject}
            placeholder={t('ph.barcode.subject')}
            onChange={(e) => patch({ subject: e.target.value })}
          />
        </div>
      </DialogSection>

      <DialogSection title={t('field.barcode.details')} icon="notes">
        <div className="xpl-field xpl-field--full">
          <label htmlFor="barcode-details">{t('field.barcode.details')}</label>
          <textarea
            id="barcode-details"
            className="xpl-textarea"
            rows={5}
            value={draft.details}
            placeholder={t('ph.barcode.details')}
            onChange={(e) => patch({ details: e.target.value })}
          />
          <small style={HINT_STYLE}>{t('note.barcode.details_hint')}</small>
        </div>
      </DialogSection>
    </Dialog>
  );
}
