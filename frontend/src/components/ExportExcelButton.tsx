interface Props {
  onExport: () => void | Promise<void>;
  busy: boolean;
}

export default function ExportExcelButton({ onExport, busy }: Props) {
  return (
    <button
      type="button"
      className="btn secondary"
      onClick={onExport}
      disabled={busy}
    >
      {busy ? 'جاري...' : <span style={{ color: '#217346' }}>⬇ Excel</span>}
    </button>
  );
}
