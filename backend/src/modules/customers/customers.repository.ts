import { BaseRepository } from '../../shared/repositories/BaseRepository';
import { prisma } from '../../config/database';

class CustomersRepository extends BaseRepository<{ id: number; code: string }> {
  protected readonly model = 'customer';

  /** عميل مع ملخص مشاريعه وفواتيره. */
  findWithRelations(id: number) {
    return prisma.customer.findUnique({
      where: { id },
      include: {
        contracts: { select: { id: true, code: true, asphaltPlant: true, status: true, monthlyTransportValue: true } },
        _count: { select: { contracts: true, invoices: true } },
      },
    });
  }
}

export const customersRepository = new CustomersRepository();
