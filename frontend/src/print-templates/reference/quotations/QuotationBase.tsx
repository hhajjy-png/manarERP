import type { QuotationPrintData } from '../../engine/types';
import type { QuotationTextAreas } from '../../engine/textStyleTypes';
import { formatKWD } from '../../utils/formatKWD';
import { sanitizePrintText } from '../../utils/sanitizePrintText';
import styles from './QuotationShared.module.css';
import logoSrc from '../assets/almanar-logo.png';
import { getBrandingLayoutForDocument, applyBrandingElementStyle } from '../../utils/brandingLayout';
import { getInkFilterStyle } from '../../utils/inkFilter';
import {
  applyTextElementStyle,
  applyTableHeaderStyle,
  applyTableBorderStyle,
  getTextAreasForDocument,
} from '../../utils/textStyleOverrides';

const SAMPLE: QuotationPrintData = {
  company: {
    nameAr: 'شركة المنار الدولية ذ.م.م',
    nameEn: 'Al Manar Al Duwaliya Company L.L.C',
    taglineAr: 'لإنشاء وإصلاح الطرق والشوارع والأرصفة ومستلزمات الطرق',
    taglineEn: 'For construction and maintenance of roads streets pavements and road supplies',
    capitalAr: 'رأس المال المدفوع ٥٠٠،٠٠٠ ألف دينار كويتي',
    capitalEn: 'Paid-up capital: 500,000 thousand K.D.',
    phone: '98777887 / 94404401',
    fax: '98777887',
    email: 'Manar.int.co@gmail.com',
    addressAr: 'ص.ب : ٢٩٢٤١ الصفاة — الرمز البريدي ١٣١٤٣ الكويت',
    addressEn: 'P.O.Box 29241 — Code No. 13143 Kuwait',
  },
  quotationNumber: 'MNR-Q-2026-001',
  date: '2026/06/21',
  customerName: 'شركة الخليج للإنشاءات ذ.م.م',
  attention: 'م. أحمد الرشيدي',
  validity: '15 يوماً من تاريخه',
  subject: 'عرض سعر أعمال طبقة الأساس والإسفلت',
  projectName: 'مشروع رصف شارع الرنة - الفروانية',
  projectLocation: 'الفروانية، الكويت',
  introText:
    'بالإشارة إلى الموضوع أعلاه، يسرّ شركة المنار الدولية أن تتقدّم إلى عنايتكم بعرض سعرها للأعمال المبيّنة أدناه، آملين أن ينال هذا العرض ثقتكم ورضاكم.',
  lineItems: [
    { number: 1, descriptionAr: 'إزالة الأسفلت القديم وتنظيف الموقع', unit: 'م²', quantity: 500, unitPrice: 3.5, total: 1750 },
    { number: 2, descriptionAr: 'توريد وفرش طبقة الأساس المجروش (GCC معياري)', unit: 'م²', quantity: 500, unitPrice: 8.0, total: 4000 },
    { number: 3, descriptionAr: 'توريد وفرش أسفلت ساخن (AC-20) سماكة 5 سم', unit: 'م²', quantity: 500, unitPrice: 12.0, total: 6000 },
    { number: 4, descriptionAr: 'دهان تعليم الطرق (خطوط بيضاء)', unit: 'م.ط', quantity: 150, unitPrice: 9.0, total: 1350 },
  ],
  subtotal: 13100,
  discount: 100,
  grandTotal: 13000,
  terms: [
    'الأسعار بالدينار الكويتي وتشمل توريد وتنفيذ الأعمال المذكورة أعلاه فقط.',
    'الدفعات: 30% عند توقيع العقد، 50% عند إتمام الأعمال، 20% عند التسليم.',
    'مدة التنفيذ: 7 أيام عمل من تاريخ بدء العمل في الموقع.',
    'صلاحية العرض: 15 يوماً من تاريخ الإصدار.',
    'يخضع هذا العرض للشروط والأحكام العامة للشركة.',
  ],
};

