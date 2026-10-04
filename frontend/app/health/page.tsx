"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { Activity, AlertCircle, ArrowUpRight, Flame, Footprints, HeartPulse, RefreshCw, Sparkles, Timer } from "lucide-react";
import Shell, { API } from "../components/Shell";

type FitnessDay = {
  log_date: string;
  steps: number;
  calories_burned: number;
  running_minutes: number;
  distance_km: number | null;
  active_minutes: number | null;
  source: string;
  synced_at: string;
};

type FitnessToday = {
  status?: "ok" | "error" | "not_configured";
  configured?: boolean;
  date?: string;
  steps: number;
  calories_burned: number;
  running_minutes: number;
  distance_km?: number;
  active_minutes?: number;
  error?: string;
  message?: string;
  stored_steps?: number;
  stored_calories_burned?: number;
  synced_at?: string;
};

const RANGES = [7, 14, 30] as const;
type Metric = "steps" | "calories";

function ymd(date: Date): string {
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${date.getFullYear()}-${m}-${d}`;
}

function lastDays(count: number): string[] {
  const out: string[] = [];
  for (let i = count - 1; i >= 0; i--) {
    const d = new Date();
    d.setDate(d.getDate() - i);
    out.push(ymd(d));
  }
  return out;
}

function shortDay(iso: string): string {
  return new Date(`${iso}T00:00:00`).toLocaleDateString(undefined, { day: "numeric", month: "short" });
}

export default function HealthPage() {
  const [range, setRange] = useState<(typeof RANGES)[number]>(7);
  const [metric, setMetric] = useState<Metric>("steps");
  const [today, setToday] = useState<FitnessToday | null>(null);
  const [history, setHistory] = useState<FitnessDay[]>([]);
  const [loading, setLoading] = useState(true);
  const [syncing, setSyncing] = useState(false);
  const [error, setError] = useState("");

  async function loadData() {
    try {
      const [todayRes, historyRes] = await Promise.all([
        fetch(`${API}/api/fitness/today`),
        fetch(`${API}/api/fitness/history?days=${range}`),
      ]);
      if (todayRes.ok) setToday(await todayRes.json());
      if (historyRes.ok) {
        const histData = await historyRes.json();
        setHistory(histData.days || []);
      }
    } catch {
      setError("Backend unavailable. Start FastAPI on port 8000.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadData();
  }, [range]);

  async function triggerSync() {
    setSyncing(true);
    try {
      const res = await fetch(`${API}/api/fitness/today`);
      if (res.ok) {
        setToday(await res.json());
        const histRes = await fetch(`${API}/api/fitness/history?days=${range}`);
        if (histRes.ok) {
          const histData = await histRes.json();
          setHistory(histData.days || []);
        }
      }
    } catch {
      setError("Sync failed. Check backend connection.");
    } finally {
      setSyncing(false);
    }
  }

  const stepGoal = 10000;
  const calGoal = 2000;
  const target = metric === "steps" ? stepGoal : calGoal;
  const unit = metric === "steps" ? "steps" : "kcal";

  const series = useMemo(() => {
    const byDate = new Map(history.map(d => [d.log_date, d]));
    return lastDays(range).map(date => {
      const entry = byDate.get(date);
      const value = entry ? (metric === "steps" ? entry.steps : entry.calories_burned) : 0;
      return { date, value, tracked: Boolean(entry && entry.steps > 0) };
    });
  }, [history, range, metric]);

  const stats = useMemo(() => {
    const trackedDays = history.filter(d => d.steps > 0);
    const count = trackedDays.length;
    const avgSteps = count ? trackedDays.reduce((sum, d) => sum + d.steps, 0) / count : 0;
    const avgCal = count ? trackedDays.reduce((sum, d) => sum + d.calories_burned, 0) / count : 0;
    const daysGoalMet = history.filter(d => d.steps >= stepGoal).length;
    return { count, avgSteps, avgCal, daysGoalMet };
  }, [history]);

  const chartMax = Math.max(target * 1.25, ...series.map(s => s.value), 100);

  const stepsToday = today?.steps || 0;
  const caloriesToday = today?.calories_burned || 0;
  const runningToday = today?.running_minutes || 0;
  const distanceToday = today?.distance_km ?? (stepsToday > 0 ? Math.round(stepsToday * 0.00075 * 10) / 10 : 0);

  const isConfigured = today?.configured !== false && today?.status !== "not_configured";

  return (
    <Shell active="health" crumb="Health">
      <div className="page-wrap">
        <div className="hero-row">
          <div>
            <h1>Health &amp; Movement <span>✦</span></h1>
            <p className="subtitle">Daily physical activity, steps, and energy expenditure tracked with Google Fit.</p>
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: "10px", flexWrap: "wrap" }}>
            <button
              type="button"
              className="ghost-btn"
              onClick={triggerSync}
              disabled={syncing}
              style={{ display: "inline-flex", alignItems: "center", gap: "6px", fontSize: "12px", padding: "8px 14px" }}
            >
              <RefreshCw size={14} className={syncing ? "spin" : ""} /> {syncing ? "Syncing..." : "Sync Fit"}
            </button>
            <div className="segmented" role="group" aria-label="Time range">
              {RANGES.map(r => (
                <button
                  key={r}
                  className={r === range ? "seg active" : "seg"}
                  onClick={() => setRange(r)}
                  aria-pressed={r === range}
                >
                  {r} days
                </button>
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

        <div className="stats-grid progress-stats">
          <div className="stat-card">
            <div className="stat-topline"><span className="stat-icon emerald"><Footprints size={16} /></span>Today&apos;s Steps</div>
            <div className="stat-number">{stepsToday.toLocaleString()}<small> / {stepGoal.toLocaleString()}</small></div>
            <div className="progress-track"><span className="progress-fill emerald" style={{ width: `${Math.min(100, (stepsToday / stepGoal) * 100)}%` }} /></div>
            <div className="stat-meta"><span>{Math.round((stepsToday / stepGoal) * 100)}% of goal</span><b>{stepGoal.toLocaleString()}</b></div>
          </div>

          <div className="stat-card">
            <div className="stat-topline"><span className="stat-icon orange"><Flame size={16} /></span>Calories Burned</div>
            <div className="stat-number">{Math.round(caloriesToday)}<small> kcal</small></div>
            <div className="progress-track"><span className="progress-fill orange" style={{ width: `${Math.min(100, (caloriesToday / calGoal) * 100)}%` }} /></div>
            <div className="stat-meta"><span>Active burn</span><b>Goal {calGoal} kcal</b></div>
          </div>

          <div className="stat-card">
            <div className="stat-topline"><span className="stat-icon purple"><Timer size={16} /></span>Running / Active</div>
            <div className="stat-number">{runningToday}<small> min</small></div>
            <div className="progress-track"><span className="progress-fill purple" style={{ width: `${Math.min(100, (runningToday / 30) * 100)}%` }} /></div>
            <div className="stat-meta"><span>Exercise time</span><b>Goal 30 min</b></div>
          </div>

          <div className="stat-card">
            <div className="stat-topline"><span className="stat-icon cyan"><Activity size={16} /></span>Distance</div>
            <div className="stat-number">{distanceToday}<small> km</small></div>
            <div className="progress-track"><span className="progress-fill cyan" style={{ width: `${Math.min(100, (distanceToday / 8) * 100)}%` }} /></div>
            <div className="stat-meta"><span>Estimated walk</span><b>Goal 8 km</b></div>
          </div>
        </div>

        <section className="panel chart-panel">
          <div className="panel-head">
            <div>
              <h3>Daily {metric === "steps" ? "steps" : "calories burned"}</h3>
              <p>Dashed line marks your {target.toLocaleString()} {unit} target. Showing activity over the last {range} days.</p>
            </div>
            <div className="segmented" role="group" aria-label="Chart metric">
              <button
                className={metric === "steps" ? "seg active" : "seg"}
                onClick={() => setMetric("steps")}
                aria-pressed={metric === "steps"}
              >
                Steps
              </button>
              <button
                className={metric === "calories" ? "seg active" : "seg"}
                onClick={() => setMetric("calories")}
                aria-pressed={metric === "calories"}
              >
                Calories Burned
              </button>
            </div>
          </div>

          {loading ? (
            <p className="empty-state">Loading activity data…</p>
          ) : stats.count === 0 && stepsToday === 0 ? (
            <p className="empty-state">
              No fitness data recorded yet for the last {range} days. Once Google Fit is synced, your daily steps and calories will appear here automatically.
            </p>
          ) : (
            <div className="bar-chart" role="img" aria-label={`Daily ${metric} for the last ${range} days`}>
              {target > 0 && (
                <span className="goal-line" style={{ bottom: `calc(18px + (100% - 18px) * ${target / chartMax})` }} />
              )}
              {series.map((point, index) => (
                <div
                  className="bar-col"
                  key={point.date}
                  title={`${shortDay(point.date)}: ${point.value ? `${point.value.toLocaleString()} ${unit}` : "0"}`}
                >
                  <div className="bar-slot">
                    <span
                      className={`bar ${metric === "steps" ? "emerald-bar" : "orange-bar"} ${point.value >= target ? "over" : ""}`}
                      style={{ height: `${point.value > 0 ? Math.max(3, (point.value / chartMax) * 100) : 0}%` }}
                    />
                  </div>
                  <small>{range <= 14 || index % 5 === 0 || index === series.length - 1 ? shortDay(point.date) : ""}</small>
                </div>
              ))}
            </div>
          )}
        </section>

        <div className="content-grid progress-grid">
          <section className="panel">
            <div className="panel-head">
              <div>
                <h3>Movement Summary</h3>
                <p>Activity stats over {range} days</p>
              </div>
            </div>
            <div style={{ display: "grid", gap: "14px", marginTop: "14px" }}>
              <div style={{ display: "flex", justifyContent: "space-between", borderBottom: "1px solid var(--line)", paddingBottom: "10px" }}>
                <span style={{ fontSize: "12px", color: "var(--muted)" }}>Days tracked</span>
                <b style={{ fontSize: "13px" }}>{stats.count} of {range} days</b>
              </div>
              <div style={{ display: "flex", justifyContent: "space-between", borderBottom: "1px solid var(--line)", paddingBottom: "10px" }}>
                <span style={{ fontSize: "12px", color: "var(--muted)" }}>Average daily steps</span>
                <b style={{ fontSize: "13px" }}>{Math.round(stats.avgSteps).toLocaleString()} steps</b>
              </div>
              <div style={{ display: "flex", justifyContent: "space-between", borderBottom: "1px solid var(--line)", paddingBottom: "10px" }}>
                <span style={{ fontSize: "12px", color: "var(--muted)" }}>Average daily burn</span>
                <b style={{ fontSize: "13px" }}>{Math.round(stats.avgCal)} kcal</b>
              </div>
              <div style={{ display: "flex", justifyContent: "space-between", paddingBottom: "4px" }}>
                <span style={{ fontSize: "12px", color: "var(--muted)" }}>10,000 steps achieved</span>
                <b style={{ fontSize: "13px", color: stats.daysGoalMet > 0 ? "#1e7e4f" : "inherit" }}>{stats.daysGoalMet} days</b>
              </div>
            </div>
          </section>

          <section className="panel">
            <div className="panel-head">
              <div>
                <h3>Recent Activity Log</h3>
                <p>Recorded in NutriSync</p>
              </div>
            </div>
            {history.length === 0 ? (
              <p className="empty-state">Daily history entries will appear here as Google Fit syncs.</p>
            ) : (
              <div className="meal-list">
                {history.slice(-5).reverse().map(item => (
                  <div className="meal-row" key={item.log_date}>
                    <div className="meal-icon mint"><Footprints size={18} /></div>
                    <div className="meal-info">
                      <b>{shortDay(item.log_date)}</b>
                      <span>{item.source} · {item.running_minutes ? `${item.running_minutes}m run` : "movement"}</span>
                    </div>
                    <div className="macro-box">
                      <b>{item.steps.toLocaleString()}</b>
                      <span>steps</span>
                    </div>
                    <div className="macro-box protein-box">
                      <b>{Math.round(item.calories_burned)}</b>
                      <span>kcal</span>
                    </div>
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
