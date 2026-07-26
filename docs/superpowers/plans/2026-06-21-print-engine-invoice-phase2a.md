# Print Template Engine Phase 2A — Invoice Integration Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Connect the Phase 1 Print Template Engine to InvoicePreview so real invoice data flows through the engine into all 5 original + 5 blank-letterhead invoice template components, with a toggleable Legacy / Engine preview mode and safe fallback.

**Architecture:** Extend `InvoicePrintData` with optional `projectName` field, update `adaptInvoice` to map `contract.asphaltPlant`, rewrite all 10 invoice template TSX files to accept `data?: InvoicePrintData` and render dynamically, fix the engine registration to remove the static-stub `bridge()` cast, create a small integration helper for validation warnings, then wire `InvoicePreview.tsx` to the engine via `usePrintTemplate` + `buildInvoicePrintData` with a Legacy ↔ Engine toggle.

**Tech Stack:** React 18, TypeScript 5.5, Vite, CSS Modules, Zustand, Vitest (frontend), existing `print-templates/` engine (Phase 1 foundation)

## Global Constraints

- No backend changes, no Prisma changes, no API changes, no package.json changes
- Only files allowed: `frontend/src/pages/InvoicePreview.tsx`, anything under `frontend/src/print-templates/`
- No npm packages added
- Legacy preview remains the default; engine preview is optional/toggleable
- If `buildInvoicePrintData` throws, force Legacy mode and show a warning
- Each design stays visually faithful to its reference template
- Design 1 uses Dinars/Fils split columns; Designs 2–5 use decimal KWD (`formatKWD`)
- Blank variants hide company header/logo/watermark with `visibility: 'hidden'` (preserves spacing)

---

### Task 1: Extend `InvoicePrintData` + update `adaptInvoice` + add tests

**Files:**
- Modify: `frontend/src/print-templates/engine/types.ts`
- Modify: `frontend/src/print-templates/adapters/invoiceAdapter.ts`
- Modify: `frontend/src/__tests__/printTemplates/invoiceAdapter.test.ts`

**Interfaces:**
- Produces: `InvoicePrintData.projectName?: string` — used by all 5 template designs in Tasks 2–6
- Produces: `adaptInvoice` maps `invoice.contract?.asphaltPlant` → `projectName`

- [ ] **Step 1: Add `projectName` to `InvoicePrintData` in `engine/types.ts`**

In `frontend/src/print-templates/engine/types.ts`, add the optional field to `InvoicePrintData`:

```ts
export interface InvoicePrintData {
  company: CompanyPrintData;
  invoiceNumber: string;
  date: string;
  customerName: string;
  lineItems: PrintLineItem[];
  totalDinars: number;
  totalFils: number;
  totalInWords: string;
  notes?: string;
  /** From contract.asphaltPlant — shown in project/reference rows of invoice templates. */
  projectName?: string;
}
```

- [ ] **Step 2: Update `adaptInvoice` in `adapters/invoiceAdapter.ts`**

```ts
export function adaptInvoice(invoice: ApiInvoice): InvoicePrintData {
  const { dinars, fils } = splitKWD(invoice.total);
  const partyName = invoice.customer?.name ?? invoice.supplier?.name ?? '';

  return {
    company: getDefaultCompanyPrintData(),
    invoiceNumber: invoice.invoiceNumber,
    date: formatDateForPrint(invoice.issueDate),
    customerName: partyName,
    lineItems: toLineItems(invoice.items),
    totalDinars: dinars,
    totalFils: fils,
    totalInWords: tafqeet(invoice.total),
    notes: invoice.notes ?? undefined,
    projectName: invoice.contract?.asphaltPlant ?? undefined,
  };
}
```

- [ ] **Step 3: Add test coverage for `projectName` in `invoiceAdapter.test.ts`**

Add these two test cases inside the existing `describe('adaptInvoice', ...)` block:

```ts
it('maps projectName from contract.asphaltPlant', () => {
  const result = adaptInvoice(
    makeInvoice({
      contract: { id: 7, asphaltPlant: 'مصنع الخليج للأسفلت' },
    }),
  );
  expect(result.projectName).toBe('مصنع الخليج للأسفلت');
});

it('projectName is undefined when contract is null', () => {
  const result = adaptInvoice(makeInvoice({ contract: null }));
  expect(result.projectName).toBeUndefined();
});
```

- [ ] **Step 4: Run frontend tests to verify**

```bash
cd frontend && npm test
```

Expected: All tests pass including the 2 new ones.

- [ ] **Step 5: Commit**

```bash
git add frontend/src/print-templates/engine/types.ts \
        frontend/src/print-templates/adapters/invoiceAdapter.ts \
        frontend/src/__tests__/printTemplates/invoiceAdapter.test.ts
git commit -m "feat(print-engine): extend InvoicePrintData with projectName, map from contract.asphaltPlant"
```

---

### Task 2: InvoiceDesign1 + InvoiceDesign1Blank — data-driven

**Files:**
- Modify: `frontend/src/print-templates/reference/invoices/InvoiceDesign1.tsx`
- Modify: `frontend/src/print-templates/reference/invoices/InvoiceDesign1Blank.tsx`

**Key facts about Design 1:**
- Dinars/Fils split columns for unit price and total (use `splitKWD`)
- 20 blank rows in original — when data present, render items + filler to 15 rows minimum
- Watermark (`styles.wm`): hidden in blank via `display: 'none'`
- Header (`styles.hdr`): hidden in blank via `visibility: 'hidden'` (preserves spacing)
- Tfoot row: spans all 6 cols, shows total-in-words + numeric Dinars/Fils total

- [ ] **Step 1: Rewrite `InvoiceDesign1.tsx`**

```tsx
import logo from '../assets/almanar-logo.png';
import styles from './InvoiceDesign1.module.css';
import type { InvoicePrintData } from '../../engine/types';
import { splitKWD } from '../../utils';

interface Props { data?: InvoicePrintData; }

const BLANK_ROW = (
  <tr>
    <td className={styles['c-desc']}></td><td className={styles['c-qty']}></td>
    <td className={styles['c-d']}></td><td className={styles['c-f']}></td>
    <td className={styles['c-d']}></td><td className={styles['c-f']}></td>
  </tr>
);

export default function InvoiceDesign1({ data }: Props) {
  const fillerCount = data ? Math.max(0, 15 - data.lineItems.length) : 20;

  return (
    <>
      <div className={styles.page}>
        <img className={styles.wm} src={logo} />
        <div className={styles.p}>
          <div className={styles.hdr}>
            <div className={`${styles.hL} ${styles.en}`}>
              <div className={styles['cname-en']}>Al Manar Al Duwaliya Company <span style={{ fontSize: '7pt' }}>L.L.C</span></div>
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
              <div className={styles['cname-ar']}>شركة المنار الدولية <span style={{ fontSize: '9pt' }}>ذ.م.م</span></div>
              <div className={styles['tag-ar']}>لإنشاء وإصلاح الطرق والشوارع والأرصفة ومستلزمات الطرق</div>
              <div className={styles['cap-ar']}>رأس المال المدفوع ٥٠٠،٠٠٠ ألف دينار كويتي</div>
              <div className={styles.contact}>
                99333820 / 94404401 : <span>&#9742;</span><br />
                98777887 : <span>&#9743;</span><br />
                Manar.int.co@gmail.com : <span>&#9993;</span>
              </div>
            </div>
          </div>
          <div className={styles.title}>
            <div className={styles.a}>فاتورة نقداً / بالحساب</div>
            <div className={styles.b}>Cash / Credit Invoice</div>
          </div>
          <div className={styles.meta}>
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
          <table>
            <thead>
              <tr>
                <th className={styles['c-desc']} rowSpan={2}><div className={styles.deschead}>ملاحظات</div><div className={styles.descsub}>Description</div></th>
                <th className={styles['c-qty']} rowSpan={2}><div className={styles.grp}>الكمية</div><div className={styles.sub}>طن / درب</div></th>
                <th colSpan={2}><div className={styles.grp}>سعر الوحدة</div><div className={styles.sub}>Unit Price</div></th>
                <th colSpan={2}><div className={styles.grp}>القيمة</div><div className={styles.sub}>Total Price</div></th>
              </tr>
              <tr>
                <th className={styles.sub}>دينار K.D</th><th className={styles.sub}>فلس Fils</th>
                <th className={styles.sub}>دينار K.D</th><th className={styles.sub}>فلس Fils</th>
              </tr>
            </thead>
            <tbody>
              {data && data.lineItems.map((item, i) => {
                const up = splitKWD(item.unitPrice);
                const tot = splitKWD(item.total);
                return (
                  <tr key={i}>
                    <td className={styles['c-desc']}>{item.descriptionAr}</td>
                    <td className={styles['c-qty']}>{item.quantity}</td>
                    <td className={styles['c-d']}>{up.dinars}</td>
                    <td className={styles['c-f']}>{up.filsPadded}</td>
                    <td className={styles['c-d']}>{tot.dinars}</td>
                    <td className={styles['c-f']}>{tot.filsPadded}</td>
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
            <tfoot>
              <tr className={styles.totrow}>
                <td colSpan={6}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', direction: 'rtl', alignItems: 'center' }}>
                    <span>
                      {data
                        ? <>القيمة الإجمالية مبلغ وقدره {data.totalInWords}</>
                        : 'القيمة الإجمالية مبلغ وقدره ...........................................................................'}
                    </span>
                    <span style={{ direction: 'ltr' }}>
                      {data
                        ? `${data.totalDinars} / ${String(data.totalFils).padStart(3, '0')}`
                        : 'Total :'}
                    </span>
                  </div>
                </td>
              </tr>
            </tfoot>
          </table>
          <div className={styles.foot}>
            <div>المحاسبة : <span className={styles.ln}></span></div>
            <div>المسؤول : <span className={styles.ln}></span></div>
          </div>
        </div>
      </div>
    </>
  );
}
```

