import React from 'react';
import { useUI } from '../stores/uiStore';
import './privacy.css';

export interface PrivateAmountProps {
  /** Numeric value (will be formatted) or pre-formatted string (used as-is). */
  value: number | string;
  /** Currency symbol appended when value is numeric. Default: 'د.ك' */
  currency?: string;
  /**
   * Masking level:
   * 1 = full mask with ● characters (financial amounts)
   * 2 = show last 4 characters (bank accounts, IBANs)
   */
  level?: 1 | 2;
  /**
   * Override masking state. When omitted the component reads from the
   * global privacy store automatically.
   */
  masked?: boolean;
  /**
   * When true the element is hidden in print entirely.
   * Use ONLY for UI-only decorations (badges, toggles) — never for financial values.
   * Financial amounts always print with their real value regardless of masking state.
   */
  noPrint?: boolean;
  className?: string;
  style?: React.CSSProperties;
}

const CURRENCY_INDICATORS = ['د.ك', 'KWD', '$', '€', '£', '¥'];

function formatNumber(value: number, currency: string): string {
  const formatted = value.toLocaleString('en-US', {
    minimumFractionDigits: 3,
    maximumFractionDigits: 3,
  });
  return `${formatted} ${currency}`;
}

function getFormatted(value: number | string, currency: string): string {
  if (typeof value === 'number') return formatNumber(value, currency);
  const str = String(value);
  // Already contains a currency symbol — don't append another
  if (CURRENCY_INDICATORS.some((sym) => str.includes(sym))) return str;
  return str;
}

function buildLevel1Mask(formatted: string): string {
  // Replace every character with ● to match visual length proportionally
  const bullets = '●'.repeat(formatted.length);
  return `🔒 ${bullets}`;
}

function buildLevel2Mask(value: string): string {
  // Show last 4 characters, mask the rest
  if (value.length <= 4) return `🔒 ${value}`;
  const last4 = value.slice(-4);
  const maskLen = value.length - 4;
  return `🔒 ${'●'.repeat(maskLen)}${last4}`;
}

export function usePrivacyMode(): boolean {
  return useUI((s) => s.privacyMode);
}

export default function PrivateAmount({
  value,
  currency = 'د.ك',
  level = 1,
  masked,
  noPrint = false,
  className,
  style,
}: PrivateAmountProps) {
  const storeMasked = usePrivacyMode();
  const shouldMask = masked !== undefined ? masked : storeMasked;

  const formatted = getFormatted(value, currency);
  const maskDisplay =
    level === 1
      ? buildLevel1Mask(formatted)
      : buildLevel2Mask(String(value));

  // UI-only elements: obey masking on screen but disappear entirely in print
  if (noPrint) {
    return (
      <span className={`pm-ui-only${className ? ` ${className}` : ''}`} style={style}>
        {shouldMask ? maskDisplay : formatted}
      </span>
    );
  }

  // Financial values: dual-render — CSS toggles visibility for screen vs print
  // Screen: .pm-mask visible / .pm-real hidden (controlled by inline display)
  // Print:  .pm-mask forced hidden / .pm-real forced visible via privacy.css
  return (
    <span className={className} style={style}>
      <span
        className="pm-mask"
        style={{ display: shouldMask ? 'inline' : 'none' }}
        aria-hidden={!shouldMask}
      >
        {maskDisplay}
      </span>
      <span
        className="pm-real"
        style={{ display: shouldMask ? 'none' : 'inline' }}
        aria-hidden={shouldMask}
      >
        {formatted}
      </span>
    </span>
  );
}
