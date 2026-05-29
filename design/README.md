# Design source — Bloom Orders PWA icon

This folder holds the **source artefacts** for the app icon set. The
rendered PNGs live in `../public/manifest-icons/` (Android / Chromium)
and `../public/apple-touch-icon.png` (iOS home-screen). Vite-plugin-pwa
picks them up from there at build time — see `vite.config.ts` →
`manifest.icons`.

## Files in this folder

| File | Purpose |
|---|---|
| `icon-master.png` | 1024×1024 rendered master. Re-render the icon set from this when you want to change padding / background / format. |
| `icon-master.html` | HTML/CSS source of the master. Cream `#F2EBDB` background with a faint herbarium dot texture, sage `#6B8E5C` LeafMark scaled from `src/components/LeafMark.tsx`, and "Orders" in Fraunces italic sage-500. Open in a browser at 1024×1024 to verify; export with the browser's screenshot tool or any HTML-to-PNG renderer. |

## Brand colours used

- Cream background: `#F2EBDB`
- Sage leaf fill: `#6B8E5C`
- Sage-500 (label colour): `#4E7549`

## How to regenerate the manifest icons from this master

The pre-rendered files in `public/manifest-icons/` and
`public/apple-touch-icon.png` were generated to match the output of
`pwa-asset-generator` with these specs:

```bash
# Manifest icons (192 + 512): 20% padding, opaque #f2f2f7 background
npx pwa-asset-generator design/icon-master.png public/manifest-icons \
  --padding "20%" --background "#f2f2f7" --opaque --icon-only

# Maskable: full-bleed cream, leaf in safe zone, no text
#   (Android masks crop to circle / squircle — text at edges gets clipped)
npx pwa-asset-generator design/icon-master.png public/manifest-icons \
  --padding "12%" --maskable --background "#F2EBDB"
mv public/manifest-icons/maskable-icon-*.png public/manifest-icons/icon-maskable.png

# Apple touch icon (180×180): 15% padding, opaque #f2f2f7
npx pwa-asset-generator design/icon-master.png public \
  --type png --opaque --padding "15%" --background "#f2f2f7" --apple-touch-icon
```

After regenerating, rename outputs to match the file names referenced in
`vite.config.ts` (`icon-192.png`, `icon-512.png`, `icon-maskable.png`,
`apple-touch-icon.png`) and commit both the master changes here AND the
public/ outputs together.

## Provenance

Imported from a Claude Design handoff bundle on 2026-05-29 — see
session transcript. The pre-rendered icon set was shipped by the
designer; this folder preserves the master so future tweaks don't
require a round-trip through the design tool.
