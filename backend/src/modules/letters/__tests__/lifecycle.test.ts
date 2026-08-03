/**
 * Letter Engine — the lifecycle state machine.
 *
 * Exhaustive by construction: the transition matrix is small enough to test EVERY
 * (state × transition) pair rather than a chosen sample, so an accidentally-added
 * legal transition cannot slip through by living in a combination nobody thought to
 * check. That is the whole reason the state machine is pure and database-free.
 *
 * The archive axis is tested SEPARATELY and exhaustively over (state × flag), because
 * archiving is not a transition: it changes a flag and leaves `status` untouched.
 * Keeping the two suites apart is itself part of the assertion.
 */
import { describe, it, expect } from 'vitest';
import {
  LETTER_STATUSES,
  LETTER_STATUS_LABELS_AR,
  LETTER_TRANSITIONS,
  TRANSITIONS_IMPLEMENTED_IN_THIS_PACK,
  type LetterStatus,
  type LetterTransition,
  allowedTransitions,
  canArchive,
  canDelete,
  canEdit,
  canTransition,
  canUnarchive,
  explainArchiveRefusal,
  explainRefusal,
  isLetterStatus,
  isLetterTransition,
  isTerminal,
  nextStatus,
  shouldHaveReference,
} from '../lifecycle';

/** The complete set of legal transitions. Everything else must be refused. */
const LEGAL: readonly { from: LetterStatus; transition: LetterTransition; to: LetterStatus }[] = [
  { from: 'DRAFT', transition: 'register', to: 'REGISTERED' },
  { from: 'REGISTERED', transition: 'print', to: 'PRINTED' },
  { from: 'PRINTED', transition: 'supersede', to: 'SUPERSEDED' },
  { from: 'REGISTERED', transition: 'cancel', to: 'CANCELLED' },
  { from: 'PRINTED', transition: 'cancel', to: 'CANCELLED' },
  { from: 'SUPERSEDED', transition: 'cancel', to: 'CANCELLED' },
];

function legalEntry(from: LetterStatus, transition: LetterTransition) {
  return LEGAL.find((t) => t.from === from && t.transition === transition);
}

describe('States and transitions — declaration', () => {
  it('declares exactly the five states of the master plan', () => {
    expect([...LETTER_STATUSES]).toEqual(['DRAFT', 'REGISTERED', 'PRINTED', 'SUPERSEDED', 'CANCELLED']);
  });

  it('ARCHIVED is NOT a state — archiving is a flag', () => {
    // The central assertion of this revision. Archiving answers "is this still active
    // correspondence?", which is orthogonal to "what happened to this document?".
    expect(LETTER_STATUSES).not.toContain('ARCHIVED');
    expect(isLetterStatus('ARCHIVED')).toBe(false);
    expect(LETTER_TRANSITIONS).not.toContain('archive');
    expect(LETTER_TRANSITIONS).not.toContain('unarchive');
  });

  it('declares the four status transitions', () => {
    expect([...LETTER_TRANSITIONS]).toEqual(['register', 'print', 'supersede', 'cancel']);
  });

  it('labels every state in Arabic', () => {
    for (const status of LETTER_STATUSES) {
      expect(LETTER_STATUS_LABELS_AR[status].length).toBeGreaterThan(0);
    }
  });

  it('guards unknown, empty and prototype-chain values', () => {
    expect(isLetterStatus('DRAFT')).toBe(true);
    expect(isLetterStatus('draft')).toBe(false);
    expect(isLetterStatus('constructor')).toBe(false);
    expect(isLetterStatus(null)).toBe(false);
    expect(isLetterTransition('register')).toBe(true);
    expect(isLetterTransition('delete')).toBe(false);
  });
});

describe('THE FULL TRANSITION MATRIX — every state × every transition', () => {
  for (const from of LETTER_STATUSES) {
    for (const transition of LETTER_TRANSITIONS) {
      const entry = legalEntry(from, transition);
      it(`${from} --${transition}--> ${entry ? entry.to : 'REFUSED'}`, () => {
        expect(canTransition(from, transition)).toBe(Boolean(entry));
        expect(nextStatus(from, transition)).toBe(entry ? entry.to : undefined);
      });
    }
  }

  it('permits exactly six transitions in total — no more', () => {
    const total = LETTER_STATUSES.flatMap((from) =>
      LETTER_TRANSITIONS.filter((t) => canTransition(from, t)),
    );
    expect(total).toHaveLength(LEGAL.length);
  });

  it('cancel is reachable from every non-draft state, and only those', () => {
    expect(canTransition('DRAFT', 'cancel')).toBe(false);
    for (const status of ['REGISTERED', 'PRINTED', 'SUPERSEDED'] as const) {
      expect(canTransition(status, 'cancel')).toBe(true);
    }
  });
});

describe('The pack boundary is declared, not merely observed', () => {
  it('this pack implements register and cancel only', () => {
    // `print` and `supersede` are declared so the matrix is complete and a later pack
    // adds a route rather than reshaping the machine.
    expect([...TRANSITIONS_IMPLEMENTED_IN_THIS_PACK]).toEqual(['register', 'cancel']);
  });

  it('every implemented transition is itself legal somewhere in the matrix', () => {
    for (const transition of TRANSITIONS_IMPLEMENTED_IN_THIS_PACK) {
      expect(LETTER_STATUSES.some((s) => canTransition(s, transition))).toBe(true);
    }
  });
});

