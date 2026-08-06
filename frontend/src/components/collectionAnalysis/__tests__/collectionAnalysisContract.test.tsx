// @vitest-environment jsdom
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { useState } from 'react';
import { describe, it, expect } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import AnalysisTable, { type AnalysisColumn } from '../../financialAnalysis/AnalysisTable';

/* ════════════════════════════════════════════════════════════════════════════
   عقود «تحليل التحصيلات» الدائمة.

   ثلاثة أشياء يسهل كسرها بصمت لاحقًا، ولا يكشفها فحص الأنواع:

     ١) **توسيع الصفّ إضافة خالصة**: جدول بلا `expandable` يجب أن يبقى كما كان
        حرفيًا — لا عمود زائد ولا صفّ زائد. أي انحدار هنا يمسّ **كل** جداول مركز
        التحليل المالي القائمة، لا هذه الصفحة وحدها.

     ٢) **الصفحة مخفيّة عن الشريط الجانبي**: المواصفة تنصّ على أنها تُفتح من داخل
        مركز التحليل المالي وحده. إضافتها إلى `modules.tsx` سهوًا تكسر ذلك بلا
        أي خطأ ظاهر.

     ٣) **لا رسوم بيانية**: جداول فقط. استيراد مكتبة رسم في أي ملف من ملفات
        الصفحة يخالف المواصفة نصًّا.
   ════════════════════════════════════════════════════════════════════════════ */

const SRC = resolve(__dirname, '../../..');

interface Row { year: number; amount: number }

const ROWS: Row[] = [
  { year: 2023, amount: 1000 },
  { year: 2024, amount: 2000 },
];

const COLUMNS: AnalysisColumn<Row>[] = [
  { key: 'year', label: 'السنة', render: (r) => String(r.year) },
  { key: 'amount', label: 'المبلغ', align: 'end', render: (r) => String(r.amount), total: '3000' },
];

/* ── ١) التوسيع إضافة خالصة ─────────────────────────────────────────────── */

describe('AnalysisTable — توسيع الصفّ إضافة اختيارية لا تمسّ الجداول القائمة', () => {
  it('بلا `expandable`: لا عمود تحكّم ولا صفّ تفصيل — الجدول كما كان حرفيًا', () => {
    render(<AnalysisTable columns={COLUMNS} rows={ROWS} rowKey={(r) => String(r.year)} showTotals />);

    expect(document.querySelectorAll('thead th')).toHaveLength(COLUMNS.length);
    expect(document.querySelectorAll('tfoot td')).toHaveLength(COLUMNS.length);
    expect(document.querySelectorAll('tbody tr')).toHaveLength(ROWS.length);
    expect(document.querySelector('.fac-expand-col')).toBeNull();
    expect(document.querySelector('.fac-row-toggle')).toBeNull();
  });

  it('مع `expandable`: عمود تحكّم واحد في المقدّمة، ورأس ومجاميع متّسقان معه', () => {
    render(
      <AnalysisTable
        columns={COLUMNS}
        rows={ROWS}
        rowKey={(r) => String(r.year)}
        showTotals
        expandable={{ isExpanded: () => false, onToggle: () => {}, render: () => <span>تفصيل</span> }}
      />,
    );

    expect(document.querySelectorAll('thead th')).toHaveLength(COLUMNS.length + 1);
    expect(document.querySelectorAll('tfoot td')).toHaveLength(COLUMNS.length + 1);
    expect(document.querySelectorAll('.fac-row-toggle')).toHaveLength(ROWS.length);
  });

  it('الضغط يفتح صفّ التفصيل بامتداد عرض الجدول كاملًا', () => {
    function Harness() {
      const [open, setOpen] = useState<number | null>(null);
      return (
        <AnalysisTable
          columns={COLUMNS}
          rows={ROWS}
          rowKey={(r) => String(r.year)}
          expandable={{
            isExpanded: (r) => open === r.year,
            onToggle: (r) => setOpen((v) => (v === r.year ? null : r.year)),
            render: (r) => <span>تفاصيل {r.year}</span>,
          }}
        />
      );
    }
    render(<Harness />);

    expect(screen.queryByText('تفاصيل 2023')).toBeNull();

    const toggles = document.querySelectorAll('.fac-row-toggle');
    fireEvent.click(toggles[0]);

    expect(screen.getByText('تفاصيل 2023')).toBeTruthy();
    const detail = document.querySelector('.fac-row-detail td');
    expect(detail?.getAttribute('colspan')).toBe(String(COLUMNS.length + 1));

    // الطيّ يعيد الجدول إلى حالته الأولى.
    fireEvent.click(document.querySelectorAll('.fac-row-toggle')[0]);
    expect(screen.queryByText('تفاصيل 2023')).toBeNull();
  });

  it('زرّ التوسيع لا يُشعل نقر الصفّ — وإلا فُتح تفصيلان معًا', () => {
    let rowClicks = 0;
    let toggles = 0;
    render(
      <AnalysisTable
        columns={COLUMNS}
        rows={ROWS}
        rowKey={(r) => String(r.year)}
        onRowClick={() => { rowClicks += 1; }}
        expandable={{
          isExpanded: () => false,
          onToggle: () => { toggles += 1; },
          render: () => <span>تفصيل</span>,
        }}
      />,
    );

    fireEvent.click(document.querySelectorAll('.fac-row-toggle')[0]);
    expect(toggles).toBe(1);
    expect(rowClicks).toBe(0);
  });

  it('حالة الفتح مُعلَنة لقارئ الشاشة على الزرّ نفسه', () => {
    render(
      <AnalysisTable
        columns={COLUMNS}
        rows={ROWS}
        rowKey={(r) => String(r.year)}
        expandable={{
          isExpanded: (r) => r.year === 2024,
          onToggle: () => {},
          render: () => <span>تفصيل</span>,
          label: 'عرض الفواتير',
        }}
      />,
    );
    const buttons = Array.from(document.querySelectorAll('.fac-row-toggle'));
    expect(buttons[0].getAttribute('aria-expanded')).toBe('false');
    expect(buttons[1].getAttribute('aria-expanded')).toBe('true');
    expect(buttons[0].getAttribute('aria-label')).toBe('عرض الفواتير');
  });
});

