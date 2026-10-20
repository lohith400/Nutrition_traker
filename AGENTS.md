# Workspace Rules: NutriSync Spatial 3D & Creative Engineering

These rules apply to all AI agents operating within this repository.

## 0. Ground Rules (Non-Negotiable)
1. **Branch Hygiene**: Never work on or commit directly to `main`. Before EVERY commit, run `git branch --show-current` and confirm it is NOT `main`. All work lives on `feat/spatial-3d-upgrade`.
2. **Never Merge/Push to Main**: NEVER merge into main, NEVER push to main, NEVER force-push, NEVER delete branches. Pushes to main auto-deploy to production. Push only the feature branch. When all phases are approved, open a DRAFT pull request into main and leave it unmerged.
3. **Protected Paths**: Do not touch `/backend`, `/docker`, `/.github/workflows`, `render.yaml`, `docker-compose*` files, `public/sw.js` precache lists, `manifest.ts`, or the `x-access-key` / `AccessGate` behavior. Do not commit secrets, `.env*`, `node_modules`, or `.next`.
4. **Original Work Only**: Do not copy any brand's images, copy, code or trademarks. Do not hotlink external assets. The app is a PWA; every asset must ship locally.
5. **Strict Dependency Policy**: Add no dependency beyond Section 4 of the project brief without explicit approval. Verify each pinned version exists on npm and was published at least 14 days ago. Report any mismatch instead of guessing.
6. **No Fabricated Facts**: Never invent product facts, statistics, users, or testimonials. Use only verified facts from the codebase and database.
7. **Phased Execution**: Work one phase at a time and stop at the end of each phase for user review and approval.

---

## 2. Art Direction & Visual Aesthetics
- **Concept**: An Indian kitchen lit like a product film. Warm tungsten key light, cool rim light, shallow depth of field, slow weighty camera moves, brushed steel, brass, terracotta, banana leaf, steam. Typography leads; imagery supports.
- **Palette**: App pages keep the "Pantry Almanac" identity: Paper `#faf6ee`, Forest `#1c3a2b`, Terracotta `#c85a32`, Ochre `#d48c28`, Sage `#5b8266`, Plum `#6c4658`; Fraunces (serif headings) and DM Sans. `/story` uses the night side of the same palette: deep forest `#0b1a13`, ochre and terracotta light, cream type.
- **Motion Rules**: One idea per screen. Slow (600 to 1400 ms), eased with `cubic-bezier(0.22, 1, 0.36, 1)`. No bounce, no spring wobble, no looping decoration. Scroll-linked beats time-linked. Never move text while it is being read. Headline reveals by line using GSAP SplitText.
- **FORBIDDEN**: Purple/blue gradient backgrounds, neon glow, glassmorphism on everything, floating blobs, emoji as icons, icon-in-circle feature grids, three-equal-cards heroes, centered-everything layouts, Inter/Roboto, stock-photo look, particle confetti with no meaning, any 3D that does not carry information or emotion.
- **Purposeful 3D**: Every 3D element must earn its place by showing real data or creating a real emotional moment. Numbers stay as real HTML text next to any 3D so everything remains readable, searchable, and accessible.

---

## 6. Performance & Quality Tiers
All 3D components must respect `useQualityTier()` returning `high | mid | low | none`.
Initialize from `hardwareConcurrency`, `deviceMemory`, screen size, `prefers-reduced-motion`, and `Save-Data`, adapting dynamically with drei `<PerformanceMonitor>` (stepping down only).
- **high**: Transmission glass (samples 6, resolution 512, at most 2 transmissive objects visible, merged where possible), bloom, up to 30k GPU particles, DPR up to 1.75.
- **mid**: No transmission (cheap glass with environment reflections), bloom only, up to 8k particles, DPR up to 1.5.
- **low**: Simple materials, no post-processing, up to 2k particles, DPR 1.
- **none**: Render flat 2D version (fallback).
- **Budgets**: First-load JS for `/` must not grow by more than 30 kB gzipped; 3D chunk loads on demand only via `next/dynamic` (`ssr: false`). `/story`: poster paints first (LCP under 2.5s on throttled 4G), progressive frame loading, mobile payload before first interaction under 1.5 MB.
- **Frame Sequence Memory Rule**: Never keep all frames decoded. Use `createImageBitmap` with a sliding window of ~24 decoded frames around the current index; preload the rest as compressed files at low priority.
