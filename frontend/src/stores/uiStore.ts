import { create } from 'zustand';
import { isProtectedNavKey, sanitizeHiddenNavKeys } from '../config/navVisibility';
import { persistPreference } from '../lib/syncedPreferences';

type Theme = 'light' | 'dark';
export type Lang = 'ar' | 'en';
/** وضع القائمة الجانبية — تفضيل المستخدم، يُحفظ محليًا. */
export type SidebarMode = 'expanded' | 'collapsed';

interface UIState {
  theme: Theme;
  sidebarOpen: boolean;
  /** ما اختاره المستخدم صراحةً (هو ما يُحفظ). */
  sidebarMode: SidebarMode;
  /** طيّ مؤقّت تفرضه نافذة ضيّقة — للجلسة فقط، ولا يُكتب فوق اختيار المستخدم. */
  sidebarNarrow: boolean;
  lang: Lang;
  privacyMode: boolean;
  /**
   * مفاتيح عناصر القائمة الجانبية التي أخفاها المستخدم — تفضيل عرض فقط.
   * فارغة افتراضيًا ⇒ كل ما تسمح به الصلاحيات يظهر (السلوك الحالي بلا تغيير).
   */
  hiddenNavKeys: string[];
  toggleTheme: () => void;
  toggleSidebar: () => void;
  closeSidebar: () => void;
  toggleSidebarMode: () => void;
  setSidebarNarrow: (narrow: boolean) => void;
  /** يبدّل ظهور عنصر قائمة واحد (بمفتاحه الثابت). العناصر المحمية لا تتأثّر. */
  toggleNavItemVisibility: (key: string) => void;
  /** يعيد القائمة الجانبية إلى وضعها الافتراضي: لا شيء مخفي. */
  showAllNavItems: () => void;
  setLang: (lang: Lang) => void;
  togglePrivacy: () => void;
  /**
   * تسجيل مؤقّت لزرّ تحديث لوحة التحكّم في الشريط العلوي العام — الصفحة التي
   * تملك فعليًا حالة التحديث (refreshKey/refreshing) تسجّل معالِجها هنا عند
   * التركيب وتُلغيه عند التفكيك؛ لا منطق تحديث جديد هنا، مجرّد سلك عرض.
   */
  topbarRefreshHandler: (() => void) | null;
  topbarRefreshBusy: boolean;
  setTopbarRefresh: (handler: (() => void) | null, busy: boolean) => void;
}

const THEME_KEY = 'manar.theme';
const LANG_KEY = 'manar.lang';
const SIDEBAR_KEY = 'manarERP.sidebar.mode';
/** تفضيل ظهور عناصر القائمة — نفس آلية حفظ وضع الطيّ (تفضيل واجهة، لا بيانات). */
const SIDEBAR_HIDDEN_KEY = 'manarERP.sidebar.hiddenItems';

function applyTheme(theme: Theme) {
  document.documentElement.setAttribute('data-theme', theme);
}

function applyLang(lang: Lang) {
  document.documentElement.dir = lang === 'ar' ? 'rtl' : 'ltr';
  document.documentElement.lang = lang;
}

/**
 * الوضع الفعلي = اختيار المستخدم، ما لم تفرض نافذة ضيّقة الطيّ.
 * يُكتب على `<html>` كي يقود CSS عرض القائمة والمحتوى من **مصدر واحد**
 * (`--sidebar-width`) — ويُطبَّق **قبل أول رسم** فلا وميض ولا قفزة تخطيط.
 */
function applySidebar(mode: SidebarMode, narrow: boolean) {
  document.documentElement.setAttribute('data-sidebar', narrow ? 'collapsed' : mode);
}

/** قيمة مخزَّنة غير صالحة (أو غائبة) ⇒ expanded. لا نثق بالتخزين المحلي. */
function readSidebarMode(): SidebarMode {
  try {
    return localStorage.getItem(SIDEBAR_KEY) === 'collapsed' ? 'collapsed' : 'expanded';
  } catch {
    return 'expanded';
  }
}

