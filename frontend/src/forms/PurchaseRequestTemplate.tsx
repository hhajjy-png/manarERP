import { CSSProperties } from 'react';
import {
  COMPANY_NAME,
  sectionHeader,
  tableWrapper,
  labelCell,
  valueCell,
  fmtDate,
  fmtDateEn,
  blankLine,
  longTextCell,
} from './shared/formStyles';
import { getPriorityLabelEn } from './shared/contractTranslations';
import ApprovalSection from './shared/ApprovalSection';

// ─── Exported interfaces ──────────────────────────────────────────────────────
// Future integration notes:
//   requesterName/department → replace with employeeId: number | null
//   items                   → replace with inventoryItemId references
// Template and print layout do NOT need to change for these replacements.

export interface PurchaseRequestItem {
  id: string;
  description: string;
  qty: string;
  unit: string;
  specification: string;
}

export type PriorityLevel = '' | 'LOW' | 'MEDIUM' | 'HIGH' | 'URGENT';

export interface PurchaseRequestPrintFields {
  requestNumber: string;
  date: string;
  requiredDate: string;
  requesterName: string;
  department: string;
  priority: PriorityLevel;
  reason: string;
  items: PurchaseRequestItem[];
  notes: string;
  requestedBy: string;
  reviewedBy: string;
  approvedBy: string;
  lang?: 'ar' | 'en';
}

// ─── Labels ───────────────────────────────────────────────────────────────────

const PRIORITY_AR: Record<string, string> = {
  LOW: 'منخفضة',
  MEDIUM: 'متوسطة',
  HIGH: 'عالية',
  URGENT: 'عاجل',
};

function priorityLabel(key: string, lang: 'ar' | 'en'): string {
  if (lang === 'en') return getPriorityLabelEn(key);
  return PRIORITY_AR[key] ?? key;
}

// ─── Table styles ─────────────────────────────────────────────────────────────

const th: CSSProperties = {
  background: '#1d4e6f',
  color: '#fff',
  fontWeight: 700,
  fontSize: 12,
  padding: '5px 8px',
  border: '1px solid #bfd6e3',
  WebkitPrintColorAdjust: 'exact',
  printColorAdjust: 'exact',
};

const td: CSSProperties = {
  padding: '4px 8px',
  fontSize: 12,
  border: '1px solid #e2e8f0',
  verticalAlign: 'top',
};

// ─── InfoRow helper ───────────────────────────────────────────────────────────

function InfoRow({ label, value }: { label: string; value: string }) {
  return (
    <div style={{ display: 'flex', borderBottom: '1px solid #e2e8f0' }}>
      <div style={{ ...labelCell, width: 130, flexShrink: 0 }}>{label}</div>
      <div style={valueCell}>
        {value.trim() ? value : <span style={blankLine} />}
      </div>
    </div>
  );
}

// ─── Component ────────────────────────────────────────────────────────────────

const COMPANY_NAME_EN =
  'ALAMANAR ALDAWLIYA FOR STREET CONSTRUCTION & MAINTENANCE CO., W.L.L.';

interface Props {
  printFields: PurchaseRequestPrintFields;
  lang?: 'ar' | 'en';
}

