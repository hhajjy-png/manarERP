import './PageLoader.css';

interface Props {
  /** Optional label; defaults to the Arabic loading message. */
  label?: string;
}

/**
 * Lightweight ExplorerKit loading state shown while a lazy-loaded route chunk
 * is being fetched. Theme-token driven (light + dark), respects reduced motion,
 * and is announced to assistive tech via role="status".
 */
export default function PageLoader({ label = 'جارٍ التحميل…' }: Props) {
  return (
    <div className="pld-root" dir="rtl" role="status" aria-live="polite">
      <span className="pld-spinner" aria-hidden="true" />
      <span className="pld-label">{label}</span>
    </div>
  );
}
