# Task 1 — Scaffold Parts Configurator — Work Record

**Task ID**: 1
**Agent name**: Z.ai Code (fullstack-dev)
**Date**: 2026-11-05
**Project root**: `/home/z/my-project`

## Summary

Built a complete interactive **Scaffold Parts Configurator** as a single-page Next.js 16
app. CAD engineers can pick scaffold parts from a catalog (caster wheel with brake,
ringlock rosette, ringlock standard), configure dimensions live (preset sizes +
advanced parametric mode), see a live Three.js 3D preview, add parts to a BOM cart,
generate and download STEP files on demand, and save/load configurations to
localStorage.

All 10 acceptance criteria verified end-to-end (see below).

## File Structure Created

```
src/
  app/
    page.tsx                              ← main configurator page (single route)
    layout.tsx                            ← updated: Sonner toaster, new metadata
    api/
      generate-step/route.ts             ← POST endpoint: spawns Python cadquery
  components/
    configurator/
      parts-catalog.tsx                  ← LEFT panel: accordion of catalog presets
      viewer-3d.tsx                      ← CENTER panel: R3F Canvas + OrbitControls
      config-panel.tsx                   ← RIGHT panel: Tabs (Preset / Advanced)
      bom-cart.tsx                       ← BOTTOM bar: BOM chips + CSV/ZIP export
      header.tsx                         ← TOP bar: Save / Load / saved configs
    three/
      CasterMesh.tsx                     ← procedural caster geometry (wheel+hub+yoke+brake)
      RosetteMesh.tsx                    ← procedural rosette disc with 8 holes
      StandardMesh.tsx                   ← procedural standard (tube + rosettes + spigot)
    ui/                                   ← (existing shadcn components — untouched)
  lib/
    part-types.ts                        ← TS types: CasterConfig, RosetteConfig, StandardConfig, BomItem, SavedConfig
    presets.ts                           ← catalog groups + 12 presets (caster ×4, rosette ×3, standard ×5)
    store.ts                             ← Zustand store: current config + BOM cart
    storage.ts                           ← localStorage save/load helpers
scripts/
  generate_step.py                       ← unified Python cadquery STEP generator (CLI)
agent-ctx/
  1-scaffold-configurator.md             ← this file
screenshots/
  01-initial.png ... 07-final-zip-success.png
```

## Architecture Summary

