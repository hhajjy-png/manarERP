import { useRef, useState } from 'react';
import { api, errorMessage } from '../api/client';
import { money } from '../config/modules';
import { ARABIC_MONTHS, billingYearOptions } from '../utils/dateUtils';
import { EXPENSE_CATEGORY_SELECT_OPTIONS } from '../config/expenseCategories';
import { EXPENSE_PAYMENT_METHOD_OPTIONS } from '../config/expensePresentation';
import SearchableSelect from './SearchableSelect';
import DateInput from './DateInput';
import { todayDateOnly } from '../lib/date';
import { Dialog, DialogSection, Button } from './explorer/ExplorerKit';
import {
  FastSharedFields,
  FastRowFields,
  FastSessionSummary,
  EMPTY_SUMMARY,
  makeEmptyRow,
  buildFastExpensePayload,
  validateFastRow,
  addToSummary,
  isRowDirty,
} from '../pages/fastExpenseEntry';

interface Supplier { id: number; name: string }

interface Props {
  onClose: () => void;
  /** يُستدعى عند إغلاق الحوار بعد حفظ صف واحد على الأقل — لتحديث الجدول. */
  onSaved: () => void;
  suppliers: Supplier[];
}

/**
 * «تسجيل مصروفات شهرية» — مسرّع إدخال (ليس دفعة ولا استيراد).
 * حقول مشتركة ثابتة أعلى الحوار + صف إدخال متكرر. كل حفظ يُنشئ مصروفًا عاديًا
 * عبر POST /expenses (نفس مسار الإنشاء)، ثم يمسح حقول الصف مع إبقاء المشترك.
 */
