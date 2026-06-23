import { CSSProperties, useCallback, useEffect, useRef, useState } from 'react';
import { api } from '../../api/client';
import type {
  TemplateStudioDocumentType,
  TemplateStudioSettings,
  TemplateStudioTemplate,
  TemplateStudioElement,
  TemplateStudioElementType,
  TextElement,
  DynamicFieldElement,
  QrElement,
  BarcodeElement,
  ImageElement,
  LineElement,
  RectElement,
  CircleElement,
  LineItemsTableElement,
  LineItemsColumn,
  TableHeaderStyle,
  TableRowStyle,
  TableBorderStyle,
  StudioTextStyle,
  StudioColorToken,
} from './templateStudioTypes';
import { getDefaultLineItemsColumns } from './lineItemsResolver';
import {
  parseTemplateStudioSettings,
  serializeTemplateStudioSettings,
  createBlankTemplate,
  cloneTemplate,
  sanitizeTemplateName,
  generateElementId,
  exportTemplate,
  importTemplate,
  isDataUrlWithinLimit,
  MAX_IMAGE_BYTES,
  getAllowedFields,
} from './templateStudioUtils';

// ─── Canvas constants ─────────────────────────────────────────────────────────
// Editor displays A4 at 560×793 (2.667 px/mm); renderer prints at 794×1123.
const EDITOR_W       = 560;
const EDITOR_H       = 793;
const EDITOR_PX_MM   = EDITOR_W / 210; // ≈ 2.667

// ─── Token option lists ───────────────────────────────────────────────────────
const FONT_SIZE_OPTIONS:   NonNullable<StudioTextStyle['fontSize']>[]   = ['small', 'normal', 'large', 'xlarge'];
const FONT_WEIGHT_OPTIONS: NonNullable<StudioTextStyle['fontWeight']>[] = ['regular', 'medium', 'bold'];
const TEXT_COLOR_OPTIONS:  NonNullable<StudioTextStyle['color']>[]      = ['default', 'brand', 'dark', 'blue', 'black', 'gray'];
const TEXT_ALIGN_OPTIONS:  NonNullable<StudioTextStyle['align']>[]      = ['start', 'center', 'end'];
const COLOR_TOKEN_OPTIONS: StudioColorToken[] = ['transparent', 'white', 'light', 'gray', 'brand', 'dark', 'black'];

// ─── Editor-scale text preview style map ─────────────────────────────────────
const FONT_SIZE_PX: Record<NonNullable<StudioTextStyle['fontSize']>, number> = {
  small: 8, normal: 10, large: 12, xlarge: 16,
};

// ─── Drag ref type ────────────────────────────────────────────────────────────
interface DragState {
  elementId:    string;
  startClientX: number;
  startClientY: number;
  startElX:     number;
  startElY:     number;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────
function makeDefaultTextStyle(): StudioTextStyle {
  return { fontSize: 'normal', fontWeight: 'regular', color: 'default', align: 'start' };
}

function makeElement<T extends TemplateStudioElement>(
  type: TemplateStudioElementType,
  defaults: Omit<T, 'id' | 'label'>,
): T {
  return {
    id:    generateElementId(type),
    label: type,
    ...defaults,
  } as T;
}

// ─── TemplateStudioEditor ─────────────────────────────────────────────────────
export interface TemplateStudioEditorProps {
  onClose: () => void;
}

export default function TemplateStudioEditor({ onClose }: TemplateStudioEditorProps) {
  // ── Data ──────────────────────────────────────────────────────
  const [studioSettings, setStudioSettings] = useState<TemplateStudioSettings>({ version: 1, templates: [] });
  const [activeIds, setActiveIds]           = useState<{ invoice: string | null; quotation: string | null }>({ invoice: null, quotation: null });
  const [loading, setLoading]               = useState(true);
  const [saving, setSaving]                 = useState(false);
  const [saveMsg, setSaveMsg]               = useState('');
  const [saveError, setSaveError]           = useState('');

  // ── Editor state ──────────────────────────────────────────────
  const [activeDocType, setActiveDocType]       = useState<TemplateStudioDocumentType>('invoice');
  const [selectedTemplateId, setSelectedTplId]  = useState<string | null>(null);
  const [selectedElementId, setSelectedElId]    = useState<string | null>(null);
  const [renaming, setRenaming]                 = useState<string | null>(null);
  const [renameVal, setRenameVal]               = useState('');

  const dragRef     = useRef<DragState | null>(null);
  const imgInputRef = useRef<HTMLInputElement>(null);
  const importRef   = useRef<HTMLInputElement>(null);

  // ── Load ─────────────────────────────────────────────────────
  useEffect(() => {
    api.get('/settings').then((res) => {
      const list: Array<{ key: string; value: string }> = res.data?.data?.settings ?? [];
      const find = (k: string) => list.find((s) => s.key === k)?.value;
      const parsed = parseTemplateStudioSettings(find('print.templateStudio.templates'));
      if (parsed) setStudioSettings(parsed);
      setActiveIds({
        invoice:   find('print.templateStudio.active.invoice')   ?? null,
        quotation: find('print.templateStudio.active.quotation') ?? null,
      });
    }).catch(() => {}).finally(() => setLoading(false));
  }, []);

  // ── Derived ───────────────────────────────────────────────────
  const visibleTemplates = studioSettings.templates.filter((t) => t.documentType === activeDocType);
  const currentTemplate  = studioSettings.templates.find((t) => t.id === selectedTemplateId) ?? null;
  const selectedElement  = currentTemplate?.elements.find((el) => el.id === selectedElementId) ?? null;
  const activeId         = activeIds[activeDocType];

  // ── Template mutation helpers ─────────────────────────────────
  function updateTemplates(fn: (ts: TemplateStudioTemplate[]) => TemplateStudioTemplate[]) {
    setStudioSettings((prev) => ({ ...prev, templates: fn(prev.templates) }));
  }

  function patchTemplate(id: string, patch: Partial<TemplateStudioTemplate>) {
    updateTemplates((ts) =>
      ts.map((t) => (t.id === id ? { ...t, ...patch, updatedAt: new Date().toISOString() } : t)),
    );
  }

  // ── Element mutation helpers ──────────────────────────────────
  function addElement(el: TemplateStudioElement) {
    if (!selectedTemplateId) return;
    patchTemplate(selectedTemplateId, {
      elements: [...(currentTemplate?.elements ?? []), el],
    });
    setSelectedElId(el.id);
  }

  const updateElement = useCallback((id: string, patch: Partial<TemplateStudioElement>) => {
    if (!selectedTemplateId) return;
    setStudioSettings((prev) => ({
      ...prev,
      templates: prev.templates.map((t) => {
        if (t.id !== selectedTemplateId) return t;
        return {
          ...t,
          elements: t.elements.map((el) =>
            el.id === id ? ({ ...el, ...patch } as TemplateStudioElement) : el,
          ),
          updatedAt: new Date().toISOString(),
        };
      }),
    }));
  }, [selectedTemplateId]);

  function deleteElement(id: string) {
    if (!selectedTemplateId) return;
    patchTemplate(selectedTemplateId, {
      elements: currentTemplate?.elements.filter((el) => el.id !== id) ?? [],
    });
    if (selectedElementId === id) setSelectedElId(null);
  }

  // ── Keyboard: Delete ─────────────────────────────────────────
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      const tag = (e.target as HTMLElement).tagName;
      if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return;
      if (e.key === 'Delete' || e.key === 'Backspace') {
        if (selectedElementId) deleteElement(selectedElementId);
      }
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [selectedElementId, selectedTemplateId, currentTemplate]); // eslint-disable-line react-hooks/exhaustive-deps

