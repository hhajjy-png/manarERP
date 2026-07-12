import { useState, useEffect, useCallback, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  integrationsApi,
  type IntegrationCard,
  type IntegrationCategory,
  type IntegrationSettingsUpdate,
} from '../api/integrations';
import { useAuth } from '../stores/authStore';
import { formatDate } from '../lib/date';
import './Integrations.css';

// ─── Constants ────────────────────────────────────────────────────────────────

const CATEGORY_LABELS: Record<IntegrationCategory, string> = {
  bank:       'البنوك والمدفوعات',
  import:     'الاستيراد والبيانات',
  backup:     'النسخ الاحتياطي',
  automation: 'الأتمتة',
  future:     'المستقبل',
};

// Package D — Quick filter chips
const QUICK_CHIPS: { key: string; label: string }[] = [
  { key: 'all',    label: 'الكل' },
  { key: 'active', label: 'يعمل' },
  { key: 'ready',  label: 'جاهز' },
  { key: 'soon',   label: 'قريباً' },
  { key: 'planned', label: 'مخطط' },
  { key: 'backup', label: 'النسخ الاحتياطي' },
  { key: 'bank',   label: 'البنوك' },
  { key: 'excel',  label: 'Excel' },
  { key: 'ai',     label: 'AI' },
];

// Package O — Roadmap items (static, read-only)
const ROADMAP_ITEMS: { icon: string; name: string; label: string; labelCls: string }[] = [
  { icon: '🏦', name: 'Open Banking',      label: 'قريباً',    labelCls: 'amber' },
  { icon: '🤖', name: 'AI Assistant',      label: 'مخطط',     labelCls: 'gray'  },
  { icon: '📄', name: 'OCR Documents',     label: 'مخطط',     labelCls: 'gray'  },
  { icon: '📱', name: 'Mobile Companion',  label: 'مستقبلاً', labelCls: 'blue'  },
  { icon: '🔗', name: 'API Integrations',  label: 'مستقبلاً', labelCls: 'blue'  },
];

// Package N — Health panel items
const HEALTH_ITEMS: { id: string; nameAr: string; icon: string }[] = [
  { id: 'payroll-bank-import',   nameAr: 'استيراد رواتب البنك',     icon: '💰' },
  { id: 'bank-statement-import', nameAr: 'استيراد كشف البنك',       icon: '📊' },
  { id: 'enhanced-excel-import', nameAr: 'استيراد Excel المحسّن',   icon: '📈' },
  { id: 'connector-sdk',         nameAr: 'AI Assistant',            icon: '🤖' },
];

// ─── Per-integration extra metadata (Packages K, L, M) ───────────────────────

interface ExtraCardMeta {
  formats?: string[];
  entities?: string[];
  banks?: string[];
  version?: string;
  provider?: string;
  encryption?: string;
  retention?: string;
}

function getExtraCardMeta(id: string): ExtraCardMeta {
  switch (id) {
    case 'payroll-bank-import':
      return {
        formats:  ['Excel', 'CSV'],
        banks:    ['Gulf Bank', 'NBK', 'KFH', 'Boubyan', '+2 بنوك'],
        version:  'v1.0 مستقر',
      };
    case 'bank-statement-import':
      return {
        formats: ['Excel', 'CSV', 'XML'],
        banks:   ['Gulf Bank', 'NBK', 'KFH', 'Boubyan', 'Warba', 'Ahli', '+1'],
        version: 'v1.0 مستقر',
      };
    case 'enhanced-excel-import':
      return {
        formats:  ['Excel', '.xlsx', '.xls'],
        entities: ['عملاء', 'موردون', 'موظفون', 'معدات', 'عقود', 'مصروفات', 'أسعار'],
        version:  'v1.0 مستقر',
      };
    case 'bank-reconciliation':
      return { version: 'مخطط' };
    case 'connector-sdk':
      return { version: 'قريباً' };
    default:
      return {};
  }
}

// ─── Icon helpers ─────────────────────────────────────────────────────────────

function cardIcon(id: string, category: IntegrationCategory): string {
  const idMap: Record<string, string> = {
    'payroll-bank-import':    '💰',
    'bank-statement-import':  '📊',
    'bank-reconciliation':    '🔗',
    'enhanced-excel-import':  '📈',
    'connector-sdk':          '🔌',
  };
  const catMap: Record<IntegrationCategory, string> = {
    bank:       '🏦',
    import:     '📥',
    backup:     '☁️',
    automation: '⚙️',
    future:     '🔭',
  };
  return idMap[id] ?? catMap[category] ?? '🔗';
}

