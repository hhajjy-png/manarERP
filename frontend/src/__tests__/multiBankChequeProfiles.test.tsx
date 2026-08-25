// @vitest-environment jsdom
/**
 * Multi-Bank Cheque Template Readiness v1.
 *
 * The Gulf Bank A4 template proved the pipeline. Adding a second bank must mean
 * adding a PROFILE — a table of measurements — not copying the print path. This
 * suite locks the readiness contract:
 *
 *   • three separate profiles exist: GULF_BANK (APPROVED), KFH and NBK
 *     (PROVISIONAL — seeded working geometry, awaiting their own cheques);
 *   • Gulf still prints, unchanged in every number;
 *   • KFH and NBK hold their OWN copies of the baseline: no object is shared
 *     with Gulf or with each other, so editing one cannot reach another;
 *   • neither uses Gulf's cheque photo;
 *   • production print is refused for a PROVISIONAL profile — being calibratable
 *     is not the same claim as being measured;
 *   • each bank's calibration is stored under its own key;
 *   • the date is one block with internal slots for every bank, by construction.
 */
import { describe, it, expect } from 'vitest';

import {
  BANK_CHEQUE_PROFILES,
  CHEQUE_PRINTABLE_BINDINGS,
  GULF_A4_CALIBRATION_SETTING_KEY,
  GULF_A4_TEMPLATE_NAME,
  GULF_BANK_CODE,
  GULF_CHEQUE_BASE_X_MM,
  GULF_CHEQUE_BASE_Y_MM,
  GULF_CHEQUE_HEIGHT_MM,
  GULF_CHEQUE_SURFACE_CM,
  GULF_CHEQUE_WIDTH_MM,
  GULF_LOCAL_FIELDS,
  KFH_BANK_CODE,
  KFH_CALIBRATION_SETTING_KEY,
  NBK_BANK_CODE,
  NBK_CALIBRATION_SETTING_KEY,
  PROFILE_NOT_CALIBRATED_MESSAGE,
  SETUP_PLACEHOLDER_SURFACE_CM,
  bankChequeProfileByCode,
  chequeProfilePrintability,
  gulfChequeFields,
  gulfFactoryProfile,
  isProfilePrintable,
  localFieldsToDesignerFields,
  profileDesignerFields,
  profilePlacementMm,
  profileSurfaceCm,
  resolveBankChequeProfile,
} from '../modules/chequePrint';
import {
  PROFILE_PROVISIONAL_MESSAGE,
  PROVISIONAL_BASE_GEOMETRY,
  PROVISIONAL_BASE_PLACEMENT,
  isProfileCalibratable,
} from '../modules/chequePrint';
import type { BankChequeProfileDefinition, ChequeLocalField } from '../modules/chequePrint';

const gulf = () => bankChequeProfileByCode(GULF_BANK_CODE)!;
const kfh = () => bankChequeProfileByCode(KFH_BANK_CODE)!;
const nbk = () => bankChequeProfileByCode(NBK_BANK_CODE)!;
const pending = () => [kfh(), nbk()];

// ── 1. Three separate profiles ───────────────────────────────────────────────

describe('the bank profile registry', () => {
  it('registers exactly Gulf, KFH and NBK — one profile per bank', () => {
    expect(BANK_CHEQUE_PROFILES.map((p) => p.bankCode)).toEqual([GULF_BANK_CODE, KFH_BANK_CODE, NBK_BANK_CODE]);
    expect(new Set(BANK_CHEQUE_PROFILES.map((p) => p.bankCode)).size).toBe(3);
  });

  it('identifies banks by their registry CODE, not by a name string', () => {
    // The codes are the ones the Multi-Bank registry already seeds.
    expect([GULF_BANK_CODE, KFH_BANK_CODE, NBK_BANK_CODE]).toEqual(['GULF_BANK', 'KFH', 'NBK']);
    expect(resolveBankChequeProfile({ bankCode: 'KFH' })!.bankCode).toBe('KFH');
    expect(resolveBankChequeProfile({ bankCode: 'NBK' })!.bankCode).toBe('NBK');
    // The Arabic-name path exists only for legacy, account-less cheques.
    expect(resolveBankChequeProfile({ bankNameAr: 'بيت التمويل الكويتي' })!.bankCode).toBe('KFH');
    expect(resolveBankChequeProfile({ bankNameAr: 'بنك الكويت الوطني' })!.bankCode).toBe('NBK');
  });

  it('resolves an unknown bank to nothing — never to another bank’s profile', () => {
    expect(resolveBankChequeProfile({ bankCode: 'BURGAN' })).toBeNull();
    expect(resolveBankChequeProfile({ bankNameAr: 'بنك برقان' })).toBeNull();
    expect(resolveBankChequeProfile({})).toBeNull();
    expect(bankChequeProfileByCode(null)).toBeNull();
  });

  it('names each template for its own bank', () => {
    expect(gulf().displayName).toBe(GULF_A4_TEMPLATE_NAME);
    expect(kfh().displayName).toBe('قالب شيك بيت التمويل الكويتي');
    expect(nbk().displayName).toBe('قالب شيك بنك الكويت الوطني');
  });
});

