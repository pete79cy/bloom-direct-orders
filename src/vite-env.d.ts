/// <reference types="vite/client" />
/// <reference types="vite-plugin-pwa/react" />

declare module '*.css';

// Injected at build time by vite.config.ts — short git SHA of the
// commit being deployed. Used to identify the running bundle in the
// Calendar's debug strip.
declare const __BUILD_SHA__: string;
