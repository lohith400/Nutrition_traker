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

1. **Database Schema:** Additive `ALTER TABLE food_items ADD COLUMN ...` for 44 micronutrient columns from `backend/data/anuvaad.xlsx` (calcium, magnesium, iron, zinc, potassium, sodium, copper, vitamins A, C, D, E, K, B-complex, folate in both per-100g and unit-serving amounts).
2. **ICMR-NIN 2020 RDAs:** Official Recommended Dietary Allowances for Indian adults (sex-aware: Male and Female 19-39y standard references).
3. **Macro Engine Extensions:** Add `fibre_g` and `micros` to `calculate_meal_macros()` (returning `null` for `custom:` and `ref:` foods without lab data, never `0`).
4. **Endpoints:** `GET /api/micronutrients/today` and `GET /api/micronutrients?date=YYYY-MM-DD` returning aggregated daily totals, sex-aware reference targets, percentage of RDA, status categorization (`optimal`, `moderate`, `low`, `unknown`), and top contributing foods.

---

## 5. Final Delivery Report

### 5.1 What Was Changed

#### Phase 1: Frontend ("The Pantry Almanac")
1. **Design Tokens & Theme:**
   - Created `frontend/app/tokens.css` with a warm paper palette (`--paper-bg: #fbf9f4`), tactile rule lines, risk-free SVG noise grain (`data:image/svg+xml`), and rich ingredient inks (`--sage-forest`, `--terracotta`, `--mustard`, `--olive`, `--teal`, `--plum`).
   - Integrated Google Fonts via `next/font/google` (`Fraunces` for display serif headlines, `DM Sans` for UI, and `DM Mono` for tabular data) eliminating blocking `@import` statements.
   - Refactored `frontend/app/globals.css` and `frontend/app/enhancements.css`.
2. **Signature Experiences:**
   - **Today's Plate (`frontend/app/components/TodayPlate.tsx`):** Segmented ceramic rim showing progress for protein, carbs, fat, and dietary fibre. Centered calorie counter with burned-calorie pill and logged food glyphs settling smoothly onto the plate.
   - **Hydration Jar (`frontend/app/components/HydrationJar.tsx`):** Apothecary glass carboy with animated wave liquid, ripple feedback on logging, and quick-log increments (+150ml, +250ml, +500ml, +1L).
   - **Classic Nutrition Facts (`frontend/app/components/art/NutritionFacts.tsx`):** Authentic printed nutrition facts label with heavy rule lines, % daily value, and tabular mono numerals.
   - **Vitamin & Mineral Shelf (`frontend/app/components/VitaminShelf.tsx`):** Apothecary jars for vitamins (A, C, D, E, K, Folate, B-complex) and minerals (Ca, Fe, Mg, Zn, K+, Na, Cu), with distinct states for unknown (`—`), zero, and low intake.
   - **Food Glyphs (`frontend/app/components/art/FoodGlyph.tsx`):** 20+ custom hand-authored flat SVG glyphs representing Indian dishes (`idli`, `dosa`, `roti`, `rice`, `dal`, `chai`, `egg`, `paneer`, `banana`, etc.) with intelligent keyword matching.
   - **Shell & Navigation (`frontend/app/components/Shell.tsx`):** Printed contents page with chapter numerals (`01` through `09`), active stamp badges, and a mobile bottom tab bar (`Home`, `Log`, `Coach`, `Health`, `Index`).
3. **Chat Coach & Geolocation Overhaul:**
   - Fixed location intent recognition with broadened natural phrasing regex (`dhaba`, `restaurant`, `eating out`, `high-protein food`, `bhojanalaya`, `tiffin`).
   - Replaced silent error swallowing with granular `GeolocationPositionError` handling (denied, unavailable, timeout, insecure HTTP).
   - Added 30-minute timestamped expiration for cached coordinates.
   - Added interactive `NeedLocationCard` with a one-click GPS retry button and neighborhood quick-fallback chips (`Indiranagar`, `Koramangala`, `HSR Layout`, `Whitefield`, `Connaught Place`, `Bandra`).
   - Added printed receipt styling for coach tool cards and a glowing laser scanning animation over food photo uploads.
