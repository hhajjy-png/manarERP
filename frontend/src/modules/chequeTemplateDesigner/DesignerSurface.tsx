import type { ReactNode } from 'react';
import type { DesignerSurfaceSpec } from './surface.constants';
import { surfaceAspectRatio } from './surface.constants';

type Props = {
  spec: DesignerSurfaceSpec;
  children: ReactNode;
  onClick?: () => void;
};

/**
 * Design surface — the coordinate system for the generic designer. A single
 * fixed-size container, dimensioned from the `spec` prop (in real
 * centimetres), inside which the background, the field layer, and every
 * engine render. Extracted from the Professional module's DesignSurface, but
 * the size is a prop instead of a hardcoded constant.
 *
 * `max-width: 100%` (in CSS) lets it shrink to fit its panel; `aspect-ratio`
 * keeps height proportional. Shrinking is purely visual — percentage-based
 * field positions stay exactly where they are relative to this surface.
 */
export default function DesignerSurface({ spec, children, onClick }: Props) {
  return (
    <div
      className="ctd-design-surface"
      onClick={onClick}
      style={{
        width: `${spec.widthCm}cm`,
        aspectRatio: surfaceAspectRatio(spec),
      }}
    >
      {children}
    </div>
  );
}
