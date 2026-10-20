import type { MicronutrientItem } from "../components/VitaminShelf";

/** Maps the /api/micronutrients/today response to the shape the Vitamin Shelf and Daily Bloom use. */
export function mapBackendMicrosToShelf(backendData: any): MicronutrientItem[] | null {
  if (!backendData || !backendData.nutrients) return null;
  const symbols: Record<string, string> = {
    calcium_mg: "Ca",
    magnesium_mg: "Mg",
    sodium_mg: "Na",
    potassium_mg: "K+",
    iron_mg: "Fe",
    copper_mg: "Cu",
    zinc_mg: "Zn",
    vita_ug: "A",
    vitc_mg: "C",
    vitd_ug: "D",
    vite_mg: "E",
    vitk_ug: "K",
    folate_ug: "B₉",
    vitb1_mg: "B₁",
    vitb2_mg: "B₂",
    vitb3_mg: "B₃",
    vitb5_mg: "B₅",
    vitb6_mg: "B₆",
    vitb7_ug: "B₇",
  };

  return backendData.nutrients
    .filter((n: any) => n.key !== "fibre_g")
    .map((n: any) => ({
      key: n.key,
      name: n.name,
      symbol: symbols[n.key] || n.name.slice(0, 2),
      group: n.category === "vitamin" ? "vitamin" : "mineral",
      amount: n.amount,
      target: n.rda || 100,
      unit: n.unit,
      pct: n.pct_rda,
      topFoods: (n.top_foods || []).map((f: any) => ({
        food_name: f.food_name,
        amount: `${f.amount} ${n.unit}`,
      })),
    }));
}
