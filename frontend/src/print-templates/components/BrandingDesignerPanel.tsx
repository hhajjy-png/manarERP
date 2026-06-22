import { useState } from 'react';
import type { BrandingDesignerHandle, ElementType } from '../hooks/useBrandingDesigner';
import type { TextStyleDesignerHandle, TextAreaKey } from '../designer/useTextStyleDesigner';
import type { StaticTextDesignerHandle } from '../designer/useStaticTextDesigner';
import type { DesignerElement } from '../designer/designerTypes';
import { isBrandingElement, isTextElement } from '../designer/designerTypes';
import { formatUnit, GRID_PRESETS, type GridSizeOption } from '../utils/designerUtils';
import { INK_MODE_LABELS, type InkMode } from '../utils/inkFilter';
import type { PrintDocumentType } from '../engine/types';
import type {
  TextFontSize, TextFontFamily, TextFontWeight,
  TextColor, TextAlign, TextLineHeight, TextLetterSpacing,
  TableBgColor, TableBorderColor,
} from '../engine/textStyleTypes';
import {
  TEXT_AREA_LABELS,
  FONT_SIZE_LABELS, FONT_FAMILY_LABELS, FONT_WEIGHT_LABELS,
  COLOR_LABELS, ALIGN_LABELS, LINE_HEIGHT_LABELS,
  LETTER_SPACING_LABELS, TABLE_BG_LABELS, TABLE_BORDER_LABELS,
} from '../engine/textStyleTypes';

interface Props {
  designer: BrandingDesignerHandle;
  textStyleDesigner?: TextStyleDesignerHandle;
  staticTextDesigner?: StaticTextDesignerHandle;
  /** Universal selection — when provided, drives mode switching instead of textStyleDesigner.selectedArea */
  selection?: DesignerElement | null;
  docLabel: string;
  onClose: () => void;
  onSave?: () => Promise<void>;
}

// ── Sub-components ────────────────────────────────────────────────────────────

function NumSlider({ lbl, min, max, step, value, onChange }: {
  lbl: string; min: number; max: number; step: number; value: number; onChange: (v: number) => void;
}) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 8 }}>
      <label style={{ width: 52, fontSize: 11, color: '#6b7280', textAlign: 'end', flexShrink: 0 }}>
        {lbl}
      </label>
      <input
        type="range" min={min} max={max} step={step} value={value}
        onChange={(e) => onChange(Number(e.target.value))}
        style={{ flex: 1 }}
      />
      <input
        type="number" min={min} max={max} step={step} value={formatUnit(value)}
        onChange={(e) => { const v = Number(e.target.value); if (!isNaN(v)) onChange(v); }}
        style={{ width: 48, fontSize: 11, textAlign: 'center', border: '1px solid #d1d5db', borderRadius: 4, padding: '2px 3px' }}
      />
    </div>
  );
}

function SectionHeader({ label }: { label: string }) {
  return (
    <div style={{
      fontSize: 10, fontWeight: 700, color: '#94a3b8',
      textTransform: 'uppercase', letterSpacing: '0.06em',
      marginBottom: 6, marginTop: 12, paddingBottom: 4,
      borderBottom: '1px solid #f1f5f9',
    }}>
      {label}
    </div>
  );
}

function TokenButtons<T extends string>({ tokens, labels, value, onChange }: {
  tokens: T[]; labels: Record<T, string>; value: T | undefined; onChange: (v: T) => void;
}) {
  return (
    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 3, marginBottom: 8 }}>
      {tokens.map((tok) => (
        <button
          key={tok}
          type="button"
          onClick={() => onChange(tok)}
          style={{
            padding: '3px 7px',
            borderRadius: 5,
            fontSize: 10,
            cursor: 'pointer',
            border: `1px solid ${value === tok ? '#f59e0b' : '#d1d5db'}`,
            background: value === tok ? '#fef3c7' : 'transparent',
            color: value === tok ? '#92400e' : '#6b7280',
            fontWeight: value === tok ? 700 : 400,
          }}
        >
          {labels[tok]}
        </button>
      ))}
    </div>
  );
}

