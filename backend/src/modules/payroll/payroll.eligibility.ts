// ─────────────────────────────────────────────────────────────────────────────
//  Payroll eligibility — THE single definition of "who this payroll period is
//  supposed to contain".
//  ---------------------------------------------------------------------------
//  Two independent consumers ask that question about the same period:
//
//    • `buildSnapshots`  (payroll.service)      — who gets a row MATERIALIZED.
//    • `findPayrollEligibilityGap` (readModel)  — who the period is MISSING.
//
//  They must never disagree. When they do, the system either fabricates a warning
//  about someone generation would refuse to create, or stays silent about someone
//  it would happily create — and both failures look identical to the operator:
//  "the employee is not in Payroll and nothing explains why".
//
//  The rule itself is deliberately unchanged from what the code already enforced
//  (`status = 'ACTIVE'`), with ONE boundary added that both sides always implied
//  and neither expressed: an employee cannot be eligible for a month that had
//  already ended before they were hired. Employees with no `hireDate` recorded are
//  never excluded — absent data is not evidence of ineligibility.
//
//  Nothing here decides HOW MUCH anyone is paid. Proration, overtime, allowances
//  and end-of-service are calculation concerns and stay exactly where they are.
//
//  SCOPE — this rule governs BULK generation and gap detection ONLY. Generating for
//  one named employee deliberately bypasses it: an ON_LEAVE employee stays out of
//  every bulk run yet may still be paid one-by-one (Product-Owner-approved), while
//  TERMINATED is refused there by its own named guard (Product-Owner-blocked). Both
//  live in `buildSnapshots` (payroll.service). Do not apply this predicate to that
//  path: it would block ON_LEAVE too and silently revoke that exception.
// ─────────────────────────────────────────────────────────────────────────────

import { Prisma } from '@prisma/client';
import { monthRange } from './payroll.calc';

/** The only employee status that is payroll-eligible by default. */
export const PAYROLL_ELIGIBLE_STATUS = 'ACTIVE';

/**
 * Prisma `where` selecting every employee the given period is expected to contain.
 *
 * Callers may AND extra scoping onto the returned object (e.g. `id` when the grid
 * is filtered to one employee); the `OR` below stays intact because Prisma ANDs
 * sibling top-level fields.
 */
export function payrollEligibilityWhere(month: number, year: number): Prisma.EmployeeWhereInput {
  const { end } = monthRange(month, year);
  return {
    status: PAYROLL_ELIGIBLE_STATUS,
    // hireDate === null → kept (unknown start date is not a disqualification).
    OR: [{ hireDate: null }, { hireDate: { lte: end } }],
  };
}

/**
 * Has the period actually begun? A month that has not started yet cannot be
 * "missing" payroll — every employee is trivially absent from it, which would turn
 * the gap warning into a permanent banner and drown the one case it exists to
 * catch. Generation is unaffected: an operator may still generate ahead of time.
 */
export function hasPeriodStarted(month: number, year: number, now: Date = new Date()): boolean {
  return monthRange(month, year).start <= now;
}
