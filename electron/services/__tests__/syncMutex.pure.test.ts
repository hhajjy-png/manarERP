import { describe, it, expect } from 'vitest';
import { createSyncMutex } from '../syncMutex.pure';

/**
 * Production Hardening Pack v1 — P0-4
 *
 * الضمانة المُختبَرة: **لا عمليتا مزامنة في آن واحد، أبدًا**. الرفض فوري وواضح،
 * والقفل يتحرّر مهما انتهت العملية — بنجاح أو استثناء — فلا يُقفَل النظام للأبد.
 */

function deferred<T = void>() {
  let resolve!: (value: T) => void;
  let reject!: (err: unknown) => void;
  const promise = new Promise<T>((res, rej) => { resolve = res; reject = rej; });
  return { promise, resolve, reject };
}

describe('createSyncMutex', () => {
  it('ينفّذ العملية ويُعيد قيمتها حين يكون القفل حرًّا', async () => {
    const mutex = createSyncMutex();
    const outcome = await mutex.run('SYNC_NOW', async () => 42);
    expect(outcome).toEqual({ ok: true, value: 42 });
  });

  it('يرفض العملية الثانية فورًا بلا تنفيذها ولا انتظارها', async () => {
    const mutex = createSyncMutex();
    const gate = deferred();
    let secondRan = false;

    const first = mutex.run('UPLOAD', async () => { await gate.promise; return 'first'; });
    const second = await mutex.run('SYNC_NOW', async () => { secondRan = true; return 'second'; });

    expect(secondRan).toBe(false);
    expect(second.ok).toBe(false);
    if (!second.ok) {
      expect(second.holder).toBe('UPLOAD');
      expect(second.message).toContain('عملية مزامنة جارية');
    }

    gate.resolve();
    await first;
  });

  it('رسالة الرفض تسمّي العملية الجارية بالعربية', async () => {
    const mutex = createSyncMutex();
    const gate = deferred();
    const running = mutex.run('SHUTDOWN_SYNC', async () => { await gate.promise; });

    const rejected = await mutex.run('DOWNLOAD', async () => undefined);
    expect(rejected.ok).toBe(false);
    if (!rejected.ok) expect(rejected.message).toContain('مزامنة الإغلاق');

    gate.resolve();
    await running;
  });

  it('يحرّر القفل بعد النجاح فتنجح العملية التالية', async () => {
    const mutex = createSyncMutex();
    await mutex.run('UPLOAD', async () => undefined);
    expect(mutex.isBusy()).toBe(false);
    const next = await mutex.run('DOWNLOAD', async () => 'ok');
    expect(next).toEqual({ ok: true, value: 'ok' });
  });

  it('يحرّر القفل حتى لو رمت العملية — لا قفل عالق للأبد', async () => {
    const mutex = createSyncMutex();
    await expect(mutex.run('UPLOAD', async () => { throw new Error('انفجار'); })).rejects.toThrow('انفجار');
    expect(mutex.isBusy()).toBe(false);
    expect(mutex.current()).toBeNull();

    const next = await mutex.run('SYNC_NOW', async () => 'recovered');
    expect(next).toEqual({ ok: true, value: 'recovered' });
  });

  it('يمنع كل أنواع العمليات من التداخل مع بعضها', async () => {
    const mutex = createSyncMutex();
    const gate = deferred();
    const running = mutex.run('STARTUP_SYNC', async () => { await gate.promise; });

    for (const op of ['SYNC_NOW', 'UPLOAD', 'DOWNLOAD', 'RESOLVE_CONFLICT', 'CONFLICT_CHECK', 'SHUTDOWN_SYNC'] as const) {
      const outcome = await mutex.run(op, async () => 'should not run');
      expect(outcome.ok).toBe(false);
    }

    gate.resolve();
    await running;
  });

  it('يكشف العملية الجارية للتشخيص', async () => {
    const mutex = createSyncMutex();
    const gate = deferred();
    const running = mutex.run('DOWNLOAD', async () => { await gate.promise; });

    expect(mutex.isBusy()).toBe(true);
    expect(mutex.current()).toBe('DOWNLOAD');

    gate.resolve();
    await running;
    expect(mutex.current()).toBeNull();
  });

  it('عشر محاولات متزامنة ⇒ واحدة فقط تُنفَّذ', async () => {
    const mutex = createSyncMutex();
    const gate = deferred();
    let executions = 0;

    const attempts = Array.from({ length: 10 }, () =>
      mutex.run('SYNC_NOW', async () => { executions += 1; await gate.promise; }),
    );

    gate.resolve();
    const results = await Promise.all(attempts);

    expect(executions).toBe(1);
    expect(results.filter((r) => r.ok)).toHaveLength(1);
  });
});
