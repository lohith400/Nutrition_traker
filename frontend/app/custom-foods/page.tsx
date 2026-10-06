"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { AlertTriangle, BookmarkPlus, Calculator, ChefHat, Pencil, Plus, RotateCcw, Sparkles, Trash2, X } from "lucide-react";
import Shell, { API } from "../components/Shell";
import { FoodOption, FoodOptionRow, MacroChips, Nutri } from "../components/FoodOptions";

const UNITS = ["g", "kg", "ml", "tsp", "tbsp", "cup", "katori", "pcs", "slice", "clove", "pinch", "handful"];

type Per100 = { calories: number; protein_g: number; carbs_g: number; fat_g: number };
type Pin = { food_code?: string; per_100g?: Per100; grams?: number };
type Ing = { id: number; name: string; quantity: string; unit: string; grams: string; pin: Pin };
type Alt = { food_code: string; food_name: string; source: string; per_100g: Per100 | null; serving_label?: string | null };
type Line = {
  index: number; name: string; status: "matched" | "estimated" | "needs_input"; source: string | null; matched_to: string | null; food_code: string | null;
  per_100g: Per100 | null; grams: number | null; grams_note: string | null; grams_estimated: boolean; nutrition: Nutri | null; alternatives: Alt[];
  note: string | null; reason: string | null; ai_checked?: boolean;
};
type Analysis = {
  status: string; error?: string; servings: number; used_ai: boolean; ingredients: Line[]; totals: Nutri; per_serving: Nutri; per_100g: Nutri | null;
  total_grams: number; macro_pct: { protein: number; carbs: number; fat: number }; unresolved: string[]; warnings: string[]; summary: string; coach_note?: string; complete: boolean;
};
type SavedLine = { name: string; quantity?: number | null; unit?: string | null; grams: number; source?: string; food_code?: string | null; per_100g: Per100; matched_to?: string | null };
type SavedFood = {
  id: number; food_code: string; name: string; servings: number; serving_label: string; total_grams: number | null; totals: Nutri; per_serving: Nutri;
  per_100g: Nutri | null; diet_tag: string | null; ingredients: SavedLine[]; notes: string; updated_at: string;
};

const SOURCE_TEXT: Record<string, string> = { dataset: "Dataset", reference: "Everyday staple", custom: "Your food", ai_estimate: "AI estimate", manual: "Your values" };

let nextId = 1;
const blank = (): Ing => ({ id: nextId++, name: "", quantity: "", unit: "g", grams: "", pin: {} });

const EXAMPLES: { name: string; servings: number; items: [string, number, string][] }[] = [
  { name: "Rava upma", servings: 2, items: [["rava", 100, "g"], ["oil", 1, "tbsp"], ["onion", 1, "pcs"], ["peanuts", 1, "handful"], ["green chilli", 2, "pcs"]] },
  { name: "Paneer bhurji", servings: 2, items: [["paneer", 200, "g"], ["onion", 1, "pcs"], ["tomato", 1, "pcs"], ["oil", 2, "tsp"], ["spice powder", 1, "tsp"]] },
  { name: "Protein oats bowl", servings: 1, items: [["oats", 50, "g"], ["milk", 200, "ml"], ["banana", 1, "pcs"], ["whey protein", 1, "pcs"], ["almonds", 10, "g"]] },
];

function MacroDonut({ pct, kcal }: { pct: { protein: number; carbs: number; fat: number }; kcal: number }) {
  const r = 46, c = 2 * Math.PI * r;
  const segs = [
    { v: pct.protein, color: "var(--green)" },
    { v: pct.carbs, color: "var(--yellow)" },
    { v: pct.fat, color: "var(--coral)" },
  ];
  let offset = 0;
  return (
    <div className="donut-wrap">
      <svg viewBox="0 0 120 120" className="donut" role="img" aria-label={`Calories from protein ${pct.protein}%, carbs ${pct.carbs}%, fat ${pct.fat}%`}>
        <circle cx="60" cy="60" r={r} fill="none" stroke="#efeae0" strokeWidth="14" />
        {segs.map((s, i) => {
          const len = (s.v / 100) * c;
          const el = <circle key={i} cx="60" cy="60" r={r} fill="none" stroke={s.color} strokeWidth="14" strokeDasharray={`${len} ${c - len}`} strokeDashoffset={-offset} transform="rotate(-90 60 60)" />;
          offset += len;
          return el;
        })}
      </svg>
      <div className="donut-center"><b>{Math.round(kcal)}</b><small>kcal / serving</small></div>
    </div>
  );
}

