"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { Flame, MessageCircle, Plus, ShoppingCart, Sparkles, Target, Trash2 } from "lucide-react";
import Shell, { API } from "../components/Shell";
import { FoodGlyph } from "../components/art/FoodGlyph";

type Item = { id: number; name: string; quantity: number; unit: string };
type Nutri = { calories: number; protein_g: number; carbs_g: number; fat_g: number };
type NutriRow = { id: number; matched_to: string | null; source: string | null; nutrition: Nutri | null; grams: number | null };
type Pantry = { items: NutriRow[]; totals: Nutri; counted: number; total_items: number };

const STAPLES: [string, number, string][] = [["Rice", 1, "kg"], ["Atta", 1, "kg"], ["Toor dal", 500, "g"], ["Milk", 1, "l"], ["Egg", 12, "pcs"], ["Paneer", 200, "g"], ["Onion", 1, "kg"], ["Tomato", 500, "g"], ["Potato", 1, "kg"], ["Oil", 1, "l"], ["Curd", 500, "g"], ["Banana", 6, "pcs"]];

const DEFAULT_UNITS = ["kg", "g", "l", "ml", "pcs", "pack", "dozen", "bunch"];

function tidy(n: number): string {
  return String(Math.round(n * 1000) / 1000);
}

export default function GroceryPage() {
  const [items, setItems] = useState<Item[]>([]);
  const [units, setUnits] = useState<string[]>(DEFAULT_UNITS);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [name, setName] = useState("");
  const [quantity, setQuantity] = useState("1");
  const [unit, setUnit] = useState("kg");
  const [adding, setAdding] = useState(false);
  const [drafts, setDrafts] = useState<Record<number, string>>({});
  const [pantry, setPantry] = useState<Pantry | null>(null);
  const [profile, setProfile] = useState<{ target_calories?: number; target_protein_g?: number } | null>(null);

  const loadPantry = useCallback(() => {
    fetch(`${API}/api/grocery/nutrition`, { cache: "no-store" }).then(r => r.json()).then(setPantry).catch(() => {});
  }, []);

  const load = useCallback(() => {
    fetch(`${API}/api/grocery`, { cache: "no-store" })
      .then(r => r.json())
      .then(data => {
        setItems(data.items || []);
        if (data.units) setUnits(data.units);
        setError("");
        loadPantry();
      })
      .catch(() => setError("Backend unavailable. Start FastAPI on port 8000."))
      .finally(() => setLoading(false));
  }, [loadPantry]);

  useEffect(() => { fetch(`${API}/api/profile`).then(r => r.json()).then(setProfile).catch(() => {}); }, []);

  useEffect(() => {
    load();
    // Items added through the coach chat appear as soon as you come back to this tab.
    const onVisible = () => { if (document.visibilityState === "visible") load(); };
    document.addEventListener("visibilitychange", onVisible);
    window.addEventListener("focus", onVisible);
    return () => {
      document.removeEventListener("visibilitychange", onVisible);
      window.removeEventListener("focus", onVisible);
    };
  }, [load]);

  async function call(url: string, init: RequestInit): Promise<boolean> {
    try {
      const response = await fetch(url, { ...init, headers: { "Content-Type": "application/json" } });
      const data = await response.json();
      if (!response.ok) throw new Error(typeof data.detail === "string" ? data.detail : "Something went wrong.");
      if (data.items) { setItems(data.items); loadPantry(); }
      setError("");
      return true;
    } catch (err) {
      setError(err instanceof Error ? err.message : "Backend unavailable. Start FastAPI on port 8000.");
      return false;
    }
  }

  async function addItem(event: React.FormEvent) {
    event.preventDefault();
    const q = Number(quantity);
    if (!name.trim()) { setError("Enter an ingredient name."); return; }
    if (!(q > 0)) { setError("Quantity must be more than 0."); return; }
    setAdding(true);
    const ok = await call(`${API}/api/grocery`, { method: "POST", body: JSON.stringify({ name: name.trim(), quantity: q, unit }) });
    setAdding(false);
    if (ok) { setName(""); setQuantity("1"); }
  }

  async function saveQuantity(item: Item) {
    const raw = drafts[item.id];
    if (raw === undefined) return;
    const q = Number(raw);
    setDrafts(current => { const next = { ...current }; delete next[item.id]; return next; });
    if (!(q >= 0) || q === item.quantity) return;
    await call(`${API}/api/grocery/${item.id}`, { method: "PATCH", body: JSON.stringify({ quantity: q }) });
  }

  return (
    <Shell active="grocery" crumb="Grocery">
      <div className="page-wrap">
        <div className="hero-row">
          <div>
            <div className="almanac-eyebrow">
              <span>PANTRY INVENTORY</span>
              <span className="dot-sep">·</span>
              <span>KITCHEN STAPLES</span>
            </div>
            <h1 className="almanac-serif">Grocery &amp; Pantry <span>✦</span></h1>
            <p className="subtitle">Keep track of the ingredients you have at home. When you ask the coach to suggest a meal from your grocery list, it cooks only from what&apos;s here.</p>
          </div>
          <Link className="primary-btn" href="/chat"><MessageCircle size={16} /> Ask the coach</Link>
        </div>

        {error && <div className="notice-banner"><Sparkles size={16} />{error}<button onClick={() => setError("")} aria-label="Dismiss">×</button></div>}

        <form className="panel grocery-add" onSubmit={addItem}>
          <label className="grocery-field grow">
            <span>Ingredient</span>
            <input value={name} onChange={e => setName(e.target.value)} placeholder="e.g. Rice, Tomato, Paneer" maxLength={80} />
          </label>
          <label className="grocery-field">
            <span>Quantity</span>
            <input type="number" min="0" step="any" value={quantity} onChange={e => setQuantity(e.target.value)} />
          </label>
          <label className="grocery-field">
            <span>Unit</span>
            <select value={unit} onChange={e => setUnit(e.target.value)}>
              {units.map(u => <option key={u} value={u}>{u}</option>)}
            </select>
          </label>
          <button className="primary-btn" type="submit" disabled={adding}><Plus size={16} /> {adding ? "Adding" : "Add"}</button>
        </form>

        <div className="staple-chips" aria-label="Quick add common items">
          <small className="almanac-eyebrow">Quick add:</small>
          {STAPLES.map(([n, q, u]) => (
            <button key={n} type="button" className="chip" style={{ display: "inline-flex", alignItems: "center", gap: "6px" }} onClick={() => { setName(n); setQuantity(String(q)); setUnit(units.includes(u) ? u : units[0]); document.querySelector<HTMLInputElement>(".grocery-add input")?.focus(); }}>
              <FoodGlyph name={n} size={15} />
              <span>{n}</span>
            </button>
          ))}
        </div>

        {pantry && pantry.counted > 0 && (
          <section className="panel pantry-card">
            <div className="panel-head"><div><h3>What your pantry holds</h3><p>Nutrition of the {pantry.counted} item{pantry.counted === 1 ? "" : "s"} measured by weight or volume, using raw values for staples.</p></div></div>
            <div className="pantry-stats">
              <div><Flame size={16} /><b>{pantry.totals.calories.toLocaleString()}</b><small>kcal in stock</small></div>
              <div><Target size={16} /><b>{pantry.totals.protein_g.toLocaleString()} g</b><small>protein in stock</small></div>
              {profile?.target_calories ? <div><ShoppingCart size={16} /><b>{(pantry.totals.calories / profile.target_calories).toFixed(1)}</b><small>days of your calorie target</small></div> : null}
              {profile?.target_protein_g ? <div><Target size={16} /><b>{(pantry.totals.protein_g / profile.target_protein_g).toFixed(1)}</b><small>days of your protein target</small></div> : null}
            </div>
            {pantry.counted < pantry.total_items && <p className="pantry-note">{pantry.total_items - pantry.counted} item{pantry.total_items - pantry.counted === 1 ? "" : "s"} couldn&apos;t be counted (no nutrition match or no weight, e.g. “pack”).</p>}
          </section>
        )}

        <section className="panel grocery-list">
          <div className="panel-head">
            <div><h3>At home</h3><p>{items.length} {items.length === 1 ? "item" : "items"}. Change a quantity and click away to save it.</p></div>
            <span className="plan-slot-icon" aria-hidden="true"><ShoppingCart size={20} /></span>
          </div>

          {loading && <p className="empty-state">Loading your grocery list…</p>}
          {!loading && items.length === 0 && (
            <p className="empty-state">Nothing here yet. Add items above, or tell the coach: <i>&quot;add 1 kg rice, 1 kg tomato and 1 kg potato&quot;</i>.</p>
          )}

          {items.map(item => (
            <div className="grocery-row" key={item.id}>
              <b className="grocery-name">{item.name}{(() => { const n = pantry?.items.find(r => r.id === item.id)?.nutrition; return n ? <em className="grocery-nutri" title="Whole quantity at home">{Math.round(n.calories).toLocaleString()} kcal · {Math.round(n.protein_g)} g protein</em> : null; })()}</b>
              <input
                className="grocery-qty"
                type="number"
                min="0"
                step="any"
                aria-label={`${item.name} quantity`}
                value={drafts[item.id] ?? tidy(item.quantity)}
                onChange={e => setDrafts(current => ({ ...current, [item.id]: e.target.value }))}
                onBlur={() => saveQuantity(item)}
                onKeyDown={e => { if (e.key === "Enter") (e.target as HTMLInputElement).blur(); }}
              />
              <select
                className="grocery-unit"
                aria-label={`${item.name} unit`}
                value={item.unit}
                onChange={e => call(`${API}/api/grocery/${item.id}`, { method: "PATCH", body: JSON.stringify({ unit: e.target.value }) })}
              >
                {(units.includes(item.unit) ? units : [...units, item.unit]).map(u => <option key={u} value={u}>{u}</option>)}
              </select>
              <button className="grocery-del" onClick={() => call(`${API}/api/grocery/${item.id}`, { method: "DELETE" })} aria-label={`Remove ${item.name}`} title="Remove">
                <Trash2 size={16} />
              </button>
            </div>
          ))}
        </section>

        <p className="grocery-tip">
          Try in the chat: <i>&quot;Suggest a meal to cook today from my grocery list&quot;</i>. For any other &quot;what should I eat?&quot; question, the coach picks from the food database as before.
        </p>
      </div>
    </Shell>
  );
}