// ─── Filter helpers (Package R — memoized) ────────────────────────────────────

function chipMatches(card: IntegrationCard, chip: string): boolean {
  switch (chip) {
    case 'all':     return true;
    case 'active':  return card.status === 'available' && card.health === 'ok';
    case 'ready':   return card.status === 'available';
    case 'soon':    return card.status === 'planned' || card.status === 'comingSoon';
    case 'planned': return card.maturity === 'planned';
    case 'backup':  return card.category === 'backup';
    case 'bank':    return card.category === 'bank';
    case 'excel':   return (
      card.id.includes('excel') ||
      card.capabilities.some((c) => c.id.includes('excel'))
    );
    case 'ai':      return card.category === 'automation' || card.category === 'future';
    default:        return true;
  }
}

function searchMatches(card: IntegrationCard, q: string): boolean {
  if (!q) return true;
  const lower = q.toLowerCase();
  return (
    card.nameAr.includes(q)               ||
    card.nameEn.toLowerCase().includes(lower) ||
    card.descriptionAr.includes(q)        ||
    card.descriptionEn.toLowerCase().includes(lower) ||
    card.capabilities.some((c) => c.labelAr.includes(q))
  );
}

// ─── Status / health display helpers ─────────────────────────────────────────

function statusDotCls(card: IntegrationCard): 'green' | 'amber' | 'gray' {
  if (card.status === 'available' && card.health === 'ok') return 'green';
  if (card.status === 'available') return 'amber';
  return 'gray';
}

function statusLabel(card: IntegrationCard): string {
  if (card.status === 'available' && card.enabled && card.health === 'ok') return '🟢 يعمل';
  if (card.status === 'available' && card.health === 'needsSetup') return '🔵 جاهز';
  if (card.status === 'available') return '🔵 متاح';
  if (card.status === 'planned') return '🟡 قريباً';
  return '⚪ مخطط';
}

function healthLabel(health: IntegrationCard['health']): { text: string; dot: 'green' | 'amber' | 'gray' } {
  switch (health) {
    case 'ok':          return { text: 'يعمل',             dot: 'green' };
    case 'needsSetup':  return { text: 'يحتاج إعداد',      dot: 'amber' };
    case 'disabled':    return { text: 'معطّل',            dot: 'gray'  };
    case 'unavailable': return { text: 'غير متاح بعد',    dot: 'gray'  };
  }
}

// ─── Settings Panel (Package S — logic preserved, restyled) ──────────────────

interface SettingsPanelProps {
  card:         IntegrationCard;
  canConfigure: boolean;
  onClose():    void;
  onSaved(card: IntegrationCard): void;
}

