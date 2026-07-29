import { Prisma } from '@prisma/client';
import { prisma } from '../../config/database';
import { AppError } from '../../core/errors/AppError';
import { ReportInput } from '../../shared/services/reportEngine/excel.service';
import { formatCurrency } from '../../shared/utils/currency';
import { formatDateRange, formatDisplayDate } from '../../shared/utils/dateDisplay';
import { translateInvoiceStatusAr } from '../../shared/utils/arabicLabels';
import { expenseCategoryAr, expenseStatusAr } from '../../shared/utils/expenseLabels';
import { ARABIC_MONTHS } from '../../core/utils/arabicMonths';
import { monthWindowsBetween, endOfDay } from '../../core/utils/dateWindows';
import { roundMoney } from '../../shared/utils/money';
import { getMonthlyOperationalProfitAndLoss } from '../../shared/services/operational.reporting';

const num = (n: number | null | undefined) => Number(n ?? 0);
// مُعاد استخدامها من وحدة النقود القانونية — لا تعريف ثانٍ لمنطق التقريب (كان
// `Math.round(n*1000)/1000` محليًا، بلا تصحيح Number.EPSILON، فيتعارض مع تقريب دفتر
// الأستاذ عند نقاط تعادل نصف الفلس). نفس اسم/توقيع الدالة فلا تتغيّر مواضع الاستدعاء.
const round3 = roundMoney;
// مُعاد استخدامها من dateDisplay.ts القانونية بدل toLocaleDateString('ar') المحلية
// (كانت تُخرج أرقامًا هندية شرقية تخالف معيار الأرقام الغربية المعتمد في التطبيق).
// يحافظ على عقد null القديم (سلسلة فارغة) — التنسيق الفعلي فقط هو ما تغيّر.
const dateAr = (d: Date | null) => (d ? formatDisplayDate(d) : '');
/** يحوّل وسم الشهر `YYYY-MM` إلى صيغة العرض `MM/YYYY` — بلا أسماء أشهر. */
const monthYearLabel = (ymLabel: string): string => {
  const [y, m] = ymLabel.split('-');
  return `${m}/${y}`;
};

function dateWhere(from?: string, to?: string, field = 'date'): Record<string, unknown> {
  if (!from && !to) return {};
  const range: Record<string, Date> = {};
  if (from) range.gte = new Date(from);
  if (to) range.lte = endOfDay(new Date(to));
  return { [field]: range };
}

interface ReportQuery {
  from?: string;
  to?: string;
  customerId?: string;
  employeeId?: string;
  status?: string;
  direction?: string;
  month?: string;
  year?: string;
  /** إضافي (تطابق فلاتر صفحة الفواتير): شهر/سنة الحساب وبحث نصي حر. */
  billingMonth?: string;
  billingYear?: string;
  search?: string;
  /** إضافي (تطابق فلاتر صفحة المصروفات): التصنيف والمورد. */
  category?: string;
  supplierId?: string;
}

/** يبني محتوى التقرير (أعمدة + صفوف) حسب النوع. التنسيق (PDF/Excel) منفصل. */
export class ReportsService {
  async build(type: string, query: ReportQuery): Promise<ReportInput> {
    switch (type) {
      case 'customers':
        return this.customers(query);
      case 'contracts':
        return this.contracts(query);
      case 'invoices':
        return this.invoices(query);
      case 'expenses':
        return this.expenses(query);
      case 'equipment':
        return this.equipment(query);
      case 'employees':
        return this.employees(query);
      case 'payroll':
        return this.payroll(query);
      case 'attendance':
        return this.attendance(query);
      case 'profit-loss':
        return this.profitLoss(query);
      case 'suppliers':
        return this.suppliers(query);
      case 'prices':
        return this.prices(query);
      case 'customer-statement':
        return this.customerStatement(query);
      case 'receivables-aging':
        return this.receivablesAging(query);
      case 'customer-balances':
        return this.customerBalances(query);
      case 'collections-summary':
        return this.collectionsSummary(query);
      default:
        throw AppError.badRequest('نوع تقرير غير معروف');
    }
  }

  private async customers(q: ReportQuery): Promise<ReportInput> {
    const where: Prisma.CustomerWhereInput = { isArchived: false };
    if (q.status) where.type = q.status; // status filter reused for customer type (GOVERNMENT/PRIVATE)
    const rows = await prisma.customer.findMany({
      where,
      orderBy: { code: 'asc' },
      include: { _count: { select: { contracts: true } } },
    });
    return {
      title: 'تقرير العملاء',
      subtitle: `إجمالي العملاء: ${rows.length}`,
      columns: [
        { header: 'الرقم', key: 'code', width: 14 },
        { header: 'الاسم', key: 'name', width: 34 },
        { header: 'النوع', key: 'type', width: 14 },
        { header: 'الهاتف', key: 'phone', width: 18 },
        { header: 'المسؤول', key: 'contactName', width: 22 },
        { header: 'العقود', key: 'contracts', width: 12 },
      ],
      rows: rows.map((c) => ({
        code: c.code,
        name: c.name,
        type: c.type === 'GOVERNMENT' ? 'حكومي' : 'خاص',
        phone: c.phone ?? '',
        contactName: c.contactName ?? '',
        contracts: c._count.contracts,
      })),
    };
  }

