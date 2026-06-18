import { useEffect, useState } from 'react';
import { api, errorMessage } from '../api/client';
import { useAuth } from '../stores/authStore';
import Modal from '../components/Modal';
import { useT } from '../lib/i18n';

type UserRow = {
  id: number;
  username: string;
  fullName: string;
  email?: string | null;
  isActive: boolean;
  role: { id: number; name: string; displayName: string };
};

type RoleRow = {
  id: number;
  name: string;
  displayName: string;
  isSystem: boolean;
  description?: string | null;
  _count: { users: number; rolePermissions: number };
};

type Permission = {
  id: number;
  key: string;
  module: string;
  action: string;
};

const EMPTY_FORM = { username: '', password: '', fullName: '', email: '', roleId: '' };

export default function Users() {
  const { hasPermission } = useAuth();
  const { t } = useT();
  const canCreate = hasPermission('users.create');
  const canUpdate = hasPermission('users.update');

  const [tab, setTab] = useState<'users' | 'roles'>('users');

  const [users, setUsers] = useState<UserRow[]>([]);
  const [usersLoading, setUsersLoading] = useState(true);

  const [roles, setRoles] = useState<RoleRow[]>([]);
  const [allPerms, setAllPerms] = useState<Record<string, Permission[]>>({});
  const [expandedRole, setExpandedRole] = useState<{ id: number; keys: string[] } | null>(null);

  const [showForm, setShowForm] = useState(false);
  const [editingUser, setEditingUser] = useState<UserRow | null>(null);
  const [form, setForm] = useState(EMPTY_FORM);
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState('');
  const [busy, setBusy] = useState(false);

  const [msg, setMsg] = useState<{ text: string; type: 'ok' | 'err' } | null>(null);

  function showMsg(text: string, type: 'ok' | 'err' = 'ok') {
    setMsg({ text, type });
    setTimeout(() => setMsg(null), 6000);
  }

  async function loadUsers() {
    setUsersLoading(true);
    try {
      const res = await api.get('/users', { params: { pageSize: 200 } });
      setUsers(res.data.data.data ?? []);
    } catch { /* ignore */ } finally {
      setUsersLoading(false);
    }
  }

  async function loadRoles() {
    try {
      const [rolesRes, permsRes] = await Promise.all([
        api.get('/roles'),
        api.get('/roles/permissions'),
      ]);
      setRoles(rolesRes.data.data ?? []);
      setAllPerms(permsRes.data.data.grouped ?? {});
    } catch { /* ignore */ }
  }

  useEffect(() => { loadUsers(); loadRoles(); }, []);

  function openCreate() {
    setEditingUser(null);
    setForm({ ...EMPTY_FORM, roleId: roles[0]?.id.toString() ?? '' });
    setFormError('');
    setShowForm(true);
  }

  function openEdit(u: UserRow) {
    setEditingUser(u);
    setForm({ username: u.username, password: '', fullName: u.fullName, email: u.email ?? '', roleId: u.role.id.toString() });
    setFormError('');
    setShowForm(true);
  }

  async function onSave() {
    if (!form.fullName.trim()) { setFormError(t('error.users.fullname_required')); return; }
    if (!form.roleId) { setFormError(t('error.users.role_required')); return; }
    if (!editingUser && !form.password) { setFormError(t('error.users.password_required')); return; }

    setSaving(true);
    setFormError('');
    try {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const payload: any = {
        fullName: form.fullName.trim(),
        email: form.email.trim() || undefined,
        roleId: Number(form.roleId),
      };
      if (form.password) payload.password = form.password;
      if (!editingUser) payload.username = form.username.trim();

      if (editingUser) {
        await api.put(`/users/${editingUser.id}`, payload);
        showMsg(t('msg.users.updated'));
      } else {
        await api.post('/users', payload);
        showMsg(t('msg.users.created'));
      }
      setShowForm(false);
      loadUsers();
    } catch (err) {
      setFormError(errorMessage(err));
    } finally {
      setSaving(false);
    }
  }

  async function toggleActive(u: UserRow) {
    if (busy) return; setBusy(true);
    try {
      await api.put(`/users/${u.id}`, { isActive: !u.isActive });
      showMsg(u.isActive ? t('msg.users.disabled') : t('msg.users.enabled'));
      loadUsers();
    } catch (err) { showMsg(errorMessage(err), 'err'); } finally { setBusy(false); }
  }

  async function toggleRoleExpand(roleId: number) {
    if (expandedRole?.id === roleId) { setExpandedRole(null); return; }
    try {
      const res = await api.get(`/roles/${roleId}`);
      setExpandedRole({ id: roleId, keys: res.data.data.permissionKeys ?? [] });
    } catch { /* ignore */ }
  }

  return (
    <div>
      <div className="page-head">
        <div>
          <h2>{t('page.users.title')}</h2>
          <p>{t('page.users.subtitle')}</p>
        </div>
        {tab === 'users' && canCreate && (
          <button type="button" className="btn" onClick={openCreate}>{t('btn.users.new_user')}</button>
        )}
      </div>

      {msg && (
        <div className={`alert ${msg.type === 'ok' ? 'ok' : 'error'}`} style={{ marginBottom: 16 }}>
          {msg.text}
        </div>
      )}

      <div style={{ display: 'flex', gap: 8, marginBottom: 16 }}>
        <button type="button" className={`btn ${tab === 'users' ? '' : 'secondary'}`} onClick={() => setTab('users')}>
          👤 {t('tab.users.users')}
        </button>
        <button type="button" className={`btn ${tab === 'roles' ? '' : 'secondary'}`} onClick={() => setTab('roles')}>
          🔑 {t('tab.users.roles')}
        </button>
      </div>

      {tab === 'users' && (
        <div className="card panel" style={{ padding: 0 }}>
          <div className="table-responsive">
            <table>
              <thead>
                <tr>
                  <th>{t('col.users.username')}</th>
                  <th>{t('col.users.fullname')}</th>
                  <th>{t('col.users.role')}</th>
                  <th>{t('col.users.status')}</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {usersLoading ? (
                  <tr><td colSpan={5}><div className="center-msg"><div className="spinner" />{t('msg.loading')}</div></td></tr>
                ) : users.length === 0 ? (
                  <tr><td colSpan={5}><div className="center-msg">{t('empty.users')}</div></td></tr>
                ) : users.map((u) => (
                  <tr key={u.id}>
                    <td><strong style={{ fontFamily: 'monospace' }}>{u.username}</strong></td>
                    <td>{u.fullName}</td>
                    <td><span className="pill blue">{u.role.displayName}</span></td>
                    <td>
                      {u.isActive
                        ? <span className="pill green">{t('status.active')}</span>
                        : <span className="pill gray">{t('status.suspended')}</span>}
                    </td>
                    <td style={{ textAlign: 'left', whiteSpace: 'nowrap' }}>
                      {canUpdate && (
                        <button type="button" className="btn secondary sm" onClick={() => openEdit(u)}>{t('action.edit')}</button>
                      )}{' '}
                      {canUpdate && (
                        <button
                          type="button"
                          className={`btn ${u.isActive ? 'secondary' : ''} sm`}
                          style={u.isActive ? { color: 'var(--danger)' } : {}}
                          onClick={() => toggleActive(u)}
                          disabled={busy}
                        >
                          {u.isActive ? t('btn.users.disable') : t('btn.users.enable')}
                        </button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {tab === 'roles' && (
        <div>
          {roles.map((role) => (
            <div key={role.id} className="card panel" style={{ marginBottom: 12 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 8 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                  <strong style={{ fontSize: 15 }}>{role.displayName}</strong>
                  {role.isSystem && <span className="pill blue" style={{ fontSize: 11 }}>{t('lbl.users.system_role')}</span>}
                  <span style={{ color: 'var(--text-muted)', fontSize: 13 }}>
                    {t('lbl.users.role_stats', { users: role._count.users, perms: role._count.rolePermissions })}
                  </span>
                </div>
                <button type="button" className="btn secondary sm" onClick={() => toggleRoleExpand(role.id)}>
                  {expandedRole?.id === role.id ? `▲ ${t('btn.users.hide_perms')}` : `▼ ${t('btn.users.show_perms')}`}
                </button>
              </div>

              {expandedRole?.id === role.id && (
                <div style={{ marginTop: 16, borderTop: '1px solid var(--border)', paddingTop: 16 }}>
                  {Object.entries(allPerms).map(([module, perms]) => {
                    if (perms.length === 0) return null;
                    return (
                      <div key={module} style={{ marginBottom: 14 }}>
                        <div style={{ fontWeight: 600, marginBottom: 6, color: 'var(--text-muted)', fontSize: 12, textTransform: 'uppercase', letterSpacing: 0.5 }}>
                          {t('perm.module.' + module)}
                        </div>
                        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 5 }}>
                          {perms.map((p) => {
                            const granted = expandedRole.keys.includes(p.key);
                            return (
                              <span
                                key={p.key}
                                className={`pill ${granted ? 'green' : 'gray'}`}
                                style={{ opacity: granted ? 1 : 0.35, fontSize: 12 }}
                              >
                                {t('perm.action.' + p.action)}
                              </span>
                            );
                          })}
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      {showForm && (
        <Modal
          title={editingUser ? t('modal.users.edit_prefix') + editingUser.username : t('modal.users.new')}
          onClose={() => setShowForm(false)}
          footer={
            <>
              <button type="button" className="btn" onClick={onSave} disabled={saving}>
                {saving ? t('msg.saving') : t('action.save')}
              </button>
              <button type="button" className="btn secondary" onClick={() => setShowForm(false)}>{t('action.cancel')}</button>
            </>
          }
        >
          {formError && <div className="alert error">⚠️ {formError}</div>}
          <div className="form-grid">
            {!editingUser && (
              <div className="field">
                <label>{t('col.users.username')} *</label>
                <input
                  value={form.username}
                  onChange={(e) => setForm({ ...form, username: e.target.value })}
                  autoComplete="username"
                  autoFocus
                />
              </div>
            )}
            <div className="field">
              <label>{editingUser ? t('field.users.new_password_opt') : `${t('field.users.password')} *`}</label>
              <input
                type="password"
                value={form.password}
                onChange={(e) => setForm({ ...form, password: e.target.value })}
                placeholder="••••••••"
                autoComplete="new-password"
                autoFocus={!!editingUser}
              />
            </div>
            <div className="field">
              <label>{t('col.users.fullname')} *</label>
              <input value={form.fullName} onChange={(e) => setForm({ ...form, fullName: e.target.value })} />
            </div>
            <div className="field">
              <label>{t('field.email')}</label>
              <input type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} />
            </div>
            <div className="field" style={{ gridColumn: '1 / -1' }}>
              <label>{t('col.users.role')} *</label>
              <select value={form.roleId} onChange={(e) => setForm({ ...form, roleId: e.target.value })}>
                <option value="">{t('msg.select_placeholder')}</option>
                {roles.map((r) => (
                  <option key={r.id} value={r.id}>{r.displayName}</option>
                ))}
              </select>
            </div>
          </div>
        </Modal>
      )}
    </div>
  );
}
