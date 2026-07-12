import { prisma } from '@config/database';
import { ROLES } from '@config/constants';

/**
 * البحث الشامل — نتيجة واحدة موحّدة عبر الكيانات.
 *
 * القواعد التي تحكم هذا الملف:
 *   • **الصلاحيات أولًا.** لا يُستعلَم عن كيان لا يملك المستخدم صلاحية قراءته أصلًا. الحجب
 *     على مستوى الاستعلام لا على مستوى العرض: ما لا يُقرأ لا يُجلب.
 *   • **حقول العرض والتنقّل فقط.** لا رواتب، لا أرقام مدنية، لا هواتف، لا عناوين — البحث
 *     نافذة تنقّل، لا تسريب بيانات.
 *   • **سقف صارم لكل كيان** (`PER_ENTITY_LIMIT`)، فلا يتحوّل حرفٌ واحد إلى مسح للقاعدة.
 *   • **لا نص البحث في سجلّ التدقيق**: قد يحوي اسم عميل أو رقم فاتورة، ولا قيمة تدقيقية له.
 */

export interface SearchHit {
  /** نوع الكيان — يقود الأيقونة والتوجيه في الواجهة. */
  type: 'customer' | 'invoice' | 'employee' | 'equipment' | 'expense' | 'cheque';
  id: number;
  /** السطر الأول: الاسم أو الرقم. */
  title: string;
  /** السطر الثاني: سياق موجز (رمز، حالة، مبلغ) — لا تفاصيل حسّاسة. */
  subtitle?: string;
  /** المسار الذي يفتحه الاختيار. */
  route: string;
}

export interface SearchActor {
  roleName: string;
  permissions: string[];
}

/** سقف لكل كيان — والواجهة تعرض الأعلى صلةً منها. */
const PER_ENTITY_LIMIT = 5;
/** أقصر مصطلح يُبحث به: حرفان. حرف واحد يطابق كل شيء ولا يفيد أحدًا. */
const MIN_TERM_LENGTH = 2;

function can(actor: SearchActor, permission: string): boolean {
  return actor.roleName === ROLES.SYSTEM_ADMIN || actor.permissions.includes(permission);
}

/**
 * SQLite لا يدعم `mode: 'insensitive'` في Prisma، لكن مطابقة `contains` فيه غير حسّاسة
 * لحالة الأحرف **اللاتينية** أصلًا (ASCII)، والعربية لا حالة لها. فالمطابقة الجزئية تعمل
 * للغتين بلا حيلة إضافية.
 */
export const searchService = {
  async search(rawTerm: string, actor: SearchActor): Promise<SearchHit[]> {
    const term = rawTerm.trim();
    if (term.length < MIN_TERM_LENGTH) return [];

    const take = PER_ENTITY_LIMIT;
    const hits: SearchHit[] = [];
    const jobs: Promise<void>[] = [];

    if (can(actor, 'customers.read')) {
      jobs.push(
        prisma.customer
          .findMany({
            where: { OR: [{ name: { contains: term } }, { code: { contains: term } }] },
            select: { id: true, name: true, code: true },
            take,
            orderBy: { name: 'asc' },
          })
          .then((rows) => {
            for (const r of rows) {
              hits.push({ type: 'customer', id: r.id, title: r.name, subtitle: r.code ?? undefined, route: `/customers?highlight=${r.id}` });
            }
          }),
      );
    }

    if (can(actor, 'invoices.read')) {
      jobs.push(
        prisma.invoice
          .findMany({
            where: { OR: [{ invoiceNumber: { contains: term } }, { customer: { name: { contains: term } } }] },
            select: { id: true, invoiceNumber: true, status: true, customer: { select: { name: true } } },
            take,
            orderBy: { issueDate: 'desc' },
          })
          .then((rows) => {
            for (const r of rows) {
              hits.push({
                type: 'invoice',
                id: r.id,
                title: r.invoiceNumber,
                subtitle: r.customer?.name ?? undefined,
                route: `/invoices?highlight=${r.id}`,
              });
            }
          }),
      );
    }

    if (can(actor, 'employees.read')) {
      jobs.push(
        prisma.employee
          .findMany({
            // الاسم والرمز فقط — لا رقم مدني ولا هاتف: لا يُبحث بها ولا تُعاد.
            where: { OR: [{ fullName: { contains: term } }, { code: { contains: term } }] },
            select: { id: true, fullName: true, code: true, jobTitle: true },
            take,
            orderBy: { fullName: 'asc' },
          })
          .then((rows) => {
            for (const r of rows) {
              hits.push({ type: 'employee', id: r.id, title: r.fullName, subtitle: r.jobTitle ?? r.code ?? undefined, route: `/employees?highlight=${r.id}` });
            }
          }),
      );
    }

    if (can(actor, 'equipment.read')) {
      jobs.push(
        prisma.equipment
          .findMany({
            where: { OR: [{ name: { contains: term } }, { code: { contains: term } }, { plateNumber: { contains: term } }] },
            select: { id: true, name: true, code: true, status: true },
            take,
            orderBy: { name: 'asc' },
          })
          .then((rows) => {
            for (const r of rows) {
              // اسم المعدّة اختياري في المخطط — الرمز هو الهوية البديلة.
              hits.push({
                type: 'equipment',
                id: r.id,
                title: r.name ?? r.code,
                subtitle: r.name ? r.code : undefined,
                route: `/equipment?highlight=${r.id}`,
              });
            }
          }),
      );
    }

    if (can(actor, 'expenses.read')) {
      jobs.push(
        prisma.expense
          .findMany({
            where: { OR: [{ code: { contains: term } }, { description: { contains: term } }] },
            select: { id: true, code: true, description: true, status: true },
            take,
            orderBy: { date: 'desc' },
          })
          .then((rows) => {
            for (const r of rows) {
              // رمز المصروف اختياري في المخطط — نسقط إلى الوصف بدل عرض عنوان فارغ.
              hits.push({
                type: 'expense',
                id: r.id,
                title: r.code ?? r.description,
                subtitle: r.code ? r.description : undefined,
                route: `/expenses?highlight=${r.id}`,
              });
            }
          }),
      );
    }

    if (can(actor, 'cheques.read')) {
      jobs.push(
        prisma.cheque
          .findMany({
            where: { OR: [{ chequeNumber: { contains: term } }, { beneficiaryName: { contains: term } }] },
            select: { id: true, chequeNumber: true, beneficiaryName: true, status: true },
            take,
            orderBy: { chequeDate: 'desc' },
          })
          .then((rows) => {
            for (const r of rows) {
              hits.push({ type: 'cheque', id: r.id, title: r.chequeNumber, subtitle: r.beneficiaryName, route: `/cheques?highlight=${r.id}` });
            }
          }),
      );
    }

    await Promise.all(jobs);
    return hits;
  },
};
