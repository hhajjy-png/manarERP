import { describe, it, expect } from 'vitest';
import { buildDocumentAlerts } from '../employees.alertBuilder';

describe('buildDocumentAlerts', () => {
  // Fixed reference date for deterministic tests — June 9, 2026 midnight local time.
  const TODAY = new Date(2026, 5, 9, 0, 0, 0, 0);

  const dateAt = (daysFromToday: number): Date => {
    const d = new Date(2026, 5, 9, 0, 0, 0, 0);
    d.setDate(d.getDate() + daysFromToday);
    return d;
  };

  // ── Core requirement: vehicleLicenseExpiry must NOT produce a dashboard alert ──────────
  it('does not generate an alert for vehicleLicenseExpiry', () => {
    const alerts = buildDocumentAlerts(
      { residencyExpiry: null, passportExpiry: null, licenseExpiry: null, vehicleLicenseExpiry: dateAt(28) },
      30,
      TODAY,
    );
    expect(alerts).toHaveLength(0);
  });

  it('excludes vehicleLicenseExpiry even when it expires alongside other documents', () => {
    const expiry = dateAt(20);
    const alerts = buildDocumentAlerts(
      { residencyExpiry: expiry, passportExpiry: expiry, licenseExpiry: null, vehicleLicenseExpiry: expiry },
      30,
      TODAY,
    );
    expect(alerts).toHaveLength(2);
    expect(alerts.map((a) => a.document)).not.toContain('رخصة المركبة');
  });

  // ── The three remaining document types must continue to produce alerts ───────────────
  it('generates an alert for residencyExpiry expiring within the window', () => {
    const alerts = buildDocumentAlerts(
      { residencyExpiry: dateAt(10), passportExpiry: null, licenseExpiry: null, vehicleLicenseExpiry: null },
      30,
      TODAY,
    );
    expect(alerts).toHaveLength(1);
    expect(alerts[0].document).toBe('الإقامة');
    expect(alerts[0].remainingDays).toBe(10);
  });

  it('generates an alert for passportExpiry expiring within the window', () => {
    const alerts = buildDocumentAlerts(
      { residencyExpiry: null, passportExpiry: dateAt(15), licenseExpiry: null, vehicleLicenseExpiry: null },
      30,
      TODAY,
    );
    expect(alerts).toHaveLength(1);
    expect(alerts[0].document).toBe('جواز السفر');
    expect(alerts[0].remainingDays).toBe(15);
  });

  it('generates an alert for licenseExpiry expiring within the window', () => {
    const alerts = buildDocumentAlerts(
      { residencyExpiry: null, passportExpiry: null, licenseExpiry: dateAt(5), vehicleLicenseExpiry: null },
      30,
      TODAY,
    );
    expect(alerts).toHaveLength(1);
    expect(alerts[0].document).toBe('رخصة القيادة');
    expect(alerts[0].remainingDays).toBe(5);
  });

  // ── Edge cases ───────────────────────────────────────────────────────────────────────
  it('returns empty array when no documents expire within the window', () => {
    const future = dateAt(60);
    const alerts = buildDocumentAlerts(
      { residencyExpiry: future, passportExpiry: future, licenseExpiry: future, vehicleLicenseExpiry: future },
      30,
      TODAY,
    );
    expect(alerts).toHaveLength(0);
  });

  it('generates an alert for already-expired documents (negative remainingDays)', () => {
    const alerts = buildDocumentAlerts(
      { residencyExpiry: dateAt(-5), passportExpiry: null, licenseExpiry: null, vehicleLicenseExpiry: null },
      30,
      TODAY,
    );
    expect(alerts).toHaveLength(1);
    expect(alerts[0].remainingDays).toBe(-5);
  });

  it('returns empty array when all document fields are null', () => {
    const alerts = buildDocumentAlerts(
      { residencyExpiry: null, passportExpiry: null, licenseExpiry: null, vehicleLicenseExpiry: null },
      30,
      TODAY,
    );
    expect(alerts).toHaveLength(0);
  });
});
