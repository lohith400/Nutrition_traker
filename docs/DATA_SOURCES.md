# Data Sources and Attribution

NutriSync relies on nutritional composition databases and reference standards tailored specifically to Indian dietary patterns.

---

## 1. Indian Food Composition Tables (IFCT) & Anuvaad Dataset

- **Primary Source:** Indian Food Composition Tables (IFCT), published by the **National Institute of Nutrition (ICMR-NIN)**, Hyderabad, India, and curated in the open-source **Anuvaad** project.
- **Coverage:** 1,014 authentic Indian dishes, staples, curries, breads, sweets, and regional preparations.
- **Nutritional Fields:** 
  - Macronutrients: Energy (kcal), Protein (g), Carbohydrates (g), Total Fat (g), Dietary Fibre (g) across both per-100g and unit-serving measures.
  - Micronutrients: 44 vitamins and minerals (Calcium, Magnesium, Iron, Zinc, Potassium, Sodium, Copper, Vitamins A, C, D, E, K, B-complex, Folate/B9).
- **Location in Repository:** `backend/data/anuvaad.xlsx` (seeded into the database via `backend/db_setup.py`).
- **License of the underlying dataset:** TODO, verify before redistribution.

---

## 2. Data Quality & Integrity Gate

Real-world nutritional datasets often contain recipe aggregations or measurement inconsistencies. NutriSync applies a deterministic data-quality gate (`backend/food_quality.py`) before logging or displaying nutritional values:

- **Quality Grades:**
  - `ok`: Both per-100g and per-serving numbers pass sanity checks and Atwater macro tolerances.
  - `grams_only`: Per-100g data is verified, but serving weight is missing or ambiguous; logging defaults to weight in grams.
  - `unreliable`: Macro numbers violate Atwater tolerance or report unrealistic densities (e.g., fat > 50g/100g on non-fats); flagged with warnings and excluded from auto-suggestions.
- **Atwater Tolerance Check:** Verifies that stated kcal aligns with `|4 × Protein + 4 × Carbs + 9 × Fat - Stated kcal| / Stated kcal ≤ 0.35`.

---

## 3. Everyday Culinary Staples Reference

To account for everyday raw ingredients and kitchen staples that are often absent or inconsistently classified in composite dish tables, NutriSync includes a built-in reference table (`backend/ingredient_reference.py`):

- Everyday cooking mediums: mustard oil, ghee, coconut oil, sesame oil, butter.
- Raw pantry grains and pulses: raw sona masoori rice, basmati, toor dal, moong dal, chana dal, urad dal, rava/sooji, atta, poha.
- Common produce and seasonings: onions, tomatoes, ginger-garlic paste, curry leaves, green chilies, cilantro.

---

## 4. Dietary Guidelines & Nutrient Standards

- **Reference Framework:** Dietary Guidelines for Indians, published by the Indian Council of Medical Research (ICMR) & National Institute of Nutrition (NIN).
- **Recommended Dietary Allowances (RDA):** Macro ratios and daily micronutrient targets correspond to ICMR-NIN 2020 RDA benchmarks for Indian adults.

---

## 5. Separation of Licenses

The source code, architecture, algorithms, and web interface of NutriSync are licensed under the **MIT License** (see [LICENSE](../LICENSE)). The underlying nutritional composition data remains attributed to ICMR-NIN and the Anuvaad dataset contributors.
