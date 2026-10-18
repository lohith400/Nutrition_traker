# NutriSync: 60-Second Product Demo Recording Script

This script provides an exact 60-second shot list and operational checklist for recording the NutriSync walkthrough demo video and producing the repository GIF (`docs/demo/demo.gif`).

---

## 1. Recording Guidelines & Rules

- **Browser Window:** Use a clean, private/incognito browser window with bookmarks/extensions hidden.
- **Resolution & Aspect Ratio:** Record at **1080p (1920×1080)** or standard 16:9 ratio with browser zoom at 100%.
- **Zero Secret Exposure:**
  - **NEVER** expose the master `ACCESS_KEY`, API tokens, or server IP addresses.
  - Do not record browser address bar autocomplete suggestions containing keys or personal URLs.
  - Use neutral, demonstration profile values (e.g., Target: 2,000 kcal, Goal: Fat Loss / Maintenance).
- **Target Export Specifications for GIF:**
  - **Dimensions:** ~800 px wide (aspect ratio preserved).
  - **Framerate:** 10–12 fps (keeps animation fluid without file bloat).
  - **File Size:** Under **8 MB** (optimal for instant GitHub README loading).
  - **Recommended Tooling:** ScreenToGif (Windows), ffmpeg, or Gifski.
    ```bash
    # Example ffmpeg conversion from 1080p MP4 to optimized GIF:
    ffmpeg -i recording.mp4 -vf "fps=12,scale=800:-1:flags=lanczos,split[s0][s1];[s0]palettegen[p];[s1][p]paletteuse" docs/demo/demo.gif
    ```

---

## 2. 60-Second Shot List & Sequence

| Timestamp | Screen / Page | User Action & What to Type | Visual Focus / What Happens |
| :--- | :--- | :--- | :--- |
| **00:00 – 00:08** (8s) | **Home Dashboard** (`/`) | Scroll smoothly past the hero section down to the daily macro rings / thali visualization. | Macro target rings (calories, protein, carbs, fat) and remaining budgets are prominently visible in clean daylight palette. |
| **00:08 – 00:18** (10s) | **AI Coach Chat** (`/chat` or embedded modal) | Type exact sentence:<br>`2 idlis and a cup of filter coffee`<br>Hit **Send**. | Food resolver matches "Idli" (ASC144) and "Filter coffee" (ref:milk / coffee), logs them, and returns deterministic nutritional breakdown. |
| **00:18 – 00:24** (6s) | **Dashboard / Macro Rings** (`/`) | Navigate back to Dashboard. | Plate rings immediately animate and fill to reflect the newly consumed 100+ kcal, protein, carbs, and fat without a page refresh. |
| **00:24 – 00:34** (10s) | **AI Coach Streaming** (`/chat`) | Ask nutritional advice:<br>`what is a good protein for breakfast?`<br>Hit **Send**. | Real-time SSE streaming reply animates token by token, giving contextual Indian recommendations (e.g., paneer, moong sprouts, eggs, besan chilla). |
| **00:34 – 00:42** (8s) | **Meal Planner** (`/planner`) | Open the weekly or daily Indian meal plan. | View curated breakfast, lunch, and dinner cards with regional preparation details and macro compliance tags. |
| **00:42 – 00:48** (6s) | **Smart Grocery List** (`/grocery`) | Click **View Grocery List** from the meal plan. | Aggregated ingredients list displays required raw weights (e.g., 250g toor dal, 500g atta, 200g paneer) grouped by category. |
| **00:48 – 00:54** (6s) | **Water Carboy Tracker** (`/`) | Click the **+250 ml** quick-log water increment button twice. | Visual water carboy fluid level rises smoothly, updating logged hydration toward the daily target (e.g., 2.5 L). |
| **00:54 – 01:00** (6s) | **Progress & Trends** (`/progress`) | Navigate to Progress page. | Display 5-week consistency heatmap, weight trend graph, and calorie deficit pace chart. End on a crisp view of the activity grid. |

---

## 3. Post-Recording Verification Checklist

1. [ ] Check that no sensitive credentials, API keys, or personal cookies appeared.
2. [ ] Validate that all typed food names match verified database items ("Idli", "filter coffee").
3. [ ] Verify that streaming text rendered smoothly without network stalls or errors.
4. [ ] Export GIF to `docs/demo/demo.gif` (confirm size is < 8 MB and width is 800 px).
5. [ ] Uncomment the demo slot in `README.md`.
