/**
 * Document Studio — the Official Letter composer.
 *
 * A structured, government-style document studio. NOT a free word processor: the
 * document is six independent sections, formatting applies to whole paragraphs, and
 * every tool is drawn from the template's approved allow-list.
 *
 * ══════════════════════════════════════════════════════════════════════════
 *  WHAT DOCUMENT STUDIO FOUNDATION v1 CHANGED — AND WHAT IT DID NOT
 * ══════════════════════════════════════════════════════════════════════════
 * CHANGED: the editing experience. A grouped toolbar, named paragraph and character
 * styles, six heading levels, lists, three additional marks, the four spacing controls,
 * a format painter, find and replace, a status bar, a navigation rail with a mini map
 * and an outline, seven zoom rungs, ruler indicators, and a published keyboard map.
 *
 * NOT CHANGED, and deliberately so:
 *   · THE PRINT PATH. `useLetterPrint` and `printPipeline` are untouched. Printing
 *     still renders the live view in its read-only form — the same components, the same
 *     geometry, the same pagination. No new print transport was written.
 *   · THE PAGINATOR. Every new attribute is expressed as CSS by `blockStyle`, so the
 *     hidden measurement mirror measures it. The paginator models none of them.
 *   · THE VALIDATION ENGINE. Same context, same rules, same thresholds.
 *   · THE SAVE AND REGISTRATION CONTRACTS. Same endpoints, same payloads, same
 *     snapshot shape.
 *   · THE BLOCK MODEL AS SOLE SOURCE OF TRUTH. Still JSON, still no HTML produced and
 *     none parsed, still no inverse from rendered output back to the document.
 *
 * ── EDITING IS STILL DRAFT-ONLY ──────────────────────────────────────────
 * The backend refuses edits once a letter is registered — its content is bound to a
 * frozen snapshot and a permanent number. The studio reflects that by going read-only
 * rather than by letting the user type into something the server will reject. Find
 * still works on a registered letter; replace does not.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { api, errorMessage } from '../api/client';
import { useAuth } from '../stores/authStore';
import { useT } from '../lib/i18n';
import { useToast } from '../stores/toastStore';
import { usePersistedState } from '../hooks/usePersistedState';
import { Button, ErrorBanner, Icon, SkeletonRows, StatusChip } from '../components/explorer/ExplorerKit';
import '../components/explorer/explorer-kit.css';
import LetterPageStack from '../components/letters/LetterPageStack';
import {
  PROBE_WIDTH_MM,
  type MeasurableItem,
  useLetterPagination,
} from '../components/letters/useLetterPagination';
import DocumentToolbar, {
  DocumentViewControls,
  type ToolbarState,
} from '../components/letters/studio/DocumentToolbar';
import AdvancedToolsMenu from '../components/letters/studio/AdvancedToolsMenu';
import FloatingContextToolbar from '../components/letters/studio/FloatingContextToolbar';
import { useResizableRail } from '../components/letters/studio/useResizableRail';
import RailResizeHandle from '../components/letters/studio/RailResizeHandle';
import { textareaSelectionRect } from '../lib/textareaSelectionRect';
import DocumentStatusBar from '../components/letters/studio/DocumentStatusBar';
import LayoutToolbar from '../components/letters/studio/LayoutToolbar';
import LayoutCanvas from '../components/letters/studio/LayoutCanvas';
import LayoutObjectView from '../components/letters/studio/LayoutObjectView';
import LayersPanel from '../components/letters/studio/LayersPanel';
import ObjectInspector from '../components/letters/studio/ObjectInspector';
import { useLayoutSelection } from '../components/letters/studio/useLayoutSelection';
import InsertPanel from '../components/letters/studio/InsertPanel';
import DocumentPropertiesPanel from '../components/letters/studio/DocumentPropertiesPanel';
import ConditionEditor from '../components/letters/studio/ConditionEditor';
import {
  type ExportFormat,
  EXPORT_FORMATS,
  composeLetter,
  exportFilename,
  runDocxExport,
  runExport,
} from '../components/letters/studio/exportPipeline';
import {
  useAccurateFormPreview,
  UNIVERSAL_TRUE_CHROMIUM_WYSIWYG_PREVIEW_V1,
  isFlagEnabled,
} from '../printing';
import { useDocumentLibrary } from '../components/letters/studio/useDocumentLibrary';
import { useVariableBindings } from '../components/letters/studio/useVariableBindings';
import {
  clearRecoveryDraft,
  readRecoveryDraft,
  useAutoSave,
} from '../components/letters/studio/useAutoSave';
import {
  type ResolvedVariables,
  freezeUsedVariables,
  resolveForStatus,
} from '../letters/variables/variableResolver';
import { resolveTokens, insertTokenAt } from '../letters/variables/variableSyntax';
import { type Condition, conditionSize } from '../letters/variables/conditions';
import {
  type LetterTemplateEntry,
  type ReusableBlockEntry,
} from '../letters/library/libraryTypes';
import { recordRecent } from '../letters/library/favourites';
import {
  NUDGE_COARSE_MM,
  NUDGE_FINE_MM,
  NUDGE_MM,
  useLayoutDesigner,
} from '../components/letters/studio/useLayoutDesigner';
import { type LayoutObjectKind } from '../letters/model/layoutTypes';
import { type AlignAction } from '../letters/layout/alignment';
import {
  type SnapSettings,
  DEFAULT_SNAP_SETTINGS,
} from '../letters/layout/snapping';
import { addObject, objectsOnPage } from '../letters/layout/layoutCommands';
import { paintOrder } from '../letters/layout/layoutGeometry';
import DocumentNavigator, { type NavigatorTab } from '../components/letters/studio/DocumentNavigator';
import FindReplacePanel from '../components/letters/studio/FindReplacePanel';
import ShortcutsDialog from '../components/letters/studio/ShortcutsDialog';
import { useDocumentHistory } from '../components/letters/studio/useDocumentHistory';
import { useDocumentSelection } from '../components/letters/studio/useDocumentSelection';
import { useDocumentShortcuts } from '../components/letters/studio/useDocumentShortcuts';
import {
  type ZoomMode,
  clampZoom,
  fitPageZoom,
  fitWidthZoom,
  stepZoom,
} from '../components/letters/studio/zoom';
import ValidationPanel from '../components/letters/ValidationPanel';
import { useLetterValidation } from '../components/letters/useLetterValidation';
import { useLetterPrint } from '../components/letters/useLetterPrint';
import '../components/letters/letter-print.css';
import { useCompanyBranding } from '../print-templates/hooks/useCompanyBranding';
import BrandingAssetPicker from '../print-templates/components/BrandingAssetPicker';
import { type BrandingSelection } from '../print-templates/hooks/useBrandingSelection';
import { NO_ASSET, type BrandingAsset } from '../print-templates/branding/brandingAssets';
import { PENDING_REFERENCE, registerLetter } from '../api/lettersApi';
import { buildBarcodePayload } from '../letters/barcode/payloadBuilder';

/**
 * An asset id → the asset, or `null`.
 *
 * `null` covers three cases that are all rendered identically and all correct: nothing
 * selected, an id that no longer resolves (the asset was deleted in Settings), and an
 * asset switched off there. None is an error the composer should shout about — the
 * validation engine reports an unresolvable selection, which is the layer that owns it.
 */
function resolveBrandingAsset(assets: BrandingAsset[], id: string | null): RenderedBrandingAsset | null {
  if (!id) return null;
  const asset = assets.find((a) => a.id === id);
  if (!asset || !asset.show || !asset.imageUrl) return null;
  return { assetId: asset.id, name: asset.name, imageUrl: asset.imageUrl };
}
import { type LetterValidationContext } from '../letters/validation/context';
import { type ValidationIssue } from '../letters/validation/framework';
import {
  BarcodeBlock,
  ContentSection,
  type ParagraphHandlers,
  SignatureBlock,
  type RenderedBrandingAsset,
  computeListOrdinals,
} from '../components/letters/LetterSections';
import '../components/letters/letter-sections.css';
import './LetterComposer.css';

import { LETTER_STATUS_LABEL_AR, LETTER_STATUS_TONE, type LetterStatus } from '../api/lettersApi';
import {
  type BlockDocument,
  type BlockAttributes,
  type InlineMark,
  type ListType,
  createInitialBlockDocument,
} from '../letters/model/blockTypes';
import {
  type BlockFormat,
  applyBlockFormat,
  applyCharacterStyle,
  applyParagraphStyle,
  blockMarks,
  blockText,
  clearBlockFormatting,
  copyBlockFormat,
  documentVariableNames,
  visibleBlocks,
  findBlock,
  insertParagraphAfter,
  mergeWithPrevious,
  parseDocument,
  serialiseDocument,
  setBlockAttributes,
  setBlockCondition,
  setBlockIndentation,
  setBlockText,
  setDocumentLayout,
  documentLayout,
  splitParagraph,
  stepBlockIndent,
  toggleBlockMark,
  toggleListType,
} from '../letters/editor/blockCommands';
import {
  type SearchMatch,
  type SearchOptions,
  DEFAULT_SEARCH_OPTIONS,
  EMPTY_SEARCH_RESULT,
  findInDocument,
  replaceAllInDocument,
  replaceMatch,
} from '../letters/editor/documentSearch';
import { detectLanguage, documentStats } from '../letters/editor/documentStats';
import { buildDocumentOutline, type OutlineEntry } from '../letters/editor/documentOutline';
import {
  type CharacterStyle,
  type ParagraphStyle,
  matchCharacterStyle,
  matchParagraphStyle,
} from '../letters/registry/documentStyles';
import { getTemplate, findTemplate } from '../letters/registry/templateRegistry';
import { getTypographyPresetSet, type TextAlignment } from '../letters/registry/typographyPresets';
import {
  INDENT_STEP_MM,
  contentTopForPageMm,
  getPageGeometry,
  isPrintProfileId,
  pageSizeOf,
  reservedZonesMm,
  sideMarginMm,
  textBandBottomMm,
  type PrintProfileId,
} from '../letters/registry/geometryRegistry';
import { type FontId } from '../styles/fontRegistry';

/**
 * A stable hash of a layout object's payload, for the registration snapshot.
 *
 * FNV-1a over the serialised payload. Not cryptographic and not meant to be: its job
 * is to prove that the content of an object is unchanged since registration, and a
 * 32-bit hash over a JSON string does that for a document nobody is attacking. What it
 * avoids is putting a second copy of a base64 image into the snapshot column, which is
 * the same reason the snapshot caps the two branding images.
 */
function digestPayload(payload: unknown): string {
  const text = JSON.stringify(payload) ?? '';
  let hash = 0x811c9dc5;
  for (let i = 0; i < text.length; i += 1) {
    hash ^= text.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193);
  }
  return (hash >>> 0).toString(16).padStart(8, '0');
}

let blockIdCounter = 0;
/**
 * Mint a block id.
 *
 * Lives here rather than in the model because minting ids is an editor concern — the
 * pure commands take an id and never invent one, which is what keeps them testable.
 */
function nextBlockId(): string {
  blockIdCounter += 1;
  return `b${Date.now().toString(36)}${blockIdCounter.toString(36)}`;
}

/**
 * The recipient, kept as metadata even though Form Editor UX Rebuild v2 stopped
 * rendering it on the paper — see the `content` items comment further down for why.
 */
interface RecipientValue {
  name: string;
  title: string;
  organisation: string;
}

interface LoadedLetter {
  id: number;
  templateKey: string;
  status: LetterStatus;
  isArchived: boolean;
  reference: string | null;
  printProfileId: string;
  versions: { templateVersion: number; layoutVersion: number; barcodeVersion: number };
  issueDate: string;
  subject: string;
  recipient: { name: string | null; title: string | null; organisation: string | null };
  contentJson: string;
  /** Ids into the company branding registry. `null` = none selected, a valid choice. */
  signatureAssetId: string | null;
  stampAssetId: string | null;
  /**
   * Frozen at registration, absent on a draft.
   *
   * Only `barcodePayload` is read here, and reading it rather than rebuilding is what
   * makes a reprint reproduce the code that was actually printed.
   */
  registrationSnapshot: { barcodePayload?: string; variables?: Record<string, string | null> } | null;
  /** Audit columns, for the Document Properties panel. All optional — an older row
   *  may predate one of them, and a missing timestamp shows as a dash. */
  createdByName?: string | null;
  createdAt?: string | null;
  updatedAt?: string | null;
}

