import { BrowserWindow, Menu, MenuItem } from 'electron';

/**
 * Registers a right-click context menu on the main window's webContents.
 *
 * Behaviour by context:
 *   - Editable element  →  Cut / Copy / Paste / Select All (filtered by editFlags)
 *   - Selected text (read-only)  →  Copy / Select All
 *   - Empty non-editable area  →  no menu
 *
 * Runs entirely in the main process. No IPC channels, no preload changes,
 * no renderer code needed.
 */
export function registerContextMenuIpc(window: BrowserWindow): void {
  window.webContents.on('context-menu', (_event, params) => {
    const { isEditable, selectionText, editFlags } = params;
    const hasSelection = selectionText.trim().length > 0;

    if (!isEditable && !hasSelection) return;

    const menu = new Menu();

    if (isEditable) {
      if (editFlags.canCut) {
        menu.append(new MenuItem({ role: 'cut', label: 'قص' }));
      }
      if (editFlags.canCopy) {
        menu.append(new MenuItem({ role: 'copy', label: 'نسخ' }));
      }
      if (editFlags.canPaste) {
        menu.append(new MenuItem({ role: 'paste', label: 'لصق' }));
      }
      if (menu.items.length > 0) {
        menu.append(new MenuItem({ type: 'separator' }));
      }
      if (editFlags.canSelectAll) {
        menu.append(new MenuItem({ role: 'selectAll', label: 'تحديد الكل' }));
      }
    } else {
      menu.append(new MenuItem({ role: 'copy', label: 'نسخ' }));
      menu.append(new MenuItem({ type: 'separator' }));
      menu.append(new MenuItem({ role: 'selectAll', label: 'تحديد الكل' }));
    }

    if (menu.items.length > 0) {
      menu.popup({ window });
    }
  });
}
