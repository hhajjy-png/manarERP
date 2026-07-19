/**
 * سطح النماذج العامة لنطاق Employee Entitlements (Part 5 — Public Models). كل نموذج
 * هنا واجهة نظيفة مستقلّة عن تفاصيل Prisma الداخلية — الوحدات الأخرى يجب أن تستهلك هذه
 * الأنواع بدل قراءة حقول Prisma الخام مباشرةً حيثما أمكن.
 */
export * from './EmployeeProfile';
export * from './Holiday';
export * from './LeavePeriod';
export * from './LeaveAdvance';
export * from './Settlement';
export * from './EntitlementSummary';
export * from './TimelineEvent';
