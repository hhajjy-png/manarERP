import { create } from 'zustand';

type Theme = 'light' | 'dark';
export type Lang = 'ar' | 'en';

interface UIState {
  theme: Theme;
  sidebarOpen: boolean;
  lang: Lang;
  toggleTheme: () => void;
  toggleSidebar: () => void;
  closeSidebar: () => void;
  setLang: (lang: Lang) => void;
}

const THEME_KEY = 'manar.theme';
const LANG_KEY = 'manar.lang';

function applyTheme(theme: Theme) {
  document.documentElement.setAttribute('data-theme', theme);
}

function applyLang(lang: Lang) {
  document.documentElement.dir = lang === 'ar' ? 'rtl' : 'ltr';
}

const initialTheme = (localStorage.getItem(THEME_KEY) as Theme) || 'light';
const initialLang = (localStorage.getItem(LANG_KEY) as Lang) || 'ar';
applyTheme(initialTheme);
applyLang(initialLang);

export const useUI = create<UIState>((set, get) => ({
  theme: initialTheme,
  sidebarOpen: false,
  lang: initialLang,
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
  setLang(lang: Lang) {
    localStorage.setItem(LANG_KEY, lang);
    applyLang(lang);
    set({ lang });
  },
}));
