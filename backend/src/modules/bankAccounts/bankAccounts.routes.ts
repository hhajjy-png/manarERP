import { Router } from 'express';
import { authenticate }       from '@core/middleware/auth.middleware.js';
import { requirePermission }  from '@core/middleware/rbac.middleware.js';
import {
  listBankAccountsHandler,
  getDashboardHandler,
} from './bankAccounts.controller.js';

const router = Router();

// List all bank accounts (distinct accountKeys with aggregate data)
router.get(
  '/',
  authenticate,
  requirePermission('bankStatementImport.read'),
  listBankAccountsHandler,
);

// Dashboard aggregates for a single account
router.get(
  '/:accountKey/dashboard',
  authenticate,
  requirePermission('bankStatementImport.read'),
  getDashboardHandler,
);

export default router;
