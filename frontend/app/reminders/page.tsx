"use client";

import { FormEvent, useCallback, useEffect, useState } from "react";
import { AlarmClock, BellRing, Droplets, Send, Utensils } from "lucide-react";
import Shell, { API } from "../components/Shell";
import { FoodGlyph } from "../components/art/FoodGlyph";

type Reminder = {
  id: number; kind: "food" | "water"; remind_time: string; repeat: "daily" | "once"; once_date: string | null;
  food_name: string | null; quantity: number | null; unit: string | null; meal_type: string | null;
  water_l: number | null; auto_log: boolean; enabled: boolean;
};
type Channels = { ntfy: boolean; email: boolean; browser: boolean };
type FoodHit = { food_name: string };

function describe(r: Reminder) {
  if (r.kind === "water") return `Drink ${Math.round((r.water_l || 0) * 1000)} ml water`;
  const amount = r.unit === "grams" ? `${r.quantity} g` : `${r.quantity} serving${r.quantity === 1 ? "" : "s"}`;
  return `${r.food_name} · ${amount}`;
}

function to12h(hhmm: string) {
  const [h, m] = hhmm.split(":").map(Number);
  return `${h % 12 || 12}:${String(m).padStart(2, "0")} ${h < 12 ? "AM" : "PM"}`;
}

