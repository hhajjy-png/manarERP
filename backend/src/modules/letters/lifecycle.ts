/**
 * Letter Engine — the document lifecycle state machine.
 *
 * PURE. No database, no Prisma, no I/O, no dates. Every function here is a total
 * function of its arguments, which is what lets the whole transition matrix be tested
 * exhaustively in milliseconds and read in one screen.
 *
 * ══════════════════════════════════════════════════════════════════════════
 *  THE FIVE STATES — and archiving is NOT one of them
 * ══════════════════════════════════════════════════════════════════════════
 *
 *   DRAFT      no reference number · fully editable · deletable
 *   REGISTERED a permanent reference is bound · content frozen · not deletable
 *   PRINTED    has reached paper at least once
 *   SUPERSEDED replaced by an amending letter, which carries its own reference
 *   CANCELLED  withdrawn · terminal · its reference stays permanently reserved
 *
 * ── WHY ARCHIVING IS A FLAG AND NOT A SIXTH STATE ────────────────────────
 * "Is this still active correspondence?" is a filing question, orthogonal to "what
 * happened to this document?". As a state it would be unreachable for a cancelled
 * letter — which must also be archivable — and would force a false choice between
 * PRINTED and ARCHIVED when both are true at once. As a flag, `PRINTED + archived`
 * and `CANCELLED + archived` both work, and `status` keeps meaning exactly one thing.
 *
 * See `canArchive` / `canUnarchive` at the foot of this file: archiving is a separate
 * axis with its own rule, and it never appears in the transition matrix.
 *
 * ── WHY EDITING STOPS AT REGISTRATION ────────────────────────────────────
 * Registration burns a permanent number and freezes the registration snapshot. The
 * snapshot exists so a reprint years later reproduces the issued page exactly; letting
 * the underlying content drift afterwards would leave the system's copy disagreeing
 * with the copy in the recipient's file.
 *
 * ── WHY CANCELLED IS TERMINAL ────────────────────────────────────────────
 * Reinstating a withdrawn official document by flipping a status would leave no trace
 * that it was ever withdrawn. The remedy is a NEW letter with a NEW reference — which
 * is also why the cancelled number is never returned to the pool.
 */

/** The five lifecycle states. Archiving is a flag, not a member of this set. */
export const LETTER_STATUSES = ['DRAFT', 'REGISTERED', 'PRINTED', 'SUPERSEDED', 'CANCELLED'] as const;

export type LetterStatus = (typeof LETTER_STATUSES)[number];

/** Arabic labels — the UI language is Arabic, the codebase is English. */
export const LETTER_STATUS_LABELS_AR: Readonly<Record<LetterStatus, string>> = {
  DRAFT: 'مسودة',
  REGISTERED: 'مُسجّل',
  PRINTED: 'مطبوع',
  SUPERSEDED: 'مُستبدَل',
  CANCELLED: 'ملغى',
};

/**
 * The operations that move a document between states.
 *
 * `print` and `supersede` are DECLARED but not exposed by this pack: printing belongs
 * to the printing pack and superseding to amendments. They are named here so the
 * matrix is complete and so a later pack adds a route rather than reshaping the
 * machine.
 */
export const LETTER_TRANSITIONS = ['register', 'print', 'supersede', 'cancel'] as const;

export type LetterTransition = (typeof LETTER_TRANSITIONS)[number];

export const LETTER_TRANSITION_LABELS_AR: Readonly<Record<LetterTransition, string>> = {
  register: 'تسجيل وإصدار رقم مرجعي',
  print: 'طباعة',
  supersede: 'استبدال',
  cancel: 'إلغاء',
};

/**
 * THE LEGAL TRANSITION MATRIX. Everything not listed here is illegal.
 *
 * An allow-list rather than a set of guard clauses on purpose: a deny-list grows a
 * hole every time a state is added, whereas an allow-list simply does not contain the
 * new combination until someone writes it down deliberately.
 *
 *   DRAFT      --register-->  REGISTERED
 *   REGISTERED --print-->     PRINTED
 *   PRINTED    --supersede--> SUPERSEDED
 *   REGISTERED --cancel-->    CANCELLED
 *   PRINTED    --cancel-->    CANCELLED
 *   SUPERSEDED --cancel-->    CANCELLED
 *
 * Deliberate omissions, each for a reason:
 *
 *   · DRAFT --cancel-->    a draft holds no reference number, so there is nothing to
 *                          withdraw. The operation for an unwanted draft is DELETE,
 *                          which is why deletion is draft-only.
 *   · CANCELLED --> *      terminal, as explained in the header.
 *   · REGISTERED --> DRAFT the master plan allows reverting an unprinted registration
 *                          (keeping its reference). It is NOT implemented here because
 *                          this pack's operation list does not contain it; see the
 *                          report.
 */
const LEGAL_TRANSITIONS: readonly { readonly from: LetterStatus; readonly transition: LetterTransition; readonly to: LetterStatus }[] = [
  { from: 'DRAFT', transition: 'register', to: 'REGISTERED' },
  { from: 'REGISTERED', transition: 'print', to: 'PRINTED' },
  { from: 'PRINTED', transition: 'supersede', to: 'SUPERSEDED' },
  { from: 'REGISTERED', transition: 'cancel', to: 'CANCELLED' },
  { from: 'PRINTED', transition: 'cancel', to: 'CANCELLED' },
  { from: 'SUPERSEDED', transition: 'cancel', to: 'CANCELLED' },
];

