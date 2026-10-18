import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  root: 'client',
  plugins: [react()],
  publicDir: 'public',
  server: {
    host: '0.0.0.0',
    port: 5173,
    proxy: {
      '/api': 'http://127.0.0.1:3000',
      '/auth': 'http://127.0.0.1:3000'
    }
  },
  build: {
    outDir: '../dist',
    emptyOutDir: true
  }
});
