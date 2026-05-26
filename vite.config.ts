import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { VitePWA } from 'vite-plugin-pwa';
import path from 'node:path';

export default defineConfig({
  plugins: [
    react(),
    VitePWA({
      registerType: 'prompt',
      includeAssets: ['favicon.svg', 'apple-touch-icon.png'],
      manifest: {
        name: 'Bloom Orders',
        short_name: 'Orders',
        description: 'Καταχώρηση και διαχείριση παραγγελιών — Pakkoutis Nurseries',
        theme_color: '#34c759',
        background_color: '#f2f2f7',
        display: 'standalone',
        orientation: 'portrait',
        start_url: '/',
        scope: '/',
        icons: [
          { src: '/manifest-icons/icon-192.png', sizes: '192x192', type: 'image/png' },
          { src: '/manifest-icons/icon-512.png', sizes: '512x512', type: 'image/png' },
          { src: '/manifest-icons/icon-maskable.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
        ],
      },
      workbox: {
        // Activate the new SW immediately instead of waiting for all tabs
        // to close. Without this, iOS Safari standalone PWAs cling to the
        // old SW indefinitely — meaning bug fixes never reach the user
        // even after hard-refreshing the page.
        skipWaiting: true,
        // Take control of already-open pages on activation so they start
        // serving from the new SW on the very next fetch.
        clientsClaim: true,
        navigateFallback: '/index.html',
        runtimeCaching: [
          {
            urlPattern: ({ url }) => url.pathname.startsWith('/api/'),
            handler: 'NetworkOnly',
          },
        ],
      },
    }),
  ],
  resolve: { alias: { '@': path.resolve(__dirname, './src') } },
  server: { port: 5174 },
});
