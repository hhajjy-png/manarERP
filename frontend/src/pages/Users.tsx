import { useEffect, useMemo, useState } from 'react';
import { api, errorMessage } from '../api/client';
import { useAuth } from '../stores/authStore';
import { useT } from '../lib/i18n';
import { useToast } from '../stores/toastStore';
import {
  ExecutiveHeader,
  IdChip,
  MetricCard,
  Tabs,
  StatusChip,
  SearchBox,
  SectionCard,
  EmptyState,
  SkeletonRows,
  Drawer,
  DrawerSection,
  DrawerField,
  Dialog,
  DialogSection,
  Button,
} from '../components/explorer/ExplorerKit';
import '../components/explorer/explorer-kit.css';
import './Users.css';

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
  const [search, setSearch] = useState('');

  const [roles, setRoles] = useState<RoleRow[]>([]);
  const [allPerms, setAllPerms] = useState<Record<string, Permission[]>>({});
  const [expandedRole, setExpandedRole] = useState<{ id: number; keys: string[] } | null>(null);

  const [showForm, setShowForm] = useState(false);
  const [editingUser, setEditingUser] = useState<UserRow | null>(null);
  const [viewing, setViewing] = useState<UserRow | null>(null);
  const [form, setForm] = useState(EMPTY_FORM);
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState('');
  const [busy, setBusy] = useState(false);

  const toast = useToast();

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
        toast.ok(t('msg.users.updated'));
      } else {
        await api.post('/users', payload);
        toast.ok(t('msg.users.created'));
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
      toast.ok(u.isActive ? t('msg.users.disabled') : t('msg.users.enabled'));
      setViewing(null);
      loadUsers();
    } catch (err) { toast.error(errorMessage(err)); } finally { setBusy(false); }
  }

  async function toggleRoleExpand(roleId: number) {
    if (expandedRole?.id === roleId) { setExpandedRole(null); return; }
    try {
      const res = await api.get(`/roles/${roleId}`);
      setExpandedRole({ id: roleId, keys: res.data.data.permissionKeys ?? [] });
    } catch { /* ignore */ }
  }

  const filteredUsers = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return users;
    return users.filter((u) =>
      u.username.toLowerCase().includes(q) ||
      u.fullName.toLowerCase().includes(q) ||
      (u.email ?? '').toLowerCase().includes(q) ||
      u.role.displayName.toLowerCase().includes(q));
  }, [users, search]);

  const kpi = useMemo(() => ({
    total: users.length,
    active: users.filter((u) => u.isActive).length,
    roles: roles.length,
    systemRoles: roles.filter((r) => r.isSystem).length,
  }), [users, roles]);

  const selectedRole = useMemo(() => roles.find((r) => String(r.id) === form.roleId), [roles, form.roleId]);

  return (
    <div className="xpl-scope xpl-page" dir="rtl">
      <ExecutiveHeader
        icon="admin_panel_settings"
        title={t('page.users.title')}
        subtitle={t('page.users.subtitle')}
        chips={
          <>
            <IdChip icon="group" tone="indigo">{kpi.total} مستخدم</IdChip>
            <IdChip icon="task_alt" tone="green">{kpi.active} نشط</IdChip>
            <IdChip icon="shield" tone="orange">{kpi.roles} دور</IdChip>
          </>
        }
        aside={tab === 'users' && canCreate ? <Button variant="primary" icon="person_add" onClick={openCreate}>{t('btn.users.new_user')}</Button> : undefined}
      />

      <div className="xpl-kpi-grid">
        <MetricCard icon="group" tone="indigo" label={t('tab.users.users')} value={kpi.total} />
        <MetricCard icon="task_alt" tone="green" label={t('status.active')} value={kpi.active} />
        <MetricCard icon="shield" tone="blue" label={t('tab.users.roles')} value={kpi.roles} />
        <MetricCard icon="verified_user" tone="orange" label={t('lbl.users.system_role')} value={kpi.systemRoles} />
      </div>

      <Tabs<'users' | 'roles'>
        active={tab}
        onChange={setTab}
        tabs={[
          { key: 'users', label: t('tab.users.users'), icon: 'group' },
          { key: 'roles', label: t('tab.users.roles'), icon: 'shield' },
        ]}
      />

      {tab === 'users' && (
        <>
          <div className="xpl-toolbar xpl-toolbar--sticky">
            <div className="xpl-toolbar-row">
              <SearchBox value={search} onChange={setSearch} placeholder="ابحث بالاسم أو اسم المستخدم أو الدور…" ariaLabel="بحث في المستخدمين" />
              {canCreate && <Button variant="primary" icon="person_add" onClick={openCreate}>{t('btn.users.new_user')}</Button>}
            </div>
          </div>

          <section className="xpl-card" style={{ overflow: 'hidden' }}>
            {usersLoading ? (
              <div style={{ padding: 16 }}><SkeletonRows rows={6} /></div>
            ) : filteredUsers.length === 0 ? (
              <EmptyState
                icon="group_off"
                tone="neutral"
                title={search ? 'لا يوجد مستخدم مطابق' : t('empty.users')}
                message={search ? 'جرّب كلمة بحث مختلفة.' : undefined}
                action={!search && canCreate ? <Button variant="primary" icon="person_add" onClick={openCreate}>{t('btn.users.new_user')}</Button> : undefined}
              />
            ) : (
              <div className="xpl-table-wrap" style={{ border: 'none', borderRadius: 0 }}>
                <table className="xpl-table">
                  <thead>
                    <tr>
                      <th>{t('col.users.username')}</th>
                      <th>{t('col.users.fullname')}</th>
                      <th>{t('col.users.role')}</th>
                      <th>{t('col.users.status')}</th>
                      <th aria-label="فتح" />
                    </tr>
                  </thead>
                  <tbody>
                    {filteredUsers.map((u) => (
                      <tr key={u.id} className="xpl-row--click" tabIndex={0} role="button"
                        aria-label={`تفاصيل المستخدم ${u.fullName}`}
                        onClick={() => setViewing(u)}
                        onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); setViewing(u); } }}>
                        <td><strong style={{ fontFamily: 'IBM Plex Mono, monospace' }}>{u.username}</strong></td>
                        <td>{u.fullName}</td>
                        <td><StatusChip tone="indigo" icon="shield">{u.role.displayName}</StatusChip></td>
                        <td><StatusChip tone={u.isActive ? 'green' : 'neutral'}>{u.isActive ? t('status.active') : t('status.suspended')}</StatusChip></td>
                        <td className="decx-col-chevron" style={{ width: 32, textAlign: 'center' }}><span className="material-symbols-outlined" aria-hidden="true" style={{ fontSize: 18, color: 'var(--xpl-muted)' }}>chevron_left</span></td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </section>
        </>
      )}

      {tab === 'roles' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          {roles.length === 0 ? (
            <SkeletonRows rows={4} />
          ) : roles.map((role) => (
            <SectionCard key={role.id}>
              <div className="usrx-role-card-head">
                <div className="usrx-role-id">
                  <div className="usrx-role-icon"><span className="material-symbols-outlined" aria-hidden="true">shield</span></div>
                  <div>
                    <div className="usrx-role-name">{role.displayName}</div>
                    <div className="usrx-role-meta">{t('lbl.users.role_stats', { users: role._count.users, perms: role._count.rolePermissions })}</div>
                  </div>
                  {role.isSystem && <StatusChip tone="blue" icon="verified_user">{t('lbl.users.system_role')}</StatusChip>}
                </div>
                <Button variant="secondary" small icon={expandedRole?.id === role.id ? 'expand_less' : 'expand_more'} onClick={() => toggleRoleExpand(role.id)}>
                  {expandedRole?.id === role.id ? t('btn.users.hide_perms') : t('btn.users.show_perms')}
                </Button>
              </div>

              {expandedRole?.id === role.id && (
                <div className="usrx-role-perms">
                  {Object.entries(allPerms).map(([module, perms]) => {
                    if (perms.length === 0) return null;
                    return (
                      <div key={module} className="usrx-perm-group">
                        <div className="usrx-perm-group-title">{t('perm.module.' + module)}</div>
                        <div className="usrx-perm-chips">
                          {perms.map((p) => {
                            const granted = expandedRole.keys.includes(p.key);
                            return (
                              <span key={p.key} className={granted ? '' : 'usrx-perm-denied'}>
                                <StatusChip tone={granted ? 'green' : 'neutral'} icon={granted ? 'check' : 'remove'}>{t('perm.action.' + p.action)}</StatusChip>
                              </span>
                            );
                          })}
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </SectionCard>
          ))}
        </div>
      )}

      {/* ── User detail drawer ── */}
      {viewing && (
        <Drawer
          title={viewing.fullName}
          onClose={() => setViewing(null)}
          hero={
            <div className="xpl-drawer-hero">
              <div className="xpl-drawer-hero-icon"><span className="material-symbols-outlined" aria-hidden="true">account_circle</span></div>
              <div className="xpl-drawer-hero-body">
                <span className="xpl-drawer-hero-title">{viewing.fullName}</span>
                <span className="xpl-drawer-hero-sub">{viewing.username}</span>
                <div style={{ marginTop: 4 }}>
                  <StatusChip tone={viewing.isActive ? 'green' : 'neutral'}>{viewing.isActive ? t('status.active') : t('status.suspended')}</StatusChip>
                </div>
              </div>
            </div>
          }
          footer={
            canUpdate ? (
              <>
                <Button variant="primary" icon="edit" onClick={() => { openEdit(viewing); setViewing(null); }}>{t('action.edit')}</Button>
                <Button variant={viewing.isActive ? 'danger' : 'secondary'} icon={viewing.isActive ? 'block' : 'check_circle'} busy={busy} onClick={() => toggleActive(viewing)}>
                  {viewing.isActive ? t('btn.users.disable') : t('btn.users.enable')}
                </Button>
              </>
            ) : undefined
          }
        >
          <DrawerSection title="بيانات المستخدم">
            <DrawerField label={t('col.users.username')} value={viewing.username} mono />
            <DrawerField label={t('col.users.fullname')} value={viewing.fullName} />
            <DrawerField label={t('field.email')} value={viewing.email || '—'} />
          </DrawerSection>
          <DrawerSection title={t('col.users.role')}>
            <DrawerField label={t('col.users.role')} value={<StatusChip tone="indigo" icon="shield">{viewing.role.displayName}</StatusChip>} />
            <DrawerField label={t('col.users.status')} value={<StatusChip tone={viewing.isActive ? 'green' : 'neutral'}>{viewing.isActive ? t('status.active') : t('status.suspended')}</StatusChip>} />
          </DrawerSection>
        </Drawer>
      )}

      {/* ── Create / edit dialog ── */}
      {showForm && (
        <Dialog
          icon={editingUser ? 'manage_accounts' : 'person_add'}
          title={editingUser ? t('modal.users.edit_prefix') + editingUser.username : t('modal.users.new')}
          subtitle={editingUser ? t('col.users.role') + ': ' + editingUser.role.displayName : 'إنشاء حساب مستخدم جديد'}
          size="md"
          onClose={() => setShowForm(false)}
          footer={
            <>
              <Button variant="primary" icon="save" busy={saving} onClick={onSave}>{t('action.save')}</Button>
              <Button variant="ghost" onClick={() => setShowForm(false)}>{t('action.cancel')}</Button>
            </>
          }
        >
          {formError && <div className="xpl-form-error"><span className="material-symbols-outlined">error</span>{formError}</div>}

          <DialogSection title="الهوية" icon="badge">
            {!editingUser && (
              <div className="xpl-field">
                <label>{t('col.users.username')} <span className="req">*</span></label>
                <input className="xpl-input" value={form.username} onChange={(e) => setForm({ ...form, username: e.target.value })} autoComplete="username" autoFocus aria-label={t('col.users.username')} />
              </div>
            )}
            <div className="xpl-field">
              <label>{t('col.users.fullname')} <span className="req">*</span></label>
              <input className="xpl-input" value={form.fullName} onChange={(e) => setForm({ ...form, fullName: e.target.value })} aria-label={t('col.users.fullname')} />
            </div>
            <div className="xpl-field xpl-field--full">
              <label>{t('field.email')}</label>
              <input className="xpl-input" type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} aria-label={t('field.email')} />
            </div>
          </DialogSection>

          <DialogSection title="الدور والصلاحيات" icon="shield">
            <div className="xpl-field">
              <label>{editingUser ? t('field.users.new_password_opt') : `${t('field.users.password')} `}{!editingUser && <span className="req">*</span>}</label>
              <input className="xpl-input" type="password" value={form.password} onChange={(e) => setForm({ ...form, password: e.target.value })} placeholder="••••••••" autoComplete="new-password" autoFocus={!!editingUser} aria-label={t('field.users.password')} />
            </div>
            <div className="xpl-field">
              <label>{t('col.users.role')} <span className="req">*</span></label>
              <select className="xpl-select" value={form.roleId} onChange={(e) => setForm({ ...form, roleId: e.target.value })} aria-label={t('col.users.role')}>
                <option value="">{t('msg.select_placeholder')}</option>
                {roles.map((r) => <option key={r.id} value={r.id}>{r.displayName}</option>)}
              </select>
              {selectedRole && (
                <span className="usrx-role-hint">
                  <span className="material-symbols-outlined">key</span>
                  {t('lbl.users.role_stats', { users: selectedRole._count.users, perms: selectedRole._count.rolePermissions })}
                </span>
              )}
            </div>
          </DialogSection>
        </Dialog>
      )}
    </div>
  );
}
