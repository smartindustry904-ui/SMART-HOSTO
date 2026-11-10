import path from 'path';
import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig(({ mode }) => {
    const env = loadEnv(mode, '.', '');
    return {
      server: {
        port: 3000,
        host: '0.0.0.0',
        hmr: false,
      },
      plugins: [react()],
      define: {
        'process.env.API_KEY': JSON.stringify(env.GEMINI_API_KEY),
        'process.env.GEMINI_API_KEY': JSON.stringify(env.GEMINI_API_KEY)
      },
      resolve: {
        alias: {
          '@': path.resolve(__dirname, '.'),
        }
      },
      build: {
        target: 'esnext',
        chunkSizeWarningLimit: 900,
        rollupOptions: {
          output: {
            manualChunks: {
              'vendor-firebase': ['firebase/app', 'firebase/firestore', 'firebase/auth', 'firebase/storage'],
              'vendor-icons': ['lucide-react'],
              'vendor-charts': ['recharts'],
              'vendor-pdf': ['jspdf', 'jspdf-autotable', 'html2canvas'],
              'vendor-motion': ['motion']
            }
          }
        }
      }
    };
});
