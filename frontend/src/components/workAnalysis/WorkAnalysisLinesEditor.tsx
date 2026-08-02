import SearchableSelect, { type SearchableOption } from '../SearchableSelect';
import { Button } from '../explorer/ExplorerKit';
import { money } from '../../config/modules';
import { calcLine } from '../../lib/workAnalysisCalc';
import { useT } from '../../lib/i18n';
import {
  emptyLine,
  lineAmountsInput,
  priceAgreementLabel,
  type PriceAgreementOption,
  type WorkAnalysisLineDraft,
} from '../../pages/workAnalysis/types';

/**
 * شبكة إدخال بنود التحليل.
 *
 * ثلاثة أعمدة فقط قابلة للتحرير: البند (اختيار اتفاقية)، الكمية، وسعر صاحب المعدة.
 * سعر العميل **معروض للقراءة فقط** ولا يوجد له حقل إدخال إطلاقًا — هذا ليس تفصيلًا
 * تجميليًا: مصدر سعر العميل الوحيد هو اتفاقيات الأسعار، وأي حقل قابل للكتابة كان
 * سيفتح بابًا لتحليل مبني على سعر لا يطابق أي اتفاقية.
 *
 * اختيار الاتفاقية يأخذ **لقطة** من الصف المختار (اسم الاتفاقية، البند، الوحدة،
 * السعر) — بعدها ينفصل السطر عن مصدره تمامًا.
 */

interface Props {
  lines: WorkAnalysisLineDraft[];
  onChange: (lines: WorkAnalysisLineDraft[]) => void;
  priceOptions: PriceAgreementOption[];
  disabled?: boolean;
  pricesLoading?: boolean;
}

/** يقبل رقمًا عشريًا موجبًا أو نصًا وسيطًا («»، «12.») — ويرفض ما عداه. */
function sanitizeNumeric(raw: string): string | null {
  if (raw === '') return '';
  return /^\d*\.?\d*$/.test(raw) ? raw : null;
}