function LineResult({ line, onPick, onManual }: { line: Line; onPick: (code: string) => void; onManual: (v: Per100) => void }) {
  const [manual, setManual] = useState({ calories: "", protein_g: "", carbs_g: "", fat_g: "" });
  const needs = line.status === "needs_input";
  const estimated = line.status === "estimated";
  const submit = () => {
    const v = { calories: parseFloat(manual.calories), protein_g: parseFloat(manual.protein_g || "0"), carbs_g: parseFloat(manual.carbs_g || "0"), fat_g: parseFloat(manual.fat_g || "0") };
    if (Number.isFinite(v.calories) && v.calories >= 0) onManual(v);
  };
  return (
    <div className={`cf-result ${needs ? "needs" : estimated ? "est" : ""}`}>
      <div className="cf-result-top">
        <div className="cf-match">
          {line.matched_to ? <b>{line.matched_to}</b> : <b className="muted">No match yet</b>}
          {line.source && <span className={`fo-tag src-${line.source}`}>{SOURCE_TEXT[line.source] || line.source}</span>}
          {line.ai_checked && <span className="fo-tag exact">AI checked</span>}
        </div>
        <div className="cf-grams">
          {line.grams ? <><b>{line.grams_estimated ? "≈" : ""}{line.grams} g</b><small>{line.grams_note}</small></> : <small>weight needed</small>}
        </div>
        <div className="cf-kcal">{line.nutrition ? <><b>{Math.round(line.nutrition.calories)}</b><small>kcal</small></> : <small>not counted</small>}</div>
      </div>
      {line.nutrition && <MacroChips n={line.nutrition} />}
      {line.reason && <p className="cf-reason">{line.reason}</p>}
      {line.note && <p className="cf-note"><AlertTriangle size={12} /> {line.note}</p>}
      {line.alternatives.length > 1 && (
        <label className="cf-alt">
          <span>Not the right one?</span>
          <select value={line.food_code || ""} onChange={e => e.target.value && onPick(e.target.value)}>
            {!line.food_code && <option value="">Choose a match…</option>}
            {line.alternatives.map(a => (
              <option key={a.food_code} value={a.food_code}>{a.food_name} — {a.per_100g ? Math.round(a.per_100g.calories) : "?"} kcal/100 g ({SOURCE_TEXT[a.source] || a.source})</option>
            ))}
          </select>
        </label>
      )}
      {needs && !line.per_100g && (
        <div className="cf-manual">
          <small>Know the label values? Enter per 100 g:</small>
          <div>
            {([["calories", "kcal"], ["protein_g", "protein"], ["carbs_g", "carbs"], ["fat_g", "fat"]] as const).map(([k, label]) => (
              <input key={k} inputMode="decimal" placeholder={label} aria-label={label} value={manual[k]} onChange={e => setManual({ ...manual, [k]: e.target.value })} />
            ))}
            <button type="button" className="ghost-btn small" onClick={submit}>Use</button>
          </div>
        </div>
      )}
    </div>
  );
}

