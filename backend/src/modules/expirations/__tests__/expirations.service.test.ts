import { describe, it, expect } from 'vitest';
import { ExpirationsService } from '../expirations.service';

// Uses the real Prisma test DB seeded by migrations
const svc = new ExpirationsService();

describe('ExpirationsService.summary', () => {
  it('returns an object with numeric counts', async () => {
    const s = await svc.summary();
    expect(typeof s.expired).toBe('number');
    expect(typeof s.days7).toBe('number');
    expect(typeof s.total).toBe('number');
  });
});

describe('ExpirationsService.list', () => {
  it('returns an array', async () => {
    const list = await svc.list({ urgency: 'all' });
    expect(Array.isArray(list)).toBe(true);
  });

  it('filters by urgency', async () => {
    const list = await svc.list({ urgency: 'ok' });
    list.forEach(r => expect(r.urgency).toBe('ok'));
  });

  it('sorts by daysRemaining ascending', async () => {
    const list = await svc.list({ urgency: 'all' });
    for (let i = 1; i < list.length; i++) {
      expect(list[i].daysRemaining).toBeGreaterThanOrEqual(list[i - 1].daysRemaining);
    }
  });
});
