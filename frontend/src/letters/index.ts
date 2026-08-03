/**
 * Letter Engine — public surface.
 *
 * The engine is a GENERIC document engine. "Official Letter" is one template inside
 * it, not the engine's identity — hence `letters/`, `letters.*` permissions, and a
 * template key rather than a module name.
 *
 * ENTRY POINT (INV-11): the engine is reachable only through the Administrative Forms
 * module. There is no sidebar entry and no direct entry from a business module. That
 * wiring lands with the document list (P5); this pack adds no route and no navigation.
 *
 * WHAT THIS PACK IS
 * ─────────────────
 * Foundation only: registries, the block model, the versioning axes, the font
 * integration layer, the validation framework skeleton, and the rendering contracts.
 * Nothing renders, nothing persists, nothing validates, and no component exists. No
 * file outside `src/letters/` and `src/__tests__/letters/` is touched.
 *
 * `isolatedModules` is on, so every type re-export below is `export type`.
 */

/* ── Versioning ─────────────────────────────────────────────────────────── */
export {
  VERSION_AXES,
  TEMPLATE_VERSIONS,
  LAYOUT_VERSIONS,
  BARCODE_VERSIONS,
  TEMPLATE_VERSION_LATEST,
  LAYOUT_VERSION_LATEST,
  BARCODE_VERSION_LATEST,
  latestVersionStamp,
  getVersions,
  isKnownVersion,
  findVersion,
  latestVersion,
  isKnownVersionStamp,
} from './versioning/versions';
export type {
  EngineVersion,
  TemplateVersion,
  LayoutVersion,
  BarcodeVersion,
  VersionAxis,
  VersionStatus,
  VersionDescriptor,
  DocumentVersionStamp,
} from './versioning/versions';

export { createVersionResolver } from './versioning/resolver';
export type { VersionResolver } from './versioning/resolver';

/* ── Geometry (the only home of a millimetre — INV-4) ───────────────────── */
export {
  PAGE_SIZES,
  PRINT_PROFILE_IDS,
  getPageGeometry,
  findPageGeometry,
  isPrintProfileId,
  pageSizeOf,
  sideMarginMm,
  contentBottomLimitMm,
  textBandBottomMm,
  contentTopForPageMm,
  usableBandMm,
  footerStripTopMm,
  reservedZonesMm,
} from './registry/geometryRegistry';
export type {
  PageSizeId,
  PageSize,
  ContinuationStock,
  PageGeometry,
  PrintProfileId,
} from './registry/geometryRegistry';

/* ── Print profiles ─────────────────────────────────────────────────────── */
export {
  PRINT_PROFILES,
  RESERVED_PRINT_PROFILE_IDS,
  getAllPrintProfiles,
  getEnabledPrintProfiles,
  getPrintProfile,
  findPrintProfile,
  isReservedPrintProfileId,
  getProfileGeometry,
  getContinuationStock,
} from './registry/printProfileRegistry';
export type { PrintProfile, StationeryKind } from './registry/printProfileRegistry';

/* ── Typography (FontId only — INV-5) ───────────────────────────────────── */
export {
  TYPOGRAPHY_ROLES,
  TEXT_ALIGNMENTS,
  FONT_SIZE_LADDER_PT,
  TYPOGRAPHY_PRESET_SETS,
  TYPOGRAPHY_PRESET_SET_IDS,
  isLadderSizePt,
  getTypographyPresetSet,
  getTypographyPreset,
  findTypographyPresetSet,
  presetWeightIsReal,
} from './registry/typographyPresets';
export type {
  TypographyRole,
  TextAlignment,
  TypographyPreset,
  TypographyPresetSet,
  TypographyPresetSetId,
} from './registry/typographyPresets';

/* ── Toolbar catalogue ──────────────────────────────────────────────────── */
export {
  TOOLBAR_COMMANDS,
  TOOLBAR_COMMAND_IDS,
  PROHIBITED_TOOLBAR_COMMANDS,
  getToolbarCommand,
  isToolbarCommandId,
  isProhibitedToolbarCommand,
  resolveToolbarCommands,
} from './registry/toolbarCommands';
export type {
  ToolbarCommandId,
  ToolbarCommandGroup,
  ToolbarCommandDescriptor,
} from './registry/toolbarCommands';

/* ── Validation rule catalogue ──────────────────────────────────────────── */
export {
  VALIDATION_RULES,
  VALIDATION_RULE_IDS,
  getValidationRule,
  isValidationRuleId,
  getBlockingRules,
  getWarningRules,
  selectionParamsMatchShape,
} from './registry/validationRuleCatalog';
export type {
  ValidationSeverity,
  ValidationRuleId,
  ValidationRuleParams,
  ValidationRuleDescriptor,
  ValidationRuleSelection,
} from './registry/validationRuleCatalog';

/* ── Barcode payload specs (INV-13) ─────────────────────────────────────── */
export {
  BARCODE_PAYLOAD_FIELD_IDS,
  BARCODE_PAYLOAD_SPECS,
  getBarcodePayloadSpec,
  findBarcodePayloadSpec,
  isBarcodePayloadFieldId,
} from './registry/barcodeSpecs';
export type { BarcodePayloadFieldId, BarcodePayloadSpec } from './registry/barcodeSpecs';

