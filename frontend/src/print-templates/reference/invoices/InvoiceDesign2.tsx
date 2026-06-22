import logo from '../assets/almanar-logo.png';
import styles from './InvoiceDesign2.module.css';
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
import { getStaticText } from '../../designer/staticTextUtils';

interface Props { data?: InvoicePrintData; }

export default function InvoiceDesign2({ data }: Props) {
  const grandTotal = data ? data.totalDinars + data.totalFils / 1000 : null;
  const brandingLayout = getBrandingLayoutForDocument(data?.company?.brandingLayout, 'invoice');
  const textAreas = getTextAreasForDocument(data?.company?.textStyleOverrides, 'invoice') as InvoiceTextAreas;
  const staticText = data?.company?.staticTextOverrides;

  return (
    <>
      <div className={styles.page}>
  <div className={styles.bar}></div>
  <div className={styles.head}>
    <div className={styles.brand}><img src={logo} />
      <div className={styles.txt}><div className={styles['cn-ar']}>شركة المنار الدولية</div>
        <div className={styles['cn-sub']}>لإنشاء وإصلاح الطرق والشوارع والأرصفة ومستلزمات الطرق</div>
        <div className={styles['cn-en']}>AL MANAR AL DUWALIYA CO. L.L.C</div></div>
    </div>
    <div className={styles.invtitle} data-designer-type="text" data-designer-id="invoice.title" style={applyTextElementStyle(textAreas.title, 'title')}><div className={styles.h} data-designer-editable="true" data-designer-key="invoice.titleEn">{getStaticText(staticText, 'invoice.titleEn', 'INVOICE')}</div><div className={styles.ar} data-designer-editable="true" data-designer-key="invoice.titleAr">{getStaticText(staticText, 'invoice.titleAr', 'فاتورة نقداً / بالحساب')}</div></div>
  </div>
  <div className={styles.metawrap} data-designer-type="text" data-designer-id="invoice.customerBlock">
    <div className={styles.mbox}>
      <div className={styles.mrow}><b>رقم الفاتورة</b><span>{data ? data.invoiceNumber : 'INV-2026-0142'}</span></div>
      <div className={styles.mrow}><b>التاريخ</b><span>{data ? data.date : '20 / 06 / 2026'}</span></div>
    </div>
    <div className={styles.mbox}>
      <div className={styles.mrow}><b>العميل / السادة</b><span>{data ? data.customerName : 'مصنع الخليج للأسفلت ذ.م.م'}</span></div>
      <div className={styles.mrow}><b>المشروع</b><span>{data ? (data.projectName ?? '') : 'توريد ونقل أسفلت – عقد شهري'}</span></div>
      <div className={styles.mrow}><b>موقع المشروع</b><span>{data ? '' : 'منطقة الشعيبة الصناعية – الكويت'}</span></div>
    </div>
  </div>
  <div className={styles.tedge}>
  <table data-designer-type="text" data-designer-id="invoice.tableBorder" style={applyTableBorderStyle(textAreas.tableBorder) as React.CSSProperties}>
    <thead data-designer-type="text" data-designer-id="invoice.tableHeader"><tr><th className={styles.n} style={applyTableHeaderStyle(textAreas.tableHeader)}>م</th><th style={applyTableHeaderStyle(textAreas.tableHeader)}>البيان / Description</th><th style={applyTableHeaderStyle(textAreas.tableHeader)}>الوحدة</th><th style={applyTableHeaderStyle(textAreas.tableHeader)}>الكمية</th><th style={applyTableHeaderStyle(textAreas.tableHeader)}>سعر الوحدة (د.ك)</th><th style={applyTableHeaderStyle(textAreas.tableHeader)}>القيمة (د.ك)</th></tr></thead>
    <tbody data-designer-type="text" data-designer-id="invoice.lineItem">
      {data
        ? data.lineItems.map((item, i) => (
            <tr key={i}>
              <td className={styles.n} style={applyTextElementStyle(textAreas.lineItem)}>{item.number}</td>
              <td className={styles.ds} style={applyTextElementStyle(textAreas.lineItem)}>{item.descriptionAr}</td>
              <td className={styles.u} style={applyTextElementStyle(textAreas.lineItem)}>{item.unit}</td>
              <td className={styles.q} style={applyTextElementStyle(textAreas.lineItem)}>{item.quantity}</td>
              <td className={styles.pr} style={applyTextElementStyle(textAreas.lineItem)}>{formatKWD(item.unitPrice)}</td>
              <td className={styles.t} style={applyTextElementStyle(textAreas.lineItem)}>{formatKWD(item.total)}</td>
            </tr>
          ))
        : <>
            <tr><td className={styles.n}>1</td><td className={styles.ds}>نقل أسفلت – خلطة ساخنة</td><td className={styles.u}>درب</td><td className={styles.q}>12</td><td className={styles.pr}>28.500</td><td className={styles.t}>342.000</td></tr>
            <tr><td className={styles.n}>2</td><td className={styles.ds}>توريد ونقل بيس كورس</td><td className={styles.u}>طن</td><td className={styles.q}>60</td><td className={styles.pr}>4.250</td><td className={styles.t}>255.000</td></tr>
            <tr><td className={styles.n}>3</td><td className={styles.ds}>أجور معدة فرش وتسوية</td><td className={styles.u}>يوم</td><td className={styles.q}>3</td><td className={styles.pr}>45.000</td><td className={styles.t}>135.000</td></tr>
          </>
      }
    </tbody>
  </table>
  </div>
  <div className={styles.words}><b>المبلغ كتابةً: </b>{data ? data.totalInWords : 'سبعمائة واثنان وثلاثون ديناراً كويتياً لا غير'}</div>
  <div className={styles.bottom}>
    <div className={styles.left}>
      <div className={styles['sec-h']} data-designer-editable="true" data-designer-key="invoice.paymentTermsLabel">{getStaticText(staticText, 'invoice.paymentTermsLabel', 'شروط الدفع')}</div><div className={styles['sec-b']} data-designer-editable="true" data-designer-key="invoice.paymentTermsText">{getStaticText(staticText, 'invoice.paymentTermsText', 'السداد خلال 30 يوماً من تاريخ الفاتورة.')}</div>
      {data?.notes && (
        <><div className={styles['sec-h']} style={{"marginTop": "3mm"}}>ملاحظات</div><div className={styles['sec-b']}>{data.notes}</div></>
      )}
    </div>
    <div className={styles.right} data-designer-type="text" data-designer-id="invoice.totals">
      <div className={styles.tr} style={applyTextElementStyle(textAreas.totals)}><b>المجموع الفرعي</b><span>{grandTotal !== null ? formatKWDAr(grandTotal) : '732.000 د.ك'}</span></div>
      <div className={styles.grand} style={applyTextElementStyle(textAreas.totals)}><span>الإجمالي النهائي</span><span>{grandTotal !== null ? formatKWDAr(grandTotal) : '732.000 د.ك'}</span></div>
    </div>
  </div>
  <div className={styles.sign}>
    <div className={styles.s}><div className={styles.lbl} data-designer-editable="true" data-designer-key="invoice.footerAccountant">{getStaticText(staticText, 'invoice.footerAccountant', 'المحاسبة')}</div><div className={styles.ln}>التوقيع</div></div>
    <div className={styles.s}>
      <div className={styles.lbl}>الختم</div>
      {data?.company?.showStamp !== false && data?.company?.stampUrl && (
        <img src={data.company.stampUrl} alt="" data-designer-type="branding" data-designer-id="stamp" data-bd-type="stamp" style={{ maxHeight: '20mm', maxWidth: '32mm', objectFit: 'contain', display: 'block', margin: '1mm auto', ...applyBrandingElementStyle(brandingLayout.stamp) }} />
      )}
      <div className={styles.ln}>&nbsp;</div>
    </div>
    <div className={styles.s}>
      <div className={styles.lbl} data-designer-editable="true" data-designer-key="invoice.footerManager">{getStaticText(staticText, 'invoice.footerManager', 'المسؤول / المعتمد')}</div>
      {data?.company?.showSignature !== false && data?.company?.signatureUrl && (
        <img src={data.company.signatureUrl} alt="" data-designer-type="branding" data-designer-id="signature" data-bd-type="signature" style={{ maxHeight: '20mm', maxWidth: '32mm', objectFit: 'contain', display: 'block', margin: '1mm auto', ...applyBrandingElementStyle(brandingLayout.signature) }} />
      )}
      <div className={styles.ln}>التوقيع</div>
    </div>
  </div>
  <div className={styles.contactbar}>99333820 / 94404401 &nbsp;|&nbsp; واتساب 98777887 &nbsp;|&nbsp; Manar.int.co@gmail.com</div>
  <div className={styles.footbar}></div>
</div>
    </>
  );
}