4. **Health, Progress, and Remaining Views:**
   - Updated `BalanceScale` in `frontend/app/health/parts.tsx` with a physical tilting brass beam and wooden weights.
   - Restyled `MathPanel` worksheet and footprint progress trail.
   - Enhanced `meal-plans`, `grocery`, `reminders`, `profile`, and `AccessGate` with Almanac typography and FoodGlyphs.

#### Phase 2: Additive Backend
1. **Migrations & Schema (`backend/db_setup.py`):**
   - Added 44 micronutrient columns (`calcium_mg_100g`, `unit_serving_calcium_mg`, etc.) to `food_items` via guarded, idempotent `MIGRATIONS`.
   - Updated `load_foods()` to import all micronutrient columns from `backend/data/anuvaad.xlsx` in batched chunks.
   - Updated `refresh_food_quality()` to run chunked batch updates.
   - Seeded local `nutrisync.db` with all 1,014 Indian foods.
2. **Deterministic Math Engine (`backend/math_engine.py`):**
   - Documented `ICMR_NIN_2020_RDA` reference values for Indian adult men and women.
   - Extended `calculate_meal_macros()` to calculate exact `fibre_g` and `micros`.
   - Guaranteed that `custom:` and `ref:` foods return `null` (not `0`) for unanalyzed micronutrients.
3. **Endpoints (`backend/app.py`):**
   - Implemented `GET /api/micronutrients/today` and `GET /api/micronutrients?date=YYYY-MM-DD`.
   - Integrated live micronutrient shelf and dietary fibre into the Overview page (`frontend/app/page.tsx`).
4. **Tests & Tooling:**
   - Added automated tests in `tests/test_smoke.py` for `/api/micronutrients/today` and date queries. All 20 tests passing.

---

### 5.2 Modified & Created Files

| File | Status | Description |
|---|---|---|
| `docs/FRONTEND_UPGRADE.md` | Created | Upgrade plan, architecture, and final report |
| `frontend/app/tokens.css` | Created | Design tokens, paper ground, ingredient inks, stamp styles |
| `frontend/app/components/art/FoodGlyph.tsx` | Created | Hand-crafted SVG food glyphs and keyword matcher |
| `frontend/app/components/art/NutritionFacts.tsx` | Created | Retro printed Nutrition Facts label component |
| `frontend/app/components/TodayPlate.tsx` | Created | Signature Today's Plate ceramic hero component |
| `frontend/app/components/HydrationJar.tsx` | Created | Glass carboy hydration visualizer with animated waves |
| `frontend/app/components/VitaminShelf.tsx` | Created | Apothecary vitamin & mineral shelf |
| `frontend/app/globals.css` | Modified | Typography, tokens integration, and layout styles |
| `frontend/app/enhancements.css` | Modified | Almanac paper layout, stamps, cards, and animations |
| `frontend/app/layout.tsx` | Modified | Google Fonts (Fraunces, DM Sans, DM Mono) via `next/font` |
| `frontend/app/page.tsx` | Modified | Overview hero, TodayPlate, HydrationJar, VitaminShelf |
| `frontend/app/components/Shell.tsx` | Modified | Printed contents navigation and mobile bottom tab bar |
| `frontend/app/components/FoodOptions.tsx` | Modified | FoodGlyph badges and NutritionFacts label preview |
| `frontend/app/log/page.tsx` | Modified | Food log history with FoodGlyphs and tabular numerals |
| `frontend/app/chat/page.tsx` | Modified | Location fix, error recovery chips, photo scan animation |
| `frontend/app/health/parts.tsx` | Modified | Tilting brass BalanceScale and worksheet styling |
| `frontend/app/health/page.tsx` | Modified | Almanac header styling |
| `frontend/app/progress/parts.tsx` | Modified | Botanical sprout glyph |
| `frontend/app/meal-plans/page.tsx` | Modified | Almanac cards and FoodGlyphs |
| `frontend/app/grocery/page.tsx` | Modified | Quick-add chips with FoodGlyphs |
| `frontend/app/reminders/page.tsx` | Modified | Almanac reminder cards |
| `frontend/app/profile/page.tsx` | Modified | Biometric passport layout |
| `frontend/app/components/AccessGate.tsx` | Modified | Almanac lock card while preserving auth logic |
| `backend/db_setup.py` | Modified | Additive micronutrient migrations and batch food loader |
| `backend/math_engine.py` | Modified | ICMR-NIN 2020 RDAs, fibre, and micronutrient calculator |
| `backend/app.py` | Modified | `GET /api/micronutrients/today` and `?date=` endpoints |
| `backend/migrate_to_turso.py` | Modified | Wide-table batch chunking for Turso Hrana |
| `tests/test_smoke.py` | Modified | Automated test cases for micronutrients endpoints |

