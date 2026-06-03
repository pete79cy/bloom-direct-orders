import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { VitePWA } from 'vite-plugin-pwa';
import path from 'node:path';
import { execSync } from 'node:child_process';

// Build-time git SHA injection so the deployed bundle can identify
// itself in the UI. Used by the Calendar debug strip to prove which
// commit the user's device is actually serving. Falls back to a marker
// when run outside a git tree (e.g. dist deploy contexts).
let GIT_SHA = 'unknown';
try {
  GIT_SHA = execSync('git rev-parse --short HEAD', { stdio: ['ignore', 'pipe', 'ignore'] })
    .toString()
    .trim();
} catch {
  // ignore — keep 'unknown'
}

export default defineConfig({
  define: {
    __BUILD_SHA__: JSON.stringify(GIT_SHA),
  },
  plugins: [
    react(),
    VitePWA({
      // autoUpdate, not prompt. With registerType:'prompt' the new SW is
      // installed in WAITING state and only takes over after the user
      // clicks the "Refresh" toast — which on iOS Safari standalone
      // mode is unreliable: the toast often doesn't fire, the standalone
      // shell never re-fetches, and bug fixes stall on the user's home
      // screen indefinitely. autoUpdate combined with the skipWaiting +
      // clientsClaim below makes the new SW activate AS SOON AS it's
      // discovered, with no user interaction required. The next fetch
      // on already-open clients serves the new bundles.
      registerType: 'autoUpdate',
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