  // ── Canvas drag ───────────────────────────────────────────────
  function handleElementPointerDown(e: React.PointerEvent, el: TemplateStudioElement) {
    if (el.locked) return;
    e.stopPropagation();
    setSelectedElId(el.id);
    e.currentTarget.setPointerCapture(e.pointerId);
    dragRef.current = {
      elementId: el.id, startClientX: e.clientX, startClientY: e.clientY,
      startElX: el.x, startElY: el.y,
    };
  }

  function handleCanvasPointerMove(e: React.PointerEvent) {
    if (!dragRef.current) return;
    const { elementId, startClientX, startClientY, startElX, startElY } = dragRef.current;
    const dx  = (e.clientX - startClientX) / EDITOR_PX_MM;
    const dy  = (e.clientY - startClientY) / EDITOR_PX_MM;
    const newX = Math.max(0, Math.round((startElX + dx) * 10) / 10);
    const newY = Math.max(0, Math.round((startElY + dy) * 10) / 10);
    updateElement(elementId, { x: newX, y: newY });
  }

  function handleCanvasPointerUp() {
    dragRef.current = null;
  }

  // ── Save ─────────────────────────────────────────────────────
  async function handleSave() {
    setSaving(true);
    setSaveMsg('');
    setSaveError('');
    try {
      await api.put('/settings', {
        settings: [
          { key: 'print.templateStudio.templates',         value: serializeTemplateStudioSettings(studioSettings), group: 'print' },
          { key: 'print.templateStudio.active.invoice',    value: activeIds.invoice   ?? '', group: 'print' },
          { key: 'print.templateStudio.active.quotation',  value: activeIds.quotation ?? '', group: 'print' },
        ],
      });
      setSaveMsg('تم الحفظ');
      setTimeout(() => setSaveMsg(''), 3000);
    } catch {
      setSaveError('فشل الحفظ');
    } finally {
      setSaving(false);
    }
  }

  // ── Export template ───────────────────────────────────────────
  function handleExport() {
    if (!currentTemplate) return;
    const json = exportTemplate(currentTemplate);
    const blob = new Blob([json], { type: 'application/json' });
    const url  = URL.createObjectURL(blob);
    const a    = document.createElement('a');
    a.href     = url;
    a.download = `${sanitizeTemplateName(currentTemplate.name)}.json`;
    a.click();
    URL.revokeObjectURL(url);
  }