---

### 5.3 How to Run and Test

#### 1. Backend
```bash
# In Git Bash or terminal:
source venv/Scripts/activate     # on Windows Git Bash
# or .\venv\Scripts\Activate.ps1 in PowerShell

# Run smoke test suite:
pytest tests/test_smoke.py -v

# Run linter:
ruff check .

# Start FastAPI server:
uvicorn backend.app:app --reload --port 8000
```

#### 2. Frontend
```bash
cd frontend

# Verify types:
npx tsc --noEmit

# Production build:
npm run build

# Start dev server:
npm run dev
```

---

### 5.4 Root Cause of the Location Bug & Investigation

1. **Root Cause Analysis:**
   - **Narrow Intent Regex:** `NEARBY_INTENT = /(?:nearby|near me|around here|restaurants?|dhabas?|places? to eat|cafes?)/i` failed on natural conversational prompts like `"where can I get high-protein chicken"`, `"any healthy lunch spots?"`, or `"what food places are open"`.
   - **Silent Error Swallowing:** `getPosition()` had a generic `.catch(() => resolve(null))` block. Users were never notified whether geolocation failed due to user permission denial (`PERMISSION_DENIED`), timeout, missing device GPS, or an insecure HTTP origin (modern browsers only permit `navigator.geolocation` on HTTPS or `localhost`).
   - **Stale Coordinates:** Coordinates stored in `localStorage.getItem("nutrisync_coords")` lacked timestamp metadata and never expired, causing users who moved locations to query restaurants in previous cities.
   - **Passive `need_location` Card:** When the backend requested location via `need_location`, the UI rendered a static pin icon with no actionable retry or area fallback.
2. **Resolution Implemented:**
   - Broadened the detection regex to cover food queries, meal exploration, and regional dining terms.
   - Handled `GeolocationPositionError` with actionable user guidance.
   - Added a 30-minute timestamped cache TTL (`nutrisync_coords_ts`).
   - Styled the `need_location` card with an active GPS trigger button and typed fallback chips (`Indiranagar`, `Koramangala`, `HSR Layout`, `Whitefield`, `Connaught Place`, `Bandra`) that immediately re-send the query.

---

### 5.5 Verification & Known Limitations

1. **What Was Hand-Verified:**
   - Clean TypeScript typecheck (`npx tsc --noEmit` -> 0 errors).
   - Clean Next.js static production build (`npm run build` -> all 14 routes statically compiled).
   - Python linter clean (`ruff check .` -> All checks passed!).
   - Backend automated test suite passing (`pytest tests/test_smoke.py` -> 20/20 passed in 7.85s).
   - Local SQLite database `nutrisync.db` successfully populated with 1,014 foods, 44 micronutrient columns, and quality grading.
2. **What Could NOT Be Hand-Verified:**
   - **Google Fit Real OAuth:** Live sync with real Google servers requires active Google Cloud Client ID/Secret and browser OAuth consent. The Google Fit aggregation and database logic was verified via unit tests.
   - **Mobile GPS Hardware:** Physical GPS hardware location coordinates require HTTPS deployment or physical device testing; simulated via browser devtools and tested with fallback chips.

