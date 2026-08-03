/**
 * Letter Engine — the Official Letter Composer.
 *
 * A structured, government-style composer. NOT a word processor: the document is six
 * independent sections, formatting applies to whole paragraphs, and the toolbar carries
 * eleven controls chosen for official correspondence.
 *
 * ══════════════════════════════════════════════════════════════════════════
 *  WHAT THIS PACK DOES NOT DO — and must not acquire
 * ══════════════════════════════════════════════════════════════════════════
 * No printing, no PDF, no preview rendering, no pagination or multi-page handling, no
 * barcode generation, no signature rendering, no reference registration, no safe-zone
 * validation, no export. The reserved bands are DRAWN and nothing measures them. The
 * signature and barcode are reserved space and nothing fills them.
 *
 * ── THE BLOCK MODEL IS THE ONLY SOURCE OF TRUTH ──────────────────────────
 * Content is a `BlockDocument`, edited through the pure commands in
 * `letters/editor/blockCommands`, serialised to JSON, and stored in the letter's
 * `contentJson`. No HTML is produced, none is parsed, and there is no inverse from
 * what is rendered back to the document.
 *
 * ── UNDO IS A STACK OF DOCUMENTS ─────────────────────────────────────────
 * Because every command returns a new document and nothing is mutated, history is
 * simply an array of past documents. That is the payoff for keeping the commands pure,
 * and it is why undo needed no special machinery.
 *
 * ── EDITING IS DRAFT-ONLY ────────────────────────────────────────────────
 * The backend refuses edits once a letter is registered — its content is bound to a
 * frozen snapshot and a permanent number. The composer reflects that by going
 * read-only rather than by letting the user type into something the server will reject.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { api, errorMessage } from '../api/client';
import { useAuth } from '../stores/authStore';
import { useT } from '../lib/i18n';
import { useToast } from '../stores/toastStore';
import { usePersistedState } from '../hooks/usePersistedState';
import { Button, ErrorBanner, ExecutiveHeader, Icon, SkeletonRows, StatusChip } from '../components/explorer/ExplorerKit';
import '../components/explorer/explorer-kit.css';
import LetterPageStack from '../components/letters/LetterPageStack';
import PageNavigator, {
  type ZoomMode,
  clampZoom,
  fitPageZoom,
  fitWidthZoom,
} from '../components/letters/PageNavigator';
import {
  PROBE_WIDTH_MM,
  type MeasurableItem,
  useLetterPagination,
} from '../components/letters/useLetterPagination';
import ComposerToolbar, { ComposerViewControls, type ToolbarState } from '../components/letters/ComposerToolbar';
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
import { pointsToMm } from '../letters/pagination/measure';
import {
  BarcodeBlock,
  ContentSection,
  DateSection,
  type ParagraphHandlers,
  RecipientSection,
  type RecipientValue,
  SignatureBlock,
  type RenderedBrandingAsset,
  SubjectSection,
} from '../components/letters/LetterSections';
import '../components/letters/letter-sections.css';
import './LetterComposer.css';

import { LETTER_STATUS_LABEL_AR, LETTER_STATUS_TONE, type LetterStatus } from '../api/lettersApi';
import { type BlockDocument, type BlockAttributes, createInitialBlockDocument } from '../letters/model/blockTypes';
import {
  blockMarks,
  clearBlockFormatting,
  findBlock,
  insertParagraphAfter,
  mergeWithPrevious,
  parseDocument,
  serialiseDocument,
  setBlockAttributes,
  setBlockText,
  splitParagraph,
  toggleBlockMark,
} from '../letters/editor/blockCommands';
import { getTemplate, findTemplate } from '../letters/registry/templateRegistry';
import { getTypographyPresetSet, type TextAlignment } from '../letters/registry/typographyPresets';
import {
  getPageGeometry,
  isPrintProfileId,
  pageSizeOf,
  type PrintProfileId,
} from '../letters/registry/geometryRegistry';
import { type FontId } from '../styles/fontRegistry';

/** Indent step. Presentational only — indent is not a tool in this pack. */
const INDENT_STEP_MM = 8;

/** Undo depth. Deep enough for a working session, bounded so history is not a leak. */
const HISTORY_LIMIT = 60;

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
  registrationSnapshot: { barcodePayload?: string } | null;
}