- [ ] **Step 2: Rewrite `InvoiceDesign1Blank.tsx`**

Identical to Design 1 but: watermark `display: 'none'`, header `visibility: 'hidden'`.

```tsx
import logo from '../assets/almanar-logo.png';
import styles from './InvoiceDesign1.module.css';
import type { InvoicePrintData } from '../../engine/types';
import { splitKWD } from '../../utils';

interface Props { data?: InvoicePrintData; }

export default function InvoiceDesign1Blank({ data }: Props) {
  const fillerCount = data ? Math.max(0, 15 - data.lineItems.length) : 20;

  return (
    <>
      <div className={styles.page}>
        <img className={styles.wm} src={logo} style={{ display: 'none' }} />
        <div className={styles.p}>
          <div className={styles.hdr} style={{ visibility: 'hidden' }}>
            <div className={`${styles.hL} ${styles.en}`}>
              <div className={styles['cname-en']}>Al Manar Al Duwaliya Company <span style={{ fontSize: '7pt' }}>L.L.C</span></div>
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
              <div className={styles['cname-ar']}>شركة المنار الدولية <span style={{ fontSize: '9pt' }}>ذ.م.م</span></div>
              <div className={styles['tag-ar']}>لإنشاء وإصلاح الطرق والشوارع والأرصفة ومستلزمات الطرق</div>
              <div className={styles['cap-ar']}>رأس المال المدفوع ٥٠٠،٠٠٠ ألف دينار كويتي</div>
              <div className={styles.contact}>
                99333820 / 94404401 : <span>&#9742;</span><br />
                98777887 : <span>&#9743;</span><br />
                Manar.int.co@gmail.com : <span>&#9993;</span>
              </div>
            </div>
          </div>
          <div className={styles.title}>
            <div className={styles.a}>فاتورة نقداً / بالحساب</div>
            <div className={styles.b}>Cash / Credit Invoice</div>
          </div>
          <div className={styles.meta}>
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
          <table>
            <thead>
              <tr>
                <th className={styles['c-desc']} rowSpan={2}><div className={styles.deschead}>ملاحظات</div><div className={styles.descsub}>Description</div></th>
                <th className={styles['c-qty']} rowSpan={2}><div className={styles.grp}>الكمية</div><div className={styles.sub}>طن / درب</div></th>
                <th colSpan={2}><div className={styles.grp}>سعر الوحدة</div><div className={styles.sub}>Unit Price</div></th>
                <th colSpan={2}><div className={styles.grp}>القيمة</div><div className={styles.sub}>Total Price</div></th>
              </tr>
              <tr>
                <th className={styles.sub}>دينار K.D</th><th className={styles.sub}>فلس Fils</th>
                <th className={styles.sub}>دينار K.D</th><th className={styles.sub}>فلس Fils</th>
              </tr>
            </thead>
            <tbody>
              {data && data.lineItems.map((item, i) => {
                const up = splitKWD(item.unitPrice);
                const tot = splitKWD(item.total);
                return (
                  <tr key={i}>
                    <td className={styles['c-desc']}>{item.descriptionAr}</td>
                    <td className={styles['c-qty']}>{item.quantity}</td>
                    <td className={styles['c-d']}>{up.dinars}</td>
                    <td className={styles['c-f']}>{up.filsPadded}</td>
                    <td className={styles['c-d']}>{tot.dinars}</td>
                    <td className={styles['c-f']}>{tot.filsPadded}</td>
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
            <tfoot>
              <tr className={styles.totrow}>
                <td colSpan={6}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', direction: 'rtl', alignItems: 'center' }}>
                    <span>
                      {data
                        ? <>القيمة الإجمالية مبلغ وقدره {data.totalInWords}</>
                        : 'القيمة الإجمالية مبلغ وقدره ...........................................................................'}
                    </span>
                    <span style={{ direction: 'ltr' }}>
                      {data
                        ? `${data.totalDinars} / ${String(data.totalFils).padStart(3, '0')}`
                        : 'Total :'}
                    </span>
                  </div>
                </td>
              </tr>
            </tfoot>
          </table>
          <div className={styles.foot}>
            <div>المحاسبة : <span className={styles.ln}></span></div>
            <div>المسؤول : <span className={styles.ln}></span></div>
          </div>
        </div>
      </div>
    </>
  );
}
```

- [ ] **Step 3: Commit**

```bash
git add frontend/src/print-templates/reference/invoices/InvoiceDesign1.tsx \
        frontend/src/print-templates/reference/invoices/InvoiceDesign1Blank.tsx
git commit -m "feat(print-engine): InvoiceDesign1 + Blank — data-driven via InvoicePrintData"
```

---

### Task 3: InvoiceDesign2 + InvoiceDesign2Blank — data-driven

**Files:**
- Modify: `frontend/src/print-templates/reference/invoices/InvoiceDesign2.tsx`
- Modify: `frontend/src/print-templates/reference/invoices/InvoiceDesign2Blank.tsx`

**Key facts about Design 2:**
- Decimal KWD columns (`formatKWD`)
- Meta: 2 boxes — Box1: invoiceNumber + date; Box2: customer + project + location
- Table: no built-in blank rows (original had 3 hardcoded)
- Sign section: 3 signature blocks
- Contact bar + footer bar (footer bar hidden in blank)
- Blank: `brand` div hidden via `visibility: 'hidden'`; `footbar` hidden via `visibility: 'hidden'`

- [ ] **Step 1: Rewrite `InvoiceDesign2.tsx`**

```tsx
import logo from '../assets/almanar-logo.png';
import styles from './InvoiceDesign2.module.css';
import type { InvoicePrintData } from '../../engine/types';
import { formatKWD, formatKWDAr } from '../../utils';

interface Props { data?: InvoicePrintData; }

const SAMPLE_ROWS = (
  <>
    <tr><td className={styles.n}>1</td><td className={styles.ds}>نقل أسفلت – خلطة ساخنة</td><td className={styles.u}>درب</td><td className={styles.q}>12</td><td className={styles.pr}>28.500</td><td className={styles.t}>342.000</td></tr>
    <tr><td className={styles.n}>2</td><td className={styles.ds}>توريد ونقل بيس كورس</td><td className={styles.u}>طن</td><td className={styles.q}>60</td><td className={styles.pr}>4.250</td><td className={styles.t}>255.000</td></tr>
    <tr><td className={styles.n}>3</td><td className={styles.ds}>أجور معدة فرش وتسوية</td><td className={styles.u}>يوم</td><td className={styles.q}>3</td><td className={styles.pr}>45.000</td><td className={styles.t}>135.000</td></tr>
  </>
);

export default function InvoiceDesign2({ data }: Props) {
  const grandTotal = data ? data.totalDinars + data.totalFils / 1000 : null;

  return (
    <>
      <div className={styles.page}>
        <div className={styles.bar}></div>
        <div className={styles.head}>
          <div className={styles.brand}>
            <img src={logo} />
            <div className={styles.txt}>
              <div className={styles['cn-ar']}>شركة المنار الدولية</div>
              <div className={styles['cn-sub']}>لإنشاء وإصلاح الطرق والشوارع والأرصفة ومستلزمات الطرق</div>
              <div className={styles['cn-en']}>AL MANAR AL DUWALIYA CO. L.L.C</div>
            </div>
          </div>
          <div className={styles.invtitle}><div className={styles.h}>INVOICE</div><div className={styles.ar}>فاتورة نقداً / بالحساب</div></div>
        </div>
        <div className={styles.metawrap}>
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
          <table>
            <thead>
              <tr>
                <th className={styles.n}>م</th><th>البيان / Description</th><th>الوحدة</th>
                <th>الكمية</th><th>سعر الوحدة (د.ك)</th><th>القيمة (د.ك)</th>
              </tr>
            </thead>
            <tbody>
              {data
                ? data.lineItems.map((item, i) => (
                    <tr key={i}>
                      <td className={styles.n}>{item.number}</td>
                      <td className={styles.ds}>{item.descriptionAr}</td>
                      <td className={styles.u}>{item.unit}</td>
                      <td className={styles.q}>{item.quantity}</td>
                      <td className={styles.pr}>{formatKWD(item.unitPrice)}</td>
                      <td className={styles.t}>{formatKWD(item.total)}</td>
                    </tr>
                  ))
                : SAMPLE_ROWS
              }
            </tbody>
          </table>
        </div>
        <div className={styles.words}>
          <b>المبلغ كتابةً: </b>
          {data ? data.totalInWords : 'سبعمائة واثنان وثلاثون ديناراً كويتياً لا غير'}
        </div>
        <div className={styles.bottom}>
          <div className={styles.left}>
            <div className={styles['sec-h']}>شروط الدفع</div>
            <div className={styles['sec-b']}>السداد خلال 30 يوماً من تاريخ الفاتورة.</div>
            {data?.notes && (
              <><div className={styles['sec-h']} style={{ marginTop: '3mm' }}>ملاحظات</div><div className={styles['sec-b']}>{data.notes}</div></>
            )}
          </div>
          <div className={styles.right}>
            <div className={styles.tr}><b>المجموع الفرعي</b><span>{grandTotal !== null ? formatKWDAr(grandTotal) : '732.000 د.ك'}</span></div>
            <div className={styles.grand}><span>الإجمالي النهائي</span><span>{grandTotal !== null ? formatKWDAr(grandTotal) : '732.000 د.ك'}</span></div>
          </div>
        </div>
        <div className={styles.sign}>
          <div className={styles.s}><div className={styles.lbl}>المحاسبة</div><div className={styles.ln}>التوقيع</div></div>
          <div className={styles.s}><div className={styles.lbl}>الختم</div><div className={styles.ln}>&nbsp;</div></div>
          <div className={styles.s}><div className={styles.lbl}>المسؤول / المعتمد</div><div className={styles.ln}>التوقيع</div></div>
        </div>
        <div className={styles.contactbar}>99333820 / 94404401 &nbsp;|&nbsp; واتساب 98777887 &nbsp;|&nbsp; Manar.int.co@gmail.com</div>
        <div className={styles.footbar}></div>
      </div>
    </>
  );
}
```