function SettingsPanel({ card, canConfigure, onClose, onSaved }: SettingsPanelProps) {
  const [enabled, setEnabled] = useState(card.enabled);
  const [notes, setNotes]     = useState((card.settings.notes as string) ?? '');
  const [saving, setSaving]   = useState(false);
  const [error, setError]     = useState<string | null>(null);

  async function handleSave() {
    setSaving(true);
    setError(null);
    try {
      const update: IntegrationSettingsUpdate = { enabled, notes };
      const updated = await integrationsApi.updateSettings(card.id, update);
      onSaved(updated);
    } catch {
      setError('حدث خطأ أثناء الحفظ');
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="ic-overlay" onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="ic-modal">
        <p className="ic-modal-title">⚙ إعدادات — {card.nameAr}</p>

        {!canConfigure && (
          <div className="ic-warn-box">
            ليست لديك صلاحية تعديل إعدادات هذا التكامل.
          </div>
        )}

        <div className="ic-form-group">
          <label className="ic-form-label">حالة التكامل</label>
          <label className={`ic-form-checkbox-label${canConfigure ? '' : ' disabled'}`}>
            <input
              type="checkbox"
              checked={enabled}
              disabled={!canConfigure}
              onChange={(e) => setEnabled(e.target.checked)}
              className="ic-form-checkbox"
            />
            {enabled ? 'مفعّل' : 'معطّل'}
          </label>
        </div>

        <div className="ic-form-group">
          <label className="ic-form-label">ملاحظات</label>
          <textarea
            value={notes}
            disabled={!canConfigure}
            onChange={(e) => setNotes(e.target.value)}
            maxLength={500}
            rows={3}
            className="ic-form-input ic-form-textarea"
            placeholder="ملاحظات إضافية…"
          />
        </div>

        {(card.status === 'planned' || card.status === 'comingSoon') && (
          <p className="ic-form-note">
            هذا التكامل لم يتم تطويره بعد — حفظ الإعدادات متاح ولكن التشغيل غير ممكن في هذه المرحلة.
          </p>
        )}

        {error && <p className="ic-error-text">{error}</p>}

        <div className="ic-modal-actions">
          <button type="button" className="ic-btn ic-btn-ghost" onClick={onClose}>إغلاق</button>
          {canConfigure && (
            <button type="button" className="ic-btn ic-btn-primary" onClick={handleSave} disabled={saving}>
              {saving ? 'جارٍ الحفظ…' : 'حفظ الإعدادات'}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

// ─── Run Result Dialog (Package S — logic preserved, restyled) ───────────────

interface RunResultDialogProps {
  messageAr: string;
  onClose(): void;
}

function RunResultDialog({ messageAr, onClose }: RunResultDialogProps) {
  return (
    <div className="ic-overlay" onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="ic-modal ic-modal-sm">
        <p className="ic-modal-title">نتيجة التشغيل</p>
        <div className="ic-result-box">{messageAr}</div>
        <div className="ic-modal-actions">
          <button type="button" className="ic-btn ic-btn-primary" onClick={onClose}>موافق</button>
        </div>
      </div>
    </div>
  );
}

// ─── System Health Panel (Package N) ─────────────────────────────────────────

function SystemHealthPanel({ cards }: { cards: IntegrationCard[] }) {
  const byId = useMemo(
    () => Object.fromEntries(cards.map((c) => [c.id, c])),
    [cards],
  );

  return (
    <div className="ic-health-panel">
      <p className="ic-panel-title">
        <span>🩺</span>
        حالة التكاملات
      </p>
      <div className="ic-health-rows">
        {HEALTH_ITEMS.map((item) => {
          const card = byId[item.id];
          const hl = card ? healthLabel(card.health) : { text: 'غير محمّل', dot: 'gray' as const };
          return (
            <div key={item.id} className="ic-health-row">
              <span className="ic-health-row-icon">{item.icon}</span>
              <span className="ic-health-row-name">{item.nameAr}</span>
              <span className="ic-health-row-status">
                <span className={`ic-status-dot ${hl.dot}`} />
                {hl.text}
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ─── Roadmap Panel (Package O) ────────────────────────────────────────────────

function RoadmapPanel() {
  return (
    <div className="ic-roadmap-panel">
      <p className="ic-panel-title">
        <span>🗺</span>
        خارطة الطريق
      </p>
      <div className="ic-roadmap-items">
        {ROADMAP_ITEMS.map((item) => (
          <div key={item.name} className="ic-roadmap-item">
            <span className="ic-roadmap-icon">{item.icon}</span>
            <span className="ic-roadmap-name">{item.name}</span>
            <span className={`ic-roadmap-label ${item.labelCls}`}>{item.label}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

// ─── Integration Card View (Packages E–M) ────────────────────────────────────

interface IntegrationCardViewProps {
  card:         IntegrationCard;
  canConfigure: boolean;
  canRun:       boolean;
  onSettings():  void;
  onRun():       void;
  onNavigate():  void;
}

function IntegrationCardView({
  card, canConfigure, canRun, onSettings, onRun, onNavigate,
}: IntegrationCardViewProps) {
  const isActive   = card.status === 'available';
  const extra      = getExtraCardMeta(card.id);
  const dotCls     = statusDotCls(card);
  const statusText = statusLabel(card);

  // Package F — badge color
  const statusBadgeCls =
    card.status === 'available'  ? 'green' :
    card.status === 'planned'    ? 'amber' : 'gray';

  const maturityBadgeCls =
    card.maturity === 'stable'     ? 'blue'  :
    card.maturity === 'beta'       ? 'amber' : 'gray';

  const maturityLabel =
    card.maturity === 'stable'     ? 'مستقر'   :
    card.maturity === 'beta'       ? 'تجريبي'  :
    card.maturity === 'foundation' ? 'أساسي'   : 'مخطط';

  const statusLabelShort =
    card.status === 'available'  ? 'متاح'   :
    card.status === 'planned'    ? 'قريباً' : 'قادم';

  return (
    <div className={`ic-card${isActive ? '' : ' ic-card-planned'}`}>

      {/* Package E / J — header with large icon */}
      <div className="ic-card-header">
        <div className={`ic-card-icon-wrap ${card.category}`}>
          {cardIcon(card.id, card.category)}
        </div>
        <div className="ic-card-title-block">
          <p className="ic-card-title">{card.nameAr}</p>
          <p className="ic-card-subtitle">{card.nameEn}</p>
        </div>
      </div>

      {/* Package F — status badges */}
      <div className="ic-badge-row">
        <span className={`ic-badge ${statusBadgeCls}`}>{statusLabelShort}</span>
        <span className={`ic-badge ${maturityBadgeCls}`}>{maturityLabel}</span>
        {card.enabled  && isActive && <span className="ic-badge green">مفعّل</span>}
        {card.configured && isActive && <span className="ic-badge blue">جاهز</span>}
      </div>

      {/* Description */}
      <p className="ic-card-desc">{card.descriptionAr}</p>

      {/* Package H — capability feature tags */}
      {card.capabilities.length > 0 && (
        <div className="ic-tag-row">
          {card.capabilities.map((c) => (
            <span key={c.id} className="ic-tag">{c.labelAr}</span>
          ))}
        </div>
      )}

      {/* Package K — supported formats */}
      {extra.formats && extra.formats.length > 0 && (
        <div className="ic-tag-row">
          {extra.formats.map((f) => (
            <span key={f} className="ic-tag format">{f}</span>
          ))}
          {extra.banks && extra.banks.slice(0, 4).map((b) => (
            <span key={b} className="ic-tag bank">{b}</span>
          ))}
        </div>
      )}

      {/* Package M — Excel entity chips */}
      {extra.entities && extra.entities.length > 0 && (
        <div className="ic-tag-row">
          {extra.entities.map((e) => (
            <span key={e} className="ic-tag entity">{e}</span>
          ))}
        </div>
      )}

      {/* Version */}
      {extra.version && (
        <p className="ic-card-meta">الإصدار: {extra.version}</p>
      )}

      {/* Package F — animated status indicator */}
      <div className="ic-status-row">
        <span className={`ic-status-dot ${dotCls}`} />
        {statusText}
        {card.lastRunAt && (
          <span className="ic-status-last-run">
            آخر تشغيل: {formatDate(card.lastRunAt)}
          </span>
        )}
      </div>

      <div className="ic-card-divider" />

      {/* Package G — action buttons */}
      <div className="ic-card-footer">
        {/* Settings */}
        <button
          type="button"
          className={`ic-btn ic-btn-ghost${canConfigure ? '' : ''}`}
          onClick={canConfigure ? onSettings : undefined}
          disabled={!canConfigure}
          title={canConfigure ? 'إعدادات التكامل' : 'تحتاج صلاحية integrations.configure'}
        >
          ⚙ إعدادات
        </button>

        {/* Navigate — only for available integrations with a targetRoute */}
        {card.targetRoute && isActive && (
          <button type="button" className="ic-btn ic-btn-ghost" onClick={onNavigate}>
            ℹ فتح
          </button>
        )}

        {/* Run */}
        {isActive ? (
          <button
            type="button"
            className="ic-btn ic-btn-primary"
            onClick={canRun ? onRun : undefined}
            disabled={!canRun}
            title={canRun ? 'تشغيل التكامل' : 'تحتاج صلاحية integrations.run'}
          >
            ▶ تشغيل
          </button>
        ) : (
          <button type="button" className="ic-btn ic-btn-ghost" disabled title="هذا التكامل غير متاح بعد">
            🕒 قريباً
          </button>
        )}
      </div>
    </div>
  );
}

// ─── Main Page ────────────────────────────────────────────────────────────────

export default function Integrations() {
  const { hasPermission } = useAuth();
  const navigate = useNavigate();

  // ── State (Package S — all preserved) ──
  const [cards, setCards]             = useState<IntegrationCard[]>([]);
  const [loading, setLoading]         = useState(true);
  const [error, setError]             = useState<string | null>(null);
  const [settingsFor, setSettingsFor] = useState<IntegrationCard | null>(null);
  const [runResult, setRunResult]     = useState<string | null>(null);
  const [runningId, setRunningId]     = useState<string | null>(null);

  // ── New UI state (Packages C & D) ──
  const [search, setSearch]       = useState('');
  const [activeChip, setActiveChip] = useState('all');

  const canConfigure = hasPermission('integrations.configure');
  const canRun       = hasPermission('integrations.run');

  // ── Load (Package S — preserved exactly) ──
  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await integrationsApi.list();
      setCards(data);
    } catch {
      setError('تعذّر تحميل قائمة التكاملات');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { void load(); }, [load]);

  // ── Handlers (Package S — preserved exactly) ──
  async function handleRun(card: IntegrationCard) {
    if (card.targetRoute) {
      navigate(card.targetRoute);
      return;
    }
    setRunningId(card.id);
    try {
      const result = await integrationsApi.run(card.id);
      setRunResult(result.messageAr);
    } catch {
      setRunResult('حدث خطأ أثناء محاولة التشغيل');
    } finally {
      setRunningId(null);
    }
  }

  function handleSaved(updated: IntegrationCard) {
    setCards((prev) => prev.map((c) => (c.id === updated.id ? updated : c)));
    setSettingsFor(updated);
  }

  // ── Package R — memoized KPI values ──
  const kpiValues = useMemo(() => {
    const activeCount   = cards.filter((c) => c.status === 'available' && c.enabled).length;
    const readyCount    = cards.filter((c) => c.status === 'available').length;
    const futureCount   = cards.filter((c) => c.status === 'planned' || c.status === 'comingSoon').length;
    const lastRun       = cards
      .map((c) => c.lastRunAt)
      .filter(Boolean)
      .sort()
      .reverse()[0];
    const systemOk      = cards.filter((c) => c.status === 'available').every((c) => c.health === 'ok');
    return { activeCount, readyCount, futureCount, lastRun, systemOk };
  }, [cards]);

  // ── Package R — memoized filtered cards ──
  const filteredCards = useMemo(() => {
    return cards.filter(
      (c) => chipMatches(c, activeChip) && searchMatches(c, search.trim()),
    );
  }, [cards, activeChip, search]);

  // Group by category, preserving registry order
  const filteredCategories = useMemo(() => {
    const seen = new Set<IntegrationCategory>();
    const out: IntegrationCategory[] = [];
    for (const c of filteredCards) {
      if (!seen.has(c.category)) { seen.add(c.category); out.push(c.category); }
    }
    return out;
  }, [filteredCards]);

  // ── Package A — header chip counts ──
  const headerCounts = useMemo(() => ({
    active:  cards.filter((c) => c.status === 'available' && c.enabled).length,
    ready:   cards.filter((c) => c.status === 'available').length,
    soon:    cards.filter((c) => c.status === 'planned' || c.status === 'comingSoon').length,
  }), [cards]);

  // ─────────────────────────────────────────────────────────────────────────────

  return (
    <div className="ic-page" dir="rtl">

      {/* ── Package A — Hero Header ── */}
      <div className="ic-header">
        <div className="ic-header-meta">
          <h1>
            <span className="material-symbols-outlined">hub</span>
            مركز التكاملات
          </h1>
          <p>
            إدارة جميع تكاملات النظام والبنوك والاستيراد والنسخ الاحتياطي من مكان واحد.
          </p>
          {!loading && (
            <div className="ic-header-chips">
              <span className="ic-header-tag green">✅ {headerCounts.active} تكامل نشط</span>
              <span className="ic-header-tag blue">⚙️ {headerCounts.ready} جاهز</span>
              <span className="ic-header-tag amber">🕒 {headerCounts.soon} قريباً</span>
              <span className="ic-header-tag gray">📦 النظام v2.0</span>
            </div>
          )}
        </div>
      </div>

      {/* ── Package B — KPI Dashboard ── */}
      {!loading && !error && (
        <div className="ic-kpi-grid">
          <div className="ic-kpi-card">
            <span className="ic-kpi-icon">✅</span>
            <div className="ic-kpi-body">
              <p className="ic-kpi-label">التكاملات المفعلة</p>
              <p className={`ic-kpi-value ${kpiValues.activeCount > 0 ? 'green' : ''}`}>
                {kpiValues.activeCount}
              </p>
              <p className="ic-kpi-sub">من أصل {kpiValues.readyCount} متاح</p>
            </div>
          </div>

          <div className="ic-kpi-card">
            <span className="ic-kpi-icon">⚙️</span>
            <div className="ic-kpi-body">
              <p className="ic-kpi-label">التكاملات الجاهزة</p>
              <p className="ic-kpi-value blue">{kpiValues.readyCount}</p>
              <p className="ic-kpi-sub">مستقرة وقابلة للاستخدام</p>
            </div>
          </div>

          <div className="ic-kpi-card">
            <span className="ic-kpi-icon">🕒</span>
            <div className="ic-kpi-body">
              <p className="ic-kpi-label">التكاملات المستقبلية</p>
              <p className="ic-kpi-value amber">{kpiValues.futureCount}</p>
              <p className="ic-kpi-sub">مخططة أو قادمة قريباً</p>
            </div>
          </div>

          <div className="ic-kpi-card">
            <span className="ic-kpi-icon">{kpiValues.systemOk ? '🟢' : '🟡'}</span>
            <div className="ic-kpi-body">
              <p className="ic-kpi-label">حالة النظام</p>
              <p className={`ic-kpi-value ${kpiValues.systemOk ? 'green' : 'amber'}`}>
                {kpiValues.systemOk ? 'مستقر' : 'تحقق'}
              </p>
              <p className="ic-kpi-sub">
                {kpiValues.lastRun
                  ? `آخر تشغيل: ${formatDate(kpiValues.lastRun)}`
                  : 'لا توجد عمليات سابقة'}
              </p>
            </div>
          </div>
        </div>
      )}

      {/* ── Loading state ── */}
      {loading && <p className="ic-loading">جارٍ تحميل التكاملات…</p>}

      {/* ── Error state ── */}
      {error && <p className="ic-error-banner">{error}</p>}

      {/* ── Packages C & D — Toolbar: search + chips ── */}
      {!loading && !error && (
        <div className="ic-toolbar">
          <div className="ic-search-wrap">
            <span className="material-symbols-outlined ic-search-icon">search</span>
            <input
              type="text"
              className="ic-search"
              placeholder="ابحث عن تكامل..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>
          <div className="ic-chip-row">
            {QUICK_CHIPS.map((chip) => (
              <button
                key={chip.key}
                type="button"
                className={`ic-chip${activeChip === chip.key ? ' active' : ''}`}
                onClick={() => setActiveChip(chip.key)}
              >
                {chip.label}
              </button>
            ))}
          </div>
        </div>
      )}

      {/* ── Cards by category ── */}
      {!loading && !error && filteredCategories.length === 0 && (
        <div className="ic-empty">
          <span className="ic-empty-icon">🔍</span>
          <span>لا توجد تكاملات مطابقة لبحثك</span>
        </div>
      )}

      {!loading && !error && filteredCategories.map((cat) => {
        const catCards = filteredCards.filter((c) => c.category === cat);
        return (
          <section key={cat}>
            <p className="ic-section-title">{CATEGORY_LABELS[cat] ?? cat}</p>
            <div className="ic-card-grid">
              {catCards.map((card) => (
                <IntegrationCardView
                  key={card.id}
                  card={card}
                  canConfigure={canConfigure}
                  canRun={canRun && runningId !== card.id}
                  onSettings={() => setSettingsFor(card)}
                  onRun={() => handleRun(card)}
                  onNavigate={() => card.targetRoute && navigate(card.targetRoute)}
                />
              ))}
            </div>
          </section>
        );
      })}

      {/* ── Packages N & O — Health + Roadmap panels ── */}
      {!loading && !error && cards.length > 0 && (
        <div className="ic-panels-row">
          <SystemHealthPanel cards={cards} />
          <RoadmapPanel />
        </div>
      )}

      {/* ── Settings modal (Package S — preserved) ── */}
      {settingsFor && (
        <SettingsPanel
          card={settingsFor}
          canConfigure={canConfigure}
          onClose={() => setSettingsFor(null)}
          onSaved={handleSaved}
        />
      )}

      {/* ── Run result dialog (Package S — preserved) ── */}
      {runResult && (
        <RunResultDialog
          messageAr={runResult}
          onClose={() => setRunResult(null)}
        />
      )}
    </div>
  );
}
