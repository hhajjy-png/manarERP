import { BrowserWindow, shell } from 'electron';
import path from 'path';

/** هل نحن في وضع التطوير (واجهة Vite) أم الإنتاج (ملفات مبنية)؟ */
const isDev = !!process.env.VITE_DEV_SERVER_URL;

/**
 * إنشاء النافذة الرئيسية للتطبيق.
 * تحمّل واجهة React (من Vite في التطوير أو من ملفات dist في الإنتاج).
 */
export function createMainWindow(): BrowserWindow {
  const win = new BrowserWindow({
    width: 1440,
    height: 900,
    minWidth: 1024,
    minHeight: 680,
    title: 'نظام المنار لإدارة الأعمال',
    backgroundColor: '#0f172a',
    show: false,
    webPreferences: {
      preload: path.join(__dirname, '..', 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });

  // إظهار النافذة بعد جاهزيتها لتفادي الوميض الأبيض
  win.once('ready-to-show', () => win.show());

  if (isDev) {
    win.loadURL(process.env.VITE_DEV_SERVER_URL as string);
    win.webContents.openDevTools({ mode: 'detach' });
  } else {
    win.loadFile(path.join(__dirname, '..', '..', 'frontend', 'dist', 'index.html'));
  }

  // فتح الروابط الخارجية في المتصفح لا داخل التطبيق
  win.webContents.setWindowOpenHandler(({ url }) => {
    if (url.startsWith('http')) shell.openExternal(url);
    return { action: 'deny' };
  });

  return win;
}
