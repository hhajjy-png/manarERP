import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { api } from '../api/client';
import { useAuth } from '../stores/authStore';
import { useT } from '../lib/i18n';
import './globalSearch.css';

/**
 * البحث الشامل.
 *
 * الحقل في الشريط العلوي كان **زينة**: بلا `value` ولا `onChange` ولا معالِج — يكتب فيه
 * المستخدم فلا يحدث شيء. هذا المكوّن يجعله يعمل.
 *
 * التصميم:
 *   • الخادم يبحث ويحترم الصلاحيات (`/api/search`) — لا تُحمَّل القاعدة إلى الواجهة.
 *   • تأخير 250ms قبل الاستدعاء: الكتابة لا تُطلق طلبًا لكل حرف.
 *   • كل طلب يُلغي سابقه (`AbortController`) — فلا تسبق نتيجةٌ قديمة نتيجةً أحدث.
 *   • الصفحات نفسها نتائج: «الفواتير» تفتح الصفحة حتى قبل وجود بيانات مطابقة.
 *   • لوحة المفاتيح كاملة: Ctrl+K للفتح، أسهم للتنقّل، Enter للفتح، Escape للإغلاق.
 */

interface SearchHit {
  type: 'customer' | 'invoice' | 'employee' | 'equipment' | 'expense' | 'cheque';
  id: number;
  title: string;
  subtitle?: string;
  route: string;
}

/** نتيجة موحّدة: سجلّ من الخادم أو صفحة من التنقّل. */
interface Entry {
  key: string;
  icon: string;
  title: string;
  subtitle?: string;
  route: string;
  group: string;
}

const TYPE_META: Record<SearchHit['type'], { icon: string; group: string }> = {
  customer:  { icon: '🧑‍💼', group: 'العملاء' },
  invoice:   { icon: '🧾', group: 'الفواتير' },
  employee:  { icon: '👤', group: 'الموظفون' },
  equipment: { icon: '🚜', group: 'المعدات' },
  expense:   { icon: '💸', group: 'المصروفات' },
  cheque:    { icon: '🏦', group: 'الشيكات' },
};

/** الصفحات القابلة للفتح — كل واحدة بصلاحيتها، فلا تظهر صفحة لا يملكها المستخدم. */
const PAGES: { label: string; route: string; permission?: string }[] = [
  { label: 'لوحة التحكم',       route: '/',            permission: 'dashboard.read' },
  { label: 'العملاء',           route: '/customers',   permission: 'customers.read' },
  { label: 'الفواتير',          route: '/invoices',    permission: 'invoices.read' },
  { label: 'المصروفات',         route: '/expenses',    permission: 'expenses.read' },
  { label: 'الموظفون',          route: '/employees',   permission: 'employees.read' },
  { label: 'الرواتب',           route: '/salaries',    permission: 'payroll.read' },
  { label: 'المعدات',           route: '/equipment',   permission: 'equipment.read' },
  { label: 'العقود',            route: '/contracts',   permission: 'contracts.read' },
  { label: 'الشيكات',           route: '/cheques',     permission: 'cheques.read' },
  { label: 'المركز المالي',     route: '/financial',   permission: 'financial.read' },
  { label: 'مركز التقارير',     route: '/reports',     permission: 'reports.read' },
  { label: 'المحاسبة',          route: '/accounting',  permission: 'transactions.read' },
  { label: 'سجل التدقيق',       route: '/audit',       permission: 'audit.read' },
  { label: 'الإعدادات',         route: '/settings',    permission: 'settings.read' },
];

const MIN_TERM = 2;
const DEBOUNCE_MS = 250;

/** مطابقة جزئية غير حسّاسة للحالة — تعمل للعربية واللاتينية معًا. */
const matches = (haystack: string, needle: string) =>
  haystack.toLowerCase().includes(needle.toLowerCase());

