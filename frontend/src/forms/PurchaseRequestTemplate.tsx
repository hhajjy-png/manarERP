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
} from './shared/formStyles';

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
}

// ─── Labels ───────────────────────────────────────────────────────────────────

const PRIORITY_AR: Record<string, string> = {
  LOW: 'منخفضة',
  MEDIUM: 'متوسطة',
  HIGH: 'عالية',
  URGENT: 'عاجل',
};

const PRIORITY_EN: Record<string, string> = {
  LOW: 'Low',
  MEDIUM: 'Medium',
  HIGH: 'High',
  URGENT: 'Urgent',
};

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

// ─── ApprovalCell helpers ─────────────────────────────────────────────────────

const sigLine: CSSProperties = {
  borderBottom: '1px solid #64748b',
  display: 'inline-block',
  width: 120,
  marginBottom: 2,
};

function ApprovalCellAr({ label, name }: { label: string; name: string }) {
  return (
    <div style={{ flex: 1, padding: '8px 12px', textAlign: 'center', borderInlineEnd: '1px solid #e2e8f0' }}>
      <div style={{ fontSize: 11, fontWeight: 700, color: '#1d4e6f', marginBottom: 6 }}>{label}</div>
      <div style={{ fontSize: 12, marginBottom: 4 }}>{name.trim() ? name : <span style={sigLine} />}</div>
      <div style={{ fontSize: 11, color: '#64748b' }}>التوقيع: <span style={{ ...sigLine, width: 80 }} /></div>
    </div>
  );
}

function ApprovalCellEn({ label, name }: { label: string; name: string }) {
  return (
    <div style={{ flex: 1, padding: '8px 12px', textAlign: 'center', borderInlineEnd: '1px solid #e2e8f0' }}>
      <div style={{ fontSize: 11, fontWeight: 700, color: '#1d4e6f', marginBottom: 6 }}>{label}</div>
      <div style={{ fontSize: 12, marginBottom: 4 }}>{name.trim() ? name : <span style={sigLine} />}</div>
      <div style={{ fontSize: 11, color: '#64748b' }}>Signature: <span style={{ ...sigLine, width: 80 }} /></div>
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
            <InfoRow label="Priority" value={pf.priority ? (PRIORITY_EN[pf.priority] ?? pf.priority) : '—'} />
          </div>
        </div>

        <div style={{ ...tableWrapper, marginBottom: 10 }}>
          <div style={sectionHeader}>Requester Information</div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr' }}>
            <InfoRow label="Requester Name" value={pf.requesterName} />
            <InfoRow label="Department" value={pf.department} />
            <div style={{ gridColumn: '1 / -1', display: 'flex', borderBottom: '1px solid #e2e8f0' }}>
              <div style={{ ...labelCell, width: 130, flexShrink: 0 }}>Reason</div>
              <div style={valueCell}>{pf.reason.trim() ? pf.reason : <span style={blankLine} />}</div>
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
                  <td style={td}>{item.description.trim() || <span style={blankLine} />}</td>
                  <td style={{ ...td, textAlign: 'center' }}>{item.qty || '—'}</td>
                  <td style={{ ...td, textAlign: 'center' }}>{item.unit || '—'}</td>
                  <td style={td}>{item.specification.trim() || <span style={blankLine} />}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {pf.notes.trim() && (
          <div style={{ ...tableWrapper, marginBottom: 10 }}>
            <div style={sectionHeader}>Notes</div>
            <div style={{ padding: '6px 12px', fontSize: 12 }}>{pf.notes}</div>
          </div>
        )}

        <div style={{ ...tableWrapper, marginTop: 10 }}>
          <div style={sectionHeader}>Approvals</div>
          <div style={{ display: 'flex' }}>
            <ApprovalCellEn label="Requested By" name={pf.requestedBy} />
            <ApprovalCellEn label="Reviewed By" name={pf.reviewedBy} />
            <ApprovalCellEn label="Approved By" name={pf.approvedBy} />
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
          <InfoRow label="الأولوية" value={pf.priority ? (PRIORITY_AR[pf.priority] ?? pf.priority) : '—'} />
        </div>
      </div>

      <div style={{ ...tableWrapper, marginBottom: 10 }}>
        <div style={sectionHeader}>بيانات مقدم الطلب</div>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr' }}>
          <InfoRow label="اسم مقدم الطلب" value={pf.requesterName} />
          <InfoRow label="القسم" value={pf.department} />
          <div style={{ gridColumn: '1 / -1', display: 'flex', borderBottom: '1px solid #e2e8f0' }}>
            <div style={{ ...labelCell, width: 130, flexShrink: 0 }}>سبب الطلب</div>
            <div style={valueCell}>{pf.reason.trim() ? pf.reason : <span style={blankLine} />}</div>
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
                <td style={td}>{item.description.trim() || <span style={blankLine} />}</td>
                <td style={{ ...td, textAlign: 'center' }}>{item.qty || '—'}</td>
                <td style={{ ...td, textAlign: 'center' }}>{item.unit || '—'}</td>
                <td style={td}>{item.specification.trim() || <span style={blankLine} />}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {pf.notes.trim() && (
        <div style={{ ...tableWrapper, marginBottom: 10 }}>
          <div style={sectionHeader}>ملاحظات</div>
          <div style={{ padding: '6px 12px', fontSize: 12 }}>{pf.notes}</div>
        </div>
      )}

      <div style={{ ...tableWrapper, marginTop: 10 }}>
        <div style={sectionHeader}>الاعتماد</div>
        <div style={{ display: 'flex' }}>
          <ApprovalCellAr label="طلب بواسطة" name={pf.requestedBy} />
          <ApprovalCellAr label="مراجعة بواسطة" name={pf.reviewedBy} />
          <ApprovalCellAr label="اعتماد بواسطة" name={pf.approvedBy} />
        </div>
      </div>
    </div>
  );
}
