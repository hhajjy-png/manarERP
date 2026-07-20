import { CSSProperties, ReactNode } from 'react';
import type { SortHeaderState } from '../hooks/useTableSort';
import './sortable-header.css';

/**
 * ترويسة عمود قابلة للفرز — التنفيذ الوحيد المعتمد لمؤشر الفرز في النظام
 * (Enterprise Data Grid Foundation v1). تستهلكها كلتا واجهتَي ResourcePage
 * (DataTable الكلاسيكية وجدول ExplorerKit).
 *
 * المؤشر بلغة أيقونات موحّدة (السابقة المجرّبة في BankSalaryAnalytics):
 * unfold_more خافت = قابل للفرز، arrow_upward/downward بلون التمييز = نشط.
 * دلالة الاتجاه قيمية لا بصرية — «تصاعدي» = الأصغر أولًا مهما كان اتجاه النص.
 *
 * الزر عنصر <button> حقيقي داخل <th>: قابل للتركيز، Enter/Space يقدّمان الدورة
 * أصلًا، و`aria-sort` على الترويسة تعكس الحالة لقارئات الشاشة. إيقاف الانتشار
 * احترازي كي لا يتسرّب النقر لأي معالج صفوف مستقبلي.
 */

const ARIA_SORT: Record<SortHeaderState, 'ascending' | 'descending' | 'none'> = {
  asc: 'ascending',
  desc: 'descending',
  none: 'none',
};

const ICON: Record<SortHeaderState, string> = {
  none: 'unfold_more',
  asc: 'arrow_upward',
  desc: 'arrow_downward',
};

interface Props {
  /** محتوى الترويسة المعروض (قد يحمل رمز العملة للأعمدة المالية). */
  label: ReactNode;
  /** اسم العمود نصًا خالصًا — للاسم الوصولي للزر. */
  title: string;
  state: SortHeaderState;
  onToggle: () => void;
  /** عرض ثابت اختياري (نفس عقد Column.width في DataTable). */
  width?: string;
  className?: string;
  /** أنماط إضافية على الـ<th> (مثل إزاحة العمود المُجمَّد) — تُدمج فوق العرض. */
  style?: CSSProperties;
}

export default function SortableHeader({ label, title, state, onToggle, width, className, style }: Props) {
  const active = state !== 'none';
  return (
    <th
      scope="col"
      aria-sort={ARIA_SORT[state]}
      className={`sort-th${active ? ' sort-th--active' : ''}${className ? ` ${className}` : ''}`}
      style={{ ...(width ? { width } : {}), ...style }}
    >
      <button
        type="button"
        className="sort-th-btn"
        title={title}
        onClick={(e) => { e.stopPropagation(); onToggle(); }}
        onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') e.stopPropagation(); }}
      >
        <span className="sort-th-label">{label}</span>
        <span className="material-symbols-outlined sort-th-icon" aria-hidden="true">{ICON[state]}</span>
      </button>
    </th>
  );
}
