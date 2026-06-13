import { useEffect, useState } from 'react';
import { api } from '../../api/client';

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
    value = new Date(record.createdAt).toLocaleDateString('ar-KW', {
      day: 'numeric',
      month: 'short',
      year: 'numeric',
    });
    sub = `${new Date(record.createdAt).toLocaleTimeString('ar-KW', { hour: '2-digit', minute: '2-digit' })} · ${formatSize(record.sizeBytes)}`;
  }

  return (
    <div className="db-stat">
      <div className="db-stat-icon" style={{ background: 'rgba(99,102,241,0.12)' }}>
        💾
      </div>
      <div style={{ minWidth: 0 }}>
        <div className="db-stat-label">آخر نسخة احتياطية تلقائية</div>
        <div className="db-stat-val" style={{ fontSize: loading ? undefined : '0.9rem' }}>
          {value}
        </div>
        {sub && <div className="db-stat-sub">{sub}</div>}
      </div>
    </div>
  );
}
