import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';

// React UI lives in web/, builds to dist/web (served by Express in src/app.js).
export default defineConfig({
  root: 'web',
  plugins: [react(), tailwindcss()],
  build: { outDir: '../dist/web', emptyOutDir: true, assetsDir: 'assets' },
  server: {
    port: 5173,
    proxy: Object.fromEntries(['/api', '/health'].map((p) => [p, { target: process.env.API_URL || 'http://127.0.0.1:8091', changeOrigin: false }])),
  },
});
