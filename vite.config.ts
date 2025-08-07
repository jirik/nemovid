import { resolve } from 'node:path'
import react from '@vitejs/plugin-react-swc';
import { defineConfig } from 'vite';

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  server: {
    port: 3000,
    proxy: {
      '/api/files': 'http://localhost:8000',
      '/api/ogr2ogr': 'http://localhost:8001',
      '/api/qgis': 'http://localhost:8002',
      '/api/vfk': 'http://localhost:8003',
      '/static/files': 'http://localhost:8000',
    },
  },
  preview: {
    port: 3000,
  },
  build: {
    rollupOptions: {
      input: {
        index: resolve(__dirname, 'index.html'),
        vfk: resolve(__dirname, 'vfk.html'),
      },
    },
  },
  envPrefix: 'PUBLIC_',
});
