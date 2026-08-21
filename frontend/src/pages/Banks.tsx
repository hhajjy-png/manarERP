import { useCallback, useEffect, useMemo, useState } from 'react';
import { useAuth } from '../stores/authStore';
import { useT } from '../lib/i18n';
import { errorMessage } from '../api/client';
import {
  listBanks,
  createBank,
  updateBank,
  listBankAccounts,
  createBankAccount,
  updateBankAccount,
  getUnlinkedChequesReport,
  PRINT_PROFILE_MISSING_MESSAGE,
} from '../api/banks';
import type { Bank, BankAccount, UnlinkedChequesReport } from '../api/banks';
import {
  ExecutiveHeader,
  IdChip,
  MetricCard,
  StatusChip,
  SectionCard,
  EmptyState,
  ErrorBanner,
  SkeletonRows,
  Dialog,
  DialogSection,
  Button,
} from '../components/explorer/ExplorerKit';
import '../components/explorer/explorer-kit.css';
import './Banks.css';

/**
 * البنوك والحسابات البنكية — Multi-Bank Cheques Foundation v1.
 *
 * شاشة إدارة بسيطة متسقة مع ExplorerKit. حدودها مقصودة وهي حدود الحزمة نفسها:
 *   • لا حذف — بنك أو حساب صدرت عليه شيكات سجل تاريخي دائم؛ الإيقاف هو المسار.
 *   • لا رقم حساب ولا IBAN — الحساب يُعرَّف بـ«اسم البنك — اسم الحساب».
 *   • لا قوالب طباعة ولا معايرة ولا دفاتر شيكات ولا ربط محاسبي — حزم لاحقة.
 * الشاشة تعرض حالة قالب الطباعة للقراءة فقط، ولا تملك أي مسار لتغييرها.
 */

type EditingBank = { id: number | null; code: string; nameAr: string; nameEn: string; isActive: boolean };
type EditingAccount = { id: number | null; bankId: string; accountName: string; isActive: boolean };

const EMPTY_BANK: EditingBank = { id: null, code: '', nameAr: '', nameEn: '', isActive: true };
const EMPTY_ACCOUNT: EditingAccount = { id: null, bankId: '', accountName: '', isActive: true };

