/**
 * Sections and the document shape — integrity (INV-8, INV-9).
 *
 * Two properties of the SHAPE carry the engine's two hardest guarantees, and both are
 * easy to erode with a well-meaning refactor, so both are pinned here:
 *
 *  · `reference` IS NULLABLE (INV-8). A draft has no reference number. Making the
 *    field required would force a number to exist from creation and turn every
 *    abandoned draft into a permanent gap in an official register.
 *
 *  · THE VERSION STAMP IS DATA ON THE DOCUMENT (INV-9), not something derived at read
 *    time. A document carries the rules it was issued under; nothing recomputes them.
 *
 * The section model's own invariant — `SectionSpec` is the template's declaration and
 * `SectionInstance` is this letter's content — is checked through
 * `sectionInstanceIsConsistent`, which catches the one mistake the two-shape design
 * invites: a section labelled one kind carrying another kind's payload.
 */
import { describe, it, expect } from 'vitest';
import {
  SECTION_KINDS,
  SECTION_PAGE_SCOPES,
  findSectionInstance,
  findSectionSpec,
  isSectionKind,
  isSectionPageScope,
  sectionInstanceIsConsistent,
  type SectionInstance,
} from '../../letters/model/sectionTypes';
import {
  LETTER_STATUSES,
  LETTER_STATUS_LABELS_AR,
  hasReference,
  isContentIdentityFrozen,
  isLetterStatus,
  type LetterDocument,
} from '../../letters/model/documentTypes';
import { createEmptyBlockDocument } from '../../letters/model/blockTypes';
import { getTemplate } from '../../letters/registry/templateRegistry';
import { latestVersionStamp } from '../../letters/versioning/versions';

const SECTIONS: SectionInstance[] = [
  { kind: 'date', content: { kind: 'date', issueDate: '2026-08-03' } },
  { kind: 'recipient', content: { kind: 'recipient', name: 'السادة / وزارة الأشغال العامة' } },
  { kind: 'subject', content: { kind: 'subject', subject: 'طلب تمديد مدة العقد' } },
  { kind: 'content', content: { kind: 'content', body: createEmptyBlockDocument() } },
  { kind: 'signature', content: { kind: 'signature', showSignature: false, showStamp: false } },
  { kind: 'barcode', content: { kind: 'barcode' } },
];

function draft(): LetterDocument {
  return {
    id: null,
    templateKey: 'officialLetter',
    versions: latestVersionStamp(),
    printProfileId: 'companyLetterhead',
    status: 'DRAFT',
    reference: null,
    sections: SECTIONS,
    registrationSnapshot: null,
    isArchived: false,
  };
}

describe('Section kinds and page scopes', () => {
  it('declares the six approved kinds, in document order', () => {
    expect([...SECTION_KINDS]).toEqual(['date', 'recipient', 'subject', 'content', 'signature', 'barcode']);
  });

  it('declares the three page scopes', () => {
    expect([...SECTION_PAGE_SCOPES]).toEqual(['firstPage', 'flow', 'lastPage']);
  });

  it('guards unknown values', () => {
    expect(isSectionKind('subject')).toBe(true);
    expect(isSectionKind('footer')).toBe(false);
    expect(isSectionKind(null)).toBe(false);
    expect(isSectionPageScope('flow')).toBe(true);
    expect(isSectionPageScope('everyPage')).toBe(false);
  });

  it('only the content section flows across pages', () => {
    const template = getTemplate('officialLetter');
    const flowing = template.sections.filter((s) => s.pageScope === 'flow');
    expect(flowing).toHaveLength(1);
    expect(flowing[0].kind).toBe('content');
  });
});

describe('Section lookup', () => {
  it('finds a spec by kind within a template', () => {
    const template = getTemplate('officialLetter');
    expect(findSectionSpec(template.sections, 'content')?.required).toBe(true);
    expect(findSectionSpec(template.sections, 'signature')?.required).toBe(false);
  });

  it('returns undefined for a kind this template no longer declares', () => {
    // `date`, `recipient` and `subject` stay valid `SectionKind`s the engine knows
    // (see the describe block above), but Form Editor UX Rebuild v2 removed all three
    // from the shipped template's own section list.
    const template = getTemplate('officialLetter');
    expect(findSectionSpec(template.sections, 'subject')).toBeUndefined();
    expect(findSectionSpec(template.sections, 'recipient')).toBeUndefined();
    expect(findSectionSpec(template.sections, 'date')).toBeUndefined();
  });

  it('finds an instance by kind within a document', () => {
    expect(findSectionInstance(SECTIONS, 'subject')?.content).toEqual({
      kind: 'subject',
      subject: 'طلب تمديد مدة العقد',
    });
    expect(findSectionInstance([], 'subject')).toBeUndefined();
  });

  it('detects a section whose payload does not match its label', () => {
    for (const section of SECTIONS) {
      expect(sectionInstanceIsConsistent(section)).toBe(true);
    }
    const mislabelled = { kind: 'subject', content: { kind: 'date', issueDate: '2026-08-03' } } as SectionInstance;
    expect(sectionInstanceIsConsistent(mislabelled)).toBe(false);
  });
});

