/* ════════════════════════════════════════════════════════════════════════════
   Transaction Intelligence Panel — display-only
   --------------------------------------------------------------------------
   A from-scratch presentation of the intelligence view model built by
   bankTransactionIntelligence.ts (buildTransactionIntelligence). Replaces the
   old vertical label/value field-grid entirely: a hero card (icon + title +
   natural-language summary), compact information chips, icon-led insight
   cards, and the original bank text tucked behind a collapsed disclosure.

   Presentation only — reads the already-built view model, invents nothing.
   Every chip/card is optional and rendered only when its underlying field is
   present, exactly like the field-grid it replaces.
   ════════════════════════════════════════════════════════════════════════════ */
import { useT } from '../lib/i18n';
import {
  channelLabel, chequeDirectionLabel, chequePresentationTypeLabel,
  type TransactionPresentationModel, type TransactionChannel,
} from './bankTransactionIntelligence';
import type { TxBadgeKind } from './BankAccountExplorer';
import './TransactionIntelligencePanel.css';

interface Props {
  intel:     TransactionPresentationModel;
  badgeKind: TxBadgeKind;
}

type TranslateFn = (key: string) => string;

// ── Hero icon resolution ─────────────────────────────────────────────────────
// More specific than the generic deposit/withdrawal direction icon already
// shown in the amount hero above this panel — this one reflects what the
// engine actually recognised (a returned cheque, a cheque, an ATM channel, an
// internal transfer) before falling back to the plain debit/credit direction.

function resolveHeroIcon(intel: TransactionPresentationModel, badgeKind: TxBadgeKind): string {
  if (intel.chequePresentationType === 'returned') return 'cancel';
  if (intel.chequeNumber) return 'receipt_long';
  if (intel.channel === 'atm') return 'local_atm';
  if (intel.title.includes('داخلي')) return 'sync_alt';
  if (badgeKind === 'transfer') return 'swap_horiz';
  if (badgeKind === 'fee') return 'percent';
  if (badgeKind === 'deposit') return 'south_west';
  return 'north_east';
}

const CHANNEL_ICONS: Record<TransactionChannel, string> = {
  atm: 'local_atm', branch: 'storefront', online: 'language',
  clearing: 'sync', pos: 'point_of_sale', transfer_system: 'swap_horiz',
};

// ── Smart information chips ─────────────────────────────────────────────────

interface Chip { key: string; icon: string; label: string; tone?: 'accent' | 'danger'; }

function buildChips(intel: TransactionPresentationModel, t: TranslateFn): Chip[] {
  const chips: Chip[] = [];
  if (intel.channel) {
    chips.push({ key: 'channel', icon: CHANNEL_ICONS[intel.channel], label: channelLabel(intel.channel, t), tone: 'accent' });
  }
  if (intel.chequeNumber) {
    chips.push({ key: 'cheque', icon: 'receipt_long', label: `${t('bank.presentation.chip_cheque_prefix')}${intel.chequeNumber}` });
  }
  if (intel.branch) {
    chips.push({ key: 'branch', icon: 'account_balance', label: `${t('bank.presentation.chip_branch_prefix')} ${intel.branch}` });
  }
  if (intel.referenceNumber) {
    chips.push({ key: 'reference', icon: 'tag', label: `${t('bank.presentation.reference_prefix')} ${intel.referenceNumber}` });
  }
  if (intel.chequeDirection) {
    chips.push({
      key: 'direction',
      icon: intel.chequeDirection === 'incoming' ? 'call_received' : 'call_made',
      label: chequeDirectionLabel(intel.chequeDirection, t),
    });
  }
  if (intel.chequePresentationType) {
    const returned = intel.chequePresentationType === 'returned';
    chips.push({
      key: 'presentation', icon: returned ? 'undo' : 'task_alt',
      label: chequePresentationTypeLabel(intel.chequePresentationType, t),
      tone: returned ? 'danger' : undefined,
    });
  }
  if (intel.sourceAccount || intel.destinationAccount || intel.accountNumber) {
    chips.push({ key: 'account', icon: 'account_balance_wallet', label: t('bank.presentation.chip_account') });
  }
  return chips;
}

