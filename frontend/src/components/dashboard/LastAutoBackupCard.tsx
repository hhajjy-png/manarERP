import { useEffect, useState } from 'react';
import { api } from '../../api/client';
import { MetricCard } from '../explorer/ExplorerKit';

interface BackupRecord {
  id: number;
  fileName: string;
  sizeBytes: number;
  createdAt: string;
}

function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export default function LastAutoBackupCard() {
  const [record, setRecord] = useState<BackupRecord | null | undefined>(undefined);

  useEffect(() => {
    api.get<{ data: BackupRecord | null }>('/backups/last-auto')
      .then((r) => setRecord(r.data.data))
      .catch(() => setRecord(null));
  }, []);

  const loading = record === undefined;

  let value = '...';
  let sub: string | undefined;

  if (!loading && record === null) {
    value = 'لا توجد نسخة احتياطية';
  } else if (!loading && record) {
    // Compact one-line stamp (Western digits): 10/07/2026 • 11:05 — keeps this card the
    // same height as its neighbours instead of an oversized wrapped datetime.
    const d = new Date(record.createdAt);
    const p2 = (n: number) => String(n).padStart(2, '0');
    value = `${p2(d.getDate())}/${p2(d.getMonth() + 1)}/${d.getFullYear()} • ${p2(d.getHours())}:${p2(d.getMinutes())}`;
    sub = formatSize(record.sizeBytes);
  }

  return (
    <MetricCard
      icon="backup"
      tone="indigo"
      label="آخر نسخة احتياطية تلقائية"
      value={value}
      sub={sub}
    />
  );
}
