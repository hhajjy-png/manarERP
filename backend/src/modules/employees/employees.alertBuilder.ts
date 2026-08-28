const MS_DAY = 86_400_000;

export type DocumentAlert = {
  document: string;
  expiry: Date;
  remainingDays: number;
};

/**
 * Builds the list of expiring/expired document alerts for a single employee.
 * Pure function — no I/O, exported for unit testing.
 *
 * @param today - injectable for deterministic tests; defaults to now
 */
export function buildDocumentAlerts(
  docs: {
    residencyExpiry: Date | null;
    passportExpiry: Date | null;
    licenseExpiry: Date | null;
    vehicleLicenseExpiry?: Date | null;
  },
  days: number,
  today = new Date(),
): DocumentAlert[] {
  const t = new Date(today);
  t.setHours(0, 0, 0, 0);

  const remaining = (d: Date | null): number | null => {
    if (!d) return null;
    const exp = new Date(d);
    exp.setHours(0, 0, 0, 0);
    return Math.round((exp.getTime() - t.getTime()) / MS_DAY);
  };

  const alerts: DocumentAlert[] = [];
  const push = (doc: string, d: Date | null) => {
    const r = remaining(d);
    if (d && r !== null && r <= days) alerts.push({ document: doc, expiry: d, remainingDays: r });
  };

  push('الإقامة', docs.residencyExpiry);
  push('جواز السفر', docs.passportExpiry);
  push('رخصة القيادة', docs.licenseExpiry);
  // Deprecated — vehicle expiry is owned by Equipment/Vehicle registration.
  // vehicleLicenseExpiry intentionally omitted — vehicle registration expiry is the
  // equipment module's responsibility (equipment.registrationExpiry / دفتر المركبة).

  return alerts;
}
