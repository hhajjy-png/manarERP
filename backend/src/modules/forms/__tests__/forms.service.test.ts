import { describe, it, expect, vi, beforeEach } from 'vitest';
import { FormsService } from '../forms.service';

vi.mock('../../../config/database', () => ({
  prisma: {
    employee: { findUnique: vi.fn() },
    payroll: { findFirst: vi.fn() },
    leave: { findFirst: vi.fn() },
    payrollAdvance: { findFirst: vi.fn() },
    performanceReview: { findFirst: vi.fn() },
  },
}));

import { prisma } from '../../../config/database';

const MOCK_EMPLOYEE = {
  id: 1,
  code: 'EMP001',
  fullName: 'محمد أحمد',
  fullNameEn: 'Mohammad Ahmad',
  civilId: '123456789',
  jobTitle: 'سائق شاحنة',
  nationality: 'هندي',
  passportNumber: 'A1234567',
  passportExpiry: null,
  residencyExpiry: null,
  licenseExpiry: null,
  vehiclePlate: null,
  vehicleLicenseExpiry: null,
  birthDate: null,
  company: null,
  department: null,
  salary: 150,
  hireDate: new Date('2024-01-01'),
  phone: null,
  email: null,
  address: null,
  photoPath: null,
  status: 'ACTIVE',
  notes: null,
  createdAt: new Date(),
  updatedAt: new Date(),
};

describe('FormsService — getEmploymentContractData', () => {
  const service = new FormsService();

  beforeEach(() => vi.clearAllMocks());

  it('returns employee data for a valid employee ID', async () => {
    vi.mocked(prisma.employee.findUnique).mockResolvedValue(MOCK_EMPLOYEE as any);

    const result = await service.getEmploymentContractData(1);

    expect(prisma.employee.findUnique).toHaveBeenCalledWith({ where: { id: 1 } });
    expect(result.employee.id).toBe(1);
    expect(result.employee.fullName).toBe('محمد أحمد');
    expect(result.employee.salary).toBe(150);
  });

  it('throws AppError with Arabic message when employee not found', async () => {
    vi.mocked(prisma.employee.findUnique).mockResolvedValue(null);

    await expect(service.getEmploymentContractData(99)).rejects.toMatchObject({
      message: 'الموظف غير موجود',
    });
  });
});