  private async contracts(q: ReportQuery): Promise<ReportInput> {
    const where: Prisma.ContractWhereInput = {};
    if (q.customerId) where.customerId = Number(q.customerId);
    if (q.status) where.status = q.status;
    const rows = await prisma.contract.findMany({
      where,
      orderBy: { code: 'asc' },
      include: { customer: { select: { name: true } } },
    });
    const totalMonthly = round3(rows.reduce((s, c) => s + num(c.monthlyTransportValue), 0));
    return {
      title: 'تقرير العقود',
      subtitle: `عدد العقود: ${rows.length} — إجمالي النقل الشهري: ${formatCurrency(totalMonthly)}`,
      columns: [
        { header: 'رقم العقد', key: 'code', width: 16 },
        { header: 'العميل', key: 'customer', width: 24 },
        { header: 'مصنع الأسفلت', key: 'plant', width: 28 },
        { header: 'مكان العقد', key: 'location', width: 24 },
        { header: 'قيمة النقل الشهري', key: 'monthly', width: 20, numFmt: '#,##0.000', format: 'currency' },
        { header: 'الحالة', key: 'status', width: 14 },
      ],
      rows: rows.map((c) => ({
        code: c.code,
        customer: c.customer?.name ?? '',
        plant: c.asphaltPlant,
        location: c.location ?? '',
        monthly: num(c.monthlyTransportValue),
        status: c.status,
      })),
      totalsRow: { plant: 'الإجمالي', monthly: totalMonthly },
    };
  }

  private async invoices(q: ReportQuery): Promise<ReportInput> {
    const where: Prisma.InvoiceWhereInput = {
      ...dateWhere(q.from, q.to, 'issueDate') as Prisma.InvoiceWhereInput,
    };
    if (q.customerId) where.customerId = Number(q.customerId);
    if (q.status) where.status = q.status;
    if (q.direction) where.direction = q.direction as 'SALES' | 'PURCHASE';
    if (q.billingMonth) where.billingMonth = Number(q.billingMonth);
    if (q.billingYear) where.billingYear = Number(q.billingYear);
    if (q.search) {
      where.OR = [
        { invoiceNumber: { contains: q.search } },
        { number: { contains: q.search } },
      ];
    }
    const rows = await prisma.invoice.findMany({
      where,
      orderBy: { issueDate: 'desc' },
      include: {
        customer: { select: { name: true } },
        supplier: { select: { name: true } },
      },
    });
    const total = round3(rows.reduce((s, i) => s + num(i.total), 0));
    const paid = round3(rows.reduce((s, i) => s + num(i.paidAmount), 0));
    const remaining = round3(total - paid);
    return {
      title: 'تقرير الفواتير',
      subtitle: `العدد: ${rows.length} — الإجمالي: ${formatCurrency(total)} — المحصّل: ${formatCurrency(paid)} — المتبقي: ${formatCurrency(remaining)}`,
      columns: [
        { header: 'رقم الفاتورة', key: 'invoiceNumber', width: 22 },
        { header: 'نوع الفاتورة', key: 'invoiceType', width: 20 },
        { header: 'الاتجاه', key: 'direction', width: 16 },
        { header: 'الجهة', key: 'party', width: 28 },
        { header: 'شهر الحساب', key: 'billingPeriod', width: 18 },
        { header: 'تاريخ الإصدار', key: 'issueDate', width: 16, type: 'date' },
        { header: 'الإجمالي', key: 'total', width: 16, numFmt: '#,##0.000', format: 'currency' },
        { header: 'المسدّد', key: 'paid', width: 16, numFmt: '#,##0.000', format: 'currency' },
        { header: 'المتبقي', key: 'remaining', width: 16, numFmt: '#,##0.000', format: 'currency' },
        { header: 'الحالة', key: 'status', width: 16 },
        { header: 'ملاحظات', key: 'notes', width: 28 },
      ],
      rows: rows.map((i) => ({
        invoiceNumber: i.invoiceNumber,
        invoiceType: i.invoiceType ?? '',
        direction: i.direction === 'SALES' ? 'نقليات عميل' : i.direction === 'PURCHASE' ? 'مشتريات مورد' : i.direction,
        party: i.customer?.name ?? i.supplier?.name ?? '',
        billingPeriod: i.billingMonth && i.billingYear
          ? `${ARABIC_MONTHS[(i.billingMonth as number) - 1]} ${i.billingYear}`
          : dateAr(i.issueDate),
        // Raw passthrough (already fetched above, no extra query) — not a display column,
        // used by the invoices print layout to group its customer summary by accounting month.
        billingMonth: i.billingMonth ?? null,
        billingYear: i.billingYear ?? null,
        issueDate: i.issueDate,
        total: num(i.total),
        paid: num(i.paidAmount),
        remaining: round3(num(i.total) - num(i.paidAmount)),
        status: translateInvoiceStatusAr(i.status),
        notes: i.notes ?? '',
      })),
      totalsRow: { party: 'الإجمالي', total, paid, remaining },
    };
  }

