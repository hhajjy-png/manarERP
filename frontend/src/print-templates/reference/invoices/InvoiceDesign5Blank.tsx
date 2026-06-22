import logo from '../assets/almanar-logo.png';
import styles from './InvoiceDesign5.module.css';
import type { InvoicePrintData } from '../../engine/types';
import { formatKWD, formatKWDAr } from '../../utils/formatKWD';
import { getBrandingLayoutForDocument, applyBrandingElementStyle } from '../../utils/brandingLayout';
import type { InvoiceTextAreas } from '../../engine/textStyleTypes';
import {
  applyTextElementStyle,
  applyTableHeaderStyle,
  applyTableBorderStyle,
  getTextAreasForDocument,
} from '../../utils/textStyleOverrides';

interface Props { data?: InvoicePrintData; }

export default function InvoiceDesign5Blank({ data }: Props) {
  const grandTotal = data ? data.totalDinars + data.totalFils / 1000 : null;
  const fillerCount = data ? Math.max(0, 5 - data.lineItems.length) : 0;
  const brandingLayout = getBrandingLayoutForDocument(data?.company?.brandingLayout, 'invoice');
  const textAreas = getTextAreasForDocument(data?.company?.textStyleOverrides, 'invoice') as InvoiceTextAreas;

  return (
    <>
      <div className={styles.page}>
  <div className={styles.hdr} style={{visibility: 'hidden'}}>
    <div className={styles.hL}><div className={styles['en-n']}>Al Manar Al Duwaliya Co. <span style={{"fontSize": "7pt"}}>L.L.C</span></div>
      <div className={styles['en-t']}>For construction &amp; maintenance of roads, streets, pavements and road supplies</div>
      <div className={styles['en-c']}>Tel: 99333820 / 94404401<br />WhatsApp: 98777887<br />Manar.int.co@gmail.com</div></div>
    <div className={styles.hC}><img className={styles.logo} src={logo} />
      <div className={styles.title} data-designer-type="text" data-designer-id="invoice.title" style={applyTextElementStyle(textAreas.title, 'title')}><div className={styles.a}>فاتورة نقداً / بالحساب</div><div className={styles.b}>Cash / Credit Invoice</div></div></div>
    <div className={styles.hR}><div className={styles['ar-n']}>شركة المنار الدولية ذ.م.م</div>
      <div className={styles['ar-t']}>لإنشاء وإصلاح الطرق والشوارع والأرصفة ومستلزمات الطرق</div>
      <div className={styles['ar-c']}>هاتف: 99333820 / 94404401<br />واتساب: 98777887<br />رأس المال المدفوع ٥٠٠،٠٠٠ د.ك</div></div>
  </div>
  <div className={styles.rule}></div>
  <div className={styles.meta} data-designer-type="text" data-designer-id="invoice.customerBlock">
    <div className={styles.c}><b>رقم الفاتورة:</b> {data ? data.invoiceNumber : 'INV-2026-0142'}</div>
    <div className={styles.c}><b>التاريخ:</b> {data ? data.date : '20 / 06 / 2026'}</div>
    <div className={`${styles.c} ${styles.full}`}><b>المطلوب من السادة:</b> {data ? data.customerName : 'مصنع الخليج للأسفلت ذ.م.م'}</div>
  </div>
  <div className={styles.meta} style={{"borderTop": "none"}}>
    <div className={`${styles.c} ${styles.full}`}><b>المشروع:</b> {data ? (data.projectName ?? '') : 'توريد ونقل أسفلت – عقد شهري'}</div>
    <div className={`${styles.c} ${styles.full}`}><b>موقع المشروع:</b> {data ? '' : 'منطقة الشعيبة الصناعية – الكويت'}</div>
  </div>
  <table data-designer-type="text" data-designer-id="invoice.tableBorder" style={applyTableBorderStyle(textAreas.tableBorder) as React.CSSProperties}>
    <thead data-designer-type="text" data-designer-id="invoice.tableHeader"><tr><th className={styles.ds} style={applyTableHeaderStyle(textAreas.tableHeader)}>البيان / Description</th><th style={applyTableHeaderStyle(textAreas.tableHeader)}>الوحدة</th><th style={applyTableHeaderStyle(textAreas.tableHeader)}>الكمية</th><th style={applyTableHeaderStyle(textAreas.tableHeader)}>سعر الوحدة (د.ك)</th><th style={applyTableHeaderStyle(textAreas.tableHeader)}>القيمة (د.ك)</th></tr></thead>
    <tbody data-designer-type="text" data-designer-id="invoice.lineItem">
      {data
        ? <>
            {data.lineItems.map((item, i) => (
              <tr key={i}>
                <td className={styles.ds} style={applyTextElementStyle(textAreas.lineItem)}>{item.descriptionAr}</td>
                <td style={applyTextElementStyle(textAreas.lineItem)}>{item.unit}</td>
                <td style={applyTextElementStyle(textAreas.lineItem)}>{item.quantity}</td>
                <td style={applyTextElementStyle(textAreas.lineItem)}>{formatKWD(item.unitPrice)}</td>
                <td className={styles.t} style={applyTextElementStyle(textAreas.lineItem)}>{formatKWD(item.total)}</td>
              </tr>
            ))}
            {Array.from({ length: fillerCount }).map((_, i) => (
              <tr key={`f${i}`} className={styles.e}><td></td><td></td><td></td><td></td><td></td></tr>
            ))}
          </>
        : <>
            <tr><td className={styles.ds}>نقل أسفلت – خلطة ساخنة</td><td>درب</td><td>12</td><td>28.500</td><td className={styles.t}>342.000</td></tr>
            <tr><td className={styles.ds}>توريد ونقل بيس كورس</td><td>طن</td><td>60</td><td>4.250</td><td className={styles.t}>255.000</td></tr>
            <tr><td className={styles.ds}>أجور معدة فرش وتسوية</td><td>يوم</td><td>3</td><td>45.000</td><td className={styles.t}>135.000</td></tr>
            <tr className={styles.e}><td></td><td></td><td></td><td></td><td></td></tr>
            <tr className={styles.e}><td></td><td></td><td></td><td></td><td></td></tr>
            <tr className={styles.e}><td></td><td></td><td></td><td></td><td></td></tr>
            <tr className={styles.e}><td></td><td></td><td></td><td></td><td></td></tr>
            <tr className={styles.e}><td></td><td></td><td></td><td></td><td></td></tr>
          </>
      }
    </tbody>
  </table>
  <div className={styles.belt}>
    <div className={styles.words}><b>المبلغ كتابةً:</b><br />{data ? data.totalInWords : 'سبعمائة واثنان وثلاثون ديناراً كويتياً لا غير'}</div>
    <div className={styles.tot} data-designer-type="text" data-designer-id="invoice.totals">
      <div className={styles.r} style={applyTextElementStyle(textAreas.totals)}><b>المجموع الفرعي</b><span>{grandTotal !== null ? formatKWDAr(grandTotal) : '732.000 د.ك'}</span></div>
      <div className={styles.g} style={applyTextElementStyle(textAreas.totals)}><span>الإجمالي النهائي</span><span>{grandTotal !== null ? formatKWDAr(grandTotal) : '732.000 د.ك'}</span></div>
    </div>
  </div>
  <div className={styles.secrow}>
    <div className={styles.sec}><div className={styles.h}>شروط الدفع</div><div className={styles.b}>السداد خلال 30 يوماً من تاريخ الفاتورة.</div></div>
    <div className={styles.sec}><div className={styles.h}>ملاحظات</div><div className={styles.b} style={{"minHeight": "16mm"}}>{data?.notes ?? ''}</div></div>
  </div>
  <div className={styles.sign}>
    <div className={styles.s}><div className={styles.lbl}>المحاسبة</div><div className={styles.ln}>التوقيع</div></div>
    <div className={styles.s}>
      <div className={styles.lbl}>الختم الرسمي</div>
      {data?.company?.showStamp !== false && data?.company?.stampUrl && (
        <img src={data.company.stampUrl} alt="" data-designer-type="branding" data-designer-id="stamp" data-bd-type="stamp" style={{ maxHeight: '20mm', maxWidth: '32mm', objectFit: 'contain', display: 'block', margin: '1mm auto', ...applyBrandingElementStyle(brandingLayout.stamp) }} />
      )}
      <div className={styles.ln}>&nbsp;</div>
    </div>
    <div className={styles.s}>
      <div className={styles.lbl}>المسؤول</div>
      {data?.company?.showSignature !== false && data?.company?.signatureUrl && (
        <img src={data.company.signatureUrl} alt="" data-designer-type="branding" data-designer-id="signature" data-bd-type="signature" style={{ maxHeight: '20mm', maxWidth: '32mm', objectFit: 'contain', display: 'block', margin: '1mm auto', ...applyBrandingElementStyle(brandingLayout.signature) }} />
      )}
      <div className={styles.ln}>التوقيع</div>
    </div>
  </div>
</div>
    </>
  );
}
