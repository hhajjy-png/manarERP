import logo from '../assets/almanar-logo.png';
import styles from './InvoiceDesign1.module.css';
import type { InvoicePrintData } from '../../engine/types';
import { splitKWD } from '../../utils/formatKWD';
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

export default function InvoiceDesign1({ data }: Props) {
  const fillerCount = data ? Math.max(0, 15 - data.lineItems.length) : 20;
  const brandingLayout = getBrandingLayoutForDocument(data?.company?.brandingLayout, 'invoice');
  const textAreas = getTextAreasForDocument(data?.company?.textStyleOverrides, 'invoice') as InvoiceTextAreas;
  const staticText = data?.company?.staticTextOverrides;

  return (
    <>
      <div className={styles.page}><img className={styles.wm} src={logo} />
<div className={styles.p}>
  <div className={styles.hdr}>
    <div className={`${styles.hL} ${styles.en}`}>
      <div className={styles['cname-en']}>Al Manar Al Duwaliya Company <span style={{"fontSize": "7pt"}}>L.L.C</span></div>
      <div className={styles['tag-en']}>For construction and maintenance of roads streets pavements and road supplies</div>
      <div className={styles['cap-en']}>Paid-up capital: 500,000 thousand K.D.</div>
      <div className={styles.contact}>
        <span>&#9742;</span> : 99333820 / 94404401<br />
        <span>&#9743;</span> : 98777887<br />
        <span>&#9993;</span> : Manar.int.co@gmail.com
      </div>
    </div>
    <div className={styles.hC}><img className={styles.logo} src={logo} /></div>
    <div className={`${styles.hR} ${styles.ar}`}>
      <div className={styles['cname-ar']}>شركة المنار الدولية <span style={{"fontSize": "9pt"}}>ذ.م.م</span></div>
      <div className={styles['tag-ar']}>لإنشاء وإصلاح الطرق والشوارع والأرصفة ومستلزمات الطرق</div>
      <div className={styles['cap-ar']}>رأس المال المدفوع ٥٠٠،٠٠٠ ألف دينار كويتي</div>
      <div className={styles.contact}>
        99333820 / 94404401 : <span>&#9742;</span><br />
        98777887 : <span>&#9743;</span><br />
        Manar.int.co@gmail.com : <span>&#9993;</span>
      </div>
    </div>
  </div>
  <div className={styles.title} data-designer-type="text" data-designer-id="invoice.title" style={applyTextElementStyle(textAreas.title, 'title')}><div className={styles.a} data-designer-editable="true" data-designer-key="invoice.titleAr">{getStaticText(staticText, 'invoice.titleAr', 'فاتورة نقداً / بالحساب')}</div><div className={styles.b} data-designer-editable="true" data-designer-key="invoice.titleEn">{getStaticText(staticText, 'invoice.titleEn', 'Cash / Credit Invoice')}</div></div>
  <div className={styles.meta} data-designer-type="text" data-designer-id="invoice.customerBlock">
    <div className={styles['m-date']}>
      التاريخ : {data ? data.date : <>&nbsp;&nbsp;/&nbsp;&nbsp;/&nbsp; 20&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;</>}
    </div>
    <div className={styles['m-to']}>
      <span>المطلوب من السيد / السادة :</span>
      {data
        ? <span>{data.customerName}</span>
        : <span className={styles.dotline}></span>
      }
    </div>
  </div>
  <table data-designer-type="text" data-designer-id="invoice.tableBorder" style={applyTableBorderStyle(textAreas.tableBorder) as React.CSSProperties}>
    <thead data-designer-type="text" data-designer-id="invoice.tableHeader">
      <tr>
        <th className={styles['c-desc']} rowSpan={2} style={applyTableHeaderStyle(textAreas.tableHeader)}><div className={styles.deschead}>ملاحظات</div><div className={styles.descsub}>Description</div></th>
        <th className={styles['c-qty']} rowSpan={2} style={applyTableHeaderStyle(textAreas.tableHeader)}><div className={styles.grp}>الكمية</div><div className={styles.sub}>طن / درب</div></th>
        <th colSpan={2} style={applyTableHeaderStyle(textAreas.tableHeader)}><div className={styles.grp}>سعر الوحدة</div><div className={styles.sub}>Unit Price</div></th>
        <th colSpan={2} style={applyTableHeaderStyle(textAreas.tableHeader)}><div className={styles.grp}>القيمة</div><div className={styles.sub}>Total Price</div></th>
      </tr>
      <tr>
        <th className={styles.sub} style={applyTableHeaderStyle(textAreas.tableHeader)}>دينار K.D</th><th className={styles.sub} style={applyTableHeaderStyle(textAreas.tableHeader)}>فلس Fils</th>
        <th className={styles.sub} style={applyTableHeaderStyle(textAreas.tableHeader)}>دينار K.D</th><th className={styles.sub} style={applyTableHeaderStyle(textAreas.tableHeader)}>فلس Fils</th>
      </tr>
    </thead>
    <tbody data-designer-type="text" data-designer-id="invoice.lineItem">
      {data && data.lineItems.map((item, i) => {
        const up = splitKWD(item.unitPrice);
        const tot = splitKWD(item.total);
        return (
          <tr key={i}>
            <td className={styles['c-desc']} style={applyTextElementStyle(textAreas.lineItem)}>{item.descriptionAr}</td>
            <td className={styles['c-qty']} style={applyTextElementStyle(textAreas.lineItem)}>{item.quantity}</td>
            <td className={styles['c-d']} style={applyTextElementStyle(textAreas.lineItem)}>{up.dinars}</td>
            <td className={styles['c-f']} style={applyTextElementStyle(textAreas.lineItem)}>{up.filsPadded}</td>
            <td className={styles['c-d']} style={applyTextElementStyle(textAreas.lineItem)}>{tot.dinars}</td>
            <td className={styles['c-f']} style={applyTextElementStyle(textAreas.lineItem)}>{tot.filsPadded}</td>
          </tr>
        );
      })}
      {Array.from({ length: fillerCount }).map((_, i) => (
        <tr key={`f${i}`}>
          <td className={styles['c-desc']}></td><td className={styles['c-qty']}></td>
          <td className={styles['c-d']}></td><td className={styles['c-f']}></td>
          <td className={styles['c-d']}></td><td className={styles['c-f']}></td>
        </tr>
      ))}
    </tbody>
    <tfoot data-designer-type="text" data-designer-id="invoice.totals">
      <tr className={styles.totrow}><td colSpan={6} style={applyTextElementStyle(textAreas.totals)}><div style={{"display": "flex", "justifyContent": "space-between", "direction": "rtl", "alignItems": "center"}}>
        <span>
          {data
            ? <>القيمة الإجمالية مبلغ وقدره {data.totalInWords}</>
            : 'القيمة الإجمالية مبلغ وقدره ...........................................................................'}
        </span>
        <span style={{"direction": "ltr"}}>
          {data
            ? `${data.totalDinars} / ${String(data.totalFils).padStart(3, '0')}`
            : 'Total :'}
        </span>
      </div></td></tr>
    </tfoot>
  </table>
  <div className={styles.foot}>
    <div><span data-designer-editable="true" data-designer-key="invoice.footerAccountant">{getStaticText(staticText, 'invoice.footerAccountant', 'المحاسبة')}</span>{' : '}<span className={styles.ln}></span></div>
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
      {data?.company?.showSignature !== false && data?.company?.signatureUrl && (
        <img src={data.company.signatureUrl} alt="" data-designer-type="branding" data-designer-id="signature" data-bd-type="signature" style={{ maxHeight: '12mm', maxWidth: '30mm', objectFit: 'contain', display: 'block', margin: '0 auto 1mm', ...applyBrandingElementStyle(brandingLayout.signature) }} />
      )}
      {data?.company?.showStamp !== false && data?.company?.stampUrl && (
        <img src={data.company.stampUrl} alt="" data-designer-type="branding" data-designer-id="stamp" data-bd-type="stamp" style={{ maxHeight: '12mm', maxWidth: '30mm', objectFit: 'contain', display: 'block', margin: '0 auto 1mm', ...applyBrandingElementStyle(brandingLayout.stamp) }} />
      )}
      <span><span data-designer-editable="true" data-designer-key="invoice.footerManager">{getStaticText(staticText, 'invoice.footerManager', 'المسؤول')}</span>{' : '}<span className={styles.ln}></span></span>
    </div>
  </div>
</div></div>
    </>
  );
}
