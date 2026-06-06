import { prisma } from '../../config/database';
import { PaginationParams } from '../../core/utils/pagination';

/**
 * مستودع أساسي عام (Repository Pattern) يوفّر عمليات CRUD المتكررة.
 * تُورّث منه مستودعات الوحدات وتمرّر اسم الموديل في Prisma.
 *
 * يفصل منطق الأعمال (Services) عن الوصول المباشر لـ Prisma، ما يسهّل
 * الاختبار واستبدال طبقة البيانات لاحقًا (مبدأ Dependency Inversion).
 */
export abstract class BaseRepository<TModel extends { id: number }> {
  /** اسم الموديل كما هو في prisma client (مثل: 'customer'). */
  protected abstract readonly model: string;

  // الوصول لـ delegate الخاص بالموديل في Prisma
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  protected get delegate(): any {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    return (prisma as any)[this.model];
  }

  async findById(id: number, include?: object): Promise<TModel | null> {
    return this.delegate.findUnique({ where: { id }, include });
  }

  async findMany(args: {
    where?: object;
    include?: object;
    orderBy?: object;
    pagination?: PaginationParams;
  }): Promise<{ data: TModel[]; total: number }> {
    const { where, include, orderBy, pagination } = args;
    const [data, total] = await Promise.all([
      this.delegate.findMany({
        where,
        include,
        orderBy: orderBy ?? { id: 'desc' },
        skip: pagination?.skip,
        take: pagination?.take,
      }),
      this.delegate.count({ where }),
    ]);
    return { data, total };
  }

  async create(data: object, include?: object): Promise<TModel> {
    return this.delegate.create({ data, include });
  }

  async update(id: number, data: object, include?: object): Promise<TModel> {
    return this.delegate.update({ where: { id }, data, include });
  }

  async delete(id: number): Promise<TModel> {
    return this.delegate.delete({ where: { id } });
  }

  async exists(where: object): Promise<boolean> {
    const found = await this.delegate.findFirst({ where, select: { id: true } });
    return Boolean(found);
  }
}