  private async expenses(q: ReportQuery): Promise<ReportInput> {
    const where: Prisma.ExpenseWhereInput = {
      ...dateWhere(q.from, q.to) as Prisma.ExpenseWhereInput,
    };
    if (q.status) where.status = q.status;
    if (q.category) where.category = q.category;
    if (q.supplierId) where.supplierId = Number(q.supplierId);
    if (q.billingMonth) where.billingMonth = Number(q.billingMonth);
    if (q.billingYear) where.billingYear = Number(q.billingYear);
    if (q.search) {
      where.OR = [
        { description: { contains: q.search } },
        { code: { contains: q.search } },
        { supplierName: { contains: q.search } },
      ];
    }
    const rows = await prisma.expense.findMany({
      where,
      orderBy: { date: 'desc' },
      include: {
        contract: { select: { asphaltPlant: true } },
        supplier: { select: { name: true } },
      },
    });
    const total = round3(rows.reduce((s, e) => s + num(e.amount), 0));
    return {
      title: 'تقرير المصروفات',
      subtitle: `العدد: ${rows.length} — الإجمالي: ${formatCurrency(total)}`,
      columns: [
        { header: 'الرقم', key: 'code', width: 16 },
        { header: 'التصنيف', key: 'category', width: 18 },
        { header: 'الوصف', key: 'description', width: 32 },
        { header: 'المورد', key: 'supplier', width: 22 },
        { header: 'العقد', key: 'contract', width: 22 },
        { header: 'المبلغ', key: 'amount', width: 16, numFmt: '#,##0.000', format: 'currency' },
        { header: 'التاريخ', key: 'date', width: 16 },
        { header: 'شهر الحساب', key: 'billingPeriod', width: 18 },
        { header: 'الحالة', key: 'status', width: 16 },
        { header: 'ملاحظات', key: 'notes', width: 26 },
      ],
      rows: rows.map((e) => ({
        code: e.code,
        category: expenseCategoryAr(e.category),
        description: e.description,
        supplier: e.supplier?.name ?? (e.supplierName ?? ''),
        contract: e.contract?.asphaltPlant ?? '',
        amount: num(e.amount),
        date: dateAr(e.date),
        billingPeriod: e.billingMonth && e.billingYear
          ? `${ARABIC_MONTHS[(e.billingMonth as number) - 1]} ${e.billingYear}`
          : '',
        status: expenseStatusAr(e.status),
        notes: e.notes ?? '',
      })),
      totalsRow: { description: 'الإجمالي', amount: total },
    };
  }

  private async equipment(q: ReportQuery): Promise<ReportInput> {
    const where: Prisma.EquipmentWhereInput = {};
    if (q.status) where.status = q.status;
    const rows = await prisma.equipment.findMany({ where, orderBy: { code: 'asc' } });
    return {
      title: 'تقرير المعدّات والآليات',
      subtitle: `عدد المركبات: ${rows.length}`,
      // «النوع» → «الشكل»: تسمية عرض فقط، الحقل نفسه (`type`) بلا تغيير.
      columns: [
        { header: 'رقم المعدة', key: 'code', width: 14 },
        { header: 'الشكل', key: 'type', width: 16 },
        { header: 'اسم المالك', key: 'owner', width: 22 },
        { header: 'اسم السائق', key: 'driver', width: 22 },
        { header: 'رقم اللوحة', key: 'plate', width: 16 },
        { header: 'رقم القاعدة', key: 'chassis', width: 20 },
        { header: 'الصنع', key: 'make', width: 16 },
        { header: 'سنة الصنع', key: 'makeYear', width: 12 },
        { header: 'اللون', key: 'color', width: 12 },
        { header: 'انتهاء الدفتر', key: 'expiry', width: 16 },
        { header: 'الحالة', key: 'status', width: 12 },
      ],
      rows: rows.map((e) => ({
        code: e.code,
        type: e.type,
        owner: e.ownerName ?? '',
        driver: e.driverName ?? '',
        plate: e.plateNumber ?? '',
        chassis: e.chassisNumber ?? '',
        make: e.manufacturer ?? '',
        makeYear: e.manufactureYear ?? '',
        color: e.color ?? '',
        expiry: e.registrationExpiry ? new Date(e.registrationExpiry).toLocaleDateString('ar') : '',
        status: e.status === 'WORKING' ? 'تعمل' : 'لا تعمل',
      })),
    };
  }

  private async employees(q: ReportQuery): Promise<ReportInput> {
    const where: Prisma.EmployeeWhereInput = {};
    if (q.status) where.status = q.status;
    const rows = await prisma.employee.findMany({ where, orderBy: { code: 'asc' } });
    return {
      title: 'تقرير الموظفين',
      subtitle: `عدد الموظفين: ${rows.length}`,
      columns: [
        { header: 'الاسم (عربي)', key: 'name', width: 26 },
        { header: 'الاسم (إنجليزي)', key: 'nameEn', width: 26 },
        { header: 'الرقم المدني', key: 'civil', width: 18 },
        { header: 'المهنة', key: 'job', width: 20 },
        { header: 'الجنسية', key: 'nat', width: 14 },
        { header: 'انتهاء الإقامة', key: 'residency', width: 16 },
        { header: 'انتهاء الجواز', key: 'passport', width: 16 },
        { header: 'الراتب الشهري', key: 'salary', width: 16, numFmt: '#,##0.000', format: 'currency' },
        { header: 'تاريخ التعيين', key: 'hireDate', width: 16 },
        { header: 'الحالة', key: 'status', width: 14 },
      ],
      rows: rows.map((e) => ({
        name: e.fullName,
        nameEn: e.fullNameEn ?? '',
        civil: e.civilId ?? '',
        job: e.jobTitle ?? '',
        nat: e.nationality ?? '',
        residency: e.residencyExpiry ? new Date(e.residencyExpiry).toLocaleDateString('ar') : '',
        passport: e.passportExpiry ? new Date(e.passportExpiry).toLocaleDateString('ar') : '',
        salary: num(e.salary),
        hireDate: e.hireDate ? new Date(e.hireDate).toISOString().slice(0, 10) : '',
        status: e.status,
      })),
    };
  }

