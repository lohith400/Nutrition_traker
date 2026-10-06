"use client";

import { useMemo, useState } from "react";
import { Check, ChevronDown, Minus, Plus, Sparkles, Utensils } from "lucide-react";
import { API } from "./Shell";
import { FoodGlyph } from "./art/FoodGlyph";
import { NutritionFacts } from "./art/NutritionFacts";

export type Nutri = { calories: number; protein_g: number; carbs_g: number; fat_g: number };
export type FoodOption = {
  food_code: string;
  food_name: string;
  source: "dataset" | "reference" | "custom";
  quality?: string | null;
  quality_note?: string | null;
  diet_tag?: string | null;
  serving_label?: string | null;
  serving_grams?: number | null;
  per_serving: Nutri | null;
  per_100g: Nutri | null;
  exact?: boolean;
  logged_before?: boolean;
};
export type Meal = "breakfast" | "lunch" | "dinner" | "snack";

export const MEALS: Meal[] = ["breakfast", "lunch", "dinner", "snack"];

export function mealForNow(): Meal {
  const h = new Date().getHours();
  if (h < 11) return "breakfast";
  if (h < 16) return "lunch";
  if (h < 18) return "snack";
  return "dinner";
}

const SOURCE_LABEL: Record<string, string> = { dataset: "Dataset", reference: "Everyday staple", custom: "Your food" };

function scale(n: Nutri, f: number): Nutri {
  return { calories: n.calories * f, protein_g: n.protein_g * f, carbs_g: n.carbs_g * f, fat_g: n.fat_g * f };
}

export function MacroChips({ n, big = false }: { n: Nutri; big?: boolean }) {
  return (
    <div className={`fo-macros ${big ? "big" : ""}`}>
      <span><b>{Math.round(n.calories)}</b> kcal</span>
      <span><b>{n.protein_g.toFixed(1)}</b>g protein</span>
      <span><b>{n.carbs_g.toFixed(1)}</b>g carbs</span>
      <span><b>{n.fat_g.toFixed(1)}</b>g fat</span>
    </div>
  );
}

export type LoggedInfo = { log_id: number; matched_to: string; calories: number; protein_g: number; meal_type: string };

type RowProps = {
  option: FoodOption;
  defaultQty?: number;
  defaultUnit?: "serving" | "grams";
  defaultMeal?: Meal;
  date?: string;
  fromChat?: boolean;
  onLogged?: (info: LoggedInfo) => void;
  /** Open the portion picker straight away (used when there is a single exact match). */
  startOpen?: boolean;
};

