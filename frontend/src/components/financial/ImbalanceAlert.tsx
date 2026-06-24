interface Props { isBalanced?: boolean; difference?: number; }

export function ImbalanceAlert({ isBalanced, difference }: Props) {
  if (isBalanced !== false) return null;
  const fmt = (n?: number) => n?.toLocaleString('ar-KW', { minimumFractionDigits: 3 }) ?? '0.000';
  return (
    <div className="imbalance-alert" role="alert" aria-live="assertive">
      ⚠️ ميزان المراجعة غير متوازن — الفرق: {fmt(difference)} د.ك
    </div>
  );
}
