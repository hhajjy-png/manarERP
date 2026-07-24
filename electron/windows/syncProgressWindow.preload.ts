import { contextBridge, ipcRenderer } from 'electron';
import type { SyncProgressEvent } from '../services/syncProgressBus';

/**
 * Cloud Sync Progress Dialog v1 — dedicated preload for the sync progress
 * window. Deliberately minimal: this window is purely informational (no
 * cancel/retry/close controls), so it only ever RECEIVES push events — it
 * never calls back into the main process. Separate from the app's main
 * `preload.ts`/`window.manar` surface so this standalone window carries no
 * dependency on the backend API, auth, or any other app IPC channel.
 */
contextBridge.exposeInMainWorld('syncProgress', {
  onUpdate: (callback: (event: SyncProgressEvent) => void): void => {
    ipcRenderer.on('sync-progress:update', (_e, payload: SyncProgressEvent) => callback(payload));
  },
});