- [ ] **Step 2: Rewrite `InvoiceDesign2Blank.tsx`**

Same as Design 2 but: `brand` → `style={{ visibility: 'hidden' }}`; `footbar` → `style={{ visibility: 'hidden' }}`.

```tsx
import logo from '../assets/almanar-logo.png';
import styles from './InvoiceDesign2.module.css';
import type { InvoicePrintData } from '../../engine/types';
import { formatKWD, formatKWDAr } from '../../utils';

interface Props { data?: InvoicePrintData; }

const SAMPLE_ROWS = (
  <>
    <tr><td className={styles.n}>1</td><td className={styles.ds}>نقل أسفلت – خلطة ساخنة</td><td className={styles.u}>درب</td><td className={styles.q}>12</td><td className={styles.pr}>28.500</td><td className={styles.t}>342.000</td></tr>
    <tr><td className={styles.n}>2</td><td className={styles.ds}>توريد ونقل بيس كورس</td><td className={styles.u}>طن</td><td className={styles.q}>60</td><td className={styles.pr}>4.250</td><td className={styles.t}>255.000</td></tr>
    <tr><td className={styles.n}>3</td><td className={styles.ds}>أجور معدة فرش وتسوية</td><td className={styles.u}>يوم</td><td className={styles.q}>3</td><td className={styles.pr}>45.000</td><td className={styles.t}>135.000</td></tr>
  </>
);

export default function InvoiceDesign2Blank({ data }: Props) {
  const grandTotal = data ? data.totalDinars + data.totalFils / 1000 : null;

  return (
    <>
      <div className={styles.page}>
        <div className={styles.bar}></div>
        <div className={styles.head}>
          <div className={styles.brand} style={{ visibility: 'hidden' }}>
            <img src={logo} />
            <div className={styles.txt}>
              <div className={styles['cn-ar']}>شركة المنار الدولية</div>
              <div className={styles['cn-sub']}>لإنشاء وإصلاح الطرق والشوارع والأرصفة ومستلزمات الطرق</div>
              <div className={styles['cn-en']}>AL MANAR AL DUWALIYA CO. L.L.C</div>
            </div>
          </div>
          <div className={styles.invtitle}><div className={styles.h}>INVOICE</div><div className={styles.ar}>فاتورة نقداً / بالحساب</div></div>
        </div>
        <div className={styles.metawrap}>
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
          <table>
            <thead>
              <tr>
                <th className={styles.n}>م</th><th>البيان / Description</th><th>الوحدة</th>
                <th>الكمية</th><th>سعر الوحدة (د.ك)</th><th>القيمة (د.ك)</th>
              </tr>
            </thead>
            <tbody>
              {data
                ? data.lineItems.map((item, i) => (
                    <tr key={i}>
                      <td className={styles.n}>{item.number}</td>
                      <td className={styles.ds}>{item.descriptionAr}</td>
                      <td className={styles.u}>{item.unit}</td>
                      <td className={styles.q}>{item.quantity}</td>
                      <td className={styles.pr}>{formatKWD(item.unitPrice)}</td>
                      <td className={styles.t}>{formatKWD(item.total)}</td>
                    </tr>
                  ))
                : SAMPLE_ROWS
              }
            </tbody>
          </table>
        </div>
        <div className={styles.words}>
          <b>المبلغ كتابةً: </b>
          {data ? data.totalInWords : 'سبعمائة واثنان وثلاثون ديناراً كويتياً لا غير'}
        </div>
        <div className={styles.bottom}>
          <div className={styles.left}>
            <div className={styles['sec-h']}>شروط الدفع</div>
            <div className={styles['sec-b']}>السداد خلال 30 يوماً من تاريخ الفاتورة.</div>
            {data?.notes && (
              <><div className={styles['sec-h']} style={{ marginTop: '3mm' }}>ملاحظات</div><div className={styles['sec-b']}>{data.notes}</div></>
            )}
          </div>
          <div className={styles.right}>
            <div className={styles.tr}><b>المجموع الفرعي</b><span>{grandTotal !== null ? formatKWDAr(grandTotal) : '732.000 د.ك'}</span></div>
            <div className={styles.grand}><span>الإجمالي النهائي</span><span>{grandTotal !== null ? formatKWDAr(grandTotal) : '732.000 د.ك'}</span></div>
          </div>
        </div>
        <div className={styles.sign}>
          <div className={styles.s}><div className={styles.lbl}>المحاسبة</div><div className={styles.ln}>التوقيع</div></div>
          <div className={styles.s}><div className={styles.lbl}>الختم</div><div className={styles.ln}>&nbsp;</div></div>
          <div className={styles.s}><div className={styles.lbl}>المسؤول / المعتمد</div><div className={styles.ln}>التوقيع</div></div>
        </div>
        <div className={styles.contactbar}>99333820 / 94404401 &nbsp;|&nbsp; واتساب 98777887 &nbsp;|&nbsp; Manar.int.co@gmail.com</div>
        <div className={styles.footbar} style={{ visibility: 'hidden' }}></div>
      </div>
    </>
  );
}
```

- [ ] **Step 3: Commit**

```bash
git add frontend/src/print-templates/reference/invoices/InvoiceDesign2.tsx \
        frontend/src/print-templates/reference/invoices/InvoiceDesign2Blank.tsx
git commit -m "feat(print-engine): InvoiceDesign2 + Blank — data-driven via InvoicePrintData"
```

---

### Task 4: InvoiceDesign3 + InvoiceDesign3Blank — data-driven

**Files:**
- Modify: `frontend/src/print-templates/reference/invoices/InvoiceDesign3.tsx`
- Modify: `frontend/src/print-templates/reference/invoices/InvoiceDesign3Blank.tsx`

