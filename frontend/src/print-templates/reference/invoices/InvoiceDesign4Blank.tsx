import logo from '../assets/almanar-logo.png';
import styles from './InvoiceDesign4.module.css';
import type { InvoicePrintData } from '../../engine/types';
import { formatKWD } from '../../utils/formatKWD';
import { getBrandingLayoutForDocument, applyBrandingElementStyle } from '../../utils/brandingLayout';
import type { InvoiceTextAreas } from '../../engine/textStyleTypes';
import {
  applyTextElementStyle,
  applyTableHeaderStyle,
  applyTableBorderStyle,
  getTextAreasForDocument,
} from '../../utils/textStyleOverrides';
import { getStaticText } from '../../designer/staticTextUtils';

interface Props { data?: InvoicePrintData; }

export default function InvoiceDesign4Blank({ data }: Props) {
  const grandTotal = data ? data.totalDinars + data.totalFils / 1000 : null;
  const fillerCount = data ? Math.max(0, 6 - data.lineItems.length) : 0;
  const brandingLayout = getBrandingLayoutForDocument(data?.company?.brandingLayout, 'invoice');
  const textAreas = getTextAreasForDocument(data?.company?.textStyleOverrides, 'invoice') as InvoiceTextAreas;
  const staticText = data?.company?.staticTextOverrides;

  return (
    <>
      <div className={styles.page}>
  <div className={styles.strip} style={{visibility: 'hidden'}}>
    <div className={styles['s-logo']}><img src={logo} /></div>
    <div className={styles['s-name']}><div className={styles.a}>شركة المنار الدولية ذ.م.م</div>
      <div className={styles.b}>لإنشاء وإصلاح الطرق والشوارع والأرصفة ومستلزمات الطرق — رأس المال ٥٠٠،٠٠٠ د.ك</div>
      <div className={styles.c}>AL MANAR AL DUWALIYA CO. L.L.C</div></div>
    <div className={styles['s-meta']} data-designer-type="text" data-designer-id="invoice.title" style={applyTextElementStyle(textAreas.title, 'title')}><div className={styles.mh} data-designer-editable="true" data-designer-key="invoice.titleAr">{getStaticText(staticText, 'invoice.titleAr', 'فاتورة / INVOICE')}</div>
      <div className={styles.mr}><b>رقم</b><span>{data ? data.invoiceNumber : 'INV-2026-0142'}</span></div>
      <div className={styles.mr}><b>التاريخ</b><span>{data ? data.date : '20 / 06 / 2026'}</span></div>
    </div>
  </div>
  <div className={styles.clientrow} data-designer-type="text" data-designer-id="invoice.customerBlock">
    <div className={styles.cell}><b>العميل:</b> {data ? data.customerName : 'مصنع الخليج للأسفلت ذ.م.م'}</div>
    <div className={styles.cell}><b>المشروع:</b> {data ? (data.projectName ?? '') : 'توريد ونقل أسفلت – عقد شهري'}</div>
    <div className={styles.cell}><b>الموقع:</b> {data ? '' : 'منطقة الشعيبة الصناعية – الكويت'}</div>
  </div>
  <table data-designer-type="text" data-designer-id="invoice.tableBorder" style={applyTableBorderStyle(textAreas.tableBorder) as React.CSSProperties}>
    <thead data-designer-type="text" data-designer-id="invoice.tableHeader"><tr><th className={styles.n} style={applyTableHeaderStyle(textAreas.tableHeader)}>م</th><th style={applyTableHeaderStyle(textAreas.tableHeader)}>البيان / Description</th><th style={applyTableHeaderStyle(textAreas.tableHeader)}>الوحدة</th><th style={applyTableHeaderStyle(textAreas.tableHeader)}>الكمية</th><th style={applyTableHeaderStyle(textAreas.tableHeader)}>سعر الوحدة (د.ك)</th><th style={applyTableHeaderStyle(textAreas.tableHeader)}>القيمة (د.ك)</th></tr></thead>
    <tbody data-designer-type="text" data-designer-id="invoice.lineItem">
      {data
        ? <>
            {data.lineItems.map((item, i) => (
              <tr key={i}>
                <td className={styles.n} style={applyTextElementStyle(textAreas.lineItem)}>{item.number}</td>
                <td className={styles.ds} style={applyTextElementStyle(textAreas.lineItem)}>{item.descriptionAr}</td>
                <td style={applyTextElementStyle(textAreas.lineItem)}>{item.unit}</td>
                <td style={applyTextElementStyle(textAreas.lineItem)}>{item.quantity}</td>
                <td style={applyTextElementStyle(textAreas.lineItem)}>{formatKWD(item.unitPrice)}</td>
                <td className={styles.t} style={applyTextElementStyle(textAreas.lineItem)}>{formatKWD(item.total)}</td>
              </tr>
            ))}
            {Array.from({ length: fillerCount }).map((_, i) => (
              <tr key={`f${i}`} className={styles.empty}><td className={styles.n}>&nbsp;</td><td></td><td></td><td></td><td></td><td></td></tr>
            ))}
          </>
        : <>
            <tr><td className={styles.n}>1</td><td className={styles.ds}>نقل أسفلت – خلطة ساخنة</td><td>درب</td><td>12</td><td>28.500</td><td className={styles.t}>342.000</td></tr>
            <tr><td className={styles.n}>2</td><td className={styles.ds}>توريد ونقل بيس كورس</td><td>طن</td><td>60</td><td>4.250</td><td className={styles.t}>255.000</td></tr>
            <tr><td className={styles.n}>3</td><td className={styles.ds}>أجور معدة فرش وتسوية</td><td>يوم</td><td>3</td><td>45.000</td><td className={styles.t}>135.000</td></tr>
            <tr className={styles.empty}><td className={styles.n}>&nbsp;</td><td></td><td></td><td></td><td></td><td></td></tr>
            <tr className={styles.empty}><td className={styles.n}>&nbsp;</td><td></td><td></td><td></td><td></td><td></td></tr>
            <tr className={styles.empty}><td className={styles.n}>&nbsp;</td><td></td><td></td><td></td><td></td><td></td></tr>
            <tr className={styles.empty}><td className={styles.n}>&nbsp;</td><td></td><td></td><td></td><td></td><td></td></tr>
            <tr className={styles.empty}><td className={styles.n}>&nbsp;</td><td></td><td></td><td></td><td></td><td></td></tr>
            <tr className={styles.empty}><td className={styles.n}>&nbsp;</td><td></td><td></td><td></td><td></td><td></td></tr>
          </>
      }
    </tbody>
    <tfoot data-designer-type="text" data-designer-id="invoice.totals">
      <tr><td className={styles.lab} colSpan={5} style={applyTextElementStyle(textAreas.totals)}>المجموع الفرعي</td><td className={styles.val} style={applyTextElementStyle(textAreas.totals)}>{grandTotal !== null ? formatKWD(grandTotal) : '732.000'}</td></tr>
      <tr className={styles.grand}><td colSpan={5} style={{ textAlign: "right", paddingRight: "3.5mm", ...applyTextElementStyle(textAreas.totals) }}>الإجمالي النهائي (د.ك)</td><td className={styles.val} style={applyTextElementStyle(textAreas.totals)}>{grandTotal !== null ? formatKWD(grandTotal) : '732.000'}</td></tr>
    </tfoot>
  </table>
  <div className={styles.words}><b>المبلغ كتابةً: </b>{data ? data.totalInWords : 'سبعمائة واثنان وثلاثون ديناراً كويتياً لا غير'}</div>
  <div className={styles.bottom}>
    <div className={styles.terms}>
      <div className={styles.h} data-designer-editable="true" data-designer-key="invoice.paymentTermsLabel">{getStaticText(staticText, 'invoice.paymentTermsLabel', 'شروط الدفع')}</div>
      <div className={styles.b} data-designer-editable="true" data-designer-key="invoice.paymentTermsText">{getStaticText(staticText, 'invoice.paymentTermsText', 'السداد خلال 30 يوماً من تاريخ الفاتورة.')}</div>
      <div className={styles.h} style={{"marginTop": "4mm"}}>ملاحظات</div>
      <div className={styles.b} style={{"minHeight": "16mm"}}>{data?.notes ?? ''}</div>
    </div>
    <div className={styles.sign}>
      <div className={styles.sbox}><div className={styles.h} data-designer-editable="true" data-designer-key="invoice.footerAccountant">{getStaticText(staticText, 'invoice.footerAccountant', 'المحاسبة')}</div><div className={styles.b}></div></div>
      <div className={styles.sbox}>
        <div className={styles.h} data-designer-editable="true" data-designer-key="invoice.footerManager">{getStaticText(staticText, 'invoice.footerManager', 'المسؤول / الختم')}</div>
        <div className={styles.b} style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '4mm' }}>
          {data?.company?.showSignature !== false && data?.company?.signatureUrl && (
            <img src={data.company.signatureUrl} alt="" data-designer-type="branding" data-designer-id="signature" data-bd-type="signature" style={{ maxHeight: '12mm', maxWidth: '28mm', objectFit: 'contain', ...applyBrandingElementStyle(brandingLayout.signature) }} />
          )}
          {data?.company?.showStamp !== false && data?.company?.stampUrl && (
            <img src={data.company.stampUrl} alt="" data-designer-type="branding" data-designer-id="stamp" data-bd-type="stamp" style={{ maxHeight: '12mm', maxWidth: '28mm', objectFit: 'contain', ...applyBrandingElementStyle(brandingLayout.stamp) }} />
          )}
        </div>
      </div>
    </div>
  </div>
  <div className={styles.fbar}>هاتف 99333820 / 94404401 &nbsp;•&nbsp; واتساب 98777887 &nbsp;•&nbsp; Manar.int.co@gmail.com</div>
</div>
    </>
  );
}
