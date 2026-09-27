# Design source — Bloom app icon

This folder holds the **source artefacts** for the app icon set. The
rendered PNGs live in `../public/manifest-icons/` (Android / Chromium)
and `../public/apple-touch-icon.png` (iOS home screen). The browser-tab
icon is `../public/favicon.svg`. Vite-plugin-pwa picks them up at build
time — see `vite.config.ts` → `manifest.icons`.

## Files in this folder

| File | Purpose |
|---|---|
| `icon-master.png` | 1024×1024 master from the designer (2026-09-27). A page with a leaf and two text lines over a second page, on cream with a faint dot texture. No wordmark, because the app now covers orders **and** quotes. Every PNG size is rendered from this file. |
| `icon-mark.svg` | Hand-traced vector of the mark only, without the cream background, on the master's 1024 grid. It is a copy of `public/favicon.svg`. Use it wherever the mark must stay sharp at small sizes. |

## Brand colours (sampled from the master)

| Role | Hex |
|---|---|
| Cream background, leaf vein, text lines | `#F2EBDB` |
| Front page | `#2F4F44` (app `--sage-700`) |
| Back page | `#6B8E5C` |
| Leaf | `#B4C6A5` |

## Safe zone

The mark's bounding box is x 242–780, y 210–786. Its farthest corner is
405 px from the centre, inside Android's maskable safe radius of 409.6 px
(40 % of 1024). That is why `icon-maskable.png` is the master itself,
with no extra padding. If the mark grows, re-check this before reusing
the master as the maskable icon.

## Regenerating the PNGs

The master is fully opaque, and iOS requires that for the touch icon.
Plain Lanczos down-scales are enough:

```python
from PIL import Image
im = Image.open('design/icon-master.png').convert('RGB')
for path, size in [('public/manifest-icons/icon-512.png', 512),
                   ('public/manifest-icons/icon-192.png', 192),
                   ('public/manifest-icons/icon-maskable.png', 512),
                   ('public/apple-touch-icon.png', 180)]:
    im.resize((size, size), Image.LANCZOS).save(path, optimize=True)
```

Keep the file names: `vite.config.ts` and `index.html` reference them.

## Note for users

iOS copies the home-screen icon at the moment the app is added. Anyone
who installed the PWA earlier keeps the old icon until they delete the
home-screen shortcut and add it again from Safari (Share → Add to Home
Screen).