**Key facts about Design 3:**
- Header: `head` with `brand` (logo + company) + `metabox` (invoice#, date, type)
- Two info boxes: "بيانات العميل" + "بيانات المشروع"
- Table: decimal KWD, no built-in blank rows
- Footer bar `fbar` stays visible in blank (per existing blank variant)
- Blank: `brand` div hidden via `visibility: 'hidden'`

- [ ] **Step 1: Rewrite `InvoiceDesign3.tsx`**

```tsx
import logo from '../assets/almanar-logo.png';
import styles from './InvoiceDesign3.module.css';
import type { InvoicePrintData } from '../../engine/types';
import { formatKWD, formatKWDAr } from '../../utils';

interface Props { data?: InvoicePrintData; }

const SAMPLE_ROWS = (
  <>
    <tr><td className={styles.n}>1</td><td className={styles.ds}>نقل أسفلت – خلطة ساخنة</td><td>درب</td><td>12</td><td>28.500</td><td className={styles.t}>342.000</td></tr>
    <tr><td className={styles.n}>2</td><td className={styles.ds}>توريد ونقل بيس كورس</td><td>طن</td><td>60</td><td>4.250</td><td className={styles.t}>255.000</td></tr>
    <tr><td className={styles.n}>3</td><td className={styles.ds}>أجور معدة فرش وتسوية</td><td>يوم</td><td>3</td><td>45.000</td><td className={styles.t}>135.000</td></tr>
  </>
);

export default function InvoiceDesign3({ data }: Props) {
  const grandTotal = data ? data.totalDinars + data.totalFils / 1000 : null;

  return (
    <>
      <div className={styles.page}>
        <div className={styles.head}>
          <div className={styles.brand}>
            <img src={logo} />
            <div>
              <div className={styles['cn-ar']}>شركة المنار الدولية ذ.م.م</div>
              <div className={styles['cn-sub']}>لإنشاء وإصلاح الطرق والشوارع والأرصفة ومستلزمات الطرق</div>
              <div className={styles['cn-en']}>AL MANAR AL DUWALIYA CO. L.L.C</div>
            </div>
          </div>
          <div className={styles.metabox}>
            <div className={styles.h}>فاتورة INVOICE</div>
            <div className={styles.r}><b>رقم الفاتورة</b><span>{data ? data.invoiceNumber : 'INV-2026-0142'}</span></div>
            <div className={styles.r}><b>التاريخ</b><span>{data ? data.date : '20 / 06 / 2026'}</span></div>
            <div className={styles.r}><b>النوع</b><span>نقداً / بالحساب</span></div>
          </div>
        </div>
        <div className={styles.boxes}>
          <div className={styles.box}>
            <div className={styles.bh}>بيانات العميل</div>
            <div className={styles.bb}>
              <b>الاسم:</b> {data ? data.customerName : 'مصنع الخليج للأسفلت ذ.م.م'}<br />
              <b>المسمى:</b> {data ? (data.projectName ?? '') : 'Gulf Asphalt Factory'}
            </div>
          </div>
          <div className={styles.box}>
            <div className={styles.bh}>بيانات المشروع</div>
            <div className={styles.bb}>
              <b>المشروع:</b> {data ? (data.projectName ?? '') : 'توريد ونقل أسفلت – عقد شهري'}<br />
              <b>الموقع:</b> {data ? '' : 'منطقة الشعيبة الصناعية – الكويت'}
            </div>
          </div>
        </div>
        <table>
          <thead>
            <tr>
              <th className={styles.n}>م</th><th>البيان / Description</th><th>الوحدة</th>
              <th>الكمية</th><th>سعر الوحدة (د.ك)</th><th>القيمة (د.ك)</th>
            </tr>
          </thead>
          <tbody>
            {data
              ? data.lineItems.map((item, i) => (
                  <tr key={i}>
                    <td className={styles.n}>{item.number}</td>
                    <td className={styles.ds}>{item.descriptionAr}</td>
                    <td>{item.unit}</td>
                    <td>{item.quantity}</td>
                    <td>{formatKWD(item.unitPrice)}</td>
                    <td className={styles.t}>{formatKWD(item.total)}</td>
                  </tr>
                ))
              : SAMPLE_ROWS
            }
          </tbody>
        </table>
        <div className={styles.words}>
          <b>المبلغ كتابةً: </b>
          {data ? data.totalInWords : 'سبعمائة واثنان وثلاثون ديناراً كويتياً لا غير'}
        </div>
        <div className={styles.bottom}>
          <div className={styles.tl}>
            <div className={styles.sec}>
              <div className={styles.sh}>شروط الدفع</div>
              <div className={styles.sb}>السداد خلال 30 يوماً من تاريخ الفاتورة.</div>
            </div>
            <div className={styles.sec} style={{ marginTop: '4mm' }}>
              <div className={styles.sh}>ملاحظات</div>
              <div className={styles.sb} style={{ minHeight: '16mm' }}>{data?.notes ?? ''}</div>
            </div>
          </div>
          <div className={styles.tr2}>
            <div className={styles.row}><b>المجموع الفرعي</b><span>{grandTotal !== null ? formatKWDAr(grandTotal) : '732.000 د.ك'}</span></div>
            <div className={styles.grand}><span>الإجمالي النهائي</span><span>{grandTotal !== null ? formatKWDAr(grandTotal) : '732.000 د.ك'}</span></div>
          </div>
        </div>
        <div className={styles.sign}>
          <div className={styles.s}><div className={styles.lbl}>المحاسبة</div><div className={styles.ln}>التوقيع</div></div>
          <div className={styles.s}><div className={styles.lbl}>الختم الرسمي</div><div className={styles.ln}>&nbsp;</div></div>
          <div className={styles.s}><div className={styles.lbl}>المسؤول / المعتمد</div><div className={styles.ln}>التوقيع</div></div>
        </div>
        <div className={styles.fbar}>هاتف 99333820 / 94404401 &nbsp;•&nbsp; واتساب 98777887 &nbsp;•&nbsp; Manar.int.co@gmail.com</div>
      </div>
    </>
  );
}
```

- [ ] **Step 2: Rewrite `InvoiceDesign3Blank.tsx`**

Identical to Design 3 but `brand` has `style={{ visibility: 'hidden' }}`.

```tsx
import logo from '../assets/almanar-logo.png';
import styles from './InvoiceDesign3.module.css';
import type { InvoicePrintData } from '../../engine/types';
import { formatKWD, formatKWDAr } from '../../utils';

interface Props { data?: InvoicePrintData; }

const SAMPLE_ROWS = (
  <>
    <tr><td className={styles.n}>1</td><td className={styles.ds}>نقل أسفلت – خلطة ساخنة</td><td>درب</td><td>12</td><td>28.500</td><td className={styles.t}>342.000</td></tr>
    <tr><td className={styles.n}>2</td><td className={styles.ds}>توريد ونقل بيس كورس</td><td>طن</td><td>60</td><td>4.250</td><td className={styles.t}>255.000</td></tr>
    <tr><td className={styles.n}>3</td><td className={styles.ds}>أجور معدة فرش وتسوية</td><td>يوم</td><td>3</td><td>45.000</td><td className={styles.t}>135.000</td></tr>
  </>
);

export default function InvoiceDesign3Blank({ data }: Props) {
  const grandTotal = data ? data.totalDinars + data.totalFils / 1000 : null;

  return (
    <>
      <div className={styles.page}>
        <div className={styles.head}>
          <div className={styles.brand} style={{ visibility: 'hidden' }}>
            <img src={logo} />
            <div>
              <div className={styles['cn-ar']}>شركة المنار الدولية ذ.م.م</div>
              <div className={styles['cn-sub']}>لإنشاء وإصلاح الطرق والشوارع والأرصفة ومستلزمات الطرق</div>
              <div className={styles['cn-en']}>AL MANAR AL DUWALIYA CO. L.L.C</div>
            </div>
          </div>
          <div className={styles.metabox}>
            <div className={styles.h}>فاتورة INVOICE</div>
            <div className={styles.r}><b>رقم الفاتورة</b><span>{data ? data.invoiceNumber : 'INV-2026-0142'}</span></div>
            <div className={styles.r}><b>التاريخ</b><span>{data ? data.date : '20 / 06 / 2026'}</span></div>
            <div className={styles.r}><b>النوع</b><span>نقداً / بالحساب</span></div>
          </div>
        </div>
        <div className={styles.boxes}>
          <div className={styles.box}>
            <div className={styles.bh}>بيانات العميل</div>
            <div className={styles.bb}>
              <b>الاسم:</b> {data ? data.customerName : 'مصنع الخليج للأسفلت ذ.م.م'}<br />
              <b>المسمى:</b> {data ? (data.projectName ?? '') : 'Gulf Asphalt Factory'}
            </div>
          </div>
          <div className={styles.box}>
            <div className={styles.bh}>بيانات المشروع</div>
            <div className={styles.bb}>
              <b>المشروع:</b> {data ? (data.projectName ?? '') : 'توريد ونقل أسفلت – عقد شهري'}<br />
              <b>الموقع:</b> {data ? '' : 'منطقة الشعيبة الصناعية – الكويت'}
            </div>
          </div>
        </div>
        <table>
          <thead>
            <tr>
              <th className={styles.n}>م</th><th>البيان / Description</th><th>الوحدة</th>
              <th>الكمية</th><th>سعر الوحدة (د.ك)</th><th>القيمة (د.ك)</th>
            </tr>
          </thead>
          <tbody>
            {data
              ? data.lineItems.map((item, i) => (
                  <tr key={i}>
                    <td className={styles.n}>{item.number}</td>
                    <td className={styles.ds}>{item.descriptionAr}</td>
                    <td>{item.unit}</td>
                    <td>{item.quantity}</td>
                    <td>{formatKWD(item.unitPrice)}</td>
                    <td className={styles.t}>{formatKWD(item.total)}</td>
                  </tr>
                ))
              : SAMPLE_ROWS
            }
          </tbody>
        </table>
        <div className={styles.words}>
          <b>المبلغ كتابةً: </b>
          {data ? data.totalInWords : 'سبعمائة واثنان وثلاثون ديناراً كويتياً لا غير'}
        </div>
        <div className={styles.bottom}>
          <div className={styles.tl}>
            <div className={styles.sec}>
              <div className={styles.sh}>شروط الدفع</div>
              <div className={styles.sb}>السداد خلال 30 يوماً من تاريخ الفاتورة.</div>
            </div>
            <div className={styles.sec} style={{ marginTop: '4mm' }}>
              <div className={styles.sh}>ملاحظات</div>
              <div className={styles.sb} style={{ minHeight: '16mm' }}>{data?.notes ?? ''}</div>
            </div>
          </div>
          <div className={styles.tr2}>
            <div className={styles.row}><b>المجموع الفرعي</b><span>{grandTotal !== null ? formatKWDAr(grandTotal) : '732.000 د.ك'}</span></div>
            <div className={styles.grand}><span>الإجمالي النهائي</span><span>{grandTotal !== null ? formatKWDAr(grandTotal) : '732.000 د.ك'}</span></div>
          </div>
        </div>
        <div className={styles.sign}>
          <div className={styles.s}><div className={styles.lbl}>المحاسبة</div><div className={styles.ln}>التوقيع</div></div>
          <div className={styles.s}><div className={styles.lbl}>الختم الرسمي</div><div className={styles.ln}>&nbsp;</div></div>
          <div className={styles.s}><div className={styles.lbl}>المسؤول / المعتمد</div><div className={styles.ln}>التوقيع</div></div>
        </div>
        <div className={styles.fbar}>هاتف 99333820 / 94404401 &nbsp;•&nbsp; واتساب 98777887 &nbsp;•&nbsp; Manar.int.co@gmail.com</div>
      </div>
    </>
  );
}
```

- [ ] **Step 3: Commit**

```bash
git add frontend/src/print-templates/reference/invoices/InvoiceDesign3.tsx \
        frontend/src/print-templates/reference/invoices/InvoiceDesign3Blank.tsx
git commit -m "feat(print-engine): InvoiceDesign3 + Blank — data-driven via InvoicePrintData"
```

---

### Task 5: InvoiceDesign4 + InvoiceDesign4Blank — data-driven

**Files:**
- Modify: `frontend/src/print-templates/reference/invoices/InvoiceDesign4.tsx`
- Modify: `frontend/src/print-templates/reference/invoices/InvoiceDesign4Blank.tsx`

**Key facts about Design 4:**
- Header: `strip` (full-width banner with logo + company + invoice meta)
- Client row: 3 cells (customer, project, location)
- Table: decimal KWD, in-table `tfoot` with subtotal + grand total rows; has blank `empty` filler rows
- Notes section in bottom area; 2 signature boxes
- Footer bar `fbar` stays visible in blank
- Blank: `strip` hidden via `visibility: 'hidden'`

- [ ] **Step 1: Rewrite `InvoiceDesign4.tsx`**

```tsx
import logo from '../assets/almanar-logo.png';
import styles from './InvoiceDesign4.module.css';
import type { InvoicePrintData } from '../../engine/types';
import { formatKWD } from '../../utils';

interface Props { data?: InvoicePrintData; }

const SAMPLE_BODY = (
  <>
    <tr><td className={styles.n}>1</td><td className={styles.ds}>نقل أسفلت – خلطة ساخنة</td><td>درب</td><td>12</td><td>28.500</td><td className={styles.t}>342.000</td></tr>
    <tr><td className={styles.n}>2</td><td className={styles.ds}>توريد ونقل بيس كورس</td><td>طن</td><td>60</td><td>4.250</td><td className={styles.t}>255.000</td></tr>
    <tr><td className={styles.n}>3</td><td className={styles.ds}>أجور معدة فرش وتسوية</td><td>يوم</td><td>3</td><td>45.000</td><td className={styles.t}>135.000</td></tr>
    {[...Array(6)].map((_, i) => <tr key={i} className={styles.empty}><td className={styles.n}>&nbsp;</td><td></td><td></td><td></td><td></td><td></td></tr>)}
  </>
);

export default function InvoiceDesign4({ data }: Props) {
  const grandTotal = data ? data.totalDinars + data.totalFils / 1000 : null;
  const fillerCount = data ? Math.max(0, 6 - data.lineItems.length) : 0;

  return (
    <>
      <div className={styles.page}>
        <div className={styles.strip}>
          <div className={styles['s-logo']}><img src={logo} /></div>
          <div className={styles['s-name']}>
            <div className={styles.a}>شركة المنار الدولية ذ.م.م</div>
            <div className={styles.b}>لإنشاء وإصلاح الطرق والشوارع والأرصفة ومستلزمات الطرق — رأس المال ٥٠٠،٠٠٠ د.ك</div>
            <div className={styles.c}>AL MANAR AL DUWALIYA CO. L.L.C</div>
          </div>
          <div className={styles['s-meta']}>
            <div className={styles.mh}>فاتورة / INVOICE</div>
            <div className={styles.mr}><b>رقم</b><span>{data ? data.invoiceNumber : 'INV-2026-0142'}</span></div>
            <div className={styles.mr}><b>التاريخ</b><span>{data ? data.date : '20 / 06 / 2026'}</span></div>
          </div>
        </div>
        <div className={styles.clientrow}>
          <div className={styles.cell}><b>العميل:</b> {data ? data.customerName : 'مصنع الخليج للأسفلت ذ.م.م'}</div>
          <div className={styles.cell}><b>المشروع:</b> {data ? (data.projectName ?? '') : 'توريد ونقل أسفلت – عقد شهري'}</div>
          <div className={styles.cell}><b>الموقع:</b> {data ? '' : 'منطقة الشعيبة الصناعية – الكويت'}</div>
        </div>
        <table>
          <thead>
            <tr>
              <th className={styles.n}>م</th><th>البيان / Description</th><th>الوحدة</th>
              <th>الكمية</th><th>سعر الوحدة (د.ك)</th><th>القيمة (د.ك)</th>
            </tr>
          </thead>
          <tbody>
            {data
              ? <>
                  {data.lineItems.map((item, i) => (
                    <tr key={i}>
                      <td className={styles.n}>{item.number}</td>
                      <td className={styles.ds}>{item.descriptionAr}</td>
                      <td>{item.unit}</td>
                      <td>{item.quantity}</td>
                      <td>{formatKWD(item.unitPrice)}</td>
                      <td className={styles.t}>{formatKWD(item.total)}</td>
                    </tr>
                  ))}
                  {Array.from({ length: fillerCount }).map((_, i) => (
                    <tr key={`f${i}`} className={styles.empty}><td className={styles.n}>&nbsp;</td><td></td><td></td><td></td><td></td><td></td></tr>
                  ))}
                </>
              : SAMPLE_BODY
            }
          </tbody>
          <tfoot>
            <tr>
              <td className={styles.lab} colSpan={5}>المجموع الفرعي</td>
              <td className={styles.val}>{grandTotal !== null ? formatKWD(grandTotal) : '732.000'}</td>
            </tr>
            <tr className={styles.grand}>
              <td colSpan={5} style={{ textAlign: 'right', paddingRight: '3.5mm' }}>الإجمالي النهائي (د.ك)</td>
              <td className={styles.val}>{grandTotal !== null ? formatKWD(grandTotal) : '732.000'}</td>
            </tr>
          </tfoot>
        </table>
        <div className={styles.words}>
          <b>المبلغ كتابةً: </b>
          {data ? data.totalInWords : 'سبعمائة واثنان وثلاثون ديناراً كويتياً لا غير'}
        </div>
        <div className={styles.bottom}>
          <div className={styles.terms}>
            <div className={styles.h}>شروط الدفع</div>
            <div className={styles.b}>السداد خلال 30 يوماً من تاريخ الفاتورة.</div>
            <div className={styles.h} style={{ marginTop: '4mm' }}>ملاحظات</div>
            <div className={styles.b} style={{ minHeight: '16mm' }}>{data?.notes ?? ''}</div>
          </div>
          <div className={styles.sign}>
            <div className={styles.sbox}><div className={styles.h}>المحاسبة</div><div className={styles.b}></div></div>
            <div className={styles.sbox}><div className={styles.h}>المسؤول / الختم</div><div className={styles.b}></div></div>
          </div>
        </div>
        <div className={styles.fbar}>هاتف 99333820 / 94404401 &nbsp;•&nbsp; واتساب 98777887 &nbsp;•&nbsp; Manar.int.co@gmail.com</div>
      </div>
    </>
  );
}
```

- [ ] **Step 2: Rewrite `InvoiceDesign4Blank.tsx`**

Same as Design 4 but `strip` → `style={{ visibility: 'hidden' }}`.

```tsx
import logo from '../assets/almanar-logo.png';
import styles from './InvoiceDesign4.module.css';
import type { InvoicePrintData } from '../../engine/types';
import { formatKWD } from '../../utils';

interface Props { data?: InvoicePrintData; }

const SAMPLE_BODY = (
  <>
    <tr><td className={styles.n}>1</td><td className={styles.ds}>نقل أسفلت – خلطة ساخنة</td><td>درب</td><td>12</td><td>28.500</td><td className={styles.t}>342.000</td></tr>
    <tr><td className={styles.n}>2</td><td className={styles.ds}>توريد ونقل بيس كورس</td><td>طن</td><td>60</td><td>4.250</td><td className={styles.t}>255.000</td></tr>
    <tr><td className={styles.n}>3</td><td className={styles.ds}>أجور معدة فرش وتسوية</td><td>يوم</td><td>3</td><td>45.000</td><td className={styles.t}>135.000</td></tr>
    {[...Array(6)].map((_, i) => <tr key={i} className={styles.empty}><td className={styles.n}>&nbsp;</td><td></td><td></td><td></td><td></td><td></td></tr>)}
  </>
);

export default function InvoiceDesign4Blank({ data }: Props) {
  const grandTotal = data ? data.totalDinars + data.totalFils / 1000 : null;
  const fillerCount = data ? Math.max(0, 6 - data.lineItems.length) : 0;

  return (
    <>
      <div className={styles.page}>
        <div className={styles.strip} style={{ visibility: 'hidden' }}>
          <div className={styles['s-logo']}><img src={logo} /></div>
          <div className={styles['s-name']}>
            <div className={styles.a}>شركة المنار الدولية ذ.م.م</div>
            <div className={styles.b}>لإنشاء وإصلاح الطرق والشوارع والأرصفة ومستلزمات الطرق — رأس المال ٥٠٠،٠٠٠ د.ك</div>
            <div className={styles.c}>AL MANAR AL DUWALIYA CO. L.L.C</div>
          </div>
          <div className={styles['s-meta']}>
            <div className={styles.mh}>فاتورة / INVOICE</div>
            <div className={styles.mr}><b>رقم</b><span>{data ? data.invoiceNumber : 'INV-2026-0142'}</span></div>
            <div className={styles.mr}><b>التاريخ</b><span>{data ? data.date : '20 / 06 / 2026'}</span></div>
          </div>
        </div>
        <div className={styles.clientrow}>
          <div className={styles.cell}><b>العميل:</b> {data ? data.customerName : 'مصنع الخليج للأسفلت ذ.م.م'}</div>
          <div className={styles.cell}><b>المشروع:</b> {data ? (data.projectName ?? '') : 'توريد ونقل أسفلت – عقد شهري'}</div>
          <div className={styles.cell}><b>الموقع:</b> {data ? '' : 'منطقة الشعيبة الصناعية – الكويت'}</div>
        </div>
        <table>
          <thead>
            <tr>
              <th className={styles.n}>م</th><th>البيان / Description</th><th>الوحدة</th>
              <th>الكمية</th><th>سعر الوحدة (د.ك)</th><th>القيمة (د.ك)</th>
            </tr>
          </thead>
          <tbody>
            {data
              ? <>
                  {data.lineItems.map((item, i) => (
                    <tr key={i}>
                      <td className={styles.n}>{item.number}</td>
                      <td className={styles.ds}>{item.descriptionAr}</td>
                      <td>{item.unit}</td>
                      <td>{item.quantity}</td>
                      <td>{formatKWD(item.unitPrice)}</td>
                      <td className={styles.t}>{formatKWD(item.total)}</td>
                    </tr>
                  ))}
                  {Array.from({ length: fillerCount }).map((_, i) => (
                    <tr key={`f${i}`} className={styles.empty}><td className={styles.n}>&nbsp;</td><td></td><td></td><td></td><td></td><td></td></tr>
                  ))}
                </>
              : SAMPLE_BODY
            }
          </tbody>
          <tfoot>
            <tr>
              <td className={styles.lab} colSpan={5}>المجموع الفرعي</td>
              <td className={styles.val}>{grandTotal !== null ? formatKWD(grandTotal) : '732.000'}</td>
            </tr>
            <tr className={styles.grand}>
              <td colSpan={5} style={{ textAlign: 'right', paddingRight: '3.5mm' }}>الإجمالي النهائي (د.ك)</td>
              <td className={styles.val}>{grandTotal !== null ? formatKWD(grandTotal) : '732.000'}</td>
            </tr>
          </tfoot>
        </table>
        <div className={styles.words}>
          <b>المبلغ كتابةً: </b>
          {data ? data.totalInWords : 'سبعمائة واثنان وثلاثون ديناراً كويتياً لا غير'}
        </div>
        <div className={styles.bottom}>
          <div className={styles.terms}>
            <div className={styles.h}>شروط الدفع</div>
            <div className={styles.b}>السداد خلال 30 يوماً من تاريخ الفاتورة.</div>
            <div className={styles.h} style={{ marginTop: '4mm' }}>ملاحظات</div>
            <div className={styles.b} style={{ minHeight: '16mm' }}>{data?.notes ?? ''}</div>
          </div>
          <div className={styles.sign}>
            <div className={styles.sbox}><div className={styles.h}>المحاسبة</div><div className={styles.b}></div></div>
            <div className={styles.sbox}><div className={styles.h}>المسؤول / الختم</div><div className={styles.b}></div></div>
          </div>
        </div>
        <div className={styles.fbar}>هاتف 99333820 / 94404401 &nbsp;•&nbsp; واتساب 98777887 &nbsp;•&nbsp; Manar.int.co@gmail.com</div>
      </div>
    </>
  );
}
```

- [ ] **Step 3: Commit**

```bash
git add frontend/src/print-templates/reference/invoices/InvoiceDesign4.tsx \
        frontend/src/print-templates/reference/invoices/InvoiceDesign4Blank.tsx
git commit -m "feat(print-engine): InvoiceDesign4 + Blank — data-driven via InvoicePrintData"
```

---

### Task 6: InvoiceDesign5 + InvoiceDesign5Blank — data-driven

**Files:**
- Modify: `frontend/src/print-templates/reference/invoices/InvoiceDesign5.tsx`
- Modify: `frontend/src/print-templates/reference/invoices/InvoiceDesign5Blank.tsx`

**Key facts about Design 5:**
- Header: `hdr` — 3 columns: EN left, logo+title center, AR right (bilateral layout)
- Meta row: invoice#, date, customer + 2nd meta row for project/location
- Table: decimal KWD, has `e` class blank filler rows, no number column
- Belt: total-in-words (left) + totals (right)
- Sign row: 3 signature blocks (no footer bar)
- Blank: `hdr` hidden via `visibility: 'hidden'`

- [ ] **Step 1: Rewrite `InvoiceDesign5.tsx`**

```tsx
import logo from '../assets/almanar-logo.png';
import styles from './InvoiceDesign5.module.css';
import type { InvoicePrintData } from '../../engine/types';
import { formatKWD, formatKWDAr } from '../../utils';

interface Props { data?: InvoicePrintData; }

const SAMPLE_BODY = (
  <>
    <tr><td className={styles.ds}>نقل أسفلت – خلطة ساخنة</td><td>درب</td><td>12</td><td>28.500</td><td className={styles.t}>342.000</td></tr>
    <tr><td className={styles.ds}>توريد ونقل بيس كورس</td><td>طن</td><td>60</td><td>4.250</td><td className={styles.t}>255.000</td></tr>
    <tr><td className={styles.ds}>أجور معدة فرش وتسوية</td><td>يوم</td><td>3</td><td>45.000</td><td className={styles.t}>135.000</td></tr>
    {[...Array(5)].map((_, i) => <tr key={i} className={styles.e}><td></td><td></td><td></td><td></td><td></td></tr>)}
  </>
);

export default function InvoiceDesign5({ data }: Props) {
  const grandTotal = data ? data.totalDinars + data.totalFils / 1000 : null;
  const fillerCount = data ? Math.max(0, 5 - data.lineItems.length) : 0;

  return (
    <>
      <div className={styles.page}>
        <div className={styles.hdr}>
          <div className={styles.hL}>
            <div className={styles['en-n']}>Al Manar Al Duwaliya Co. <span style={{ fontSize: '7pt' }}>L.L.C</span></div>
            <div className={styles['en-t']}>For construction &amp; maintenance of roads, streets, pavements and road supplies</div>
            <div className={styles['en-c']}>Tel: 99333820 / 94404401<br />WhatsApp: 98777887<br />Manar.int.co@gmail.com</div>
          </div>
          <div className={styles.hC}>
            <img className={styles.logo} src={logo} />
            <div className={styles.title}>
              <div className={styles.a}>فاتورة نقداً / بالحساب</div>
              <div className={styles.b}>Cash / Credit Invoice</div>
            </div>
          </div>
          <div className={styles.hR}>
            <div className={styles['ar-n']}>شركة المنار الدولية ذ.م.م</div>
            <div className={styles['ar-t']}>لإنشاء وإصلاح الطرق والشوارع والأرصفة ومستلزمات الطرق</div>
            <div className={styles['ar-c']}>هاتف: 99333820 / 94404401<br />واتساب: 98777887<br />رأس المال المدفوع ٥٠٠،٠٠٠ د.ك</div>
          </div>
        </div>
        <div className={styles.rule}></div>
        <div className={styles.meta}>
          <div className={styles.c}><b>رقم الفاتورة:</b> {data ? data.invoiceNumber : 'INV-2026-0142'}</div>
          <div className={styles.c}><b>التاريخ:</b> {data ? data.date : '20 / 06 / 2026'}</div>
          <div className={`${styles.c} ${styles.full}`}><b>المطلوب من السادة:</b> {data ? data.customerName : 'مصنع الخليج للأسفلت ذ.م.م'}</div>
        </div>
        <div className={styles.meta} style={{ borderTop: 'none' }}>
          <div className={`${styles.c} ${styles.full}`}><b>المشروع:</b> {data ? (data.projectName ?? '') : 'توريد ونقل أسفلت – عقد شهري'}</div>
          <div className={`${styles.c} ${styles.full}`}><b>موقع المشروع:</b> {data ? '' : 'منطقة الشعيبة الصناعية – الكويت'}</div>
        </div>
        <table>
          <thead>
            <tr>
              <th className={styles.ds}>البيان / Description</th><th>الوحدة</th>
              <th>الكمية</th><th>سعر الوحدة (د.ك)</th><th>القيمة (د.ك)</th>
            </tr>
          </thead>
          <tbody>
            {data
              ? <>
                  {data.lineItems.map((item, i) => (
                    <tr key={i}>
                      <td className={styles.ds}>{item.descriptionAr}</td>
                      <td>{item.unit}</td>
                      <td>{item.quantity}</td>
                      <td>{formatKWD(item.unitPrice)}</td>
                      <td className={styles.t}>{formatKWD(item.total)}</td>
                    </tr>
                  ))}
                  {Array.from({ length: fillerCount }).map((_, i) => (
                    <tr key={`f${i}`} className={styles.e}><td></td><td></td><td></td><td></td><td></td></tr>
                  ))}
                </>
              : SAMPLE_BODY
            }
          </tbody>
        </table>
        <div className={styles.belt}>
          <div className={styles.words}>
            <b>المبلغ كتابةً:</b><br />
            {data ? data.totalInWords : 'سبعمائة واثنان وثلاثون ديناراً كويتياً لا غير'}
          </div>
          <div className={styles.tot}>
            <div className={styles.r}><b>المجموع الفرعي</b><span>{grandTotal !== null ? formatKWDAr(grandTotal) : '732.000 د.ك'}</span></div>
            <div className={styles.g}><span>الإجمالي النهائي</span><span>{grandTotal !== null ? formatKWDAr(grandTotal) : '732.000 د.ك'}</span></div>
          </div>
        </div>
        <div className={styles.secrow}>
          <div className={styles.sec}>
            <div className={styles.h}>شروط الدفع</div>
            <div className={styles.b}>السداد خلال 30 يوماً من تاريخ الفاتورة.</div>
          </div>
          <div className={styles.sec}>
            <div className={styles.h}>ملاحظات</div>
            <div className={styles.b} style={{ minHeight: '16mm' }}>{data?.notes ?? ''}</div>
          </div>
        </div>
        <div className={styles.sign}>
          <div className={styles.s}><div className={styles.lbl}>المحاسبة</div><div className={styles.ln}>التوقيع</div></div>
          <div className={styles.s}><div className={styles.lbl}>الختم الرسمي</div><div className={styles.ln}>&nbsp;</div></div>
          <div className={styles.s}><div className={styles.lbl}>المسؤول</div><div className={styles.ln}>التوقيع</div></div>
        </div>
      </div>
    </>
  );
}
```

- [ ] **Step 2: Rewrite `InvoiceDesign5Blank.tsx`**

Identical to Design 5 but `hdr` → `style={{ visibility: 'hidden' }}`.

```tsx
import logo from '../assets/almanar-logo.png';
import styles from './InvoiceDesign5.module.css';
import type { InvoicePrintData } from '../../engine/types';
import { formatKWD, formatKWDAr } from '../../utils';

interface Props { data?: InvoicePrintData; }

const SAMPLE_BODY = (
  <>
    <tr><td className={styles.ds}>نقل أسفلت – خلطة ساخنة</td><td>درب</td><td>12</td><td>28.500</td><td className={styles.t}>342.000</td></tr>
    <tr><td className={styles.ds}>توريد ونقل بيس كورس</td><td>طن</td><td>60</td><td>4.250</td><td className={styles.t}>255.000</td></tr>
    <tr><td className={styles.ds}>أجور معدة فرش وتسوية</td><td>يوم</td><td>3</td><td>45.000</td><td className={styles.t}>135.000</td></tr>
    {[...Array(5)].map((_, i) => <tr key={i} className={styles.e}><td></td><td></td><td></td><td></td><td></td></tr>)}
  </>
);

export default function InvoiceDesign5Blank({ data }: Props) {
  const grandTotal = data ? data.totalDinars + data.totalFils / 1000 : null;
  const fillerCount = data ? Math.max(0, 5 - data.lineItems.length) : 0;

  return (
    <>
      <div className={styles.page}>
        <div className={styles.hdr} style={{ visibility: 'hidden' }}>
          <div className={styles.hL}>
            <div className={styles['en-n']}>Al Manar Al Duwaliya Co. <span style={{ fontSize: '7pt' }}>L.L.C</span></div>
            <div className={styles['en-t']}>For construction &amp; maintenance of roads, streets, pavements and road supplies</div>
            <div className={styles['en-c']}>Tel: 99333820 / 94404401<br />WhatsApp: 98777887<br />Manar.int.co@gmail.com</div>
          </div>
          <div className={styles.hC}>
            <img className={styles.logo} src={logo} />
            <div className={styles.title}>
              <div className={styles.a}>فاتورة نقداً / بالحساب</div>
              <div className={styles.b}>Cash / Credit Invoice</div>
            </div>
          </div>
          <div className={styles.hR}>
            <div className={styles['ar-n']}>شركة المنار الدولية ذ.م.م</div>
            <div className={styles['ar-t']}>لإنشاء وإصلاح الطرق والشوارع والأرصفة ومستلزمات الطرق</div>
            <div className={styles['ar-c']}>هاتف: 99333820 / 94404401<br />واتساب: 98777887<br />رأس المال المدفوع ٥٠٠،٠٠٠ د.ك</div>
          </div>
        </div>
        <div className={styles.rule}></div>
        <div className={styles.meta}>
          <div className={styles.c}><b>رقم الفاتورة:</b> {data ? data.invoiceNumber : 'INV-2026-0142'}</div>
          <div className={styles.c}><b>التاريخ:</b> {data ? data.date : '20 / 06 / 2026'}</div>
          <div className={`${styles.c} ${styles.full}`}><b>المطلوب من السادة:</b> {data ? data.customerName : 'مصنع الخليج للأسفلت ذ.م.م'}</div>
        </div>
        <div className={styles.meta} style={{ borderTop: 'none' }}>
          <div className={`${styles.c} ${styles.full}`}><b>المشروع:</b> {data ? (data.projectName ?? '') : 'توريد ونقل أسفلت – عقد شهري'}</div>
          <div className={`${styles.c} ${styles.full}`}><b>موقع المشروع:</b> {data ? '' : 'منطقة الشعيبة الصناعية – الكويت'}</div>
        </div>
        <table>
          <thead>
            <tr>
              <th className={styles.ds}>البيان / Description</th><th>الوحدة</th>
              <th>الكمية</th><th>سعر الوحدة (د.ك)</th><th>القيمة (د.ك)</th>
            </tr>
          </thead>
          <tbody>
            {data
              ? <>
                  {data.lineItems.map((item, i) => (
                    <tr key={i}>
                      <td className={styles.ds}>{item.descriptionAr}</td>
                      <td>{item.unit}</td>
                      <td>{item.quantity}</td>
                      <td>{formatKWD(item.unitPrice)}</td>
                      <td className={styles.t}>{formatKWD(item.total)}</td>
                    </tr>
                  ))}
                  {Array.from({ length: fillerCount }).map((_, i) => (
                    <tr key={`f${i}`} className={styles.e}><td></td><td></td><td></td><td></td><td></td></tr>
                  ))}
                </>
              : SAMPLE_BODY
            }
          </tbody>
        </table>
        <div className={styles.belt}>
          <div className={styles.words}>
            <b>المبلغ كتابةً:</b><br />
            {data ? data.totalInWords : 'سبعمائة واثنان وثلاثون ديناراً كويتياً لا غير'}
          </div>
          <div className={styles.tot}>
            <div className={styles.r}><b>المجموع الفرعي</b><span>{grandTotal !== null ? formatKWDAr(grandTotal) : '732.000 د.ك'}</span></div>
            <div className={styles.g}><span>الإجمالي النهائي</span><span>{grandTotal !== null ? formatKWDAr(grandTotal) : '732.000 د.ك'}</span></div>
          </div>
        </div>
        <div className={styles.secrow}>
          <div className={styles.sec}>
            <div className={styles.h}>شروط الدفع</div>
            <div className={styles.b}>السداد خلال 30 يوماً من تاريخ الفاتورة.</div>
          </div>
          <div className={styles.sec}>
            <div className={styles.h}>ملاحظات</div>
            <div className={styles.b} style={{ minHeight: '16mm' }}>{data?.notes ?? ''}</div>
          </div>
        </div>
        <div className={styles.sign}>
          <div className={styles.s}><div className={styles.lbl}>المحاسبة</div><div className={styles.ln}>التوقيع</div></div>
          <div className={styles.s}><div className={styles.lbl}>الختم الرسمي</div><div className={styles.ln}>&nbsp;</div></div>
          <div className={styles.s}><div className={styles.lbl}>المسؤول</div><div className={styles.ln}>التوقيع</div></div>
        </div>
      </div>
    </>
  );
}
```

- [ ] **Step 3: Commit**

```bash
git add frontend/src/print-templates/reference/invoices/InvoiceDesign5.tsx \
        frontend/src/print-templates/reference/invoices/InvoiceDesign5Blank.tsx
git commit -m "feat(print-engine): InvoiceDesign5 + Blank — data-driven via InvoicePrintData"
```

---

### Task 7: Fix engine registration — typed bridge

**Files:**
- Modify: `frontend/src/print-templates/engine/invoiceTemplates.ts`

**Why:** The `bridge(c: ComponentType)` function accepted any component regardless of prop types. Now that all 10 templates accept `{ data?: InvoicePrintData }`, replace `bridge` with a typed wrapper that enforces this contract.

- [ ] **Step 1: Replace `bridge` with `invoiceTemplate` in `engine/invoiceTemplates.ts`**

```ts
import type { ComponentType } from 'react';
import {
  InvoiceDesign1,
  InvoiceDesign1Blank,
  InvoiceDesign2,
  InvoiceDesign2Blank,
  InvoiceDesign3,
  InvoiceDesign3Blank,
  InvoiceDesign4,
  InvoiceDesign4Blank,
  InvoiceDesign5,
  InvoiceDesign5Blank,
} from '../reference/invoices';
import type { PrintTemplateComponent, PrintTemplateDefinition, InvoicePrintData } from './types';

// Typed bridge: confirms all invoice templates accept { data?: InvoicePrintData }.
// The cast from typed component to PrintTemplateComponent<unknown> is intentional —
// the registry stores a union of all categories, each with different TData.
function invoiceTemplate(c: ComponentType<{ data?: InvoicePrintData }>): PrintTemplateComponent {
  return c as unknown as PrintTemplateComponent;
}

export const invoiceTemplateDefinitions: PrintTemplateDefinition[] = [
  {
    id: 'invoice-design-1',
    category: 'invoice',
    nameAr: 'فاتورة – تصميم ١',
    nameEn: 'Invoice – Design 1',
    variant: 'original',
    language: 'bilingual',
    supports: { plainA4: true, letterhead: false },
    component: invoiceTemplate(InvoiceDesign1),
    sourceFile: 'docs/invoice_templates/html/design1.html',
  },
  {
    id: 'invoice-design-1-blank',
    category: 'invoice',
    nameAr: 'فاتورة – تصميم ١ (ترويسة مطبوعة)',
    nameEn: 'Invoice – Design 1 (Letterhead)',
    variant: 'blank-letterhead',
    language: 'bilingual',
    supports: { plainA4: false, letterhead: true },
    component: invoiceTemplate(InvoiceDesign1Blank),
    sourceFile: 'docs/invoice_templates/html/design1_blank.html',
  },
  {
    id: 'invoice-design-2',
    category: 'invoice',
    nameAr: 'فاتورة – تصميم ٢',
    nameEn: 'Invoice – Design 2',
    variant: 'original',
    language: 'bilingual',
    supports: { plainA4: true, letterhead: false },
    component: invoiceTemplate(InvoiceDesign2),
    sourceFile: 'docs/invoice_templates/html/design2.html',
  },
  {
    id: 'invoice-design-2-blank',
    category: 'invoice',
    nameAr: 'فاتورة – تصميم ٢ (ترويسة مطبوعة)',
    nameEn: 'Invoice – Design 2 (Letterhead)',
    variant: 'blank-letterhead',
    language: 'bilingual',
    supports: { plainA4: false, letterhead: true },
    component: invoiceTemplate(InvoiceDesign2Blank),
    sourceFile: 'docs/invoice_templates/html/design2_blank.html',
  },
  {
    id: 'invoice-design-3',
    category: 'invoice',
    nameAr: 'فاتورة – تصميم ٣',
    nameEn: 'Invoice – Design 3',
    variant: 'original',
    language: 'bilingual',
    supports: { plainA4: true, letterhead: false },
    component: invoiceTemplate(InvoiceDesign3),
    sourceFile: 'docs/invoice_templates/html/design3.html',
  },
  {
    id: 'invoice-design-3-blank',
    category: 'invoice',
    nameAr: 'فاتورة – تصميم ٣ (ترويسة مطبوعة)',
    nameEn: 'Invoice – Design 3 (Letterhead)',
    variant: 'blank-letterhead',
    language: 'bilingual',
    supports: { plainA4: false, letterhead: true },
    component: invoiceTemplate(InvoiceDesign3Blank),
    sourceFile: 'docs/invoice_templates/html/design3_blank.html',
  },
  {
    id: 'invoice-design-4',
    category: 'invoice',
    nameAr: 'فاتورة – تصميم ٤',
    nameEn: 'Invoice – Design 4',
    variant: 'original',
    language: 'bilingual',
    supports: { plainA4: true, letterhead: false },
    component: invoiceTemplate(InvoiceDesign4),
    sourceFile: 'docs/invoice_templates/html/design4.html',
  },
  {
    id: 'invoice-design-4-blank',
    category: 'invoice',
    nameAr: 'فاتورة – تصميم ٤ (ترويسة مطبوعة)',
    nameEn: 'Invoice – Design 4 (Letterhead)',
    variant: 'blank-letterhead',
    language: 'bilingual',
    supports: { plainA4: false, letterhead: true },
    component: invoiceTemplate(InvoiceDesign4Blank),
    sourceFile: 'docs/invoice_templates/html/design4_blank.html',
    notes: 'Blank variant hides .strip (header bar) instead of .head — structural equivalent.',
  },
  {
    id: 'invoice-design-5',
    category: 'invoice',
    nameAr: 'فاتورة – تصميم ٥',
    nameEn: 'Invoice – Design 5',
    variant: 'original',
    language: 'bilingual',
    supports: { plainA4: true, letterhead: false },
    component: invoiceTemplate(InvoiceDesign5),
    sourceFile: 'docs/invoice_templates/html/design5.html',
  },
  {
    id: 'invoice-design-5-blank',
    category: 'invoice',
    nameAr: 'فاتورة – تصميم ٥ (ترويسة مطبوعة)',
    nameEn: 'Invoice – Design 5 (Letterhead)',
    variant: 'blank-letterhead',
    language: 'bilingual',
    supports: { plainA4: false, letterhead: true },
    component: invoiceTemplate(InvoiceDesign5Blank),
    sourceFile: 'docs/invoice_templates/html/design5_blank.html',
  },
];
```

- [ ] **Step 2: Commit**

```bash
git add frontend/src/print-templates/engine/invoiceTemplates.ts
git commit -m "feat(print-engine): replace untyped bridge() with typed invoiceTemplate() in invoice registry"
```

---

### Task 8: Create integration helper

**Files:**
- Create: `frontend/src/print-templates/integration/invoicePreviewIntegration.ts`

**Purpose:** Localized validation warnings so `InvoicePreview.tsx` can show non-blocking alerts when important fields are missing from print data. No type-unsafe operations here (those stay in `InvoicePreview.tsx` close to where `FullInvoice` is defined).

- [ ] **Step 1: Create `integration/invoicePreviewIntegration.ts`**

```ts
import type { InvoicePrintData } from '../engine/types';

export interface PrintDataWarning {
  field: string;
  messageAr: string;
}

/**
 * Validates InvoicePrintData for common missing fields.
 * Returns non-blocking warnings — the caller decides whether to suppress printing.
 * Phase 2A: warnings are informational only; printing is never blocked.
 */
export function validateInvoicePrintData(data: InvoicePrintData): PrintDataWarning[] {
  const warnings: PrintDataWarning[] = [];
  if (!data.invoiceNumber) {
    warnings.push({ field: 'invoiceNumber', messageAr: 'رقم الفاتورة مفقود' });
  }
  if (!data.customerName) {
    warnings.push({ field: 'customerName', messageAr: 'اسم العميل / المورد مفقود' });
  }
  if (data.lineItems.length === 0) {
    warnings.push({ field: 'lineItems', messageAr: 'الفاتورة لا تحتوي على بنود' });
  }
  return warnings;
}
```

- [ ] **Step 2: Commit**

```bash
git add frontend/src/print-templates/integration/invoicePreviewIntegration.ts
git commit -m "feat(print-engine): add invoice print data validation helper"
```

---

### Task 9: Wire `InvoicePreview.tsx` to the engine

**Files:**
- Modify: `frontend/src/pages/InvoicePreview.tsx`

**What changes:**
1. Import `usePrintTemplate`, `buildInvoicePrintData`, `PrintTemplateSelector`, `ApiInvoice` from `'../print-templates'`
2. Import `validateInvoicePrintData` from integration helper
3. Add `previewMode` state and `engineWarning` state
4. Derive `printData` via `useMemo` with `buildInvoicePrintData` + try/catch
5. Call `usePrintTemplate('invoice', printData)` unconditionally (React rules)
6. Add `useEffect` that forces legacy mode when `printData` is null after data loads
7. Add mode toggle button to toolbar (disabled when engine unavailable)
8. Add `PrintTemplateSelector` to toolbar (engine mode only)
9. Add warning display banner for both engine warnings and validation warnings
10. Wrap legacy content in `<div className={previewMode === 'engine' ? 'engine-print-hide' : undefined}>`
11. Add engine template render section (screen + print, engine mode only)
12. Add `@media print` CSS rule for `.engine-print-hide`

The complete diff for `InvoicePreview.tsx` — add these imports after existing imports:

```ts
import { useMemo, useEffect } from 'react'; // add to existing import
import {
  usePrintTemplate,
  buildInvoicePrintData,
  PrintTemplateSelector,
} from '../print-templates';
import type { ApiInvoice } from '../print-templates';
import { validateInvoicePrintData } from '../print-templates/integration/invoicePreviewIntegration';
```

Note: `useEffect` and `useMemo` must be added to the existing React import line if not already present.

Add these state declarations inside `InvoicePreview()` (after existing state, before `useEffect` for data loading):

```ts
const [previewMode, setPreviewMode] = useState<'legacy' | 'engine'>('legacy');
const [engineWarning, setEngineWarning] = useState('');

// FullInvoice is a structural superset of ApiInvoice. The adapter only reads:
// invoiceNumber, issueDate, customer?.name, supplier?.name, total, items,
// notes, contract?.asphaltPlant. Extra fields (createdAt, updatedAt, contract.code)
// are safely ignored. Localized cast — do not propagate as unknown elsewhere.
const printData = useMemo(() => {
  if (!data) return undefined;
  try {
    return buildInvoicePrintData(data as unknown as ApiInvoice);
  } catch {
    return undefined;
  }
}, [data]);

const { resolvedTemplate, profile, setProfile } = usePrintTemplate('invoice', printData);

const printWarnings = useMemo(
  () => (printData ? validateInvoicePrintData(printData) : []),
  [printData],
);
```

Add this `useEffect` after the existing `useEffect` blocks:

```ts
useEffect(() => {
  if (data && !printData && previewMode === 'engine') {
    setPreviewMode('legacy');
    setEngineWarning('فشل تحميل بيانات الطباعة — تم التبديل إلى العرض التقليدي');
  }
}, [data, printData, previewMode]);
```

In the toolbar `no-print` div, add the engine toggle and selector after the existing buttons:

```tsx
{/* Engine toggle */}
<button
  type="button"
  className={`btn ${previewMode === 'engine' ? '' : 'secondary'}`}
  onClick={() => setPreviewMode(m => m === 'legacy' ? 'engine' : 'legacy')}
  disabled={!printData}
  title={!printData ? 'بيانات الطباعة غير متوفرة' : undefined}
>
  {previewMode === 'engine' ? '🖨️ محرك القوالب' : '🖨️ العرض التقليدي'}
</button>

{/* Template selector (engine mode only) */}
{previewMode === 'engine' && (
  <PrintTemplateSelector
    category="invoice"
    profile={profile}
    onSelect={setProfile}
  />
)}
```

Add warning banner after the toolbar div (inside `no-print`):

```tsx
{(engineWarning || printWarnings.length > 0) && (
  <div className="no-print" style={{
    background: '#fef3c7', border: '1px solid #fbbf24', borderRadius: 8,
    padding: '8px 12px', marginBottom: 12, fontSize: 13, color: '#92400e',
  }}>
    {engineWarning && <div>⚠️ {engineWarning}</div>}
    {printWarnings.map(w => <div key={w.field}>⚠️ {w.messageAr}</div>)}
  </div>
)}
```

Add `.engine-print-hide` rule to the existing `<style>` block (inside the `@media print` section):

```css
.engine-print-hide { display: none !important; }
```

Wrap the legacy content (the invoice details JSX from Section 1 through the signature area) in a single div:

```tsx
<div className={previewMode === 'engine' ? 'engine-print-hide' : undefined}>
  {/* ... all existing legacy JSX: print-only header, Section 1-6, notes, signature ... */}
</div>
```

Add the engine template render block AFTER the legacy content wrapper, but BEFORE the closing outer div:

```tsx
{/* Engine template render (screen + print when engine mode active) */}
{previewMode === 'engine' && printData && (() => {
  const EngineTemplate = resolvedTemplate.component as React.ComponentType<{ data?: typeof printData }>;
  return (
    <div style={{ marginTop: 16 }}>
      <EngineTemplate data={printData} />
    </div>
  );
})()}
```

- [ ] **Step 1: Apply all changes to `InvoicePreview.tsx` as described above**

(Add imports, add state + hooks, add engine toggle button, add template selector, add warning banner, add print CSS rule, wrap legacy content, add engine template block)

- [ ] **Step 2: Commit**

```bash
git add frontend/src/pages/InvoicePreview.tsx
git commit -m "feat(print-engine): wire InvoicePreview to engine — toggle, selector, template render, fallback"
```

---

### Task 10: Full validation

- [ ] **Step 1: Frontend TypeScript**

```bash
cd frontend && npx tsc --noEmit
```
Expected: 0 errors.

- [ ] **Step 2: Backend TypeScript**

```bash
cd backend && npx tsc --noEmit
```
Expected: 0 errors (no backend files changed — this is a regression check).

- [ ] **Step 3: Electron TypeScript**

```bash
cd /c/Users/hhajj/Claude/Projects/manarERP && npx tsc -p electron/tsconfig.json --noEmit
```
Expected: 0 errors (no electron files changed — regression check).

- [ ] **Step 4: Prisma validate**

```bash
npx prisma validate --schema=backend/prisma/schema.prisma
```
Expected: schema valid (no schema changes).

- [ ] **Step 5: Backend tests**

```bash
cd backend && npm test
```
Expected: 424/424 pass (no backend changes).

- [ ] **Step 6: Frontend tests**

```bash
cd frontend && npm test
```
Expected: all pass including the 2 new `projectName` adapter tests.

- [ ] **Step 7: Build backend**

```bash
npm run build:back
```
Expected: compiles cleanly.

- [ ] **Step 8: Build frontend**

```bash
npm run build:front
```
Expected: 983+ modules transformed, 0 errors.

- [ ] **Step 9: Fix any TypeScript errors found**

If TypeScript reports errors, fix them before proceeding. Common issues:
- Missing `useMemo`/`useEffect` in React import → add to the destructured import
- `resolvedTemplate.component` type mismatch → use `as React.ComponentType<{ data?: InvoicePrintData }>`

- [ ] **Step 10: Final commit after all checks pass**

```bash
git add -p  # stage any fix-up changes
git commit -m "fix(print-engine): TypeScript and validation fixes post-integration"
```

Only create this commit if there were fixes. If all checks passed cleanly after Task 9, skip this commit.
