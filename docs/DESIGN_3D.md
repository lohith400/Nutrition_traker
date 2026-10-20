# NutriSync Spatial 3D & Creative Engineering Specification

## 1. Creative Direction: The Cinematic Indian Kitchen
NutriSync departs from sterile Silicon Valley dashboards and generic AI glassmorphism. The spatial design language is anchored in the tactile reality of an Indian kitchen filmed with cinematic craft:
- **Lighting Model**:
  - **Key Light**: Warm tungsten key light (2700K - 3200K, soft falloff, warm amber/ochre tints).
  - **Rim Light**: Cool muted slate/forest rim light to sculpt silhouettes and reveal brushed micro-textures.
  - **Depth of Field**: Subtle tilt-shift / shallow depth of field in flagship scenes, drawing eyes to active focal planes.
  - **Camera Movement**: Slow, deliberate, weighty physical inertia (600ms - 1400ms), zero spring wobble or playful bounce.
- **Materiality**:
  - **Brushed Steel & Brass**: High-roughness anisotropic katoris and thalis with real-world reflection maps.
  - **Terracotta**: Porous, matte clay textures with warm diffuse scattering for artisanal vessels.
  - **Banana Leaf & Organics**: Fresh botanical greens with slight subsurface warmth.
  - **Micro-Atmospherics**: Faint rising steam particles, restrained and non-decorative.

## 2. Color Palette & Typography
- **Core App Palette ("The Pantry Almanac")**:
  - Paper: `#faf6ee` (warm parchment foundation)
  - Forest: `#1c3a2b` (deep evergreen primary ink & structure)
  - Terracotta: `#c85a32` (earthy protein/accent pigment)
  - Ochre: `#d48c28` (warm turmeric/carb indicator)
  - Sage: `#5b8266` (herbal fiber/accent tone)
  - Plum: `#6c4658` (mineral fat/micronutrient note)
- **Flagship Palette (`/story`)**:
  - Deep Forest Night: `#0b1a13`
  - Ochre Tungsten Light: `#d48c28`
  - Terracotta Ember: `#c85a32`
  - Warm Cream Type: `#faf6ee`
- **Typography**:
  - Editorial Headings: **Fraunces Variable** (optical sizes, editorial serif weight)
  - Data & Navigation: **DM Sans Variable** (clean, geometric humanist legibility)
  - Quantitative Readouts: **DM Mono** (strict tabular ledger numbers)
  - *Strict Rule*: Zero Inter, Roboto, or generic system sans.

## 3. Motion Principles & Tokens
- **Timing & Easing**:
  - Standard ease: `cubic-bezier(0.22, 1, 0.36, 1)` (physically weighted deceleration).
  - Duration scale: Micro-interactions (200-400ms), Page transitions (400-600ms), Spatial choreography (800-1400ms).
  - Rule: Scroll-linked beats time-linked. Never move text while it is being actively read.
- **Motion Tokens (CSS & JS)**:
  - `--ease-out-cinematic: cubic-bezier(0.22, 1, 0.36, 1);`
  - `--duration-micro: 250ms;`
  - `--duration-reveal: 800ms;`
  - `--duration-hero: 1200ms;`
- **Text Reveal System**:
  - Line-by-line editorial reveal using GSAP SplitText in pinned acts; CSS scroll-driven animations with `@supports` progressive enhancement on standard pages.

## 4. Quality & Performance Tiers
Every WebGL experience in NutriSync is driven by `useQualityTier()` returning `high | mid | low | none`.
Tier detection initializes on mount:
- `hardwareConcurrency` (>= 8: high, >= 4: mid, else low)
- `deviceMemory` (>= 8GB: high, >= 4GB: mid, else low)
- Network `navigator.connection.saveData` === true -> forces `low` or `none`
- CSS media query `(prefers-reduced-motion: reduce)` -> forces `none` (flat 2D fallback)

Dynamic adaptation uses `@react-three/drei` `<PerformanceMonitor>`: if FPS drops below threshold (e.g., 40 FPS over consecutive samples), step down one tier. **Never step up automatically during a session.**

| Capability | High Tier | Mid Tier | Low Tier | None (2D Fallback) |
| :--- | :--- | :--- | :--- | :--- |
| **Glass / Liquid** | Transmission (samples: 6, res: 512, max 2 mesh) | Cheap glass (env reflection only) | Matte translucent StandardMat | Pure CSS SVG 2D Jar |
| **Post-Processing** | Selective Bloom + subtle grain | Light Bloom only | Disabled | None |
| **GPU Particles** | Up to 30,000 | Up to 8,000 | Up to 2,000 | Pure SVG/CSS or None |
| **DPR Limit** | Cap at 1.75 | Cap at 1.5 | Cap at 1.0 | Device Native |
| **Shadows** | Soft PCF shadows | Basic directional | Unlit / baked | None |
| **Frameloop** | `"demand"` when static | `"demand"` when static | `"demand"` strictly | N/A |

## 5. Architectural Contracts
1. **Single Global WebGL Canvas**:
   - The primary application shell mounts ONE `<Canvas>` via `SpatialCanvasProvider`.
   - Small route components (Plate, Hydration Jar, Vitamin Shelf, Coach Orb) do not instantiate separate WebGL contexts. They project into DOM placeholder divs using `@react-three/drei` `<View>`.
   - A `<View>` renders only when visible in the viewport.
2. **Lazy Loading Budget**:
   - All 3D modules are dynamically imported (`next/dynamic` with `ssr: false`).
   - First-load JS for `/` must not increase by >30 kB gzipped.
3. **Cinematic Frame Scrubber (`/story`)**:
   - Dedicated standalone Canvas/WebGL canvas.
   - Decoded frame buffer sliding window of ~24 frames via `createImageBitmap`.
   - Compressed WebP/AVIF progressive prefetch.
