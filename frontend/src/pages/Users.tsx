import { useEffect, useState } from 'react';
import { api, errorMessage } from '../api/client';
import { useAuth } from '../stores/authStore';
import Modal from '../components/Modal';

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

const ACTION_AR: Record<string, string> = {
  read: 'عرض', create: 'إضافة', update: 'تعديل', delete: 'حذف', approve: 'اعتماد', export: 'تصدير',
};
const MODULE_AR: Record<string, string> = {
  dashboard: 'لوحة التحكم', customers: 'العملاء', employees: 'الموظفون',
  attendance: 'الحضور', payroll: 'الرواتب', equipment: 'المعدات',
  maintenance: 'الصيانة', contracts: 'العقود', invoices: 'الفواتير',
  suppliers: 'الموردون', expenses: 'المصروفات', transactions: 'المعاملات',
  reports: 'التقارير', users: 'المستخدمون', roles: 'الأدوار',
  audit: 'سجل التدقيق', backups: 'النسخ الاحتياطي', settings: 'الإعدادات',
};

const EMPTY_FORM = { username: '', password: '', fullName: '', email: '', roleId: '' };

export default function Users() {
  const { hasPermission } = useAuth();
  const canCreate = hasPermission('users.create');
  const canUpdate = hasPermission('users.update');

  const [tab, setTab] = useState<'users' | 'roles'>('users');

  // Users state
  const [users, setUsers] = useState<UserRow[]>([]);
  const [usersLoading, setUsersLoading] = useState(true);

  // Roles state
  const [roles, setRoles] = useState<RoleRow[]>([]);
  const [allPerms, setAllPerms] = useState<Record<string, Permission[]>>({});
  const [expandedRole, setExpandedRole] = useState<{ id: number; keys: string[] } | null>(null);

  // Form state
  const [showForm, setShowForm] = useState(false);
  const [editingUser, setEditingUser] = useState<UserRow | null>(null);
  const [form, setForm] = useState(EMPTY_FORM);
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState('');

  // Message
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

  // ─── Form helpers ────────────────────────────────────────────────────────────
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
    if (!form.fullName.trim()) { setFormError('الاسم الكامل مطلوب'); return; }
    if (!form.roleId) { setFormError('الدور مطلوب'); return; }
    if (!editingUser && !form.password) { setFormError('كلمة المرور مطلوبة للمستخدم الجديد'); return; }

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
        showMsg('تم تحديث المستخدم بنجاح');
      } else {
        await api.post('/users', payload);
        showMsg('تم إنشاء المستخدم بنجاح');
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
    try {
      await api.put(`/users/${u.id}`, { isActive: !u.isActive });
      showMsg(u.isActive ? 'تم تعطيل حساب المستخدم' : 'تم تفعيل حساب المستخدم');
      loadUsers();
    } catch (err) { showMsg(errorMessage(err), 'err'); }
  }

  // ─── Role expand ─────────────────────────────────────────────────────────────
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
          <h2>المستخدمون والصلاحيات</h2>
          <p>إدارة حسابات الدخول والأدوار وصلاحيات كل دور</p>
        </div>
        {tab === 'users' && canCreate && (
          <button className="btn" onClick={openCreate}>＋ مستخدم جديد</button>
        )}
      </div>

      {msg && (
        <div className={`alert ${msg.type === 'ok' ? 'ok' : 'error'}`} style={{ marginBottom: 16 }}>
          {msg.text}
        </div>
      )}

      {/* Tabs */}
      <div style={{ display: 'flex', gap: 8, marginBottom: 16 }}>
        <button className={`btn ${tab === 'users' ? '' : 'secondary'}`} onClick={() => setTab('users')}>
          👤 المستخدمون
        </button>
        <button className={`btn ${tab === 'roles' ? '' : 'secondary'}`} onClick={() => setTab('roles')}>
          🔑 الأدوار والصلاحيات
        </button>
      </div>

      {/* ─── Users Tab ──────────────────────────────────────────────────────────── */}
      {tab === 'users' && (
        <div className="card panel" style={{ padding: 0 }}>
          <div className="table-responsive">
            <table>
              <thead>
                <tr>
                  <th>اسم المستخدم</th>
                  <th>الاسم الكامل</th>
                  <th>الدور</th>
                  <th>الحالة</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {usersLoading ? (
                  <tr><td colSpan={5}><div className="center-msg"><div className="spinner" />جارٍ التحميل…</div></td></tr>
                ) : users.length === 0 ? (
                  <tr><td colSpan={5}><div className="center-msg">لا يوجد مستخدمون</div></td></tr>
                ) : users.map((u) => (
                  <tr key={u.id}>
                    <td><strong style={{ fontFamily: 'monospace' }}>{u.username}</strong></td>
                    <td>{u.fullName}</td>
                    <td><span className="pill blue">{u.role.displayName}</span></td>
                    <td>
                      {u.isActive
                        ? <span className="pill green">نشط</span>
                        : <span className="pill gray">موقوف</span>}
                    </td>
                    <td style={{ textAlign: 'left', whiteSpace: 'nowrap' }}>
                      {canUpdate && (
                        <button className="btn secondary sm" onClick={() => openEdit(u)}>تعديل</button>
                      )}{' '}
                      {canUpdate && (
                        <button
                          className={`btn ${u.isActive ? 'secondary' : ''} sm`}
                          style={u.isActive ? { color: 'var(--danger)' } : {}}
                          onClick={() => toggleActive(u)}
                        >
                          {u.isActive ? 'تعطيل' : 'تفعيل'}
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

      {/* ─── Roles Tab ──────────────────────────────────────────────────────────── */}
      {tab === 'roles' && (
        <div>
          {roles.map((role) => (
            <div key={role.id} className="card panel" style={{ marginBottom: 12 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 8 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                  <strong style={{ fontSize: 15 }}>{role.displayName}</strong>
                  {role.isSystem && <span className="pill blue" style={{ fontSize: 11 }}>نظام</span>}
                  <span style={{ color: 'var(--text-muted)', fontSize: 13 }}>
                    {role._count.users} مستخدم · {role._count.rolePermissions} صلاحية
                  </span>
                </div>
                <button className="btn secondary sm" onClick={() => toggleRoleExpand(role.id)}>
                  {expandedRole?.id === role.id ? '▲ إخفاء' : '▼ الصلاحيات'}
                </button>
              </div>

              {expandedRole?.id === role.id && (
                <div style={{ marginTop: 16, borderTop: '1px solid var(--border)', paddingTop: 16 }}>
                  {Object.entries(allPerms).map(([module, perms]) => {
                    if (perms.length === 0) return null;
                    return (
                      <div key={module} style={{ marginBottom: 14 }}>
                        <div style={{ fontWeight: 600, marginBottom: 6, color: 'var(--text-muted)', fontSize: 12, textTransform: 'uppercase', letterSpacing: 0.5 }}>
                          {MODULE_AR[module] ?? module}
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
                                {ACTION_AR[p.action] ?? p.action}
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

      {/* ─── Form Modal ─────────────────────────────────────────────────────────── */}
      {showForm && (
        <Modal
          title={editingUser ? `تعديل: ${editingUser.username}` : 'مستخدم جديد'}
          onClose={() => setShowForm(false)}
          footer={
            <>
              <button className="btn" onClick={onSave} disabled={saving}>
                {saving ? 'جارٍ الحفظ…' : 'حفظ'}
              </button>
              <button className="btn secondary" onClick={() => setShowForm(false)}>إلغاء</button>
            </>
          }
        >
          {formError && <div className="alert error" style={{ marginBottom: 12 }}>⚠️ {formError}</div>}
          <div className="form-grid">
            {!editingUser && (
              <div className="field">
                <label>اسم المستخدم *</label>
                <input
                  value={form.username}
                  onChange={(e) => setForm({ ...form, username: e.target.value })}
                  placeholder="مثال: ahmed.ali"
                  autoComplete="username"
                />
              </div>
            )}
            <div className="field">
              <label>{editingUser ? 'كلمة المرور الجديدة (اتركها فارغة للإبقاء)' : 'كلمة المرور *'}</label>
              <input
                type="password"
                value={form.password}
                onChange={(e) => setForm({ ...form, password: e.target.value })}
                placeholder="••••••••"
                autoComplete="new-password"
              />
            </div>
            <div className="field">
              <label>الاسم الكامل *</label>
              <input value={form.fullName} onChange={(e) => setForm({ ...form, fullName: e.target.value })} />
            </div>
            <div className="field">
              <label>البريد الإلكتروني</label>
              <input type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} />
            </div>
            <div className="field" style={{ gridColumn: '1 / -1' }}>
              <label>الدور *</label>
              <select value={form.roleId} onChange={(e) => setForm({ ...form, roleId: e.target.value })}>
                <option value="">— اختر دورًا —</option>
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
