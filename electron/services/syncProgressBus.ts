import { EventEmitter } from 'node:events';
import type { SyncStatus } from './syncEngine.service';

/**
 * Cloud Sync Progress Dialog v1 — synchronization event bus.
 *
 * A thin, additive observability layer over the existing sync engine.
 * `syncEngine.service.ts`'s `setStatus()` emits one event here per call —
 * the SAME real status/message the engine already tracks internally
 * (`currentStatus`/`currentMessage`, polled today via `getSyncStatus()`).
 * No decision, retry, upload, download, or conflict logic lives here or is
 * touched by this file — it only republishes what already happens.
 *
 * The engine never imports anything UI-related and never knows whether
 * anyone is listening — `emit()` with zero listeners is a no-op. Consumers
 * (the sync progress window controller) subscribe here instead of polling.
 */
class SyncProgressBus extends EventEmitter {}

export const syncProgressBus = new SyncProgressBus();

export interface SyncProgressEvent {
  phase: SyncStatus;
  /** The exact Arabic message from the originating `setStatus()` call, if any. */
  message: string;
  at: number;
}

export function emitSyncProgress(phase: SyncStatus, message: string): void {
  syncProgressBus.emit('progress', { phase, message, at: Date.now() } satisfies SyncProgressEvent);
}
