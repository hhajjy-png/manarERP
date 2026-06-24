interface Props { mode: 'as-of' | 'period'; onChange: (m: 'as-of' | 'period') => void; }

export function ModeToggle({ mode, onChange }: Props) {
  return (
    <div className="mode-toggle" role="group" aria-label="وضع التقرير">
      <button type="button" className={mode === 'as-of'  ? 'active' : ''} onClick={() => onChange('as-of')}>نقطة زمنية</button>
      <button type="button" className={mode === 'period' ? 'active' : ''} onClick={() => onChange('period')}>فترة</button>
    </div>
  );
}