export default function GlobalSearch() {
  const navigate = useNavigate();
  const { hasPermission } = useAuth();
  const { t } = useT();

  const [term, setTerm] = useState('');
  const [open, setOpen] = useState(false);
  const [hits, setHits] = useState<SearchHit[]>([]);
  const [loading, setLoading] = useState(false);
  const [failed, setFailed] = useState(false);
  const [active, setActive] = useState(0);

  const inputRef = useRef<HTMLInputElement>(null);
  const boxRef = useRef<HTMLDivElement>(null);

  const trimmed = term.trim();

  // ── جلب النتائج: مؤجَّل، ومُلغى عند الكتابة التالية ─────────────────────────
  useEffect(() => {
    if (trimmed.length < MIN_TERM) {
      setHits([]);
      setLoading(false);
      setFailed(false);
      return;
    }
    const controller = new AbortController();
    setLoading(true);
    setFailed(false);
    const timer = setTimeout(() => {
      api
        .get<{ data: SearchHit[] }>('/search', { params: { q: trimmed }, signal: controller.signal })
        .then((res) => {
          setHits(res.data.data ?? []);
          setLoading(false);
        })
        .catch((err) => {
          if (controller.signal.aborted || err?.code === 'ERR_CANCELED') return; // طلب أُلغي — ليس فشلًا
          setHits([]);
          setFailed(true);
          setLoading(false);
        });
    }, DEBOUNCE_MS);

    return () => {
      clearTimeout(timer);
      controller.abort();
    };
  }, [trimmed]);

  // ── النتائج: صفحات (محليًا) + سجلات (من الخادم) ─────────────────────────────
  const entries = useMemo<Entry[]>(() => {
    if (trimmed.length < MIN_TERM) return [];
    const pages: Entry[] = PAGES.filter(
      (p) => (!p.permission || hasPermission(p.permission)) && matches(p.label, trimmed),
    ).map((p) => ({ key: `page:${p.route}`, icon: '📂', title: p.label, route: p.route, group: 'الصفحات' }));

    const records: Entry[] = hits.map((h) => ({
      key: `${h.type}:${h.id}`,
      icon: TYPE_META[h.type].icon,
      title: h.title,
      subtitle: h.subtitle,
      route: h.route,
      group: TYPE_META[h.type].group,
    }));

    return [...pages, ...records];
  }, [hits, trimmed, hasPermission]);

  useEffect(() => setActive(0), [entries.length]);

  const close = useCallback(() => {
    setOpen(false);
    setActive(0);
  }, []);

  const openEntry = useCallback(
    (entry: Entry) => {
      navigate(entry.route);
      setTerm('');
      close();
    },
    [navigate, close],
  );

  // ── لوحة المفاتيح: Ctrl+K يفتح، Escape يغلق ─────────────────────────────────
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        inputRef.current?.focus();
        setOpen(true);
      }
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  // ── النقر خارج اللوحة يغلقها ────────────────────────────────────────────────
  useEffect(() => {
    if (!open) return;
    function onClick(e: MouseEvent) {
      if (boxRef.current && !boxRef.current.contains(e.target as Node)) close();
    }
    document.addEventListener('mousedown', onClick);
    return () => document.removeEventListener('mousedown', onClick);
  }, [open, close]);

  function onInputKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === 'Escape') {
      close();
      inputRef.current?.blur();
      return;
    }
    if (!open || entries.length === 0) return;
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setActive((i) => (i + 1) % entries.length);
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setActive((i) => (i - 1 + entries.length) % entries.length);
    } else if (e.key === 'Enter') {
      e.preventDefault();
      openEntry(entries[active]);
    }
  }

  const showPanel = open && trimmed.length >= MIN_TERM;

  return (
    <div className="search gsx" ref={boxRef}>
      <input
        ref={inputRef}
        type="search"
        value={term}
        placeholder={t('layout.search')}
        onChange={(e) => {
          setTerm(e.target.value);
          setOpen(true);
        }}
        onFocus={() => setOpen(true)}
        onKeyDown={onInputKeyDown}
        role="combobox"
        aria-expanded={showPanel}
        aria-controls="gsx-results"
        aria-autocomplete="list"
      />

      {showPanel && (
        <div className="gsx-panel" id="gsx-results" role="listbox">
          {loading && entries.length === 0 && <div className="gsx-state">جارٍ البحث…</div>}

          {failed && <div className="gsx-state gsx-state-error">تعذّر البحث. حاول مجددًا.</div>}

          {!loading && !failed && entries.length === 0 && (
            <div className="gsx-state">لا نتائج لـ «{trimmed}»</div>
          )}

          {entries.map((entry, i) => (
            <button
              key={entry.key}
              type="button"
              role="option"
              aria-selected={i === active}
              className={`gsx-item ${i === active ? 'active' : ''}`}
              onMouseEnter={() => setActive(i)}
              onClick={() => openEntry(entry)}
            >
              <span className="gsx-icon" aria-hidden="true">{entry.icon}</span>
              <span className="gsx-text">
                <span className="gsx-title">{entry.title}</span>
                {entry.subtitle && <span className="gsx-sub">{entry.subtitle}</span>}
              </span>
              <span className="gsx-group">{entry.group}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