function ControlLabel({ label }: { label: string }) {
  return (
    <div style={{ fontSize: 10, color: '#94a3b8', marginBottom: 3, fontWeight: 600 }}>{label}</div>
  );
}

// ── Text area controls ────────────────────────────────────────────────────────

function TextAreaControls({ textStyleDesigner, areaId }: {
  textStyleDesigner: TextStyleDesignerHandle;
  areaId: string;
}) {
  const parts = areaId.split('.');
  if (parts.length !== 2) return null;

  const docType = parts[0] as PrintDocumentType;
  const areaKey = parts[1] as TextAreaKey;

  const areas = textStyleDesigner.settings[docType] as Record<string, unknown>;
  const style = (areas?.[areaKey] ?? {}) as Record<string, string | undefined>;

  const update = (patch: Record<string, string | undefined>) =>
    textStyleDesigner.updateArea(docType, areaKey, patch as never);

  const isBorderOnly = areaKey === 'tableBorder';
  const hasHeaderBg = areaKey === 'tableHeader';

  return (
    <>
      <div style={{
        display: 'flex', justifyContent: 'space-between', alignItems: 'center',
        marginBottom: 6, padding: '4px 8px',
        background: '#fffbeb', borderRadius: 6,
        border: '1px solid #fcd34d',
      }}>
        <span style={{ fontSize: 11, fontWeight: 700, color: '#92400e' }}>
          📝 {TEXT_AREA_LABELS[areaKey as keyof typeof TEXT_AREA_LABELS] ?? areaKey}
        </span>
        <button
          type="button"
          onClick={() => textStyleDesigner.setSelectedArea(null)}
          style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: 12, color: '#92400e' }}
          title="عودة إلى خصائص التوقيع/الختم"
        >
          ✕
        </button>
      </div>

      {isBorderOnly ? (
        <>
          <ControlLabel label="لون الإطار" />
          <TokenButtons<TableBorderColor>
            tokens={['default', 'light', 'medium', 'dark', 'none']}
            labels={TABLE_BORDER_LABELS}
            value={style.color as TableBorderColor | undefined}
            onChange={(v) => update({ color: v })}
          />
        </>
      ) : (
        <>
          <ControlLabel label="حجم الخط" />
          <TokenButtons<TextFontSize>
            tokens={['small', 'normal', 'large', 'xlarge']}
            labels={FONT_SIZE_LABELS}
            value={style.fontSize as TextFontSize | undefined}
            onChange={(v) => update({ fontSize: v })}
          />

          <ControlLabel label="نوع الخط" />
          <TokenButtons<TextFontFamily>
            tokens={['cairo', 'ibmPlexArabic']}
            labels={FONT_FAMILY_LABELS}
            value={style.fontFamily as TextFontFamily | undefined}
            onChange={(v) => update({ fontFamily: v })}
          />

          <ControlLabel label="وزن الخط" />
          <TokenButtons<TextFontWeight>
            tokens={['regular', 'medium', 'bold']}
            labels={FONT_WEIGHT_LABELS}
            value={style.fontWeight as TextFontWeight | undefined}
            onChange={(v) => update({ fontWeight: v })}
          />

          <ControlLabel label="لون النص" />
          <TokenButtons<TextColor>
            tokens={['default', 'brand', 'dark', 'blue', 'black', 'gray']}
            labels={COLOR_LABELS}
            value={style.color as TextColor | undefined}
            onChange={(v) => update({ color: v })}
          />

          <ControlLabel label="محاذاة" />
          <TokenButtons<TextAlign>
            tokens={['start', 'center', 'end']}
            labels={ALIGN_LABELS}
            value={style.align as TextAlign | undefined}
            onChange={(v) => update({ align: v })}
          />

          <ControlLabel label="تباعد السطور" />
          <TokenButtons<TextLineHeight>
            tokens={['tight', 'normal', 'relaxed']}
            labels={LINE_HEIGHT_LABELS}
            value={style.lineHeight as TextLineHeight | undefined}
            onChange={(v) => update({ lineHeight: v })}
          />

          <ControlLabel label="تباعد الحروف" />
          <TokenButtons<TextLetterSpacing>
            tokens={['tight', 'normal', 'wide']}
            labels={LETTER_SPACING_LABELS}
            value={style.letterSpacing as TextLetterSpacing | undefined}
            onChange={(v) => update({ letterSpacing: v })}
          />

          {hasHeaderBg && (
            <>
              <ControlLabel label="خلفية الرأس" />
              <TokenButtons<TableBgColor>
                tokens={['default', 'brand', 'dark', 'blue', 'black', 'gray']}
                labels={TABLE_BG_LABELS}
                value={style.bgColor as TableBgColor | undefined}
                onChange={(v) => update({ bgColor: v })}
              />
            </>
          )}
        </>
      )}

      <div style={{ display: 'flex', gap: 4, marginTop: 4 }}>
        <button
          type="button"
          onClick={() => textStyleDesigner.resetArea(docType, areaKey)}
          style={{
            flex: 1, padding: '4px 0', borderRadius: 5,
            border: '1px solid #fcd34d', background: 'transparent',
            cursor: 'pointer', fontSize: 11, color: '#92400e',
          }}
        >
          ↺ إعادة ضبط
        </button>
        <button
          type="button"
          onClick={() => textStyleDesigner.resetDocType(docType)}
          style={{
            flex: 1, padding: '4px 0', borderRadius: 5,
            border: '1px solid #e2e8f0', background: 'transparent',
            cursor: 'pointer', fontSize: 11, color: '#64748b',
          }}
        >
          ↺ كل المستند
        </button>
      </div>
    </>
  );
}

