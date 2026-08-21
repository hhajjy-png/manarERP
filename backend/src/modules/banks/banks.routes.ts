import { Router } from 'express';
import { banksController } from './banks.controller';
import { authenticate } from '../../core/middleware/auth.middleware';
import { requirePermission } from '../../core/middleware/rbac.middleware';
import { validate } from '../../core/middleware/validate.middleware';
import { asyncHandler } from '../../core/utils/asyncHandler';
import {
  createBankSchema,
  updateBankSchema,
  createBankAccountSchema,
  updateBankAccountSchema,
} from './banks.schema';

/**
 * سجل البنوك والحسابات — `/api/banks`.
 *
 * مسار منفصل عمدًا عن `/api/bank-accounts` القائم: ذاك عرض مشتق للقراءة من
 * حركات كشوف البنوك (مفتاحه `accountKey` نصي)، وهذا هو السجل المخزَّن
 * (مفتاحه `id` رقمي). لم يُعدَّل أي مسار أو عقد في الوحدة القديمة.
 *
 * لا مسار DELETE في هذه الوحدة إطلاقًا: بنك أو حساب صدرت عليه شيكات سجل
 * تاريخي دائم، والإيقاف عبر `isActive` هو المسار الوحيد.
 */
const router = Router();
router.use(authenticate);

// المسارات الثابتة قبل `/:id` حتى لا يلتقطها كمعرّف.
router.get('/accounts', requirePermission('banks.read'), asyncHandler(banksController.listAccounts));
router.post('/accounts', requirePermission('banks.manage'), validate(createBankAccountSchema), asyncHandler(banksController.createAccount));
router.get('/accounts/:id', requirePermission('banks.read'), asyncHandler(banksController.getAccount));
router.put('/accounts/:id', requirePermission('banks.manage'), validate(updateBankAccountSchema), asyncHandler(banksController.updateAccount));

// تقرير الشيكات القديمة التي لم يُربَط بها حساب بنكي (مخرَج «لا تخمين»).
router.get('/unlinked-cheques', requirePermission('banks.read'), asyncHandler(banksController.unlinkedCheques));

router.get('/', requirePermission('banks.read'), asyncHandler(banksController.listBanks));
router.post('/', requirePermission('banks.manage'), validate(createBankSchema), asyncHandler(banksController.createBank));
router.put('/:id', requirePermission('banks.manage'), validate(updateBankSchema), asyncHandler(banksController.updateBank));

export default router;
