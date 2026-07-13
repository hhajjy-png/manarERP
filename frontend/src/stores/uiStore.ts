import { create } from 'zustand';

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
  toggleTheme: () => void;
  toggleSidebar: () => void;
  closeSidebar: () => void;
  toggleSidebarMode: () => void;
  setSidebarNarrow: (narrow: boolean) => void;
  setLang: (lang: Lang) => void;
  togglePrivacy: () => void;
}

const THEME_KEY = 'manar.theme';
const LANG_KEY = 'manar.lang';
const SIDEBAR_KEY = 'manarERP.sidebar.mode';

function applyTheme(theme: Theme) {
  document.documentElement.setAttribute('data-theme', theme);
}

function applyLang(lang: Lang) {
  document.documentElement.dir = lang === 'ar' ? 'rtl' : 'ltr';
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
      localStorage.setItem(SIDEBAR_KEY, sidebarMode);
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
  setLang(lang: Lang) {
    localStorage.setItem(LANG_KEY, lang);
    applyLang(lang);
    set({ lang });
  },
  togglePrivacy() {
    set({ privacyMode: !get().privacyMode });
  },
}));
