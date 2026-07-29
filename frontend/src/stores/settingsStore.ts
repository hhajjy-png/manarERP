import { create } from 'zustand';
import { api } from '../api/client';
import { CurrencyLanguage, normalizeCurrencyLanguage } from '../lib/format';
import type { Lang } from './uiStore';
import {
  BusinessTermCategory,
  BusinessTermDictionaries,
  defaultBusinessTermDictionaries,
  parseBusinessTermDictionaries,
  resolveBusinessTerm,
} from '../lib/businessTerms';
import {
  defaultBusinessTermHiDictionaries,
  parseBusinessTermHiDictionaries,
  resolveBusinessTermHi,
} from '../lib/businessTermsHi';

/** مفتاح إعداد لغة عرض العملة (جدول Setting الحر — لا يحتاج ترحيلًا). */
export const CURRENCY_DISPLAY_LANGUAGE_KEY = 'finance.currencyDisplayLanguage';

interface SettingsState {
  /** لغة عرض العملة الحالية — المصدر الوحيد للحقيقة (english افتراضيًا). */
  currencyLanguage: CurrencyLanguage;
  /** قواميس ترجمة القيم التجارية للنماذج الإدارية — المصدر الوحيد للحقيقة. */
  businessTerms: BusinessTermDictionaries;
  /**
   * العمود الهندي للقيم نفسها (القالب الثنائي English + हिन्दी). مساحة مفاتيح
   * منفصلة (`dict.forms.hi.*`) ⇒ لا يمسّ `businessTerms` الإنجليزي إطلاقًا.
   */
  businessTermsHi: BusinessTermDictionaries;
  loaded: boolean;
  /** يجلب إعدادات الشركة ويضبط لغة العملة وقواميس المصطلحات. يُستدعى بعد المصادقة. */
  loadCompanySettings: () => Promise<void>;
  /** يضبط لغة عرض العملة فورًا (يستخدمه حفظ الإعدادات). */
  setCurrencyLanguage: (lang: CurrencyLanguage) => void;
  /** يضبط القواميس فورًا بعد الحفظ من «إعدادات الشركة» (بلا إعادة تحميل). */
  setBusinessTerms: (dictionaries: BusinessTermDictionaries) => void;
  /** يضبط القواميس الهندية فورًا بعد الحفظ (بلا إعادة تحميل). */
  setBusinessTermsHi: (dictionaries: BusinessTermDictionaries) => void;
}

/**
 * مخزن إعدادات الشركة الخفيف — المصدر الوحيد للحقيقة للغة عرض العملة (إضافي وآمن).
 * لا حالة مكرَّرة في المُنسّق: نقاط الدخول (money / خلايا التقارير) تقرأ هذه القيمة
 * عبر currentCurrencyLanguage() وتمرّرها صراحةً إلى formatCurrency.
 * تغيير القيمة يعيد رسم أي مكوّن يشترك فيه (مثل Layout) فتُعاد صياغة المبالغ.
 */
export const useSettings = create<SettingsState>((set) => ({
  currencyLanguage: 'english',
  businessTerms: defaultBusinessTermDictionaries(),
  businessTermsHi: defaultBusinessTermHiDictionaries(),
  loaded: false,

  async loadCompanySettings() {
    try {
      const res = await api.get('/settings');
      const rows: Array<{ key: string; value: string }> = res.data?.data?.settings ?? [];
      const raw = rows.find((s) => s.key === CURRENCY_DISPLAY_LANGUAGE_KEY)?.value;
      set({
        currencyLanguage: normalizeCurrencyLanguage(raw),
        businessTerms: parseBusinessTermDictionaries(rows),
        businessTermsHi: parseBusinessTermHiDictionaries(rows),
        loaded: true,
      });
    } catch {
      // فشل الجلب — نبقى على الافتراضي الآمن english وعلى القواميس المدمجة.
      set({
        currencyLanguage: 'english',
        businessTerms: defaultBusinessTermDictionaries(),
        businessTermsHi: defaultBusinessTermHiDictionaries(),
        loaded: true,
      });
    }
  },

  setCurrencyLanguage(lang) {
    set({ currencyLanguage: normalizeCurrencyLanguage(lang) });
  },

  setBusinessTerms(dictionaries) {
    set({ businessTerms: dictionaries });
  },

  setBusinessTermsHi(dictionaries) {
    set({ businessTermsHi: dictionaries });
  },
}));

/**
 * يقرأ لغة عرض العملة الحالية من المخزن (المصدر الوحيد) — تُستخدم في نقاط الدخول
 * التطبيقية لتمريرها صراحةً إلى formatCurrency، فيبقى المُنسّق دالة صافية.
 */
export function currentCurrencyLanguage(): CurrencyLanguage {
  return useSettings.getState().currencyLanguage;
}

/** دالة حلّ مصطلح تجاري واحد — انظر `resolveBusinessTerm` لسياسة السقوط. */
export type BusinessTermResolver = (
  category: BusinessTermCategory,
  value: string | null | undefined,
  lang: Lang,
  dash?: string,
) => string;

/**
 * الواجهة الوحيدة التي تستهلكها النماذج الإدارية لترجمة القيم الديناميكية.
 * تُعيد الرسم تلقائيًا عند تحديث القواميس من «إعدادات الشركة» — لا حالة مكرَّرة
 * ولا خريطة ترجمة داخل أي نموذج.
 */
export function useBusinessTerms(): BusinessTermResolver {
  const dictionaries = useSettings((s) => s.businessTerms);
  return (category, value, lang, dash) => resolveBusinessTerm(dictionaries, category, value, lang, dash);
}

/** دالة حلّ مصطلح تجاري بالهندية — انظر `resolveBusinessTermHi` لسياسة السقوط. */
export type BusinessTermHiResolver = (
  category: BusinessTermCategory,
  value: string | null | undefined,
  dash?: string,
) => string;

/**
 * الواجهة الوحيدة التي يستهلكها القالب الثنائي English + हिन्दी لترجمة القيم
 * الديناميكية. لا وسيط لغة: النسخة الثنائية تعني الهندية دائمًا، وسياسة السقوط
 * (هندي → إنجليزي → العربية المخزَّنة) مركزية في `resolveBusinessTermHi`.
 */
export function useBusinessTermsHi(): BusinessTermHiResolver {
  const hiDictionaries = useSettings((s) => s.businessTermsHi);
  const enDictionaries = useSettings((s) => s.businessTerms);
  return (category, value, dash) =>
    resolveBusinessTermHi(hiDictionaries, enDictionaries, category, value, dash);
}
