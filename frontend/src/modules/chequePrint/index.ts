/**
 * Cheque printing — shared contract barrel (Deterministic Geometry & Unified
 * Pipeline Pack v1). The single import point for the physical page contract and
 * the resolved print job used by every cheque print entry point.
 */
export {
  MM_PER_CM,
  MICRONS_PER_MM,
  CSS_PX_PER_MM,
  MIN_PAGE_MICRONS,
  A4_PORTRAIT_MM,
  A4_LANDSCAPE_MM,
  A4_LANDSCAPE_PAGE,
  cmToMm,
  mmToMicrons,
  mmToCssPx,
  realChequePage,
  physicalPageFor,
  cssPageRule,
  printOptionsFor,
} from './physicalPage';
export type { PhysicalPageSpec, ChequePaperKind, ChequePrintOptions, ChequeA4Placement } from './physicalPage';

export {
  GULF_A4_TEMPLATE_NAME,
  GULF_BANK_CODE,
  GULF_BANK_NAME_AR,
  GULF_CHEQUE_WIDTH_MM,
  GULF_CHEQUE_HEIGHT_MM,
  GULF_CHEQUE_SURFACE_CM,
  GULF_CHEQUE_BASE_X_MM,
  GULF_CHEQUE_BASE_Y_MM,
  GULF_A4_OFFSET_X_MM,
  GULF_A4_OFFSET_Y_MM,
  GULF_A4_CALIBRATION,
  GULF_A4_CALIBRATION_SETTING_KEY,
  GULF_A4_CALIBRATION_SETTING_GROUP,
  GULF_LOCAL_FIELDS,
  gulfChequeAreaMm,
  gulfChequeFields,
  gulfFieldFinalMm,
  gulfCalibrationFromSettings,
  parseGulfCalibration,
  serializeGulfCalibration,
  GULF_A4_PROFILE_ID,
  GULF_DATE_SLOTS_MM,
  gulfFactoryProfile,
  parseGulfProfile,
  serializeGulfProfile,
  gulfProfileFromSettings,
  gulfProfilePlacement,
} from './gulfBankA4Profile';
export type { GulfCalibration, GulfLocalField, GulfA4Profile } from './gulfBankA4Profile';

export {
  CALIBRATION_PROFILES,
  CALIBRATION_PROFILE_LABELS,
  DEFAULT_CALIBRATION_PROFILE,
  DEFAULT_PROFILE_SETTING_KEY,
  LEGACY_ADOPTING_CALIBRATION_PROFILE,
  isCalibrationProfileId,
  readDefaultCalibrationProfile,
  calibrationSettingKey,
  legacyCalibrationSettingKey,
} from './calibrationProfiles';
export type { CalibrationProfileId } from './calibrationProfiles';

export {
  CHEQUE_PRINTABLE_BINDINGS,
  PROFILE_NOT_CALIBRATED_MESSAGE,
  PROFILE_PROVISIONAL_MESSAGE,
  PROFILE_STATUS_LABELS,
  PROFILE_STATUS_HINTS,
  localFieldsToDesignerFields,
  profilePrintability,
  isProfilePrintable,
  isProfileCalibratable,
} from './chequeProfileDefinition';
export type {
  ChequeLocalField,
  BankChequeProfileStatus,
  BankChequeProfileDefinition,
  ChequePhysicalGeometry,
  ChequePagePlacement,
  ProfilePrintability,
} from './chequeProfileDefinition';

export {
  BANK_CHEQUE_PROFILES,
  KFH_BANK_CODE,
  NBK_BANK_CODE,
  KFH_CALIBRATION_SETTING_KEY,
  NBK_CALIBRATION_SETTING_KEY,
  PROVISIONAL_BASE_GEOMETRY,
  PROVISIONAL_BASE_PLACEMENT,
  SETUP_PLACEHOLDER_SURFACE_CM,
  profileFactoryDocument,
  profileDocumentFromSettings,
  bankChequeProfileByCode,
  resolveBankChequeProfile,
  chequeProfilePrintability,
  profileSurfaceCm,
  profileDesignerFields,
  profilePlacementMm,
} from './bankChequeProfiles';

export { buildChequePrintJob } from './chequePrintJob';
export type {
  ChequePrintJob,
  ChequePrintItem,
  ChequePrintPurpose,
  ResolvedTemplateRef,
  ChequeTrackingRef,
  BuildChequePrintJobInput,
} from './chequePrintJob';


export {
  MIN_GLYPH_ADVANCE_EM,
  WRAPPED_LINE_HEIGHT_FACTOR,
  surfaceWidthPx,
  fontSizeToCqw,
  estimateTextWidthPx,
  textDefinitelyOverflows,
  maxLinesFor,
} from './textFit';
