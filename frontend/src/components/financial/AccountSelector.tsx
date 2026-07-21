import { useEffect, useState } from 'react';
import { api } from '../../api/client';
import { useT } from '../../lib/i18n';

interface Account { id: number; code: string; name: string; type: string; }
interface Props { value?: number; onChange: (id: number) => void; }

export function AccountSelector({ value, onChange }: Props) {
  const { t } = useT();
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [search,   setSearch]   = useState('');

  useEffect(() => {
    api.get<{ data: { data?: Account[]; } | Account[] }>('/accounting/accounts', { params: { isActive: true, pageSize: 500 } })
      .then(r => {
        const raw = r.data.data;
        const list: Account[] = Array.isArray(raw)
          ? raw
          : (raw as { data?: Account[] }).data ?? [];
        setAccounts(list);
      })
      .catch(() => {});
  }, []);

  const filtered = accounts.filter(a =>
    a.code.includes(search) || a.name.includes(search)
  );

  return (
    <div className="account-selector">
      <input
        type="text"
        placeholder={t('fc.ph.search_account')}
        value={search}
        onChange={e => setSearch(e.target.value)}
        title={t('fc.title.search_accounts')}
        aria-label={t('fc.title.search_accounts')}
      />
      <select
        size={6}
        value={value ?? ''}
        onChange={e => onChange(Number(e.target.value))}
        aria-label={t('fc.title.select_account')}
        title={t('fc.title.select_account')}
      >
        {filtered.map(a => (
          <option key={a.id} value={a.id}>{a.code} — {a.name}</option>
        ))}
      </select>
    </div>
  );
}