export default function LetterComposer() {
  const { t } = useT();
  const navigate = useNavigate();
  const toast = useToast();
  const { hasPermission } = useAuth();
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

  const [history, setHistory] = useState<BlockDocument[]>([]);
  const [future, setFuture] = useState<BlockDocument[]>([]);
  const [activeBlockId, setActiveBlockId] = useState<string | null>(null);
  const [activeSection, setActiveSection] = useState<string | null>(null);

  /* ── View preferences (persisted — they are the user's, not the document's) ── */
  const [zoom, setZoom] = usePersistedState<number>('manarERP.letters.composer.zoom', 1);
  /**
   * Opens fitted to the width, not at 100%.
   *
   * A4 at 100% occupies barely half a 1440px window, which is what made the workspace
   * read as a form with a page in it rather than as a document editor. Fitting to width
   * is what Word and Acrobat do on open, and it is a VIEW default only — no geometry
   * moves, and the millimetre values are untouched.
   *
   * Persisted, so anyone who has already chosen a zoom keeps theirs; this changes the
   * first-run default, not an existing preference.
   */
  const [zoomMode, setZoomMode] = usePersistedState<ZoomMode>('manarERP.letters.composer.zoomMode', 'fitWidth');
  const [showRulers, setShowRulers] = usePersistedState<boolean>('manarERP.letters.composer.rulers', true);
  const [showGrid, setShowGrid] = usePersistedState<boolean>('manarERP.letters.composer.grid', false);
  const [showZones, setShowZones] = usePersistedState<boolean>('manarERP.letters.composer.zones', true);

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

  /* ── Pagination ──────────────────────────────────────────────────────────
     The flow's item list: the fixed sections plus one item per content paragraph.
     Signature and barcode are chained with `keepWithNext` so they travel together —
     they authorise the document jointly and splitting them would be meaningless. */
  const items: MeasurableItem[] = useMemo(() => {
    const contentItems: MeasurableItem[] = (content?.blocks ?? []).map((block) => ({
      id: block.id,
      kind: 'content' as const,
    }));
    return [
      { id: 'date', kind: 'date' },
      { id: 'recipient', kind: 'recipient' },
      { id: 'subject', kind: 'subject' },
      ...contentItems,
      { id: 'signature', kind: 'signature', keepWithNext: true },
      { id: 'barcode', kind: 'barcode' },
    ];
  }, [content]);

  /** Anything that can change a rendered height re-triggers the measurement pass. */
  const contentSignature = useMemo(
    () =>
      [
        content ? serialiseDocument(content) : '',
        subject,
        issueDate,
        recipient.name,
        recipient.title,
        recipient.organisation,
        readOnly ? 'ro' : 'rw',
      ].join(''),
    [content, subject, issueDate, recipient, readOnly],
  );

  const { pagination, itemHeightsMm, probeRef, measureRef } = useLetterPagination(items, geometry, contentSignature);
  const pageCount = pagination.pageCount;

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

  const validationContext: LetterValidationContext | null = useMemo(() => {
    if (!letter || !content) return null;
    return {
      template,
      geometry,
      signatureAssetId: letter.signatureAssetId,
      stampAssetId: letter.stampAssetId,
      signatureResolved: resolvedSignature !== null,
      stampResolved: resolvedStamp !== null,
      barcodePayload,
      status: letter.status,
      reference: letter.reference,
      issueDate,
      subject,
      recipient,
      content,
      pagination,
      itemHeightsMm,
      // Derived from the measured height rather than counted in the DOM: the subject's
      // line height is its preset's, so the two divide cleanly and no second
      // measurement pass is needed.
      subjectLineCount: Math.max(
        1,
        Math.round((itemHeightsMm.subject ?? 0) / pointsToMm(presets.subject.sizePt * presets.subject.lineHeight)),
      ),
      now: new Date(),
    };
  }, [letter, content, template, geometry, issueDate, subject, recipient, pagination, itemHeightsMm, presets, resolvedSignature, resolvedStamp, barcodePayload]);

  const { result: validation, summary: validationSummary } = useLetterValidation(validationContext);
  const [validationOpen, setValidationOpen] = usePersistedState<boolean>('manarERP.letters.composer.validationOpen', false);

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
      // Body is the only role a content block takes; the heading/subject/date roles
      // belong to the sections around it, which are snapshotted by their own fields.
      const preset = presets.body;
      blockTypography[block.id] = {
        fontId: preset.fontId,
        sizePt: preset.sizePt,
        weight: preset.weight,
        lineHeight: preset.lineHeight,
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
    };
  }, [letter, content, presets, issueDate, subject, geometry, pageCount, resolvedSignature, resolvedStamp]);

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

  /**
   * Take the user to a finding.
   *
   * The page first (so the sheet is on screen), then the offending control (so the
   * caret lands where the fix has to be made).
   */
  const navigateToIssue = useCallback(
    (issue: ValidationIssue) => {
      const { pageIndex, blockId, sectionKind } = issue.location ?? {};
      if (pageIndex !== undefined) goToPage(pageIndex);

      if (blockId) {
        const el = paragraphRefs.current.get(blockId);
        if (el) {
          el.focus();
          el.scrollIntoView({ block: 'center', behavior: 'smooth' });
          return;
        }
      }
      if (sectionKind) {
        setActiveSection(sectionKind);
        const label =
          sectionKind === 'subject' ? 'موضوع الخطاب'
          : sectionKind === 'date' ? 'تاريخ الخطاب'
          : sectionKind === 'recipient' ? 'الجهة المرسل إليها — الاسم'
          : null;
        if (label) {
          const control = document.querySelector<HTMLElement>(`.lp-stack [aria-label="${label}"]`);
          control?.focus();
          control?.scrollIntoView({ block: 'center', behavior: 'smooth' });
        }
      }
    },
    // `goToPage` is declared below; it is stable for a given page count.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [pageCount],
  );

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

  /**
   * Keyboard page navigation.
   *
   * Ignored while a text control has focus — PageUp inside a paragraph belongs to the
   * caret, not to the document.
   */
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      const tag = (event.target as HTMLElement | null)?.tagName;
      if (tag === 'TEXTAREA' || tag === 'INPUT' || tag === 'SELECT') return;
      if (event.key === 'PageDown') {
        event.preventDefault();
        goToPage(currentPage + 1);
      } else if (event.key === 'PageUp') {
        event.preventDefault();
        goToPage(currentPage - 1);
      } else if (event.key === 'Home' && event.ctrlKey) {
        event.preventDefault();
        goToPage(0);
      } else if (event.key === 'End' && event.ctrlKey) {
        event.preventDefault();
        goToPage(pageCount - 1);
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [currentPage, pageCount, goToPage]);

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
        const parsed = parseDocument(row.contentJson);
        setContent(parsed ?? createInitialBlockDocument(nextBlockId(), bodyAttributes));
      } catch (err) {
        if (!cancelled) setError(errorMessage(err));
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
    // `bodyAttributes` is stable for a given template and must not re-trigger a load.
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
   * `pushHistory` is false for keystrokes — one undo step per character would make
   * undo useless — and true for structural or formatting changes, which are the
   * operations a user actually wants to take back.
   */
  const apply = useCallback(
    (next: BlockDocument, pushHistory: boolean) => {
      setContent((current) => {
        if (!current) return next;
        if (pushHistory) {
          setHistory((h) => [...h.slice(-(HISTORY_LIMIT - 1)), current]);
          setFuture([]);
        }
        return next;
      });
      setDirty(true);
    },
    [],
  );

  const handlers: ParagraphHandlers = useMemo(
    () => ({
      onTextChange: (blockId, text) => {
        setContent((current) => (current ? setBlockText(current, blockId, text) : current));
        setDirty(true);
      },
      onEnter: (blockId, caretOffset) => {
        setContent((current) => {
          if (!current) return current;
          setHistory((h) => [...h.slice(-(HISTORY_LIMIT - 1)), current]);
          setFuture([]);
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
          setHistory((h) => [...h.slice(-(HISTORY_LIMIT - 1)), current]);
          setFuture([]);
          pendingFocus.current = { blockId: merged.focusBlockId, caret: merged.caretOffset };
          return merged.document;
        });
        setDirty(true);
      },
      onFocusBlock: (blockId) => {
        setActiveBlockId(blockId);
        setActiveSection('content');
      },
    }),
    [],
  );

  const registerRef = useCallback((blockId: string, el: HTMLTextAreaElement | null) => {
    if (el) paragraphRefs.current.set(blockId, el);
    else paragraphRefs.current.delete(blockId);
  }, []);

  /* ── Toolbar ─────────────────────────────────────────────────────────── */

  const activeBlock = content && activeBlockId ? findBlock(content, activeBlockId) : undefined;

  const toolbarState: ToolbarState = {
    fontId: activeBlock?.attributes.fontId ?? null,
    sizePt: activeBlock?.attributes.sizePt ?? null,
    alignment: activeBlock?.attributes.alignment ?? null,
    bold: activeBlock ? blockMarks(activeBlock).includes('bold') : false,
    underline: activeBlock ? blockMarks(activeBlock).includes('underline') : false,
    hasTarget: Boolean(activeBlock) && !readOnly,
    canUndo: history.length > 0,
    canRedo: future.length > 0,
  };

  /** Every formatting command acts on the WHOLE active paragraph. */
  function withActiveBlock(mutate: (doc: BlockDocument, blockId: string) => BlockDocument) {
    if (!content || !activeBlockId || readOnly) return;
    apply(mutate(content, activeBlockId), true);
  }

  function undo() {
    setHistory((h) => {
      if (h.length === 0) return h;
      const previous = h[h.length - 1];
      setContent((current) => {
        if (current) setFuture((f) => [current, ...f].slice(0, HISTORY_LIMIT));
        return previous;
      });
      setDirty(true);
      return h.slice(0, -1);
    });
  }

  function redo() {
    setFuture((f) => {
      if (f.length === 0) return f;
      const next = f[0];
      setContent((current) => {
        if (current) setHistory((h) => [...h.slice(-(HISTORY_LIMIT - 1)), current]);
        return next;
      });
      setDirty(true);
      return f.slice(1);
    });
  }

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
      const registered = await registerLetter(letter.id, snapshot);
      // Adopt the server's answer wholesale rather than patching locally: the
      // reference, the status and the stored snapshot are all decided there, and the
      // composer must show what was actually recorded.
      setLetter((current) => (current ? { ...current, ...(registered as unknown as Partial<LoadedLetter>) } : current));
      setDirty(false);
      toast.ok(`تم تسجيل الخطاب برقم ${registered.reference ?? ''}`);
    } catch (err) {
      toast.error(errorMessage(err));
    } finally {
      setRegistering(false);
    }
  }, [letter, canRegister, buildSnapshot, dirty, save, toast]);

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
    signatureUrl: resolvedSignature?.imageUrl,
    stampUrl: resolvedStamp?.imageUrl,
    ready: !branding.loading,
  }), [branding, letter?.signatureAssetId, letter?.stampAssetId, resolvedSignature, resolvedStamp, persistBranding]);

  useEffect(() => {
    if (!dirty || readOnly) return;
    const timer = setTimeout(() => void save(), 1500);
    return () => clearTimeout(timer);
  }, [dirty, readOnly, save]);

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
        <ErrorBanner>{error ?? 'تعذّر تحميل الخطاب.'}</ErrorBanner>
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
    const staticOnly = forMeasure || readOnly || printMode;

    switch (itemId) {
      case 'date':
        return (
          <DateSection
            key="date"
            value={issueDate}
            onChange={(v) => { setIssueDate(v); setDirty(true); }}
            preset={presets.date}
            readOnly={staticOnly}
            active={!forMeasure && activeSection === 'date'}
            severity={forMeasure ? null : sectionSeverity.get('date') ?? null}
            onFocus={() => setActiveSection('date')}
          />
        );
      case 'recipient':
        return (
          <RecipientSection
            key="recipient"
            value={recipient}
            onChange={(patch) => { setRecipient((r) => ({ ...r, ...patch })); setDirty(true); }}
            preset={presets.recipient}
            readOnly={staticOnly}
            active={!forMeasure && activeSection === 'recipient'}
            severity={forMeasure ? null : sectionSeverity.get('recipient') ?? null}
            onFocus={() => setActiveSection('recipient')}
          />
        );
      case 'subject':
        return (
          <SubjectSection
            key="subject"
            value={subject}
            onChange={(v) => { setSubject(v); setDirty(true); }}
            preset={presets.subject}
            readOnly={staticOnly}
            active={!forMeasure && activeSection === 'subject'}
            severity={forMeasure ? null : sectionSeverity.get('subject') ?? null}
            onFocus={() => setActiveSection('subject')}
          />
        );
      case 'signature':
        return <SignatureBlock key="signature" active={!forMeasure && activeSection === 'signature'} severity={forMeasure ? null : sectionSeverity.get('signature') ?? null} onFocus={() => setActiveSection('signature')} signature={resolvedSignature} stamp={resolvedStamp} signatureHeightMm={geometry.signatureHeightMm} stampHeightMm={geometry.stampHeightMm} />;
      case 'barcode':
        return <BarcodeBlock key="barcode" active={!forMeasure && activeSection === 'barcode'} severity={forMeasure ? null : sectionSeverity.get('barcode') ?? null} onFocus={() => setActiveSection('barcode')} payload={barcodePayload} reference={letter.reference} sizeMm={geometry.barcodeSizeMm} />;
      default: {
        const block = findBlock(content, itemId);
        if (!block) return null;
        return (
          <ContentSection
            key={itemId}
            document={{ ...content, blocks: [block] }}
            indentStepMm={INDENT_STEP_MM}
            readOnly={staticOnly}
            active={!forMeasure && activeSection === 'content'}
            severity={forMeasure ? null : sectionSeverity.get('content') ?? null}
            handlers={handlers}
            registerRef={forMeasure ? () => {} : registerRef}
            onFocus={() => setActiveSection('content')}
          />
        );
      }
    }
  };

  return (
    <div className="lc-page" dir="rtl">
      <ExecutiveHeader
        icon="mail"
        title={t('page.officialLetter.title')}
        subtitle={letter.reference ?? 'مسودة — لم يُخصَّص رقم مرجعي بعد'}
        onBack={() => navigate('/forms/official-letter')}
        chips={
          <>
            <StatusChip tone={LETTER_STATUS_TONE[letter.status]}>{LETTER_STATUS_LABEL_AR[letter.status]}</StatusChip>
            {letter.isArchived && <StatusChip tone="neutral" icon="inventory_2">مؤرشف</StatusChip>}
          </>
        }
        aside={
          <div className="lc-save-state">
            {readOnly ? (
              <span className="lc-readonly-pill"><Icon name="lock" />للقراءة فقط</span>
            ) : saving ? (
              <span><Icon name="sync" />جارٍ الحفظ…</span>
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
                explanation to give — the reference is displayed in the header instead. */}
            {canRegister && (
              <Button
                small
                variant="primary"
                icon="verified"
                onClick={() => void handleRegister()}
                busy={registering}
                title="إصدار رقم مرجعي دائم وتجميد محتوى الخطاب"
              >
                تسجيل وإصدار رقم
              </Button>
            )}
            {/* Disabled with the reason on it rather than hidden: a print button that
                vanishes leaves the user wondering whether printing exists at all. */}
            <Button
              small
              icon="print"
              onClick={() => void handlePrint()}
              busy={printing}
              disabled={!validationSummary.readyForPrinting}
              title={
                validationSummary.readyForPrinting
                  ? 'طباعة الخطاب'
                  : validationSummary.blocking > 0
                    ? `لا يمكن الطباعة: ${validationSummary.blocking} خطأ مانع`
                    : 'لا يمكن الطباعة: التحقّق غير مكتمل'
              }
            >
              طباعة
            </Button>
          </div>
        }
      />

      {readOnly && letter.status !== 'DRAFT' && (
        <div className="lc-notice" role="status">
          <Icon name="lock" />
          محتوى الخطاب مُجمَّد منذ التسجيل — أي تعديل بعده يجعل النسخة المحفوظة تخالف النسخة المسلَّمة.
        </div>
      )}

      <div className="lc-bars">
        <ComposerToolbar
          allowedCommands={template.toolbarCommands}
          state={toolbarState}
          disabled={readOnly}
          onToggleBold={() => withActiveBlock((d, b) => toggleBlockMark(d, b, 'bold'))}
          onToggleUnderline={() => withActiveBlock((d, b) => toggleBlockMark(d, b, 'underline'))}
          onAlign={(alignment: TextAlignment) => withActiveBlock((d, b) => setBlockAttributes(d, b, { alignment }))}
          onFont={(fontId: FontId) => withActiveBlock((d, b) => setBlockAttributes(d, b, { fontId }))}
          onSize={(sizePt) => withActiveBlock((d, b) => setBlockAttributes(d, b, { sizePt }))}
          onClearFormatting={() => withActiveBlock((d, b) => clearBlockFormatting(d, b, bodyAttributes))}
          onUndo={undo}
          onRedo={redo}
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
        <div className="lc-view-bar">
          <PageNavigator
            currentPage={currentPage}
            pageCount={pageCount}
            onGoToPage={goToPage}
            zoom={zoom}
            zoomMode={zoomMode}
            onZoomPreset={(z) => { setZoomMode('manual'); setZoom(clampZoom(z)); }}
            onFitWidth={() => setZoomMode('fitWidth')}
            onFitPage={() => setZoomMode('fitPage')}
          />
          <ComposerViewControls
            showRulers={showRulers}
            onToggleRulers={() => setShowRulers(!showRulers)}
            showGrid={showGrid}
            onToggleGrid={() => setShowGrid(!showGrid)}
            showZones={showZones}
            onToggleZones={() => setShowZones(!showZones)}
          />
        </div>
      </div>

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
          showRulers={showRulers}
          showGrid={showGrid}
          showZones={showZones}
          currentPage={currentPage}
          pageRef={pageRef}
          renderPage={(pageIndex) => itemsOnPage(pageIndex).map((itemId) => renderItem(itemId, false))}
        />
      </div>

      {/* Beside the paper, never over it: no modal, no alert, no toast. */}
      <ValidationPanel
        result={validation}
        summary={validationSummary}
        open={validationOpen}
        onToggle={() => setValidationOpen(!validationOpen)}
        onNavigate={navigateToIssue}
      />
    </div>
  );
}
