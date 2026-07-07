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

const EQUIPMENT_STATUS: Record<string, { label: string; tone: Tone }> = {
  WORKING: { label: 'تعمل', tone: 'green' },
  NOT_WORKING: { label: 'لا تعمل', tone: 'red' },
};

const MAINTENANCE_STATUS_LABEL: Record<string, string> = {
  SCHEDULED: 'مجدولة',
  IN_PROGRESS: 'قيد التنفيذ',
  COMPLETED: 'مكتملة',
  CANCELLED: 'ملغاة',
};

export default function EquipmentHub({ entity, cfg, onEdit, onDelete, canUpdate, canDelete }: EntityHubProps) {
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

  const statusInfo = entity.status ? EQUIPMENT_STATUS[entity.status as string] : undefined;
  const registration = entity.registration as { remainingText?: string; expiry?: string } | undefined;

  const kpis: DrawerKpi[] = [
    ...(statusInfo ? [{ label: 'الحالة', value: statusInfo.label, tone: statusInfo.tone }] : []),
    ...(registration?.remainingText ? [{ label: 'باقي الترخيص', value: registration.remainingText }] : []),
    ...(registration?.expiry ? [{ label: 'تاريخ انتهاء الترخيص', value: formatDate(registration.expiry) }] : []),
  ];

  const actions: QuickAction[] = [
    { key: 'request-maintenance', icon: 'build_circle', label: 'طلب صيانة', onClick: () => navigate('/maintenance') },
    { key: 'log-fuel', icon: 'local_gas_station', label: 'تسجيل وقود', onClick: () => navigate('/maintenance') },
    ...(canUpdate ? [{ key: 'edit', icon: 'edit', label: 'تعديل', tone: 'primary' as const, onClick: onEdit }] : []),
    ...(canDelete ? [{ key: 'delete', icon: 'delete', label: 'حذف', tone: 'danger' as const, onClick: onDelete }] : []),
  ];

  const maintenanceItems: RelatedItem[] = records.map((r) => ({
    key: String(r.id),
    icon: 'build_circle',
    primary: r.type ?? '—',
    secondary: formatDate(r.date),
    trailing: r.status
      ? (MAINTENANCE_STATUS_LABEL[r.status] ?? r.status)
      : (r.cost != null ? money(r.cost) : undefined),
  }));

  const fuelItems: RelatedItem[] = fuelLogs.map((f) => ({
    key: String(f.id),
    icon: 'local_gas_station',
    primary: formatDate(f.date),
    secondary: `${f.liters ?? 0} لتر${f.odometer != null ? ` • ${f.odometer} كم` : ''}`,
    trailing: f.cost != null ? money(f.cost) : undefined,
  }));

  const activity: ActivityItem[] = [
    ...records.map((r): ActivityItem & { _sort: number } => ({
      key: `maint-${r.id}`,
      icon: 'build_circle',
      title: r.type ?? 'صيانة',
      meta: r.status ? (MAINTENANCE_STATUS_LABEL[r.status] ?? r.status) : undefined,
      timestamp: formatDate(r.date),
      _sort: r.date ? new Date(r.date).getTime() : 0,
    })),
    ...fuelLogs.map((f): ActivityItem & { _sort: number } => ({
      key: `fuel-${f.id}`,
      icon: 'local_gas_station',
      title: `تعبئة وقود — ${f.liters ?? 0} لتر`,
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
      <DrawerInfoGrid title={t('nav.equipment')} items={buildInfoItems(cfg, entity, t)} />
      <DrawerRelated title="سجل الصيانة" loading={loading} items={maintenanceItems} />
      <DrawerRelated title="سجل الوقود" loading={loading} items={fuelItems} />
      <DrawerActivity loading={loading} items={activity} />
    </>
  );
}