/**
 * قيمة مخزَّنة غير صالحة (أو غائبة) ⇒ لا شيء مخفي. المفاتيح المحمية تُسقَط عند القراءة
 * أيضًا، فلا يستطيع تخزين محلي معطوب أن يخفي «الإعدادات».
 */
function readHiddenNavKeys(): string[] {
  try {
    const raw = localStorage.getItem(SIDEBAR_HIDDEN_KEY);
    return raw === null ? [] : sanitizeHiddenNavKeys(JSON.parse(raw));
  } catch {
    return [];
  }
}

// Zero Data Loss Certification Pack v1 — إخفاء عناصر القائمة ووضع الشريط الجانبي
// إعدادان ضبطهما المستخدم صراحةً (أُصدرا كميزة «إدارة ظهور الشريط الجانبي»)، لا
// حالة جلسة عابرة. يُحفظان الآن في قاعدة البيانات أيضًا فينتقلان مع النسخة الاحتياطية
// والمزامنة إلى أي جهاز. القراءة تبقى متزامنة من المخبأ المحلي — لا وميض ولا تغيير
// في زمن الإقلاع.
function writeHiddenNavKeys(keys: string[]) {
  try {
    persistPreference(SIDEBAR_HIDDEN_KEY, JSON.stringify(keys));
  } catch {
    /* التخزين غير متاح — الجلسة الحالية تعمل، والاستعادة وحدها ما يضيع */
  }
}

const initialTheme = (localStorage.getItem(THEME_KEY) as Theme) || 'light';
const initialLang = (localStorage.getItem(LANG_KEY) as Lang) || 'ar';
const initialSidebarMode = readSidebarMode();
applyTheme(initialTheme);
applyLang(initialLang);
applySidebar(initialSidebarMode, false);

export const useUI = create<UIState>((set, get) => ({
  theme: initialTheme,
  sidebarOpen: false,
  sidebarMode: initialSidebarMode,
  sidebarNarrow: false,
  lang: initialLang,
  privacyMode: true, // always starts ON — no persistence, no localStorage
  hiddenNavKeys: readHiddenNavKeys(),
  toggleTheme() {
    const theme = get().theme === 'dark' ? 'light' : 'dark';
    localStorage.setItem(THEME_KEY, theme);
    applyTheme(theme);
    set({ theme });
  },
  toggleSidebar() {
    set({ sidebarOpen: !get().sidebarOpen });
  },
  closeSidebar() {
    set({ sidebarOpen: false });
  },
  toggleSidebarMode() {
    const sidebarMode: SidebarMode = get().sidebarMode === 'collapsed' ? 'expanded' : 'collapsed';
    try {
      persistPreference(SIDEBAR_KEY, sidebarMode);
    } catch {
      /* التخزين غير متاح — الجلسة الحالية تعمل، والاستعادة وحدها ما يضيع */
    }
    applySidebar(sidebarMode, get().sidebarNarrow);
    set({ sidebarMode });
  },
  setSidebarNarrow(sidebarNarrow: boolean) {
    if (sidebarNarrow === get().sidebarNarrow) return;
    applySidebar(get().sidebarMode, sidebarNarrow);
    set({ sidebarNarrow });
  },
  toggleNavItemVisibility(key: string) {
    if (isProtectedNavKey(key)) return;
    const current = get().hiddenNavKeys;
    const hiddenNavKeys = current.includes(key)
      ? current.filter((k) => k !== key)
      : [...current, key];
    writeHiddenNavKeys(hiddenNavKeys);
    set({ hiddenNavKeys });
  },
  showAllNavItems() {
    if (get().hiddenNavKeys.length === 0) return;
    writeHiddenNavKeys([]);
    set({ hiddenNavKeys: [] });
  },
  setLang(lang: Lang) {
    localStorage.setItem(LANG_KEY, lang);
    applyLang(lang);
    set({ lang });
  },
  togglePrivacy() {
    set({ privacyMode: !get().privacyMode });
  },
  topbarRefreshHandler: null,
  topbarRefreshBusy: false,
  setTopbarRefresh(handler, busy) {
    set({ topbarRefreshHandler: handler, topbarRefreshBusy: busy });
  },
}));