// ── 2. Status ────────────────────────────────────────────────────────────────

describe('profile status', () => {
  it('marks Gulf approved and the other two provisional', () => {
    expect(gulf().status).toBe('APPROVED');
    expect(kfh().status).toBe('PROVISIONAL');
    expect(nbk().status).toBe('PROVISIONAL');
  });

  it('gives each provisional profile the seeded working geometry', () => {
    for (const p of pending()) {
      expect(p.chequeGeometry, p.bankCode).toEqual({ widthMm: 180, heightMm: 90 });
      expect(p.placement, p.bankCode).toEqual({ xMm: 117, yMm: 60 });
      expect(p.chequeGeometry, p.bankCode).toEqual(PROVISIONAL_BASE_GEOMETRY);
      expect(p.placement, p.bankCode).toEqual(PROVISIONAL_BASE_PLACEMENT);
    }
  });

  it('gives each provisional profile the seeded working field table', () => {
    for (const p of pending()) {
      expect(p.fields.map((f) => ({ id: f.id, xMm: f.xMm, yMm: f.yMm, widthMm: f.widthMm, heightMm: f.heightMm })), p.bankCode)
        .toEqual([
          { id: 'beneficiary', xMm: 8, yMm: 23.5, widthMm: 108, heightMm: 7 },
          { id: 'chequeDate', xMm: 135, yMm: 23, widthMm: 28, heightMm: 7 },
          { id: 'amountInWords', xMm: 10, yMm: 33, widthMm: 105, heightMm: 16 },
          { id: 'amount', xMm: 132, yMm: 40, widthMm: 38.5, heightMm: 8.5 },
        ]);
    }
  });

  it('makes every profile calibratable, and only the approved one printable', () => {
    for (const p of [gulf(), ...pending()]) {
      expect(isProfileCalibratable(p), p.bankCode).toBe(true);
    }
    expect(isProfilePrintable(gulf())).toBe(true);
    for (const p of pending()) expect(isProfilePrintable(p), p.bankCode).toBe(false);
  });
});

// ── 3. Nothing physical is inherited from Gulf ───────────────────────────────

describe('the profiles are independent objects', () => {
  it('shares no object between Gulf, KFH and NBK', () => {
    const all = [gulf(), kfh(), nbk()];
    for (const a of all) {
      for (const b of all) {
        if (a === b) continue;
        expect(a.fields, `${a.bankCode}/${b.bankCode}`).not.toBe(b.fields);
        expect(a.chequeGeometry, `${a.bankCode}/${b.bankCode}`).not.toBe(b.chequeGeometry);
        expect(a.placement, `${a.bankCode}/${b.bankCode}`).not.toBe(b.placement);
        for (const fa of a.fields) {
          for (const fb of b.fields) expect(fa, `${a.bankCode}.${fa.id}`).not.toBe(fb);
        }
      }
    }
  });

  it('does not read the Gulf field table — a provisional profile owns its own', () => {
    for (const p of pending()) {
      expect(p.fields, p.bankCode).not.toBe(GULF_LOCAL_FIELDS);
      for (const f of p.fields) {
        expect(GULF_LOCAL_FIELDS.includes(f as never), `${p.bankCode}.${f.id}`).toBe(false);
      }
    }
  });

  it('mutating one profile’s field cannot reach another', () => {
    const k = kfh();
    const n = nbk();
    const g = gulf();
    const before = { nbk: n.fields[0].xMm, gulf: g.fields[0].xMm };
    // Simulate an in-place edit of KFH's own copy.
    (k.fields[0] as { xMm: number }).xMm = 42;
    expect(nbk().fields[0].xMm).toBe(before.nbk);
    expect(gulf().fields[0].xMm).toBe(before.gulf);
    (k.fields[0] as { xMm: number }).xMm = before.gulf;
  });

  it('never hands a provisional profile Gulf’s cheque photo', () => {
    expect(gulf().previewBackground).toBeTruthy();
    for (const p of pending()) {
      expect(p.previewBackground, p.bankCode).toBeNull();
      expect(p.previewBackground, p.bankCode).not.toBe(gulf().previewBackground);
    }
  });

  it('offers a NEUTRAL setup placeholder surface — not any bank’s cheque size', () => {
    expect(SETUP_PLACEHOLDER_SURFACE_CM).not.toEqual(GULF_CHEQUE_SURFACE_CM);
    expect(SETUP_PLACEHOLDER_SURFACE_CM.widthCm / SETUP_PLACEHOLDER_SURFACE_CM.heightCm)
      .toBeCloseTo(297 / 210, 6);
  });
});

