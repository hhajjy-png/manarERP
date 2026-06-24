interface Props {
  onExcelExport: () => void;
  onPdfExport: () => void;
  loading?: boolean;
}

export function ExportBar({ onExcelExport, onPdfExport, loading }: Props) {
  return (
    <div className="financial-export-bar">
      <button className="export-btn excel" onClick={onExcelExport} disabled={loading}>
        <span className="material-symbols-outlined">table_view</span> Excel
      </button>
      <button className="export-btn pdf" onClick={onPdfExport} disabled={loading}>
        <span className="material-symbols-outlined">picture_as_pdf</span> PDF
      </button>
    </div>
  );
}