export default function LetterComposer() {
  const { t } = useT();
  const navigate = useNavigate();
  const toast = useToast();
  const { hasPermission, user } = useAuth();
  const { id } = useParams<{ id: string }>();
  const letterId = Number(id);

  const [letter, setLetter] = useState<LoadedLetter | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [dirty, setDirty] = useState(false);
  const [savedAt, setSavedAt] = useState<Date | null>(null);

  /* ── Document state ──────────────────────────────────────────────────── */
  const [content, setContent] = useState<BlockDocument | null>(null);
  const [subject, setSubject] = useState('');
  const [issueDate, setIssueDate] = useState('');
  const [recipient, setRecipient] = useState<RecipientValue>({ name: '', title: '', organisation: '' });

  /* ── Studio state ─────────────────────────────────────────────────────────
     History and selection live in their own hooks so a caret movement re-renders the
     status bar and nothing else — see `useDocumentSelection` for why the two were
     separated. */
  const history = useDocumentHistory();
  const selection = useDocumentSelection();
  const { activeBlockId } = selection;

  /* ── View preferences (persisted — they are the user's, not the document's) ── */
  const [zoom, setZoom] = usePersistedState<number>('manarERP.letters.composer.zoom', 1);
  /**
   * Opens fitted to the width, not at 100%.
   *
   * A4 at 100% occupies barely half a 1440px window, which is what made the workspace
   * read as a form with a page in it rather than as a document editor. Fitting to width
   * is what Word and Acrobat do on open, and it is a VIEW default only — no geometry
   * moves, and the millimetre values are untouched.
   */
  const [zoomMode, setZoomMode] = usePersistedState<ZoomMode>('manarERP.letters.composer.zoomMode', 'fitWidth');
  const [showRulers, setShowRulers] = usePersistedState<boolean>('manarERP.letters.composer.rulers', true);
  const [showGrid, setShowGrid] = usePersistedState<boolean>('manarERP.letters.composer.grid', false);
  const [showZones, setShowZones] = usePersistedState<boolean>('manarERP.letters.composer.zones', true);
  const [showNavigator, setShowNavigator] = usePersistedState<boolean>('manarERP.letters.composer.navigator', true);

  /* ── Advanced mode (Form Editor UX Simplification Pack v1) ────────────────
     ══════════════════════════════════════════════════════════════════════════
      A VISIBILITY SWITCH. IT REMOVES NO CAPABILITY AND CHANGES NO DOCUMENT.
     ══════════════════════════════════════════════════════════════════════════
     OFF (the default, and what a new user meets): a blank A4 sheet, the essential
     toolbar, Save and Print. No mode tabs, no view toggles, no automation buttons, no
     rails. Everything else is behind ONE door — `AdvancedToolsMenu`.

     ON: exactly the studio that existed before this pack — the full toolbar, the
     Compose/Design tabs and the view controls, permanently on screen.

     Persisted, because "I want all the tools" is a statement about a person rather
     than about a document, and asking them to re-declare it every time they open a
     file is the same mistake as not remembering their zoom.

     Defaults to `false` DELIBERATELY, including for someone who has used the studio
     before. There is no migration and none is wanted: the pack's whole purpose is
     that the editor now opens calm, and honouring an implicit preference nobody ever
     expressed would mean most existing users never see the change they asked for. */
  const [advancedMode, setAdvancedMode] = usePersistedState<boolean>('manarERP.letters.composer.advanced', false);
  const [navigatorTab, setNavigatorTab] = usePersistedState<NavigatorTab>('manarERP.letters.composer.navigatorTab', 'pages');
  // Shared by both rails that occupy the nav slot (LayersPanel in Design mode,
  // DocumentNavigator otherwise) — the slot remembers one width regardless of which of
  // the two is currently showing in it.
  const navRail = useResizableRail('manarERP.letters.composer.railWidth.nav', 172, 140, 340);
  // The right-hand slot: the Object Inspector in Design mode, Document Properties
  // otherwise — the two never show together (one is gated on `designMode`, the other
  // on its opposite), so one remembered width serves both.
  const inspectorRail = useResizableRail('manarERP.letters.composer.railWidth.inspector', 232, 200, 420);
  // The left-hand slot: Insert only. Its own remembered width now that it no longer
  // shares a slot with Properties.
  const insertRail = useResizableRail('manarERP.letters.composer.railWidth.insert', 250, 220, 460);
  const [shortcutsOpen, setShortcutsOpen] = useState(false);

  /* ── Design mode ──────────────────────────────────────────────────────────
     Two modes over ONE document, not two documents.

     Compose writes the letter — the flowing sections the paginator places. Design
     arranges the positioned objects that sit on top of them. The document is the same
     value in both; only which layer accepts the pointer changes.

     A mode rather than a merged surface because the two need incompatible pointer
     behaviour: in Compose a click inside a paragraph must place a caret, in Design it
     must select whatever object is under it. Trying to serve both from one surface is
     how a design tool ends up with a modifier key nobody can discover.

     NOT persisted: a letter opens in Compose every time. The document's own content is
     what most sessions are about, and reopening into a design surface with a paragraph
     the author meant to fix would be the wrong first frame. */
  const [designMode, setDesignMode] = useState(false);
  const [snapSettings, setSnapSettings] = usePersistedState<SnapSettings>(
    'manarERP.letters.composer.snap',
    DEFAULT_SNAP_SETTINGS,
  );
  const [showLayoutGuides, setShowLayoutGuides] = usePersistedState<boolean>('manarERP.letters.composer.layoutGuides', true);
  const layoutSelection = useLayoutSelection();

  /* ── Effective page chrome ───────────────────────────────────────────────
     DERIVED, never written. The persisted preferences above are left exactly as the
     author set them; the simple experience merely declines to APPLY them. That is
     what makes the master switch reversible — turning advanced mode back on restores
     the rulers, grid and bands the author had, rather than a reset.

     THE NAVIGATOR IS NOT DERIVED, and the difference is the point: rulers, grid and
     reserved-band overlays are CHROME ABOUT the paper, so suppressing them is a view
     decision. The navigator is a PANEL the author opens, so it obeys its own flag in
     both modes and can be summoned from the Advanced Tools menu without first turning
     the master switch on. What keeps it closed on arrival is the tidy-up below, not
     this derivation.

     Design mode counts as advanced here whether or not the switch is on: positioning
     an object in millimetres without a ruler or a band overlay is the one case where
     the chrome IS the work. */
  const showChrome = advancedMode || designMode;
  const rulersOn = showRulers && showChrome;
  const gridOn = showGrid && showChrome;
  const zonesOn = showZones && showChrome;

  /* ── Side rails ────────────────────────────────────────────────────────────
     Form Editor UX Rebuild v2 gives Insert and Properties opposite sides of the paper
     instead of one shared slot, so the two are independent booleans rather than a
     three-way union: both can be open together, which is exactly the three-column
     layout the mockup asks for.

     INSERT (left) is now a PRIMARY surface, not an advanced one — open by default,
     the way the mockup's insert rail always is. PROPERTIES (right) stays the
     document-level panel it always was — still opened on demand from Advanced Tools
     — but no longer competes with Insert for the same slot. The Design-mode Object
     Inspector ("خصائص العنصر") takes the SAME right-hand slot as Properties,
     contextually, whenever an object is selected — see the `.lc-workspace` render
     below. */
  const [insertOpen, setInsertOpen] = usePersistedState<boolean>(
    'manarERP.letters.composer.insertOpen',
    true,
  );
  const [propertiesOpen, setPropertiesOpen] = usePersistedState<boolean>(
    'manarERP.letters.composer.propertiesOpen',
    false,
  );
  const [exporting, setExporting] = useState(false);
  const [conditionFor, setConditionFor] = useState<string | null>(null);
  /**
   * Show resolved VALUES in the editable paragraphs.
   *
   * Off by default: the author edits tokens, and substituting in the textarea would
   * make `{{Employee}}` unreachable the instant it resolved. On, the whole editor
   * renders read-only with values — the "how will this print?" view. See
   * `LetterSections`'s `resolveText` for the full reasoning.
   */
  const [previewValues, setPreviewValues] = useState(false);

  const libraryStore = useDocumentLibrary();

  /* ── Page navigation ─────────────────────────────────────────────────── */
  const [currentPage, setCurrentPage] = useState(0);
  const viewportEl = useRef<HTMLDivElement | null>(null);
  const pageEls = useRef(new Map<number, HTMLElement>());
  const [viewportSize, setViewportSize] = useState({ width: 0, height: 0 });

  /** Caret restoration after a split or a merge — the two operations where text moves
   *  between controls and the browser cannot know where the user was. */
  const paragraphRefs = useRef(new Map<string, HTMLTextAreaElement>());
  const pendingFocus = useRef<{ blockId: string; caret: number } | null>(null);

  const template = useMemo(() => findTemplate(letter?.templateKey) ?? getTemplate('officialLetter'), [letter]);
  const presets = useMemo(() => getTypographyPresetSet(template.typographyPresetSetId), [template]);

  /** Default paragraph attributes — the template's body preset, resolved once. */
  const bodyAttributes: BlockAttributes = useMemo(
    () => ({
      fontId: presets.body.fontId,
      sizePt: presets.body.sizePt,
      alignment: presets.body.alignment,
      indentLevel: 0,
    }),
    [presets],
  );

  const readOnly = letter?.status !== 'DRAFT' || !hasPermission('letters.update');

  const profileId: PrintProfileId = isPrintProfileId(letter?.printProfileId ?? '')
    ? (letter!.printProfileId as PrintProfileId)
    : 'companyLetterhead';
  const layoutVersion = letter?.versions.layoutVersion ?? 1;
  const geometry = useMemo(() => getPageGeometry(profileId, layoutVersion), [profileId, layoutVersion]);

  /* ── Company and session, for the variables that need no binding ──────────
     `company.name` and `company.address` are ordinary settings rows the Settings page
     already writes; read here from the ONE `/settings` request the branding hook
     already makes rather than through a second round trip. */
  const [companyName, setCompanyName] = useState<string | null>(null);
  const [companyAddress, setCompanyAddress] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const { data } = await api.get('/settings');
        if (cancelled) return;
        const rows = (data.data ?? data) as { key: string; value: string }[];
        const find = (key: string) => rows.find((row) => row.key === key)?.value?.trim() || null;
        setCompanyName(find('company.name'));
        setCompanyAddress(find('company.address'));
      } catch {
        // The company variables resolve to nothing, which E18 reports properly. A
        // settings request that fails must not stop the letter loading.
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const currentUserName = user?.fullName ?? user?.username ?? null;

  /**
   * The values frozen at registration, if any.
   *
   * Read from the snapshot rather than recomputed, exactly as the barcode payload is.
   * A letter registered before this pack has none, and its variables resolve to
   * nothing — the honest answer, since the engine does not know what it said.
   */
  const frozenVariables = useMemo(
    () => (letter?.registrationSnapshot?.variables as ResolvedVariables | undefined) ?? null,
    [letter?.registrationSnapshot],
  );

  /* ── Variables ────────────────────────────────────────────────────────────
     Bindings → records → values → rendering, in that order and once per change.

     `resolveForStatus` decides live-versus-frozen from the letter's own status rather
     than from anything a caller passes, so no surface here can accidentally render a
     registered letter from today's data. */
  const bindingRecords = useVariableBindings(content?.bindings);

  const resolvedVariables: ResolvedVariables = useMemo(
    () =>
      resolveForStatus(
        letter?.status ?? 'DRAFT',
        {
          company: { name: companyName, address: companyAddress },
          employee: bindingRecords.employee,
          contract: bindingRecords.contract,
          project: null,
          currentUser: currentUserName,
          reference: letter?.reference ?? null,
          issueDate,
          now: new Date(),
        },
        frozenVariables,
      ),
    [letter?.status, letter?.reference, companyName, companyAddress, bindingRecords, currentUserName, issueDate, frozenVariables],
  );

  /**
   * Substitute tokens for values.
   *
   * `pending` mode keeps an unresolved token VISIBLE rather than blanking it, so the
   * author can see the question the letter is asking. A letter carrying one cannot be
   * printed at all (E18), so a token can never reach paper.
   */
  const resolveText = useCallback(
    (text: string) => resolveTokens(text, resolvedVariables, 'pending'),
    [resolvedVariables],
  );

  /** Which variables the document mentions — for freezing and for validation. */
  const usedVariables = useMemo(() => (content ? documentVariableNames(content) : []), [content]);

  /**
   * Blocks whose condition is satisfied.
   *
   * Used by BOTH the page stack and the measurement mirror, which is what keeps a
   * hidden block out of the page count as well as off the page — one that was measured
   * but not painted would leave a gap the paginator had reserved for nothing.
   */
  const renderedBlocks = useMemo(
    () => (content ? visibleBlocks(content, resolvedVariables) : []),
    [content, resolvedVariables],
  );

  /* ── Pagination ──────────────────────────────────────────────────────────
     The flow's item list: one item per content paragraph, plus the two fixed sections
     that close the document. Signature and barcode are chained with `keepWithNext` so
     they travel together — they authorise the document jointly and splitting them
     would be meaningless.

     Form Editor UX Rebuild v2 removed the three sections that used to open every
     document — date, recipient, subject. The document is generic now: it begins with
     whatever the author writes, not with fields assumed on its behalf. */
  const items: MeasurableItem[] = useMemo(() => {
    // Only the blocks whose CONDITION holds are flowed — see `renderedBlocks`.
    const contentItems: MeasurableItem[] = renderedBlocks.map((block) => ({
      id: block.id,
      kind: 'content' as const,
    }));
    return [
      ...contentItems,
      { id: 'signature', kind: 'signature', keepWithNext: true },
      { id: 'barcode', kind: 'barcode' },
    ];
  }, [renderedBlocks]);

  /**
   * Anything that can change a rendered height re-triggers the measurement pass.
   *
   * THE LAYOUT LAYER IS DELIBERATELY EXCLUDED. A positioned object never flows, so it
   * cannot change any measured height — and including it would mean every drag,
   * resize and rotation re-ran the whole measurement and pagination pass for a result
   * that is identical by construction. Serialising only the blocks is what keeps
   * dragging on a ten-page letter as cheap as dragging on a one-page one.
   */
  const contentSignature = useMemo(
    () =>
      [
        content ? serialiseDocument({ ...content, layout: undefined }) : '',
        // Resolved VALUES are part of the signature: «أحمد محمد» and «{{Employee}}»
        // are different widths, so a binding change repaginates. Conditions ride the
        // same value — a block appearing or vanishing changes the flow.
        JSON.stringify(resolvedVariables),
        subject,
        issueDate,
        recipient.name,
        recipient.title,
        recipient.organisation,
        readOnly ? 'ro' : 'rw',
      ].join(''),
    [content, resolvedVariables, subject, issueDate, recipient, readOnly],
  );

  const { pagination, itemHeightsMm, probeRef, measureRef } = useLetterPagination(items, geometry, contentSignature);
  const pageCount = pagination.pageCount;

  /** Numbered-list ordinals, computed once against the WHOLE document — see
   *  `computeListOrdinals` for why they cannot be derived inside a section. */
  const listOrdinals = useMemo(
    () => (content ? computeListOrdinals(content) : {}),
    [content],
  );

  /* ── Live validation ─────────────────────────────────────────────────────
     The context is assembled from state the composer already holds, and the measured
     heights come from the pagination pass rather than a second measurement — a rule
     that measured independently could disagree with the pages on screen. */
  /* ── Signature, stamp and barcode ─────────────────────────────────────────
     The letter stores ASSET IDS; the images live in the company branding registry that
     every other printed document in the ERP already reads. Resolved here, above the
     validation context, because the validator needs to know whether a selection
     actually resolves — an id pointing at a deleted asset is exactly what W4 reports. */
  const branding = useCompanyBranding();

  const resolvedSignature: RenderedBrandingAsset | null = useMemo(
    () => resolveBrandingAsset(branding.signatures, letter?.signatureAssetId ?? null),
    [branding.signatures, letter?.signatureAssetId],
  );
  const resolvedStamp: RenderedBrandingAsset | null = useMemo(
    () => resolveBrandingAsset(branding.stamps, letter?.stampAssetId ?? null),
    [branding.stamps, letter?.stampAssetId],
  );

  /**
   * The encoded payload.
   *
   * For a REGISTERED letter it is read from the frozen registration snapshot, never
   * rebuilt — a reprint must reproduce the code that was printed, not one derived from
   * whatever the record says today. A draft has no reference, so there is nothing to
   * encode and the block renders its reserved space instead.
   */
  const barcodePayload = useMemo(() => {
    if (!letter?.reference) return '';
    const frozen = letter.registrationSnapshot?.barcodePayload;
    if (frozen) return frozen;
    return buildBarcodePayload(
      { issueDate: letter.issueDate.slice(0, 10), subject: letter.subject, reference: letter.reference },
      letter.versions.barcodeVersion,
    );
  }, [letter?.reference, letter?.registrationSnapshot, letter?.issueDate, letter?.subject, letter?.versions.barcodeVersion]);

  /**
   * ══════════════════════════════════════════════════════════════════════════
   *  FORM EDITOR UX REBUILD v2 — THREE FIELDS, DOWN FROM SEVENTEEN.
   * ══════════════════════════════════════════════════════════════════════════
   * The three surviving rules (`E4_reservedZoneOverlap`, `E13_impossibleGeometry`,
   * `E16_objectInReservedZone`) read only geometry, the content's positioned-object
   * layer, and the paginator's own layout. Everything else this object used to carry —
   * status, reference, subject, recipient, resolved variables, the branding selection,
   * the barcode payload — fed a rule that no longer exists.
   */
  const validationContext: LetterValidationContext | null = useMemo(() => {
    if (!letter || !content) return null;
    return { geometry, content, pagination };
  }, [letter, content, geometry, pagination]);

  const { result: validation, summary: validationSummary } = useLetterValidation(validationContext, template.validationRules);
  const [validationOpen, setValidationOpen] = usePersistedState<boolean>('manarERP.letters.composer.validationOpen', false);

  /* ── Arriving in the simple experience tidies the workspace ──────────────
     "When the user opens the page, show only a blank A4 page, a simple toolbar, a
     save button and a print button" — which defaults alone cannot guarantee, because
     `showNavigator` has defaulted to `true` since the studio shipped and is already
     persisted as such for everyone who has used it. Deriving the rail away instead
     would have hidden it while leaving its flag on, and the Advanced Tools menu's own
     navigator row would then have appeared to do nothing.

     So entering simple mode CLOSES the panels once, after which every flag means
     exactly what it says in both modes. It fires on mount when the switch is off, and
     on each advanced → simple transition — never while the author is already working
     in simple mode, so a panel they open from the menu stays open.

     The callback is held in a REF because `usePersistedState` returns a new setter on
     every render (it is not memoised). Listing those setters as dependencies would
     re-run this on every render and slam every panel shut on each keystroke — which
     is also why the dependency array is honest at one entry rather than suppressed. */
  const tidyForSimpleMode = useRef<() => void>(() => {});
  tidyForSimpleMode.current = () => {
    // `insertOpen` is deliberately NOT reset here — Insert is a primary surface now
    // (Form Editor UX Rebuild v2), open by default in both modes, not one of the
    // advanced panels this tidy-up exists to close.
    setPropertiesOpen(false);
    setShowNavigator(false);
    setDesignMode(false);
    setValidationOpen(false);
    layoutSelection.clear();
  };

  useEffect(() => {
    if (advancedMode) return;
    tidyForSimpleMode.current();
  }, [advancedMode]);

  /* ── Registration ─────────────────────────────────────────────────────────
     The button assembles the snapshot and calls the existing endpoint. It contains no
     allocation logic of its own: the number is issued by the server, inside the one
     transaction that also binds it, freezes the snapshot and writes the timeline. */

  const [registering, setRegistering] = useState(false);

  /** Only a DRAFT may be registered, and only with the permission for it. */
  const canRegister = letter?.status === 'DRAFT' && !letter.reference && hasPermission('letters.register');

  /**
   * Build the snapshot the server freezes.
   *
   * Assembled HERE because only the renderer knows these values — the resolved
   * typography, the geometry actually in force, the payload that will be encoded and
   * the page count as laid out. The backend deliberately has no renderer and must
   * never compute a second opinion about what the page looks like.
   */
  const buildSnapshot = useCallback(() => {
    if (!letter || !content) return null;

    const blockTypography: Record<string, { fontId: string; sizePt: number; weight: number; lineHeight: number }> = {};
    for (const block of content.blocks) {
      // The block's OWN resolved type, not the body preset.
      //
      // Before Document Studio Foundation v1 every content block was body text, so
      // reading the body preset was correct. Headings and per-paragraph line heights
      // now exist, and snapshotting the preset would freeze a Heading 1 as 16 pt
      // Traditional Arabic — a snapshot that disagrees with the page it was taken from.
      // The attributes are the truth; the preset is only their default.
      blockTypography[block.id] = {
        fontId: block.attributes.fontId,
        sizePt: block.attributes.sizePt,
        weight: blockMarks(block).includes('bold') ? 700 : 400,
        lineHeight: block.attributes.lineHeight ?? presets.body.lineHeight,
      };
    }

    return {
      blockTypography,
      issueDate: issueDate.slice(0, 10),
      subject,
      // The payload is built from the values being registered, and the server stores it
      // verbatim — so every later reprint encodes this exact string.
      barcodePayload: buildBarcodePayload(
        { issueDate: issueDate.slice(0, 10), subject, reference: PENDING_REFERENCE },
        letter.versions.barcodeVersion,
      ),
      geometryMm: {
        reservedTopMm: geometry.reservedTopMm,
        continuationReservedTopMm: geometry.continuationReservedTopMm,
        reservedBottomMm: geometry.reservedBottomMm,
        contentTopMm: geometry.contentTopMm,
        continuationContentTopMm: geometry.continuationContentTopMm,
        contentWidthMm: geometry.contentWidthMm,
        footerStripMm: geometry.footerStripMm,
        signatureHeightMm: geometry.signatureHeightMm,
        stampHeightMm: geometry.stampHeightMm,
        barcodeSizeMm: geometry.barcodeSizeMm,
      },
      pageCount,
      // The IMAGE, not just the id: re-uploading a signature in Settings must not
      // rewrite what an already-issued letter shows.
      signature: resolvedSignature,
      stamp: resolvedStamp,
      /**
       * The resolved variable values, frozen.
       *
       * The same guarantee the barcode payload and the signature image carry: a pay
       * rise, a transfer or a renamed contract must never rewrite a letter already
       * issued and handed over. Only the variables the document actually MENTIONS are
       * recorded — freezing all eighteen would put a salary into the snapshot of a
       * letter that never asked for one.
       */
      variables: freezeUsedVariables(usedVariables, resolvedVariables),
      /**
       * The positioned layer as rendered.
       *
       * Frozen for the same reason the signature IMAGE is: a reprint years later must
       * reproduce the page that was issued. Omitted entirely when the letter carries
       * no objects, so a letter that never used the designer produces a snapshot
       * byte-identical to one from before this pack.
       */
      layoutObjects:
        content.layout && content.layout.objects.length > 0
          ? content.layout.objects.map((object) => ({
              id: object.id,
              kind: object.kind,
              name: object.name,
              pageIndex: object.pageIndex,
              xMm: object.frame.xMm,
              yMm: object.frame.yMm,
              widthMm: object.frame.widthMm,
              heightMm: object.frame.heightMm,
              rotationDeg: object.rotationDeg,
              opacity: object.opacity,
              zIndex: object.zIndex,
              // A digest, never the payload — an image object would otherwise put a
              // second copy of a base64 PNG into the snapshot column.
              payloadDigest: digestPayload(object.payload),
            }))
          : undefined,
    };
  }, [letter, content, presets, issueDate, subject, geometry, pageCount, resolvedSignature, resolvedStamp, usedVariables, resolvedVariables]);

  /* ── Printing ────────────────────────────────────────────────────────────
     The pipeline receives the layout and the verdict; it recomputes neither. */
  const { printMode, printing, lastError: printError, runPrint, clearError: clearPrintError } = useLetterPrint();

  const handlePrint = useCallback(async () => {
    if (!letter || !validationContext) return;
    const outcome = await runPrint({
      pagination,
      geometry,
      profileId,
      layoutVersion,
      validation,
      summary: validationSummary,
      title: letter.reference ?? t('page.officialLetter.title'),
    });
    if (outcome) toast.ok(`تمت طباعة ${outcome.job.pageCount} صفحة`);
  }, [letter, validationContext, runPrint, pagination, geometry, profileId, layoutVersion, validation, validationSummary, t, toast]);

  /**
   * Export to PDF or HTML.
   *
   * Routed through `runExport`, which applies the SAME validation gate `handlePrint`
   * does — an export path that skipped it would be a way to publish a document the
   * engine had refused. Print itself is deliberately NOT routed here: it stays on
   * `useLetterPrint`, which owns print mode and the render-readiness wait, and a
   * second print path is exactly what the pipeline forbids.
   */
  const handleExport = useCallback(
    async (format: ExportFormat) => {
      if (format === 'print') {
        await handlePrintRef.current();
        return;
      }
      if (!letter) {
        toast.error('تعذّر العثور على المستند.');
        return;
      }

      if (format === 'docx') {
        if (!content) {
          toast.error('تعذّر العثور على محتوى المستند.');
          return;
        }
        setExporting(true);
        try {
          const outcome = await runDocxExport({
            document: content,
            filename: exportFilename(letter.reference, subject),
            validation,
            summary: validationSummary,
          });
          if (!outcome.ok) {
            if (outcome.error.code === 'PRINT_CANCELLED') return;
            toast.error(outcome.error.message);
            if (outcome.error.blockingIssues?.length) setValidationOpen(true);
            return;
          }
          toast.ok('تم تصدير الملف بصيغة Word');
        } finally {
          setExporting(false);
        }
        return;
      }

      const node = viewportEl.current?.querySelector<HTMLElement>('.lp-stack');
      if (!node) {
        toast.error('تعذّر العثور على صفحات المستند.');
        return;
      }

      setExporting(true);
      try {
        const outcome = await runExport({
          format,
          node,
          geometry,
          title: letter.reference ?? subject ?? 'مستند',
          filename: exportFilename(letter.reference, subject),
          validation,
          summary: validationSummary,
        });

        if (!outcome.ok) {
          if (outcome.error.code === 'PRINT_CANCELLED') return;
          toast.error(outcome.error.message);
          if (outcome.error.blockingIssues?.length) setValidationOpen(true);
          return;
        }
        toast.ok(format === 'pdf' ? 'تم تصدير الملف بصيغة PDF' : 'تم تصدير الملف بصيغة HTML');
      } finally {
        setExporting(false);
      }
    },
    [letter, content, subject, geometry, validation, validationSummary, toast, setValidationOpen],
  );

  /** Held in a ref so the export router need not be declared after `handlePrint`. */
  const handlePrintRef = useRef<() => Promise<void>>(async () => {});
  handlePrintRef.current = handlePrint;

  /**
   * The shared "📄 معاينة دقيقة" preview 16+ other forms already use — Chromium's own
   * pagination, not a simulation of it. `compose` is `composeLetter`, the SAME function
   * `runExport` calls for HTML/PDF: one document source, not a preview-only copy of it.
   * The hook's own default composer assumes the shared `a4-portrait` spec's 12mm
   * margins, which is wrong for a letter sheet already sized from the Geometry
   * Registry — see `composeLetter`'s header for why that composer must be reused
   * rather than left to the hook's default.
   */
  const composeLetterPreview = useCallback((): string => {
    const node = viewportEl.current?.querySelector<HTMLElement>('.lp-stack');
    if (!node || !letter) throw new Error('تعذّر تجهيز الخطاب للمعاينة.');
    return composeLetter(node, letter.reference ?? subject ?? 'مستند');
  }, [letter, subject]);

  const accuratePreview = useAccurateFormPreview({
    enabled: isFlagEnabled(UNIVERSAL_TRUE_CHROMIUM_WYSIWYG_PREVIEW_V1),
    compose: composeLetterPreview,
    onPrint: () => { void handlePrint(); },
    title: letter?.reference ?? subject ?? 'مستند',
    documentLabel: letter?.reference ?? subject ?? 'مستند',
    lang: 'ar',
  });

  // The refusal is shown where the user asked to print, never as a dialog they must
  // dismiss before they can see the problem the panel already lists.
  useEffect(() => {
    if (!printError) return;
    if (printError.code === 'PRINT_CANCELLED') {
      clearPrintError();
      return;
    }
    toast.error(printError.message);
    if (printError.blockingIssues && printError.blockingIssues.length > 0) setValidationOpen(true);
  }, [printError, clearPrintError, toast, setValidationOpen]);

  /** Sections carrying a finding, and the most severe one each carries. */
  const sectionSeverity = useMemo(() => {
    const map = new Map<string, ValidationIssue['severity']>();
    for (const issue of validation.issues) {
      const section = issue.location?.sectionKind;
      // Issues arrive most-severe first, so the first one to claim a section wins.
      if (section && !map.has(section)) map.set(section, issue.severity);
    }
    return map;
  }, [validation]);

  /** Which items the paginator placed on a page. */
  const itemsOnPage = useCallback(
    (pageIndex: number) => pagination.pages[pageIndex]?.itemIds ?? [],
    [pagination],
  );

  const pageRef = useCallback(
    (pageIndex: number) => (el: HTMLElement | null) => {
      if (el) pageEls.current.set(pageIndex, el);
      else pageEls.current.delete(pageIndex);
    },
    [],
  );

  const goToPage = useCallback(
    (pageIndex: number) => {
      const target = Math.min(Math.max(0, pageIndex), pageCount - 1);
      pageEls.current.get(target)?.scrollIntoView({ block: 'start', behavior: 'smooth' });
      setCurrentPage(target);
    },
    [pageCount],
  );

  /**
   * Take the user to a finding.
   *
   * The page first (so the sheet is on screen), then the offending block (so the caret
   * lands where the fix has to be made).
   *
   * `location.sectionKind` is no longer read: the three surviving rules
   * (`E4_reservedZoneOverlap`, `E13_impossibleGeometry`, `E16_objectInReservedZone`,
   * Form Editor UX Rebuild v2) report a page and, for E16, an object — never a section.
   * The subject/date/recipient sections that used to be the reason a finding pointed at
   * a section rather than a block are gone with the fields themselves.
   */
  const navigateToIssue = useCallback(
    (issue: ValidationIssue) => {
      const { pageIndex, blockId } = issue.location ?? {};
      if (pageIndex !== undefined) goToPage(pageIndex);

      if (blockId) {
        const el = paragraphRefs.current.get(blockId);
        if (el) {
          el.focus();
          el.scrollIntoView({ block: 'center', behavior: 'smooth' });
        }
      }
    },
    [goToPage],
  );

  /** Take the user to an outline entry — a section heading or a document heading. */
  const goToOutlineEntry = useCallback(
    (entry: OutlineEntry) => {
      if (entry.pageIndex !== null) goToPage(entry.pageIndex);

      // A positioned object is reached by SELECTING it in Design mode, not by focusing
      // a control — it has none. Switching mode is part of the navigation: an object
      // entry clicked from Compose mode would otherwise appear to do nothing.
      if (entry.objectId) {
        setDesignMode(true);
        layoutSelection.select([entry.objectId]);
        return;
      }

      if (entry.blockId) {
        const el = paragraphRefs.current.get(entry.blockId);
        if (el) {
          el.focus();
          el.scrollIntoView({ block: 'center', behavior: 'smooth' });
          return;
        }
      }
      // The remaining entries — the content section with no blocks yet, or the
      // signature/barcode entries, neither editable — have no control to focus.
      // Marking the section active still highlights it on the paper.
      selection.setActiveSection(entry.sectionKind as never);
    },
    [goToPage, selection, layoutSelection],
  );

  /**
   * Track which sheet is in view.
   *
   * The page whose top edge is nearest the viewport's top wins — with several sheets
   * visible at low zoom, "the one you are looking at" is the one you have scrolled to,
   * not merely the one occupying the most space.
   */
  useEffect(() => {
    const viewport = viewportEl.current;
    if (!viewport) return;

    const onScroll = () => {
      const viewportTop = viewport.getBoundingClientRect().top;
      let best = 0;
      let bestDistance = Number.POSITIVE_INFINITY;
      pageEls.current.forEach((el, index) => {
        const distance = Math.abs(el.getBoundingClientRect().top - viewportTop);
        if (distance < bestDistance) {
          bestDistance = distance;
          best = index;
        }
      });
      setCurrentPage((previous) => (previous === best ? previous : best));
    };

    viewport.addEventListener('scroll', onScroll, { passive: true });
    return () => viewport.removeEventListener('scroll', onScroll);
  }, [pageCount]);

  /** Viewport size, for the two fitted zoom modes. */
  useEffect(() => {
    const viewport = viewportEl.current;
    if (!viewport || typeof ResizeObserver === 'undefined') return;
    const observer = new ResizeObserver(([entry]) => {
      setViewportSize({ width: entry.contentRect.width, height: entry.contentRect.height });
    });
    observer.observe(viewport);
    return () => observer.disconnect();
  }, [loading]);

  /**
   * Recompute a fitted zoom when the viewport changes.
   *
   * The PAGE is the constant and the container is the variable — fitting adjusts the
   * scale, never a document measurement.
   */
  useEffect(() => {
    if (zoomMode === 'manual' || viewportSize.width === 0) return;
    const page = pageSizeOf(geometry);
    // The nominal factor is adequate here: `fit` is a viewport preference, and an
    // approximate scale is self-correcting because the user sees the result.
    const factor = 96 / 25.4;
    const gutter = 96;
    const next =
      zoomMode === 'fitWidth'
        ? fitWidthZoom(viewportSize.width, page.widthMm, factor, gutter)
        : fitPageZoom(viewportSize.width, viewportSize.height, page.widthMm, page.heightMm, factor, gutter);
    setZoom((previous) => (previous === next ? previous : next));
  }, [zoomMode, viewportSize, geometry, setZoom]);

  const setManualZoom = useCallback(
    (value: number) => {
      setZoomMode('manual');
      setZoom(clampZoom(value));
    },
    [setZoom, setZoomMode],
  );

  /**
   * Ctrl + mouse wheel zooms.
   *
   * Registered imperatively and NON-PASSIVELY because it must call `preventDefault` —
   * a passive listener cannot, and without it the browser's own page zoom fires as
   * well and the whole application scales instead of the sheet. React's `onWheel` is
   * passive by default, which is exactly why this is not written as a JSX prop.
   */
  useEffect(() => {
    const viewport = viewportEl.current;
    if (!viewport) return;

    const onWheel = (event: WheelEvent) => {
      if (!event.ctrlKey && !event.metaKey) return;
      event.preventDefault();
      // A trackpad reports fractional deltas continuously, so the wheel steps by a
      // proportion rather than by a ladder rung — the ladder is for the keyboard and
      // the buttons, where each press is one deliberate step.
      const factor = event.deltaY > 0 ? 0.92 : 1.08;
      setZoomMode('manual');
      setZoom((previous) => clampZoom(previous * factor));
    };

    viewport.addEventListener('wheel', onWheel, { passive: false });
    return () => viewport.removeEventListener('wheel', onWheel);
  }, [setZoom, setZoomMode, loading]);

  /**
   * Keep the caret where it was when a paragraph changes page.
   *
   * Re-pagination moves a paragraph into a different page element, so React unmounts
   * and remounts its textarea and the browser drops focus. Without this, typing at a
   * page boundary would silently eject the user from the document at exactly the
   * moment the flow does its job.
   */
  useEffect(() => {
    if (!activeBlockId || readOnly) return;
    const el = paragraphRefs.current.get(activeBlockId);
    if (!el || document.activeElement === el) return;
    const caret = el.value.length;
    el.focus();
    el.setSelectionRange(caret, caret);
  }, [pagination, activeBlockId, readOnly]);

  /* ── Load ────────────────────────────────────────────────────────────── */

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      setError(null);
      try {
        const { data } = await api.get(`/letters/${letterId}`);
        if (cancelled) return;
        const row = data.data as LoadedLetter;
        setLetter(row);
        setSubject(row.subject ?? '');
        setIssueDate((row.issueDate ?? '').slice(0, 10));
        setRecipient({
          name: row.recipient?.name ?? '',
          title: row.recipient?.title ?? '',
          organisation: row.recipient?.organisation ?? '',
        });

        // An unreadable or absent document starts a fresh one rather than failing the
        // screen — a draft with corrupt content is still a draft the user can rewrite.
        //
        // A document stored under content-model version 1 is MIGRATED here rather than
        // treated as unreadable; see `parseDocument`. Without that, bumping the version
        // would have silently emptied every draft in the system.
        const parsed = parseDocument(row.contentJson);
        setContent(parsed ?? createInitialBlockDocument(nextBlockId(), bodyAttributes));
        history.reset();
      } catch (err) {
        if (!cancelled) setError(errorMessage(err));
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
    // `bodyAttributes` is stable for a given template and must not re-trigger a load;
    // `history.reset` is stable for the life of the hook.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [letterId]);

  /* ── Caret restoration ───────────────────────────────────────────────── */

  useEffect(() => {
    const pending = pendingFocus.current;
    if (!pending) return;
    const el = paragraphRefs.current.get(pending.blockId);
    if (!el) return;
    el.focus();
    el.setSelectionRange(pending.caret, pending.caret);
    el.style.height = 'auto';
    el.style.height = `${el.scrollHeight}px`;
    pendingFocus.current = null;
  }, [content]);

  /* ── Editing ─────────────────────────────────────────────────────────── */

  /**
   * Apply a command.
   *
   * `reason` decides how the change enters history: `typing` coalesces consecutive
   * keystrokes in one block into a single undo step, `command` always opens its own.
   * See `useDocumentHistory` for why one undo step per character is not the answer.
   */
  const apply = useCallback(
    (next: BlockDocument, reason: 'typing' | 'command', blockId: string | null = null) => {
      setContent((current) => {
        if (!current) return next;
        history.record(current, reason, blockId);
        return next;
      });
      setDirty(true);
    },
    [history],
  );

  const handlers: ParagraphHandlers = useMemo(
    () => ({
      onTextChange: (blockId, text) => {
        setContent((current) => {
          if (!current) return current;
          history.record(current, 'typing', blockId);
          return setBlockText(current, blockId, text);
        });
        setDirty(true);
      },
      onEnter: (blockId, caretOffset) => {
        setContent((current) => {
          if (!current) return current;
          history.record(current, 'command', blockId);
          const newId = nextBlockId();
          const block = findBlock(current, blockId);
          const atEnd = block ? caretOffset >= (block.spans[0]?.text.length ?? 0) : true;
          const next = atEnd
            ? insertParagraphAfter(current, blockId, newId)
            : splitParagraph(current, blockId, caretOffset, newId);
          pendingFocus.current = { blockId: newId, caret: 0 };
          return next;
        });
        setDirty(true);
      },
      onBackspaceAtStart: (blockId) => {
        setContent((current) => {
          if (!current) return current;
          const merged = mergeWithPrevious(current, blockId);
          if (!merged) return current;
          history.record(current, 'command', blockId);
          pendingFocus.current = { blockId: merged.focusBlockId, caret: merged.caretOffset };
          return merged.document;
        });
        setDirty(true);
      },
      onFocusBlock: (blockId) => {
        selection.setActiveBlock(blockId);
        selection.setActiveSection('content');
      },
      // The control hands over its own text, so this is a plain call rather than a read
      // through the document. Deriving the text from state would mean doing it inside a
      // state updater, and a side effect there runs twice under StrictMode.
      onSelectionChange: (blockId, text, start, end) => {
        selection.reportSelection(blockId, text, start, end);
      },
      /**
       * Multi-paragraph plain-text paste.
       *
       * Split into one block per line and inserted as siblings, because a block holding
       * embedded newlines is a shape the model cannot express and the paginator cannot
       * break. The first line joins the block the caret was in; the rest become new
       * paragraphs that inherit its formatting.
       */
      onPasteMultiline: (blockId, start, end, text) => {
        setContent((current) => {
          if (!current) return current;
          const block = findBlock(current, blockId);
          if (!block) return current;

          history.record(current, 'command', blockId);

          const existing = blockText(block);
          const lines = text.split(/\r\n|\r|\n/);
          const head = existing.slice(0, start) + lines[0];
          const tail = existing.slice(end);

          let next = setBlockText(current, blockId, lines.length === 1 ? head + tail : head);
          let anchor = blockId;
          let lastId = blockId;
          let caret = head.length;

          for (let i = 1; i < lines.length; i += 1) {
            const newId = nextBlockId();
            next = insertParagraphAfter(next, anchor, newId);
            const isLast = i === lines.length - 1;
            const body = isLast ? lines[i] + tail : lines[i];
            next = setBlockText(next, newId, body);
            if (isLast) caret = lines[i].length;
            anchor = newId;
            lastId = newId;
          }

          pendingFocus.current = { blockId: lastId, caret };
          return next;
        });
        setDirty(true);
      },
    }),
    [history, selection],
  );

  const registerRef = useCallback((blockId: string, el: HTMLTextAreaElement | null) => {
    if (el) paragraphRefs.current.set(blockId, el);
    else paragraphRefs.current.delete(blockId);
  }, []);

  /* ── The layout designer ─────────────────────────────────────────────────
     Every designer action routes through this hook, which turns an intent into a pure
     command on the SAME document the text editor writes. That is what makes moving an
     object undo with Ctrl+Z, autosave with everything else, and version with the
     content model — a separate layout store would have needed its own undo stack and
     its own save path, and the two would eventually disagree. */
  const designer = useLayoutDesigner({
    content,
    selection: layoutSelection,
    readOnly,
    nextId: nextBlockId,
    typography: { fontId: presets.body.fontId, sizePt: presets.body.sizePt },
    apply: useCallback((next: BlockDocument) => apply(next, 'command', null), [apply]),
  });

  /** The page's own reference lines, for snapping and alignment. From the registry. */
  const pageSnapContext = useMemo(() => {
    const page = pageSizeOf(geometry);
    const margin = sideMarginMm(geometry);
    return {
      pageWidthMm: page.widthMm,
      pageHeightMm: page.heightMm,
      bandLeftMm: margin,
      bandRightMm: margin + geometry.contentWidthMm,
      bandTopMm: contentTopForPageMm(geometry, currentPage),
      bandBottomMm: textBandBottomMm(geometry),
    };
  }, [geometry, currentPage]);

  /**
   * Pixels per millimetre as actually rendered, including the zoom transform.
   *
   * The gesture engine converts pointer pixels to sheet millimetres with this, once,
   * at the boundary — after which nothing downstream knows the zoom exists. Derived
   * from the nominal CSS factor times the zoom rather than measured, because it is
   * needed before the first frame a sheet exists in.
   */
  const pxPerMm = useMemo(() => (96 / 25.4) * zoom, [zoom]);

  /* ── Toolbar ─────────────────────────────────────────────────────────── */

  const activeBlock = content && activeBlockId ? findBlock(content, activeBlockId) : undefined;
  const activeMarks = activeBlock ? blockMarks(activeBlock) : [];

  /** The format the painter is holding, or `null`. Armed by Ctrl+Shift+C. */
  const [heldFormat, setHeldFormat] = useState<BlockFormat | null>(null);

  /* ── Find and replace state ───────────────────────────────────────────────
     Declared before the toolbar's derived state, which reports whether the panel is
     open. */
  const [findOpen, setFindOpen] = useState(false);
  const [replaceMode, setReplaceMode] = useState(false);
  const [query, setQuery] = useState('');
  const [replacement, setReplacement] = useState('');
  const [searchOptions, setSearchOptions] = useState<SearchOptions>(DEFAULT_SEARCH_OPTIONS);
  const [matchIndex, setMatchIndex] = useState(0);

  /**
   * The last formatting command, for F4.
   *
   * A ref rather than state: repeating an action must not itself cause a render, and
   * nothing displays what the last action was.
   */
  const lastAction = useRef<(() => void) | null>(null);

  /** Kept in a ref so `lastAction`'s thunk sees the caret's CURRENT block rather than
   *  the one that was active when the action was first performed. */
  const selectionRef = useRef<string | null>(null);
  selectionRef.current = activeBlockId;

  /** Every formatting command acts on the WHOLE active paragraph. */
  const withActiveBlock = useCallback(
    (mutate: (doc: BlockDocument, blockId: string) => BlockDocument, repeatable = true) => {
      if (!content || !activeBlockId || readOnly) return;
      apply(mutate(content, activeBlockId), 'command', activeBlockId);
      if (repeatable) {
        // Captured as a thunk that re-reads the CURRENT document when replayed, so F4
        // applies the same operation to wherever the caret is now rather than replaying
        // the old document's result.
        lastAction.current = () => {
          setContent((current) => {
            if (!current) return current;
            const target = selectionRef.current;
            if (!target) return current;
            history.record(current, 'command', target);
            return mutate(current, target);
          });
          setDirty(true);
        };
      }
    },
    [content, activeBlockId, readOnly, apply, history],
  );

  const toolbarState: ToolbarState = {
    fontId: activeBlock?.attributes.fontId ?? null,
    sizePt: activeBlock?.attributes.sizePt ?? null,
    alignment: activeBlock?.attributes.alignment ?? null,
    bold: activeMarks.includes('bold'),
    underline: activeMarks.includes('underline'),
    highlight: activeMarks.includes('highlight'),
    superscript: activeMarks.includes('superscript'),
    subscript: activeMarks.includes('subscript'),
    paragraphStyle: activeBlock ? matchParagraphStyle(activeBlock.attributes, activeBlock.kind, activeMarks) ?? null : null,
    characterStyle: activeBlock ? matchCharacterStyle(activeMarks) ?? null : null,
    listType: activeBlock?.kind === 'listItem' ? activeBlock.attributes.listType ?? null : null,
    indentLevel: activeBlock?.attributes.indentLevel ?? 0,
    lineHeight: activeBlock?.attributes.lineHeight ?? null,
    paragraphSpacingPt: activeBlock?.attributes.paragraphSpacingPt ?? null,
    letterSpacingPt: activeBlock?.attributes.letterSpacingPt ?? null,
    firstLineIndentMm: activeBlock?.attributes.firstLineIndentMm ?? null,
    hangingIndentMm: activeBlock?.attributes.hangingIndentMm ?? null,
    hasTarget: Boolean(activeBlock) && !readOnly,
    canUndo: history.canUndo,
    canRedo: history.canRedo,
    formatPainterArmed: heldFormat !== null,
    findOpen,
  };

  // Shared between the docked toolbar and the floating selection toolbar (Document
  // Studio UX Polish Pack v1) — the floating bar is a second SURFACE for these same
  // commands, not a second implementation of them.
  const onToggleMark = useCallback(
    (mark: InlineMark) => withActiveBlock((d, b) => toggleBlockMark(d, b, mark)),
    [withActiveBlock],
  );
  const onAlign = useCallback(
    (alignment: TextAlignment) => withActiveBlock((d, b) => setBlockAttributes(d, b, { alignment })),
    [withActiveBlock],
  );
  const onFont = useCallback(
    (fontId: FontId) => withActiveBlock((d, b) => setBlockAttributes(d, b, { fontId })),
    [withActiveBlock],
  );
  const onSize = useCallback(
    (sizePt: number) => withActiveBlock((d, b) => setBlockAttributes(d, b, { sizePt })),
    [withActiveBlock],
  );
  const onClearFormatting = useCallback(
    () => withActiveBlock((d, b) => clearBlockFormatting(d, b, bodyAttributes)),
    [withActiveBlock, bodyAttributes],
  );

  // The floating toolbar's anchor: the ACTIVE block's own textarea, read live rather
  // than cached, since `useFloatingPosition` calls this at open-time and again on every
  // scroll/resize while it stays open.
  const getSelectionAnchorRect = useCallback(() => {
    if (!activeBlockId) return null;
    const el = paragraphRefs.current.get(activeBlockId);
    return el ? textareaSelectionRect(el) : null;
  }, [activeBlockId]);

  // Shown only for an actual RANGE selected inside a content block — a collapsed caret
  // has nothing for these commands to act on, and the docked toolbar already covers
  // that case continuously.
  const floatingToolbarOpen =
    !readOnly && !designMode && activeBlockId !== null && selection.caret.selectedCharacters > 0;

  const undo = useCallback(() => {
    setContent((current) => {
      if (!current) return current;
      const restored = history.undo(current);
      if (restored === null) return current;
      setDirty(true);
      return restored;
    });
  }, [history]);

  const redo = useCallback(() => {
    setContent((current) => {
      if (!current) return current;
      const restored = history.redo(current);
      if (restored === null) return current;
      setDirty(true);
      return restored;
    });
  }, [history]);

  /**
   * The format painter.
   *
   * One button with two states: unarmed, it copies the active paragraph's format;
   * armed, it paints that format onto whatever paragraph is active now and disarms.
   * Pressing it twice in a row on the same paragraph is therefore a no-op rather than
   * an error — which is what an author who changed their mind expects.
   */
  const handleFormatPainter = useCallback(() => {
    if (!content || !activeBlockId || readOnly) return;

    if (heldFormat) {
      apply(applyBlockFormat(content, activeBlockId, heldFormat), 'command', activeBlockId);
      setHeldFormat(null);
      return;
    }

    const block = findBlock(content, activeBlockId);
    if (!block) return;
    setHeldFormat(copyBlockFormat(block));
    toast.ok('نُسِخ التنسيق — اختر فقرة لتطبيقه عليها');
  }, [content, activeBlockId, readOnly, heldFormat, apply, toast]);

  /**
   * Paste plain text from the system clipboard at the caret.
   *
   * The paragraph's own `onPaste` already forces plain text for an ordinary Ctrl+V —
   * a textarea cannot receive anything else. This exists for the explicit command, and
   * it routes multi-paragraph text through the same splitting logic.
   */
  const handlePastePlain = useCallback(async () => {
    if (!activeBlockId || readOnly) return;
    const el = paragraphRefs.current.get(activeBlockId);
    if (!el) return;

    let text = '';
    try {
      text = await navigator.clipboard.readText();
    } catch {
      // Clipboard read can be refused by permission policy. Saying so is better than
      // a button that silently does nothing.
      toast.error('تعذّر قراءة الحافظة — استخدم Ctrl+V داخل الفقرة');
      return;
    }
    if (!text) return;

    const start = el.selectionStart;
    const end = el.selectionEnd;
    if (text.includes('\n')) {
      handlers.onPasteMultiline?.(activeBlockId, start, end, text);
      return;
    }
    setContent((current) => {
      if (!current) return current;
      const block = findBlock(current, activeBlockId);
      if (!block) return current;
      history.record(current, 'command', activeBlockId);
      const existing = blockText(block);
      pendingFocus.current = { blockId: activeBlockId, caret: start + text.length };
      return setBlockText(current, activeBlockId, existing.slice(0, start) + text + existing.slice(end));
    });
    setDirty(true);
  }, [activeBlockId, readOnly, handlers, history, toast]);

  /* ── Automation actions ──────────────────────────────────────────────────
     Every one routes through the SAME pure commands a keystroke uses, so an inserted
     variable, a spliced block and a typed character are indistinguishable to the
     document, the undo stack and the save path. */

  /** Insert `{{Name}}` at the caret in the active paragraph. */
  const insertVariable = useCallback(
    (name: string) => {
      if (!content || !activeBlockId || readOnly) return;
      const element = paragraphRefs.current.get(activeBlockId);
      const block = findBlock(content, activeBlockId);
      if (!block) return;

      const text = blockText(block);
      const start = element?.selectionStart ?? text.length;
      const end = element?.selectionEnd ?? start;
      const { text: next, caret } = insertTokenAt(text, start, end, name);

      pendingFocus.current = { blockId: activeBlockId, caret };
      apply(setBlockText(content, activeBlockId, next), 'command', activeBlockId);
      recordRecent('variable', name);
    },
    [content, activeBlockId, readOnly, apply],
  );

  /**
   * Splice a saved block's paragraphs in after the caret.
   *
   * Ids are re-minted: a library entry may be inserted twice into the same letter, and
   * two blocks sharing an id is exactly what the integrity checker rejects.
   */
  const insertReusableBlock = useCallback(
    (entry: ReusableBlockEntry) => {
      if (!content || readOnly) return;
      const parsed = parseDocument(entry.contentJson);
      if (!parsed || parsed.blocks.length === 0) {
        toast.error('تعذّر قراءة المقطع المحفوظ.');
        return;
      }

      const anchorIndex = activeBlockId
        ? content.blocks.findIndex((block) => block.id === activeBlockId)
        : content.blocks.length - 1;

      const fresh = parsed.blocks.map((block) => ({ ...block, id: nextBlockId() }));
      const blocks = [...content.blocks];
      blocks.splice(anchorIndex + 1, 0, ...fresh);

      apply({ ...content, blocks }, 'command', null);
      pendingFocus.current = { blockId: fresh[0].id, caret: 0 };
      recordRecent('block', entry.id);
    },
    [content, activeBlockId, readOnly, apply, toast],
  );

  /**
   * Replace the document from a template.
   *
   * DESTRUCTIVE, and confirmed for that reason — it is the only action in the studio
   * that discards work rather than adding to it.
   */
  const applyTemplate = useCallback(
    (entry: LetterTemplateEntry) => {
      if (!content || readOnly) return;
      const parsed = parseDocument(entry.contentJson);
      if (!parsed) {
        toast.error('تعذّر قراءة القالب.');
        return;
      }
      if (!window.confirm(`سيُستبدل محتوى المستند الحالي بقالب «${entry.name}». هل تريد المتابعة؟`)) return;

      apply(parsed, 'command', null);
      if (entry.subject) setSubject(entry.subject);
      setDirty(true);
      recordRecent('template', entry.id);
      toast.ok(`طُبِّق القالب «${entry.name}»`);
    },
    [content, readOnly, apply, toast],
  );

  /**
   * Save the active paragraph as a reusable block.
   *
   * The BLOCK only — never the layout layer or the bindings. A library entry is
   * spliced INTO a host letter, and carrying a layout with it would silently overwrite
   * the host's own.
   */
  const saveSelectionAsBlock = useCallback(() => {
    if (!content || !activeBlockId || readOnly) return;
    const block = findBlock(content, activeBlockId);
    if (!block) return;

    const text = blockText(block).trim();
    const name = window.prompt('اسم المقطع:', text.slice(0, 40) || 'مقطع جديد');
    if (!name) return;

    void libraryStore
      .save('blocks', {
        kind: 'block',
        id: `blk-${Date.now().toString(36)}`,
        name,
        category: '',
        description: '',
        createdAt: '',
        updatedAt: '',
        contentJson: serialiseDocument({ contentModelVersion: content.contentModelVersion, blocks: [block] }),
        preview: text.slice(0, 60),
      })
      .then((error) => {
        if (error) toast.error(error);
        else toast.ok(`حُفظ المقطع «${name}»`);
      });
  }, [content, activeBlockId, readOnly, libraryStore, toast]);

  /** Save the whole document as a template — blocks, layout and bindings together. */
  const saveDocumentAsTemplate = useCallback(() => {
    if (!content || readOnly) return;
    const name = window.prompt('اسم القالب:', subject || 'قالب جديد');
    if (!name) return;

    void libraryStore
      .save('templates', {
        kind: 'template',
        id: `tpl-${Date.now().toString(36)}`,
        name,
        category: '',
        description: '',
        createdAt: '',
        updatedAt: '',
        // The WHOLE document: a template that restored the text but not the logo it was
        // designed with would not be the template anyone saved.
        contentJson: serialiseDocument(content),
        subject,
        icon: 'lab_profile',
      })
      .then((error) => {
        if (error) toast.error(error);
        else toast.ok(`حُفظ القالب «${name}»`);
      });
  }, [content, subject, readOnly, libraryStore, toast]);

  /** Place an image from the asset library as a positioned object on this page. */
  const insertAssetImage = useCallback(
    (imageUrl: string, alt: string) => {
      if (!content || readOnly) return;
      const id = nextBlockId();
      const next = addObject(documentLayout(content), {
        id,
        kind: 'image',
        pageIndex: currentPage,
        payload: { kind: 'image', image: { imageUrl, alt, fit: 'contain' } },
        // Inside the content band, so a newly placed asset never starts life in a
        // reserved zone and immediately blocking the print.
        frame: { xMm: pageSnapContext.bandLeftMm + 5, yMm: pageSnapContext.bandTopMm + 5 },
        name: alt || 'صورة',
      });
      apply(setDocumentLayout(content, next), 'command', null);
      setDesignMode(true);
      layoutSelection.select([id]);
    },
    [content, readOnly, currentPage, pageSnapContext, apply, layoutSelection],
  );

  /* ── Find and replace ────────────────────────────────────────────────── */

  const searchResult = useMemo(
    () => (findOpen && query ? findInDocument(content, query, searchOptions) : EMPTY_SEARCH_RESULT),
    [findOpen, query, content, searchOptions],
  );

  // A query that now matches fewer things must not leave the index past the end — the
  // panel would show "7 من 3" and Enter would navigate to nothing.
  useEffect(() => {
    setMatchIndex((current) => (current >= searchResult.matches.length ? 0 : current));
  }, [searchResult.matches.length]);

  /**
   * Reveal a match: scroll to its page, focus its paragraph, select its characters.
   *
   * Selecting in the real textarea rather than painting an overlay is what makes the
   * highlight survive scrolling, zooming and re-pagination for free — and it means
   * "replace" acts on exactly what the author can see is selected.
   */
  const revealMatch = useCallback(
    (match: SearchMatch | undefined) => {
      if (!match) return;
      const page = pagination.pages.findIndex((p) => p.itemIds.includes(match.blockId));
      if (page >= 0) goToPage(page);

      // After the frame in which pagination may have re-parented the paragraph.
      requestAnimationFrame(() => {
        const el = paragraphRefs.current.get(match.blockId);
        if (!el) return;
        el.focus();
        el.setSelectionRange(match.start, match.end);
        el.scrollIntoView({ block: 'center', behavior: 'smooth' });
      });
    },
    [pagination, goToPage],
  );

  const stepMatch = useCallback(
    (direction: 1 | -1) => {
      const total = searchResult.matches.length;
      if (total === 0) return;
      const next = (matchIndex + direction + total) % total;
      setMatchIndex(next);
      revealMatch(searchResult.matches[next]);
    },
    [searchResult, matchIndex, revealMatch],
  );

  const handleReplaceOne = useCallback(() => {
    if (readOnly || !content) return;
    const match = searchResult.matches[matchIndex];
    if (!match) return;
    const next = replaceMatch(content, match, replacement, query, searchOptions);
    if (next === content) {
      // `replaceMatch` refuses when the paragraph changed underneath — see its header.
      toast.error('تغيّر النص منذ آخر بحث — أعيدت المطابقة');
      return;
    }
    apply(next, 'command', match.blockId);
  }, [readOnly, content, searchResult, matchIndex, replacement, query, searchOptions, apply, toast]);

  const handleReplaceAll = useCallback(() => {
    if (readOnly || !content) return;
    const { document: next, replaced } = replaceAllInDocument(content, query, replacement, searchOptions);
    if (replaced === 0) return;
    apply(next, 'command', null);
    toast.ok(`استُبدلت ${replaced} نتيجة`);
  }, [readOnly, content, query, replacement, searchOptions, apply, toast]);

  const openFind = useCallback((withReplace: boolean) => {
    setFindOpen(true);
    setReplaceMode(withReplace);
  }, []);

  /* ── Statistics and outline ──────────────────────────────────────────── */

  const stats = useMemo(
    () => documentStats(content, [subject, recipient.name, recipient.title, recipient.organisation]),
    [content, subject, recipient],
  );

  const language = useMemo(() => {
    const sample = [
      ...(content?.blocks ?? []).map(blockText),
      subject,
      recipient.name,
      recipient.organisation,
    ].join(' ');
    return detectLanguage(sample);
  }, [content, subject, recipient]);

  const outline = useMemo(
    () =>
      buildDocumentOutline(
        content,
        {
          hasSignature: resolvedSignature !== null || resolvedStamp !== null,
          reference: letter?.reference ?? null,
        },
        pagination,
      ),
    [content, resolvedSignature, resolvedStamp, letter?.reference, pagination],
  );

  /* ── Save ────────────────────────────────────────────────────────────── */

  /**
   * Persist a signature or stamp choice at once, rather than waiting for autosave.
   *
   * Immediate because it is a deliberate, discrete decision the user expects to stick —
   * and because the backend records a timeline event for it, which should describe the
   * moment they chose rather than the moment a timer expired.
   */
  const persistBranding = useCallback(
    async (fields: { signatureAssetId?: string | null; stampAssetId?: string | null }) => {
      if (!letter || readOnly) return;
      try {
        const { data } = await api.patch(`/letters/${letter.id}`, fields);
        setLetter((current) => (current ? { ...current, ...data.data } : current));
      } catch (err) {
        toast.error(errorMessage(err));
      }
    },
    [letter, readOnly, toast],
  );

  const save = useCallback(async () => {
    if (!letter || !content || readOnly) return;
    setSaving(true);
    try {
      await api.patch(`/letters/${letter.id}`, {
        subject,
        issueDate: issueDate || undefined,
        recipientName: recipient.name || null,
        recipientTitle: recipient.title || null,
        recipientOrganisation: recipient.organisation || null,
        contentJson: serialiseDocument(content),
      });
      setDirty(false);
      setSavedAt(new Date());
    } catch (err) {
      toast.error(errorMessage(err));
    } finally {
      setSaving(false);
    }
  }, [letter, content, subject, issueDate, recipient, readOnly, toast]);

  /**
   * Register: issue the permanent number and freeze the document.
   *
   * Declared after `save` because it saves first — registration freezes the content,
   * so anything still unsaved would be frozen OUT of the document rather than into it.
   */
  const handleRegister = useCallback(async () => {
    if (!letter || !canRegister) return;
    const snapshot = buildSnapshot();
    if (!snapshot) return;

    setRegistering(true);
    try {
      if (dirty) await save();
      // The PRE_REGISTER snapshot is taken by the SERVER, inside the registration
      // transaction — not here. Only registration knows a registration is happening,
      // and only the transaction can guarantee that a rolled-back registration leaves
      // no snapshot of a number that was never issued.
      const registered = await registerLetter(letter.id, snapshot);
      // Adopt the server's answer wholesale rather than patching locally: the
      // reference, the status and the stored snapshot are all decided there, and the
      // composer must show what was actually recorded.
      setLetter((current) => (current ? { ...current, ...(registered as unknown as Partial<LoadedLetter>) } : current));
      setDirty(false);
      toast.ok(`تم تسجيل المستند برقم ${registered.reference ?? ''}`);
    } catch (err) {
      toast.error(errorMessage(err));
    } finally {
      setRegistering(false);
    }
  }, [letter, canRegister, buildSnapshot, dirty, save, toast]);

  /* ── Design-mode keyboard ────────────────────────────────────────────────
     Registered SEPARATELY from the studio's text shortcuts and only while Design mode
     is on. Delete, Ctrl+D and the arrow keys all mean something in a text editor, so
     binding them unconditionally would break typing — and the two maps would fight for
     the same chords with mount order deciding the winner. */
  useEffect(() => {
    if (!designMode || readOnly || loading) return;

    const onKeyDown = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null;
      // A rename field, an inspector input, the find box: their keys are theirs.
      if (target && (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.tagName === 'SELECT')) return;

      const ctrl = event.ctrlKey || event.metaKey;
      const step = event.shiftKey ? NUDGE_COARSE_MM : ctrl ? NUDGE_FINE_MM : NUDGE_MM;

      switch (event.key) {
        case 'Delete':
        case 'Backspace':
          if (layoutSelection.count === 0) return;
          event.preventDefault();
          designer.remove();
          return;
        case 'ArrowUp':
          if (layoutSelection.count === 0) return;
          event.preventDefault();
          designer.move(0, -step);
          return;
        case 'ArrowDown':
          if (layoutSelection.count === 0) return;
          event.preventDefault();
          designer.move(0, step);
          return;
        case 'ArrowLeft':
          if (layoutSelection.count === 0) return;
          event.preventDefault();
          designer.move(-step, 0);
          return;
        case 'ArrowRight':
          if (layoutSelection.count === 0) return;
          event.preventDefault();
          designer.move(step, 0);
          return;
        case 'Escape':
          layoutSelection.clear();
          return;
        default:
          break;
      }

      if (!ctrl) return;

      switch (event.key.toLowerCase()) {
        case 'd':
          event.preventDefault();
          designer.duplicate();
          break;
        case 'g':
          event.preventDefault();
          // Ctrl+Shift+G ungroups — the pairing every design tool shares.
          if (event.shiftKey) designer.ungroupSelection();
          else designer.group();
          break;
        case 'a':
          event.preventDefault();
          designer.selectAllOnPage(currentPage);
          break;
        case 'i':
          if (!event.shiftKey) return;
          event.preventDefault();
          designer.invertOnPage(currentPage);
          break;
        case ']':
          event.preventDefault();
          designer.reorder(event.shiftKey ? 'front' : 'forward');
          break;
        case '[':
          event.preventDefault();
          designer.reorder(event.shiftKey ? 'back' : 'backward');
          break;
        default:
          break;
      }
    };

    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [designMode, readOnly, loading, designer, layoutSelection, currentPage]);

  /** Ctrl+S, held in a ref so the shortcut map need not wait for the auto-save hook. */
  const saveNowRef = useRef<() => Promise<void>>(async () => {});

  /* ── Keyboard ────────────────────────────────────────────────────────── */

  useDocumentShortcuts(
    useMemo(
      () => ({
        toggleBold: () => withActiveBlock((d, b) => toggleBlockMark(d, b, 'bold')),
        toggleUnderline: () => withActiveBlock((d, b) => toggleBlockMark(d, b, 'underline')),
        copyFormat: handleFormatPainter,
        pasteFormat: handleFormatPainter,
        pastePlain: () => void handlePastePlain(),
        openFind: () => openFind(false),
        openReplace: () => openFind(true),
        findNext: () => stepMatch(1),
        findPrevious: () => stepMatch(-1),
        undo,
        redo,
        // Through the ref: the shortcut map is built before the auto-save hook runs,
        // and the chord fires long after both exist.
        save: () => void saveNowRef.current(),
        print: () => void handlePrint(),
        repeatLastAction: () => lastAction.current?.(),
        zoomIn: () => setManualZoom(stepZoom(zoom, 'in')),
        zoomOut: () => setManualZoom(stepZoom(zoom, 'out')),
        zoomReset: () => setManualZoom(1),
        nextPage: () => goToPage(currentPage + 1),
        previousPage: () => goToPage(currentPage - 1),
        firstPage: () => goToPage(0),
        lastPage: () => goToPage(pageCount - 1),
        closeOverlay: () => {
          if (shortcutsOpen) setShortcutsOpen(false);
          else if (findOpen) setFindOpen(false);
        },
      }),
      [
        withActiveBlock, handleFormatPainter, handlePastePlain, openFind, stepMatch, undo, redo,
        handlePrint, setManualZoom, zoom, goToPage, currentPage, pageCount, shortcutsOpen, findOpen,
      ],
    ),
    !loading,
  );

  /**
   * The branding selection, backed by the LETTER rather than by ephemeral print state.
   *
   * `BrandingAssetPicker` is reused exactly as every other printable form uses it —
   * same control, same options, same «بدون» entry. The only difference is where the
   * answer is kept: other documents choose per print, whereas a letter's signature is
   * part of the document and must survive closing the composer. So the setters persist
   * immediately and the timeline records the change.
   *
   * `show*` is pinned true because the letter expresses "do not print this" by
   * selecting «بدون», not by a second hidden switch. Two ways to say the same thing
   * would let a letter carry a signature that silently does not print.
   */
  const brandingSelection: BrandingSelection = useMemo(() => ({
    signatures: branding.signatures,
    stamps: branding.stamps,
    signatureId: letter?.signatureAssetId ?? NO_ASSET,
    stampId: letter?.stampAssetId ?? NO_ASSET,
    setSignatureId: (id: string) => void persistBranding({ signatureAssetId: id || null }),
    setStampId: (id: string) => void persistBranding({ stampAssetId: id || null }),
    showSignature: true,
    showStamp: true,
    setShowSignature: () => {},
    setShowStamp: () => {},
    // A letter has its own barcode system (`LetterBarcode`, driven by the template's
    // barcode spec) and never renders the branding designer's barcode element, so this
    // pair is inert here — present only to satisfy the shared selection shape.
    showBarcode: false,
    setShowBarcode: () => {},
    signatureUrl: resolvedSignature?.imageUrl,
    stampUrl: resolvedStamp?.imageUrl,
    ready: !branding.loading,
  }), [branding, letter?.signatureAssetId, letter?.stampAssetId, resolvedSignature, resolvedStamp, persistBranding]);

  /* ── Auto-save and crash recovery ────────────────────────────────────────
     Two independent mechanisms: a debounced server save with a hard ceiling, and a
     localStorage draft written on every change. See `useAutoSave` for why one
     mechanism cannot be both fast enough to survive a crash and infrequent enough not
     to hammer the server. */
  const autoSave = useAutoSave({
    letterId,
    dirty,
    enabled: !readOnly && !loading,
    draft:
      content && letter
        ? {
            contentJson: serialiseDocument(content),
            subject,
            issueDate,
            recipientName: recipient.name,
            recipientTitle: recipient.title,
            recipientOrganisation: recipient.organisation,
          }
        : null,
    save,
  });
  saveNowRef.current = autoSave.saveNow;

  /**
   * Offer a parked draft, once, after the letter has loaded.
   *
   * Offered rather than applied: the local copy may be older than what another machine
   * saved, and silently overwriting the server's version with a stale tab's leftovers
   * is a worse failure than losing the leftovers.
   */
  const [recoveryOffered, setRecoveryOffered] = useState(false);

  useEffect(() => {
    if (loading || readOnly || recoveryOffered || !content || !letter) return;
    setRecoveryOffered(true);

    const parked = readRecoveryDraft(letterId);
    if (!parked) return;
    // Identical to what loaded — the last session ended cleanly after all.
    if (parked.contentJson === serialiseDocument(content) && parked.subject === subject) {
      clearRecoveryDraft(letterId);
      return;
    }

    const when = new Date(parked.at).toLocaleString('en-GB');
    if (!window.confirm(`تم العثور على تغييرات غير محفوظة من ${when}. هل تريد استعادتها؟`)) {
      clearRecoveryDraft(letterId);
      return;
    }

    const restored = parseDocument(parked.contentJson);
    if (!restored) {
      toast.error('تعذّر قراءة النسخة المستعادة.');
      clearRecoveryDraft(letterId);
      return;
    }

    setContent(restored);
    setSubject(parked.subject);
    setIssueDate(parked.issueDate);
    setRecipient({
      name: parked.recipientName,
      title: parked.recipientTitle,
      organisation: parked.recipientOrganisation,
    });
    setDirty(true);
    toast.ok('استُعيدت التغييرات غير المحفوظة.');
    // `content`/`subject` are read once at first opportunity and must not re-trigger.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loading, readOnly, recoveryOffered, letterId]);

  /* ── Render ──────────────────────────────────────────────────────────── */

  if (loading) {
    return (
      <div className="lc-page">
        <SkeletonRows rows={4} withAvatar={false} />
      </div>
    );
  }

  if (error || !letter || !content) {
    return (
      <div className="lc-page">
        <ErrorBanner>{error ?? 'تعذّر تحميل المستند.'}</ErrorBanner>
        <Button icon="arrow_forward" onClick={() => navigate('/forms/official-letter')}>العودة إلى القائمة</Button>
      </div>
    );
  }

  /**
   * Render one flow item.
   *
   * `forMeasure` selects the measurement mirror: a static, read-only rendering with
   * identical typography and width, so a measured height equals the height the same
   * item will occupy on the page. It is never interactive and never focusable.
   */
  const renderItem = (itemId: string, forMeasure: boolean) => {
    // `printMode` renders the page stack in its read-only form: the same components in
    // the mode the measurement mirror already uses, so what prints is exactly what was
    // measured. It is view state — the document is untouched.
    const staticOnly = forMeasure || readOnly || printMode || previewValues;

    switch (itemId) {
      case 'signature':
        return <SignatureBlock key="signature" active={!forMeasure && selection.activeSection === 'signature'} severity={forMeasure ? null : sectionSeverity.get('signature') ?? null} onFocus={() => selection.setActiveSection('signature')} signature={resolvedSignature} stamp={resolvedStamp} signatureHeightMm={geometry.signatureHeightMm} stampHeightMm={geometry.stampHeightMm} />;
      case 'barcode':
        return <BarcodeBlock key="barcode" active={!forMeasure && selection.activeSection === 'barcode'} severity={forMeasure ? null : sectionSeverity.get('barcode') ?? null} onFocus={() => selection.setActiveSection('barcode')} payload={barcodePayload} reference={letter.reference} sizeMm={geometry.barcodeSizeMm} />;
      default: {
        const block = renderedBlocks.find((candidate) => candidate.id === itemId);
        if (!block) return null;
        return (
          <ContentSection
            key={itemId}
            document={{ ...content, blocks: [block] }}
            indentStepMm={INDENT_STEP_MM}
            readOnly={staticOnly}
            active={!forMeasure && selection.activeSection === 'content'}
            severity={forMeasure ? null : sectionSeverity.get('content') ?? null}
            handlers={handlers}
            registerRef={forMeasure ? () => {} : registerRef}
            onFocus={() => selection.setActiveSection('content')}
            listOrdinals={listOrdinals}
            resolveText={resolveText}
          />
        );
      }
    }
  };

  /**
   * The positioned layer for one sheet: the objects' ink, then the designer's chrome.
   *
   * The INK renders in both modes and prints — an object is part of the letter whether
   * or not the author is currently arranging it. The CANVAS renders only in Design
   * mode and never prints; it is where selection, handles and guides live.
   */
  const renderLayoutLayer = (pageIndex: number) => {
    const objects = objectsOnPage(designer.layout, pageIndex);
    const anyOnPage = objects.length > 0;
    if (!anyOnPage && !designMode) return null;

    return (
      <>
        {paintOrder(objects)
          .filter((object) => !object.hidden)
          .map((object) => (
            <LayoutObjectView key={object.id} object={object} resolveText={resolveText} />
          ))}

        {designMode && !printMode && (
          <LayoutCanvas
            layout={designer.layout}
            pageIndex={pageIndex}
            selection={layoutSelection}
            page={pageSnapContext}
            snap={snapSettings}
            pxPerMm={pxPerMm}
            reservedBands={reservedZonesMm(geometry, pageIndex)}
            showGuides={showLayoutGuides}
            readOnly={readOnly}
            onMove={designer.move}
            onResize={designer.resize}
            onRotate={designer.rotate}
            onGuideMove={designer.moveGuideTo}
          />
        )}
      </>
    );
  };

  return (
    <div className={`lc-page${designMode ? ' is-designing' : ''}`} dir="rtl">
      <div className="lc-toolbar-shell">
        {/* ── The topbar ─────────────────────────────────────────────────────
            Replaces `ExecutiveHeader` (Form Editor UX Rebuild v2). Same ExplorerKit
            primitives — `Icon`, `Button`, `StatusChip` — none of the identity-card
            styling: no logo box, no gradient, no rounded card sitting above the
            toolbar. One row, sharing this shell's single border and shadow with the
            formatting toolbar directly beneath it. */}
        <div className="lc-topbar">
          <button
            type="button"
            className="lc-topbar-back"
            onClick={() => navigate('/forms/official-letter')}
            aria-label={t('btn.inv.back')}
          >
            <Icon name="arrow_forward" />
          </button>
          <div className="lc-topbar-identity">
            <h1 className="lc-topbar-title">{t('page.officialLetter.title')}</h1>
            <span className="lc-topbar-subtitle">{letter.reference ?? 'مسودة — لم يُخصَّص رقم مرجعي بعد'}</span>
            <div className="lc-topbar-chips">
              <StatusChip tone={LETTER_STATUS_TONE[letter.status]}>{LETTER_STATUS_LABEL_AR[letter.status]}</StatusChip>
              {letter.isArchived && <StatusChip tone="neutral" icon="inventory_2">مؤرشف</StatusChip>}
            </div>
          </div>
          <div className="lc-topbar-aside">
            <div className="lc-save-state">
              {readOnly ? (
                <span className="lc-readonly-pill"><Icon name="lock" />للقراءة فقط</span>
              ) : saving ? (
                <span><Icon name="sync" />جارٍ الحفظ…</span>
              ) : autoSave.state === 'failed' ? (
                <span className="is-failed" title={autoSave.lastError ?? undefined}>
                  <Icon name="cloud_off" />تعذّر الحفظ — التغييرات محفوظة محليًا
                </span>
              ) : dirty ? (
                <span><Icon name="edit" />تغييرات غير محفوظة</span>
              ) : savedAt ? (
                <span className="is-saved"><Icon name="check" />محفوظ</span>
              ) : null}
              {!readOnly && (
                <Button small icon="save" onClick={() => void save()} busy={saving} disabled={!dirty}>حفظ</Button>
              )}
              {/* HIDDEN rather than disabled, unlike Print: registration is a one-way
                  action that applies to exactly one lifecycle state. On a letter that
                  already carries a number there is nothing to offer and no useful
                  explanation to give — the reference is displayed in the topbar instead. */}
              {canRegister && (
                <Button
                  small
                  variant="primary"
                  icon="verified"
                  onClick={() => void handleRegister()}
                  busy={registering}
                  title="إصدار رقم مرجعي دائم وتجميد محتوى المستند"
                >
                  تسجيل وإصدار رقم
                </Button>
              )}
              {/* Every destination behind one control, and every one of them passes the
                  same validation gate — see `runExport`/`runDocxExport`. */}
              <select
                className="lc-export-select"
                value=""
                disabled={exporting || printing || !validationSummary.readyForPrinting}
                onChange={(e) => {
                  const format = e.target.value;
                  e.currentTarget.value = '';
                  if (format) void handleExport(format as ExportFormat);
                }}
                aria-label="تصدير"
                title={
                  validationSummary.readyForPrinting
                    ? 'تصدير أو طباعة'
                    : `لا يمكن التصدير: ${validationSummary.blocking} خطأ مانع`
                }
              >
                <option value="" disabled>تصدير…</option>
                {EXPORT_FORMATS.map((entry) => (
                  <option
                    key={entry.id}
                    value={entry.available ? entry.id : ''}
                    disabled={!entry.available}
                    title={entry.unavailableReasonAr}
                  >
                    {entry.labelAr}{entry.available ? '' : ' — غير مدعوم'}
                  </option>
                ))}
              </select>
              {accuratePreview.button}
              <Button
                small
                icon="print"
                onClick={() => void handlePrint()}
                busy={printing}
                disabled={!validationSummary.readyForPrinting}
                title={
                  validationSummary.readyForPrinting
                    ? 'طباعة المستند'
                    : validationSummary.blocking > 0
                      ? `لا يمكن الطباعة: ${validationSummary.blocking} خطأ مانع`
                      : 'لا يمكن الطباعة: التحقّق غير مكتمل'
                }
              >
                طباعة
              </Button>
            </div>
          </div>
        </div>

      {/* ── Mode switch ───────────────────────────────────────────────────
          Two named modes rather than a hidden modifier key: Compose writes the
          document, Design arranges what sits on top of it. Naming them is what makes
          the different pointer behaviour predictable instead of surprising.

          HIDDEN ON ARRIVAL (Form Editor UX Simplification Pack v1). A person opening a
          blank page to type has no use for a tab pair whose second member is a design
          surface, and a permanently visible "Design" tab is an invitation to discover
          a workspace they did not ask for.

          But the tabs appear the moment Design mode is ENTERED, even with the master
          switch off — because that is the moment they stop being decoration and become
          the way back. Gating them on `advancedMode` alone would have left someone who
          opened the designer from the Advanced Tools menu with no visible exit, which
          is the trap progressive disclosure exists to avoid. */}
      {(advancedMode || designMode) && (
      <div className="lc-modes" role="tablist" aria-label="وضع التحرير">
        <button
          type="button"
          role="tab"
          aria-selected={!designMode}
          className={`lc-mode${!designMode ? ' is-on' : ''}`}
          onClick={() => {
            setDesignMode(false);
            layoutSelection.clear();
          }}
        >
          <Icon name="edit_note" />
          تحرير النص
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={designMode}
          className={`lc-mode${designMode ? ' is-on' : ''}`}
          onClick={() => setDesignMode(true)}
        >
          <Icon name="design_services" />
          تصميم التخطيط
          {designer.layout.objects.length > 0 && (
            <span className="lc-mode-count">{designer.layout.objects.length}</span>
          )}
        </button>
      </div>
      )}

      <div className="lc-bars">
        {designMode ? (
          <LayoutToolbar
            selectionCount={layoutSelection.count}
            canGroup={designer.canGroup}
            canUngroup={designer.canUngroup}
            snap={snapSettings}
            showGuides={showLayoutGuides}
            guidesLocked={designer.layout.guides.every((guide) => guide.locked)}
            readOnly={readOnly}
            onInsert={(kind: LayoutObjectKind) =>
              // Placed inside the content band rather than at the sheet's corner, so a
              // newly inserted object never starts life inside a reserved zone and
              // immediately blocking the print.
              designer.insert(kind, currentPage, {
                xMm: pageSnapContext.bandLeftMm + 5,
                yMm: pageSnapContext.bandTopMm + 5,
              })
            }
            onAlign={(action: AlignAction) => designer.align(action, pageSnapContext)}
            onGroup={designer.group}
            onUngroup={designer.ungroupSelection}
            onReorder={designer.reorder}
            onDuplicate={designer.duplicate}
            onDelete={designer.remove}
            onSnapChange={setSnapSettings}
            onToggleGuides={() => setShowLayoutGuides(!showLayoutGuides)}
            onToggleGuidesLocked={() =>
              designer.lockGuides(!designer.layout.guides.every((guide) => guide.locked))
            }
            onAddGuide={(axis) =>
              designer.addGuideAt(
                axis,
                axis === 'vertical'
                  ? pageSnapContext.pageWidthMm / 2
                  : pageSnapContext.pageHeightMm / 2,
              )
            }
          />
        ) : (
        <DocumentToolbar
          allowedCommands={template.toolbarCommands}
          // Essential by default: font, size, three marks, alignment, lists, clear
          // formatting, undo, redo. Advanced mode restores the full nineteen. See
          // `ESSENTIAL_COMMANDS` for why this is a third term in one intersection
          // rather than a second toolbar.
          variant={advancedMode ? 'full' : 'essential'}
          state={toolbarState}
          disabled={readOnly}
          onToggleMark={onToggleMark}
          onAlign={onAlign}
          onFont={onFont}
          onSize={onSize}
          onParagraphStyle={(style: ParagraphStyle) => withActiveBlock((d, b) => applyParagraphStyle(d, b, style))}
          onCharacterStyle={(style: CharacterStyle) => withActiveBlock((d, b) => applyCharacterStyle(d, b, style))}
          onToggleList={(listType: ListType) => withActiveBlock((d, b) => toggleListType(d, b, listType))}
          onIndent={(direction) => withActiveBlock((d, b) => stepBlockIndent(d, b, direction))}
          onLineHeight={(lineHeight) => withActiveBlock((d, b) => setBlockAttributes(d, b, { lineHeight }))}
          onParagraphSpacing={(paragraphSpacingPt) => withActiveBlock((d, b) => setBlockAttributes(d, b, { paragraphSpacingPt }))}
          onLetterSpacing={(letterSpacingPt) => withActiveBlock((d, b) => setBlockAttributes(d, b, { letterSpacingPt }))}
          onFirstLineIndent={(mm) => withActiveBlock((d, b) => setBlockIndentation(d, b, { firstLineIndentMm: mm }))}
          onHangingIndent={(mm) => withActiveBlock((d, b) => setBlockIndentation(d, b, { hangingIndentMm: mm }))}
          onFormatPainter={handleFormatPainter}
          onPastePlain={() => void handlePastePlain()}
          onClearFormatting={onClearFormatting}
          onToggleFind={() => (findOpen ? setFindOpen(false) : openFind(false))}
          onUndo={undo}
          onRedo={redo}
        />
        )}
        <FloatingContextToolbar
          open={floatingToolbarOpen}
          getAnchorRect={getSelectionAnchorRect}
          allowedCommands={template.toolbarCommands}
          state={toolbarState}
          onToggleMark={onToggleMark}
          onAlign={onAlign}
          onFont={onFont}
          onSize={onSize}
          onClearFormatting={onClearFormatting}
        />
        {/* The signature and stamp choice sits with the view controls rather than in
            the paper: it is a decision ABOUT the document, and putting a dropdown on
            the sheet would put chrome where only ink belongs. Hidden once the letter
            is read-only, because a registered letter's signature is frozen with it. */}
        {!readOnly && (
          <div className="lc-view-bar lc-branding-bar">
            <BrandingAssetPicker selection={brandingSelection} />
          </div>
        )}
        {/* Insert is a PRIMARY surface now (Form Editor UX Rebuild v2), not an advanced
            one — a plain toggle on the strip rather than a row inside the menu below,
            open by default so the left rail is there from the first frame. */}
        {!designMode && (
          <div className="lc-view-bar">
            <button
              type="button"
              className={`lc-insert-toggle${insertOpen ? ' is-on' : ''}`}
              onClick={() => setInsertOpen(!insertOpen)}
              disabled={readOnly}
              aria-pressed={insertOpen}
              aria-label={insertOpen ? 'إغلاق لوحة الإدراج' : 'فتح لوحة الإدراج'}
              title="متغيّرات ومقاطع محفوظة وقوالب وأصول"
            >
              <Icon name="add_circle" />
              إدراج
            </button>
          </div>
        )}
        {/* ── The one door to everything else ───────────────────────────────
            Four automation buttons, four view toggles and three rails used to live on
            this strip permanently. They are all still here — behind one control, with
            a hint on each row saying what it does rather than what it is called. See
            `AdvancedToolsMenu` for why each row is a destination rather than a switch.

            The VIEW controls stay on the strip in advanced mode only. Rulers, grid and
            reserved bands are chrome about the paper, and the author who has asked for
            the dense studio is the one who wants them a single click away. */}
        <div className="lc-view-bar">
          <AdvancedToolsMenu
            advanced={advancedMode}
            onAdvancedChange={setAdvancedMode}
            readOnly={readOnly}
            hasCaret={activeBlockId !== null}
            designMode={designMode}
            onDesignMode={(on) => {
              setDesignMode(on);
              if (!on) layoutSelection.clear();
            }}
            objectCount={designer.layout.objects.length}
            previewValues={previewValues}
            onPreviewValues={setPreviewValues}
            propertiesOpen={propertiesOpen}
            onPropertiesOpen={setPropertiesOpen}
            onCondition={() => setConditionFor(activeBlockId)}
            findOpen={findOpen}
            onToggleFind={() => (findOpen ? setFindOpen(false) : openFind(false))}
            validationOpen={validationOpen}
            onToggleValidation={() => setValidationOpen(!validationOpen)}
            validationCount={validationSummary.total}
            showNavigator={showNavigator}
            onToggleNavigator={() => setShowNavigator(!showNavigator)}
          />
          {advancedMode && (
            <DocumentViewControls
              showRulers={showRulers}
              onToggleRulers={() => setShowRulers(!showRulers)}
              showGrid={showGrid}
              onToggleGrid={() => setShowGrid(!showGrid)}
              showZones={showZones}
              onToggleZones={() => setShowZones(!showZones)}
              showNavigator={showNavigator}
              onToggleNavigator={() => setShowNavigator(!showNavigator)}
            />
          )}
        </div>

        {findOpen && (
          <FindReplacePanel
            query={query}
            replacement={replacement}
            options={searchOptions}
            matchCount={searchResult.matches.length}
            activeIndex={searchResult.matches.length === 0 ? -1 : matchIndex}
            replaceMode={replaceMode}
            canReplace={!readOnly}
            onQueryChange={setQuery}
            onReplacementChange={setReplacement}
            onOptionsChange={setSearchOptions}
            onNext={() => stepMatch(1)}
            onPrevious={() => stepMatch(-1)}
            onReplaceOne={handleReplaceOne}
            onReplaceAll={handleReplaceAll}
            onToggleReplaceMode={() => setReplaceMode((v) => !v)}
            onClose={() => setFindOpen(false)}
          />
        )}
      </div>
      </div>

      {accuratePreview.dialog}

      {readOnly && letter.status !== 'DRAFT' && (
        <div className="lc-notice" role="status">
          <Icon name="lock" />
          محتوى المستند مُجمَّد منذ التسجيل — أي تعديل بعده يجعل النسخة المحفوظة تخالف النسخة المسلَّمة.
        </div>
      )}

      <div className="lc-workspace">
        {/* In Design mode the rail carries the Layers panel instead of the page
            thumbnails: the two answer different questions ("where am I" versus "what
            is on this page"), and only one of them is useful while arranging objects.
            The panel is also the keyboard-accessible face of the canvas — see its
            header for why the canvas itself carries no tab stops. */}
        {showNavigator && designMode && (
          <aside
            className="dnv-rail lc-rail-in"
            aria-label="لوحة الطبقات"
            ref={navRail.railRef}
            style={{ '--rail-w': `${navRail.width}px` } as React.CSSProperties}
          >
            <RailResizeHandle
              handleRef={navRail.handleRef}
              label="تغيير عرض لوحة الطبقات"
              edge="before"
              onPointerDown={navRail.startDrag}
              onKeyDown={navRail.onHandleKeyDown}
            />
            <LayersPanel
              layout={designer.layout}
              selection={layoutSelection}
              readOnly={readOnly}
              onSelect={(ids, additive) => {
                if (additive) layoutSelection.add(ids);
                else layoutSelection.select(ids);
                // Following the selection to its page is what makes the panel a
                // navigator as well as a list.
                const first = designer.layout.objects.find((object) => object.id === ids[0]);
                if (first && first.pageIndex !== currentPage) goToPage(first.pageIndex);
              }}
              onToggleHidden={designer.setHiddenFor}
              onToggleLocked={designer.setLockedFor}
              onRename={designer.rename}
              onRenameGroup={(id, name) => designer.setGroup(id, { name })}
              onToggleGroupCollapsed={(id, collapsed) => designer.setGroup(id, { collapsed })}
              onToggleGroupHidden={(id, hidden) => designer.setGroup(id, { hidden })}
              onToggleGroupLocked={(id, locked) => designer.setGroup(id, { locked })}
              onReorder={designer.reorderBefore}
              onUngroup={(groupId) => {
                layoutSelection.select([]);
                designer.setGroup(groupId, {});
                designer.ungroupSelection();
              }}
            />
          </aside>
        )}

        {showNavigator && !designMode && (
          <DocumentNavigator
            tab={navigatorTab}
            onTabChange={setNavigatorTab}
            currentPage={currentPage}
            pageCount={pageCount}
            pagination={pagination}
            geometry={geometry}
            itemHeightsMm={itemHeightsMm}
            outline={outline}
            onGoToPage={goToPage}
            onGoToOutlineEntry={goToOutlineEntry}
            resize={navRail}
            onClose={() => setShowNavigator(false)}
          />
        )}

        {/* ── The right-hand panel — "خصائص العنصر" ───────────────────────
            Contextual, not a manual toggle: in Design mode it IS the Object
            Inspector, and its own empty state already reads "nothing selected" when
            `designer.selected` is empty — selecting an object is what populates it,
            exactly the appearing-on-selection behaviour the mockup asks for. Outside
            Design mode there is no selectable object, so the same slot carries the
            still-on-demand Document Properties rail instead. The two never compete:
            one is gated on `designMode`, the other on its opposite. */}
        {designMode ? (
          <ObjectInspector
            objects={designer.selected}
            pageCount={pageCount}
            readOnly={readOnly}
            onFrame={designer.setFrame}
            onRotate={designer.rotate}
            onOpacity={designer.setOpacity}
            onPage={designer.setPage}
            onLocked={designer.setLocked}
            onHidden={designer.setHidden}
            onReorder={designer.reorder}
            onPayload={designer.setPayload}
            resize={inspectorRail}
          />
        ) : (
          propertiesOpen && letter && content && (
            <DocumentPropertiesPanel
              reference={letter.reference}
              statusLabel={LETTER_STATUS_LABEL_AR[letter.status]}
              templateName={template.displayNameAr}
              authorName={letter.createdByName ?? null}
              createdAt={letter.createdAt ?? null}
              updatedAt={letter.updatedAt ?? null}
              lastSavedAt={savedAt}
              versions={letter.versions}
              contentModelVersion={content.contentModelVersion}
              language={language}
              stats={stats}
              pageCount={pageCount}
              objectCount={documentLayout(content).objects.length}
              variableCount={usedVariables.length}
              conditionCount={content.blocks.filter((b) => conditionSize(b.attributes.condition) > 0).length}
              onClose={() => setPropertiesOpen(false)}
              resize={inspectorRail}
            />
          )
        )}

        <div className="lc-paper-area">
          {/* MEASUREMENT LAYER — laid out, never painted, and deliberately OUTSIDE the
              zoom wrapper so a measured height cannot depend on the zoom. Rendered at the
              content band's exact width so wrapping matches the page exactly. */}
          <div
            className="lp-measure-layer"
            aria-hidden="true"
            style={{ width: `${geometry.contentWidthMm}mm` }}
          >
            <div className="lp-measure-probe" ref={probeRef} style={{ width: `${PROBE_WIDTH_MM}mm` }} />
            {items.map((item) => (
              <div key={item.id} ref={measureRef(item.id)}>
                {renderItem(item.id, true)}
              </div>
            ))}
          </div>

          <LetterPageStack
            ref={viewportEl}
            printProfileId={profileId}
            layoutVersion={layoutVersion}
            pageCount={pageCount}
            zoom={zoom}
            // Derived, not the raw preferences — see `showChrome`. In the simple
            // experience the sheet is a blank sheet: no rulers, no grid, no band tints.
            showRulers={rulersOn}
            showGrid={gridOn}
            showZones={zonesOn}
            currentPage={currentPage}
            pageRef={pageRef}
            renderPage={(pageIndex) => itemsOnPage(pageIndex).map((itemId) => renderItem(itemId, false))}
            renderLayoutLayer={renderLayoutLayer}
          />
        </div>

        {/* ── The left-hand panel — Insert ────────────────────────────────
            The rail from the mockup: open by default, closed only if the author
            closes it (or turns it off from the toolbar toggle) — see `insertOpen`. */}
        {!designMode && insertOpen && (
          <InsertPanel
            library={libraryStore.library}
            signatures={branding.signatures}
            stamps={branding.stamps}
            readOnly={readOnly}
            hasCaret={activeBlockId !== null}
            onInsertVariable={insertVariable}
            onInsertBlock={insertReusableBlock}
            onApplyTemplate={applyTemplate}
            onInsertAsset={insertAssetImage}
            onSaveSelectionAsBlock={saveSelectionAsBlock}
            onSaveDocumentAsTemplate={saveDocumentAsTemplate}
            onClose={() => setInsertOpen(false)}
            resize={insertRail}
          />
        )}
      </div>

      <DocumentStatusBar
        currentPage={currentPage}
        pageCount={pageCount}
        stats={stats}
        caret={selection.caret}
        language={language}
        readOnly={readOnly}
        zoom={zoom}
        zoomMode={zoomMode}
        onZoomPreset={setManualZoom}
        onFitWidth={() => setZoomMode('fitWidth')}
        onFitPage={() => setZoomMode('fitPage')}
        onShowShortcuts={() => setShortcutsOpen(true)}
        design={
          designMode
            ? {
                selectionCount: layoutSelection.count,
                objectName: designer.selected.length === 1 ? designer.selected[0].name : null,
                xMm: designer.selectionBounds?.xMm ?? null,
                yMm: designer.selectionBounds?.yMm ?? null,
                widthMm: designer.selectionBounds?.widthMm ?? null,
                heightMm: designer.selectionBounds?.heightMm ?? null,
                snapEnabled: snapSettings.enabled,
                gridVisible: showGrid,
              }
            : null
        }
      />

      {/* Beside the paper, never over it: no modal, no alert, no toast.

          In the simple experience it appears only when it has something the author
          MUST act on — a blocking finding is the reason Print is disabled, and a
          disabled button with no visible explanation is the one thing worse than the
          panel itself. Warnings and information wait behind the Advanced Tools menu,
          which is where someone who wants them will look. */}
      {(advancedMode || validationSummary.blocking > 0 || validationOpen) && (
        <ValidationPanel
          result={validation}
          summary={validationSummary}
          open={validationOpen}
          onToggle={() => setValidationOpen(!validationOpen)}
          onNavigate={navigateToIssue}
        />
      )}

      {conditionFor && content && (
        <div className="lc-condition-anchor">
          <ConditionEditor
            condition={findBlock(content, conditionFor)?.attributes.condition}
            readOnly={readOnly}
            onChange={(condition: Condition | undefined) => {
              apply(setBlockCondition(content, conditionFor, condition), 'command', conditionFor);
            }}
            onClose={() => setConditionFor(null)}
          />
        </div>
      )}

      {shortcutsOpen && <ShortcutsDialog onClose={() => setShortcutsOpen(false)} />}
    </div>
  );
}