  // ── Import template ───────────────────────────────────────────
  function handleImportFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (ev) => {
      const json = ev.target?.result as string;
      const result = importTemplate(json);
      if (!result.ok) {
        alert(`خطأ في الاستيراد: ${result.error}`);
        return;
      }
      updateTemplates((ts) => [...ts, result.template]);
      setSelectedTplId(result.template.id);
      setActiveDocType(result.template.documentType);
    };
    reader.readAsText(file);
    e.target.value = '';
  }

  // ── Element add shortcuts ─────────────────────────────────────
  const DEFAULT_POS = { x: 15, y: 15, rotation: 0 } as const;

  function addText() {
    addElement(makeElement<TextElement>('text', { ...DEFAULT_POS, w: 50, h: 12, type: 'text', content: 'نص جديد', style: makeDefaultTextStyle() }));
  }
  function addDynamicField() {
    const fields = getAllowedFields(activeDocType);
    addElement(makeElement<DynamicFieldElement>('dynamicField', {
      ...DEFAULT_POS, w: 50, h: 10, type: 'dynamicField', field: fields[0] as string, style: makeDefaultTextStyle(),
    }));
  }
  function addQr() {
    const fields = getAllowedFields(activeDocType);
    addElement(makeElement<QrElement>('qr', { ...DEFAULT_POS, w: 25, h: 25, type: 'qr', field: fields[0] as string }));
  }
  function addBarcode() {
    const fields = getAllowedFields(activeDocType);
    addElement(makeElement<BarcodeElement>('barcode', { ...DEFAULT_POS, w: 60, h: 18, type: 'barcode', field: fields[0] as string }));
  }
  function addImage() {
    imgInputRef.current?.click();
  }
  function handleImageFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file || !file.type.startsWith('image/')) return;
    const reader = new FileReader();
    reader.onload = (ev) => {
      const src = ev.target?.result as string;
      if (!isDataUrlWithinLimit(src, MAX_IMAGE_BYTES)) {
        alert('حجم الصورة يتجاوز 1 ميغابايت');
        return;
      }
      addElement(makeElement<ImageElement>('image', { ...DEFAULT_POS, w: 40, h: 30, type: 'image', src, alt: file.name }));
    };
    reader.readAsDataURL(file);
    e.target.value = '';
  }
  function addLine() {
    addElement(makeElement<LineElement>('line', { ...DEFAULT_POS, w: 80, h: 3, type: 'line', orientation: 'horizontal', color: 'dark', thickness: 0.5 }));
  }
  function addRect() {
    addElement(makeElement<RectElement>('rect', { ...DEFAULT_POS, w: 50, h: 20, type: 'rect', fillColor: 'light', borderColor: 'dark', borderRadius: 0 }));
  }
  function addCircle() {
    addElement(makeElement<CircleElement>('circle', { ...DEFAULT_POS, w: 20, h: 20, type: 'circle', fillColor: 'light', borderColor: 'dark' }));
  }
  function addLineItemsTable() {
    const cols = getDefaultLineItemsColumns(activeDocType);
    addElement(makeElement<LineItemsTableElement>('lineItemsTable', {
      x: 20, y: 80, w: 170, h: 70, rotation: 0,
      type:        'lineItemsTable',
      columns:     cols,
      headerStyle: { background: 'brand', color: 'default', fontSize: 'small', fontWeight: 'bold' },
      rowStyle:    { fontSize: 'small', color: 'default' },
      borderStyle: { color: 'gray' },
      totals:      { showGrandTotal: true },
    }));
  }

  // ── Rename template ───────────────────────────────────────────
  function startRename(tpl: TemplateStudioTemplate) {
    setRenaming(tpl.id);
    setRenameVal(tpl.name);
  }
  function commitRename() {
    if (!renaming) return;
    patchTemplate(renaming, { name: sanitizeTemplateName(renameVal) });
    setRenaming(null);
  }

  // ────────────────────────────────────────────────────────────────────────────
  // Canvas element preview (editor scale)
  // ────────────────────────────────────────────────────────────────────────────
  function elementPreviewStyle(el: TemplateStudioElement): CSSProperties {
    const isSelected = el.id === selectedElementId;
    return {
      position:  'absolute',
      left:      el.x * EDITOR_PX_MM,
      top:       el.y * EDITOR_PX_MM,
      width:     el.w * EDITOR_PX_MM,
      height:    el.h * EDITOR_PX_MM,
      transform: el.rotation ? `rotate(${el.rotation}deg)` : undefined,
      boxSizing: 'border-box',
      cursor:    el.locked ? 'not-allowed' : 'move',
      opacity:   el.hidden ? 0.3 : 1,
      outline:   isSelected ? '2px solid #1d4ed8' : '1px dashed #cbd5e1',
      userSelect: 'none',
    };
  }

  function renderElementPreview(el: TemplateStudioElement): React.ReactNode {
    const textEl = el as TextElement;
    const fs = el.type === 'text' && textEl.style?.fontSize
      ? FONT_SIZE_PX[textEl.style.fontSize]
      : 9;

    switch (el.type) {
      case 'text':
        return (
          <div style={{ fontSize: fs, overflow: 'hidden', whiteSpace: 'nowrap', padding: '1px 2px', fontFamily: 'Cairo, sans-serif', direction: 'rtl' }}>
            {(el as TextElement).content}
          </div>
        );
      case 'dynamicField':
        return (
          <div style={{ fontSize: 8, overflow: 'hidden', whiteSpace: 'nowrap', padding: '1px 2px', color: '#1d4ed8', fontFamily: 'monospace' }}>
            {'{{'}{(el as DynamicFieldElement).field}{'}}'}
          </div>
        );
      case 'qr':
        return (
          <div style={{ width: '100%', height: '100%', background: '#f3f4f6', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 7 }}>
            QR
          </div>
        );
      case 'barcode':
        return (
          <div style={{ width: '100%', height: '100%', background: '#f9fafb', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 7 }}>
            |||||||||
          </div>
        );
      case 'image':
        return (el as ImageElement).src
          ? <img src={(el as ImageElement).src} alt="" style={{ width: '100%', height: '100%', objectFit: 'contain' }} />
          : <div style={{ width: '100%', height: '100%', background: '#f3f4f6', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 7 }}>img</div>;
      case 'line':
        return <div style={{ width: '100%', height: '100%', background: '#1f2937' }} />;
      case 'rect':
        return <div style={{ width: '100%', height: '100%', background: '#e2e8f0', border: '1px solid #94a3b8' }} />;
      case 'circle':
        return <div style={{ width: '100%', height: '100%', background: '#e2e8f0', border: '1px solid #94a3b8', borderRadius: '50%' }} />;
      case 'lineItemsTable': {
        const tblEl = el as LineItemsTableElement;
        const visLabels = tblEl.columns.filter(c => c.visible).map(c => c.label).join(' | ');
        return (
          <div style={{ width: '100%', height: '100%', background: '#f8fafc', border: '1px solid #94a3b8', display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
            <div style={{ background: '#1d4e6f', color: '#fff', fontSize: 6, padding: '1px 3px', fontFamily: 'Cairo, sans-serif' }}>
              {visLabels}
            </div>
            <div style={{ fontSize: 6, color: '#64748b', padding: '2px 3px', fontFamily: 'Cairo, sans-serif' }}>
              بنود الجدول…
            </div>
          </div>
        );
      }
      default:
        return null;
    }
  }

  // ── Property panel ────────────────────────────────────────────
  function renderPropertyPanel() {
    if (!selectedElement) {
      return (
        <div style={{ padding: 12, color: '#6b7280', fontSize: 12 }}>
          اختر عنصراً في اللوحة لعرض خصائصه
        </div>
      );
    }
    const el = selectedElement;

    function numField(label: string, key: 'x' | 'y' | 'w' | 'h' | 'rotation', min = 0) {
      return (
        <div style={propRow}>
          <label style={propLabel}>{label}</label>
          <input
            type="number"
            style={propInput}
            value={el[key]}
            min={min}
            step={0.5}
            onChange={(e) => updateElement(el.id, { [key]: parseFloat(e.target.value) || 0 })}
          />
        </div>
      );
    }

    return (
      <div style={{ padding: 10, display: 'flex', flexDirection: 'column', gap: 6 }}>
        <div style={{ fontSize: 11, fontWeight: 700, color: '#1f2937', marginBottom: 4, direction: 'rtl' }}>
          {el.type} — {el.label}
        </div>

        {/* Base geometry */}
        {numField('X (mm)', 'x')}
        {numField('Y (mm)', 'y')}
        {numField('W (mm)', 'w', 1)}
        {numField('H (mm)', 'h', 1)}
        {numField('دوران°', 'rotation', -360)}

        {/* Label */}
        <div style={propRow}>
          <label style={propLabel}>تسمية</label>
          <input
            type="text"
            style={propInput}
            value={el.label}
            onChange={(e) => updateElement(el.id, { label: e.target.value.slice(0, 40) })}
          />
        </div>

        {/* Locked / hidden */}
        <div style={{ display: 'flex', gap: 8, fontSize: 11 }}>
          <label style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
            <input
              type="checkbox"
              checked={!!el.locked}
              onChange={(e) => updateElement(el.id, { locked: e.target.checked })}
            />
            قفل
          </label>
          <label style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
            <input
              type="checkbox"
              checked={!!el.hidden}
              onChange={(e) => updateElement(el.id, { hidden: e.target.checked })}
            />
            إخفاء
          </label>
        </div>

        {/* Type-specific */}
        {el.type === 'text' && renderTextProps(el)}
        {el.type === 'dynamicField' && renderDynamicFieldProps(el)}
        {el.type === 'qr' && renderFieldSelector(el, 'field')}
        {el.type === 'barcode' && renderFieldSelector(el, 'field')}
        {el.type === 'line' && renderLineProps(el)}
        {el.type === 'rect' && renderRectProps(el)}
        {el.type === 'circle' && renderCircleProps(el)}
        {el.type === 'lineItemsTable' && renderLineItemsTableProps(el as LineItemsTableElement)}

        {/* Delete */}
        <button
          type="button"
          onClick={() => deleteElement(el.id)}
          style={{ marginTop: 8, padding: '4px 0', background: '#fee2e2', border: '1px solid #fca5a5', borderRadius: 4, color: '#dc2626', fontSize: 11, cursor: 'pointer' }}
        >
          حذف العنصر
        </button>
      </div>
    );
  }

  function renderTextProps(el: TextElement) {
    return (
      <>
        <div style={propRow}>
          <label style={propLabel}>محتوى</label>
          <textarea
            style={{ ...propInput, height: 50, resize: 'vertical', fontFamily: 'Cairo, sans-serif' }}
            value={el.content}
            onChange={(e) => updateElement(el.id, { content: e.target.value })}
          />
        </div>
        {renderTextStyleProps(el.style, (s) => updateElement(el.id, { style: s }))}
      </>
    );
  }

  function renderDynamicFieldProps(el: DynamicFieldElement) {
    const fields = getAllowedFields(activeDocType);
    return (
      <>
        <div style={propRow}>
          <label style={propLabel}>حقل</label>
          <select style={propInput} value={el.field}
            onChange={(e) => updateElement(el.id, { field: e.target.value })}>
            {fields.map((f) => <option key={f} value={f}>{f}</option>)}
          </select>
        </div>
        {renderTextStyleProps(el.style ?? {}, (s) => updateElement(el.id, { style: s }))}
      </>
    );
  }

  function renderFieldSelector(el: QrElement | BarcodeElement, key: 'field') {
    const fields = getAllowedFields(activeDocType);
    return (
      <div style={propRow}>
        <label style={propLabel}>حقل</label>
        <select style={propInput} value={el[key]}
          onChange={(e) => updateElement(el.id, { [key]: e.target.value })}>
          {fields.map((f) => <option key={f} value={f}>{f}</option>)}
        </select>
      </div>
    );
  }

  function renderTextStyleProps(style: StudioTextStyle, onChange: (s: StudioTextStyle) => void) {
    return (
      <>
        <div style={propRow}>
          <label style={propLabel}>حجم</label>
          <select style={propInput} value={style.fontSize ?? 'normal'}
            onChange={(e) => onChange({ ...style, fontSize: e.target.value as StudioTextStyle['fontSize'] })}>
            {FONT_SIZE_OPTIONS.map((v) => <option key={v} value={v}>{v}</option>)}
          </select>
        </div>
        <div style={propRow}>
          <label style={propLabel}>وزن</label>
          <select style={propInput} value={style.fontWeight ?? 'regular'}
            onChange={(e) => onChange({ ...style, fontWeight: e.target.value as StudioTextStyle['fontWeight'] })}>
            {FONT_WEIGHT_OPTIONS.map((v) => <option key={v} value={v}>{v}</option>)}
          </select>
        </div>
        <div style={propRow}>
          <label style={propLabel}>لون النص</label>
          <select style={propInput} value={style.color ?? 'default'}
            onChange={(e) => onChange({ ...style, color: e.target.value as StudioTextStyle['color'] })}>
            {TEXT_COLOR_OPTIONS.map((v) => <option key={v} value={v}>{v}</option>)}
          </select>
        </div>
        <div style={propRow}>
          <label style={propLabel}>محاذاة</label>
          <select style={propInput} value={style.align ?? 'start'}
            onChange={(e) => onChange({ ...style, align: e.target.value as StudioTextStyle['align'] })}>
            {TEXT_ALIGN_OPTIONS.map((v) => <option key={v} value={v}>{v}</option>)}
          </select>
        </div>
      </>
    );
  }

  function renderLineProps(el: LineElement) {
    return (
      <>
        <div style={propRow}>
          <label style={propLabel}>اتجاه</label>
          <select style={propInput} value={el.orientation}
            onChange={(e) => updateElement(el.id, { orientation: e.target.value as LineElement['orientation'] })}>
            <option value="horizontal">أفقي</option>
            <option value="vertical">عمودي</option>
          </select>
        </div>
        <div style={propRow}>
          <label style={propLabel}>لون</label>
          <select style={propInput} value={el.color}
            onChange={(e) => updateElement(el.id, { color: e.target.value as StudioColorToken })}>
            {COLOR_TOKEN_OPTIONS.map((v) => <option key={v} value={v}>{v}</option>)}
          </select>
        </div>
        <div style={propRow}>
          <label style={propLabel}>سماكة (mm)</label>
          <input type="number" style={propInput} value={el.thickness} min={0.1} step={0.1}
            onChange={(e) => updateElement(el.id, { thickness: parseFloat(e.target.value) || 0.5 })} />
        </div>
      </>
    );
  }

  function renderRectProps(el: RectElement) {
    return (
      <>
        <div style={propRow}>
          <label style={propLabel}>تعبئة</label>
          <select style={propInput} value={el.fillColor}
            onChange={(e) => updateElement(el.id, { fillColor: e.target.value as StudioColorToken })}>
            {COLOR_TOKEN_OPTIONS.map((v) => <option key={v} value={v}>{v}</option>)}
          </select>
        </div>
        <div style={propRow}>
          <label style={propLabel}>إطار</label>
          <select style={propInput} value={el.borderColor}
            onChange={(e) => updateElement(el.id, { borderColor: e.target.value as StudioColorToken })}>
            {COLOR_TOKEN_OPTIONS.map((v) => <option key={v} value={v}>{v}</option>)}
          </select>
        </div>
        <div style={propRow}>
          <label style={propLabel}>نصف قطر (mm)</label>
          <input type="number" style={propInput} value={el.borderRadius} min={0} step={0.5}
            onChange={(e) => updateElement(el.id, { borderRadius: parseFloat(e.target.value) || 0 })} />
        </div>
      </>
    );
  }

  function renderCircleProps(el: CircleElement) {
    return (
      <>
        <div style={propRow}>
          <label style={propLabel}>تعبئة</label>
          <select style={propInput} value={el.fillColor}
            onChange={(e) => updateElement(el.id, { fillColor: e.target.value as StudioColorToken })}>
            {COLOR_TOKEN_OPTIONS.map((v) => <option key={v} value={v}>{v}</option>)}
          </select>
        </div>
        <div style={propRow}>
          <label style={propLabel}>إطار</label>
          <select style={propInput} value={el.borderColor}
            onChange={(e) => updateElement(el.id, { borderColor: e.target.value as StudioColorToken })}>
            {COLOR_TOKEN_OPTIONS.map((v) => <option key={v} value={v}>{v}</option>)}
          </select>
        </div>
      </>
    );
  }

  function renderLineItemsTableProps(el: LineItemsTableElement) {
    function updateCol(colId: string, patch: Partial<LineItemsColumn>) {
      updateElement(el.id, {
        columns: el.columns.map((c) => (c.id === colId ? { ...c, ...patch } : c)),
      } as Partial<LineItemsTableElement>);
    }
    function moveCol(colId: string, dir: -1 | 1) {
      const idx = el.columns.findIndex((c) => c.id === colId);
      if (idx < 0) return;
      const newIdx = idx + dir;
      if (newIdx < 0 || newIdx >= el.columns.length) return;
      const cols = [...el.columns];
      [cols[idx], cols[newIdx]] = [cols[newIdx], cols[idx]];
      updateElement(el.id, { columns: cols } as Partial<LineItemsTableElement>);
    }
    function updateHeader(patch: Partial<TableHeaderStyle>) {
      updateElement(el.id, { headerStyle: { ...el.headerStyle, ...patch } } as Partial<LineItemsTableElement>);
    }
    function updateRow(patch: Partial<TableRowStyle>) {
      updateElement(el.id, { rowStyle: { ...el.rowStyle, ...patch } } as Partial<LineItemsTableElement>);
    }
    function updateBorder(patch: Partial<TableBorderStyle>) {
      updateElement(el.id, { borderStyle: { ...el.borderStyle, ...patch } } as Partial<LineItemsTableElement>);
    }
    function updateTotals(patch: Partial<NonNullable<LineItemsTableElement['totals']>>) {
      updateElement(el.id, { totals: { ...el.totals, ...patch } } as Partial<LineItemsTableElement>);
    }

    return (
      <>
        {/* Columns */}
        <div style={{ fontSize: 10, fontWeight: 700, color: '#94a3b8', marginTop: 6 }}>الأعمدة</div>
        {el.columns.map((col, i) => (
          <div key={col.id} style={{ border: '1px solid #334155', borderRadius: 3, padding: 4, marginBottom: 3 }}>
            <label style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 10, marginBottom: 3 }}>
              <input type="checkbox" aria-label={`إظهار عمود ${col.field}`} checked={col.visible}
                onChange={(e) => updateCol(col.id, { visible: e.target.checked })} />
              <span style={{ color: '#e2e8f0' }}>{col.field}</span>
            </label>
            <div style={propRow}>
              <label style={propLabel}>تسمية</label>
              <input type="text" style={propInput} value={col.label} maxLength={30}
                aria-label="تسمية العمود"
                onChange={(e) => updateCol(col.id, { label: e.target.value.replace(/[<>]/g, '') })} />
            </div>
            <div style={propRow}>
              <label style={propLabel}>عرض %</label>
              <input type="number" style={propInput} value={col.width} min={0} max={100} step={1}
                aria-label="عرض العمود"
                onChange={(e) => updateCol(col.id, { width: parseFloat(e.target.value) || 0 })} />
            </div>
            <div style={propRow}>
              <label style={propLabel}>محاذاة</label>
              <select style={propInput} value={col.align} title="محاذاة العمود"
                onChange={(e) => updateCol(col.id, { align: e.target.value as LineItemsColumn['align'] })}>
                <option value="start">يمين</option>
                <option value="center">وسط</option>
                <option value="end">يسار</option>
              </select>
            </div>
            <div style={{ display: 'flex', gap: 4, marginTop: 3 }}>
              <button type="button" style={{ ...propInput, cursor: 'pointer', flex: 1, textAlign: 'center' }}
                disabled={i === 0} onClick={() => moveCol(col.id, -1)}>↑</button>
              <button type="button" style={{ ...propInput, cursor: 'pointer', flex: 1, textAlign: 'center' }}
                disabled={i === el.columns.length - 1} onClick={() => moveCol(col.id, 1)}>↓</button>
            </div>
          </div>
        ))}

        {/* Header style */}
        <div style={{ fontSize: 10, fontWeight: 700, color: '#94a3b8', marginTop: 6 }}>رأس الجدول</div>
        <div style={propRow}>
          <label style={propLabel}>خلفية</label>
          <select style={propInput} value={el.headerStyle.background}
            onChange={(e) => updateHeader({ background: e.target.value as TableHeaderStyle['background'] })}>
            {COLOR_TOKEN_OPTIONS.map((v) => <option key={v} value={v}>{v}</option>)}
          </select>
        </div>
        <div style={propRow}>
          <label style={propLabel}>حجم خط الرأس</label>
          <select style={propInput} value={el.headerStyle.fontSize}
            onChange={(e) => updateHeader({ fontSize: e.target.value as TableHeaderStyle['fontSize'] })}>
            {FONT_SIZE_OPTIONS.map((v) => <option key={v} value={v}>{v}</option>)}
          </select>
        </div>

        {/* Row style */}
        <div style={{ fontSize: 10, fontWeight: 700, color: '#94a3b8', marginTop: 6 }}>صفوف البيانات</div>
        <div style={propRow}>
          <label style={propLabel}>حجم الخط</label>
          <select style={propInput} value={el.rowStyle.fontSize}
            onChange={(e) => updateRow({ fontSize: e.target.value as TableRowStyle['fontSize'] })}>
            {FONT_SIZE_OPTIONS.map((v) => <option key={v} value={v}>{v}</option>)}
          </select>
        </div>

        {/* Border */}
        <div style={{ fontSize: 10, fontWeight: 700, color: '#94a3b8', marginTop: 6 }}>الحدود</div>
        <div style={propRow}>
          <label style={propLabel}>لون الحدود</label>
          <select style={propInput} value={el.borderStyle.color}
            onChange={(e) => updateBorder({ color: e.target.value as TableBorderStyle['color'] })}>
            {COLOR_TOKEN_OPTIONS.map((v) => <option key={v} value={v}>{v}</option>)}
          </select>
        </div>

        {/* Totals */}
        <div style={{ fontSize: 10, fontWeight: 700, color: '#94a3b8', marginTop: 6 }}>الإجماليات</div>
        {(
          [
            ['showSubtotal',   'الإجمالي قبل الخصم'],
            ['showDiscount',   'الخصم'],
            ['showTax',        'الضريبة'],
            ['showGrandTotal', 'الإجمالي النهائي'],
          ] as [keyof Pick<NonNullable<LineItemsTableElement['totals']>, 'showSubtotal' | 'showDiscount' | 'showTax' | 'showGrandTotal'>, string][]
        ).map(([key, lbl]) => (
          <label key={key} style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 11, color: '#e2e8f0' }}>
            <input type="checkbox" aria-label={lbl} checked={!!el.totals?.[key]}
              onChange={(e) => updateTotals({ [key]: e.target.checked })} />
            {lbl}
          </label>
        ))}
        <div style={propRow}>
          <label style={propLabel}>محاذاة التسمية</label>
          <select style={propInput} value={el.totals?.labelAlign ?? 'end'}
            title="محاذاة تسمية الإجمالي"
            onChange={(e) => updateTotals({ labelAlign: e.target.value as 'start' | 'center' | 'end' })}>
            <option value="start">يمين</option>
            <option value="center">وسط</option>
            <option value="end">يسار</option>
          </select>
        </div>
        <div style={propRow}>
          <label style={propLabel}>محاذاة القيمة</label>
          <select style={propInput} value={el.totals?.valueAlign ?? 'end'}
            title="محاذاة قيمة الإجمالي"
            onChange={(e) => updateTotals({ valueAlign: e.target.value as 'start' | 'center' | 'end' })}>
            <option value="start">يمين</option>
            <option value="center">وسط</option>
            <option value="end">يسار</option>
          </select>
        </div>

        {/* Display options */}
        <div style={{ fontSize: 10, fontWeight: 700, color: '#94a3b8', marginTop: 6 }}>خيارات العرض</div>
        <label style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 11, color: '#e2e8f0' }}>
          <input type="checkbox" aria-label="إخفاء الأعمدة الصفرية تلقائياً" checked={!!el.autoHideZeroColumns}
            onChange={(e) => updateElement(el.id, { autoHideZeroColumns: e.target.checked } as Partial<LineItemsTableElement>)} />
          إخفاء الأعمدة الصفرية تلقائياً
        </label>
        <label style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 11, color: '#e2e8f0' }}>
          <input type="checkbox" aria-label="تلوين الصفوف بالتناوب" checked={!!el.rowStriping}
            onChange={(e) => updateElement(el.id, { rowStriping: e.target.checked } as Partial<LineItemsTableElement>)} />
          تلوين الصفوف بالتناوب
        </label>
      </>
    );
  }

  // ── Inline styles ────────────────────────────────────────────
  const propRow:   CSSProperties = { display: 'flex', flexDirection: 'column', gap: 2 };
  const propLabel: CSSProperties = { fontSize: 10, color: '#64748b', fontWeight: 600 };
  const propInput: CSSProperties = { fontSize: 11, padding: '2px 4px', border: '1px solid #cbd5e1', borderRadius: 3, background: '#fff', fontFamily: 'Cairo, sans-serif' };

  // ── Render ───────────────────────────────────────────────────
  if (loading) {
    return (
      <div style={overlay}>
        <div style={{ color: '#fff', fontSize: 16 }}>جاري التحميل…</div>
      </div>
    );
  }

  return (
    <div style={overlay} dir="rtl">
      {/* ── Top bar ─────────────────────────────────────────── */}
      <div style={topBar}>
        <span style={{ fontWeight: 700, fontSize: 15, color: '#fff' }}>Template Studio</span>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          {saveMsg   && <span style={{ color: '#86efac', fontSize: 12 }}>{saveMsg}</span>}
          {saveError && <span style={{ color: '#fca5a5', fontSize: 12 }}>{saveError}</span>}
          <button type="button" style={btnSave} onClick={handleSave} disabled={saving}>
            {saving ? 'جاري الحفظ…' : 'حفظ'}
          </button>
          <button type="button" style={btnClose} onClick={onClose}>✕ إغلاق</button>
        </div>
      </div>

      {/* ── Body ────────────────────────────────────────────── */}
      <div style={{ display: 'flex', flex: 1, overflow: 'hidden' }}>

        {/* Left: template panel ────────────────────────────── */}
        <div style={leftPanel}>
          {/* Doc type tabs */}
          <div style={{ display: 'flex', borderBottom: '1px solid #334155', marginBottom: 8 }}>
            {(['invoice', 'quotation'] as TemplateStudioDocumentType[]).map((dt) => (
              <button
                key={dt}
                type="button"
                onClick={() => { setActiveDocType(dt); setSelectedTplId(null); setSelectedElId(null); }}
                style={{
                  flex: 1, padding: '6px 4px', fontSize: 11, cursor: 'pointer',
                  background: activeDocType === dt ? '#1d4e6f' : 'transparent',
                  color: '#e2e8f0', border: 'none',
                }}
              >
                {dt === 'invoice' ? 'فاتورة' : 'عرض سعر'}
              </button>
            ))}
          </div>

          {/* Template list */}
          <div style={{ flex: 1, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 4, marginBottom: 8 }}>
            {visibleTemplates.length === 0 && (
              <div style={{ fontSize: 11, color: '#94a3b8', padding: '4px 8px' }}>لا توجد قوالب</div>
            )}
            {visibleTemplates.map((tpl) => (
              <div key={tpl.id}
                onClick={() => { setSelectedTplId(tpl.id); setSelectedElId(null); }}
                style={{
                  padding: '5px 8px', borderRadius: 4, cursor: 'pointer',
                  background: tpl.id === selectedTemplateId ? '#1e3a5f' : 'transparent',
                  border: '1px solid ' + (tpl.id === selectedTemplateId ? '#3b82f6' : '#334155'),
                  fontSize: 11, color: '#e2e8f0',
                }}
              >
                {renaming === tpl.id ? (
                  <input
                    autoFocus
                    type="text"
                    value={renameVal}
                    onChange={(e) => setRenameVal(e.target.value)}
                    onBlur={commitRename}
                    onKeyDown={(e) => { if (e.key === 'Enter') commitRename(); if (e.key === 'Escape') setRenaming(null); }}
                    style={{ fontSize: 11, width: '100%', background: '#1e293b', color: '#e2e8f0', border: '1px solid #3b82f6', borderRadius: 3 }}
                    onClick={(e) => e.stopPropagation()}
                  />
                ) : (
                  <span>{tpl.name}{activeIds[tpl.documentType] === tpl.id ? ' ★' : ''}</span>
                )}
              </div>
            ))}
          </div>

          {/* Template actions */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
            <button type="button" style={btnLeft} onClick={() => {
              const tpl = createBlankTemplate(activeDocType);
              updateTemplates((ts) => [...ts, tpl]);
              setSelectedTplId(tpl.id);
              setSelectedElId(null);
            }}>+ جديد</button>

            {currentTemplate && (
              <>
                <button type="button" style={btnLeft} onClick={() => startRename(currentTemplate)}>تسمية</button>
                <button type="button" style={btnLeft} onClick={() => {
                  const copy = cloneTemplate(currentTemplate);
                  updateTemplates((ts) => [...ts, copy]);
                  setSelectedTplId(copy.id);
                }}>نسخ</button>
                <button type="button" style={btnLeft} onClick={handleExport}>تصدير</button>
                <button type="button" style={btnLeft}
                  onClick={() => setActiveIds((prev) => ({
                    ...prev,
                    [activeDocType]: activeId === currentTemplate.id ? null : currentTemplate.id,
                  }))}>
                  {activeId === currentTemplate.id ? 'إلغاء التفعيل' : 'تفعيل'}
                </button>
                <button type="button" style={{ ...btnLeft, color: '#fca5a5', borderColor: '#7f1d1d' }}
                  onClick={() => {
                    if (confirm(`حذف "${currentTemplate.name}"؟`)) {
                      updateTemplates((ts) => ts.filter((t) => t.id !== currentTemplate.id));
                      setSelectedTplId(null);
                      setSelectedElId(null);
                    }
                  }}>حذف</button>
              </>
            )}

            <button type="button" style={btnLeft} onClick={() => importRef.current?.click()}>
              استيراد ملف
            </button>
            <input ref={importRef} type="file" accept=".json" hidden onChange={handleImportFile} />
          </div>
        </div>

        {/* Center: canvas ──────────────────────────────────── */}
        <div style={canvasArea}>
          {!currentTemplate ? (
            <div style={{ color: '#94a3b8', fontSize: 13, textAlign: 'center' }}>
              اختر قالباً من القائمة أو أنشئ قالباً جديداً
            </div>
          ) : (
            <>
              {/* Element toolbar row above canvas */}
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4, marginBottom: 8, direction: 'rtl' }}>
                {[
                  { label: 'نص',         fn: addText },
                  { label: 'حقل',        fn: addDynamicField },
                  { label: 'QR',         fn: addQr },
                  { label: 'باركود',     fn: addBarcode },
                  { label: 'صورة',       fn: addImage },
                  { label: 'خط',         fn: addLine },
                  { label: 'مستطيل',     fn: addRect },
                  { label: 'دائرة',      fn: addCircle },
                  { label: 'جدول بنود',  fn: addLineItemsTable },
                ].map(({ label, fn }) => (
                  <button key={label} type="button" onClick={fn} style={btnTool}>
                    + {label}
                  </button>
                ))}
                <input ref={imgInputRef} type="file" accept="image/*" hidden onChange={handleImageFile} />
              </div>

              {/* A4 canvas */}
              <div style={{ overflow: 'auto', flex: 1 }}>
                <div
                  style={{
                    position:  'relative',
                    width:     EDITOR_W,
                    height:    EDITOR_H,
                    background: '#ffffff',
                    border:    '1px solid #cbd5e1',
                    boxSizing: 'border-box',
                    overflow:  'hidden',
                    flexShrink: 0,
                  }}
                  onClick={() => setSelectedElId(null)}
                  onPointerMove={handleCanvasPointerMove}
                  onPointerUp={handleCanvasPointerUp}
                >
                  {currentTemplate.elements.map((el) => (
                    <div
                      key={el.id}
                      style={elementPreviewStyle(el)}
                      onPointerDown={(e) => handleElementPointerDown(e, el)}
                    >
                      {renderElementPreview(el)}
                    </div>
                  ))}
                </div>
              </div>
            </>
          )}
        </div>

        {/* Right: properties ───────────────────────────────── */}
        <div style={rightPanel}>
          <div style={{ fontSize: 11, fontWeight: 700, color: '#94a3b8', marginBottom: 8, paddingBottom: 6, borderBottom: '1px solid #334155' }}>
            الخصائص
          </div>
          <div style={{ overflowY: 'auto', flex: 1 }}>
            {renderPropertyPanel()}
          </div>
        </div>
      </div>
    </div>
  );
}