/* SVG icons */
const IcLocation = () => (
  <svg className={styles.ic} viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
    <path d="M12 2C8.13 2 5 5.13 5 9c0 5.25 7 13 7 13s7-7.75 7-13c0-3.87-3.13-7-7-7zm0 9.5A2.5 2.5 0 1 1 12 6a2.5 2.5 0 0 1 0 5.5z" />
  </svg>
);
const IcPhone = () => (
  <svg className={styles.ic} viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
    <path d="M6.62 10.79a15.5 15.5 0 0 0 6.59 6.59l2.2-2.2a1 1 0 0 1 1.02-.24 11.4 11.4 0 0 0 3.57.57 1 1 0 0 1 1 1V20a1 1 0 0 1-1 1A17 17 0 0 1 3 4a1 1 0 0 1 1-1h3.5a1 1 0 0 1 1 1c0 1.25.2 2.45.57 3.57a1 1 0 0 1-.25 1.02l-2.2 2.2z" />
  </svg>
);
const IcWhatsApp = () => (
  <svg className={styles.ic} viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
    <path d="M12 2a10 10 0 0 0-8.49 15.26L2 22l4.83-1.49A10 10 0 1 0 12 2zm0 18a8 8 0 0 1-4.08-1.12l-.29-.18-3.02.88.9-2.94-.2-.3A8 8 0 1 1 12 20zm4.39-5.56c-.24-.12-1.4-.69-1.62-.77s-.37-.12-.53.12-.61.77-.75.93-.27.18-.51.06a6.5 6.5 0 0 1-3.18-2.79c-.21-.36.21-.34.6-1.12a.44.44 0 0 0-.02-.42c-.06-.12-.53-1.27-.73-1.74s-.38-.39-.53-.4h-.45a.86.86 0 0 0-.62.29 2.63 2.63 0 0 0-.82 1.96 4.57 4.57 0 0 0 .96 2.42c.11.16 1.62 2.48 3.94 3.48a13.2 13.2 0 0 0 1.31.48 3.15 3.15 0 0 0 1.46.09c.44-.09 1.36-.56 1.55-1.1s.19-1 .13-1.1-.3-.18-.54-.3z" />
  </svg>
);
const IcEmail = () => (
  <svg className={styles.ic} viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
    <path d="M4 4h16a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2zm0 2v.5l8 5 8-5V6H4zm16 12V9l-8 5-8-5v9h16z" />
  </svg>
);

interface QuotationBaseProps {
  themeClass: string;
  showLetterhead: boolean;
  showChips?: boolean;
  data?: QuotationPrintData;
}

