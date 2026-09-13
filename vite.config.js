import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

// https://vite.dev/config/
export default defineConfig({
  plugins: [
    react(),
    tailwindcss()
  ],
  build: {
    rollupOptions: {
      output: {
        manualChunks(id) {
          const normalized = id.replaceAll('\\\\', '/');
          if (normalized.includes('/@firebase/firestore/') || normalized.includes('/firebase/firestore/')) return 'firebase-firestore';
          if (normalized.includes('/@firebase/auth/') || normalized.includes('/firebase/auth/')) return 'firebase-auth';
          if (normalized.includes('/@firebase/functions/') || normalized.includes('/firebase/functions/')) return 'firebase-functions';
          if (normalized.includes('/@firebase/') || normalized.includes('/firebase/')) return 'firebase-platform';
          return undefined;
        }
      }
    }
  }
})
