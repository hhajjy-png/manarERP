import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  // مسارات نسبية ليعمل التطبيق من ملفات Electron المحلية (file://)
  base: './',
  server: { port: 5173, strictPort: true },
  build: {
    outDir: 'dist',
    emptyOutDir: true,
    // Force ONLY the Cairo TTF used by the form PDF export to inline as a base64
    // data URI, so the standalone HTML handed to the hidden-window printToPDF
    // pipeline (window.manar.exportPdfFromHtml) is fully self-contained — no
    // file:// font resolution, works offline exactly like the backend report
    // engine's embedded @font-face. Every other asset keeps the default 4 KB
    // inline threshold (return undefined → Vite's normal size-based decision).
    assetsInlineLimit(filePath) {
      if (filePath.endsWith('Cairo-Regular.ttf')) return true;
      return undefined;
    },
    rollupOptions: {
      output: {
        // Split large, stable third-party libraries into dedicated cacheable
        // chunks so they are downloaded/parsed once and shared across the
        // lazy-loaded route chunks instead of being duplicated or bundled into
        // the initial load. App code updates no longer invalidate these.
        manualChunks(id) {
          if (!id.includes('node_modules')) return undefined;
          if (id.includes('react-router')) return 'vendor-react';
          if (/[\\/]node_modules[\\/](react|react-dom|scheduler)[\\/]/.test(id)) return 'vendor-react';
          if (id.includes('recharts') || id.includes('d3-') || id.includes('victory-vendor')) return 'vendor-charts';
          if (id.includes('xlsx')) return 'vendor-xlsx';
          if (id.includes('mammoth')) return 'vendor-docx';
          if (id.includes('jszip')) return 'vendor-zip';
          if (id.includes('qrcode')) return 'vendor-qrcode';
          return undefined;
        },
      },
    },
  },
  test: {
    globals: true,
    environment: 'jsdom',
    setupFiles: ['./src/__tests__/setup.ts'],
  },
});