  private async payroll(q: ReportQuery): Promise<ReportInput> {
    const where: Prisma.PayrollWhereInput = {};
    if (q.month) where.month = Number(q.month);
    if (q.year) where.year = Number(q.year);
    if (!q.year && q.from) where.year = new Date(q.from).getFullYear();
    if (q.employeeId) where.employeeId = Number(q.employeeId);
    if (q.status) where.status = q.status;
    const rows = await prisma.payroll.findMany({
      where,
      orderBy: [{ year: 'desc' }, { month: 'desc' }],
      include: { employee: { select: { fullName: true, code: true } } },
    });
    const totalNet = round3(rows.reduce((s, p) => s + num(p.netSalary), 0));
    return {
      title: 'تقرير الرواتب',
      subtitle: `عدد الكشوف: ${rows.length} — إجمالي الصافي: ${formatCurrency(totalNet)}`,
      columns: [
        { header: 'رمز الموظف', key: 'employeeCode', width: 14 },
        { header: 'الموظف', key: 'name', width: 30 },
        { header: 'الشهر', key: 'month', width: 8 },
        { header: 'السنة', key: 'year', width: 8 },
        { header: 'الأساسي', key: 'baseSalary', width: 16, numFmt: '#,##0.000', format: 'currency' },
        { header: 'بدلات', key: 'totalAllowances', width: 14, numFmt: '#,##0.000', format: 'currency' },
        { header: 'إضافي', key: 'overtimeAmount', width: 14, numFmt: '#,##0.000', format: 'currency' },
        { header: 'خصومات', key: 'totalDeductions', width: 14, numFmt: '#,##0.000', format: 'currency' },
        { header: 'سلف', key: 'totalAdvances', width: 14, numFmt: '#,##0.000', format: 'currency' },
        { header: 'الإجمالي', key: 'grossSalary', width: 16, numFmt: '#,##0.000', format: 'currency' },
        { header: 'الصافي', key: 'netSalary', width: 16, numFmt: '#,##0.000', format: 'currency' },
        { header: 'الحالة', key: 'status', width: 14 },
        { header: 'ملاحظات', key: 'notes', width: 24 },
      ],
      rows: rows.map((p) => ({
        employeeCode: p.employee.code,
        name: p.employee.fullName,
        month: p.month,
        year: p.year,
        baseSalary: num(p.snapshotBaseSalary || p.baseSalary),
        totalAllowances: num(p.totalAllowances || p.totalBonus),
        overtimeAmount: num(p.overtimeAmount),
        totalDeductions: num(p.totalDeductions),
        totalAdvances: num(p.totalAdvances),
        grossSalary: num(p.grossSalary),
        netSalary: num(p.netSalary),
        status: p.status,
        notes: p.notes ?? '',
      })),
      totalsRow: { employeeCode: '', name: 'الإجمالي', netSalary: totalNet },
    };
  }

  private async attendance(q: ReportQuery): Promise<ReportInput> {
    const where: Prisma.AttendanceWhereInput = {
      ...dateWhere(q.from, q.to) as Prisma.AttendanceWhereInput,
    };
    if (q.employeeId) where.employeeId = Number(q.employeeId);
    if (q.status) where.status = q.status;
    const rows = await prisma.attendance.findMany({
      where,
      orderBy: [{ date: 'desc' }],
      include: { employee: { select: { fullName: true } } },
    });
    const statusAr: Record<string, string> = {
      PRESENT: 'حاضر', ABSENT: 'غائب', LATE: 'متأخر', LEAVE: 'إجازة',
    };
    const present = rows.filter((r) => r.status === 'PRESENT').length;
    const absent = rows.filter((r) => r.status === 'ABSENT').length;
    const late = rows.filter((r) => r.status === 'LATE').length;
    return {
      title: 'تقرير الحضور والغياب',
      subtitle: `السجلات: ${rows.length} — حاضر: ${present} — غائب: ${absent} — متأخر: ${late}`,
      columns: [
        { header: 'الموظف', key: 'employee', width: 30 },
        { header: 'التاريخ', key: 'date', width: 16 },
        { header: 'وقت الدخول', key: 'checkIn', width: 14 },
        { header: 'وقت الخروج', key: 'checkOut', width: 14 },
        { header: 'ساعات العمل', key: 'hours', width: 14 },
        { header: 'الحالة', key: 'status', width: 14 },
        { header: 'ملاحظات', key: 'notes', width: 28 },
      ],
      rows: rows.map((a) => ({
        employee: a.employee.fullName,
        date: dateAr(a.date),
        checkIn: a.checkIn
          ? new Date(a.checkIn).toLocaleTimeString('ar', { hour: '2-digit', minute: '2-digit' })
          : '',
        checkOut: a.checkOut
          ? new Date(a.checkOut).toLocaleTimeString('ar', { hour: '2-digit', minute: '2-digit' })
          : '',
        hours: a.workHours != null ? Number(a.workHours).toFixed(1) : '',
        status: statusAr[a.status] ?? a.status,
        notes: a.notes ?? '',
      })),
    };
  }

  private async suppliers(_q: ReportQuery): Promise<ReportInput> {
    const rows = await prisma.supplier.findMany({
      where: { isArchived: false },
      orderBy: { code: 'asc' },
    });
    return {
      title: 'تقرير الموردين',
      subtitle: `إجمالي الموردين: ${rows.length}`,
      columns: [
        { header: 'الرقم', key: 'code', width: 14 },
        { header: 'الاسم', key: 'name', width: 34 },
        { header: 'الهاتف', key: 'phone', width: 18 },
        { header: 'البريد الإلكتروني', key: 'email', width: 28 },
        { header: 'العنوان', key: 'address', width: 28 },
        { header: 'المسؤول', key: 'contactName', width: 22 },
        { header: 'ملاحظات', key: 'notes', width: 30 },
      ],
      rows: rows.map((s) => ({
        code: s.code,
        name: s.name,
        phone: s.phone ?? '',
        email: s.email ?? '',
        address: s.address ?? '',
        contactName: s.contactName ?? '',
        notes: s.notes ?? '',
      })),
    };
  }

