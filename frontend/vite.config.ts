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
    setupFiles: ['./src/__tests__/setup.ts'],
  },
});