export default function CustomFoodsPage() {
  const [name, setName] = useState("");
  const [servings, setServings] = useState("1");
  const [serveLabel, setServeLabel] = useState("serving");
  const [notes, setNotes] = useState("");
  const [ings, setIngs] = useState<Ing[]>([blank(), blank()]);
  const [result, setResult] = useState<Analysis | null>(null);
  const [dirty, setDirty] = useState(false);
  const [busy, setBusy] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [saved, setSaved] = useState("");
  const [editingId, setEditingId] = useState<number | null>(null);
  const [foods, setFoods] = useState<SavedFood[]>([]);
  const [aiAvailable, setAiAvailable] = useState(true);
  const [confirmDelete, setConfirmDelete] = useState<number | null>(null);
  const [loggedMsg, setLoggedMsg] = useState("");
  const builderRef = useRef<HTMLDivElement>(null);

  const loadFoods = useCallback(() => {
    fetch(`${API}/api/custom-foods`, { cache: "no-store" })
      .then(r => r.json())
      .then(d => { setFoods(d.foods || []); setAiAvailable(!!d.ai_available); })
      .catch(() => setError("Backend unavailable. Start FastAPI on port 8000."));
  }, []);
  useEffect(() => { loadFoods(); }, [loadFoods]);

  const payloadIngredients = useCallback(() => ings
    .filter(i => i.name.trim())
    .map(i => ({
      name: i.name.trim(), quantity: parseFloat(i.quantity) || 0, unit: i.unit,
      grams: parseFloat(i.grams) || i.pin.grams || undefined,
      food_code: i.pin.food_code, per_100g: i.pin.per_100g,
    })), [ings]);

  const filled = ings.filter(i => i.name.trim()).length;
  const canAnalyze = filled > 0 && ings.filter(i => i.name.trim()).every(i => (parseFloat(i.quantity) > 0) || parseFloat(i.grams) > 0);

  function touch(id: number, patch: Partial<Ing>, clear: "none" | "all" | "grams" = "none") {
    setIngs(list => list.map(i => i.id !== id ? i : { ...i, ...patch, pin: clear === "all" ? {} : clear === "grams" ? { ...i.pin, grams: undefined } : i.pin }));
    setDirty(true);
  }

  async function analyze(useAi: boolean, override?: Ing[]) {
    const list = override || ings;
    const body = {
      name: name.trim() || "My recipe", servings: parseFloat(servings) || 1, use_ai: useAi,
      ingredients: list.filter(i => i.name.trim()).map(i => ({
        name: i.name.trim(), quantity: parseFloat(i.quantity) || 0, unit: i.unit, grams: parseFloat(i.grams) || i.pin.grams || undefined,
        food_code: i.pin.food_code, per_100g: i.pin.per_100g,
      })),
    };
    setBusy(true); setError(""); setSaved("");
    try {
      const res = await fetch(`${API}/api/custom-foods/analyze`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
      const data = await res.json();
      if (!res.ok) throw new Error(typeof data.detail === "string" ? data.detail : "Could not analyze.");
      if (data.status !== "ok") throw new Error(data.error || "Could not analyze.");
      setResult(data);
      setDirty(false);
      // Pin what was resolved so later tweaks are instant, deterministic and don't re-ask the AI.
      const filledList = list.filter(i => i.name.trim());
      const pins = new Map<number, Pin>();
      (data.ingredients as Line[]).forEach((l, idx) => {
        const src = filledList[idx];
        if (!src) return;
        const pin: Pin = {};
        if (l.status !== "needs_input") {
          if (l.source === "ai_estimate" || l.source === "manual") pin.per_100g = l.per_100g || undefined;
          else if (l.food_code) pin.food_code = l.food_code;
          if (l.grams && src.unit !== "g" && src.unit !== "kg" && !parseFloat(src.grams)) pin.grams = l.grams;
        }
        pins.set(src.id, pin);
      });
      setIngs(cur => cur.map(i => pins.has(i.id) ? { ...i, pin: pins.get(i.id)! } : i));
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not analyze.");
    } finally { setBusy(false); }
  }

  function pickAlt(index: number, code: string) {
    const filledList = ings.filter(i => i.name.trim());
    const target = filledList[index];
    if (!target) return;
    const next = ings.map(i => i.id === target.id ? { ...i, pin: { ...i.pin, food_code: code, per_100g: undefined } } : i);
    setIngs(next);
    analyze(false, next);
  }
  function setManual(index: number, v: Per100) {
    const target = ings.filter(i => i.name.trim())[index];
    if (!target) return;
    const next = ings.map(i => i.id === target.id ? { ...i, pin: { ...i.pin, per_100g: v, food_code: undefined } } : i);
    setIngs(next);
    analyze(false, next);
  }

  function loadExample(ex: (typeof EXAMPLES)[number]) {
    setName(ex.name); setServings(String(ex.servings)); setServeLabel("serving"); setNotes(""); setEditingId(null); setSaved(""); setResult(null);
    setIngs(ex.items.map(([n, q, u]) => ({ ...blank(), name: n, quantity: String(q), unit: u })));
    setDirty(true);
  }

  function reset() {
    setName(""); setServings("1"); setServeLabel("serving"); setNotes(""); setEditingId(null); setSaved(""); setResult(null); setError("");
    setIngs([blank(), blank()]); setDirty(false);
  }

  function edit(f: SavedFood) {
    setEditingId(f.id); setName(f.name); setServings(String(f.servings)); setServeLabel(f.serving_label); setNotes(f.notes || ""); setSaved(""); setResult(null);
    setIngs(f.ingredients.map(l => {
      const pin: Pin = { grams: l.grams };
      if (l.source === "ai_estimate" || l.source === "manual" || !l.food_code) pin.per_100g = l.per_100g;
      else pin.food_code = l.food_code;
      return { id: nextId++, name: l.name, quantity: l.quantity != null ? String(l.quantity) : String(l.grams), unit: l.quantity != null ? l.unit || "g" : "g", grams: "", pin };
    }));
    setDirty(true);
    builderRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
  }

  async function save() {
    if (!name.trim()) { setError("Give your food a name first."); return; }
    setSaving(true); setError(""); setSaved("");
    try {
      // Re-run the (deterministic, no-AI) analysis on the current inputs so what is saved always matches what is on screen.
      const ar = await fetch(`${API}/api/custom-foods/analyze`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ name: name.trim(), servings: parseFloat(servings) || 1, use_ai: false, ingredients: payloadIngredients() }) });
      const a: Analysis = await ar.json();
      const good = (a.ingredients || []).filter(l => l.status !== "needs_input");
      if (good.length === 0) throw new Error("Calculate your ingredients first so each one has a weight and nutrition values.");
      if (a.unresolved?.length && !window.confirm(`These ingredients have no nutrition values and will be left out: ${a.unresolved.join(", ")}. Save anyway?`)) { setSaving(false); return; }
      const lines = good.map(l => ({ name: l.name, quantity: (l as unknown as { quantity: number }).quantity, unit: (l as unknown as { unit: string }).unit, grams: l.grams, source: l.source, food_code: l.food_code, matched_to: l.matched_to, per_100g: l.per_100g }));
      const url = editingId ? `${API}/api/custom-foods/${editingId}` : `${API}/api/custom-foods`;
      const res = await fetch(url, { method: editingId ? "PUT" : "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ name: name.trim(), servings: parseFloat(servings) || 1, serving_label: serveLabel.trim() || "serving", notes, ingredients: lines }) });
      const data = await res.json();
      if (!res.ok) throw new Error(typeof data.detail === "string" ? data.detail : "Could not save.");
      setSaved(`Saved “${data.food.name}”. You can now log it from here, the Food log, or by name in the Coach chat.`);
      setEditingId(data.food.id);
      loadFoods();
    } catch (e) { setError(e instanceof Error ? e.message : "Could not save."); }
    finally { setSaving(false); }
  }

  async function remove(id: number) {
    const res = await fetch(`${API}/api/custom-foods/${id}`, { method: "DELETE" });
    if (res.ok) { setConfirmDelete(null); if (editingId === id) reset(); loadFoods(); }
  }

  const asOption = (f: SavedFood): FoodOption => ({
    food_code: f.food_code, food_name: f.name, source: "custom", quality: "ok", diet_tag: f.diet_tag, serving_label: f.serving_label,
    serving_grams: f.total_grams ? Math.round(f.total_grams / f.servings) : null, per_serving: f.per_serving, per_100g: f.per_100g,
  });

  const lines = result?.ingredients || [];
  const showFiltered = useMemo(() => {
    const idxByName = new Map<string, number>();
    return ings.map(i => { const k = i.name.trim(); if (!k) return -1; const n = idxByName.size; idxByName.set(`${i.id}`, n); return n; });
  }, [ings]);

  return (
    <Shell active="custom" crumb="Custom foods">
      <div className="page-wrap">
        <div className="hero-row">
          <div>
            <p className="eyebrow">YOUR OWN RECIPES</p>
            <h1>Build a food from its ingredients <span>✦</span></h1>
            <p className="subtitle">Add what went into a dish and how much. Every ingredient is matched to real nutrition data, then the totals are added up for you. Save it and log it like any other food.</p>
          </div>
        </div>

        {!aiAvailable && <div className="notice-banner"><Sparkles size={16} />AI isn&apos;t configured, so ingredients are matched from the dataset and built-in staples only. Anything unknown can be entered by hand from its label.</div>}
        {error && <div className="notice-banner warn"><AlertTriangle size={16} />{error}<button onClick={() => setError("")} aria-label="Dismiss"><X size={14} /></button></div>}

        <div className="cf-layout" ref={builderRef}>
          <div className="panel cf-builder">
            <div className="panel-head">
              <div><h3>{editingId ? "Edit custom food" : "New custom food"}</h3><p>Quantities can be grams, spoons, cups, katoris or pieces.</p></div>
              {(editingId || filled > 0 || name) && <button type="button" className="ghost-btn small" onClick={reset}><RotateCcw size={13} /> Clear</button>}
            </div>

            {!editingId && filled === 0 && !name && (
              <div className="cf-examples">
                <small>Try an example:</small>
                {EXAMPLES.map(ex => <button key={ex.name} type="button" className="chip" onClick={() => loadExample(ex)}>{ex.name}</button>)}
              </div>
            )}

            <div className="cf-meta">
              <label><span>Food name</span><input value={name} maxLength={80} onChange={e => { setName(e.target.value); setDirty(true); }} placeholder="e.g. Mom’s vegetable pulao" /></label>
              <label className="narrow"><span>Makes (servings)</span><input inputMode="decimal" value={servings} onChange={e => { setServings(e.target.value); setDirty(true); }} /></label>
              <label className="narrow"><span>One serving is a</span><input value={serveLabel} maxLength={30} onChange={e => setServeLabel(e.target.value)} placeholder="plate" /></label>
            </div>

            <div className="cf-head-row"><span>Ingredient</span><span>Qty</span><span>Unit</span><span aria-hidden="true" /></div>
            {ings.map((ing, idx) => {
              const lineIdx = showFiltered[idx];
              const line = lineIdx >= 0 && !dirty ? lines[lineIdx] : undefined;
              return (
                <div className="cf-ing" key={ing.id}>
                  <div className="cf-ing-row">
                    <input className="cf-name" value={ing.name} placeholder={idx === 0 ? "e.g. basmati rice" : "ingredient"} aria-label={`Ingredient ${idx + 1}`}
                      onChange={e => touch(ing.id, { name: e.target.value }, "all")} />
                    <input className="cf-qty" inputMode="decimal" value={ing.quantity} placeholder="0" aria-label="Quantity"
                      onChange={e => touch(ing.id, { quantity: e.target.value }, "grams")} />
                    <select className="cf-unit" value={ing.unit} aria-label="Unit" onChange={e => touch(ing.id, { unit: e.target.value }, "grams")}>
                      {UNITS.map(u => <option key={u} value={u}>{u}</option>)}
                    </select>
                    <button type="button" className="icon-mini" aria-label="Remove ingredient" onClick={() => { setIngs(l => l.length > 1 ? l.filter(i => i.id !== ing.id) : l); setDirty(true); }}><X size={14} /></button>
                  </div>
                  {line && <LineResult line={line} onPick={code => pickAlt(lineIdx, code)} onManual={v => setManual(lineIdx, v)} />}
                </div>
              );
            })}

            <div className="cf-actions">
              <button type="button" className="ghost-btn" onClick={() => setIngs(l => [...l, blank()])} disabled={ings.length >= 40}><Plus size={14} /> Add ingredient</button>
              <button type="button" className="primary-btn" disabled={!canAnalyze || busy} onClick={() => analyze(true)}>
                <Calculator size={15} /> {busy ? "Working it out…" : result && !dirty ? "Recalculate" : "Calculate nutrition"}
              </button>
            </div>
            {!canAnalyze && filled > 0 && <p className="cf-hint">Add a quantity for each ingredient to calculate.</p>}
          </div>

          <div className="cf-side">
            {result && !dirty ? (
              <div className="panel cf-total">
                <div className="panel-head"><div><h3>{name.trim() || "Your recipe"}</h3><p>{result.servings === 1 ? "1 serving" : `${result.servings} servings`} · {Math.round(result.total_grams)} g in total</p></div></div>
                <div className="cf-total-top">
                  <MacroDonut pct={result.macro_pct} kcal={result.per_serving.calories} />
                  <div className="cf-total-nums">
                    <div><b>{result.per_serving.protein_g}</b><small>g protein</small></div>
                    <div><b>{result.per_serving.carbs_g}</b><small>g carbs</small></div>
                    <div><b>{result.per_serving.fat_g}</b><small>g fat</small></div>
                    <div className="legend"><span><i style={{ background: "var(--green)" }} />Protein {result.macro_pct.protein}%</span><span><i style={{ background: "var(--yellow)" }} />Carbs {result.macro_pct.carbs}%</span><span><i style={{ background: "var(--coral)" }} />Fat {result.macro_pct.fat}%</span></div>
                  </div>
                </div>
                {result.servings !== 1 && <div className="cf-whole"><small>Whole recipe</small><MacroChips n={result.totals} /></div>}
                {result.per_100g && <div className="cf-whole"><small>Per 100 g</small><MacroChips n={result.per_100g} /></div>}
                <p className="cf-summary">{result.summary}</p>
                {result.coach_note && <p className="cf-coach"><ChefHat size={14} /> {result.coach_note}</p>}
                {result.warnings.map((w, i) => <p className="cf-note" key={i}><AlertTriangle size={12} /> {w}</p>)}
                <div className="cf-bars">
                  <small>Where the calories come from</small>
                  {[...lines].filter(l => l.nutrition).sort((a, b) => (b.nutrition!.calories) - (a.nutrition!.calories)).slice(0, 6).map(l => {
                    const share = result.totals.calories > 0 ? (l.nutrition!.calories / result.totals.calories) * 100 : 0;
                    return <div className="cf-bar" key={l.index}><span>{l.name}</span><div><i style={{ width: `${share}%` }} /></div><em>{Math.round(share)}%</em></div>;
                  })}
                </div>
                <button type="button" className="primary-btn cf-save" disabled={saving || !name.trim()} onClick={save}><BookmarkPlus size={15} /> {saving ? "Saving…" : editingId ? "Update custom food" : "Save as custom food"}</button>
                {!name.trim() && <p className="cf-hint">Name your food to save it.</p>}
                {saved && <p className="cf-saved">{saved}</p>}
              </div>
            ) : (
              <div className="panel cf-empty">
                <ChefHat size={30} />
                <h3>Your nutrition breakdown appears here</h3>
                <p>{dirty && result ? "You changed something. Press Calculate to refresh the numbers." : "List the ingredients and quantities, then press Calculate. You&apos;ll see calories, protein, carbs and fat per serving, and which ingredient drives them."}</p>
              </div>
            )}
          </div>
        </div>

        <div className="section-header"><div><h2>My custom foods</h2><p>{foods.length ? `${foods.length} saved. Log one to add it to today.` : "Nothing saved yet. Your recipes will live here."}</p></div></div>
        {loggedMsg && <div className="notice-banner ok">{loggedMsg}</div>}
        <div className="cf-library">
          {foods.map(f => (
            <div className="panel cf-card" key={f.id}>
              <div className="cf-card-head">
                <div><h4>{f.name}</h4><small>{f.servings === 1 ? "1 serving" : `${f.servings} servings`} · {f.ingredients.length} ingredients{f.diet_tag ? ` · ${f.diet_tag.replace("_", "-")}` : ""}</small></div>
                <div className="entry-actions">
                  <button type="button" className="icon-mini" aria-label={`Edit ${f.name}`} onClick={() => edit(f)}><Pencil size={14} /></button>
                  {confirmDelete === f.id
                    ? <><button type="button" className="icon-mini danger" onClick={() => remove(f.id)} aria-label="Confirm delete"><Trash2 size={14} /></button><button type="button" className="icon-mini" onClick={() => setConfirmDelete(null)} aria-label="Cancel"><X size={14} /></button></>
                    : <button type="button" className="icon-mini" aria-label={`Delete ${f.name}`} onClick={() => setConfirmDelete(f.id)}><Trash2 size={14} /></button>}
                </div>
              </div>
              <p className="cf-card-ings">{f.ingredients.map(i => i.name).join(" · ")}</p>
              <FoodOptionRow option={asOption(f)} onLogged={info => { setLoggedMsg(`Logged ${info.matched_to}: ${info.calories} kcal.`); setTimeout(() => setLoggedMsg(""), 4000); }} />
            </div>
          ))}
        </div>
      </div>
    </Shell>
  );
}