export function FoodOptionRow({ option, defaultQty = 1, defaultUnit = "serving", defaultMeal, date, fromChat, onLogged, startOpen }: RowProps) {
  const hasServing = !!option.per_serving;
  const hasGrams = !!option.per_100g;
  const initialUnit: "serving" | "grams" = defaultUnit === "serving" && !hasServing ? "grams" : defaultUnit === "grams" && !hasGrams ? "serving" : defaultUnit;
  const [open, setOpen] = useState(!!startOpen);
  const [unit, setUnit] = useState<"serving" | "grams">(initialUnit);
  const [qty, setQty] = useState<string>(String(initialUnit === "grams" && defaultUnit === "serving" ? option.serving_grams || 100 : defaultQty));
  const [meal, setMeal] = useState<Meal>(defaultMeal || mealForNow());
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [done, setDone] = useState<LoggedInfo | null>(null);

  const q = parseFloat(qty);
  const valid = Number.isFinite(q) && q > 0 && q <= 2000;
  const preview = useMemo(() => {
    if (!valid) return null;
    if (unit === "serving" && option.per_serving) return scale(option.per_serving, q);
    if (unit === "grams" && option.per_100g) return scale(option.per_100g, q / 100);
    return null;
  }, [valid, q, unit, option]);
  const headline = option.per_serving || option.per_100g;
  const headlineLabel = option.per_serving ? `per ${option.serving_label || "serving"}` : "per 100 g";

  function switchUnit(next: "serving" | "grams") {
    if (next === unit) return;
    setUnit(next);
    setQty(next === "grams" ? String(Math.round(option.serving_grams || 100)) : "1");
  }
  function step(dir: 1 | -1) {
    const inc = unit === "grams" ? 10 : 0.5;
    const next = Math.max(unit === "grams" ? 5 : 0.5, (valid ? q : 1) + dir * inc);
    setQty(String(Math.round(next * 100) / 100));
  }

  async function log() {
    if (!valid || busy) return;
    setBusy(true);
    setError("");
    try {
      const res = await fetch(`${API}/api/log-food-code`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ food_code: option.food_code, quantity: q, unit, meal_type: meal, date: date || null, from_chat: !!fromChat }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(typeof data.detail === "string" ? data.detail : "Could not log this food.");
      const info: LoggedInfo = { log_id: data.log_id, matched_to: data.matched_to, calories: data.calories, protein_g: data.protein_g, meal_type: data.meal_type };
      setDone(info);
      onLogged?.(info);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not log this food.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className={`fo-row ${open ? "open" : ""} ${done ? "done" : ""}`}>
      <button type="button" className="fo-head" onClick={() => !done && setOpen(o => !o)} aria-expanded={open}>
        <div style={{ display: "flex", alignItems: "center", gap: "10px", flex: 1, minWidth: 0 }}>
          <FoodGlyph name={option.food_name} size={28} />
          <div className="fo-title">
            <b>{option.food_name}</b>
            <div className="fo-tags">
              <span className={`fo-tag src-${option.source}`}>{SOURCE_LABEL[option.source]}</span>
              {option.exact && <span className="fo-tag exact">Exact name</span>}
              {option.logged_before && <span className="fo-tag fav">You&apos;ve had this</span>}
              {option.quality === "unreliable" && <span className="fo-tag warn">Rough data</span>}
            </div>
          </div>
        </div>
        {headline && (
          <div className="fo-headline">
            <b>{Math.round(headline.calories)}</b><small>kcal {headlineLabel}</small>
            <em>{headline.protein_g.toFixed(1)}g protein</em>
          </div>
        )}
        {done ? <Check size={18} className="fo-check" /> : <ChevronDown size={16} className="fo-chev" />}
      </button>

      {done ? (
        <div className="fo-done"><Check size={14} /> Logged as {done.meal_type}: <b>{done.calories} kcal</b>, {done.protein_g} g protein</div>
      ) : open ? (
        <div className="fo-body">
          {option.per_serving && option.per_100g && (
            <div className="fo-both">
              <div><small>Per {option.serving_label || "serving"}{option.serving_grams ? ` (~${Math.round(option.serving_grams)} g)` : ""}</small><MacroChips n={option.per_serving} /></div>
              <div><small>Per 100 g</small><MacroChips n={option.per_100g} /></div>
            </div>
          )}
          {option.quality_note && <p className="fo-note">{option.quality_note}</p>}
          <div className="fo-controls">
            <div className="fo-seg" role="group" aria-label="Unit">
              <button type="button" className={unit === "serving" ? "on" : ""} disabled={!hasServing} onClick={() => switchUnit("serving")}>
                {option.serving_label ? option.serving_label.split("(")[0].trim().slice(0, 18) : "Serving"}
              </button>
              <button type="button" className={unit === "grams" ? "on" : ""} disabled={!hasGrams} onClick={() => switchUnit("grams")}>Grams</button>
            </div>
            <div className="fo-step">
              <button type="button" onClick={() => step(-1)} aria-label="Less"><Minus size={14} /></button>
              <input inputMode="decimal" value={qty} onChange={e => setQty(e.target.value)} aria-label="Quantity" />
              <button type="button" onClick={() => step(1)} aria-label="More"><Plus size={14} /></button>
            </div>
            <select value={meal} onChange={e => setMeal(e.target.value as Meal)} aria-label="Meal">
              {MEALS.map(m => <option key={m} value={m}>{m[0].toUpperCase() + m.slice(1)}</option>)}
            </select>
          </div>
          {preview && <MacroChips n={preview} big />}

          {/* Classic Printed Nutrition Facts Label */}
          <details className="fo-more" style={{ marginTop: "12px", marginBottom: "8px" }}>
            <summary className="almanac-mono" style={{ cursor: "pointer", fontSize: "11px", color: "var(--sage-leaf)", fontWeight: 600 }}>
              View Printed Nutrition Facts Label ▾
            </summary>
            <div style={{ marginTop: "8px" }}>
              <NutritionFacts
                title={option.food_name}
                subtitle={unit === "serving" ? `Serving (${qty} portion)` : `${qty} grams`}
                calories={preview ? preview.calories : (headline?.calories || 0)}
                protein_g={preview ? preview.protein_g : (headline?.protein_g || 0)}
                carbs_g={preview ? preview.carbs_g : (headline?.carbs_g || 0)}
                fat_g={preview ? preview.fat_g : (headline?.fat_g || 0)}
                compact
              />
            </div>
          </details>

          {error && <p className="fo-error">{error}</p>}
          <button type="button" className="primary-btn fo-log" disabled={!valid || busy} onClick={log}>
            <Utensils size={14} /> {busy ? "Logging…" : date ? `Log for ${date}` : "Log this one"}
          </button>
        </div>
      ) : null}
    </div>
  );
}

type ListProps = Omit<RowProps, "option" | "startOpen"> & {
  options: FoodOption[];
  title?: string;
  hiddenByDiet?: number;
};

export function FoodOptionList({ options, title, hiddenByDiet, ...rest }: ListProps) {
  return (
    <div className="fo-list">
      {title && <div className="fo-title-bar"><Sparkles size={14} /> {title}</div>}
      {options.map(o => <FoodOptionRow key={o.food_code} option={o} {...rest} />)}
      {!!hiddenByDiet && hiddenByDiet > 0 && (
        <p className="fo-hidden">{hiddenByDiet} more related food{hiddenByDiet === 1 ? " is" : "s are"} hidden because {hiddenByDiet === 1 ? "it doesn't" : "they don't"} fit your diet.</p>
      )}
    </div>
  );
}
