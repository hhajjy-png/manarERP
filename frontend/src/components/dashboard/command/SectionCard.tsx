import type { ReactNode } from 'react';

/**
 * Presentational shell for one Command Center section. Independent and reusable —
 * it renders a titled card and a body slot, reusing the existing themed `.db-card`
 * styles (light/dark parity via stitch-full-theme). Body uses min-height/auto so
 * cards grow with their content; no fixed heights.
 */
export function SectionCard({
  title,
  className = '',
  children,
}: {
  title?: string;
  className?: string;
  children?: ReactNode;
}) {
  return (
    <div className={`db-card db-cc-card ${className}`.trim()}>
      {title && (
        <div className="db-card-head">
          <div>
            <h3>{title}</h3>
          </div>
        </div>
      )}
      <div className="db-cc-card-body">{children}</div>
    </div>
  );
}

export default SectionCard;
