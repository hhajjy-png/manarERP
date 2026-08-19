/**
 * حوار ربط حساب بمفهوم XBRL.
 *
 * قائمة المفاهيم تأتي من التصنيف المفعَّل وحده — لا قائمة مفاهيم مكتوبة في الواجهة،
 * ولا وسوم حكومية مقترحة. تصنيف بلا مفاهيم يعني حوارًا يقول ذلك صراحةً بدل قائمة فارغة.
 */
import { useState } from 'react';
import { Button, Dialog, StatusChip } from '../explorer/ExplorerKit';
import { useT } from '../../lib/i18n';
import type { XbrlAccountRow, XbrlConcept, XbrlMappingStatus } from './xbrlTypes';

export interface MappingDraft {
  conceptId: number | null;
  status: Exclude<XbrlMappingStatus, 'UNMAPPED'>;
  notes: string;
}

export default function XbrlMappingDialog({
  account,
  concepts,
  busy,
  onClose,
  onSave,
  onRemove,
}: {
  account: XbrlAccountRow;
  concepts: XbrlConcept[];
  busy: boolean;
  onClose: () => void;
  onSave: (draft: MappingDraft) => void;
  onRemove: () => void;
}) {
  const { t } = useT();
  const [conceptId, setConceptId] = useState<number | null>(account.conceptId);
  const [status, setStatus] = useState<MappingDraft['status']>(
    account.mappingStatus === 'UNMAPPED' ? 'MAPPED' : account.mappingStatus,
  );
  const [notes, setNotes] = useState(account.notes ?? '');
  const [search, setSearch] = useState('');

  const term = search.trim().toLowerCase();
  const visible = term
    ? concepts.filter(
        (c) =>
          c.conceptCode.toLowerCase().includes(term) ||
          c.labelAr.includes(search.trim()) ||
          (c.labelEn ?? '').toLowerCase().includes(term),
      )
    : concepts;

  // «غير مطلوب» قرار صريح باستثناء الحساب، فلا يشترط اختيار مفهوم.
  const canSave = status === 'NOT_APPLICABLE' || conceptId != null;

  return (
    <Dialog
      icon="link"
      title={t('xbrl.dialog.map_title')}
      subtitle={`${account.code} · ${account.name}`}
      onClose={onClose}
      size="lg"
      footer={
        <>
          {account.mappingId != null && (
            <Button variant="danger" icon="link_off" onClick={onRemove} disabled={busy}>
              {t('xbrl.action.unmap')}
            </Button>
          )}
          <div className="xbrl-dialog-spacer" />
          <Button variant="ghost" onClick={onClose} disabled={busy}>{t('action.cancel')}</Button>
          <Button variant="primary" icon="save" busy={busy} disabled={!canSave} onClick={() => onSave({ conceptId, status, notes })}>
            {t('action.save')}
          </Button>
        </>
      }
    >
      {concepts.length === 0 ? (
        <div className="xbrl-dialog-empty">
          <span className="material-symbols-outlined" aria-hidden="true">inventory_2</span>
          <p>{t('xbrl.dialog.no_concepts')}</p>
        </div>
      ) : (
        <>
          <div className="xbrl-dialog-row">
            <label className="xbrl-label" htmlFor="xbrl-status">{t('xbrl.field.mapping_status')}</label>
            <select
              id="xbrl-status"
              className="xbrl-select"
              value={status}
              onChange={(e) => setStatus(e.target.value as MappingDraft['status'])}
            >
              <option value="MAPPED">{t('xbrl.status.MAPPED')}</option>
              <option value="NEEDS_REVIEW">{t('xbrl.status.NEEDS_REVIEW')}</option>
              <option value="NOT_APPLICABLE">{t('xbrl.status.NOT_APPLICABLE')}</option>
            </select>
          </div>

          <div className="xbrl-dialog-row">
            <label className="xbrl-label" htmlFor="xbrl-concept-search">{t('xbrl.dialog.search_concepts')}</label>
            <input
              id="xbrl-concept-search"
              className="xbrl-input"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder={t('xbrl.dialog.search_placeholder')}
            />
          </div>

          <div className="xbrl-concept-list" role="listbox" aria-label={t('xbrl.dialog.concepts')}>
            {visible.length === 0 && <p className="xbrl-muted">{t('xbrl.dialog.no_match')}</p>}
            {visible.map((c) => (
              <button
                key={c.id}
                type="button"
                role="option"
                aria-selected={conceptId === c.id}
                className={`xbrl-concept-item${conceptId === c.id ? ' selected' : ''}`}
                onClick={() => setConceptId(c.id)}
              >
                <span className="xbrl-concept-code ltr">{c.conceptCode}</span>
                <span className="xbrl-concept-label">{c.labelAr}</span>
                <span className="xbrl-concept-meta">
                  <StatusChip tone="neutral">{t(`xbrl.statement.${c.statementType}`)}</StatusChip>
                  {c.isRequired && <StatusChip tone="orange">{t('xbrl.field.required')}</StatusChip>}
                </span>
              </button>
            ))}
          </div>

          <div className="xbrl-dialog-row">
            <label className="xbrl-label" htmlFor="xbrl-notes">{t('xbrl.field.notes')}</label>
            <textarea
              id="xbrl-notes"
              className="xbrl-input"
              rows={2}
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              maxLength={1000}
            />
          </div>
        </>
      )}
    </Dialog>
  );
}