describe('Section content shapes', () => {
  it('the recipient is structured, with every field optional', () => {
    // Structured rather than one free line: searchable, reusable by a future
    // multi-recipient section, and never needing to be re-parsed out of prose.
    const empty: SectionInstance = { kind: 'recipient', content: { kind: 'recipient' } };
    expect(sectionInstanceIsConsistent(empty)).toBe(true);
    const full: SectionInstance = {
      kind: 'recipient',
      content: { kind: 'recipient', name: 'أ. محمد', title: 'مدير الإدارة', organisation: 'وزارة الأشغال' },
    };
    expect(sectionInstanceIsConsistent(full)).toBe(true);
  });

  it('the signature section stores selections, never image data (INV-12)', () => {
    const section = findSectionInstance(SECTIONS, 'signature');
    const keys = Object.keys(section!.content);
    expect(keys).not.toContain('signatureImage');
    expect(keys).not.toContain('stampImage');
    expect(keys).not.toContain('dataUrl');
    expect(keys).toContain('showSignature');
    expect(keys).toContain('showStamp');
  });

  it('the barcode section stores no payload and no image', () => {
    // The payload is rebuilt at render time from the registration snapshot, so a
    // reprint reproduces the code exactly. A second stored copy could drift from it.
    const section = findSectionInstance(SECTIONS, 'barcode');
    expect(Object.keys(section!.content)).toEqual(['kind']);
  });

  it('only the content section carries a block document', () => {
    const carriers = SECTIONS.filter((s) => 'body' in s.content);
    expect(carriers).toHaveLength(1);
    expect(carriers[0].kind).toBe('content');
  });
});

describe('Letter statuses', () => {
  it('declares the five states', () => {
    expect([...LETTER_STATUSES]).toEqual(['DRAFT', 'REGISTERED', 'PRINTED', 'SUPERSEDED', 'CANCELLED']);
  });

  it('has no ARCHIVED state — archiving is a flag', () => {
    // "Is this still active correspondence?" is orthogonal to "what happened to this
    // document?". As a state it would be unreachable for a cancelled letter, which
    // must also be archivable.
    expect(LETTER_STATUSES).not.toContain('ARCHIVED');
    expect(draft().isArchived).toBe(false);
  });

  it('labels every state in Arabic', () => {
    for (const status of LETTER_STATUSES) {
      expect(LETTER_STATUS_LABELS_AR[status]?.length).toBeGreaterThan(0);
    }
  });

  it('guards unknown values', () => {
    expect(isLetterStatus('DRAFT')).toBe(true);
    expect(isLetterStatus('draft')).toBe(false);
    expect(isLetterStatus('ARCHIVED')).toBe(false);
    expect(isLetterStatus(null)).toBe(false);
  });
});

describe('INV-8 — a draft has no reference number', () => {
  it('a draft carries a null reference', () => {
    const document = draft();
    expect(document.reference).toBeNull();
    expect(hasReference(document)).toBe(false);
  });

  it('a registered document carries one', () => {
    const registered: LetterDocument = { ...draft(), status: 'REGISTERED', reference: 'OL-2026-000123' };
    expect(hasReference(registered)).toBe(true);
  });

  it('an empty-string reference does not count as having one', () => {
    expect(hasReference({ ...draft(), reference: '' })).toBe(false);
  });
});

describe('INV-9 — the version stamp and print profile are data on the document', () => {
  it('a document carries all three axes plus its print profile', () => {
    const document = draft();
    expect(document.versions).toEqual({ templateVersion: 1, layoutVersion: 1, barcodeVersion: 1 });
    expect(document.printProfileId).toBe('companyLetterhead');
  });

  it('a stored stamp is independent of LATEST', () => {
    // The property that makes reprints faithful: a document issued under version 1
    // keeps version 1 even after LATEST advances. Simulated here by constructing a
    // document with an older stamp and observing that nothing rewrites it.
    const historical: LetterDocument = {
      ...draft(),
      status: 'PRINTED',
      reference: 'OL-2026-000001',
      versions: { templateVersion: 1, layoutVersion: 1, barcodeVersion: 1 },
    };
    expect(historical.versions).not.toBe(latestVersionStamp());
    expect(historical.versions.layoutVersion).toBe(1);
  });

  it('the registration snapshot is absent before registration', () => {
    expect(draft().registrationSnapshot).toBeNull();
  });
});

describe('Freezing the document’s identity at registration', () => {
  it('a draft is editable; everything after it is frozen', () => {
    // Date and subject are inside the frozen barcode payload — changing either would
    // make the printed code disagree with the document.
    expect(isContentIdentityFrozen(draft())).toBe(false);
    for (const status of ['REGISTERED', 'PRINTED', 'SUPERSEDED', 'CANCELLED'] as const) {
      expect(isContentIdentityFrozen({ ...draft(), status })).toBe(true);
    }
  });
});
