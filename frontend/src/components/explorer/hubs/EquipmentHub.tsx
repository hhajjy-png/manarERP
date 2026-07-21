import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { api } from '../../../api/client';
import { useT } from '../../../lib/i18n';
import { money } from '../../../config/modules';
import { formatDate } from '../../../lib/date';
import {
  DrawerHeaderCard, DrawerQuickActions, DrawerInfoGrid, DrawerRelated, DrawerActivity,
  type DrawerKpi, type QuickAction, type RelatedItem, type ActivityItem, type Tone,
} from '../ExplorerKit';
import { buildInfoItems, type EntityHubProps } from './hubTypes';

interface MaintenanceRecord {
  id: number;
  type?: string;
  date?: string;
  status?: string;
  cost?: number | null;
}

interface FuelLog {
  id: number;
  liters?: number;
  odometer?: number | null;
  date?: string;
  cost?: number | null;
}

const EQUIPMENT_STATUS: Record<string, { key: string; tone: Tone }> = {
  WORKING: { key: 'opt.eq.working', tone: 'green' },
  NOT_WORKING: { key: 'opt.eq.not_working', tone: 'red' },
};

const MAINTENANCE_STATUS_KEYS: Record<string, string> = {
  SCHEDULED: 'opt.maint.scheduled',
  IN_PROGRESS: 'opt.maint.in_progress',
  COMPLETED: 'opt.maint.completed',
  CANCELLED: 'opt.maint.cancelled',
};

export default function EquipmentHub({ entity, cfg, onEdit, onDelete, canUpdate, canDelete, busy }: EntityHubProps) {
  const { t } = useT();
  const navigate = useNavigate();
  const id = entity.id as number;

  const [records, setRecords] = useState<MaintenanceRecord[]>([]);
  const [fuelLogs, setFuelLogs] = useState<FuelLog[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let alive = true;
    setLoading(true);
    setRecords([]);
    setFuelLogs([]);

    // Endpoints mirrored 1:1 from existing callers:
    //  - /maintenance/records?equipmentId=  → Maintenance.tsx load() (res.data.data is the plain array)
    //  - /maintenance/fuel?equipmentId=     → Maintenance.tsx FuelTab load() (res.data.data is the plain array)
    Promise.allSettled([
      api.get('/maintenance/records', { params: { equipmentId: id } }),
      api.get('/maintenance/fuel', { params: { equipmentId: id } }),
    ]).then(([recRes, fuelRes]) => {
      if (!alive) return;

      if (recRes.status === 'fulfilled') {
        const list = recRes.value?.data?.data;
        if (Array.isArray(list)) setRecords(list);
      }

      if (fuelRes.status === 'fulfilled') {
        const list = fuelRes.value?.data?.data;
        if (Array.isArray(list)) setFuelLogs(list);
      }

      setLoading(false);
    });

    return () => { alive = false; };
  }, [id]);

  function maintStatusLabel(status: string | undefined): string | undefined {
    if (!status) return undefined;
    const key = MAINTENANCE_STATUS_KEYS[status];
    return key ? t(key) : status;
  }

  const statusInfo = entity.status ? EQUIPMENT_STATUS[entity.status as string] : undefined;
  const registration = entity.registration as { remainingText?: string; expiry?: string } | undefined;

  const kpis: DrawerKpi[] = [
    ...(statusInfo ? [{ label: t('col.status'), value: t(statusInfo.key), tone: statusInfo.tone }] : []),
    ...(registration?.remainingText ? [{ label: t('hub.equipment.kpi_license_remaining'), value: registration.remainingText }] : []),
    ...(registration?.expiry ? [{ label: t('hub.equipment.kpi_license_expiry'), value: formatDate(registration.expiry) }] : []),
  ];

  const actions: QuickAction[] = [
    { key: 'request-maintenance', icon: 'build_circle', label: t('hub.equipment.action_request_maintenance'), onClick: () => navigate('/maintenance') },
    { key: 'log-fuel', icon: 'local_gas_station', label: t('hub.equipment.action_log_fuel'), onClick: () => navigate('/maintenance') },
    ...(canUpdate ? [{ key: 'edit', icon: 'edit', label: t('action.edit'), tone: 'primary' as const, onClick: onEdit }] : []),
    ...(canDelete ? [{ key: 'delete', icon: 'delete', label: t('action.delete'), tone: 'danger' as const, onClick: onDelete, disabled: busy }] : []),
  ];

  const maintenanceItems: RelatedItem[] = records.map((r) => ({
    key: String(r.id),
    icon: 'build_circle',
    primary: r.type ?? '—',
    secondary: formatDate(r.date),
    trailing: r.status
      ? maintStatusLabel(r.status)
      : (r.cost != null ? money(r.cost) : undefined),
  }));

  const fuelItems: RelatedItem[] = fuelLogs.map((f) => ({
    key: String(f.id),
    icon: 'local_gas_station',
    primary: formatDate(f.date),
    secondary: `${f.liters ?? 0} ${t('hub.equipment.unit_liters')}${f.odometer != null ? ` • ${f.odometer} ${t('hub.equipment.unit_km')}` : ''}`,
    trailing: f.cost != null ? money(f.cost) : undefined,
  }));

  const activity: ActivityItem[] = [
    ...records.map((r): ActivityItem & { _sort: number } => ({
      key: `maint-${r.id}`,
      icon: 'build_circle',
      title: r.type ?? t('hub.equipment.fallback_maintenance_title'),
      meta: maintStatusLabel(r.status),
      timestamp: formatDate(r.date),
      _sort: r.date ? new Date(r.date).getTime() : 0,
    })),
    ...fuelLogs.map((f): ActivityItem & { _sort: number } => ({
      key: `fuel-${f.id}`,
      icon: 'local_gas_station',
      title: t('hub.equipment.fuel_activity_title', { liters: f.liters ?? 0 }),
      meta: f.cost != null ? money(f.cost) : undefined,
      timestamp: formatDate(f.date),
      _sort: f.date ? new Date(f.date).getTime() : 0,
    })),
  ]
    .sort((a, b) => b._sort - a._sort)
    .map(({ _sort, ...rest }) => rest);

  return (
    <>
      <DrawerHeaderCard
        icon={cfg.explorerIcon ?? 'construction'}
        title={String(entity.code ?? entity.type ?? '')}
        subtitle={[entity.type, entity.plateNumber].filter(Boolean).join(' • ') || undefined}
        kpis={kpis}
      />
      <DrawerQuickActions actions={actions} />
      <DrawerInfoGrid title={t('nav.equipment')} items={buildInfoItems(cfg, entity, t, ['code', 'type', 'plateNumber'])} />
      <DrawerRelated title={t('hub.equipment.related_maintenance')} loading={loading} items={maintenanceItems} />
      <DrawerRelated title={t('hub.equipment.related_fuel')} loading={loading} items={fuelItems} />
      <DrawerActivity loading={loading} items={activity} />
    </>
  );
}
