"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { Activity, AlertCircle, Bed, Flame, Footprints, HeartPulse, Info, MapPin, RefreshCw, Scale, Sparkles, Timer, Zap } from "lucide-react";
import Shell, { API } from "../components/Shell";
import { ActivityMix, BalanceScale, FitnessDay, FoodLab, Extras, InsightList, Insights, MathPanel, PlateRings, Row, Tile, TrendChart, fmt, shortDay } from "./parts";

type FitnessToday = {
  status?: "ok" | "error" | "not_configured"; configured?: boolean; date?: string;
  steps: number; calories_burned: number; running_minutes: number; distance_km?: number; active_minutes?: number;
  distance_source?: "google_fit" | "estimated"; extras?: Extras; error?: string; message?: string; synced_at?: string;
};

const RANGES = [7, 14, 30] as const;
const SCOPE_NAMES: Record<string, string> = { body: "fitness.body.read (heart rate, weight)", sleep: "fitness.sleep.read (sleep)", location: "fitness.location.read (distance)", activity: "fitness.activity.read (move minutes, heart points)" };

export default function HealthPage() {
  const [range, setRange] = useState<(typeof RANGES)[number]>(7);
  const [mode, setMode] = useState<"energy" | "steps">("energy");
  const [today, setToday] = useState<FitnessToday | null>(null);
  const [history, setHistory] = useState<FitnessDay[]>([]);
  const [ins, setIns] = useState<Insights | null>(null);
  const [loading, setLoading] = useState(true);
  const [syncing, setSyncing] = useState(false);
  const [error, setError] = useState("");
  const autoFilled = useRef(false);

  async function loadData(r: number = range) {
    try {
      const [todayRes, historyRes, insRes] = await Promise.all([
        fetch(`${API}/api/fitness/today`),
        fetch(`${API}/api/fitness/history?days=${r}`),
        fetch(`${API}/api/health/insights?days=${r}`).catch(() => null),
      ]);
      let t: FitnessToday | null = null;
      if (todayRes.ok) { t = await todayRes.json(); setToday(t); }
      let h: FitnessDay[] = [];
      if (historyRes.ok) { h = (await historyRes.json()).days || []; setHistory(h); }
      if (insRes && insRes.ok) { const j = await insRes.json(); setIns(j.status === "ok" ? j : null); }
      setError("");
      return { t, h };
    } catch {
      setError("Backend unavailable. Start FastAPI on port 8000.");
      return { t: null, h: [] as FitnessDay[] };
    } finally {
      setLoading(false);
    }
  }

  // Backfill past days from Google Fit (history only has days the app was opened otherwise).
  async function backfill(r: number) {
    try { await fetch(`${API}/api/fitness/backfill?days=${r}`, { method: "POST" }); } catch { /* optional */ }
  }

  useEffect(() => {
    loadData(range).then(async ({ t, h }) => {
      if (!autoFilled.current && t?.status === "ok" && h.length < Math.min(range, 7)) {
        autoFilled.current = true;
        await backfill(Math.max(range, 14));
        loadData(range);
      }
    });
  }, [range]); // eslint-disable-line react-hooks/exhaustive-deps

  async function triggerSync() {
    setSyncing(true);
    try { await backfill(range); await loadData(range); } catch { setError("Sync failed. Check backend connection."); } finally { setSyncing(false); }
  }

  const ex = today?.extras ?? {};
  const missing = new Set(ex.missing ?? []);
  const stepsToday = today?.steps || 0;
  const kcalToday = today?.calories_burned || 0;
  const activeToday = ex.move_minutes ?? today?.active_minutes ?? today?.running_minutes ?? 0;
  const distanceToday = today?.distance_km ?? (stepsToday > 0 ? Math.round(stepsToday * 0.00075 * 100) / 100 : 0);
  const isConfigured = today?.configured !== false && today?.status !== "not_configured";
  const todayRow = ins?.rows.find(r => r.is_today);
  const eatenToday = todayRow?.eaten ?? 0;
  const kcalGoal = ins?.math.tdee || 2000;

  // Rows for the chart: prefer the backend's joined rows, fall back to Fit history only.
  const rows: Row[] = useMemo(() => {
    if (ins) return ins.rows.slice(-range);
    return history.map(d => ({ date: d.log_date, is_today: false, eaten: 0, burned: Math.round(d.calories_burned), steps: d.steps,
      protein_g: 0, carbs_g: 0, fat_g: 0, water_l: 0, has_food: false, has_fit: d.steps > 0, balance: null }));
  }, [ins, history, range]);

  const spark = (pick: (d: FitnessDay) => number | undefined) => history.map(d => pick(d) ?? 0);
  const trackedDays = history.filter(d => d.steps > 0).length;
  const sleep = ex.sleep_minutes ? `${Math.floor(ex.sleep_minutes / 60)}h ${ex.sleep_minutes % 60}m` : undefined;
  const missingList = [...missing].filter(g => SCOPE_NAMES[g]);

  return (
    <Shell active="health" crumb="Health">
      <div className="page-wrap hx-page">
        <div className="hero-row">
          <div>
            <div className="almanac-eyebrow">
              <span>METABOLIC LEDGER</span>
              <span className="dot-sep">·</span>
              <span>GOOGLE FIT SYNC</span>
            </div>
            <h1 className="almanac-serif">Health &amp; Movement <span>✦</span></h1>
            <p className="subtitle">What you eat, what you burn, and what it means for your body from your food log and Google Fit.</p>
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: "10px", flexWrap: "wrap" }}>
            {today?.status === "ok" && <span className="hx-live"><i />Google Fit{today.synced_at ? ` · ${today.synced_at.slice(11, 16)}` : " · live"}</span>}
            <button type="button" className="ghost-btn hx-sync" onClick={triggerSync} disabled={syncing}>
              <RefreshCw size={14} className={syncing ? "spin" : ""} /> {syncing ? "Syncing..." : "Sync Fit"}
            </button>
            <div className="segmented" role="group" aria-label="Time range">
              {RANGES.map(r => (
                <button key={r} className={r === range ? "seg active" : "seg"} onClick={() => setRange(r)} aria-pressed={r === range}>{r} days</button>
              ))}
            </div>
          </div>
        </div>

        {error && <div className="notice-banner"><Sparkles size={16} />{error}</div>}

        {!isConfigured && (
          <div className="insight-banner">
            <div className="insight-icon"><HeartPulse size={19} /></div>
            <div>
              <b>Connect Google Fit for live activity</b>
              <p>Add your <code>GOOGLE_FIT_CLIENT_ID</code>, <code>GOOGLE_FIT_CLIENT_SECRET</code>, and <code>GOOGLE_FIT_REFRESH_TOKEN</code> to <code>backend/.env</code> to automatically track your daily steps and burned calories.</p>
            </div>
          </div>
        )}

        {today?.status === "error" && (
          <div className="fit-helper-banner">
            <AlertCircle size={18} style={{ flexShrink: 0, marginTop: "2px" }} />
            <div>
              <b>Google Fit Sync Notice:</b> {today.error || "Credentials pending authorization."}
              <div style={{ marginTop: "4px", fontSize: "11px", opacity: 0.9 }}>
                If you generated this in Google OAuth Playground, ensure <code>Use your own OAuth credentials</code> was checked with your Client ID and Client Secret in Playground Settings (⚙).
              </div>
            </div>
          </div>
        )}

        {/* ---- Hero: the scale and the plate ---- */}
        <div className="hx-hero">
          <section className="hx-card hx-warm">
            <div className="hx-card-head"><div><h3>Energy balance</h3><p>Food on one pan, movement on the other (today so far)</p></div></div>
            <BalanceScale eaten={eatenToday} burned={Math.round(kcalToday)} />
            {!ins && <p className="hx-fine">Log meals in Food log to see both sides of the scale.</p>}
          </section>
          <section className="hx-card hx-sage">
            <div className="hx-card-head"><div><h3>Today&apos;s plate</h3><p>Three rings, one plate. Hover a ring for detail</p></div></div>
            <PlateRings steps={stepsToday} kcal={Math.round(kcalToday)} active={activeToday} kcalGoal={kcalGoal} />
          </section>
        </div>

        {/* ---- Everything Google Fit gives us ---- */}
        <div className="hx-section-title"><h2>From Google Fit</h2><p>Today, with the last {Math.max(history.length, 1)} days as a trend line</p></div>
        <div className="hx-tiles">
          <Tile icon={<Footprints size={16} />} color="#c99a2e" label="Steps" num={stepsToday} sub={`${Math.round(stepsToday / 100)}% of 10,000`} spark={spark(d => d.steps)} />
          <Tile icon={<MapPin size={16} />} color="#3f8f86" label="Distance" num={distanceToday} decimals={1} unit="km" sub={today?.distance_source === "google_fit" ? "Measured by Fit" : "Estimated from steps"} spark={spark(d => d.distance_km ?? 0)} />
          <Tile icon={<Flame size={16} />} color="#d0704f" label="Calories burned" num={Math.round(kcalToday)} unit="kcal" sub="Resting + active" spark={spark(d => d.calories_burned)} />
          <Tile icon={<Timer size={16} />} color="#6b4fb8" label="Move minutes" num={activeToday} unit="min" sub="Goal 30 min" spark={spark(d => d.active_minutes ?? 0)} />
          <Tile icon={<Zap size={16} />} color="#2f7d5b" label="Heart points" num={ex.heart_points ?? null} decimals={0} sub="Goal 150 / week" spark={spark(d => d.extras?.heart_points)} missing={missing.has("activity")} hint="Needs activity scope" />
          <Tile icon={<HeartPulse size={16} />} color="#c4506b" label="Heart rate" num={ex.hr_avg ?? null} unit="bpm" sub={ex.hr_min ? `Range ${ex.hr_min}–${ex.hr_max} bpm` : undefined} spark={spark(d => d.extras?.hr_avg)} missing={missing.has("body")} hint="Needs body scope" />
          <Tile icon={<Bed size={16} />} color="#5a74b8" label="Sleep" text={sleep} sub="Last night" spark={spark(d => d.extras?.sleep_minutes)} missing={missing.has("sleep")} hint="Needs sleep scope" />
          <Tile icon={<Scale size={16} />} color="#8a6a3a" label="Weight" num={ex.weight_kg ?? null} decimals={1} unit="kg" sub={ins ? `Target ${ins.profile.target_weight_kg} kg` : "Latest reading"} spark={spark(d => d.extras?.weight_kg)} missing={missing.has("body")} hint="Needs body scope" />
        </div>
        {missingList.length > 0 && (
          <div className="hx-note"><Info size={15} />
            <span>Google did not return {missingList.map(g => g).join(", ")} data. Either your watch/phone doesn&apos;t record it, or your refresh token was created without these scopes: {missingList.map(g => SCOPE_NAMES[g]).join(", ")}. Re-authorize with them in OAuth Playground and update the refresh token in <code>backend/.env</code>.</span>
          </div>
        )}

        {/* ---- Trend ---- */}
        <section className="hx-card hx-chart-card">
          <div className="panel-head">
            <div>
              <h3>{mode === "energy" ? "Eaten vs burned" : "Daily steps"}</h3>
              <p>{mode === "energy" ? `Bars are what you burned, the line is what you ate. Numbers under each day are the balance. Last ${range} days.` : `Dashed line is your 10,000 step goal. Last ${range} days.`}</p>
            </div>
            <div className="segmented" role="group" aria-label="Chart metric">
              <button className={mode === "energy" ? "seg active" : "seg"} onClick={() => setMode("energy")} aria-pressed={mode === "energy"}>Energy</button>
              <button className={mode === "steps" ? "seg active" : "seg"} onClick={() => setMode("steps")} aria-pressed={mode === "steps"}>Steps</button>
            </div>
          </div>
          {loading ? <p className="empty-state">Loading activity data…</p>
            : trackedDays === 0 && stepsToday === 0 ? <p className="empty-state">No fitness data recorded yet for the last {range} days. Press Sync Fit and your history will fill in.</p>
            : <TrendChart rows={rows} mode={mode} target={mode === "steps" ? 10000 : kcalGoal} calTarget={mode === "energy" ? ins?.profile.target_calories : undefined} />}
        </section>

        {/* ---- Maths + insights ---- */}
        {ins ? (
          <div className="hx-split">
            <section className="hx-card">
              <div className="hx-card-head"><div><h3>Your energy maths, step by step</h3><p>Every number comes from your profile, food log and Google Fit. No guessing</p></div></div>
              <MathPanel ins={ins} />
            </section>
            <section className="hx-card">
              <div className="hx-card-head"><div><h3>What this means for you</h3><p>Plain-language readout of the last {ins.math.days_used || 0} complete days</p></div></div>
              <InsightList items={ins.insights} />
            </section>
          </div>
        ) : !loading && (
          <section className="hx-card"><p className="empty-state">Personal energy maths needs your profile (Profile page) and the updated backend. Restart uvicorn after pulling the new files.</p></section>
        )}

        {/* ---- Food lab ---- */}
        <section className="hx-card hx-warm hx-labcard">
          <div className="hx-card-head"><div><h3>Food lab</h3><p>See your movement as food, and test a snack before you eat it</p></div></div>
          <FoodLab burned={kcalToday} eaten={eatenToday} avgBalance={ins ? ins.math.avg_balance : null} walk={ins?.walk ?? null} weight={ins?.profile.weight_kg ?? null} />
        </section>

        {/* ---- Activity mix + log ---- */}
        <div className="hx-split even">
          <section className="hx-card">
            <div className="hx-card-head"><div><h3>How you moved today</h3><p>Minutes per activity from Google Fit</p></div></div>
            <ActivityMix acts={ex.activities ?? {}} />
          </section>
          <section className="hx-card">
            <div className="hx-card-head"><div><h3>Recent Activity Log</h3><p>Recorded in NutriSync</p></div></div>
            {history.length === 0 ? (
              <p className="empty-state">Daily history entries will appear here as Google Fit syncs.</p>
            ) : (
              <div className="meal-list">
                {history.slice(-6).reverse().map(item => (
                  <div className="meal-row" key={item.log_date}>
                    <div className="meal-icon mint"><Activity size={18} /></div>
                    <div className="meal-info">
                      <b>{shortDay(item.log_date)}</b>
                      <span>{item.distance_km ? `${item.distance_km} km` : "movement"}{item.extras?.move_minutes ? ` · ${item.extras.move_minutes} min active` : ""}{item.extras?.sleep_minutes ? ` · ${Math.floor(item.extras.sleep_minutes / 60)}h sleep` : ""}</span>
                    </div>
                    <div className="macro-box"><b>{item.steps.toLocaleString()}</b><span>steps</span></div>
                    <div className="macro-box protein-box"><b>{fmt(item.calories_burned)}</b><span>kcal</span></div>
                  </div>
                ))}
              </div>
            )}
          </section>
        </div>
      </div>
    </Shell>
  );
}
