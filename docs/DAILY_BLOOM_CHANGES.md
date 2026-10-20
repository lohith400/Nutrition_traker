# Overview page: 3D thali replaced by the "Daily Bloom"

REMOVED
- frontend/app/components/TodayPlate3D.tsx (deleted)
- 3D use inside TodayPlate.tsx, the old SVG ring, and the 3D card in /dev/3d-test

ADDED
- frontend/app/components/DailyBloom.tsx and DailyBloom.css (pure SVG, no new packages)

CHANGED
- frontend/app/components/TodayPlate.tsx: left side now renders <DailyBloom/>; new optional `micros` prop
- frontend/app/page.tsx: passes micros={mapBackendMicrosToShelf(microsData)} to TodayPlate

UNCHANGED: HydrationJar3D, VitaminShelf3D, CoachOrb, /story, backend, the right-hand macro rails.

CHECKED: `next build` passes (types + lint). Static previews of the SVG were rendered and viewed.
NOT CHECKED: live animation and hover in a real browser (none available in my sandbox).

# Update: Vitamin shelf moved to the Health page

REMOVED
- frontend/app/components/VitaminShelf3D.tsx (3D shelf deleted), its card in /dev/3d-test, and the 3D toggle inside VitaminShelf.tsx
- The vitamin shelf section on the Overview page (/)

ADDED
- frontend/app/lib/micros.ts: shared mapBackendMicrosToShelf() (moved out of page.tsx)
- /health now has two tabs: "Movement & energy" (everything that was there) and "Vitamins & minerals" (the 2D shelf).
  Open the vitamins tab directly with /health#vitamins. The Daily Bloom links to it.

CHANGED
- frontend/app/page.tsx, health/page.tsx, components/VitaminShelf.tsx, components/DailyBloom.tsx(.css)

CHECKED: `next build` passes (types + lint); /, /health and /dev/3d-test return 200; Overview HTML no longer contains the shelf; Health HTML contains both tabs.
NOT CHECKED: clicking through in a real browser.

# Update: /story redesigned (light, colourful, all features)

REPLACED
- frontend/app/story/page.tsx (old dark page) and the old StoryCanvas component

ADDED
- frontend/app/story/StoryPage.tsx: 10 chapters (hero, photo log, voice/text, 1,014 foods globe, Daily Bloom, coach, plan + pantry, move + drink, "and more", closing)
- frontend/app/story/Scenes.tsx: 3D porcelain thali with floating ingredients, and a globe of 1,014 food dots (React Three Fiber)
- frontend/app/story/story.css (light pastel chapters, every class starts with sx-)
- frontend/app/components/ChromeGate.tsx: hides Quick add / warm-up / goal burst on /story

CHANGED
- frontend/app/layout.tsx (wraps those helpers in ChromeGate), components/DailyBloom.tsx (new showShelfLink prop)

Reduced-motion and no-WebGL visitors get a flat, readable version.
CHECKED: `next build` passes; /story, /, /health return 200; all chapter headings are in the served HTML.
NOT CHECKED: the 3D scenes and animations in a real browser (no browser in my sandbox). Please open /story and report what looks off.