// ── Main panel ────────────────────────────────────────────────────────────────

export default function BrandingDesignerPanel({
  designer,
  textStyleDesigner,
  staticTextDesigner,
  selection,
  docLabel,
  onClose,
  onSave,
}: Props) {
  const [collapsed, setCollapsed] = useState(false);

  const {
    localLayout, selected, setSelected, docType, updateElement,
    alignCenterH, alignCenterV, bringForward, sendBackward,
    resetElement, resetDoc, snapEnabled, setSnapEnabled,
    gridSize, setGridSize, inkMode, setInkMode,
    saving, saveError, save,
  } = designer;

  const el = localLayout[docType][selected];
  const accentColor = selected === 'signature' ? '#3b82f6' : '#10b981';

  const selectedTextArea = textStyleDesigner?.selectedArea ?? null;

  // When the universal `selection` prop is provided use it; otherwise fall back
  // to the legacy textStyleDesigner.selectedArea signal for backward compat.
  const isTextMode = selection !== undefined
    ? isTextElement(selection)
    : selectedTextArea !== null;
  const isEmptyState = selection !== undefined && selection === null;

  // The id to pass to TextAreaControls — derived from universal selection when
  // available, otherwise from the legacy selectedArea string.
  const textAreaIdForControls: string = isTextElement(selection)
    ? selection.id
    : selectedTextArea ?? '';

  const isDirty = textStyleDesigner?.isDirty ?? false;

  async function handleSave() {
    if (onSave) { await onSave(); }
    else { await save(); }
  }

  function handleAlign(action: 'alignH' | 'alignV' | 'bringForward' | 'sendBackward') {
    switch (action) {
      case 'alignH': alignCenterH(selected); break;
      case 'alignV': alignCenterV(selected); break;
      case 'bringForward': bringForward(selected); break;
      case 'sendBackward': sendBackward(selected); break;
    }
  }

  const isSaving = saving || (textStyleDesigner?.saving ?? false) || (staticTextDesigner?.saving ?? false);
  const error = saveError ?? textStyleDesigner?.saveError ?? staticTextDesigner?.saveError;

  if (collapsed) {
    return (
      <div
        className="no-print"
        style={{
          position: 'fixed', top: 80, insetInlineEnd: 12, zIndex: 9000,
          background: '#fff', borderRadius: 8,
          boxShadow: '0 4px 20px rgba(0,0,0,0.14)',
          border: '1px solid #e2e8f0', direction: 'rtl', overflow: 'hidden',
        }}
      >
        <button
          type="button"
          onClick={() => setCollapsed(false)}
          title="فتح لوحة الخصائص"
          style={{
            display: 'flex', alignItems: 'center', gap: 6,
            padding: '8px 12px', background: 'none', border: 'none',
            cursor: 'pointer', fontSize: 12, color: '#374151', whiteSpace: 'nowrap',
          }}
        >
          ◀ خصائص
        </button>
      </div>
    );
  }

  return (
    <div
      className="no-print"
      style={{
        position: 'fixed', top: 80, insetInlineEnd: 12, zIndex: 9000,
        width: 264, background: '#fff', borderRadius: 10,
        boxShadow: '0 8px 32px rgba(0,0,0,0.15)',
        border: '1px solid #e2e8f0', direction: 'rtl',
        padding: '10px 12px 14px', overflowY: 'auto',
        maxHeight: 'calc(100vh - 96px)',
      }}
    >
      {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
        <span style={{ fontWeight: 700, fontSize: 12, color: '#1e293b' }}>
          {isEmptyState ? 'تصميم' : isTextMode ? 'تنسيق النص' : 'خصائص'} — {docLabel}
        </span>
        <div style={{ display: 'flex', gap: 4 }}>
          <button
            type="button"
            onClick={() => setCollapsed(true)}
            title="طي اللوحة"
            style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: 13, color: '#94a3b8', padding: '0 3px', lineHeight: 1 }}
          >
            ▶
          </button>
          <button
            type="button"
            onClick={onClose}
            title="إغلاق"
            style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: 14, color: '#94a3b8', padding: '0 3px', lineHeight: 1 }}
          >
            ✕
          </button>
        </div>
      </div>

      {/* ── Empty state (universal selection provided but nothing selected) ── */}
      {isEmptyState ? (
        <div style={{
          padding: '20px 8px', textAlign: 'center',
          color: '#94a3b8', fontSize: 11, lineHeight: 1.8,
        }}>
          <div style={{ fontSize: 22, marginBottom: 6 }}>🖱</div>
          <div>انقر على عنصر في المستند لتحديده</div>
          <div style={{ fontSize: 10, marginTop: 4, color: '#cbd5e1' }}>
            توقيع · ختم · منطقة نص
          </div>
        </div>
      ) : isTextMode && textStyleDesigner ? (
        /* ── Text mode: area controls ── */
        <>
          <TextAreaControls textStyleDesigner={textStyleDesigner} areaId={textAreaIdForControls} />
        </>
      ) : (
        <>
          {/* ── Branding mode: existing controls ── */}

          <SectionHeader label="العنصر" />
          <div style={{ display: 'flex', gap: 5, marginBottom: 4 }}>
            {(['signature', 'stamp'] as ElementType[]).map((type) => (
              <button
                key={type}
                type="button"
                onClick={() => setSelected(type)}
                style={{
                  flex: 1, padding: '5px 0', borderRadius: 6, fontSize: 12,
                  fontWeight: 600, cursor: 'pointer',
                  border: `1px solid ${selected === type ? accentColor : '#d1d5db'}`,
                  background: selected === type ? accentColor : 'transparent',
                  color: selected === type ? '#fff' : '#6b7280',
                }}
              >
                {type === 'signature' ? '✏ التوقيع' : '🔵 الختم'}
              </button>
            ))}
          </div>

          <SectionHeader label="الموضع والحجم" />
          <NumSlider lbl="أفقي X" min={-80} max={80} step={1} value={el.x} onChange={(v) => updateElement(selected, { x: v })} />
          <NumSlider lbl="رأسي Y" min={-60} max={60} step={1} value={el.y} onChange={(v) => updateElement(selected, { y: v })} />
          <NumSlider lbl="حجم" min={0.4} max={2.5} step={0.05} value={el.scale} onChange={(v) => updateElement(selected, { scale: v })} />
          <NumSlider lbl="شفافية" min={0.2} max={1} step={0.05} value={el.opacity} onChange={(v) => updateElement(selected, { opacity: v })} />

          {/* Rotation — placeholder for Phase 5D+ */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 8, opacity: 0.45 }}>
            <label style={{ width: 52, fontSize: 11, color: '#6b7280', textAlign: 'end', flexShrink: 0 }}>
              دوران
            </label>
            <input type="range" min={-180} max={180} step={1} value={0} disabled onChange={() => {}} title="الدوران — قريباً" aria-label="الدوران — قريباً" style={{ flex: 1 }} />
            <span style={{ width: 48, fontSize: 11, textAlign: 'center', color: '#94a3b8' }}>قريباً</span>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
            <span style={{ fontSize: 11, color: '#6b7280', width: 52, textAlign: 'end', flexShrink: 0 }}>طبقة</span>
            {[1, 2].map((z) => (
              <label key={z} style={{ display: 'flex', alignItems: 'center', gap: 3, fontSize: 12, cursor: 'pointer' }}>
                <input
                  type="radio"
                  name="bd-zindex"
                  checked={el.zIndex === z}
                  onChange={() => updateElement(selected, { zIndex: z })}
                />
                {z === 1 ? 'خلف' : 'أمام'}
              </label>
            ))}
          </div>

          <SectionHeader label="المظهر" />
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
            <span style={{ fontSize: 11, color: '#6b7280', flexShrink: 0 }}>الحبر:</span>
            <div style={{ display: 'flex', gap: 4, flex: 1 }}>
              {(['original', 'blue-ink', 'black'] as InkMode[]).map((mode) => (
                <button
                  key={mode}
                  type="button"
                  onClick={() => setInkMode(mode)}
                  title={INK_MODE_LABELS[mode]}
                  style={{
                    flex: 1, padding: '3px 2px', borderRadius: 5, fontSize: 10,
                    fontWeight: inkMode === mode ? 700 : 400, cursor: 'pointer',
                    border: `1px solid ${inkMode === mode ? '#3b82f6' : '#d1d5db'}`,
                    background: inkMode === mode ? '#eff6ff' : 'transparent',
                    color: inkMode === mode ? '#3b82f6' : '#6b7280',
                  }}
                >
                  {INK_MODE_LABELS[mode]}
                </button>
              ))}
            </div>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
            <label style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 12, cursor: 'pointer' }}>
              <input type="checkbox" checked={snapEnabled} onChange={(e) => setSnapEnabled(e.target.checked)} />
              محاذاة للشبكة
            </label>
            {snapEnabled && (
              <select
                value={gridSize}
                aria-label="حجم الشبكة"
                title="حجم الشبكة"
                onChange={(e) => setGridSize(Number(e.target.value) as GridSizeOption)}
                style={{ fontSize: 11, padding: '2px 4px', borderRadius: 4, border: '1px solid #d1d5db', marginInlineStart: 'auto' }}
              >
                {GRID_PRESETS.map((p) => (
                  <option key={p.value} value={p.value}>{p.label}</option>
                ))}
              </select>
            )}
          </div>

          <SectionHeader label="محاذاة" />
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 5, marginBottom: 4 }}>
            {([
              { action: 'alignH' as const, title: 'توسيط أفقي — X = 0', icon: '↔' },
              { action: 'alignV' as const, title: 'توسيط رأسي — Y = 0', icon: '↕' },
              { action: 'bringForward' as const, title: 'إحضار للأمام', icon: '⬆ أمام' },
              { action: 'sendBackward' as const, title: 'إرسال للخلف', icon: '⬇ خلف' },
            ]).map(({ action, title, icon }) => (
              <button
                key={action}
                type="button"
                title={title}
                onClick={() => handleAlign(action)}
                style={{ padding: '5px 0', borderRadius: 5, border: '1px solid #e2e8f0', background: '#fafafa', cursor: 'pointer', fontSize: 13 }}
              >
                {icon}
              </button>
            ))}
          </div>

          <SectionHeader label="إعادة ضبط" />
          <div style={{ display: 'flex', flexDirection: 'column', gap: 4, marginBottom: 4 }}>
            <button
              type="button"
              onClick={() => resetElement('signature')}
              style={{ padding: '4px 0', borderRadius: 5, border: '1px solid #3b82f633', background: 'transparent', cursor: 'pointer', fontSize: 11, color: '#3b82f6' }}
            >
              ↺ التوقيع
            </button>
            <button
              type="button"
              onClick={() => resetElement('stamp')}
              style={{ padding: '4px 0', borderRadius: 5, border: '1px solid #10b98133', background: 'transparent', cursor: 'pointer', fontSize: 11, color: '#10b981' }}
            >
              ↺ الختم
            </button>
            <button
              type="button"
              onClick={resetDoc}
              style={{ padding: '4px 0', borderRadius: 5, border: '1px solid #e2e8f0', background: 'transparent', cursor: 'pointer', fontSize: 11, color: '#64748b' }}
            >
              ↺ الكل
            </button>
          </div>

          <SectionHeader label="اختصارات" />
          <div style={{
            fontSize: 10, color: '#94a3b8', background: '#f8fafc',
            padding: '6px 8px', borderRadius: 6, lineHeight: 1.8, marginBottom: 12,
          }}>
            ← → ↑ ↓ &nbsp;تحريك بوحدة<br />
            Shift+سهم &nbsp;تحريك 10 وحدات<br />
            Delete &nbsp;إعادة ضبط المحدد<br />
            Ctrl+Z / Ctrl+Shift+Z &nbsp;تراجع / إعادة<br />
            Ctrl+0 &nbsp;ملاءمة صفحة<br />
            Esc &nbsp;إغلاق وضع التصميم<br />
            انقر نصاً &nbsp;تنسيق المنطقة<br />
            انقر مزدوجاً نصاً ثابتاً &nbsp;تعديل النص
          </div>
        </>
      )}

      {/* Error */}
      {error && (
        <div style={{ fontSize: 12, color: '#dc2626', marginBottom: 8 }}>⚠ {error}</div>
      )}

      {/* Save / Cancel */}
      <div style={{ display: 'flex', gap: 7, marginTop: 4 }}>
        <button
          type="button"
          onClick={onClose}
          style={{
            flex: 1, padding: '7px 0', borderRadius: 8,
            border: '1px solid #d1d5db', background: 'none',
            cursor: 'pointer', fontSize: 12, color: '#64748b',
          }}
        >
          إلغاء
        </button>
        <button
          type="button"
          onClick={handleSave}
          disabled={isSaving}
          style={{
            flex: 2, padding: '7px 0', borderRadius: 8, border: 'none',
            background: isDirty ? '#3b82f6' : '#64748b',
            color: '#fff', cursor: isSaving ? 'not-allowed' : 'pointer',
            fontSize: 13, fontWeight: 700, opacity: isSaving ? 0.7 : 1,
          }}
        >
          {isSaving ? '⏳ جاري الحفظ...' : '💾 حفظ'}
        </button>
      </div>
    </div>
  );
}
