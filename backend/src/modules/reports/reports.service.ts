import { Prisma } from '@prisma/client';
import { prisma } from '../../config/database';
import { AppError } from '../../core/errors/AppError';
import { ReportInput } from '../../shared/services/reportEngine/excel.service';

const num = (n: number | null | undefined) => Number(n ?? 0);
const dateAr = (d: Date | null) => (d ? new Date(d).toLocaleDateString('ar') : '');
const ARABIC_MONTHS_RPT = ['يناير','فبراير','مارس','أبريل','مايو','يونيو','يوليو','أغسطس','سبتمبر','أكتوبر','نوفمبر','ديسمبر'];

function dateWhere(from?: string, to?: string, field = 'date'): Record<string, unknown> {
  if (!from && !to) return {};
  const range: Record<string, Date> = {};
  if (from) range.gte = new Date(from);
  if (to) range.lte = new Date(to);
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
    const totalMonthly = rows.reduce((s, c) => s + num(c.monthlyTransportValue), 0);
    return {
      title: 'تقرير العقود',
      subtitle: `عدد العقود: ${rows.length} — إجمالي النقل الشهري: ${totalMonthly.toLocaleString('ar')} د.ك`,
      columns: [
        { header: 'رقم العقد', key: 'code', width: 16 },
        { header: 'العميل', key: 'customer', width: 24 },
        { header: 'مصنع الأسفلت', key: 'plant', width: 28 },
        { header: 'مكان العقد', key: 'location', width: 24 },
        { header: 'قيمة النقل الشهري', key: 'monthly', width: 20, numFmt: '#,##0.000' },
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
    const rows = await prisma.invoice.findMany({
      where,
      orderBy: { issueDate: 'desc' },
      include: {
        customer: { select: { name: true } },
        supplier: { select: { name: true } },
      },
    });
    const total = rows.reduce((s, i) => s + num(i.total), 0);
    const paid = rows.reduce((s, i) => s + num(i.paidAmount), 0);
    const remaining = total - paid;
    return {
      title: 'تقرير الفواتير',
      subtitle: `العدد: ${rows.length} — الإجمالي: ${total.toLocaleString('ar')} — المحصّل: ${paid.toLocaleString('ar')} — المتبقي: ${remaining.toLocaleString('ar')}`,
      columns: [
        { header: 'رقم الفاتورة', key: 'invoiceNumber', width: 22 },
        { header: 'الاتجاه', key: 'direction', width: 16 },
        { header: 'الجهة', key: 'party', width: 28 },
        { header: 'شهر الحساب', key: 'billingPeriod', width: 18 },
        { header: 'الإجمالي', key: 'total', width: 16, numFmt: '#,##0.000' },
        { header: 'المسدّد', key: 'paid', width: 16, numFmt: '#,##0.000' },
        { header: 'المتبقي', key: 'remaining', width: 16, numFmt: '#,##0.000' },
      ],
      rows: rows.map((i) => ({
        invoiceNumber: i.invoiceNumber,
        direction: i.direction === 'SALES' ? 'نقليات عميل' : i.direction === 'PURCHASE' ? 'مشتريات مورد' : i.direction,
        party: i.customer?.name ?? i.supplier?.name ?? '',
        billingPeriod: i.billingMonth && i.billingYear
          ? `${ARABIC_MONTHS_RPT[(i.billingMonth as number) - 1]} ${i.billingYear}`
          : dateAr(i.issueDate),
        total: num(i.total),
        paid: num(i.paidAmount),
        remaining: num(i.total) - num(i.paidAmount),
      })),
      totalsRow: { party: 'الإجمالي', total, paid, remaining },
    };
  }

  private async expenses(q: ReportQuery): Promise<ReportInput> {
    const CATEGORY_AR: Record<string, string> = {
      FUEL: 'وقود', SALARIES: 'رواتب', MAINTENANCE: 'صيانة', RENT: 'إيجارات',
      PURCHASES: 'مشتريات', EQUIPMENT: 'معدات', SERVICES: 'خدمات',
      EQUIPMENT_RENT: 'إيجار معدات', TRUCK_RENT: 'إيجار شاحنات',
      HASSAN: 'مصروف عن طريق حسن', GHANEM: 'مصروف عن طريق غانم',
      NATHEER: 'مصروف عن طريق نظير', HAROON: 'مصروف عن طريق هارون',
      OTHER: 'أخرى',
    };
    const STATUS_AR: Record<string, string> = {
      PENDING: 'معلّق', APPROVED: 'معتمد', REJECTED: 'مرفوض',
      REVERSED: 'مُلغى الاعتماد', CANCELLED: 'ملغى',
    };
    const where: Prisma.ExpenseWhereInput = {
      ...dateWhere(q.from, q.to) as Prisma.ExpenseWhereInput,
    };
    if (q.status) where.status = q.status;
    const rows = await prisma.expense.findMany({
      where,
      orderBy: { date: 'desc' },
      include: {
        contract: { select: { asphaltPlant: true } },
        supplier: { select: { name: true } },
      },
    });
    const total = rows.reduce((s, e) => s + num(e.amount), 0);
    return {
      title: 'تقرير المصروفات',
      subtitle: `العدد: ${rows.length} — الإجمالي: ${total.toLocaleString('ar')}`,
      columns: [
        { header: 'الرقم', key: 'code', width: 16 },
        { header: 'التصنيف', key: 'category', width: 18 },
        { header: 'الوصف', key: 'description', width: 32 },
        { header: 'المورد', key: 'supplier', width: 22 },
        { header: 'العقد', key: 'contract', width: 22 },
        { header: 'المبلغ', key: 'amount', width: 16, numFmt: '#,##0.000' },
        { header: 'التاريخ', key: 'date', width: 16 },
        { header: 'الحالة', key: 'status', width: 16 },
      ],
      rows: rows.map((e) => ({
        code: e.code,
        category: CATEGORY_AR[e.category] ?? e.category,
        description: e.description,
        supplier: e.supplier?.name ?? (e.supplierName ?? ''),
        contract: e.contract?.asphaltPlant ?? '',
        amount: num(e.amount),
        date: dateAr(e.date),
        status: STATUS_AR[e.status] ?? e.status,
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
      columns: [
        { header: 'رقم المعدة', key: 'code', width: 14 },
        { header: 'النوع', key: 'type', width: 16 },
        { header: 'اسم المالك', key: 'owner', width: 22 },
        { header: 'اسم السائق', key: 'driver', width: 22 },
        { header: 'رقم اللوحة', key: 'plate', width: 16 },
        { header: 'انتهاء الدفتر', key: 'expiry', width: 16 },
        { header: 'الحالة', key: 'status', width: 12 },
      ],
      rows: rows.map((e) => ({
        code: e.code,
        type: e.type,
        owner: e.ownerName ?? '',
        driver: e.driverName ?? '',
        plate: e.plateNumber ?? '',
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
        { header: 'الراتب الشهري', key: 'salary', width: 16, numFmt: '#,##0.000' },
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
    const totalNet = rows.reduce((s, p) => s + num(p.netSalary), 0);
    return {
      title: 'تقرير الرواتب',
      subtitle: `عدد الكشوف: ${rows.length} — إجمالي الصافي: ${totalNet.toLocaleString('ar')}`,
      columns: [
        { header: 'رمز الموظف', key: 'employeeCode', width: 14 },
        { header: 'الموظف', key: 'name', width: 30 },
        { header: 'الشهر', key: 'month', width: 8 },
        { header: 'السنة', key: 'year', width: 8 },
        { header: 'الأساسي', key: 'baseSalary', width: 16, numFmt: '#,##0.000' },
        { header: 'بدلات', key: 'totalAllowances', width: 14, numFmt: '#,##0.000' },
        { header: 'إضافي', key: 'overtimeAmount', width: 14, numFmt: '#,##0.000' },
        { header: 'خصومات', key: 'totalDeductions', width: 14, numFmt: '#,##0.000' },
        { header: 'سلف', key: 'totalAdvances', width: 14, numFmt: '#,##0.000' },
        { header: 'الإجمالي', key: 'grossSalary', width: 16, numFmt: '#,##0.000' },
        { header: 'الصافي', key: 'netSalary', width: 16, numFmt: '#,##0.000' },
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
        { header: 'سعر الوحدة', key: 'unitPrice', width: 16, numFmt: '#,##0.000' },
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
    // DATA-SOURCE RULE: P&L reads from Legacy Transactions ONLY.
    // JournalEntry (GL) entries for the same events fire in parallel (Phase B) but must
    // NOT be added here — doing so would double-count every expense and invoice.
    // If P&L is ever migrated to GL-only, remove the Transaction queries at the same time.
    const where: Prisma.TransactionWhereInput = {
      ...dateWhere(q.from, q.to) as Prisma.TransactionWhereInput,
    };
    const [rev, exp] = await Promise.all([
      prisma.transaction.aggregate({ where: { ...where, type: 'REVENUE' }, _sum: { credit: true } }),
      prisma.transaction.aggregate({ where: { ...where, type: 'EXPENSE' }, _sum: { debit: true } }),
    ]);
    const totalRevenue = num(rev._sum.credit);
    const totalExpense = num(exp._sum.debit);
    const net = totalRevenue - totalExpense;
    return {
      title: 'تقرير الأرباح والخسائر',
      subtitle: q.from || q.to ? `الفترة: ${q.from ?? '—'} إلى ${q.to ?? '—'}` : 'كل الفترات',
      columns: [
        { header: 'البند', key: 'item', width: 40 },
        { header: 'المبلغ', key: 'amount', width: 22, numFmt: '#,##0.00' },
      ],
      rows: [
        { item: 'إجمالي الإيرادات', amount: totalRevenue },
        { item: 'إجمالي المصروفات', amount: totalExpense },
      ],
      totalsRow: { item: 'صافي الربح / الخسارة', amount: net },
    };
  }
}

export const reportsService = new ReportsService();
