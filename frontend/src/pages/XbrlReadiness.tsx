/**
 * صفحة «جاهزية XBRL».
 *
 * ═══ ما تقوله هذه الصفحة وما لا تقوله ═══
 * تقول: كم حسابًا مربوط، ما الأخطاء، ما الذي ينقص قبل أن نصبح جاهزين تقنيًا.
 * **لا تقول** إن النظام متوافق مع QAYD أو وزارة التجارة — لا في عنوان ولا في شارة ولا
 * في نسبة مئوية. أقصى حالة تعرضها هي «جاهز بانتظار تصنيف رسمي».
 *
 * ═══ موضعها ═══
 * خارج الشريط الجانبي عمدًا، تُفتح من رأس صفحة «المحاسبة» — كما تُفتح بقية الشاشات
 * التحليلية الداخلية في هذا النظام. إضافة عنصر سادس عشر إلى القائمة الجانبية لأجل
 * أداة إعداد تُستعمل مرّات معدودة في السنة مقايضة خاسرة.
 */
import { useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { api, errorMessage } from '../api/client';
import { useAuth } from '../stores/authStore';
import { useToast } from '../stores/toastStore';
import { useT } from '../lib/i18n';
import {
  ErrorBanner,
  ExecutiveHeader,
  MetricCard,
  SkeletonRows,
  StatusChip,
  Tabs,
} from '../components/explorer/ExplorerKit';
import '../components/explorer/explorer-kit.css';
import './XbrlReadiness.css';

import XbrlAccountMappingTab from '../components/xbrl/XbrlAccountMappingTab';
import XbrlMappingDialog, { type MappingDraft } from '../components/xbrl/XbrlMappingDialog';
import XbrlOverviewTab from '../components/xbrl/XbrlOverviewTab';
import XbrlSnapshotsTab from '../components/xbrl/XbrlSnapshotsTab';
import XbrlStatementTab from '../components/xbrl/XbrlStatementTab';
import XbrlValidationTab from '../components/xbrl/XbrlValidationTab';
import type {
  XbrlAccountRow,
  XbrlConcept,
  XbrlReadinessReport,
  XbrlSnapshotRow,
  XbrlStatementLine,
} from '../components/xbrl/xbrlTypes';

type Tab = 'overview' | 'accounts' | 'statements' | 'validation' | 'snapshots';

const READINESS_TONE = {
  NOT_READY: 'red',
  IN_PROGRESS: 'orange',
  READY_PENDING_TAXONOMY: 'green',
} as const;

export default function XbrlReadiness() {
  const { t } = useT();
  const navigate = useNavigate();
  const toast = useToast();
  const { hasPermission } = useAuth();

  const canManage = hasPermission('xbrl.manage');
  const canSnapshot = hasPermission('xbrl.snapshot');

  const [tab, setTab] = useState<Tab>('overview');
  const [report, setReport] = useState<XbrlReadinessReport | null>(null);
  const [concepts, setConcepts] = useState<XbrlConcept[]>([]);
  const [statementLines, setStatementLines] = useState<XbrlStatementLine[]>([]);
  const [snapshots, setSnapshots] = useState<XbrlSnapshotRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [editing, setEditing] = useState<XbrlAccountRow | null>(null);
  const [saving, setSaving] = useState(false);
  const [snapshotBusy, setSnapshotBusy] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const { data } = await api.get('/xbrl/readiness');
      const readiness: XbrlReadinessReport = data.data;
      setReport(readiness);

      // المفاهيم وبنود القوائم تخصّ التصنيف المفعَّل وحده — بلا تصنيف لا يوجد ما يُجلب.
      const taxonomyId = readiness.taxonomy?.id;
      const [conceptsRes, linesRes, snapshotsRes] = await Promise.all([
        taxonomyId ? api.get('/xbrl/concepts', { params: { taxonomyId } }) : Promise.resolve(null),
        taxonomyId ? api.get('/xbrl/statement-mappings', { params: { taxonomyId } }) : Promise.resolve(null),
        api.get('/xbrl/snapshots'),
      ]);
      setConcepts(conceptsRes?.data.data ?? []);
      setStatementLines(linesRes?.data.data ?? []);
      setSnapshots(snapshotsRes.data.data ?? []);
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { void load(); }, [load]);

  const saveMapping = useCallback(async (draft: MappingDraft) => {
    if (!editing || !report?.taxonomy) return;
    setSaving(true);
    try {
      if (editing.mappingId) {
        await api.patch(`/xbrl/account-mappings/${editing.mappingId}`, {
          ...(draft.conceptId != null && { conceptId: draft.conceptId }),
          status: draft.status,
          // «غير مطلوب» يُعطَّل السطر معه: استثناء صريح لا ربط فعّال.
          isEnabled: draft.status !== 'NOT_APPLICABLE',
          notes: draft.notes || null,
        });
      } else {
        await api.post('/xbrl/account-mappings', {
          taxonomyId: report.taxonomy.id,
          accountId: editing.accountId,
          conceptId: draft.conceptId,
          status: draft.status,
          isEnabled: draft.status !== 'NOT_APPLICABLE',
          notes: draft.notes || null,
        });
      }
      toast.ok(t('xbrl.toast.mapping_saved'));
      setEditing(null);
      await load();
    } catch (err) {
      toast.error(errorMessage(err));
    } finally {
      setSaving(false);
    }
  }, [editing, report, load, toast, t]);

  const removeMapping = useCallback(async () => {
    if (!editing?.mappingId) return;
    setSaving(true);
    try {
      await api.delete(`/xbrl/account-mappings/${editing.mappingId}`);
      toast.ok(t('xbrl.toast.mapping_removed'));
      setEditing(null);
      await load();
    } catch (err) {
      toast.error(errorMessage(err));
    } finally {
      setSaving(false);
    }
  }, [editing, load, toast, t]);

  const createSnapshot = useCallback(async () => {
    setSnapshotBusy(true);
    try {
      const { data } = await api.post('/xbrl/snapshots', {});
      toast.ok(t('xbrl.toast.snapshot_created', { number: data.data.snapshotNumber }));
      await load();
    } catch (err) {
      toast.error(errorMessage(err));
    } finally {
      setSnapshotBusy(false);
    }
  }, [load, toast, t]);

  const tabs = useMemo(
    () => [
      { key: 'overview' as const, label: t('xbrl.tab.overview'), icon: 'dashboard' },
      { key: 'accounts' as const, label: t('xbrl.tab.accounts'), icon: 'account_tree' },
      { key: 'statements' as const, label: t('xbrl.tab.statements'), icon: 'lab_profile' },
      { key: 'validation' as const, label: t('xbrl.tab.validation'), icon: 'rule' },
      { key: 'snapshots' as const, label: t('xbrl.tab.snapshots'), icon: 'photo_camera' },
    ],
    [t],
  );

  const score = report?.score;

  return (
    <div className="xpl-scope xpl-page xbrl-page">
      <ExecutiveHeader
        icon="schema"
        title={t('xbrl.title')}
        subtitle={t('xbrl.subtitle')}
        onBack={() => navigate('/accounting')}
        chips={
          report && (
            <>
              {report.context && <StatusChip icon="event_note">{t('xbrl.chip.fiscal_year', { year: report.context.fiscalYear })}</StatusChip>}
              <StatusChip tone={report.taxonomy?.status === 'ACTIVE' ? 'green' : 'neutral'} icon="schema">
                {report.taxonomy ? report.taxonomy.code : t('xbrl.chip.no_taxonomy')}
              </StatusChip>
              {score && (
                <StatusChip tone={READINESS_TONE[score.status]} icon="donut_large">
                  {t(`xbrl.readiness.${score.status}`)}
                </StatusChip>
              )}
              {/* شارة دائمة: لا تصنيف رسمي مثبَّت. تختفي وحدها يوم يُثبَّت واحد. */}
              {score && !score.officialTaxonomyInstalled && (
                <StatusChip tone="orange" icon="gpp_maybe">{t('xbrl.chip.no_official')}</StatusChip>
              )}
            </>
          )
        }
      />

      {error && <ErrorBanner>{error}</ErrorBanner>}

      {loading && !report ? (
        <SkeletonRows rows={6} withAvatar={false} />
      ) : report && score ? (
        <>
          <div className="xpl-metrics xbrl-kpis">
            <MetricCard icon="account_tree" tone="indigo" label={t('xbrl.kpi.accounts')} value={score.applicableAccounts} />
            <MetricCard icon="link" tone="green" label={t('xbrl.kpi.mapped')} value={score.mapped} sub={`${score.mappedPercentage}%`} />
            <MetricCard icon="link_off" tone="red" label={t('xbrl.kpi.unmapped')} value={score.unmapped} />
            <MetricCard icon="pending" tone="orange" label={t('xbrl.kpi.needs_review')} value={score.needsReview} />
            <MetricCard icon="error" tone="red" label={t('xbrl.kpi.errors')} value={score.errorCount} />
            <MetricCard icon="warning" tone="orange" label={t('xbrl.kpi.warnings')} value={score.warningCount} />
          </div>

          <Tabs<Tab> tabs={tabs} active={tab} onChange={setTab} />

          {tab === 'overview' && <XbrlOverviewTab report={report} />}
          {tab === 'accounts' && (
            <XbrlAccountMappingTab
              accounts={report.accounts}
              canManage={canManage}
              hasTaxonomy={Boolean(report.taxonomy)}
              onEdit={setEditing}
            />
          )}
          {tab === 'statements' && (
            <XbrlStatementTab lines={statementLines} hasTaxonomy={Boolean(report.taxonomy)} />
          )}
          {tab === 'validation' && <XbrlValidationTab validation={report.validation} />}
          {tab === 'snapshots' && (
            <XbrlSnapshotsTab
              snapshots={snapshots}
              canSnapshot={canSnapshot}
              busy={snapshotBusy}
              onCreate={createSnapshot}
            />
          )}
        </>
      ) : null}

      {editing && (
        <XbrlMappingDialog
          account={editing}
          concepts={concepts}
          busy={saving}
          onClose={() => setEditing(null)}
          onSave={saveMapping}
          onRemove={removeMapping}
        />
      )}
    </div>
  );
}
