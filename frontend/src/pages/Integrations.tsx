import { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  integrationsApi,
  type IntegrationCard,
  type IntegrationCategory,
  type IntegrationSettingsUpdate,
} from '../api/integrations';
import { useAuth } from '../stores/authStore';

// ─── Constants ────────────────────────────────────────────────────────────────

const CATEGORY_LABELS: Record<IntegrationCategory, string> = {
  bank:       'البنوك والمدفوعات',
  import:     'الاستيراد والبيانات',
  backup:     'النسخ الاحتياطي',
  automation: 'الأتمتة',
  future:     'المستقبل',
};

const STATUS_LABELS = {
  available:  { ar: 'متاح',      cls: 'int-badge-green' },
  planned:    { ar: 'قريباً',    cls: 'int-badge-amber' },
  comingSoon: { ar: 'قادم',      cls: 'int-badge-gray' },
} as const;

const MATURITY_LABELS = {
  stable:     { ar: 'مستقر',    cls: 'int-badge-blue' },
  beta:       { ar: 'تجريبي',   cls: 'int-badge-amber' },
  planned:    { ar: 'مخطط',     cls: 'int-badge-gray' },
  foundation: { ar: 'أساسي',    cls: 'int-badge-gray' },
} as const;

const HEALTH_ICONS = {
  ok:          { icon: 'check_circle', cls: 'int-health-ok',      ar: 'يعمل' },
  needsSetup:  { icon: 'settings',     cls: 'int-health-setup',   ar: 'يحتاج إعداد' },
  disabled:    { icon: 'block',        cls: 'int-health-disabled', ar: 'معطّل' },
  unavailable: { icon: 'schedule',     cls: 'int-health-unavail', ar: 'غير متاح بعد' },
} as const;

// ─── Inline Styles ────────────────────────────────────────────────────────────

const PAGE: React.CSSProperties = {
  direction: 'rtl', padding: '28px 32px', maxWidth: 1100, margin: '0 auto',
  fontFamily: '"IBM Plex Sans Arabic", Cairo, Tajawal, Arial, sans-serif',
};
const PAGE_HEADER: React.CSSProperties = {
  marginBottom: 8,
};
const PAGE_TITLE: React.CSSProperties = {
  fontSize: 22, fontWeight: 700, color: 'var(--text-primary, #111827)', margin: 0,
};
const PAGE_SUBTITLE: React.CSSProperties = {
  fontSize: 14, color: 'var(--text-muted, #6b7280)', marginTop: 6, lineHeight: 1.6,
};
const SECTION_TITLE: React.CSSProperties = {
  fontSize: 15, fontWeight: 600, color: 'var(--text-secondary, #374151)',
  marginBottom: 12, marginTop: 28, paddingBottom: 6,
  borderBottom: '1px solid var(--border, #e5e7eb)',
};
const CARD_GRID: React.CSSProperties = {
  display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(320px, 1fr))', gap: 16,
};
const CARD: React.CSSProperties = {
  background: 'var(--bg-card, #fff)',
  border: '1px solid var(--border, #e5e7eb)',
  borderRadius: 10, padding: '16px 20px',
  display: 'flex', flexDirection: 'column', gap: 10,
  boxShadow: '0 1px 3px rgba(0,0,0,0.04)',
};
const CARD_PLANNED: React.CSSProperties = {
  ...CARD, opacity: 0.75,
};
const CARD_HEADER: React.CSSProperties = {
  display: 'flex', alignItems: 'flex-start', gap: 10,
};
const CARD_ICON: React.CSSProperties = {
  fontSize: 28, lineHeight: 1, userSelect: 'none', flexShrink: 0,
};
const CARD_TITLE: React.CSSProperties = {
  fontSize: 15, fontWeight: 700, color: 'var(--text-primary, #111827)', margin: 0,
};
const CARD_DESC: React.CSSProperties = {
  fontSize: 13, color: 'var(--text-muted, #6b7280)', lineHeight: 1.6, margin: 0,
};
const BADGES: React.CSSProperties = {
  display: 'flex', gap: 6, flexWrap: 'wrap',
};
const CAPABILITIES: React.CSSProperties = {
  display: 'flex', gap: 6, flexWrap: 'wrap',
};
const CAP_TAG: React.CSSProperties = {
  fontSize: 11, padding: '2px 8px', borderRadius: 12,
  background: 'var(--bg-hover, #f3f4f6)', color: 'var(--text-secondary, #374151)',
  border: '1px solid var(--border, #e5e7eb)',
};
const CARD_FOOTER: React.CSSProperties = {
  display: 'flex', gap: 8, flexWrap: 'wrap', marginTop: 4,
};
const BTN_PRIMARY: React.CSSProperties = {
  padding: '6px 14px', borderRadius: 6, border: 'none', cursor: 'pointer',
  fontSize: 13, fontWeight: 500,
  background: 'var(--color-brand, #1d4e6f)', color: '#fff',
  fontFamily: 'inherit',
};
const BTN_SECONDARY: React.CSSProperties = {
  padding: '6px 14px', borderRadius: 6,
  border: '1px solid var(--border, #e5e7eb)', cursor: 'pointer',
  fontSize: 13, fontWeight: 500,
  background: 'var(--bg-card, #fff)', color: 'var(--text-secondary, #374151)',
  fontFamily: 'inherit',
};
const BTN_DISABLED: React.CSSProperties = {
  ...BTN_SECONDARY, opacity: 0.45, cursor: 'not-allowed',
};
const HEALTH_ROW: React.CSSProperties = {
  display: 'flex', alignItems: 'center', gap: 6, fontSize: 12,
};

