import type { GuideLine } from '../utils/designerUtils';

interface Props {
  lines: GuideLine[];
  canvasW: number;
  canvasH: number;
}

export default function SmartGuides({ lines, canvasW, canvasH }: Props) {
  if (!lines.length) return null;
  return (
    <svg
      style={{
        position: 'absolute', inset: 0, width: '100%', height: '100%',
        pointerEvents: 'none', zIndex: 50,
      }}
    >
      {lines.map((g, i) => {
        if (g.axis === 'x') {
          // vertical line at x = g.position
          return (
            <line
              key={i}
              x1={g.position} y1={0} x2={g.position} y2={canvasH}
              stroke="#3b82f6" strokeWidth={1} strokeDasharray="4 3" opacity={0.8}
            />
          );
        }
        // horizontal line at y = g.position
        return (
          <line
            key={i}
            x1={0} y1={g.position} x2={canvasW} y2={g.position}
            stroke="#3b82f6" strokeWidth={1} strokeDasharray="4 3" opacity={0.8}
          />
        );
      })}
    </svg>
  );
}