export default function PurchaseRequestTemplate({ printFields: pf, lang = 'ar' }: Props) {
  const isAr = lang !== 'en';

  // ── English render path ───────────────────────────────────────────────────
  if (!isAr) {
    return (
      <div style={{ direction: 'ltr' }}>
        <p style={{ fontSize: 13, marginBottom: 14, lineHeight: 1.7 }}>
          <strong>{COMPANY_NAME_EN}</strong> — Internal Purchase Request
        </p>

        <div style={{ ...tableWrapper, marginBottom: 10 }}>
          <div style={sectionHeader}>Request Details</div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr' }}>
            <InfoRow label="Request No." value={pf.requestNumber} />
            <InfoRow label="Date" value={fmtDateEn(pf.date)} />
            <InfoRow label="Required Date" value={fmtDateEn(pf.requiredDate)} />
            <InfoRow label="Priority" value={pf.priority ? priorityLabel(pf.priority, 'en') : '—'} />
          </div>
        </div>

        <div style={{ ...tableWrapper, marginBottom: 10 }}>
          <div style={sectionHeader}>Requester Information</div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr' }}>
            <InfoRow label="Requester Name" value={pf.requesterName} />
            <InfoRow label="Department" value={pf.department} />
            <div style={{ gridColumn: '1 / -1', display: 'flex', borderBottom: '1px solid #e2e8f0' }}>
              <div style={{ ...labelCell, width: 130, flexShrink: 0 }}>Reason</div>
              <div style={{ ...valueCell, ...longTextCell }}>{pf.reason.trim() ? pf.reason : <span style={blankLine} />}</div>
            </div>
          </div>
        </div>

        <div style={{ ...tableWrapper, marginBottom: 10 }}>
          <div style={sectionHeader}>Requested Items</div>
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead>
              <tr>
                <th style={{ ...th, width: 30 }}>#</th>
                <th style={th}>Description</th>
                <th style={{ ...th, width: 60, textAlign: 'center' }}>Qty</th>
                <th style={{ ...th, width: 70, textAlign: 'center' }}>Unit</th>
                <th style={th}>Specification</th>
              </tr>
            </thead>
            <tbody>
              {pf.items.map((item, i) => (
                <tr key={item.id}>
                  <td style={{ ...td, textAlign: 'center', color: '#64748b' }}>{i + 1}</td>
                  <td style={{ ...td, ...longTextCell }}>{item.description.trim() || <span style={blankLine} />}</td>
                  <td style={{ ...td, textAlign: 'center' }}>{item.qty || '—'}</td>
                  <td style={{ ...td, textAlign: 'center' }}>{item.unit || '—'}</td>
                  <td style={{ ...td, ...longTextCell }}>{item.specification.trim() || <span style={blankLine} />}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {pf.notes.trim() && (
          <div style={{ ...tableWrapper, marginBottom: 10 }}>
            <div style={sectionHeader}>Notes</div>
            <div style={{ padding: '6px 12px', fontSize: 12, ...longTextCell }}>{pf.notes}</div>
          </div>
        )}

        <div style={{ ...tableWrapper, marginTop: 10 }}>
          <div style={sectionHeader}>Approvals</div>
          <div style={{ padding: '8px 12px' }}>
            <ApprovalSection lang="en" />
          </div>
        </div>
      </div>
    );
  }

  // ── Arabic render path ────────────────────────────────────────────────────
  return (
    <div style={{ direction: 'rtl' }}>
      <p style={{ fontSize: 13, marginBottom: 14, lineHeight: 1.7 }}>
        <strong>{COMPANY_NAME}</strong> — طلب شراء داخلي
      </p>

      <div style={{ ...tableWrapper, marginBottom: 10 }}>
        <div style={sectionHeader}>تفاصيل الطلب</div>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr' }}>
          <InfoRow label="رقم الطلب" value={pf.requestNumber} />
          <InfoRow label="التاريخ" value={fmtDate(pf.date)} />
          <InfoRow label="التاريخ المطلوب" value={fmtDate(pf.requiredDate)} />
          <InfoRow label="الأولوية" value={pf.priority ? priorityLabel(pf.priority, 'ar') : '—'} />
        </div>
      </div>

      <div style={{ ...tableWrapper, marginBottom: 10 }}>
        <div style={sectionHeader}>بيانات مقدم الطلب</div>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr' }}>
          <InfoRow label="اسم مقدم الطلب" value={pf.requesterName} />
          <InfoRow label="القسم" value={pf.department} />
          <div style={{ gridColumn: '1 / -1', display: 'flex', borderBottom: '1px solid #e2e8f0' }}>
            <div style={{ ...labelCell, width: 130, flexShrink: 0 }}>سبب الطلب</div>
            <div style={{ ...valueCell, ...longTextCell }}>{pf.reason.trim() ? pf.reason : <span style={blankLine} />}</div>
          </div>
        </div>
      </div>

      <div style={{ ...tableWrapper, marginBottom: 10 }}>
        <div style={sectionHeader}>المواد المطلوبة</div>
        <table style={{ width: '100%', borderCollapse: 'collapse' }}>
          <thead>
            <tr>
              <th style={{ ...th, width: 30 }}>#</th>
              <th style={th}>الوصف</th>
              <th style={{ ...th, width: 60, textAlign: 'center' }}>الكمية</th>
              <th style={{ ...th, width: 70, textAlign: 'center' }}>الوحدة</th>
              <th style={th}>المواصفات</th>
            </tr>
          </thead>
          <tbody>
            {pf.items.map((item, i) => (
              <tr key={item.id}>
                <td style={{ ...td, textAlign: 'center', color: '#64748b' }}>{i + 1}</td>
                <td style={{ ...td, ...longTextCell }}>{item.description.trim() || <span style={blankLine} />}</td>
                <td style={{ ...td, textAlign: 'center' }}>{item.qty || '—'}</td>
                <td style={{ ...td, textAlign: 'center' }}>{item.unit || '—'}</td>
                <td style={{ ...td, ...longTextCell }}>{item.specification.trim() || <span style={blankLine} />}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {pf.notes.trim() && (
        <div style={{ ...tableWrapper, marginBottom: 10 }}>
          <div style={sectionHeader}>ملاحظات</div>
          <div style={{ padding: '6px 12px', fontSize: 12, ...longTextCell }}>{pf.notes}</div>
        </div>
      )}

      <div style={{ ...tableWrapper, marginTop: 10 }}>
        <div style={sectionHeader}>الاعتماد</div>
        <div style={{ padding: '8px 12px' }}>
          <ApprovalSection lang="ar" />
        </div>
      </div>
    </div>
  );
}
