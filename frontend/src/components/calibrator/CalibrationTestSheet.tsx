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
  fieldBoxMm,
  chequePaperLeftMm,
  pageCentreMm,
  buildCentreAxes,
  type CalibrationGeometry,
} from '../../utils/chequeGeometry';
import { FIELD_KEYS, FIELD_LABELS, type ChequeTemplate } from '../../utils/chequeTemplate';
import { CalibrationRulerFrame, RULER_LANE_MM } from './CalibrationEdgeRuler';

interface Props {
  template: ChequeTemplate;
  geometry?: CalibrationGeometry;
  showBoxes?: boolean;
  /** Injectable for deterministic tests; defaults to the moment of render. */
  printedAt?: Date;
}

// Ink colours — chosen dark enough to survive a monochrome printer (no light greys,
// no opacity). Visual hierarchy, strongest first: edge rulers → cheque outline and
// field crosshairs → full-page centre cross → supporting technical guides.
const OUTLINE = '#b91c1c';
const MARK = '#0f766e';
const INK = '#0f172a';
/** Centre cross: a light SOLID stroke, deliberately not a transparent one — physical
 *  printers render opacity inconsistently, so low strength is expressed as a lighter
 *  ink rather than a faded one. Subordinate to the rulers, outline and crosshairs. */
const CENTRE = '#64748b';
const CENTRE_STROKE = 0.2;

/** Footer band, measured up from the bottom edge (mm). It sits ABOVE the bottom
 *  ruler lane (RULER_LANE_MM), so ruler ink and footer ink never touch. The lowest
 *  baseline still keeps a wide margin from the paper edge. */
const FOOTER_RULE_UP = 34;
const FOOTER_LINE1_UP = 30;
const FOOTER_LINE2_UP = 26.4;
const FOOTER_WARN_UP = 21.5;
/** The footer rule stops short of the left/right ruler lanes. */
const FOOTER_RULE_INSET = RULER_LANE_MM + 1;

/** Physical scale reference — a line that must measure exactly 100.0 mm on paper.
 *  Lives in the empty band between the cheque boundary and the footer.
 *  REF_X is inset a further ~11 mm past the left ruler lane so the block no longer
 *  crowds the ruler ticks or risks clipping. This is presentation only — it moves no
 *  cheque geometry and does not change the reference's physical length. */
const REF_LENGTH_MM = 100;
const REF_X = RULER_LANE_MM + 11; // 26 mm on A4 — clear of the lane, clear of clipping
const REF_Y = 140;
/** End caps are stronger than the line itself, so the two measured endpoints are the
 *  most legible marks in the block. */
const REF_CAP_MM = 2.2;
const REF_LINE_STROKE = 0.25;
const REF_CAP_STROKE = 0.5;

/** Feed-edge indicator — sits below the cheque, inboard of the right ruler lane. */
const FEED_Y = 132;
const FEED_ARROW_TIP_X_INSET = RULER_LANE_MM + 2; // stops short of the right ruler lane
const FEED_ARROW_LEN = 14;

export const TEST_SHEET_TITLE = 'ورقة اختبار معايرة الشيك';
export const TEST_SHEET_APP = 'manarERP';
export const TEST_SHEET_VERSION = 'الإصدار 1';
export const TEST_SHEET_WARNING = 'ورقة اختبار فقط — لا تستخدم كشيك';
export const REF_LABEL_AR = 'مرجع قياس فعلي: 10 cm (100 mm)';
export const REF_LABEL_EN = 'Physical Scale Reference: 10 cm (100 mm)';
export const PRINT_SCALE_NOTE_AR = 'اطبع بحجم 100% وألغِ Fit to Page';
export const PRINT_SCALE_NOTE_EN = 'Print at 100% Actual Size — Disable Fit to Page';
export const FEED_EDGE_LABEL_AR = 'جهة إدخال الشيك';
export const FEED_EDGE_LABEL_EN = 'Cheque Feed Edge';