| Concern                     | Library / Approach                                                                       |
|-----------------------------|-------------------------------------------------------------------------------------------|
| Framework                   | Next.js 16 App Router, TypeScript 5, all client components                                |
| Styling                     | Tailwind CSS 4 + shadcn/ui (New York) — neutral grey chrome, orange/blue parts           |
| Layout                      | `react-resizable-panels` (3 horizontal panels desktop, vertical on mobile via useIsMobile) |
| 3D viewer                   | `@react-three/fiber` v9 + `@react-three/drei` (OrbitControls, Environment, Grid)         |
| Procedural geometry         | THREE primitives (cylinderGeometry, boxGeometry, torusGeometry) built from config        |
| Debounced 3D updates        | `useDebouncedValue(config, 100)` hook inside viewer — compares JSON signature             |
| State management            | Zustand store: `current` PartConfig + `bom` BomItem[]                                    |
| Persistence                 | localStorage (no DB) via `lib/storage.ts`                                                |
| STEP generation             | Python cadquery 2.6.1 (in `/home/z/.venv`) invoked via `node:child_process.spawn`        |
| Python↔TS contract          | Python script prints one JSON status line on stdout; API route parses + streams the file |
| ZIP download                | `fflate.zipSync` after fetching each STEP via /api/generate-step                          |
| Toasts                      | `sonner` (replaced radix Toaster in layout.tsx)                                          |
| Icons                       | `lucide-react` (note: `Wheel` icon doesn't exist in v0.525 → substituted with `CircleDashed`) |

## Key Design Decisions

1. **Procedural 3D, not STEP loading** — the live preview uses THREE primitives
   built directly from the config (cylinders for wheels/discs/tubes, boxes for fork
   legs/plates, torus for brake shoe). Loading the actual STEP file for preview
   would be too slow (~5 s per part) and would require an STL loader + mesh
   simplification. Procedural geometry rebuilds in <5 ms.

2. **Unified Python generator** — instead of three separate Python scripts, a
   single `scripts/generate_step.py` dispatches on `config.type` to
   `build_caster()`, `build_rosette()`, or `build_standard()`. Each builder
   returns either a `cq.Workplane` (rosette) or `cq.Assembly` (caster, standard);
   `export_step()` handles both. The CLI prints `{"status":"ok","step_path":...}`
   on stdout and emits FutureWarnings to stderr — the API route parses only stdout.

3. **Debounced viewer updates** — the config form patches the Zustand store
   immediately (so inputs feel snappy); the viewer reads `useDebouncedValue(current, 100)`
   so the heavy 3D re-render happens at most 10×/sec while typing.

4. **Resilient ZIP flow** — BOM items are de-duplicated by JSON signature before
   STEP generation, so identical configs only generate once. Each unique config
   POSTs to /api/generate-step; results are zipped client-side with `fflate.zipSync`.

5. **Mobile-responsive** — `ResizablePanelGroup direction` switches between
   `"horizontal"` (desktop) and `"vertical"` (mobile) based on `useIsMobile()`.
   The `key={direction}` prop forces a clean remount on orientation change.

## Acceptance Criteria — All Passed

| #  | Criterion                                                            | Status | Verification                                                                       |
|----|----------------------------------------------------------------------|--------|------------------------------------------------------------------------------------|
| 1  | `bun run lint` passes with no errors                                 | ✅     | `bun run lint` → 0 errors, 0 warnings                                              |
| 2  | Dev server runs without crashing                                     | ✅     | `dev.log` shows repeated `GET / 200` and `POST /api/generate-step 200 in 5.5s`    |
| 3  | Page loads at `/` showing all 4 panels                              | ✅     | `agent-browser snapshot` shows Header + Catalog + Config + BOM cart                |
| 4  | Clicking a catalog item updates the 3D viewer                        | ✅     | Clicked `@e31` (rosette Ø122) and `@e29` (caster 12×3); canvas pixels changed      |
| 5  | Changing a param in advanced mode updates the 3D viewer (debounced)  | ✅     | Filled `tube_length = 2000`; canvas pixels at y=832 changed from dark → grey       |
| 6  | "Add to BOM" works — item appears with quantity stepper              | ✅     | Added 2 items, increased qty 3× via stepper button — snapshot shows both chips    |
| 7  | "Download STEP" calls /api/generate-step and downloads a .step file  | ✅     | `curl -X POST` returned 79 KB `application/step` starting with `ISO-10303-21;`    |
| 8  | Save config to localStorage; Load reads it back                      | ✅     | Saved "My first config" → Load button shows "1"; `localStorage` confirms entry    |
| 9  | Verified with agent-browser; screenshot taken                        | ✅     | 7 screenshots in `/home/z/my-project/screenshots/` (see paths below)             |
| 10 | Bonus: "Download all STEPs as ZIP" also works                         | ✅     | Clicked ZIP button → 2× POST 200 (5.1s + 4.7s) → toast "ZIP archive ready"       |

## Screenshots

All screenshots saved to `/home/z/my-project/screenshots/`:

- `configurator-full.png` (213 KB) — full-page initial render
- `01-initial.png` (181 KB) — initial state with 8×2 caster loaded
- `02-rosette.png` (184 KB) — after clicking Ø122 rosette preset
- `03-caster-12x3.png` (184 KB) — after clicking 12×3 swivel caster preset
- `04-advanced.png` (213 KB) — Advanced tab open with all sliders visible
- `05-bom-2items.png` (186 KB) — BOM cart with 2 chips (caster + standard)
- `06-bom-qty-increased.png` (184 KB) — Caster qty increased to 4
- `07-final-zip-success.png` — ZIP-ready success toast

## Known Limitations & TODOs

1. **Brake shoe visualisation is approximate** — uses a `torusGeometry` arc segment
   rather than the exact crescent from `casterhq_complete_brake.py`. The Python
   STEP output is still correct (uses cadquery `cut()` on annulus); only the
   browser preview is simplified.

2. **No live STEP preview** — the live preview is procedural geometry; the
   STEP file (which uses cadquery) may have slightly different details (e.g.
   rounded tread corners, filleted fork edges). Acceptable for an MVP
   configurator; could be improved by loading a low-poly STL exported by the
   Python script.

3. **No undo/redo** — patches to the store are not stacked; would need
   `zundo` middleware to add.

4. **ZIP runs serially** — each STEP is generated sequentially. Could be
   parallelised on the server side with a worker pool if BOMs grow large.

5. **localStorage quota** — saving more than ~5 MB of configs will silently
   fail. Storage writes are wrapped in try/catch to avoid crashing the UI.

6. **`lucide-react` v0.525 lacks `Wheel` icon** — substituted with
   `CircleDashed` (looks like a wheel with treads).

7. **Mobile layout** — vertical panel stack works but the 3D viewer is small;
   could add a "fullscreen viewer" toggle.

## How to Run

The dev server is auto-started on port 3000. No additional services needed —
cadquery is in the system venv at `/home/z/.venv/bin/python3`, and the API
route spawns it directly. Open the preview panel to view.
