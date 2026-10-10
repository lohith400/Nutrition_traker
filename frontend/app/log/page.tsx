"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Check, ChevronDown, Pencil, Search, Sparkles, Trash2, TrendingUp, X } from "lucide-react";
import Shell from "../components/Shell";
import { FoodOption, FoodOptionList, MEALS, Meal } from "../components/FoodOptions";
import { FoodGlyph } from "../components/art/FoodGlyph";

const API = (process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000").replace(/\/$/, "");

type MealRow = {
  log_id?: number; food_code?: string | null; meal_type: string; food_name: string; quantity: number; unit?: string; serving_label?: string | null;
  calories: number; protein_g: number; carbs_g: number; fat_g: number; log_time: string;
};
type DayEntry = { date: string; meals: MealRow[]; total_calories: number; total_protein_g: number; total_carbs_g: number; total_fat_g: number };
type Pattern = { pattern_type: string; description: string; detected_on: string };
type Profile = { name?: string; target_calories?: number; target_protein_g?: number };

const MEAL_EMOJI: Record<string, string> = { breakfast: "🍳", lunch: "🍛", dinner: "🍲", snack: "🍎" };

function localISO(d = new Date()): string {
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

function formatDate(iso: string): string {
  const date = new Date(`${iso}T00:00:00`);
  const today = new Date();
  const yesterday = new Date(today); yesterday.setDate(today.getDate() - 1);
  const sameDay = (a: Date, b: Date) => a.toDateString() === b.toDateString();
  if (sameDay(date, today)) return "Today";
  if (sameDay(date, yesterday)) return "Yesterday";
  return date.toLocaleDateString(undefined, { weekday: "short", month: "short", day: "numeric" });
}

function amountLabel(m: MealRow): string {
  if (m.unit === "grams") return `${m.quantity} g`;
  const label = m.serving_label && m.serving_label !== "serving" ? ` ${m.serving_label.split("(")[0].trim()}` : "";
  return `× ${m.quantity}${label}`;
}

function MacroSplit({ p, c, f }: { p: number; c: number; f: number }) {
  const kp = p * 4, kc = c * 4, kf = f * 9;
  const total = kp + kc + kf;
  if (total <= 0) return null;
  const pct = (v: number) => Math.round((v / total) * 100);
  return (
    <div className="split" aria-label={`Calories from protein ${pct(kp)}%, carbs ${pct(kc)}%, fat ${pct(kf)}%`}>
      <div className="split-bar">
        <i style={{ width: `${(kp / total) * 100}%`, background: "var(--green)" }} />
        <i style={{ width: `${(kc / total) * 100}%`, background: "var(--yellow)" }} />
        <i style={{ width: `${(kf / total) * 100}%`, background: "var(--coral)" }} />
      </div>
      <div className="split-legend">
        <span><i style={{ background: "var(--green)" }} />Protein {pct(kp)}%</span>
        <span><i style={{ background: "var(--yellow)" }} />Carbs {pct(kc)}%</span>
        <span><i style={{ background: "var(--coral)" }} />Fat {pct(kf)}%</span>
      </div>
    </div>
  );
}

function WeekStrip({ days, target }: { days: DayEntry[]; target: number }) {
  const last7 = useMemo(() => {
    const byDate = new Map(days.map(d => [d.date, d]));
    return Array.from({ length: 7 }, (_, i) => {
      const d = new Date(); d.setDate(d.getDate() - (6 - i));
      const iso = localISO(d);
      return { iso, label: d.toLocaleDateString(undefined, { weekday: "short" }), kcal: byDate.get(iso)?.total_calories || 0, protein: byDate.get(iso)?.total_protein_g || 0 };
    });
  }, [days]);
  const logged = last7.filter(d => d.kcal > 0);
  const avg = logged.length ? Math.round(logged.reduce((s, d) => s + d.kcal, 0) / logged.length) : 0;
  const avgP = logged.length ? Math.round(logged.reduce((s, d) => s + d.protein, 0) / logged.length) : 0;
  const max = Math.max(target || 0, ...last7.map(d => d.kcal), 1);
  return (
    <div className="week-strip">
      <div className="week-head">
        <div><h3>Last 7 days</h3><p>{logged.length ? `${logged.length} day${logged.length === 1 ? "" : "s"} logged · avg ${avg} kcal · ${avgP} g protein` : "Log a meal to start your week."}</p></div>
      </div>
      <div className="week-bars">
        {target > 0 && <div className="week-target" style={{ bottom: `${(target / max) * 100}%` }}><span>goal {target}</span></div>}
        {last7.map(d => (
          <div className="week-col" key={d.iso}>
            <div className="week-bar-wrap"><div className={`week-bar ${target && d.kcal > target * 1.1 ? "over" : ""}`} style={{ height: `${(d.kcal / max) * 100}%` }} title={`${d.kcal} kcal`} /></div>
            <small>{d.label}</small>
          </div>
        ))}
      </div>
    </div>
  );
}

function EntryRow({ meal, onChanged }: { meal: MealRow; onChanged: () => void }) {
  const [editing, setEditing] = useState(false);
  const [qty, setQty] = useState(String(meal.quantity));
  const [unit, setUnit] = useState<"serving" | "grams">(meal.unit === "grams" ? "grams" : "serving");
  const [mt, setMt] = useState<string>(meal.meal_type);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const [confirmDel, setConfirmDel] = useState(false);
  const canEdit = meal.log_id != null;

  async function save() {
    setBusy(true); setErr("");
    try {
      const n = parseFloat(qty);
      const body: Record<string, unknown> = { meal_type: mt };
      if (Number.isFinite(n) && (n !== meal.quantity || unit !== (meal.unit || "serving"))) { body.quantity = n; body.unit = unit; }
      const res = await fetch(`${API}/api/log/${meal.log_id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
      const data = await res.json();
      if (!res.ok) throw new Error(typeof data.detail === "string" ? data.detail : "Could not update.");
      setEditing(false); onChanged();
    } catch (e) { setErr(e instanceof Error ? e.message : "Could not update."); }
    finally { setBusy(false); }
  }
  async function remove() {
    setBusy(true); setErr("");
    try {
      const res = await fetch(`${API}/api/log/${meal.log_id}`, { method: "DELETE" });
      if (!res.ok) throw new Error("Could not delete.");
      onChanged();
    } catch (e) { setErr(e instanceof Error ? e.message : "Could not delete."); setBusy(false); }
  }

  return (
    <div className="meal-row entry-row">
      <div className="meal-icon mint">
        <FoodGlyph name={meal.food_name} mealType={meal.meal_type} size={28} />
      </div>
      <div className="meal-info">
        <b>{meal.food_name}</b>
        <span className="almanac-mono">{meal.meal_type} · {meal.log_time?.slice(11, 16) || ""} · {amountLabel(meal)}</span>
      </div>
      <div className="macro-box"><b className="tabular almanac-mono">{meal.calories}</b><span>kcal</span></div>
      <div className="macro-box protein-box"><b className="tabular almanac-mono">{meal.protein_g}g</b><span>protein</span></div>
      {canEdit && (
        <div className="entry-actions">
          <button type="button" className="icon-mini" aria-label={`Edit ${meal.food_name}`} onClick={() => setEditing(e => !e)}><Pencil size={14} /></button>
          {confirmDel
            ? <><button type="button" className="icon-mini danger" disabled={busy} onClick={remove} aria-label="Confirm delete"><Check size={14} /></button><button type="button" className="icon-mini" onClick={() => setConfirmDel(false)} aria-label="Cancel"><X size={14} /></button></>
            : <button type="button" className="icon-mini" aria-label={`Delete ${meal.food_name}`} onClick={() => setConfirmDel(true)}><Trash2 size={14} /></button>}
        </div>
      )}
      {editing && (
        <div className="entry-edit">
          <div className="fo-seg">
            <button type="button" className={unit === "serving" ? "on" : ""} onClick={() => setUnit("serving")}>Servings</button>
            <button type="button" className={unit === "grams" ? "on" : ""} onClick={() => setUnit("grams")}>Grams</button>
          </div>
          <input className="fo-qty" inputMode="decimal" value={qty} onChange={e => setQty(e.target.value)} aria-label="Quantity" />
          <select value={mt} onChange={e => setMt(e.target.value)} aria-label="Meal">{MEALS.map(m => <option key={m} value={m}>{m[0].toUpperCase() + m.slice(1)}</option>)}</select>
          <button type="button" className="primary-btn small" disabled={busy} onClick={save}>{busy ? "Saving…" : "Save"}</button>
          {err && <p className="fo-error">{err}</p>}
        </div>
      )}
      {!editing && err && <p className="fo-error">{err}</p>}
    </div>
  );
}

function AddFoodPanel({ onLogged }: { onLogged: () => void }) {
  const [q, setQ] = useState("");
  const [date, setDate] = useState(localISO());
  const [meal, setMeal] = useState<Meal | "">("");
  const [options, setOptions] = useState<FoodOption[] | null>(null);
  const [hidden, setHidden] = useState(0);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const seq = useRef(0);

  useEffect(() => {
    const text = q.trim();
    if (text.length < 2) { setOptions(null); setError(""); return; }
    const mine = ++seq.current;
    setLoading(true);
    const t = setTimeout(() => {
      fetch(`${API}/api/food-options?q=${encodeURIComponent(text)}&limit=8`)
        .then(r => r.json())
        .then(d => { if (mine === seq.current) { setOptions(d.options || []); setHidden(d.hidden_by_diet || 0); setError(""); } })
        .catch(() => { if (mine === seq.current) setError("Backend unavailable. Start FastAPI on port 8000."); })
        .finally(() => { if (mine === seq.current) setLoading(false); });
    }, 250);
    return () => clearTimeout(t);
  }, [q]);

  return (
    <div className="panel add-panel">
      <div className="panel-head">
        <div><h3>Add a food</h3><p>Search the dataset, your everyday staples and your own custom foods. Pick the right one before it&apos;s logged.</p></div>
      </div>
      <div className="add-row">
        <label className="search-box"><Search size={16} /><input value={q} onChange={e => setQ(e.target.value)} placeholder="Try “masala chai”, “egg”, “banana”, “paneer”…" aria-label="Search foods" /></label>
        <label className="date-box"><span>Day</span><input type="date" value={date} max={localISO()} onChange={e => setDate(e.target.value || localISO())} /></label>
        <label className="date-box"><span>Meal</span>
          <select value={meal} onChange={e => setMeal(e.target.value as Meal | "")}><option value="">Auto</option>{MEALS.map(m => <option key={m} value={m}>{m[0].toUpperCase() + m.slice(1)}</option>)}</select>
        </label>
      </div>
      {error && <p className="fo-error">{error}</p>}
      {loading && !options && <p className="empty-state small">Searching…</p>}
      {options && options.length === 0 && !loading && <p className="empty-state small">Nothing related to “{q}”. Try a simpler name, or build it on the Custom foods page.</p>}
      {options && options.length > 0 && (
        <FoodOptionList
          key={`${q}-${date}-${meal}`}
          options={options}
          hiddenByDiet={hidden}
          date={date === localISO() ? undefined : date}
          defaultMeal={meal || undefined}
          onLogged={() => onLogged()}
        />
      )}
    </div>
  );
}

export default function LogPage() {
  const [profile, setProfile] = useState<Profile | null>(null);
  const [days, setDays] = useState<DayEntry[]>([]);
  const [patterns, setPatterns] = useState<Pattern[]>([]);
  const [openDate, setOpenDate] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const firstLoad = useRef(true);

  const load = useCallback(() => {
    fetch(`${API}/api/profile`).then(r => r.json()).then(setProfile).catch(() => {});
    Promise.all([
      fetch(`${API}/api/history?days=21`, { cache: "no-store" }).then(r => r.json()),
      fetch(`${API}/api/patterns`, { cache: "no-store" }).then(r => r.json()),
    ])
      .then(([history, patternData]) => {
        const list: DayEntry[] = history.days || [];
        setDays(list);
        setPatterns(patternData.patterns || []);
        setError("");
        if (firstLoad.current && list.length) setOpenDate(list[0].date);
        firstLoad.current = false;
      })
      .catch(() => setError("Backend unavailable. Start FastAPI on port 8000."))
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    load();
    // Foods logged in the coach chat show up as soon as you come back to this tab.
    const onVisible = () => { if (document.visibilityState === "visible") load(); };
    document.addEventListener("visibilitychange", onVisible);
    window.addEventListener("focus", onVisible);
    window.addEventListener("nutrisync-data-changed", load);  // logged from the quick-add (Ctrl+K)
    return () => { document.removeEventListener("visibilitychange", onVisible); window.removeEventListener("focus", onVisible); window.removeEventListener("nutrisync-data-changed", load); };
  }, [load]);

  const calorieTarget = profile?.target_calories || 0;
  const proteinTarget = profile?.target_protein_g || 0;

  return (
    <Shell active="log" crumb="Food log">
      <div className="page-wrap">
        <div className="hero-row">
          <div>
            <p className="eyebrow">YOUR HISTORY</p>
            <h1>Every meal, every day <span>✦</span></h1>
            <p className="subtitle">Search and log foods, fix a quantity, remove a mistake, or add something you forgot on an earlier day.</p>
          </div>
        </div>

        {error && <div className="notice-banner"><Sparkles size={16} />{error}</div>}

        <AddFoodPanel onLogged={load} />

        {patterns.length > 0 && (
          <div className="insight-banner">
            <div className="insight-icon"><TrendingUp size={19} /></div>
            <div><b>What I&apos;ve noticed</b><p>{patterns[0].description}</p></div>
          </div>
        )}

        <WeekStrip days={days} target={calorieTarget} />

        <div className="section-header"><div><h2>Daily history</h2><p>Last {days.length} day{days.length === 1 ? "" : "s"} with a logged meal.</p></div></div>

        {loading && <p className="empty-state">Loading history…</p>}
        {!loading && days.length === 0 && <p className="empty-state">No meals logged yet. Search a food above, or tell the Coach what you ate.</p>}

        <div className="log-days">
          {days.map(day => {
            const isOpen = openDate === day.date;
            const calPct = calorieTarget ? Math.min(100, Math.round((day.total_calories / calorieTarget) * 100)) : 0;
            const proPct = proteinTarget ? Math.min(100, Math.round((day.total_protein_g / proteinTarget) * 100)) : 0;
            const order = [...MEALS.filter(m => day.meals.some(x => x.meal_type === m)), ...Array.from(new Set(day.meals.map(x => x.meal_type))).filter(m => !(MEALS as string[]).includes(m))];
            return (
              <div className={`log-day ${isOpen ? "open" : ""}`} key={day.date}>
                <button className="log-day-head" onClick={() => setOpenDate(isOpen ? null : day.date)}>
                  <ChevronDown size={16} className="log-chevron" />
                  <span className="log-day-title">{formatDate(day.date)}</span>
                  <span className="log-day-sub">{day.meals.length} item{day.meals.length === 1 ? "" : "s"}</span>
                  <span className="log-day-totals">
                    <b>{day.total_calories}</b> kcal{calorieTarget ? ` · ${calPct}% of goal` : ""}
                    <i> · </i>
                    <b>{day.total_protein_g}g</b> protein{proteinTarget ? ` · ${proPct}%` : ""}
                  </span>
                </button>
                {isOpen && (
                  <div className="log-day-body">
                    <MacroSplit p={day.total_protein_g} c={day.total_carbs_g} f={day.total_fat_g} />
                    {order.map(m => {
                      const rows = day.meals.filter(x => x.meal_type === m);
                      const kcal = Math.round(rows.reduce((s, r) => s + r.calories, 0));
                      return (
                        <div className="meal-group" key={m}>
                          <div className="meal-group-head"><b>{m[0].toUpperCase() + m.slice(1)}</b><span>{kcal} kcal</span></div>
                          {rows.map((meal, index) => <EntryRow meal={meal} key={meal.log_id ?? `${meal.food_name}-${index}`} onChanged={load} />)}
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>
    </Shell>
  );
}
