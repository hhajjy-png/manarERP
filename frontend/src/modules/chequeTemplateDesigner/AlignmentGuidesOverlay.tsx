import type { AlignmentGuide } from './alignmentGuides';

type Props = {
  guides: AlignmentGuide[];
};

/**
 * Alignment Engine's visual half — renders the smart guide lines computed by
 * alignmentGuides.ts. Purely presentational: it neither computes nor stores
 * guides, only draws whatever it is given. Extracted from the Professional
 * module's AlignmentGuidesOverlay.
 */
export default function AlignmentGuidesOverlay({ guides }: Props) {
  if (guides.length === 0) return null;

  return (
    <div className="ctd-alignment-guides">
      {guides.map((guide, index) => (
        <div
          key={`${guide.orientation}-${index}`}
          className={`ctd-alignment-guide ctd-alignment-guide--${guide.orientation}`}
          style={guide.orientation === 'vertical' ? { left: `${guide.position}%` } : { top: `${guide.position}%` }}
        />
      ))}
    </div>
  );
}