// ── Deliberately NOT printed: the calibration consistency warning ────────────────
//
// `fieldsOutsideCheque()` in utils/chequeGeometry.ts detects that some default field
// anchors fall outside the cheque outline — a pre-existing contradiction between
// DEFAULT_TEMPLATE (percentages of the full page) and DEFAULT_GEOMETRY (a 175 mm
// right-fed cheque), which the right-edge anchor exposed rather than created.
//
// That diagnostic stays in code and under test, but it is intentionally NOT rendered
// on the sheet: the operator calibrates visually against the real physical cheque, the
// contradiction is already understood and documented, a warning block would clutter a
// technical measuring instrument, and — worst of all — it would read as if the new
// right-edge anchor were defective. Markers outside the default outline do not block
// the calibration workflow. If you are tempted to print it, read this paragraph again.

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

  // Paper anchor for the drawn cheque: right (feed) edge, NOT offsetXMm.
  const chequeLeft = chequePaperLeftMm(g);
  const centre = pageCentreMm(g);
  const axes = buildCentreAxes(g);

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

        {/* ── Full-page centre cross (drawn FIRST → sits behind every other layer) ──
            Two straight foreground strokes that divide the physical paper exactly in
            half. They run mathematically edge-to-edge (0 → W, 0 → H), continuing
            beneath the ruler lanes rather than being clipped to the inner content
            area, and because they are underneath, they cannot hide a tick or a
            numeral. Centre is derived from the ACTIVE geometry — on A4 landscape that
            resolves to (148.5, 105), but nothing here is hardcoded. */}
        <g className="chq-centre-cross">
          <line
            className="chq-centre-cross__v"
            x1={axes.vertical.x1}
            y1={axes.vertical.y1}
            x2={axes.vertical.x2}
            y2={axes.vertical.y2}
            stroke={CENTRE}
            strokeWidth={CENTRE_STROKE}
          />
          <line
            className="chq-centre-cross__h"
            x1={axes.horizontal.x1}
            y1={axes.horizontal.y1}
            x2={axes.horizontal.x2}
            y2={axes.horizontal.y2}
            stroke={CENTRE}
            strokeWidth={CENTRE_STROKE}
          />
          {/* Tiny technical marker at the exact intersection. No label: the centre of
              an A4 landscape sheet falls INSIDE the cheque area, so a "منتصف الورقة"
              caption there would clutter exactly the region the operator is reading. */}
          <circle
            className="chq-centre-cross__marker"
            cx={centre.xMm}
            cy={centre.yMm}
            r={1.4}
            fill="none"
            stroke={CENTRE}
            strokeWidth={0.3}
          />
        </g>

        {/* ── Physical centimetre rulers on all four paper edges ──
            Foreground SVG ticks/labels in true millimetres (1 user unit = 1 mm).
            Unchanged scale: horizontal rulers still measure from the LEFT paper edge,
            vertical rulers from the TOP paper edge. */}
        <CalibrationRulerFrame pageWidthMm={W} pageHeightMm={H} />

        {/* ── Physical cheque boundary — anchored to the RIGHT feed edge ──
            The cheque is fed into the printer from the right paper edge, so its left
            edge sits at pageWidth − chequeWidth − rightOffset (see chequePaperLeftMm).
            Nothing is mirrored: no scaleX(-1), no negative scale, no reversed text, no
            reversed field order. The cheque-local coordinate system, its width, its
            height and its Y position are all untouched — only the paper anchor moved.
            Stroke is lighter and the dash longer than before so the boundary reads as
            a guide and does not compete with the edge rulers. */}
        <g className="chq-test-outline">
          <rect
            x={chequeLeft}
            y={g.offsetYMm}
            width={g.chequeWidthMm}
            height={g.chequeHeightMm}
            fill="none"
            stroke={OUTLINE}
            strokeWidth={0.3}
            strokeDasharray="3 1.8"
          />
          <text x={chequeLeft} y={g.offsetYMm - 1.8} fontSize={3} fontWeight="700" fill={OUTLINE} fontFamily="monospace">
            حدّ الشيك الفعلي — {g.chequeWidthMm} × {g.chequeHeightMm} مم
          </text>
        </g>

        {/* ── Field registration markers ── */}
        {FIELD_KEYS.map((fk) => {
          const cfg = template[fk];
          const { xMm, yMm, widthMm: boxW, heightMm: boxH } = fieldBoxMm(cfg, g);
          return (
            <g key={fk} className="chq-test-marker">
              <line x1={xMm - 4} y1={yMm} x2={xMm + 4} y2={yMm} stroke={MARK} strokeWidth={0.3} />
              <line x1={xMm} y1={yMm - 4} x2={xMm} y2={yMm + 4} stroke={MARK} strokeWidth={0.3} />
              <circle cx={xMm} cy={yMm} r={0.9} fill="none" stroke={MARK} strokeWidth={0.25} />
              {showBoxes && (
                <rect x={xMm} y={yMm} width={boxW} height={boxH} fill="none" stroke={MARK} strokeWidth={0.2} strokeDasharray="0.8 0.6" />
              )}
              <text x={xMm + 1} y={yMm - 1.6} fontSize={2.5} fontWeight="700" fill={MARK} fontFamily="monospace">
                {FIELD_LABELS[fk]} · {round(cfg.left)}% / {round(cfg.top)}% · {Math.round(xMm)}×{Math.round(yMm)} مم
              </text>
            </g>
          );
        })}

        {/* ── Feed-edge indicator ──
            Tells the operator which paper edge the cheque is inserted from, so the
            right-anchored outline above is unambiguous. Foreground SVG only: the
            arrowhead is a <polygon>, deliberately NOT an SVG <marker> — marker
            elements remain banned by the regression guard. Sits below the cheque and
            stops short of the right ruler lane, so it overlaps no tick, no numeral and
            no cheque field. Purely informational: it drives no geometry. */}
        <g className="chq-test-feededge">
          <text
            x={W - FEED_ARROW_TIP_X_INSET}
            y={FEED_Y}
            textAnchor="end"
            fontSize={3}
            fontWeight="700"
            fill={INK}
            fontFamily="monospace"
          >
            {FEED_EDGE_LABEL_AR} · {FEED_EDGE_LABEL_EN}
          </text>
          <line
            x1={W - FEED_ARROW_TIP_X_INSET - FEED_ARROW_LEN}
            y1={FEED_Y + 3.6}
            x2={W - FEED_ARROW_TIP_X_INSET - 2}
            y2={FEED_Y + 3.6}
            stroke={INK}
            strokeWidth={0.4}
          />
          <polygon
            points={`${W - FEED_ARROW_TIP_X_INSET},${FEED_Y + 3.6} ${W - FEED_ARROW_TIP_X_INSET - 2.6},${FEED_Y + 2.2} ${W - FEED_ARROW_TIP_X_INSET - 2.6},${FEED_Y + 5}`}
            fill={INK}
          />
        </g>

        {/* ── Physical scale reference ──
            A line whose printed length must measure exactly 10.0 cm with a real
            ruler. If it does not, the printer is scaling the page and every other
            measurement on this sheet — including the field coordinates — is wrong.
            The line itself is kept technically light; the two end caps are the heavy
            marks, because they are the points actually being measured between. */}
        <g className="chq-test-scaleref">
          <line
            className="chq-test-scaleref__line"
            x1={REF_X}
            y1={REF_Y}
            x2={REF_X + REF_LENGTH_MM}
            y2={REF_Y}
            stroke={INK}
            strokeWidth={REF_LINE_STROKE}
          />
          <line
            className="chq-test-scaleref__cap"
            x1={REF_X}
            y1={REF_Y - REF_CAP_MM}
            x2={REF_X}
            y2={REF_Y + REF_CAP_MM}
            stroke={INK}
            strokeWidth={REF_CAP_STROKE}
          />
          <line
            className="chq-test-scaleref__cap"
            x1={REF_X + REF_LENGTH_MM}
            y1={REF_Y - REF_CAP_MM}
            x2={REF_X + REF_LENGTH_MM}
            y2={REF_Y + REF_CAP_MM}
            stroke={INK}
            strokeWidth={REF_CAP_STROKE}
          />
          <text x={REF_X} y={REF_Y - 4} fontSize={3.4} fontWeight="700" fill={INK} fontFamily="monospace">
            {REF_LABEL_AR}
          </text>
          <text x={REF_X} y={REF_Y + 7} fontSize={3.2} fontWeight="700" fill={OUTLINE} fontFamily="monospace">
            {PRINT_SCALE_NOTE_AR}
          </text>
          <text x={REF_X} y={REF_Y + 11.6} fontSize={3} fontWeight="700" fill={INK} fontFamily="monospace">
            {REF_LABEL_EN}
          </text>
          <text x={REF_X} y={REF_Y + 16} fontSize={3} fill={INK} fontFamily="monospace">
            {PRINT_SCALE_NOTE_EN}
          </text>
        </g>

        {/* ── Footer identification band ──
            Sits in the bottom margin, well clear of the cheque boundary and every
            field marker. Foreground SVG strokes/fills only — no CSS backgrounds — so
            it survives a monochrome printer. Never rendered by ChequePrintOutput. */}
        <g className="chq-test-footer">
          <line
            x1={FOOTER_RULE_INSET}
            y1={H - FOOTER_RULE_UP}
            x2={W - FOOTER_RULE_INSET}
            y2={H - FOOTER_RULE_UP}
            stroke={INK}
            strokeWidth={0.25}
          />
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