export default function RemindersPage() {
  const [items, setItems] = useState<Reminder[]>([]);
  const [channels, setChannels] = useState<Channels | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [info, setInfo] = useState("");
  const [busy, setBusy] = useState(false);

  const [kind, setKind] = useState<"food" | "water">("food");
  const [time, setTime] = useState("14:00");
  const [repeat, setRepeat] = useState<"daily" | "once">("daily");
  const [food, setFood] = useState("");
  const [quantity, setQuantity] = useState("1");
  const [unit, setUnit] = useState<"serving" | "grams">("serving");
  const [mealType, setMealType] = useState("");
  const [waterMl, setWaterMl] = useState("250");
  const [autoLog, setAutoLog] = useState(true);
  const [hits, setHits] = useState<string[]>([]);

  const load = useCallback(() => {
    fetch(`${API}/api/reminders`, { cache: "no-store" })
      .then(r => r.json())
      .then(d => { setItems(d.reminders || []); setChannels(d.channels || null); setError(""); })
      .catch(() => setError("Backend unavailable. Start FastAPI on port 8000."))
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    load();
    const t = window.setInterval(load, 30000);
    return () => window.clearInterval(t);
  }, [load]);

  // Food-name suggestions from the real database, so a reminder can always be auto-logged.
  useEffect(() => {
    if (kind !== "food" || food.trim().length < 2) { setHits([]); return; }
    const t = window.setTimeout(() => {
      fetch(`${API}/api/food-search?q=${encodeURIComponent(food.trim())}&limit=8`)
        .then(r => r.json())
        .then(d => setHits(((d.results || []) as FoodHit[]).map(x => x.food_name)))
        .catch(() => setHits([]));
    }, 250);
    return () => window.clearTimeout(t);
  }, [food, kind]);

  async function submit(e: FormEvent) {
    e.preventDefault();
    setError(""); setInfo(""); setBusy(true);
    const body = kind === "food"
      ? { kind, time, repeat, food_name: food.trim(), quantity: Number(quantity) || 1, unit, meal_type: mealType || null, auto_log: autoLog }
      : { kind, time, repeat, water_ml: Number(waterMl) || 250, auto_log: autoLog };
    try {
      const res = await fetch(`${API}/api/reminders`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
      const data = await res.json();
      if (!res.ok) throw new Error(typeof data.detail === "string" ? data.detail : "Could not save the reminder. Check the fields.");
      setInfo("Reminder saved.");
      if (kind === "food") setFood("");
      load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not save the reminder.");
    } finally { setBusy(false); }
  }

  async function toggle(r: Reminder) {
    await fetch(`${API}/api/reminders/${r.id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ enabled: !r.enabled }) }).catch(() => {});
    load();
  }

  async function remove(r: Reminder) {
    await fetch(`${API}/api/reminders/${r.id}`, { method: "DELETE" }).catch(() => {});
    load();
  }

  async function sendTest() {
    setError(""); setInfo("");
    try {
      const res = await fetch(`${API}/api/reminders/test-notification`, { method: "POST" });
      const data = await res.json();
      if (!res.ok) throw new Error(typeof data.detail === "string" ? data.detail : "Test failed.");
      setInfo(`Test sent via ${data.sent.join(" + ")}. Check your phone/inbox.`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Test failed.");
    }
  }

  async function enableBrowser() {
    if (typeof Notification === "undefined") { setError("This browser doesn't support notifications."); return; }
    const p = await Notification.requestPermission();
    setInfo(p === "granted" ? "Browser alerts on. They only appear while a NutriSync tab is open." : "Browser alerts are blocked. Allow them in the site settings.");
  }

  return (
    <Shell active="reminders" crumb="Reminders">
      <div className="page-wrap">
        <div className="hero-row">
          <div>
            <div className="almanac-eyebrow">
              <span>SCHEDULED SIGNALS</span>
              <span className="dot-sep">·</span>
              <span>TIMEKEEPING</span>
            </div>
            <h1 className="almanac-serif">Reminders <span>✦</span></h1>
            <p className="subtitle">Set a time, a food or hydration goal. NutriSync pings you then and auto-logs your routine.</p>
          </div>
        </div>

        {error && <div className="notice-banner"><AlarmClock size={16} />{error}</div>}
        {info && <div className="notice-banner"><BellRing size={16} />{info}</div>}

        <div className="rem-layout">
          <div>
            <section className="panel">
              <h3>New reminder</h3>
              <form className="rem-form" onSubmit={submit}>
                <div className="rem-kind">
                  <button type="button" className={kind === "food" ? "on" : ""} onClick={() => setKind("food")}><Utensils size={13} /> Food</button>
                  <button type="button" className={kind === "water" ? "on" : ""} onClick={() => setKind("water")}><Droplets size={13} /> Water</button>
                </div>
                <div className="rem-row2">
                  <label>Time<input type="time" required value={time} onChange={e => setTime(e.target.value)} /></label>
                  <label>Repeat
                    <select value={repeat} onChange={e => setRepeat(e.target.value as "daily" | "once")}>
                      <option value="daily">Every day</option>
                      <option value="once">Just once</option>
                    </select>
                  </label>
                </div>

                {kind === "food" ? (
                  <>
                    <label>Food
                      <input list="food-hits" required value={food} onChange={e => setFood(e.target.value)} placeholder="e.g. boiled egg, egg sandwich, idli" />
                      <datalist id="food-hits">{hits.map(h => <option key={h} value={h} />)}</datalist>
                    </label>
                    <div className="rem-row2">
                      <label>Amount<input type="number" min="0.1" step="any" value={quantity} onChange={e => setQuantity(e.target.value)} /></label>
                      <label>Unit
                        <select value={unit} onChange={e => setUnit(e.target.value as "serving" | "grams")}>
                          <option value="serving">Servings</option>
                          <option value="grams">Grams</option>
                        </select>
                      </label>
                    </div>
                    <label>Log as
                      <select value={mealType} onChange={e => setMealType(e.target.value)}>
                        <option value="">Pick from the time</option>
                        <option value="breakfast">Breakfast</option>
                        <option value="lunch">Lunch</option>
                        <option value="snack">Snack</option>
                        <option value="dinner">Dinner</option>
                      </select>
                    </label>
                  </>
                ) : (
                  <label>Water (ml)<input type="number" min="50" max="2000" step="50" value={waterMl} onChange={e => setWaterMl(e.target.value)} /></label>
                )}

                <label className="rem-check">
                  <input type="checkbox" checked={autoLog} onChange={e => setAutoLog(e.target.checked)} />
                  <span>Log it automatically when the reminder fires. Untick this if you only want a nudge; auto-logging records it even if you skip the meal.</span>
                </label>
                <button className="primary-btn" disabled={busy} type="submit">{busy ? "Saving…" : "Save reminder"}</button>
              </form>
            </section>

            <section className="panel" style={{ marginTop: 16 }}>
              <h3>Where reminders reach you</h3>
              <div className="chan-list">
                <div className={`chan ${channels?.ntfy ? "on" : ""}`}><i /><span><b>Phone push (ntfy)</b> — {channels?.ntfy ? "connected" : "not set up"}</span></div>
                <div className={`chan ${channels?.email ? "on" : ""}`}><i /><span><b>Email</b> — {channels?.email ? "connected" : "not set up"}</span></div>
                <div className="chan on"><i /><span><b>This website</b> — toast + bell while a tab is open</span></div>
              </div>
              <div className="rem-actions">
                <button type="button" onClick={sendTest}><Send size={11} /> Send test</button>
                <button type="button" onClick={enableBrowser}>Enable browser alerts</button>
              </div>
              {!channels?.ntfy && !channels?.email && (
                <p className="rem-hint">To get alerts on your phone, install the free <b>ntfy</b> app, subscribe to a long random topic, then put it in <code>backend/.env</code> as <code>NTFY_TOPIC=your-topic</code> and restart the backend.</p>
              )}
            </section>
          </div>

          <section className="panel">
            <h3>Your reminders</h3>
            {loading && <p className="empty-state">Loading…</p>}
            {!loading && items.length === 0 && <p className="empty-state">No reminders yet. Add one on the left, or ask the Coach.</p>}
            <div className="meal-list">
              {items.map(r => (
                <div className={`rem-item ${r.enabled ? "" : "off"}`} key={r.id}>
                  <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
                    <FoodGlyph name={r.kind === "water" ? "jar" : (r.food_name || "plate")} size={24} />
                    <div className="rem-time tabular almanac-mono">{to12h(r.remind_time)}</div>
                  </div>
                  <div className="meal-info">
                    <b>{describe(r)}</b>
                    <span>
                      {r.repeat === "daily" ? "Every day" : `Once · ${r.once_date}`}
                      {r.kind === "food" && r.meal_type ? ` · ${r.meal_type}` : ""}
                      {r.auto_log ? " · auto-logs" : " · reminder only"}
                      {!r.enabled ? " · off" : ""}
                    </span>
                  </div>
                  <div className="rem-actions">
                    <button onClick={() => toggle(r)}>{r.enabled ? "Turn off" : "Turn on"}</button>
                    <button className="danger" onClick={() => remove(r)}>Delete</button>
                  </div>
                </div>
              ))}
            </div>
          </section>
        </div>
      </div>
    </Shell>
  );
}