export default function FastMonthlyExpenseDialog({ onClose, onSaved, suppliers }: Props) {
  const now = new Date();
  const [shared, setShared] = useState<FastSharedFields>({
    date: todayDateOnly(now),
    billingMonth: now.getMonth() + 1,
    billingYear: now.getFullYear(),
    paymentMethod: 'CASH',
    supplierId: '',
    supplierName: '',
    notesPrefix: '',
  });
  const [row, setRow] = useState<FastRowFields>(makeEmptyRow());
  const [summary, setSummary] = useState<FastSessionSummary>(EMPTY_SUMMARY);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const rowRef = useRef<HTMLDivElement>(null);

  const savedAny = summary.count > 0;
  const perRowSupplier = shared.supplierId === 'PER_ROW';

  function patchShared(p: Partial<FastSharedFields>) { setShared((s) => ({ ...s, ...p })); }
  function patchRow(p: Partial<FastRowFields>) { setRow((r) => ({ ...r, ...p })); }

  function focusCategory() {
    setTimeout(() => rowRef.current?.querySelector<HTMLButtonElement>('.msel-trigger')?.focus(), 30);
  }

  /** يحفظ الصف الحالي كمصروف عادي. يعيد true عند النجاح. */
  async function saveCurrentRow(): Promise<boolean> {
    setError('');
    const validationError = validateFastRow(row);
    if (validationError) { setError(validationError); return false; }
    if (saving) return false;

    setSaving(true);
    try {
      const payload = buildFastExpensePayload(shared, row);
      const res = await api.post('/expenses', payload);
      const created = res.data?.data ?? {};
      setSummary((s) => addToSummary(s, Number(row.amount), created.code ?? null, row.description.trim() || null));
      return true;
    } catch (e) {
      setError(errorMessage(e));
      return false;
    } finally {
      setSaving(false);
    }
  }

  async function saveAndNext() {
    const okSaved = await saveCurrentRow();
    if (!okSaved) return;
    // امسح الحقول الخاصة بالصف فقط؛ الحقول المشتركة تبقى ثابتة.
    setRow(makeEmptyRow());
    focusCategory();
  }

  async function saveAndFinish() {
    const okSaved = await saveCurrentRow();
    if (!okSaved) return;
    onSaved(); // حُفظ صف الآن على الأقل — حدِّث الجدول
    onClose();
  }

  function requestClose() {
    if (isRowDirty(row)) {
      const discard = window.confirm('لديك مصروف غير محفوظ في الصف الحالي. الإغلاق سيتجاهله. هل تريد المتابعة؟');
      if (!discard) return;
    }
    if (savedAny) onSaved(); // اعكس الصفوف المحفوظة في الجدول
    onClose();
  }

  function onKeyDown(e: React.KeyboardEvent) {
    if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) {
      e.preventDefault();
      if (e.shiftKey) saveAndFinish(); else saveAndNext();
    }
  }

  const supplierName = suppliers.find((s) => String(s.id) === shared.supplierId)?.name;

  return (
    <Dialog
      icon="calendar_month"
      title="تسجيل مصروفات شهرية"
      subtitle="إدخال سريع — كل صف يُحفظ كمصروف عادي"
      size="lg"
      onClose={requestClose}
      footer={
        <>
          <Button variant="primary" icon="playlist_add" busy={saving} onClick={saveAndNext}>حفظ وإضافة التالي</Button>
          <Button variant="secondary" icon="save" busy={saving} onClick={saveAndFinish}>حفظ وإنهاء</Button>
          <Button variant="ghost" onClick={requestClose}>إلغاء</Button>
        </>
      }
    >
      <div onKeyDown={onKeyDown}>
        {error && <div className="xpl-form-error"><span className="material-symbols-outlined">error</span>{error}</div>}

        {/* ── الحقول المشتركة الثابتة ── */}
        <DialogSection title="حقول مشتركة (ثابتة لكل الإدخالات)" icon="push_pin">
          <div className="xpl-field">
            <label>التاريخ</label>
            <DateInput className="xpl-input" value={shared.date} onChange={(v) => {
              const patch: Partial<FastSharedFields> = { date: v };
              if (v) { const [yy, mm] = v.split('-'); patch.billingMonth = Number(mm); patch.billingYear = Number(yy); }
              patchShared(patch);
            }} ariaLabel="التاريخ" />
          </div>
          <div className="xpl-field">
            <label>طريقة الدفع</label>
            <select className="xpl-select" value={shared.paymentMethod} onChange={(e) => patchShared({ paymentMethod: e.target.value })} aria-label="طريقة الدفع">
              {EXPENSE_PAYMENT_METHOD_OPTIONS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
            </select>
          </div>
          <div className="xpl-field">
            <label>شهر الحساب</label>
            <select className="xpl-select" value={shared.billingMonth} onChange={(e) => patchShared({ billingMonth: Number(e.target.value) })} aria-label="شهر الحساب">
              {ARABIC_MONTHS.map((n, i) => <option key={i + 1} value={i + 1}>{n}</option>)}
            </select>
          </div>
          <div className="xpl-field">
            <label>سنة الحساب</label>
            <select className="xpl-select" value={shared.billingYear} onChange={(e) => patchShared({ billingYear: Number(e.target.value) })} aria-label="سنة الحساب">
              {billingYearOptions().map((y) => <option key={y} value={y}>{y}</option>)}
            </select>
          </div>
          <div className="xpl-field">
            <label>المورد (لكل الإدخالات)</label>
            <select className="xpl-select" value={shared.supplierId} onChange={(e) => patchShared({ supplierId: e.target.value })} aria-label="المورد المشترك">
              <option value="">— بدون مورد —</option>
              <option value="PER_ROW">— لكل صفّ على حدة —</option>
              {suppliers.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
              <option value="OTHER">مورد آخر (غير مسجّل)…</option>
            </select>
          </div>
          {shared.supplierId === 'OTHER' && (
            <div className="xpl-field">
              <label>اسم المورد المشترك</label>
              <input className="xpl-input" value={shared.supplierName} onChange={(e) => patchShared({ supplierName: e.target.value })} placeholder="اكتب اسم المورد" aria-label="اسم المورد المشترك" />
            </div>
          )}
          <div className="xpl-field xpl-field--full">
            <label>بادئة الملاحظات (اختياري)</label>
            <input className="xpl-input" value={shared.notesPrefix} onChange={(e) => patchShared({ notesPrefix: e.target.value })} placeholder="تُضاف قبل ملاحظة كل صف" aria-label="بادئة الملاحظات" />
          </div>
        </DialogSection>

        {/* ── صف الإدخال ── */}
        <DialogSection title="المصروف الحالي" icon="receipt_long">
          <div className="xpl-field" ref={rowRef}>
            <label>التصنيف <span className="req">*</span></label>
            <SearchableSelect
              options={EXPENSE_CATEGORY_SELECT_OPTIONS}
              value={row.category}
              onChange={(v) => patchRow({ category: v })}
              ariaLabel="التصنيف"
              placeholder="اختر التصنيف…"
              searchPlaceholder="ابحث في التصنيفات…"
            />
          </div>
          <div className="xpl-field">
            <label>المبلغ (د.ك) <span className="req">*</span></label>
            <input className="xpl-input" type="number" min="0.001" step="0.001" placeholder="0.000" value={row.amount} onChange={(e) => patchRow({ amount: e.target.value })} style={{ direction: 'ltr' }} aria-label="المبلغ" />
          </div>
          <div className="xpl-field xpl-field--full">
            <label>الوصف <span className="req">*</span></label>
            <input className="xpl-input" value={row.description} onChange={(e) => patchRow({ description: e.target.value })} placeholder="وصف المصروف" aria-label="الوصف" />
          </div>
          {perRowSupplier && (
            <>
              <div className="xpl-field">
                <label>المورد (هذا الصف)</label>
                <select className="xpl-select" value={row.supplierId} onChange={(e) => patchRow({ supplierId: e.target.value })} aria-label="مورد الصف">
                  <option value="">— بدون مورد —</option>
                  {suppliers.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
                  <option value="OTHER">مورد آخر (غير مسجّل)…</option>
                </select>
              </div>
              {row.supplierId === 'OTHER' && (
                <div className="xpl-field">
                  <label>اسم المورد</label>
                  <input className="xpl-input" value={row.supplierName} onChange={(e) => patchRow({ supplierName: e.target.value })} placeholder="اكتب اسم المورد" aria-label="اسم مورد الصف" />
                </div>
              )}
            </>
          )}
          <div className="xpl-field xpl-field--full">
            <label>ملاحظات (اختياري)</label>
            <input className="xpl-input" value={row.notes} onChange={(e) => patchRow({ notes: e.target.value })} placeholder="ملاحظة هذا الصف" aria-label="ملاحظات" />
          </div>
          <p className="xpl-field--full" style={{ margin: 0, fontSize: 11.5, color: 'var(--xpl-muted)' }}>
            اختصارات: Ctrl+Enter = حفظ وإضافة التالي · Ctrl+Shift+Enter = حفظ وإنهاء
            {shared.supplierId && shared.supplierId !== 'PER_ROW' && shared.supplierId !== 'OTHER' && supplierName ? ` · المورد المشترك: ${supplierName}` : ''}
          </p>
        </DialogSection>

        {/* ── ملخص الجلسة (للعرض فقط — لا يُخزَّن ككيان) ── */}
        <DialogSection title="ملخص الجلسة" icon="summarize">
          <div className="xpl-field">
            <label>عدد المصروفات المُدخلة</label>
            <div style={{ fontSize: 18, fontWeight: 800, color: 'var(--xpl-text)' }}>{summary.count}</div>
          </div>
          <div className="xpl-field">
            <label>إجمالي المبالغ</label>
            <div style={{ fontSize: 18, fontWeight: 800, color: 'var(--xpl-primary)' }}>{money(summary.total)}</div>
          </div>
          <div className="xpl-field xpl-field--full">
            <label>آخر مصروف تم حفظه</label>
            <div style={{ fontSize: 13, color: 'var(--xpl-muted)' }}>
              {summary.lastCode ? `${summary.lastCode} — ${summary.lastDescription ?? ''}` : '— لا يوجد بعد —'}
            </div>
          </div>
        </DialogSection>
      </div>
    </Dialog>
  );
}