export default function Banks() {
  const { hasPermission } = useAuth();
  const { t } = useT();
  const canManage = hasPermission('banks.manage');

  const [banks, setBanks] = useState<Bank[]>([]);
  const [accounts, setAccounts] = useState<BankAccount[]>([]);
  const [unlinked, setUnlinked] = useState<UnlinkedChequesReport>({ total: 0, groups: [] });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [saving, setSaving] = useState(false);

  const [bankDialog, setBankDialog] = useState<EditingBank | null>(null);
  const [accountDialog, setAccountDialog] = useState<EditingAccount | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const [banksList, accountsList, report] = await Promise.all([
        listBanks(),
        listBankAccounts(),
        getUnlinkedChequesReport(),
      ]);
      setBanks(banksList);
      setAccounts(accountsList);
      setUnlinked(report);
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  useEffect(() => {
    if (!success) return;
    const id = setTimeout(() => setSuccess(''), 3500);
    return () => clearTimeout(id);
  }, [success]);

  const activeBanks = useMemo(() => banks.filter((b) => b.isActive), [banks]);
  const printableAccounts = useMemo(() => accounts.filter((a) => a.printEnabled), [accounts]);

  /** الحسابات مجمّعة تحت بنوكها — هكذا يقرأها المستخدم فعلًا. */
  const accountsByBank = useMemo(() => {
    const map = new Map<number, BankAccount[]>();
    for (const account of accounts) {
      const list = map.get(account.bankId) ?? [];
      list.push(account);
      map.set(account.bankId, list);
    }
    return map;
  }, [accounts]);

  async function saveBank() {
    if (!bankDialog) return;
    setSaving(true);
    setError('');
    try {
      if (bankDialog.id) {
        await updateBank(bankDialog.id, {
          nameAr: bankDialog.nameAr.trim(),
          nameEn: bankDialog.nameEn.trim() || null,
          isActive: bankDialog.isActive,
        });
      } else {
        await createBank({
          code: bankDialog.code.trim().toUpperCase(),
          nameAr: bankDialog.nameAr.trim(),
          nameEn: bankDialog.nameEn.trim() || null,
          isActive: bankDialog.isActive,
        });
      }
      setBankDialog(null);
      setSuccess(t('msg.banks.saved'));
      await load();
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setSaving(false);
    }
  }

  async function saveAccount() {
    if (!accountDialog) return;
    setSaving(true);
    setError('');
    try {
      if (accountDialog.id) {
        await updateBankAccount(accountDialog.id, {
          accountName: accountDialog.accountName.trim(),
          isActive: accountDialog.isActive,
        });
      } else {
        await createBankAccount({
          bankId: Number(accountDialog.bankId),
          accountName: accountDialog.accountName.trim(),
          isActive: accountDialog.isActive,
        });
      }
      setAccountDialog(null);
      setSuccess(t('msg.bank_account.saved'));
      await load();
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setSaving(false);
    }
  }

  const bankValid = bankDialog
    ? !!bankDialog.nameAr.trim() && (!!bankDialog.id || /^[A-Z0-9_]{2,32}$/.test(bankDialog.code.trim().toUpperCase()))
    : false;
  const accountValid = accountDialog ? !!accountDialog.accountName.trim() && !!accountDialog.bankId : false;

  return (
    <div className="xpl-scope xpl-page">
      <ExecutiveHeader
        icon="account_balance"
        title={t('page.banks.title')}
        subtitle={t('page.banks.subtitle')}
        chips={
          <>
            <IdChip icon="account_balance" tone="indigo">{banks.length} {t('unit.bank')}</IdChip>
            <IdChip icon="wallet" tone="indigo">{accounts.length} {t('unit.bank_account')}</IdChip>
          </>
        }
        aside={canManage ? (
          <>
            <Button variant="primary" icon="add" onClick={() => setBankDialog({ ...EMPTY_BANK })}>{t('page.banks.new_bank')}</Button>
            <Button variant="ghost" icon="add_card" disabled={activeBanks.length === 0} onClick={() => setAccountDialog({ ...EMPTY_ACCOUNT, bankId: String(activeBanks[0]?.id ?? '') })}>{t('page.banks.new_account')}</Button>
          </>
        ) : undefined}
      />

      {error && <ErrorBanner>{error}</ErrorBanner>}
      {success && <div className="bnk-success"><span className="material-symbols-outlined">check_circle</span>{success}</div>}

      <div className="bnk-metrics">
        <MetricCard icon="account_balance" tone="indigo" label={t('metric.banks.active')} value={String(activeBanks.length)} />
        <MetricCard icon="wallet" tone="blue" label={t('metric.banks.accounts')} value={String(accounts.length)} />
        <MetricCard icon="print" tone="green" label={t('metric.banks.print_ready')} value={String(printableAccounts.length)} sub={t('metric.banks.print_ready_hint')} />
      </div>

      {/* تقرير «لا تخمين»: شيكات قديمة لم يُربَط بها حساب بنكي أثناء الترحيل.
          لا يظهر إطلاقًا حين لا يوجد ما يحتاج قرارًا. */}
      {unlinked.total > 0 && (
        <SectionCard title={t('sec.banks.unlinked_cheques')} icon="link_off">
          <p className="bnk-hint">{t('msg.banks.unlinked_explain')}</p>
          <table className="xpl-table">
            <thead>
              <tr>
                <th>{t('col.cheque.bank')}</th>
                <th>{t('unit.cheque')}</th>
              </tr>
            </thead>
            <tbody>
              {unlinked.groups.map((group) => (
                <tr key={group.bankName}>
                  <td>{group.bankName}</td>
                  <td>{group.count}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </SectionCard>
      )}

      <SectionCard title={t('sec.banks.registry')} icon="account_balance">
        {loading ? (
          <SkeletonRows rows={4} />
        ) : banks.length === 0 ? (
          <EmptyState icon="account_balance" title={t('empty.banks.title')} message={t('empty.banks.hint')} />
        ) : (
          <table className="xpl-table">
            <thead>
              <tr>
                <th>{t('col.bank.name')}</th>
                <th>{t('col.bank.accounts')}</th>
                <th>{t('col.status')}</th>
                {canManage && <th aria-label={t('col.actions')} />}
              </tr>
            </thead>
            <tbody>
              {banks.map((bank) => {
                const bankAccounts = accountsByBank.get(bank.id) ?? [];
                return (
                  <tr key={bank.id}>
                    <td>
                      <div>{bank.nameAr}</div>
                      {bankAccounts.length > 0 && (
                        <div className="bnk-subtext">
                          {bankAccounts.map((a) => a.accountName).join('، ')}
                        </div>
                      )}
                    </td>
                    <td>{bank.accountsCount}</td>
                    <td>
                      <StatusChip tone={bank.isActive ? 'green' : 'neutral'} icon={bank.isActive ? 'check_circle' : 'block'}>
                        {bank.isActive ? t('status.active') : t('status.inactive')}
                      </StatusChip>
                    </td>
                    {canManage && (
                      <td>
                        <Button variant="ghost" icon="edit" onClick={() => setBankDialog({ id: bank.id, code: bank.code, nameAr: bank.nameAr, nameEn: bank.nameEn ?? '', isActive: bank.isActive })}>{t('action.edit')}</Button>
                      </td>
                    )}
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </SectionCard>

      <SectionCard title={t('sec.banks.accounts')} icon="wallet">
        {loading ? (
          <SkeletonRows rows={3} />
        ) : accounts.length === 0 ? (
          <EmptyState icon="wallet" title={t('empty.bank_accounts.title')} message={t('empty.bank_accounts.hint')} />
        ) : (
          <table className="xpl-table">
            <thead>
              <tr>
                <th>{t('col.bank_account.label')}</th>
                <th>{t('col.status')}</th>
                <th>{t('col.bank_account.printing')}</th>
                {canManage && <th aria-label={t('col.actions')} />}
              </tr>
            </thead>
            <tbody>
              {accounts.map((account) => (
                <tr key={account.id}>
                  <td>{account.label}</td>
                  <td>
                    <StatusChip tone={account.isActive ? 'green' : 'neutral'} icon={account.isActive ? 'check_circle' : 'block'}>
                      {account.isActive ? t('status.active') : t('status.inactive')}
                    </StatusChip>
                  </td>
                  <td>
                    {/* للقراءة فقط — لا يوجد في هذه الشاشة أي مسار يمنح حسابًا
                        قالب طباعة؛ ذلك يأتي مع أبعاد الشيك الفعلية في حزمة لاحقة. */}
                    <StatusChip tone={account.printEnabled ? 'green' : 'orange'} icon={account.printEnabled ? 'print' : 'print_disabled'}>
                      {account.printEnabled ? t('status.print_ready') : t('status.print_not_configured')}
                    </StatusChip>
                  </td>
                  {canManage && (
                    <td>
                      <Button variant="ghost" icon="edit" onClick={() => setAccountDialog({ id: account.id, bankId: String(account.bankId), accountName: account.accountName, isActive: account.accountIsActive })}>{t('action.edit')}</Button>
                    </td>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </SectionCard>

      {bankDialog && (
        <Dialog
          icon={bankDialog.id ? 'edit' : 'account_balance'}
          title={bankDialog.id ? t('page.banks.edit_bank') : t('page.banks.new_bank')}
          size="md"
          onClose={() => setBankDialog(null)}
          footer={
            <>
              <Button variant="primary" icon="save" busy={saving} disabled={!bankValid} onClick={saveBank}>{t('action.save')}</Button>
              <Button variant="ghost" onClick={() => setBankDialog(null)}>{t('action.cancel')}</Button>
            </>
          }
        >
          <DialogSection title={t('sec.basic_info')} icon="badge">
            <div className="xpl-field">
              <label>{t('field.bank.code')} <span className="req">*</span></label>
              <input
                className="xpl-input"
                value={bankDialog.code}
                onChange={(e) => setBankDialog({ ...bankDialog, code: e.target.value.toUpperCase() })}
                placeholder="NBK"
                // المعرّف مرساة ثابتة: تغييره بعد الإنشاء يعني تغيير هوية بنك
                // صدرت عليه شيكات، فلا مسار لتعديله لا في الواجهة ولا في الـAPI.
                disabled={!!bankDialog.id}
                style={{ direction: 'ltr' }}
                aria-label={t('field.bank.code')}
              />
              <div className="bnk-field-hint">{t('hint.bank.code')}</div>
            </div>
            <div className="xpl-field">
              <label>{t('field.bank.name_ar')} <span className="req">*</span></label>
              <input className="xpl-input" value={bankDialog.nameAr} onChange={(e) => setBankDialog({ ...bankDialog, nameAr: e.target.value })} aria-label={t('field.bank.name_ar')} />
            </div>
            <div className="xpl-field">
              <label>{t('field.bank.name_en')}</label>
              <input className="xpl-input" value={bankDialog.nameEn} onChange={(e) => setBankDialog({ ...bankDialog, nameEn: e.target.value })} style={{ direction: 'ltr' }} aria-label={t('field.bank.name_en')} />
            </div>
            <div className="xpl-field">
              <label>{t('col.status')}</label>
              <label className="bnk-checkbox">
                <input type="checkbox" checked={bankDialog.isActive} onChange={(e) => setBankDialog({ ...bankDialog, isActive: e.target.checked })} />
                <span>{t('status.active')}</span>
              </label>
              <div className="bnk-field-hint">{t('hint.bank.inactive')}</div>
            </div>
          </DialogSection>
        </Dialog>
      )}

      {accountDialog && (
        <Dialog
          icon={accountDialog.id ? 'edit' : 'add_card'}
          title={accountDialog.id ? t('page.banks.edit_account') : t('page.banks.new_account')}
          size="md"
          onClose={() => setAccountDialog(null)}
          footer={
            <>
              <Button variant="primary" icon="save" busy={saving} disabled={!accountValid} onClick={saveAccount}>{t('action.save')}</Button>
              <Button variant="ghost" onClick={() => setAccountDialog(null)}>{t('action.cancel')}</Button>
            </>
          }
        >
          <DialogSection title={t('sec.basic_info')} icon="badge">
            <div className="xpl-field">
              <label>{t('field.bank_account.bank')} <span className="req">*</span></label>
              <select
                className="xpl-select"
                value={accountDialog.bankId}
                onChange={(e) => setAccountDialog({ ...accountDialog, bankId: e.target.value })}
                // نقل حساب من بنك إلى آخر يعيد تعريف هوية شيكاته المُصدَرة، فلا
                // مسار له هنا ولا في الـAPI.
                disabled={!!accountDialog.id}
                aria-label={t('field.bank_account.bank')}
              >
                {activeBanks.map((bank) => <option key={bank.id} value={bank.id}>{bank.nameAr}</option>)}
              </select>
            </div>
            <div className="xpl-field">
              <label>{t('field.bank_account.name')} <span className="req">*</span></label>
              <input className="xpl-input" value={accountDialog.accountName} onChange={(e) => setAccountDialog({ ...accountDialog, accountName: e.target.value })} placeholder={t('ph.bank_account.name')} aria-label={t('field.bank_account.name')} />
              <div className="bnk-field-hint">{t('hint.bank_account.name')}</div>
            </div>
            <div className="xpl-field">
              <label>{t('col.status')}</label>
              <label className="bnk-checkbox">
                <input type="checkbox" checked={accountDialog.isActive} onChange={(e) => setAccountDialog({ ...accountDialog, isActive: e.target.checked })} />
                <span>{t('status.active')}</span>
              </label>
              <div className="bnk-field-hint">{t('hint.bank_account.inactive')}</div>
            </div>
          </DialogSection>
          {!accountDialog.id && (
            <div className="xpl-info-notice">
              <span className="material-symbols-outlined">info</span>
              {PRINT_PROFILE_MISSING_MESSAGE}
            </div>
          )}
        </Dialog>
      )}
    </div>
  );
}