  private async prices(_q: ReportQuery): Promise<ReportInput> {
    const rows = await prisma.projectPrice.findMany({
      where: { isArchived: false },
      orderBy: [{ asphaltPlant: 'asc' }, { companyName: 'asc' }],
      include: { customer: { select: { name: true } } },
    });
    return {
      title: 'تقرير اتفاقيات الأسعار',
      subtitle: `إجمالي الاتفاقيات: ${rows.length}`,
      columns: [
        { header: 'العميل', key: 'customer', width: 26 },
        { header: 'مصنع الأسفلت', key: 'asphaltPlant', width: 28 },
        { header: 'اسم الشركة', key: 'companyName', width: 28 },
        { header: 'مكان العقد', key: 'contractLocation', width: 24 },
        { header: 'وحدة العقد', key: 'contractUnit', width: 14 },
        { header: 'سعر الوحدة', key: 'unitPrice', width: 16, numFmt: '#,##0.000', format: 'currency' },
      ],
      rows: rows.map((p) => ({
        customer: p.customer?.name ?? '',
        asphaltPlant: p.asphaltPlant,
        companyName: p.companyName,
        contractLocation: p.contractLocation,
        contractUnit: p.contractUnit,
        unitPrice: num(p.unitPrice),
      })),
    };
  }

  private async profitLoss(q: ReportQuery): Promise<ReportInput> {
    // السياسة الرسمية (Operational Reporting Migration — الحزمة 2): تقرير الأرباح
    // والخسائر مصدره الآن محرك التقارير التشغيلية (Invoice للإيراد، Expense المعتمد
    // للمصروف) — لا الأستاذ العام. GL يبقى دون مساس، مخصَّصًا حصريًا لدفتر اليومية/
    // دليل الحسابات/ميزان المراجعة/المراجعة المحاسبية؛ هذا التقرير الإداري لا يقرأه بعد اليوم.
    //
    // مدى الأشهر المعروضة: الفترة المختارة إن حُدِّدت بالكامل، وإلا أول/آخر تاريخ إيراد
    // أو مصروف تشغيلي فعلي (بدل أول/آخر قيد مُرحَّل سابقًا).
    let rangeStart: Date;
    let rangeEnd: Date;
    if (q.from && q.to) {
      rangeStart = new Date(q.from);
      rangeEnd = endOfDay(new Date(q.to));
    } else {
      const [invoiceBounds, expenseBounds] = await Promise.all([
        prisma.invoice.aggregate({
          where: { direction: 'SALES', status: { not: 'CANCELLED' } },
          _min: { issueDate: true },
          _max: { issueDate: true },
        }),
        prisma.expense.aggregate({
          where: { status: 'APPROVED' },
          _min: { date: true },
          _max: { date: true },
        }),
      ]);
      const mins = [invoiceBounds._min.issueDate, expenseBounds._min.date].filter(
        (d): d is Date => d != null,
      );
      const maxes = [invoiceBounds._max.issueDate, expenseBounds._max.date].filter(
        (d): d is Date => d != null,
      );
      const minBound = mins.length ? new Date(Math.min(...mins.map((d) => d.getTime()))) : null;
      const maxBound = maxes.length ? new Date(Math.max(...maxes.map((d) => d.getTime()))) : null;
      rangeStart = q.from ? new Date(q.from) : (minBound ?? new Date());
      rangeEnd = q.to ? endOfDay(new Date(q.to)) : (maxBound ?? rangeStart);
    }

    const months = monthWindowsBetween(rangeStart, rangeEnd);
    const monthly = await getMonthlyOperationalProfitAndLoss(months);

    const totalRevenue = monthly.reduce((s, m) => s + m.revenue, 0);
    const totalExpense = monthly.reduce((s, m) => s + m.expense, 0);
    const net = totalRevenue - totalExpense;

    return {
      title: 'تقرير الأرباح والخسائر',
      subtitle: q.from || q.to ? `الفترة: ${q.from ?? '—'} إلى ${q.to ?? '—'}` : 'كل الفترات',
      columns: [
        { header: 'الشهر/السنة', key: 'month', width: 16, align: 'center' },
        { header: 'إجمالي الإيرادات', key: 'revenue', width: 20, numFmt: '#,##0.000', format: 'currency', align: 'center' },
        { header: 'إجمالي المصروفات', key: 'expense', width: 20, numFmt: '#,##0.000', format: 'currency', align: 'center' },
        { header: 'الربح / الخسارة', key: 'net', width: 20, numFmt: '#,##0.000', format: 'currency', align: 'center' },
      ],
      rows: monthly.map((m) => ({
        month: monthYearLabel(m.label),
        revenue: m.revenue,
        expense: m.expense,
        net: m.net,
      })),
      totalsRow: { month: 'الإجمالي', revenue: totalRevenue, expense: totalExpense, net },
    };
  }