/* ── Template registry (INV-10) ─────────────────────────────────────────── */
export {
  TEMPLATES,
  TEMPLATE_KEYS,
  RESERVED_REFERENCE_PREFIXES,
  getTemplate,
  findTemplate,
  isTemplateKey,
  getAllTemplates,
  getEnabledTemplates,
  isReservedReferencePrefix,
  getTemplateSection,
  getTemplateSectionKinds,
  getUnusedSectionKinds,
  templateAllowsCommand,
} from './registry/templateRegistry';
export type { DocumentTemplate, TemplateKey, SignatureSlotDefaults } from './registry/templateRegistry';

/* ── Block model (INV-6) ────────────────────────────────────────────────── */
export {
  CONTENT_MODEL_VERSION,
  INLINE_MARKS,
  BLOCK_KINDS,
  LIST_TYPES,
  MAX_INDENT_LEVEL,
  isInlineMark,
  isBlockKind,
  isListType,
  isTextBlock,
  createSpan,
  createBlock,
  createEmptyBlockDocument,
  createInitialBlockDocument,
} from './model/blockTypes';
export type {
  InlineMark,
  InlineSpan,
  BlockKind,
  ListType,
  BlockAttributes,
  Block,
  BlockDocument,
} from './model/blockTypes';

export {
  validateBlockDocument,
  isValidBlockDocument,
  assertValidBlockDocument,
} from './model/blockModelIntegrity';
export type { BlockModelDefect } from './model/blockModelIntegrity';

/* ── Paragraph operations (pure; the composer's engine) ─────────────────── */
export {
  blockText,
  blockMarks,
  blockHasMark,
  findBlock,
  blockIndex,
  documentText,
  isDocumentEmpty,
  normaliseToSingleSpan,
  normaliseDocument,
  setBlockText,
  setBlockAttributes,
  setAllBlockAttributes,
  toggleBlockMark,
  clearBlockFormatting,
  insertParagraphAfter,
  appendParagraph,
  splitParagraph,
  mergeWithPrevious,
  removeBlock,
  moveBlock,
  serialiseDocument,
  parseDocument,
} from './editor/blockCommands';

/* ── Sections ───────────────────────────────────────────────────────────── */
export {
  SECTION_KINDS,
  SECTION_PAGE_SCOPES,
  isSectionKind,
  isSectionPageScope,
  findSectionSpec,
  findSectionInstance,
  sectionInstanceIsConsistent,
} from './model/sectionTypes';
export type {
  SectionKind,
  SectionPageScope,
  SectionSpec,
  SectionInstance,
  SectionContent,
  DateSectionContent,
  RecipientSectionContent,
  SubjectSectionContent,
  ContentSectionContent,
  SignatureSectionContent,
  BarcodeSectionContent,
} from './model/sectionTypes';

/* ── Document (INV-8, INV-9) ────────────────────────────────────────────── */
export {
  LETTER_STATUSES,
  LETTER_STATUS_LABELS_AR,
  isLetterStatus,
  hasReference,
  isContentIdentityFrozen,
} from './model/documentTypes';
export type { LetterStatus, LetterDocument, RegistrationSnapshot } from './model/documentTypes';

/* ── Font integration (INV-5) ───────────────────────────────────────────── */
export {
  getLetterFontPool,
  getLetterFontIds,
  isLetterPoolFontId,
  findLetterFont,
  letterFontStack,
  resolveTypography,
  resolveTemplateTypography,
  hasRealBold,
} from './fonts/fontIntegration';
export type { ResolvedTypography } from './fonts/fontIntegration';

/* ── Validation engine ──────────────────────────────────────────────────── */
export {
  createValidationRuleRegistry,
  createValidationRunner,
  runValidation,
  issuesOfSeverity,
  getBlockingIssues,
  getWarningIssues,
  hasBlockingIssues,
  summarise,
  assertNoBlockingIssues,
} from './validation/framework';
export type {
  ValidationLocation,
  ValidationIssue,
  ValidationFinding,
  ValidationRuleImplementation,
  ValidationRuleRegistry,
  ValidationRunner,
  ValidationResult,
  ValidationSummary,
} from './validation/framework';

export { VALIDATION_INPUTS } from './validation/context';
export type { LetterValidationContext, ValidationInput } from './validation/context';

export { IMPLEMENTED_RULES, createLetterValidationRegistry } from './validation/rules';

/* ── Pagination ─────────────────────────────────────────────────────────── */
export { paginate, pageIndexOfItem, samePagination } from './pagination/paginate';
export type {
  PaginationItem,
  PaginationItemKind,
  PaginatedPage,
  PaginationResult,
} from './pagination/paginate';
export { pxPerMm, measureHeightMm, mmToPx, pxToMm, roundMm } from './pagination/measure';

/* ── Rendering contracts (INV-7 — no renderer implemented) ──────────────── */
export {
  RENDER_TARGETS,
  registerDocumentRenderer,
  getDocumentRenderer,
  hasDocumentRenderer,
  __resetDocumentRendererForTests,
} from './rendering/contracts';
export type {
  RenderTarget,
  RenderRequest,
  RenderResult,
  DocumentRenderer,
} from './rendering/contracts';