// ── Transaction insight cards ────────────────────────────────────────────────

interface Insight { key: string; icon: string; label: string; value: string; mono?: boolean; }

function buildInsights(intel: TransactionPresentationModel, t: TranslateFn): Insight[] {
  const items: Insight[] = [];
  if (intel.channel) {
    items.push({ key: 'channel', icon: CHANNEL_ICONS[intel.channel], label: t('bank.explorer.tx_channel'), value: channelLabel(intel.channel, t) });
  }
  if (intel.counterparty) {
    items.push({ key: 'counterparty', icon: 'person', label: t('bank.explorer.counterparty'), value: intel.counterparty });
  }
  if (intel.sourceAccount) {
    items.push({ key: 'source', icon: 'account_balance_wallet', label: t('bank.explorer.source_account'), value: intel.sourceAccount, mono: true });
  }
  if (intel.destinationAccount) {
    items.push({ key: 'destination', icon: 'account_balance_wallet', label: t('bank.explorer.destination_account'), value: intel.destinationAccount, mono: true });
  }
  if (intel.chequeNumber) {
    items.push({ key: 'chequeNumber', icon: 'receipt_long', label: t('field.cheque.number'), value: intel.chequeNumber, mono: true });
  }
  if (intel.branch) {
    items.push({ key: 'branch', icon: 'account_balance', label: t('bank.explorer.branch'), value: intel.branch, mono: true });
  }
  if (intel.referenceNumber) {
    items.push({ key: 'reference', icon: 'tag', label: t('bank.explorer.reference_number'), value: intel.referenceNumber, mono: true });
  }
  const device = intel.atmId ?? intel.terminalId;
  if (device) {
    items.push({ key: 'device', icon: 'point_of_sale', label: t('bank.explorer.device_number'), value: device, mono: true });
  }
  return items;
}

// ── Component ─────────────────────────────────────────────────────────────────

export function TransactionIntelligencePanel({ intel, badgeKind }: Props) {
  const { t } = useT();
  const chips     = buildChips(intel, t);
  const insights  = buildInsights(intel, t);
  const heroIcon  = resolveHeroIcon(intel, badgeKind);

  return (
    <div className="tip-panel">
      {/* 1. What happened + why — hero card */}
      <div className="tip-hero">
        <div className={`tip-hero-icon tip-hero-icon--${badgeKind}`}>
          <span className="material-symbols-outlined" aria-hidden="true">{heroIcon}</span>
        </div>
        <div className="tip-hero-body">
          <h4 className="tip-hero-title">{intel.title}</h4>
          {intel.summary && <p className="tip-hero-summary">{intel.summary}</p>}
        </div>
      </div>

      {/* 2. Quick-glance signals */}
      {chips.length > 0 && (
        <div className="tip-chips">
          {chips.map((c) => (
            <span key={c.key} className={`tip-chip${c.tone ? ` tip-chip--${c.tone}` : ''}`}>
              <span className="material-symbols-outlined" aria-hidden="true">{c.icon}</span>
              {c.label}
            </span>
          ))}
        </div>
      )}

      {/* 3. Important extracted information */}
      {insights.length > 0 && (
        <div className="tip-insights">
          <div className="tip-insights-title">{t('bank.explorer.tx_insights')}</div>
          <div className="tip-insights-grid">
            {insights.map((i) => (
              <div key={i.key} className="tip-insight-card">
                <span className="material-symbols-outlined tip-insight-icon" aria-hidden="true">{i.icon}</span>
                <div className="tip-insight-body">
                  <span className="tip-insight-label">{i.label}</span>
                  <span className={`tip-insight-value${i.mono ? ' mono' : ''}`}>{i.value}</span>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* 4. Original bank text — collapsed, de-emphasised */}
      {intel.originalDescription.trim() && (
        <details className="tip-raw">
          <summary className="tip-raw-summary">
            <span className="material-symbols-outlined" aria-hidden="true">description</span>
            {t('bank.explorer.original_text')}
          </summary>
          <p className="tip-raw-text">{intel.originalDescription}</p>
        </details>
      )}
    </div>
  );
}
