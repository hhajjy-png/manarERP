import { create } from 'zustand';
import { api } from '../api/client';
import { CurrencyLanguage, normalizeCurrencyLanguage } from '../lib/format';

/** مفتاح إعداد لغة عرض العملة (جدول Setting الحر — لا يحتاج ترحيلًا). */
export const CURRENCY_DISPLAY_LANGUAGE_KEY = 'finance.currencyDisplayLanguage';

interface SettingsState {
  /** لغة عرض العملة الحالية — المصدر الوحيد للحقيقة (english افتراضيًا). */
  currencyLanguage: CurrencyLanguage;
  loaded: boolean;
  /** يجلب إعدادات الشركة ويضبط لغة العملة. يُستدعى بعد المصادقة. */
  loadCompanySettings: () => Promise<void>;
  /** يضبط لغة عرض العملة فورًا (يستخدمه حفظ الإعدادات). */
  setCurrencyLanguage: (lang: CurrencyLanguage) => void;
}

/**
 * مخزن إعدادات الشركة الخفيف — المصدر الوحيد للحقيقة للغة عرض العملة (إضافي وآمن).
 * لا حالة مكرَّرة في المُنسّق: نقاط الدخول (money / خلايا التقارير) تقرأ هذه القيمة
 * عبر currentCurrencyLanguage() وتمرّرها صراحةً إلى formatCurrency.
 * تغيير القيمة يعيد رسم أي مكوّن يشترك فيه (مثل Layout) فتُعاد صياغة المبالغ.
 */
export const useSettings = create<SettingsState>((set) => ({
  currencyLanguage: 'english',
  loaded: false,

  async loadCompanySettings() {
    try {
      const res = await api.get('/settings');
      const rows: Array<{ key: string; value: string }> = res.data?.data?.settings ?? [];
      const raw = rows.find((s) => s.key === CURRENCY_DISPLAY_LANGUAGE_KEY)?.value;
      set({ currencyLanguage: normalizeCurrencyLanguage(raw), loaded: true });
    } catch {
      // فشل الجلب — نبقى على الافتراضي الآمن english.
      set({ currencyLanguage: 'english', loaded: true });
    }
  },

  setCurrencyLanguage(lang) {
    set({ currencyLanguage: normalizeCurrencyLanguage(lang) });
  },
}));

/**
 * يقرأ لغة عرض العملة الحالية من المخزن (المصدر الوحيد) — تُستخدم في نقاط الدخول
 * التطبيقية لتمريرها صراحةً إلى formatCurrency، فيبقى المُنسّق دالة صافية.
 */
export function currentCurrencyLanguage(): CurrencyLanguage {
  return useSettings.getState().currencyLanguage;
}
