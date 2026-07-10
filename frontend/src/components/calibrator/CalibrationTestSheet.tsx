/**
 * Calibration Studio — field-registration test sheet (isolated print layer), SVG-based.
 *
 * Draws ONLY what the operator needs to see where each field lands: a crosshair per
 * field, an optional bounding box, the field name, and its %/mm coordinates, plus a
 * simple cheque boundary. Everything is a real SVG <line>/<rect>/<text> — foreground
 * vector strokes that print reliably in Chromium/Electron.
 *
 * The SVG uses a millimetre viewBox (`viewBox="0 0 W H"`, sized `Wmm × Hmm`), so every
 * coordinate and stroke width is in true millimetres at 100% print scale.
 *
 * Carries NO cheque background and NO beneficiary data, and is isolated from the real
 * cheque print output (.cheque-print-only).
 */
import {
  DEFAULT_GEOMETRY,
  fieldMm,
  type CalibrationGeometry,
} from '../../utils/chequeGeometry';
import { FIELD_KEYS, FIELD_LABELS, type ChequeTemplate } from '../../utils/chequeTemplate';

interface Props {
  template: ChequeTemplate;
  geometry?: CalibrationGeometry;
  showBoxes?: boolean;
  /** Injectable for deterministic tests; defaults to the moment of render. */
  printedAt?: Date;
}

// Ink colours — chosen dark enough to survive a monochrome printer (no light greys,
// no opacity).
const OUTLINE = '#b91c1c';
const MARK = '#0f766e';
const INK = '#0f172a';

/** Footer band, measured up from the bottom edge (mm). The lowest baseline sits
 *  8 mm above the paper edge, inside any common printer's non-printable margin. */
const FOOTER_RULE_UP = 19;
const FOOTER_LINE1_UP = 15;
const FOOTER_LINE2_UP = 11.4;
const FOOTER_WARN_UP = 6.8;

export const TEST_SHEET_TITLE = 'ورقة اختبار معايرة الشيك';
export const TEST_SHEET_APP = 'manarERP';
export const TEST_SHEET_VERSION = 'الإصدار 1';
export const TEST_SHEET_WARNING = 'ورقة اختبار فقط — لا تستخدم كشيك';

/** DD/MM/YYYY HH:mm in Western digits, independent of locale/calendar settings. */
function formatPrintedAt(d: Date): string {
  const p = (n: number) => String(n).padStart(2, '0');
  return `${p(d.getDate())}/${p(d.getMonth() + 1)}/${d.getFullYear()} ${p(d.getHours())}:${p(d.getMinutes())}`;
}

export default function CalibrationTestSheet({
  template,
  geometry = DEFAULT_GEOMETRY,
  showBoxes = true,
  printedAt,
}: Props) {
  const g = geometry;
  const W = g.pageWidthMm;
  const H = g.pageHeightMm;
  const stamp = formatPrintedAt(printedAt ?? new Date());

  const round = (n: number) => Math.round(n * 100) / 100;

  return (
    <div className="chq-test-sheet" style={{ width: `${W}mm`, height: `${H}mm` }}>
      <svg
        width={`${W}mm`}
        height={`${H}mm`}
        viewBox={`0 0 ${W} ${H}`}
        xmlns="http://www.w3.org/2000/svg"
        style={{ display: 'block' }}
      >
        {/* White base (SVG fill prints as foreground) */}
        <rect x={0} y={0} width={W} height={H} fill="#fff" />

        {/* ── Physical cheque boundary ── */}
        <g className="chq-test-outline">
          <rect
            x={g.offsetXMm}
            y={g.offsetYMm}
            width={g.chequeWidthMm}
            height={g.chequeHeightMm}
            fill="none"
            stroke={OUTLINE}
            strokeWidth={0.4}
            strokeDasharray="2 1.2"
          />
          <text x={g.offsetXMm} y={g.offsetYMm - 1.5} fontSize={2.6} fontWeight="700" fill={OUTLINE} fontFamily="monospace">
            حدّ الشيك الفعلي — {g.chequeWidthMm} × {g.chequeHeightMm} مم
          </text>
        </g>

        {/* ── Field registration markers ── */}
        {FIELD_KEYS.map((fk) => {
          const cfg = template[fk];
          const { xMm, yMm } = fieldMm(cfg, g);
          const boxW = (cfg.width / 100) * W;
          const boxH = Math.max(4, cfg.fontSize * 0.3528 * 1.6);
          return (
            <g key={fk} className="chq-test-marker">
              <line x1={xMm - 4} y1={yMm} x2={xMm + 4} y2={yMm} stroke={MARK} strokeWidth={0.3} />
              <line x1={xMm} y1={yMm - 4} x2={xMm} y2={yMm + 4} stroke={MARK} strokeWidth={0.3} />
              <circle cx={xMm} cy={yMm} r={0.9} fill="none" stroke={MARK} strokeWidth={0.25} />
              {showBoxes && (
                <rect x={xMm} y={yMm} width={boxW} height={boxH} fill="none" stroke={MARK} strokeWidth={0.2} strokeDasharray="0.8 0.6" />
              )}
              <text x={xMm + 1} y={yMm - 1.4} fontSize={2.2} fontWeight="700" fill={MARK} fontFamily="monospace">
                {FIELD_LABELS[fk]} · {round(cfg.left)}% / {round(cfg.top)}% · {Math.round(xMm)}×{Math.round(yMm)} مم
              </text>
            </g>
          );
        })}

        {/* ── Footer identification band ──
            Sits in the bottom margin, well clear of the cheque boundary and every
            field marker. Foreground SVG strokes/fills only — no CSS backgrounds — so
            it survives a monochrome printer. Never rendered by ChequePrintOutput. */}
        <g className="chq-test-footer">
          <line x1={10} y1={H - FOOTER_RULE_UP} x2={W - 10} y2={H - FOOTER_RULE_UP} stroke={INK} strokeWidth={0.25} />
          <text x={W / 2} y={H - FOOTER_LINE1_UP} textAnchor="middle" fontSize={2.8} fontWeight="700" fill={INK} fontFamily="monospace">
            {TEST_SHEET_TITLE} · {TEST_SHEET_APP} · {TEST_SHEET_VERSION}
          </text>
          <text x={W / 2} y={H - FOOTER_LINE2_UP} textAnchor="middle" fontSize={2.4} fill={INK} fontFamily="monospace">
            تاريخ الطباعة: {stamp}
          </text>
          <text x={W / 2} y={H - FOOTER_WARN_UP} textAnchor="middle" fontSize={3.2} fontWeight="800" fill={OUTLINE} fontFamily="monospace">
            {TEST_SHEET_WARNING}
          </text>
        </g>
      </svg>
    </div>
  );
}
