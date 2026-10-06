# NutriSync Frontend Upgrade: The Pantry Almanac

**Document Version:** 1.0  
**Status:** In Progress (Branch: `frontend-upgradation`)  
**Target Audience:** Gen Z health & nutrition trackers (22-23yo) seeking authentic, craft-made, memorable daily nutrition tracking.

---

## 1. Design Direction: "The Pantry Almanac"

NutriSync is being elevated from a generic, static dashboard to a warm, distinctive, tactile food almanac. The visual aesthetic takes inspiration from classic botanical references, printed nutrition labels, apothecary jars, and heritage Indian pantry staples.

### 1.1 Color Tokens & Material System
- **Paper & Ground:**
  - `--paper-bg`: `#fbf9f4` (warm antique newsprint/linen)
  - `--paper-surface`: `#ffffff` (crisp matte stock)
  - `--paper-card`: `rgba(255, 255, 255, 0.88)`
  - `--paper-dim`: `#f4efe6` (sunned Manila)
  - `--paper-rule`: `#e5dfd3` (clean printed rule line)
  - `--paper-rule-strong`: `#cfc7b8` (double rule / stamp boundary)
- **Ink Palette:**
  - `--ink`: `#1c1b18` (warm charcoal letterpress black)
  - `--ink-muted`: `#5a574f` (medium book print)
  - `--ink-soft`: `#888479` (eyebrows & captions)
  - `--ink-faint`: `#b5b0a4` (dividers)
- **Brand Continuity & Ingredient Inks:**
  - `--sage-forest`: `#284236` (deep evergreen letterpress)
  - `--sage-leaf`: `#3e5d4e` (fresh botanical sage)
  - `--sage-tint`: `#eaf1ed` (pale sage ground)
  - `--terracotta`: `#b84e37` (rich clay stamp)
  - `--coral`: `#d96b52` (warm tomato accent)
  - `--tomato`: `#c84b31` (calories/activity)
  - `--mustard`: `#d49b35` (carbs & grains)
  - `--olive`: `#606c38` (fats & oils)
  - `--teal`: `#3a7d6e` (water & hydration)
  - `--plum`: `#6e445b` (micronutrients & vitamins)

### 1.2 Typography & Fonts
- **Display Serif:** `Fraunces` via `next/font/google` (`--font-serif`) — characterful, soft optical sizing, editorial warmth.
- **UI Sans:** `DM Sans` via `next/font/google` (`--font-sans`) — legibility and rhythm.
- **Data / Tabular:** `DM Mono` via `next/font/google` (`--font-mono`) — Nutrition Facts, macros, counts, timestamps.

---

## 2. Component Architecture & File Map

### 2.1 CSS Layering
- `frontend/app/tokens.css`: Core design system variables, light grain background overlay, print stamp styles, double-rule borders, receipt serrations.
- `frontend/app/globals.css`: Streamlined global styles, layout shells, cards, buttons, responsive breakpoints.
- `frontend/app/enhancements.css`: Dedicated micro-interactions, page reveals, stamp animations, focus rings.

### 2.2 Art & Glyphs (`frontend/app/components/art/`)
- `FoodGlyph.tsx`: Flat hand-authored SVG food illustrations matching Indian & everyday foods:
  - Staples: `idli`, `dosa`, `roti`, `rice`, `dal`, `chai`, `egg`, `paneer`, `banana`, `citrus`, `leaf`, `grain`, `wheat`, `oil_drop`, `plate`, `bowl`, `flame`, `footprint`, `sprout`.
- `NutritionFacts.tsx`: FDA/ICMR-style classic printed nutrition label for items and daily totals.
- `ApothecaryJar.tsx`: Retro labelled glass jars for micronutrients with liquid fill level and stamp labels.

### 2.3 Signature Experiences
- **Today's Plate (`TodayPlate.tsx`):** Circular plate with 4-quadrant segmented rim representing protein, carbs, fat, and fibre progress. Numerical center counter with calorie deficit/surplus indicator. Logged meal glyphs settling onto the plate.
- **Hydration Jar (`HydrationJar.tsx`):** Apothecary glass carboy with gentle CSS wave fill, current level %, ripple wave upon logging +150ml/+250ml/+500ml/+1L.
- **Vitamin & Mineral Shelf (`VitaminShelf.tsx`):** Apothecary shelf of vitamins (A, B-complex, C, D, E, K, Folate) and minerals (Iron, Calcium, Magnesium, Zinc, Potassium) displaying percentage of ICMR-NIN daily targets.
- **Health Balance Scale & Worksheets:** Tilting brass balance scale for intake vs expenditure, footprint trail step progress, and printable worksheet styling for BMR/TDEE math.
- **Coach Chat Studio:** Printed conversation slips, scanning laser line over food photo uploads, calm waveform/orb for voice mode, and comprehensive location recovery.

---

## 3. Location Bug Investigation & Resolution

### Symptoms Identified:
1. Narrow regular expression `NEARBY_INTENT` failed to catch common queries ("dhaba", "bhojanalaya", "where can I eat protein", "tiffin centers").
2. `getPosition()` swallowed geolocation error codes (`PERMISSION_DENIED`, `POSITION_UNAVAILABLE`, `TIMEOUT`, insecure HTTP context).
3. `localStorage` coordinates had no timestamp or expiration.
4. The `need_location` tool card offered only static text.

### Frontend Solution:
- Broaden natural phrasing detection.
- Catch specific error codes and display helpful messages (e.g., how to re-enable location or use insecure localhost notice).
- Add 30-minute expiration to cached coordinates.
- On `need_location` card, render a "Use Current Location" one-click button and area chips ("Indiranagar", "Koramangala", "HSR Layout", "Connaught Place", or custom text input) to instantly retry the message.

---

## 4. Phase 2: Additive Backend (Micronutrients & Fibre)

1. **Database Schema:** Additive `ALTER TABLE food_items ADD COLUMN ...` for micronutrient columns from `backend/data/anuvaad.xlsx` (calcium, magnesium, iron, zinc, potassium, vitamins A, C, D, E, K, B-complex, folate).
2. **ICMR-NIN 2020 RDAs:** Official Recommended Dietary Allowances for Indian adults (sex-aware).
3. **Macro Engine Extensions:** Add `fibre_g` and `micros` to `calculate_meal_macros()` (keeping old keys intact).
4. **Endpoints:** `GET /api/micronutrients/today` and `GET /api/micronutrients?date=YYYY-MM-DD`.
