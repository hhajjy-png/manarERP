import { Prisma } from '@prisma/client';
import { localDateRange } from '../../core/utils/dateWindows';

export interface AttendanceFilters {
  employeeId?: string;
  from?: string;
  to?: string;
  status?: string;
  search?: string;
}

export function buildAttendanceWhere(filters: AttendanceFilters): Prisma.AttendanceWhereInput {
  const where: Prisma.AttendanceWhereInput = {};

  if (filters.employeeId) where.employeeId = Number(filters.employeeId);
  if (filters.status) where.status = filters.status;

  const dateRange = localDateRange(filters.from, filters.to);
  if (dateRange) where.date = dateRange;

  if (filters.search) {
    where.OR = [
      { notes:    { contains: filters.search } },
      { employee: { fullName: { contains: filters.search } } },
      { employee: { code:     { contains: filters.search } } },
    ];
  }

  return where;
}

export interface AttendanceStats {
  total: number;
  present: number;
  absent: number;
  late: number;
  leave: number;
}

type GroupByRow = { status: string; _count: { status: number } };

export function aggregateAttendanceStats(rows: GroupByRow[], total: number): AttendanceStats {
  const stats: AttendanceStats = { total, present: 0, absent: 0, late: 0, leave: 0 };
  for (const row of rows) {
    const key = row.status.toLowerCase() as keyof AttendanceStats;
    if (key in stats && key !== 'total') stats[key] = row._count.status;
  }
  return stats;
}