// Settings panel styles
const PANEL_OVERLAY: React.CSSProperties = {
  position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.35)', zIndex: 1000,
  display: 'flex', alignItems: 'center', justifyContent: 'center',
};
const PANEL: React.CSSProperties = {
  background: 'var(--bg-card, #fff)', borderRadius: 12, padding: 28,
  width: 420, maxWidth: '92vw', direction: 'rtl',
  boxShadow: '0 8px 32px rgba(0,0,0,0.15)',
  fontFamily: '"IBM Plex Sans Arabic", Cairo, Tajawal, Arial, sans-serif',
};
const PANEL_TITLE: React.CSSProperties = {
  fontSize: 17, fontWeight: 700, color: 'var(--text-primary, #111827)',
  margin: '0 0 16px',
};
const FORM_GROUP: React.CSSProperties = { marginBottom: 14 };
const FORM_LABEL: React.CSSProperties = {
  display: 'block', fontSize: 13, fontWeight: 600,
  color: 'var(--text-secondary, #374151)', marginBottom: 6,
};
const FORM_INPUT: React.CSSProperties = {
  width: '100%', padding: '8px 10px', borderRadius: 6,
  border: '1px solid var(--border, #e5e7eb)', fontSize: 13,
  fontFamily: 'inherit', boxSizing: 'border-box',
  background: 'var(--bg, #f9fafb)', color: 'var(--text-primary, #111827)',
};
const PANEL_ACTIONS: React.CSSProperties = {
  display: 'flex', gap: 10, justifyContent: 'flex-end', marginTop: 20,
};
const RESULT_BOX: React.CSSProperties = {
  padding: '12px 14px', borderRadius: 8, fontSize: 14, marginTop: 4,
  background: 'var(--bg, #f3f4f6)', color: 'var(--text-secondary, #374151)',
};

// ─── Badge component ──────────────────────────────────────────────────────────

function Badge({ label, cls }: { label: string; cls: string }) {
  const clsMap: Record<string, React.CSSProperties> = {
    'int-badge-green': { background: '#d1fae5', color: '#065f46', border: '1px solid #6ee7b7' },
    'int-badge-amber': { background: '#fef3c7', color: '#92400e', border: '1px solid #fcd34d' },
    'int-badge-gray':  { background: '#f3f4f6', color: '#374151', border: '1px solid #d1d5db' },
    'int-badge-blue':  { background: '#dbeafe', color: '#1e40af', border: '1px solid #93c5fd' },
    'int-badge-red':   { background: '#fee2e2', color: '#991b1b', border: '1px solid #fca5a5' },
  };
  return (
    <span style={{ fontSize: 11, padding: '2px 8px', borderRadius: 10, fontWeight: 600, ...clsMap[cls] }}>
      {label}
    </span>
  );
}

// ─── Health indicator ─────────────────────────────────────────────────────────

function HealthIndicator({ health }: { health: IntegrationCard['health'] }) {
  const { icon, ar } = HEALTH_ICONS[health];
  const colorMap: Record<string, string> = {
    ok:          '#16a34a',
    needsSetup:  '#d97706',
    disabled:    '#6b7280',
    unavailable: '#9ca3af',
  };
  return (
    <span style={{ ...HEALTH_ROW, color: colorMap[health] }}>
      <span className="material-symbols-outlined" style={{ fontSize: 15 }}>{icon}</span>
      {ar}
    </span>
  );
}

// ─── Category icon ────────────────────────────────────────────────────────────