describe('The prohibitions the module exists to enforce', () => {
  it('cannot register twice — from any state that already holds a number', () => {
    for (const status of ['REGISTERED', 'PRINTED', 'SUPERSEDED', 'CANCELLED'] as const) {
      expect(canTransition(status, 'register')).toBe(false);
    }
    expect(explainRefusal('REGISTERED', 'register')).toMatch(/مُسجَّل مسبقًا/);
  });

  it('cannot edit anything past DRAFT', () => {
    expect(canEdit('DRAFT')).toBe(true);
    for (const status of ['REGISTERED', 'PRINTED', 'SUPERSEDED', 'CANCELLED'] as const) {
      expect(canEdit(status)).toBe(false);
    }
  });

  it('cannot delete anything that holds a reference number', () => {
    expect(canDelete('DRAFT')).toBe(true);
    for (const status of ['REGISTERED', 'PRINTED', 'SUPERSEDED', 'CANCELLED'] as const) {
      expect(canDelete(status)).toBe(false);
    }
  });

  it('cannot restore a cancelled document by any route', () => {
    for (const transition of LETTER_TRANSITIONS) {
      expect(canTransition('CANCELLED', transition)).toBe(false);
    }
    expect(isTerminal('CANCELLED')).toBe(true);
    expect(allowedTransitions('CANCELLED')).toEqual([]);
  });

  it('a draft cannot be cancelled — it holds no number; it is deleted instead', () => {
    expect(canTransition('DRAFT', 'cancel')).toBe(false);
    expect(explainRefusal('DRAFT', 'cancel')).toMatch(/احذفها/);
    expect(canDelete('DRAFT')).toBe(true);
  });
});

describe('THE ARCHIVE AXIS — orthogonal to status', () => {
  // Exhaustive over (state × flag). Archiving is permitted for anything not cancelled,
  // in whichever direction the flag is not already pointing.
  for (const status of LETTER_STATUSES) {
    for (const isArchived of [false, true]) {
      const archivable = status !== 'CANCELLED' && !isArchived;
      const unarchivable = status !== 'CANCELLED' && isArchived;

      it(`${status} (archived=${isArchived}) → archive:${archivable} unarchive:${unarchivable}`, () => {
        expect(canArchive(status, isArchived)).toBe(archivable);
        expect(canUnarchive(status, isArchived)).toBe(unarchivable);
      });
    }
  }

  it('a DRAFT may be archived — filing is independent of issuance', () => {
    expect(canArchive('DRAFT', false)).toBe(true);
    expect(canUnarchive('DRAFT', true)).toBe(true);
  });

  it('a PRINTED letter may be archived — both facts are true at once', () => {
    // The case that makes archiving-as-a-state impossible: it would force a false
    // choice between PRINTED and ARCHIVED.
    expect(canArchive('PRINTED', false)).toBe(true);
  });

  it('a CANCELLED letter may be neither archived nor unarchived', () => {
    expect(canArchive('CANCELLED', false)).toBe(false);
    expect(canUnarchive('CANCELLED', true)).toBe(false);
    expect(explainArchiveRefusal('CANCELLED', false, 'archive')).toMatch(/ملغى/);
    expect(explainArchiveRefusal('CANCELLED', true, 'unarchive')).toMatch(/ملغى/);
  });

  it('archiving is idempotent-refusing in both directions', () => {
    expect(canArchive('REGISTERED', true)).toBe(false);
    expect(explainArchiveRefusal('REGISTERED', true, 'archive')).toMatch(/مؤرشف مسبقًا/);
    expect(canUnarchive('REGISTERED', false)).toBe(false);
    expect(explainArchiveRefusal('REGISTERED', false, 'unarchive')).toMatch(/غير مؤرشف/);
  });

  it('archive and unarchive are exact inverses wherever either is allowed', () => {
    for (const status of LETTER_STATUSES) {
      if (status === 'CANCELLED') continue;
      expect(canArchive(status, false)).toBe(true);
      expect(canUnarchive(status, true)).toBe(true);
    }
  });
});

describe('Reference expectations per state', () => {
  it('only a draft is unnumbered', () => {
    expect(shouldHaveReference('DRAFT')).toBe(false);
    for (const status of ['REGISTERED', 'PRINTED', 'SUPERSEDED', 'CANCELLED'] as const) {
      // Cancelled keeps its number — permanently reserved, never returned to the pool.
      expect(shouldHaveReference(status)).toBe(true);
    }
  });
});

describe('Refusals are explained specifically', () => {
  it('every illegal pair produces a non-empty Arabic reason naming the situation', () => {
    for (const from of LETTER_STATUSES) {
      for (const transition of LETTER_TRANSITIONS) {
        if (canTransition(from, transition)) continue;
        const reason = explainRefusal(from, transition);
        expect(reason.length, `${from}/${transition} has no reason`).toBeGreaterThan(10);
        expect(reason).not.toMatch(/undefined/);
      }
    }
  });

  it('distinguishes "already registered" from "cancelled" rather than saying "invalid"', () => {
    expect(explainRefusal('REGISTERED', 'register')).not.toEqual(explainRefusal('CANCELLED', 'register'));
    expect(explainRefusal('CANCELLED', 'register')).toMatch(/ملغى/);
  });
});

describe('Terminality', () => {
  it('only CANCELLED is terminal', () => {
    for (const status of ['DRAFT', 'REGISTERED', 'PRINTED'] as const) {
      expect(isTerminal(status)).toBe(false);
    }
    expect(isTerminal('SUPERSEDED')).toBe(false); // may still be cancelled
    expect(isTerminal('CANCELLED')).toBe(true);
  });
});