// ── 4. Physical print is refused before the profile is complete ──────────────

describe('print protection', () => {
  it('allows Gulf — the approved, measured profile', () => {
    expect(chequeProfilePrintability(gulf())).toEqual({ ok: true });
    expect(isProfilePrintable(gulf())).toBe(true);
  });

  it('refuses KFH and NBK as PROVISIONAL, with a message that says why', () => {
    for (const p of pending()) {
      const verdict = chequeProfilePrintability(p);
      expect(verdict.ok, p.bankCode).toBe(false);
      if (!verdict.ok) expect(verdict.message).toBe(PROFILE_PROVISIONAL_MESSAGE);
      expect(isProfilePrintable(p), p.bankCode).toBe(false);
    }
    expect(PROFILE_PROVISIONAL_MESSAGE).toContain('إعداد افتراضي');
    expect(PROFILE_PROVISIONAL_MESSAGE).toContain('الشيك الأصلي');
    // A complete geometry never talks its way past the status check.
    for (const p of pending()) expect(isProfileCalibratable(p), p.bankCode).toBe(true);
  });

  it('refuses an unregistered bank with the same message — no fallback profile', () => {
    const verdict = chequeProfilePrintability(resolveBankChequeProfile({ bankCode: 'BURGAN' }));
    expect(verdict.ok).toBe(false);
    if (!verdict.ok) expect(verdict.message).toBe(PROFILE_NOT_CALIBRATED_MESSAGE);
  });

  it('is structural — geometry alone cannot unlock printing', () => {
    const base = kfh();
    // A complete geometry with a PROVISIONAL status stays refused.
    expect(isProfileCalibratable(base)).toBe(true);
    expect(isProfilePrintable(base)).toBe(false);

    // Stripping the geometry from an APPROVED-looking profile is also refused,
    // so approval alone is not sufficient either.
    const emptied: BankChequeProfileDefinition = {
      ...base, status: 'APPROVED', chequeGeometry: null, placement: null, fields: [],
    };
    expect(isProfilePrintable(emptied)).toBe(false);

    // Both together — measured geometry AND an approved status — is what prints.
    const approved: BankChequeProfileDefinition = { ...base, status: 'APPROVED' };
    expect(isProfilePrintable(approved)).toBe(true);
  });

  it('requires all four printable values — a missing one blocks the print', () => {
    for (const omitted of CHEQUE_PRINTABLE_BINDINGS) {
      const fields = CHEQUE_PRINTABLE_BINDINGS.filter((b) => b !== omitted).map((binding, i) => ({
        id: binding, binding, label: binding,
        xMm: 10, yMm: 10 + i * 10, widthMm: 40, heightMm: 7,
        fontSizePx: 12, fontWeight: 400, textAlign: 'right' as const, zIndex: i + 1,
      }));
      const p: BankChequeProfileDefinition = {
        ...kfh(), status: 'APPROVED',
        chequeGeometry: { widthMm: 175, heightMm: 85 }, placement: { xMm: 100, yMm: 50 }, fields,
      };
      expect(isProfilePrintable(p), `missing ${omitted}`).toBe(false);
    }
  });
});

// ── 5. Independent calibration identity ──────────────────────────────────────

describe('calibration identity', () => {
  it('gives every bank its own settings key', () => {
    const keys = BANK_CHEQUE_PROFILES.map((p) => p.settingKey);
    expect(keys).toEqual([
      GULF_A4_CALIBRATION_SETTING_KEY,
      KFH_CALIBRATION_SETTING_KEY,
      NBK_CALIBRATION_SETTING_KEY,
    ]);
    expect(new Set(keys).size).toBe(3);
  });

  it('keeps Gulf’s key exactly as released, and namespaces the new ones per bank', () => {
    expect(GULF_A4_CALIBRATION_SETTING_KEY).toBe('cheque.calibration.gulf-a4.v1');
    expect(KFH_CALIBRATION_SETTING_KEY).toBe('cheque.calibration.kfh-a4.v1');
    expect(NBK_CALIBRATION_SETTING_KEY).toBe('cheque.calibration.nbk-a4.v1');
    for (const key of [KFH_CALIBRATION_SETTING_KEY, NBK_CALIBRATION_SETTING_KEY]) {
      expect(key).not.toBe(GULF_A4_CALIBRATION_SETTING_KEY);
    }
  });
});

// ── 6. Date Block architecture is ready for every bank ───────────────────────