export default function WorkAnalysisLinesEditor({
  lines,
  onChange,
  priceOptions,
  disabled = false,
  pricesLoading = false,
}: Props) {
  const { t } = useT();

  const options: SearchableOption[] = priceOptions.map((price) => ({
    value: String(price.id),
    label: `${price.contractLocation} — ${price.asphaltPlant}`,
    keywords: `${price.companyName} ${price.contractUnit} ${price.unitPrice}`,
  }));

  function updateLine(index: number, patch: Partial<WorkAnalysisLineDraft>) {
    onChange(lines.map((line, i) => (i === index ? { ...line, ...patch } : line)));
  }

  function selectPrice(index: number, priceId: string) {
    const price = priceOptions.find((p) => String(p.id) === priceId);
    if (!price) {
      updateLine(index, {
        priceId: null,
        priceAgreementName: '',
        itemLabel: '',
        unit: '',
        customerPrice: 0,
        ownerPrice: '',
      });
      return;
    }
    /*
     * اللقطة تُؤخذ هنا، مرّة واحدة. لا قراءة لاحقة من `/prices`.
     *
     * `ownerPrice` يُملأ من القيمة الافتراضية في الاتفاقية، لكنه — بخلاف بقيّة
     * الحقول — يبقى **قابلًا للتحرير**: الاتفاقية مصدر الافتراضي لا مصدر الحقيقة.
     * أي تعديل يجريه المحلِّل يبقى داخل هذا التحليل ولا يُكتب في الاتفاقية إطلاقًا
     * (لا يوجد في هذه الصفحة أي نداء كتابة إلى `/prices`).
     *
     * صفر يُترجَم إلى نصّ فارغ لا إلى «0»: الاتفاقيات القديمة لم تُملأ بعد، وإظهار
     * صفر صريح فيها يوهم بأن العمل بلا تكلفة — والفراغ يدعو إلى الإدخال بصدق.
     */
    updateLine(index, {
      priceId: price.id,
      priceAgreementName: priceAgreementLabel(price),
      itemLabel: price.contractLocation,
      unit: price.contractUnit,
      customerPrice: price.unitPrice,
      ownerPrice: price.equipmentOwnerPrice ? String(price.equipmentOwnerPrice) : '',
    });
  }

  function setNumeric(index: number, field: 'quantity' | 'ownerPrice', raw: string) {
    const value = sanitizeNumeric(raw);
    if (value === null) return;
    updateLine(index, { [field]: value } as Partial<WorkAnalysisLineDraft>);
  }

  return (
    <div className="wa-lines">
      <div className="wa-lines-head" role="row">
        <span>{t('wa.col.item')}</span>
        <span>{t('wa.col.unit')}</span>
        <span>{t('wa.col.quantity')}</span>
        <span>{t('wa.col.customer_price')}</span>
        <span>{t('wa.col.owner_price')}</span>
        <span>{t('wa.col.commission_unit')}</span>
        <span>{t('wa.col.customer_total')}</span>
        <span>{t('wa.col.owner_total')}</span>
        <span>{t('wa.col.commission_total')}</span>
        <span className="wa-lines-del" aria-hidden="true" />
      </div>

      {lines.map((line, index) => {
        const amounts = calcLine(lineAmountsInput(line));
        // تمييز بصري بحت للسطر الجاهز — لا أثر على الحساب ولا على الحفظ ولا على
        // تفعيل الحقول؛ `itemLabel` هو نفسه المعيار الذي يستخدمه الحفظ والإجماليات.
        const isEmpty = !line.itemLabel;
        return (
          <div
            className={`wa-lines-row${isEmpty ? ' wa-lines-row--empty' : ''}`}
            key={line.key}
            role="row"
          >
            <div className="wa-cell wa-cell--item">
              <SearchableSelect
                value={line.priceId ? String(line.priceId) : ''}
                onChange={(value) => selectPrice(index, value)}
                options={options}
                emptyLabel={t('wa.line.pick_item')}
                placeholder={pricesLoading ? t('msg.loading') : t('wa.line.pick_item')}
                ariaLabel={t('wa.col.item')}
                disabled={disabled || pricesLoading}
              />
            </div>
            <div className="wa-cell wa-cell--ro">{line.unit || '—'}</div>
            <div className="wa-cell">
              <input
                className="xpl-input wa-input"
                inputMode="decimal"
                value={line.quantity}
                onChange={(e) => setNumeric(index, 'quantity', e.target.value)}
                aria-label={t('wa.col.quantity')}
                disabled={disabled}
                placeholder="0"
              />
            </div>
            {/* سعر العميل: عرض فقط — لا حقل إدخال، بحكم التصميم. */}
            <div className="wa-cell wa-cell--ro wa-cell--money">{money(line.customerPrice)}</div>
            <div className="wa-cell">
              <input
                className="xpl-input wa-input"
                inputMode="decimal"
                value={line.ownerPrice}
                onChange={(e) => setNumeric(index, 'ownerPrice', e.target.value)}
                aria-label={t('wa.col.owner_price')}
                disabled={disabled}
                placeholder="0.000"
              />
            </div>
            <div className={`wa-cell wa-cell--ro wa-cell--money${amounts.commissionPerUnit < 0 ? ' wa-neg' : ''}`}>
              {money(amounts.commissionPerUnit)}
            </div>
            <div className="wa-cell wa-cell--ro wa-cell--money">{money(amounts.customerTotal)}</div>
            <div className="wa-cell wa-cell--ro wa-cell--money">{money(amounts.ownerTotal)}</div>
            <div className={`wa-cell wa-cell--ro wa-cell--money wa-strong${amounts.commissionTotal < 0 ? ' wa-neg' : ''}`}>
              {money(amounts.commissionTotal)}
            </div>
            <div className="wa-cell wa-lines-del">
              {lines.length > 1 && !disabled && (
                <button
                  type="button"
                  className="wa-del-btn"
                  onClick={() => onChange(lines.filter((_, i) => i !== index))}
                  aria-label={t('wa.line.remove')}
                  title={t('wa.line.remove')}
                >
                  ✕
                </button>
              )}
            </div>
          </div>
        );
      })}

      {!disabled && (
        <div className="wa-lines-foot">
          <Button icon="add" onClick={() => onChange([...lines, emptyLine()])}>
            {t('wa.line.add')}
          </Button>
        </div>
      )}
    </div>
  );
}