  private async customerStatement(q: ReportQuery): Promise<ReportInput> {
    if (!q.customerId) throw AppError.badRequest('يجب تحديد العميل');
    const cId = Number(q.customerId);

    const customer = await prisma.customer.findUnique({ where: { id: cId } });
    if (!customer) throw AppError.notFound('العميل غير موجود');

    // Opening balance = all invoiced − all paid, strictly before `from`
    let openingBalance = 0;
    if (q.from) {
      const fromDate = new Date(q.from);
      const [invBefore, paysBefore] = await Promise.all([
        prisma.invoice.aggregate({
          where: { customerId: cId, direction: 'SALES', status: { not: 'CANCELLED' }, issueDate: { lt: fromDate } },
          _sum: { total: true },
        }),
        prisma.payment.findMany({
          where: { date: { lt: fromDate }, invoice: { customerId: cId, direction: 'SALES', status: { not: 'CANCELLED' } } },
          select: { amount: true },
        }),
      ]);
      openingBalance = round3(num(invBefore._sum.total) - paysBefore.reduce((s, p) => s + num(p.amount), 0));
    }

    const [invoices, payments] = await Promise.all([
      prisma.invoice.findMany({
        where: {
          customerId: cId, direction: 'SALES', status: { not: 'CANCELLED' },
          ...dateWhere(q.from, q.to, 'issueDate') as Prisma.InvoiceWhereInput,
        },
        select: { id: true, invoiceNumber: true, issueDate: true, total: true, notes: true },
        orderBy: { issueDate: 'asc' },
      }),
      prisma.payment.findMany({
        where: {
          invoice: { customerId: cId, direction: 'SALES', status: { not: 'CANCELLED' } },
          ...dateWhere(q.from, q.to) as Prisma.PaymentWhereInput,
        },
        select: { id: true, date: true, amount: true, reference: true, notes: true, invoice: { select: { invoiceNumber: true } } },
        orderBy: { date: 'asc' },
      }),
    ]);

    type Entry = { id: number; date: Date; sortOrder: number; type: string; reference: string; description: string; debit: number; credit: number };
    const entries: Entry[] = [
      ...invoices.map((i) => ({
        id: i.id, date: i.issueDate, sortOrder: 0, type: 'فاتورة',
        reference: i.invoiceNumber, description: i.notes ?? 'فاتورة نقل',
        debit: num(i.total), credit: 0,
      })),
      ...payments.map((p) => ({
        id: p.id, date: p.date, sortOrder: 1, type: 'دفعة',
        reference: p.reference ?? p.invoice.invoiceNumber,
        description: p.notes ?? 'دفعة مقبوضة',
        debit: 0, credit: num(p.amount),
      })),
    ];
    entries.sort((a, b) => a.date.getTime() - b.date.getTime() || a.sortOrder - b.sortOrder || a.id - b.id);

    let balance = openingBalance;
    const rows = entries.map((e) => {
      balance = round3(balance + e.debit - e.credit);
      return { date: dateAr(e.date), type: e.type, reference: e.reference, description: e.description, debit: e.debit, credit: e.credit, balance };
    });

    const totalDebit = round3(entries.reduce((s, e) => s + e.debit, 0));
    const totalCredit = round3(entries.reduce((s, e) => s + e.credit, 0));
    const closingBalance = round3(openingBalance + totalDebit - totalCredit);

    return {
      title: `كشف حساب العميل — ${customer.name}`,
      subtitle: q.from || q.to
        ? `الفترة: ${formatDateRange(q.from, q.to)} | الرصيد الافتتاحي: ${formatCurrency(openingBalance)}`
        : `إجمالي المعاملات: ${entries.length}`,
      columns: [
        { header: 'التاريخ', key: 'date', width: 14 },
        { header: 'النوع', key: 'type', width: 10 },
        { header: 'المرجع', key: 'reference', width: 26 },
        { header: 'البيان', key: 'description', width: 34 },
        { header: 'مدين', key: 'debit', width: 16, numFmt: '#,##0.000', format: 'currency' },
        { header: 'دائن', key: 'credit', width: 16, numFmt: '#,##0.000', format: 'currency' },
        { header: 'الرصيد', key: 'balance', width: 18, numFmt: '#,##0.000', format: 'currency' },
      ],
      rows,
      totalsRow: { reference: 'الإجمالي', debit: totalDebit, credit: totalCredit, balance: closingBalance },
    };
  }

