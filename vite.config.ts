/// <reference types="vitest" />
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react-swc';
import { fileURLToPath, URL } from 'node:url';

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url)),
    },
  },
  build: {
    rollupOptions: {
      output: {
        // Split the two big dependencies out of the app bundle so a change to
        // a screen does not invalidate the cached vendor code.
        //
        // Framer Motion is deliberately NOT listed. It used to be, and that
        // quietly cancelled the LazyMotion split in App.tsx: naming a package
        // here forces every module in it into one chunk, so the animation
        // engine that was supposed to arrive on demand became a static
        // dependency of the entry again. Left alone, Rollup splits the
        // `domAnimation` bundle out by itself.
        manualChunks: {
          react: ['react', 'react-dom', 'react-router-dom'],
          supabase: ['@supabase/supabase-js'],
        },
      },
    },
  },
  test: {
    environment: 'jsdom',
    globals: true,
    setupFiles: ['./src/test/setup.ts'],
    include: ['src/**/*.test.{ts,tsx}'],
  },
});