export default function QuotationBase({ themeClass, showLetterhead, showChips = false, data }: QuotationBaseProps) {
  const d = data ?? SAMPLE;
  const sub = d.subtotal ?? d.lineItems.reduce((acc, item) => acc + item.total, 0);
  const disc = d.discount ?? 0;
  const brandingLayout = getBrandingLayoutForDocument(d.company?.brandingLayout, 'quotation');
  const textAreas = getTextAreasForDocument(d.company?.textStyleOverrides, 'quotation') as QuotationTextAreas;

  const pageClass = [
    styles.page,
    showLetterhead ? styles.letterhead : styles.blank,
    themeClass,
  ].filter(Boolean).join(' ');

  return (
    <div className={pageClass}>
      {showLetterhead && (
        <>
          <header className={styles.lh}>
            {/* EN column */}
            <div className={styles.lhEn}>
              <div className={styles.nm}>
                Al Manar Al Duwaliya Company <small>L.L.C</small>
              </div>
              <div className={styles.act}>
                For construction and maintenance of roads streets pavements and road supplies
              </div>
              <div className={styles.cap}>Paid-up capital: 500,000 thousand K.D.</div>
              <div className={styles.cl}>
                <IcLocation /><span>: P.O.Box 29241 — Code No. 13143 Kuwait</span>
              </div>
              <div className={styles.cl}>
                <IcPhone /><span>: 98777887 / 94404401</span>
              </div>
              <div className={styles.cl}>
                <IcWhatsApp /><span>: 98777887</span>
              </div>
              <div className={styles.cl}>
                <IcEmail /><span>: Manar.int.co@gmail.com</span>
              </div>
            </div>

            {/* Logo */}
            <img className={styles.lhLogo} src={logoSrc} alt="Al Manar Logo" />

            {/* AR column */}
            <div className={styles.lhAr}>
              <div className={styles.nm}>
                شركة المنار الدولية <small>ذ.م.م</small>
              </div>
              <div className={styles.act}>
                لإنشاء وإصلاح الطرق والشوارع والأرصفة ومستلزمات الطرق
              </div>
              <div className={styles.cap}>رأس المال المدفوع ٥٠٠،٠٠٠ ألف دينار كويتي</div>
              <div className={styles.cl}>
                <span>ص.ب : ٢٩٢٤١ الصفاة</span><IcLocation />
              </div>
              <div className={styles.cl}>
                <span>الرمز البريدي ١٣١٤٣ الكويت</span>
              </div>
              <div className={styles.cl}>
                <span>٩٨٧٧٧٨٨٧ / ٩٤٤٠٤٤٠١</span><IcPhone />
              </div>
              <div className={styles.cl}>
                <span>٩٨٧٧٧٨٨٧</span><IcWhatsApp />
              </div>
              <div className={styles.cl}>
                <span>Manar.int.co@gmail.com</span><IcEmail />
              </div>
            </div>
          </header>

          {/* Watermark */}
          <div className={styles.watermark}>
            <img src={logoSrc} alt="" />
          </div>
        </>
      )}

      {/* Body */}
      <main className={styles.qbody}>
        {/* ── Q-Head ── */}
        <div className={styles.qHead}>
          <div className={styles.qTitle} data-designer-type="text" data-designer-id="quotation.title">
            <h1 style={applyTextElementStyle(textAreas.title, 'title')}>عرض سعر</h1>
            <div className={styles.subtitle}>Price Quotation</div>
          </div>
          <div className={styles.qMeta} data-designer-type="text" data-designer-id="quotation.metadataLabels">
            <div className={styles.qMetaRow}>
              <span className={styles.lbl}>رقم العرض</span>
              <span className={styles.val}>{d.quotationNumber}</span>
            </div>
            <div className={styles.qMetaRow}>
              <span className={styles.lbl}>التاريخ</span>
              <span className={styles.val}>{d.date}</span>
            </div>
            <div className={styles.qMetaRow}>
              <span className={styles.lbl}>صلاحية العرض</span>
              <span className={styles.val}>{d.validity}</span>
            </div>
          </div>
        </div>

        {/* ── Q-Info ── */}
        <section className={styles.qInfo} data-designer-type="text" data-designer-id="quotation.customerBlock" style={applyTextElementStyle(textAreas.customerBlock)}>
          <div className={styles.qInfoCell}>
            <span className={styles.lbl}>العميل</span>
            <span className={styles.val}>{sanitizePrintText(d.customerName)}</span>
          </div>
          <div className={styles.qInfoCell}>
            <span className={styles.lbl}>عناية</span>
            <span className={styles.val}>{sanitizePrintText(d.attention)}</span>
          </div>
          <div className={styles.qInfoCell}>
            <span className={styles.lbl}>اسم المشروع</span>
            <span className={styles.val}>{sanitizePrintText(d.projectName)}</span>
          </div>
          <div className={styles.qInfoCell}>
            <span className={styles.lbl}>موقع المشروع</span>
            <span className={styles.val}>{sanitizePrintText(d.projectLocation)}</span>
          </div>
          <div className={`${styles.qInfoCell} ${styles.qInfoCellWide}`}>
            <span className={styles.lbl}>موضوع العرض</span>
            <span className={styles.val}>{sanitizePrintText(d.subject)}</span>
          </div>
        </section>

        {/* ── Intro ── */}
        {d.introText && (
          <p
            className={styles.qIntro}
            data-designer-type="text"
            data-designer-id="quotation.introText"
            style={applyTextElementStyle(textAreas.introText)}
          >
            {sanitizePrintText(d.introText)}
          </p>
        )}

        {/* ── Items Table ── */}
        <table
          className={styles.qTable}
          data-designer-type="text"
          data-designer-id="quotation.tableBorder"
          style={applyTableBorderStyle(textAreas.tableBorder) as React.CSSProperties}
        >
          <thead data-designer-type="text" data-designer-id="quotation.tableHeader">
            <tr>
              <th className={styles.cNo} style={applyTableHeaderStyle(textAreas.tableHeader)}>#</th>
              <th style={applyTableHeaderStyle(textAreas.tableHeader)}>الوصف</th>
              <th className={styles.cUnit} style={applyTableHeaderStyle(textAreas.tableHeader)}>الوحدة</th>
              <th className={styles.cQty} style={applyTableHeaderStyle(textAreas.tableHeader)}>الكمية</th>
              <th className={styles.cPrice} style={applyTableHeaderStyle(textAreas.tableHeader)}>سعر الوحدة (د.ك)</th>
              <th className={styles.cTotal} style={applyTableHeaderStyle(textAreas.tableHeader)}>الإجمالي (د.ك)</th>
            </tr>
          </thead>
          <tbody data-designer-type="text" data-designer-id="quotation.lineItem">
            {d.lineItems.map((item) => (
              <tr key={item.number}>
                <td style={applyTextElementStyle(textAreas.lineItem)}>
                  {showChips
                    ? <span className={styles.chip}>{item.number}</span>
                    : item.number}
                </td>
                <td className={styles.desc} style={applyTextElementStyle(textAreas.lineItem)}>{item.descriptionAr}</td>
                <td style={applyTextElementStyle(textAreas.lineItem)}>{item.unit}</td>
                <td className={styles.num} style={applyTextElementStyle(textAreas.lineItem)}>{item.quantity.toLocaleString('en-US')}</td>
                <td className={styles.num} style={applyTextElementStyle(textAreas.lineItem)}>{formatKWD(item.unitPrice)}</td>
                <td className={styles.num} style={applyTextElementStyle(textAreas.lineItem)}>{formatKWD(item.total)}</td>
              </tr>
            ))}
          </tbody>
        </table>

        {/* ── Summary: terms + totals ── */}
        <section className={styles.qSummary}>
          <div
            className={styles.qTerms}
            data-designer-type="text"
            data-designer-id="quotation.terms"
            style={applyTextElementStyle(textAreas.terms)}
          >
            {d.terms && d.terms.length > 0 && (
              <>
                <h3 data-designer-type="text" data-designer-id="quotation.sectionTitle" style={applyTextElementStyle(textAreas.sectionTitle, 'title')}>الشروط والأحكام</h3>
                <ul>
                  {d.terms.map((term, i) => <li key={i}>{term}</li>)}
                </ul>
              </>
            )}
            {d.notes && (
              <>
                <h3 data-designer-type="text" data-designer-id="quotation.sectionTitle" style={applyTextElementStyle(textAreas.sectionTitle, 'title')}>الملاحظات</h3>
                <ul><li>{sanitizePrintText(d.notes)}</li></ul>
              </>
            )}
          </div>
          <div
            className={styles.qTotals}
            data-designer-type="text"
            data-designer-id="quotation.totals"
            style={applyTextElementStyle(textAreas.totals)}
          >
            <div className={styles.row}>
              <span>المجموع الفرعي</span>
              <span>{formatKWD(sub)} د.ك</span>
            </div>
            <div className={styles.row}>
              <span>الخصم</span>
              <span>{formatKWD(disc)} د.ك</span>
            </div>
            <div className={`${styles.row} ${styles.rowGrand}`}>
              <span>الإجمالي النهائي</span>
              <span>{formatKWD(d.grandTotal)} د.ك</span>
            </div>
          </div>
        </section>

        {/* ── Signature ── */}
        <section className={styles.qSign}>
          <div className={styles.signCol}>
            <div className={styles.signRole}>عن شركة المنار الدولية</div>
            {d.company?.showSignature !== false && d.company?.signatureUrl && (
              <img
                src={d.company.signatureUrl}
                alt=""
                data-bd-type="signature"
                data-designer-type="branding"
                data-designer-id="signature"
                style={{ maxHeight: '20mm', maxWidth: '40mm', objectFit: 'contain', display: 'block', margin: '0 auto 2mm', ...applyBrandingElementStyle(brandingLayout.signature), ...getInkFilterStyle(d.company.inkMode) }}
              />
            )}
            <div className={styles.signLine} />
            <div className={styles.signCap}>الاسم والتوقيع</div>
            {d.company?.showStamp !== false && d.company?.stampUrl ? (
              <img
                src={d.company.stampUrl}
                alt=""
                data-bd-type="stamp"
                data-designer-type="branding"
                data-designer-id="stamp"
                style={{ maxHeight: '20mm', maxWidth: '40mm', objectFit: 'contain', display: 'block', margin: '4mm auto 0', ...applyBrandingElementStyle(brandingLayout.stamp), ...getInkFilterStyle(d.company.inkMode) }}
              />
            ) : (
              <div className={styles.signStamp}>مكان الختم</div>
            )}
          </div>
        </section>
      </main>

      {/* Letterhead footer */}
      {showLetterhead && (
        <footer className={styles.lhFoot}>
          <div className={styles.lhFootRule} />
          <div className={styles.lhFootAr}>
            جليب الشيوخ - المجمع التجاري الروضة - الدور الثاني - مكتب ١٣
          </div>
          <div className={styles.lhFootEn}>
            Jleeb Al Shuyoukh - Al Rawda Commercial Complex - Second Floor - Office 13
          </div>
        </footer>
      )}
    </div>
  );
}