  private async receivablesAging(q: ReportQuery): Promise<ReportInput> {
    const asOfDate = q.to ? endOfDay(new Date(q.to)) : new Date();

    // الرصيد اللحظي: لا نستبعد PAID (فاتورة سُدِّدت بعد التاريخ المرجعي كانت مستحقة فيه).
    // الإلغاء يُستبعَد فقط (لا تاريخ إلغاء في النموذج — قيد موثَّق).
    const agingWhere: Prisma.InvoiceWhereInput = {
      direction: 'SALES',
      status: { not: 'CANCELLED' },
      issueDate: { lte: asOfDate },
    };
    if (q.customerId) {
      agingWhere.customerId = Number(q.customerId);
    } else {
      agingWhere.customerId = { not: null };
    }

    const invoices = await prisma.invoice.findMany({
      where: agingWhere,
      include: {
        customer: { select: { id: true, name: true } },
        // الدفعات حتى التاريخ المرجعي فقط — لا نستخدم paidAmount (لقطة الحاضر).
        payments: { where: { date: { lte: asOfDate } }, select: { date: true, amount: true } },
      },
    });

    interface AgingRow {
      customerName: string;
      current: number;
      bucket0_30: number;
      bucket31_60: number;
      bucket61_90: number;
      bucket90Plus: number;
      totalOutstanding: number;
      lastInvoiceDate: Date;
      lastPaymentDate: Date | null;
    }

    const customerMap = new Map<number, AgingRow>();

    for (const inv of invoices) {
      // المستحق كما في التاريخ المرجعي = الإجمالي − مجموع الدفعات حتى ذلك التاريخ.
      const paidAsOf = inv.payments.reduce((s, p) => s + num(p.amount), 0);
      const outstanding = round3(num(inv.total) - paidAsOf);
      if (outstanding <= 0 || !inv.customer) continue;

      const custId = inv.customer.id;
      if (!customerMap.has(custId)) {
        customerMap.set(custId, {
          customerName: inv.customer.name,
          current: 0, bucket0_30: 0, bucket31_60: 0, bucket61_90: 0, bucket90Plus: 0,
          totalOutstanding: 0,
          lastInvoiceDate: new Date(inv.issueDate),
          lastPaymentDate: null,
        });
      }
      const row = customerMap.get(custId)!;
      const dueDateRaw = inv.dueDate ?? inv.issueDate;
      const daysOverdue = Math.floor((asOfDate.getTime() - new Date(dueDateRaw).getTime()) / 86_400_000);

      row.totalOutstanding = round3(row.totalOutstanding + outstanding);
      if (daysOverdue <= 0) row.current = round3(row.current + outstanding);
      else if (daysOverdue <= 30) row.bucket0_30 = round3(row.bucket0_30 + outstanding);
      else if (daysOverdue <= 60) row.bucket31_60 = round3(row.bucket31_60 + outstanding);
      else if (daysOverdue <= 90) row.bucket61_90 = round3(row.bucket61_90 + outstanding);
      else row.bucket90Plus = round3(row.bucket90Plus + outstanding);

      const invDate = new Date(inv.issueDate);
      if (invDate > row.lastInvoiceDate) row.lastInvoiceDate = invDate;
      for (const p of inv.payments) {
        const pd = new Date(p.date);
        if (!row.lastPaymentDate || pd > row.lastPaymentDate) row.lastPaymentDate = pd;
      }
    }

    const rows = [...customerMap.values()].sort((a, b) => b.totalOutstanding - a.totalOutstanding);
    const totals = {
      current: round3(rows.reduce((s, r) => s + r.current, 0)),
      bucket0_30: round3(rows.reduce((s, r) => s + r.bucket0_30, 0)),
      bucket31_60: round3(rows.reduce((s, r) => s + r.bucket31_60, 0)),
      bucket61_90: round3(rows.reduce((s, r) => s + r.bucket61_90, 0)),
      bucket90Plus: round3(rows.reduce((s, r) => s + r.bucket90Plus, 0)),
      totalOutstanding: round3(rows.reduce((s, r) => s + r.totalOutstanding, 0)),
    };

    return {
      title: 'تقرير أعمار الديون (الذمم المدينة)',
      subtitle: `كما في: ${formatDisplayDate(asOfDate)} — إجمالي المستحق: ${formatCurrency(totals.totalOutstanding)}`,
      columns: [
        { header: 'العميل', key: 'customerName', width: 28 },
        { header: 'حالي', key: 'current', width: 16, numFmt: '#,##0.000', format: 'currency' },
        { header: '1-30 يوم', key: 'bucket0_30', width: 16, numFmt: '#,##0.000', format: 'currency' },
        { header: '31-60 يوم', key: 'bucket31_60', width: 16, numFmt: '#,##0.000', format: 'currency' },
        { header: '61-90 يوم', key: 'bucket61_90', width: 16, numFmt: '#,##0.000', format: 'currency' },
        { header: '+90 يوم', key: 'bucket90Plus', width: 16, numFmt: '#,##0.000', format: 'currency' },
        { header: 'إجمالي المستحق', key: 'totalOutstanding', width: 18, numFmt: '#,##0.000', format: 'currency' },
        { header: 'آخر فاتورة', key: 'lastInvoiceDate', width: 14 },
        { header: 'آخر دفعة', key: 'lastPaymentDate', width: 14 },
      ],
      rows: rows.map((r) => ({
        customerName: r.customerName,
        current: r.current,
        bucket0_30: r.bucket0_30,
        bucket31_60: r.bucket31_60,
        bucket61_90: r.bucket61_90,
        bucket90Plus: r.bucket90Plus,
        totalOutstanding: r.totalOutstanding,
        lastInvoiceDate: dateAr(r.lastInvoiceDate),
        lastPaymentDate: r.lastPaymentDate ? dateAr(r.lastPaymentDate) : '—',
      })),
      totalsRow: { customerName: 'الإجمالي', ...totals, lastInvoiceDate: '', lastPaymentDate: '' },
    };
  }

