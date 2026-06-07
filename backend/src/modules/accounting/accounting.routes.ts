import { Router } from 'express';
import { accountingController } from './accounting.controller';
import { authenticate } from '../../core/middleware/auth.middleware';
import { requirePermission } from '../../core/middleware/rbac.middleware';
import { asyncHandler } from '../../core/utils/asyncHandler';

const router = Router();
router.use(authenticate);

// دليل الحسابات
router.get('/accounts', requirePermission('transactions.read'), asyncHandler(accountingController.listAccounts));
router.post('/accounts', requirePermission('transactions.create'), asyncHandler(accountingController.createAccount));
router.patch('/accounts/:id', requirePermission('transactions.update'), asyncHandler(accountingController.updateAccount));
router.delete('/accounts/:id', requirePermission('transactions.delete'), asyncHandler(accountingController.deleteAccount));

// قيود اليومية
router.get('/journal', requirePermission('transactions.read'), asyncHandler(accountingController.listJournalEntries));
router.post('/journal', requirePermission('transactions.create'), asyncHandler(accountingController.createJournalEntry));
router.patch('/journal/:id/cancel', requirePermission('transactions.update'), asyncHandler(accountingController.cancelJournalEntry));

// المدفوعات
router.get('/payments', requirePermission('transactions.read'), asyncHandler(accountingController.listPayments));

// الملخص المالي
router.get('/summary', requirePermission('transactions.read', 'reports.read'), asyncHandler(accountingController.financialSummary));

export default router;