/**
 * Transitions this pack actually exposes over the API.
 *
 * The machine knows more than the pack does, and that gap is deliberate: declaring the
 * full matrix keeps a later pack from reshaping it, while this list keeps this pack
 * from shipping an operation it has no business performing.
 */
export const TRANSITIONS_IMPLEMENTED_IN_THIS_PACK: readonly LetterTransition[] = ['register', 'cancel'];

/* ── Queries ────────────────────────────────────────────────────────────── */

export function isLetterStatus(value: unknown): value is LetterStatus {
  return typeof value === 'string' && (LETTER_STATUSES as readonly string[]).includes(value);
}

export function isLetterTransition(value: unknown): value is LetterTransition {
  return typeof value === 'string' && (LETTER_TRANSITIONS as readonly string[]).includes(value);
}

/** Is this transition legal from this state? */
export function canTransition(from: LetterStatus, transition: LetterTransition): boolean {
  return LEGAL_TRANSITIONS.some((t) => t.from === from && t.transition === transition);
}

/** The resulting state, or `undefined` if the transition is illegal. */
export function nextStatus(from: LetterStatus, transition: LetterTransition): LetterStatus | undefined {
  return LEGAL_TRANSITIONS.find((t) => t.from === from && t.transition === transition)?.to;
}

/** Every transition legal from a state. */
export function allowedTransitions(from: LetterStatus): LetterTransition[] {
  return LEGAL_TRANSITIONS.filter((t) => t.from === from).map((t) => t.transition);
}

/** A state from which nothing further is possible. */
export function isTerminal(status: LetterStatus): boolean {
  return allowedTransitions(status).length === 0;
}

/* ── Capability predicates ──────────────────────────────────────────────── */

/**
 * May this document's content be changed?
 *
 * Draft only. After registration the content is bound to a frozen snapshot and to a
 * number that has already been communicated.
 */
export function canEdit(status: LetterStatus): boolean {
  return status === 'DRAFT';
}

/**
 * May this document be hard-deleted?
 *
 * Draft only — the single most important prohibition in the module. A registered
 * document has consumed a permanent reference number; deleting it would leave an
 * unexplained hole in an official register. Withdrawal is `cancel`, which keeps both
 * the record and the number.
 */
export function canDelete(status: LetterStatus): boolean {
  return status === 'DRAFT';
}

/** Does a document in this state hold a permanent reference number? */
export function shouldHaveReference(status: LetterStatus): boolean {
  return status !== 'DRAFT';
}

/* ── The archive axis — orthogonal to status ────────────────────────────── */

/**
 * May this document be archived?
 *
 * Anything that is not cancelled, and is not already archived. A cancelled document is
 * withdrawn rather than filed, and its record must stay exactly as it was left.
 *
 * Note this is NOT a status transition and returns no next state — archiving changes
 * a flag and leaves `status` untouched.
 */
export function canArchive(status: LetterStatus, isArchived: boolean): boolean {
  return status !== 'CANCELLED' && !isArchived;
}

/** May this document be taken back out of the archive? Symmetric with `canArchive`. */
export function canUnarchive(status: LetterStatus, isArchived: boolean): boolean {
  return status !== 'CANCELLED' && isArchived;
}

/* ── Explaining a refusal ───────────────────────────────────────────────── */

/**
 * Why a transition was refused, in Arabic, naming the actual state.
 *
 * A specific reason rather than a generic "illegal transition": the user is being
 * stopped from doing something to an official document, and "cannot register: this
 * letter is already registered" is actionable where "invalid state" is not.
 */
export function explainRefusal(from: LetterStatus, transition: LetterTransition): string {
  const state = LETTER_STATUS_LABELS_AR[from];

  if (transition === 'register' && from === 'REGISTERED') {
    return 'الخطاب مُسجَّل مسبقًا ويحمل رقمًا مرجعيًا دائمًا — لا يمكن تسجيله مرة أخرى.';
  }
  if (transition === 'register' && from === 'CANCELLED') {
    return 'الخطاب ملغى — لا يمكن تسجيله. أنشئ خطابًا جديدًا بدلًا من ذلك.';
  }
  if (transition === 'register' && (from === 'PRINTED' || from === 'SUPERSEDED')) {
    return `الخطاب في حالة «${state}» ويحمل رقمًا مرجعيًا مسبقًا — لا يمكن تسجيله مرة أخرى.`;
  }
  if (transition === 'cancel' && from === 'DRAFT') {
    return 'لا يمكن إلغاء مسودة — المسودة لا تحمل رقمًا مرجعيًا. احذفها بدلًا من ذلك.';
  }
  if (transition === 'cancel' && from === 'CANCELLED') {
    return 'الخطاب ملغى مسبقًا.';
  }
  return `لا يمكن تنفيذ «${LETTER_TRANSITION_LABELS_AR[transition]}» على خطاب في حالة «${state}».`;
}

/** Why an archive/unarchive was refused, in Arabic. */
export function explainArchiveRefusal(
  status: LetterStatus,
  isArchived: boolean,
  intent: 'archive' | 'unarchive',
): string {
  if (status === 'CANCELLED') {
    return intent === 'archive'
      ? 'لا يمكن أرشفة خطاب ملغى — المستند مسحوب لا مُحفوظ.'
      : 'لا يمكن إلغاء أرشفة خطاب ملغى.';
  }
  if (intent === 'archive' && isArchived) return 'الخطاب مؤرشف مسبقًا.';
  if (intent === 'unarchive' && !isArchived) return 'الخطاب غير مؤرشف.';
  return 'تعذّر تنفيذ الإجراء.';
}
