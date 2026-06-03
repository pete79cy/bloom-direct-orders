import React from 'react';
import ReactDOM from 'react-dom/client';
import * as Sentry from '@sentry/react';
import App from './App';
import './styles/globals.css';

const dsn = import.meta.env.VITE_SENTRY_DSN;
if (dsn) {
  Sentry.init({
    dsn,
    integrations: [Sentry.browserTracingIntegration()],
    tracesSampleRate: 0.1,
    environment: import.meta.env.MODE,
  });
}

// One-shot service-worker reset. When the calendar bug saga left some
// users (specifically the iPhone PWA installs from before 2026-06-02)
// stuck on a stale Workbox SW that wouldn't release control, the only
// reliable escape was Offload App. This shim does it programmatically:
// on every load we mark a localStorage flag; if the device hasn't yet
// seen the SW_RESET_VERSION bump, we unregister every SW under our
// scope and force a one-time hard reload. Bumping SW_RESET_VERSION in
// a future deploy is the kill-switch for a similar future incident.
//
// Safe to run on every device — the unregister + reload only fire if
// the flag is missing/stale. After the first successful run, the new
// SW (registered by vite-plugin-pwa during App mount) takes over
// cleanly with the autoUpdate config.
const SW_RESET_VERSION = '2026-06-02-bottomnav-v3';
async function oneShotSwReset() {
  if (typeof window === 'undefined' || !('serviceWorker' in navigator)) return;
  try {
    if (window.localStorage.getItem('bdo_sw_reset') === SW_RESET_VERSION) return;
    const regs = await navigator.serviceWorker.getRegistrations();
    if (regs.length === 0) {
      // No SW registered (fresh install) — just record the flag so we
      // don't loop on every load.
      window.localStorage.setItem('bdo_sw_reset', SW_RESET_VERSION);
      return;
    }
    await Promise.all(regs.map((r) => r.unregister()));
    // Clear Workbox precache too — unregister alone leaves the cache
    // entries around, and the new SW can pick them up and re-serve
    // stale chunks.
    if ('caches' in window) {
      const keys = await caches.keys();
      await Promise.all(keys.map((k) => caches.delete(k)));
    }
    window.localStorage.setItem('bdo_sw_reset', SW_RESET_VERSION);
    // Hard reload — the next load registers the fresh SW from /sw.js.
    window.location.reload();
  } catch (err) {
    // Don't block the app on a SW reset failure — just log and continue.
    // eslint-disable-next-line no-console
    console.warn('SW reset failed', err);
  }
}
void oneShotSwReset();

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <Sentry.ErrorBoundary
      fallback={
        <div className="p-8 text-center">
          Κάτι πήγε στραβά. Κλείσε και άνοιξε ξανά την εφαρμογή.
        </div>
      }
    >
      <App />
    </Sentry.ErrorBoundary>
  </React.StrictMode>,
);