describe('date block readiness', () => {
  it('models the date as ONE field with internal slots, for every bank', () => {
    for (const p of BANK_CHEQUE_PROFILES) {
      const date = p.fields.find((f) => f.id === 'chequeDate');
      expect(date, p.bankCode).toBeTruthy();
      expect(date!.slotsMm!.map((slot) => slot.key), p.bankCode)
        .toEqual(['chequeDay', 'chequeMonth', 'chequeYear']);
      // No bank has separate day/month/year FIELDS.
      const ids = p.fields.map((f) => f.id);
      for (const gone of ['chequeDay', 'chequeMonth', 'chequeYear']) {
        expect(ids, `${p.bankCode}/${gone}`).not.toContain(gone);
      }
    }
  });

  it('gives the provisional date block the seeded 0 / 9 / 18 mm slots', () => {
    for (const p of pending()) {
      const date = p.fields.find((f) => f.id === 'chequeDate')!;
      expect(date.slotsMm!.map((slot) => ({ key: slot.key, xMm: slot.xMm, widthMm: slot.widthMm })), p.bankCode)
        .toEqual([
          { key: 'chequeDay', xMm: 0, widthMm: 6 },
          { key: 'chequeMonth', xMm: 9, widthMm: 6 },
          { key: 'chequeYear', xMm: 18, widthMm: 10 },
        ]);
    }
  });

  it('converts any bank’s measured table through the ONE shared converter', () => {
    // A hypothetical future bank: different size, different coordinates — the
    // same converter, with no Gulf number involved.
    const fields: ChequeLocalField[] = [
      {
        id: 'chequeDate', binding: 'chequeDate', label: 'التاريخ',
        xMm: 100, yMm: 20, widthMm: 30, heightMm: 8,
        fontSizePx: 13, fontWeight: 700, textAlign: 'center', zIndex: 1,
        slotsMm: [
          { key: 'chequeDay', xMm: 0, widthMm: 7 },
          { key: 'chequeMonth', xMm: 10, widthMm: 7 },
          { key: 'chequeYear', xMm: 20, widthMm: 10 },
        ],
      },
    ];
    const [date] = localFieldsToDesignerFields(fields, 200, 100);
    expect(date.x).toBeCloseTo(50, 9);
    expect(date.y).toBeCloseTo(20, 9);
    expect(date.width).toBeCloseTo(15, 9);
    expect(date.slots!.map((s) => s.key)).toEqual(['chequeDay', 'chequeMonth', 'chequeYear']);
    // Slot offsets are percentages of the FIELD's box, so they travel with it.
    expect(date.slots![1].xPercent).toBeCloseTo((10 / 30) * 100, 9);
  });
});

// ── 7. No regression in the released Gulf template ───────────────────────────

describe('Gulf template unchanged', () => {
  it('keeps its geometry, placement and field table exactly as released', () => {
    expect(GULF_CHEQUE_WIDTH_MM).toBe(180);
    expect(GULF_CHEQUE_HEIGHT_MM).toBe(90);
    expect(GULF_CHEQUE_BASE_X_MM).toBe(117);
    expect(GULF_CHEQUE_BASE_Y_MM).toBe(60);
    expect(GULF_LOCAL_FIELDS.map((f) => ({ id: f.id, xMm: f.xMm, yMm: f.yMm, widthMm: f.widthMm, heightMm: f.heightMm }))).toEqual([
      { id: 'beneficiary', xMm: 8, yMm: 23.5, widthMm: 108, heightMm: 7 },
      { id: 'chequeDate', xMm: 135, yMm: 23, widthMm: 28, heightMm: 7 },
      { id: 'amountInWords', xMm: 10, yMm: 33, widthMm: 105, heightMm: 16 },
      { id: 'amount', xMm: 132, yMm: 40, widthMm: 38.5, heightMm: 8.5 },
    ]);
  });

  it('produces the identical DesignerField output through the shared converter', () => {
    // `gulfChequeFields()` now delegates to `localFieldsToDesignerFields`; this
    // proves the delegation changed no number the approved template prints.
    expect(gulfChequeFields()).toEqual(
      localFieldsToDesignerFields(GULF_LOCAL_FIELDS, GULF_CHEQUE_WIDTH_MM, GULF_CHEQUE_HEIGHT_MM),
    );
    expect(gulfFactoryProfile().fields).toEqual(gulfChequeFields());
    expect(profileDesignerFields(gulf())).toEqual(gulfChequeFields());
  });

  it('reads its registry entry from the released module, so the two cannot drift', () => {
    expect(profileSurfaceCm(gulf())).toEqual(GULF_CHEQUE_SURFACE_CM);
    expect(profilePlacementMm(gulf())).toEqual({ xMm: 117, yMm: 60, widthMm: 180, heightMm: 90 });
    // Calibration offsets move the area, exactly as the released behaviour does.
    expect(profilePlacementMm(gulf(), { offsetXMm: -1.5, offsetYMm: 0.8 }))
      .toEqual({ xMm: 115.5, yMm: 60.8, widthMm: 180, heightMm: 90 });
  });
});
