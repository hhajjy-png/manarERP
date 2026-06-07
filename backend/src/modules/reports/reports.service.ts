import { Prisma } from '@prisma/client';
import { prisma } from '../../config/database';
import { AppError } from '../../core/errors/AppError';
import { ReportInput } from '../../shared/services/reportEngine/excel.service';

const num = (n: number | null | undefined) => Number(n ?? 0);
const dateAr = (d: Date | null) => (d ? new Date(d).toLocaleDateString('ar') : '');

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
    return {
      title: 'تقرير الفواتير',
      subtitle: `العدد: ${rows.length} — الإجمالي: ${total.toLocaleString('ar')} — المحصّل: ${paid.toLocaleString('ar')}`,
      columns: [
        { header: 'رقم الفاتورة', key: 'invoiceNumber', width: 22 },
        { header: 'النوع', key: 'direction', width: 12 },
        { header: 'الجهة', key: 'party', width: 28 },
        { header: 'التاريخ', key: 'date', width: 16 },
        { header: 'الإجمالي', key: 'total', width: 16, numFmt: '#,##0.00' },
        { header: 'المسدّد', key: 'paid', width: 16, numFmt: '#,##0.00' },
        { header: 'الحالة', key: 'status', width: 14 },
      ],
      rows: rows.map((i) => ({
        invoiceNumber: i.invoiceNumber,
        direction: i.direction === 'SALES' ? 'مبيعات' : 'مشتريات',
        party: i.customer?.name ?? i.supplier?.name ?? '',
        date: dateAr(i.issueDate),
        total: num(i.total),
        paid: num(i.paidAmount),
        status: i.status,
      })),
      totalsRow: { party: 'الإجمالي', total, paid },
    };
  }

  private async expenses(q: ReportQuery): Promise<ReportInput> {
    const where: Prisma.ExpenseWhereInput = {
      ...dateWhere(q.from, q.to) as Prisma.ExpenseWhereInput,
    };
    if (q.status) where.status = q.status;
    const rows = await prisma.expense.findMany({
      where,
      orderBy: { date: 'desc' },
      include: { contract: { select: { asphaltPlant: true } } },
    });
    const total = rows.reduce((s, e) => s + num(e.amount), 0);
    return {
      title: 'تقرير المصروفات',
      subtitle: `العدد: ${rows.length} — الإجمالي: ${total.toLocaleString('ar')}`,
      columns: [
        { header: 'الرقم', key: 'code', width: 16 },
        { header: 'التصنيف', key: 'category', width: 16 },
        { header: 'الوصف', key: 'description', width: 32 },
        { header: 'العقد', key: 'contract', width: 22 },
        { header: 'المبلغ', key: 'amount', width: 16, numFmt: '#,##0.00' },
        { header: 'التاريخ', key: 'date', width: 16 },
        { header: 'الحالة', key: 'status', width: 14 },
      ],
      rows: rows.map((e) => ({
        code: e.code,
        category: e.category,
        description: e.description,
        contract: e.contract?.asphaltPlant ?? '',
        amount: num(e.amount),
        date: dateAr(e.date),
        status: e.status,
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
        status: e.status,
      })),
    };
  }

  private async payroll(q: ReportQuery): Promise<ReportInput> {
    const where: Prisma.PayrollWhereInput = {};
    if (q.from) where.year = new Date(q.from).getFullYear();
    if (q.employeeId) where.employeeId = Number(q.employeeId);
    const rows = await prisma.payroll.findMany({
      where,
      orderBy: [{ year: 'desc' }, { month: 'desc' }],
      include: { employee: { select: { fullName: true } } },
    });
    const totalNet = rows.reduce((s, p) => s + num(p.netSalary), 0);
    return {
      title: 'تقرير الرواتب',
      subtitle: `عدد الكشوف: ${rows.length} — إجمالي الصافي: ${totalNet.toLocaleString('ar')}`,
      columns: [
        { header: 'الموظف', key: 'name', width: 30 },
        { header: 'الشهر', key: 'period', width: 14 },
        { header: 'الأساسي', key: 'base', width: 16, numFmt: '#,##0.00' },
        { header: 'مكافآت', key: 'bonus', width: 14, numFmt: '#,##0.00' },
        { header: 'خصومات', key: 'ded', width: 14, numFmt: '#,##0.00' },
        { header: 'الصافي', key: 'net', width: 16, numFmt: '#,##0.00' },
        { header: 'الحالة', key: 'status', width: 14 },
      ],
      rows: rows.map((p) => ({
        name: p.employee.fullName,
        period: `${p.month}/${p.year}`,
        base: num(p.baseSalary),
        bonus: num(p.totalBonus),
        ded: num(p.totalDeduction),
        net: num(p.netSalary),
        status: p.status,
      })),
      totalsRow: { name: 'الإجمالي', net: totalNet },
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

  private async profitLoss(q: ReportQuery): Promise<ReportInput> {
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