/* ── ٢) الصفحة مخفيّة، وتُفتح من مركز التحليل المالي وحده ───────────────── */

describe('تحليل التحصيلات — التنقّل', () => {
  const modulesSrc = readFileSync(resolve(SRC, 'config/modules.tsx'), 'utf8');
  const appSrc = readFileSync(resolve(SRC, 'App.tsx'), 'utf8');
  const facSrc = readFileSync(resolve(SRC, 'pages/FinancialAnalysisCenter.tsx'), 'utf8');

  it('لا تظهر في الشريط الجانبي', () => {
    expect(modulesSrc).not.toContain('collection-analysis');
  });

  it('لها مسار مسجَّل ومحمَّل كسولًا كبقيّة الصفحات', () => {
    expect(appSrc).toContain("lazy(() => import('./pages/CollectionAnalysis'))");
    expect(appSrc).toContain('<Route path="/collection-analysis"');
  });

  it('مركز التحليل المالي يحمل قسم البوّابة وزرّه', () => {
    expect(facSrc).toContain('fac.section.collection_analysis');
    expect(facSrc).toContain('fac.action.open_collection_analysis');
    expect(facSrc).toContain("navigate('/collection-analysis')");
  });

  it('قسم البوّابة خارج جذر الطباعة — زرّ تنقّل لا محتوى تقرير', () => {
    const reportRoot = facSrc.slice(facSrc.indexOf('data-print-report'), facSrc.indexOf('CollectionAnalysisEntrySection />}'));
    expect(reportRoot).not.toContain('<CollectionAnalysisEntrySection />');
  });
});

/* ── ٣) لا رسوم بيانية ──────────────────────────────────────────────────── */

describe('تحليل التحصيلات — جداول فقط', () => {
  const files = [
    'pages/CollectionAnalysis.tsx',
    'components/collectionAnalysis/CollectionAnalysisKpis.tsx',
    'components/collectionAnalysis/CollectionSummaryTable.tsx',
    'components/collectionAnalysis/CollectionTransferTable.tsx',
    'components/collectionAnalysis/CollectionMatrixTable.tsx',
    'components/collectionAnalysis/OutstandingTable.tsx',
    'components/collectionAnalysis/CollectionPerformanceTable.tsx',
    'components/collectionAnalysis/CollectionDrawer.tsx',
    'components/collectionAnalysis/CollectionInvoiceList.tsx',
  ];

  it('لا مكتبة رسم مستوردة في أي ملف من ملفات الصفحة', () => {
    for (const file of files) {
      const src = readFileSync(resolve(SRC, file), 'utf8');
      expect(src, file).not.toMatch(/from ['"](recharts|chart\.js|react-chartjs-2)/);
    }
  });

  it('الصفحة ترث ورقة أنماط مركز التحليل المالي بدل نسخها', () => {
    const src = readFileSync(resolve(SRC, 'pages/CollectionAnalysis.tsx'), 'utf8');
    expect(src).toContain("import './FinancialAnalysisCenter.css'");
    expect(src).toContain('fac-page');
  });
});
