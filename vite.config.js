import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';

// React UI lives in web/, builds to public/ (Vercel serves public/ from its CDN; Express serves it locally).
export default defineConfig({
  root: 'web',
  plugins: [react(), tailwindcss()],
  build: { outDir: '../public', emptyOutDir: true, assetsDir: 'assets' },
  server: {
    port: 5173,
    proxy: Object.fromEntries(['/api', '/health'].map((p) => [p, { target: process.env.API_URL || 'http://127.0.0.1:8091', changeOrigin: false }])),
  },
});
