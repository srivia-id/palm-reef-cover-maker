# REEF HEAT — Palm Reef City Cover Maker

[![make.fun](https://make.fun/badge/gta6-cover-art-01.svg)](https://make.fun/c/gta6-cover-art-01)
[![rank](https://make.fun/badge/gta6-cover-art-01/srivia-id/palm-reef-cover-maker/rank.svg)](https://make.fun/c/gta6-cover-art-01)
[![reward](https://make.fun/badge/gta6-cover-art-01/srivia-id/palm-reef-cover-maker/reward.svg)](https://make.fun/c/gta6-cover-art-01)

Turn a photo and a caption into multi-panel GTA-style poster cover art, exported as a PNG to share. Built for the make.fun **GTA 6 Cover Art** bounty — fully offline, no Rockstar artwork, logo or font anywhere.

## What it does

- **5 layouts** — Poster Grid, Hero Trio, Skyline Bands, Four Corners, and Poster Wall (7 panels that reuse crops of the same photos).
- **Any photo** — load your own, or use the 4 AI-made sample photos. Per panel: pick a photo, crop and position it (drag to pan, scroll to zoom), or span one photo across all panels.
- **4 colour grades that unify every panel** — Palm Reef Sunset, Neon Night, Clean, and **Poster Ink** (posterized to a 6-step sunset ramp with halftone dots).
- **Picture dressing drawn in code** — reef shapes, a sun disc, palm silhouettes, poster frame.
- **Typography** — big block title, script subtitle, gradient title band with a skyline silhouette, tagline strip.
- **Poster furniture** — starburst “EST. 2026” badge, “HEAT” star-rating pill, corner banner.
- **Export PNG** in the common post sizes: 1080 × 1080, 1080 × 1350, 1920 × 1080.

## Try it

Serve `app/` with any static file server and open `index.html` in desktop Chrome:

```sh
cd app && python3 -m http.server 8080
```

No build step, no network requests — every script, image and font the app loads is a file under `app/`, and your photos never leave your machine.

## Entry

`main.ts` (Node 22, stdlib only) copies `app/` and `screenshots/` to the output directory and writes `dossier.json` via `buildDossier` from `vendor/makefun-app.ts` (the kit's copy, unchanged).

```sh
mkdir -p out && MAKEFUN_OUTPUT_DIR=out node main.ts
```

## License

MIT — see [LICENSE](LICENSE).
