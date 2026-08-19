/**
 * تبويب «اللقطات».
 *
 * لا زرّ تعديل ولا زرّ حذف في هذا الجدول — ولا يوجد مسار خلفي يقبلهما أصلًا. اللقطة
 * سجل «ما الذي كان صحيحًا آنذاك»، وسجل قابل للتحرير لا يجيب هذا السؤال.
 */
import { Button, EmptyState, SectionCard, StatusChip } from '../explorer/ExplorerKit';
import { useT } from '../../lib/i18n';
import type { XbrlSnapshotRow } from './xbrlTypes';

function dateTimeText(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '—';
  return `${d.toISOString().slice(0, 10)} ${d.toTimeString().slice(0, 5)}`;
}

export default function XbrlSnapshotsTab({
  snapshots,
  canSnapshot,
  busy,
  onCreate,
}: {
  snapshots: XbrlSnapshotRow[];
  canSnapshot: boolean;
  busy: boolean;
  onCreate: () => void;
}) {
  const { t } = useT();

  return (
    <div className="xbrl-tab">
      <SectionCard
        title={t('xbrl.tab.snapshots')}
        icon="photo_camera"
        actions={
          canSnapshot && (
            <Button variant="primary" icon="add_a_photo" busy={busy} onClick={onCreate}>
              {t('xbrl.action.create_snapshot')}
            </Button>
          )
        }
      >
        {snapshots.length === 0 ? (
          <EmptyState icon="photo_camera" title={t('xbrl.snapshots.empty_title')} message={t('xbrl.snapshots.empty_body')} />
        ) : (
          <div className="xbrl-table-wrap">
            <table className="xbrl-table">
              <thead>
                <tr>
                  <th scope="col">{t('xbrl.col.snapshot_number')}</th>
                  <th scope="col">{t('xbrl.col.fiscal_year')}</th>
                  <th scope="col">{t('xbrl.col.period')}</th>
                  <th scope="col">{t('xbrl.col.taxonomy')}</th>
                  <th scope="col">{t('xbrl.col.source_hash')}</th>
                  <th scope="col">{t('xbrl.col.created_by')}</th>
                  <th scope="col">{t('xbrl.col.created_at')}</th>
                </tr>
              </thead>
              <tbody>
                {snapshots.map((s) => (
                  <tr key={s.id}>
                    <td className="ltr mono">{s.snapshotNumber}</td>
                    <td className="ltr">{s.fiscalYear}</td>
                    <td className="ltr">{s.periodStart.slice(0, 10)} — {s.periodEnd.slice(0, 10)}</td>
                    <td>
                      {s.taxonomyCode ? (
                        <span className="xbrl-concept-cell">
                          <span className="ltr mono">{s.taxonomyCode} · {s.taxonomyVersion}</span>
                          <StatusChip tone={s.taxonomyIsOfficial ? 'green' : 'orange'}>
                            {t(s.taxonomyIsOfficial ? 'xbrl.official.yes' : 'xbrl.official.no')}
                          </StatusChip>
                        </span>
                      ) : (
                        <span className="xbrl-muted">—</span>
                      )}
                    </td>
                    {/* البصمة مختصرة بصريًا فقط — القيمة الكاملة في عنوان العنصر وفي الـAPI. */}
                    <td className="ltr mono xbrl-hash" title={s.sourceHash}>{s.sourceHash.slice(0, 12)}…</td>
                    <td>{s.createdByName ?? '—'}</td>
                    <td className="ltr">{dateTimeText(s.createdAt)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        <p className="xbrl-hint">{t('xbrl.snapshots.note')}</p>
      </SectionCard>
    </div>
  );
}
