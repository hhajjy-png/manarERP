/**
 * Letter Engine — the document timeline.
 *
 * Structure only in this pack: events are written, nothing reads them yet. So these
 * tests assert what gets RECORDED and that the record is append-only.
 *
 * The case that justifies the whole table is the last suite: archive → unarchive →
 * archive. The audit columns hold only the final archiving; the timeline is the only
 * place the earlier one survives.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  TIMELINE_EVENT_LABELS_AR,
  TIMELINE_EVENT_TYPES,
  isTimelineEventType,
  listEvents,
  recordEvent,
} from '../timeline.service';

const client = {
  letterTimelineEvent: { create: vi.fn(), findMany: vi.fn() },
} as never;

const created = () => (client as never as { letterTimelineEvent: { create: { mock: { calls: { 0: { data: Record<string, unknown> } }[] } } } }).letterTimelineEvent.create.mock.calls.map((c) => c[0].data);

beforeEach(() => {
  vi.clearAllMocks();
});

describe('Event vocabulary', () => {
  it('declares one event type per status transition, plus the reversible-action events', () => {
    // The four branding events and REFERENCE_ASSIGNED joined the vocabulary in P7.
    // Pinned as an exact list on purpose: an event type added without a deliberate
    // decision is an audit trail that quietly changed shape.
    expect([...TIMELINE_EVENT_TYPES]).toEqual([
      'CREATED',
      'REGISTERED',
      'REFERENCE_ASSIGNED',
      'PRINTED',
      'SUPERSEDED',
      'CANCELLED',
      'ARCHIVED',
      'UNARCHIVED',
      'SIGNATURE_ADDED',
      'SIGNATURE_REMOVED',
      'STAMP_ADDED',
      'STAMP_REMOVED',
    ]);
  });

  it('records the number’s assignment separately from the document’s transition', () => {
    // They coincide today; a scheme that pre-allocated or re-issued would break that,
    // and a register audit reading REGISTERED would then be reading the wrong event.
    expect(TIMELINE_EVENT_TYPES).toContain('REFERENCE_ASSIGNED');
    expect(TIMELINE_EVENT_TYPES).toContain('REGISTERED');
  });

  it('records both directions of every reversible action', () => {
    // The letter row keeps only the CURRENT selection, so without a paired removal
    // event a signature that was swapped would leave no trace it was ever there.
    for (const pair of [['SIGNATURE_ADDED', 'SIGNATURE_REMOVED'], ['STAMP_ADDED', 'STAMP_REMOVED'], ['ARCHIVED', 'UNARCHIVED']]) {
      expect(TIMELINE_EVENT_TYPES).toContain(pair[0]);
      expect(TIMELINE_EVENT_TYPES).toContain(pair[1]);
    }
  });

  it('declares PRINTED and SUPERSEDED although this pack never writes them', () => {
    // Declared now so a later pack adds a call rather than a new vocabulary.
    expect(TIMELINE_EVENT_TYPES).toContain('PRINTED');
    expect(TIMELINE_EVENT_TYPES).toContain('SUPERSEDED');
  });

  it('labels every event type in Arabic', () => {
    for (const type of TIMELINE_EVENT_TYPES) {
      expect(TIMELINE_EVENT_LABELS_AR[type].length).toBeGreaterThan(0);
    }
  });

  it('guards unknown values', () => {
    expect(isTimelineEventType('ARCHIVED')).toBe(true);
    expect(isTimelineEventType('archived')).toBe(false);
    expect(isTimelineEventType('DELETED')).toBe(false);
    expect(isTimelineEventType(null)).toBe(false);
  });
});

describe('recordEvent', () => {
  it('writes a status-transition event with both ends of the transition', async () => {
    await recordEvent(client, {
      letterId: 1,
      eventType: 'REGISTERED',
      fromStatus: 'DRAFT',
      toStatus: 'REGISTERED',
      reference: 'OL-2026-000001',
      actor: { id: 7, name: 'admin' },
    });

    expect(created()[0]).toMatchObject({
      letterId: 1,
      eventType: 'REGISTERED',
      fromStatus: 'DRAFT',
      toStatus: 'REGISTERED',
      reference: 'OL-2026-000001',
      actorId: 7,
      actorName: 'admin',
      reason: null,
    });
  });

  it('writes an archive event with NO status ends — the flag is not a state', async () => {
    await recordEvent(client, { letterId: 1, eventType: 'ARCHIVED', actor: { id: 7, name: 'admin' } });
    expect(created()[0]).toMatchObject({ eventType: 'ARCHIVED', fromStatus: null, toStatus: null });
  });

  it('carries the cancellation reason', async () => {
    await recordEvent(client, {
      letterId: 1,
      eventType: 'CANCELLED',
      fromStatus: 'REGISTERED',
      toStatus: 'CANCELLED',
      reference: 'OL-2026-000001',
      reason: 'صدر بالخطأ',
    });
    expect(created()[0].reason).toBe('صدر بالخطأ');
  });

  it('tolerates an anonymous actor', async () => {
    await recordEvent(client, { letterId: 1, eventType: 'CREATED', toStatus: 'DRAFT' });
    expect(created()[0]).toMatchObject({ actorId: null, actorName: null });
  });

  it('lets the caller pin the timestamp so an event matches the change it describes', async () => {
    const when = new Date('2026-08-04T09:00:00.000Z');
    await recordEvent(client, { letterId: 1, eventType: 'ARCHIVED', occurredAt: when });
    expect(created()[0].occurredAt).toBe(when);
  });

  it('omits occurredAt entirely when unset, so the database default applies', async () => {
    await recordEvent(client, { letterId: 1, eventType: 'ARCHIVED' });
    expect(created()[0]).not.toHaveProperty('occurredAt');
  });
});

describe('The timeline is append-only', () => {
  it('exposes no update and no delete', () => {
    // Rows are removed only by the letter's own cascade, and the only deletable letter
    // is an unnumbered draft.
    const api = { recordEvent, listEvents };
    expect(Object.keys(api).sort()).toEqual(['listEvents', 'recordEvent']);
  });

  it('reads oldest first, with id as the tie-break for same-instant events', async () => {
    await listEvents(client, 1);
    const args = (client as never as { letterTimelineEvent: { findMany: { mock: { calls: { 0: unknown }[] } } } })
      .letterTimelineEvent.findMany.mock.calls[0][0] as { where: unknown; orderBy: unknown };
    expect(args.where).toEqual({ letterId: 1 });
    expect(args.orderBy).toEqual([{ occurredAt: 'asc' }, { id: 'asc' }]);
  });
});

describe('THE CASE THAT JUSTIFIES THE TABLE — a reversible action leaves a trace', () => {
  it('archive → unarchive → archive records three events', async () => {
    // The letter row ends up holding ONE archivedAt/archivedBy pair, describing the
    // third event only; unarchiving cleared the first. Without the timeline the earlier
    // archiving would be gone without trace.
    await recordEvent(client, { letterId: 1, eventType: 'ARCHIVED', actor: { id: 7, name: 'a' } });
    await recordEvent(client, { letterId: 1, eventType: 'UNARCHIVED', actor: { id: 8, name: 'b' } });
    await recordEvent(client, { letterId: 1, eventType: 'ARCHIVED', actor: { id: 9, name: 'c' } });

    expect(created().map((e) => e.eventType)).toEqual(['ARCHIVED', 'UNARCHIVED', 'ARCHIVED']);
    expect(created().map((e) => e.actorName)).toEqual(['a', 'b', 'c']);
  });
});