  private async customerBalances(q: ReportQuery): Promise<ReportInput> {
    const balWhere: Prisma.InvoiceWhereInput = {
      direction: 'SALES',
      status: { not: 'CANCELLED' },
      customerId: { not: null },
    };
    if (q.customerId) balWhere.customerId = Number(q.customerId);
    if (q.to) balWhere.issueDate = { lte: endOfDay(new Date(q.to)) };

    // نقطة الرصيد = نهاية الفترة (q.to)، أو الآن إن لم تُحدَّد.
    const asOfBal = q.to ? endOfDay(new Date(q.to)) : new Date();
    const invoices = await prisma.invoice.findMany({
      where: balWhere,
      select: {
        customerId: true,
        total: true,
        status: true,
        issueDate: true,
        customer: { select: { id: true, name: true, code: true } },
        // المدفوع حتى نهاية الفترة — لا paidAmount (لقطة الحاضر).
        payments: { where: { date: { lte: asOfBal } }, select: { date: true, amount: true } },
      },
      orderBy: { issueDate: 'asc' },
    });

    interface BalRow {
      code: string;
      name: string;
      totalInvoiced: number;
      totalPaid: number;
      invoiceCount: number;
      unpaidCount: number;
      lastInvoiceDate: Date | null;
      lastPaymentDate: Date | null;
    }

    const map = new Map<number, BalRow>();
    for (const inv of invoices) {
      if (!inv.customer) continue;
      const custId = inv.customer.id;
      if (!map.has(custId)) {
        map.set(custId, { code: inv.customer.code, name: inv.customer.name, totalInvoiced: 0, totalPaid: 0, invoiceCount: 0, unpaidCount: 0, lastInvoiceDate: null, lastPaymentDate: null });
      }
      const row = map.get(custId)!;
      const paidAsOf = inv.payments.reduce((s, p) => s + num(p.amount), 0);
      row.totalInvoiced = round3(row.totalInvoiced + num(inv.total));
      row.totalPaid = round3(row.totalPaid + paidAsOf);
      row.invoiceCount++;
      if (round3(num(inv.total) - paidAsOf) > 0) row.unpaidCount++;
      const d = new Date(inv.issueDate);
      if (!row.lastInvoiceDate || d > row.lastInvoiceDate) row.lastInvoiceDate = d;
      for (const p of inv.payments) {
        const pd = new Date(p.date);
        if (!row.lastPaymentDate || pd > row.lastPaymentDate) row.lastPaymentDate = pd;
      }
    }

    const rows = [...map.values()].sort((a, b) => b.totalInvoiced - a.totalInvoiced);
    const grandTotalInvoiced = round3(rows.reduce((s, r) => s + r.totalInvoiced, 0));
    const grandTotalPaid = round3(rows.reduce((s, r) => s + r.totalPaid, 0));
    const grandBalance = round3(grandTotalInvoiced - grandTotalPaid);
    const grandInvoiceCount = rows.reduce((s, r) => s + r.invoiceCount, 0);

    return {
      title: 'ملخص أرصدة العملاء',
      subtitle: `إجمالي المفوتر: ${formatCurrency(grandTotalInvoiced)} — المحصّل: ${formatCurrency(grandTotalPaid)} — الرصيد: ${formatCurrency(grandBalance)}`,
      columns: [
        { header: 'الرمز', key: 'code', width: 12 },
        { header: 'العميل', key: 'name', width: 28 },
        { header: 'إجمالي المفوتر', key: 'totalInvoiced', width: 18, numFmt: '#,##0.000', format: 'currency' },
        { header: 'إجمالي المحصّل', key: 'totalPaid', width: 18, numFmt: '#,##0.000', format: 'currency' },
        { header: 'الرصيد', key: 'balance', width: 18, numFmt: '#,##0.000', format: 'currency' },
        { header: 'عدد الفواتير', key: 'invoiceCount', width: 14 },
        { header: 'فواتير مفتوحة', key: 'unpaidCount', width: 14 },
        { header: 'آخر فاتورة', key: 'lastInvoiceDate', width: 14 },
        { header: 'آخر دفعة', key: 'lastPaymentDate', width: 14 },
      ],
      rows: rows.map((r) => ({
        code: r.code,
        name: r.name,
        totalInvoiced: r.totalInvoiced,
        totalPaid: r.totalPaid,
        balance: round3(r.totalInvoiced - r.totalPaid),
        invoiceCount: r.invoiceCount,
        unpaidCount: r.unpaidCount,
        lastInvoiceDate: r.lastInvoiceDate ? dateAr(r.lastInvoiceDate) : '',
        lastPaymentDate: r.lastPaymentDate ? dateAr(r.lastPaymentDate) : '—',
      })),
      totalsRow: { name: 'الإجمالي', totalInvoiced: grandTotalInvoiced, totalPaid: grandTotalPaid, balance: grandBalance, invoiceCount: grandInvoiceCount },
    };
  }

  private async collectionsSummary(q: ReportQuery): Promise<ReportInput> {
    const invoiceWhere: Prisma.InvoiceWhereInput = { direction: 'SALES', status: { not: 'CANCELLED' } };
    if (q.customerId) invoiceWhere.customerId = Number(q.customerId);

    const where: Prisma.PaymentWhereInput = {
      invoice: invoiceWhere,
      ...dateWhere(q.from, q.to) as Prisma.PaymentWhereInput,
    };

    const payments = await prisma.payment.findMany({
      where,
      include: {
        invoice: { select: { invoiceNumber: true, customer: { select: { name: true } } } },
      },
      orderBy: { date: 'desc' },
    });

    const METHOD_AR: Record<string, string> = { CASH: 'نقد', BANK: 'تحويل بنكي', CHEQUE: 'شيك', TRANSFER: 'حوالة' };
    const total = round3(payments.reduce((s, p) => s + num(p.amount), 0));

    return {
      title: 'ملخص التحصيلات',
      subtitle: q.from || q.to
        ? `الفترة: ${q.from ?? '—'} إلى ${q.to ?? '—'} — إجمالي التحصيل: ${formatCurrency(total)} — عدد الدفعات: ${payments.length}`
        : `إجمالي التحصيل: ${formatCurrency(total)} — عدد الدفعات: ${payments.length}`,
      columns: [
        { header: 'التاريخ', key: 'date', width: 14 },
        { header: 'العميل', key: 'customerName', width: 28 },
        { header: 'رقم الفاتورة', key: 'invoiceNumber', width: 24 },
        { header: 'طريقة الدفع', key: 'method', width: 16 },
        { header: 'المرجع', key: 'reference', width: 20 },
        { header: 'المبلغ', key: 'amount', width: 18, numFmt: '#,##0.000', format: 'currency' },
      ],
      rows: payments.map((p) => ({
        date: dateAr(p.date),
        customerName: p.invoice.customer?.name ?? '',
        invoiceNumber: p.invoice.invoiceNumber,
        method: METHOD_AR[p.method] ?? p.method,
        reference: p.reference ?? '',
        amount: num(p.amount),
      })),
      totalsRow: { customerName: 'الإجمالي', amount: total },
    };
  }
}

export const reportsService = new ReportsService();