// ─── Static styles ─────────────────────────────────────────────────────────────
const overlay: CSSProperties = {
  position:   'fixed',
  inset:       0,
  zIndex:      9000,
  background: '#0f172a',
  display:    'flex',
  flexDirection: 'column',
  fontFamily: 'Cairo, sans-serif',
};

const topBar: CSSProperties = {
  display:        'flex',
  justifyContent: 'space-between',
  alignItems:     'center',
  padding:        '8px 16px',
  background:     '#1e293b',
  borderBottom:   '1px solid #334155',
  flexShrink:     0,
};

const leftPanel: CSSProperties = {
  width:        200,
  background:   '#1e293b',
  borderLeft:   '1px solid #334155',
  padding:      10,
  display:      'flex',
  flexDirection: 'column',
  overflowY:    'hidden',
  flexShrink:   0,
};

const canvasArea: CSSProperties = {
  flex:         1,
  display:      'flex',
  flexDirection: 'column',
  alignItems:   'center',
  padding:       12,
  overflowY:    'auto',
  background:   '#1a2332',
};

const rightPanel: CSSProperties = {
  width:        220,
  background:   '#1e293b',
  borderRight:  '1px solid #334155',
  padding:      10,
  display:      'flex',
  flexDirection: 'column',
  overflowY:    'hidden',
  flexShrink:   0,
};

const btnSave: CSSProperties = {
  padding:    '5px 14px',
  background: '#1d4ed8',
  color:      '#fff',
  border:     'none',
  borderRadius: 5,
  cursor:     'pointer',
  fontSize:   12,
  fontFamily: 'Cairo, sans-serif',
};

const btnClose: CSSProperties = {
  padding:    '5px 12px',
  background: '#334155',
  color:      '#e2e8f0',
  border:     'none',
  borderRadius: 5,
  cursor:     'pointer',
  fontSize:   12,
  fontFamily: 'Cairo, sans-serif',
};

const btnLeft: CSSProperties = {
  width:        '100%',
  padding:      '4px 6px',
  background:   '#1e3a5f',
  color:        '#93c5fd',
  border:       '1px solid #1e40af',
  borderRadius:  3,
  cursor:        'pointer',
  fontSize:      11,
  textAlign:     'right',
  fontFamily:   'Cairo, sans-serif',
};

const btnTool: CSSProperties = {
  padding:    '3px 10px',
  background: '#0f172a',
  color:      '#93c5fd',
  border:     '1px solid #334155',
  borderRadius: 4,
  cursor:     'pointer',
  fontSize:   11,
  fontFamily: 'Cairo, sans-serif',
};