function categoryIcon(cat: IntegrationCategory): string {
  const map: Record<IntegrationCategory, string> = {
    bank:       '🏦',
    import:     '📥',
    backup:     '☁️',
    automation: '⚙️',
    future:     '🔭',
  };
  return map[cat] ?? '🔗';
}

// ─── Settings panel ───────────────────────────────────────────────────────────

interface SettingsPanelProps {
  card:        IntegrationCard;
  canConfigure: boolean;
  onClose():    void;
  onSaved(card: IntegrationCard): void;
}

function SettingsPanel({ card, canConfigure, onClose, onSaved }: SettingsPanelProps) {
  const [enabled, setEnabled]   = useState(card.enabled);
  const [notes, setNotes]       = useState((card.settings.notes as string) ?? '');
  const [saving, setSaving]     = useState(false);
  const [error, setError]       = useState<string | null>(null);

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
    <div style={PANEL_OVERLAY} onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div style={PANEL}>
        <p style={PANEL_TITLE}>إعدادات — {card.nameAr}</p>

        {!canConfigure && (
          <p style={{ fontSize: 13, color: '#b45309', background: '#fef3c7',
            padding: '8px 12px', borderRadius: 6, marginBottom: 14 }}>
            ليست لديك صلاحية تعديل إعدادات هذا التكامل.
          </p>
        )}

        <div style={FORM_GROUP}>
          <label style={FORM_LABEL}>حالة التكامل</label>
          <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13, cursor: canConfigure ? 'pointer' : 'not-allowed' }}>
            <input
              type="checkbox"
              checked={enabled}
              disabled={!canConfigure}
              onChange={(e) => setEnabled(e.target.checked)}
              style={{ width: 15, height: 15 }}
            />
            {enabled ? 'مفعّل' : 'معطّل'}
          </label>
        </div>

        <div style={FORM_GROUP}>
          <label style={FORM_LABEL}>ملاحظات</label>
          <textarea
            value={notes}
            disabled={!canConfigure}
            onChange={(e) => setNotes(e.target.value)}
            maxLength={500}
            rows={3}
            style={{ ...FORM_INPUT, resize: 'vertical' }}
            placeholder="ملاحظات إضافية…"
          />
        </div>

        {card.status === 'planned' || card.status === 'comingSoon' ? (
          <p style={{ fontSize: 12, color: '#6b7280', marginBottom: 12 }}>
            هذا التكامل لم يتم تطويره بعد — حفظ الإعدادات متاح ولكن التشغيل غير ممكن في هذه المرحلة.
          </p>
        ) : null}

        {error && (
          <p style={{ fontSize: 13, color: '#dc2626', marginBottom: 10 }}>{error}</p>
        )}

        <div style={PANEL_ACTIONS}>
          <button type="button" style={BTN_SECONDARY} onClick={onClose}>إغلاق</button>
          {canConfigure && (
            <button type="button" style={BTN_PRIMARY} onClick={handleSave} disabled={saving}>
              {saving ? 'جارٍ الحفظ…' : 'حفظ الإعدادات'}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

// ─── Integration Card ─────────────────────────────────────────────────────────

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
  const isActive = card.status === 'available';
  const statusMeta  = STATUS_LABELS[card.status];
  const maturityMeta = MATURITY_LABELS[card.maturity];

  return (
    <div style={isActive ? CARD : CARD_PLANNED}>
      <div style={CARD_HEADER}>
        <span style={CARD_ICON} aria-hidden="true">{categoryIcon(card.category)}</span>
        <div>
          <p style={CARD_TITLE}>{card.nameAr}</p>
          <p style={{ fontSize: 11, color: 'var(--text-muted, #9ca3af)', margin: '2px 0 0' }}>{card.nameEn}</p>
        </div>
      </div>

      <div style={BADGES}>
        <Badge label={statusMeta.ar}  cls={statusMeta.cls} />
        <Badge label={maturityMeta.ar} cls={maturityMeta.cls} />
        {card.enabled   && isActive && <Badge label="مفعّل"    cls="int-badge-green" />}
        {card.configured && isActive && <Badge label="جاهز"    cls="int-badge-blue" />}
      </div>

      <p style={CARD_DESC}>{card.descriptionAr}</p>

      {card.capabilities.length > 0 && (
        <div style={CAPABILITIES}>
          {card.capabilities.map((c) => (
            <span key={c.id} style={CAP_TAG}>{c.labelAr}</span>
          ))}
        </div>
      )}

      <HealthIndicator health={card.health} />

      {card.lastRunAt && (
        <p style={{ fontSize: 12, color: 'var(--text-muted, #9ca3af)', margin: 0 }}>
          آخر تشغيل: {new Date(card.lastRunAt).toLocaleString('ar-KW')}
        </p>
      )}

      <div style={CARD_FOOTER}>
        {/* Settings button — always visible for read users, action requires configure */}
        <button
          type="button"
          style={canConfigure ? BTN_SECONDARY : BTN_DISABLED}
          onClick={canConfigure ? onSettings : undefined}
          disabled={!canConfigure}
          title={canConfigure ? undefined : 'تحتاج صلاحية integrations.configure'}
        >
          إعدادات
        </button>

        {/* Navigate button — only for available integrations with a route */}
        {card.targetRoute && isActive && (
          <button type="button" style={BTN_SECONDARY} onClick={onNavigate}>
            فتح
          </button>
        )}

        {/* Run / Import button */}
        {isActive ? (
          <button
            type="button"
            style={canRun ? BTN_PRIMARY : BTN_DISABLED}
            onClick={canRun ? onRun : undefined}
            disabled={!canRun}
            title={canRun ? undefined : 'تحتاج صلاحية integrations.run'}
          >
            تشغيل
          </button>
        ) : (
          <button type="button" style={BTN_DISABLED} disabled title="هذا التكامل غير متاح بعد">
            قريباً
          </button>
        )}
      </div>
    </div>
  );
}

// ─── Run Result Dialog ────────────────────────────────────────────────────────

interface RunResultDialogProps {
  messageAr: string;
  onClose(): void;
}

function RunResultDialog({ messageAr, onClose }: RunResultDialogProps) {
  return (
    <div style={PANEL_OVERLAY} onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div style={{ ...PANEL, width: 360 }}>
        <p style={PANEL_TITLE}>نتيجة التشغيل</p>
        <div style={RESULT_BOX}>{messageAr}</div>
        <div style={{ ...PANEL_ACTIONS, marginTop: 16 }}>
          <button type="button" style={BTN_PRIMARY} onClick={onClose}>موافق</button>
        </div>
      </div>
    </div>
  );
}

// ─── Main Page ────────────────────────────────────────────────────────────────

export default function Integrations() {
  const { hasPermission } = useAuth();
  const navigate = useNavigate();

  const [cards, setCards]             = useState<IntegrationCard[]>([]);
  const [loading, setLoading]         = useState(true);
  const [error, setError]             = useState<string | null>(null);
  const [settingsFor, setSettingsFor] = useState<IntegrationCard | null>(null);
  const [runResult, setRunResult]     = useState<string | null>(null);
  const [runningId, setRunningId]     = useState<string | null>(null);

  const canConfigure = hasPermission('integrations.configure');
  const canRun       = hasPermission('integrations.run');

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

  async function handleRun(card: IntegrationCard) {
    // Cards with a targetRoute open the dedicated workflow page instead of calling the API
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

  // Group cards by category, preserving registry order within each group
  const categories = Array.from(new Set(cards.map((c) => c.category)));

  return (
    <div style={PAGE} dir="rtl">
      <div style={PAGE_HEADER}>
        <h1 style={PAGE_TITLE}>
          <span className="material-symbols-outlined" style={{ verticalAlign: 'middle', fontSize: 26, marginLeft: 8 }}>
            hub
          </span>
          مركز التكاملات
        </h1>
        <p style={PAGE_SUBTITLE}>
          ربط النظام بالخدمات الخارجية والبنوك والمنصات — يعمل بشكل محلي بالكامل دون اتصال بالإنترنت إلا عند الحاجة.
          <br />
          التكاملات المتاحة جاهزة للاستخدام. التكاملات القادمة ستُضاف في مراحل قادمة.
        </p>
      </div>

      {loading && (
        <p style={{ color: 'var(--text-muted, #6b7280)', fontSize: 14 }}>جارٍ التحميل…</p>
      )}

      {error && (
        <p style={{ color: '#dc2626', fontSize: 14, background: '#fee2e2', padding: '10px 14px', borderRadius: 6 }}>
          {error}
        </p>
      )}

      {!loading && !error && categories.map((cat) => {
        const catCards = cards.filter((c) => c.category === cat);
        return (
          <section key={cat}>
            <h2 style={SECTION_TITLE}>{CATEGORY_LABELS[cat] ?? cat}</h2>
            <div style={CARD_GRID}>
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

      {settingsFor && (
        <SettingsPanel
          card={settingsFor}
          canConfigure={canConfigure}
          onClose={() => setSettingsFor(null)}
          onSaved={handleSaved}
        />
      )}

      {runResult && (
        <RunResultDialog
          messageAr={runResult}
          onClose={() => setRunResult(null)}
        />
      )}
    </div>
  );
}
