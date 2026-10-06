"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { ArrowUpRight, Sparkles, TrendingUp } from "lucide-react";
import Shell, { API } from "../components/Shell";
import { Consistency, WeightTracker } from "./parts";

type DayEntry = { date: string; meals: unknown[]; total_calories: number; total_protein_g: number; total_carbs_g: number; total_fat_g: number };
type Profile = {
  status?: string; goal?: string; current_weight_kg?: number; target_weight_kg?: number;
  target_calories?: number; target_protein_g?: number;
};
type Pattern = { pattern_type: string; description: string; detected_on: string };
type Food = { food_name: string; times_logged: number };

const RANGES = [7, 14, 30] as const;
type Metric = "calories" | "protein";

/** Local YYYY-MM-DD (toISOString would shift the day in some timezones). */
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

function goalLabel(goal?: string): string {
  return ({ fat_loss: "Fat loss", muscle_gain: "Muscle gain", recomp: "Recomposition", maintenance: "Maintenance" } as Record<string, string>)[goal || ""] || "Your goal";
}

export default function ProgressPage() {
  const [range, setRange] = useState<(typeof RANGES)[number]>(14);
  const [metric, setMetric] = useState<Metric>("calories");
  const [profile, setProfile] = useState<Profile | null>(null);
  const [days, setDays] = useState<DayEntry[]>([]);
  const [patterns, setPatterns] = useState<Pattern[]>([]);
  const [foods, setFoods] = useState<Food[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    Promise.all([
      fetch(`${API}/api/profile`).then(r => r.json()),
      fetch(`${API}/api/patterns`).then(r => r.json()),
      fetch(`${API}/api/food-preferences?limit=6`).then(r => r.json()),
    ])
      .then(([p, pat, pref]) => { setProfile(p); setPatterns(pat.patterns || []); setFoods(pref.foods || []); })
      .catch(() => setError("Backend unavailable. Start FastAPI on port 8000."));
  }, []);

  useEffect(() => {
    setLoading(true);
    fetch(`${API}/api/history?days=${range}`)
      .then(r => r.json())
      .then(data => setDays(data.days || []))
      .catch(() => setError("Backend unavailable. Start FastAPI on port 8000."))
      .finally(() => setLoading(false));
  }, [range]);

  const onboarded = profile && profile.status !== "not_onboarded";
  const calorieTarget = profile?.target_calories || 0;
  const proteinTarget = profile?.target_protein_g || 0;
  const target = metric === "calories" ? calorieTarget : proteinTarget;
  const unit = metric === "calories" ? "kcal" : "g";

  const series = useMemo(() => {
    const byDate = new Map(days.map(d => [d.date, d]));
    return lastDays(range).map(date => {
      const entry = byDate.get(date);
      const value = entry ? (metric === "calories" ? entry.total_calories : entry.total_protein_g) : 0;
      return { date, value, logged: Boolean(entry) };
    });
  }, [days, range, metric]);

  const stats = useMemo(() => {
    const logged = days.length;
    const avgCal = logged ? days.reduce((sum, d) => sum + d.total_calories, 0) / logged : 0;
    const avgPro = logged ? days.reduce((sum, d) => sum + d.total_protein_g, 0) / logged : 0;
    const proteinHit = proteinTarget ? days.filter(d => d.total_protein_g >= proteinTarget * 0.9).length : 0;
    return { logged, avgCal, avgPro, proteinHit };
  }, [days, proteinTarget]);

  const chartMax = Math.max(target * 1.2, ...series.map(s => s.value), 1);
  const topCount = Math.max(...foods.map(f => f.times_logged), 1);

  const current = profile?.current_weight_kg;
  const goalWeight = profile?.target_weight_kg;
  const diff = current !== undefined && goalWeight !== undefined ? Math.round((goalWeight - current) * 10) / 10 : null;

  return (
    <Shell active="progress" crumb="Progress">
      <div className="page-wrap">
        <div className="hero-row">
          <div>
            <h1>Your progress <span>✦</span></h1>
            <p className="subtitle">How your eating compares with your daily targets over time, built from the meals you&apos;ve logged.</p>
          </div>
          <div className="segmented" role="group" aria-label="Time range">
            {RANGES.map(r => (
              <button key={r} className={r === range ? "seg active" : "seg"} onClick={() => setRange(r)} aria-pressed={r === range}>{r} days</button>
            ))}
          </div>
        </div>

        {error && <div className="notice-banner"><Sparkles size={16} />{error}</div>}

        {profile && !onboarded && (
          <div className="insight-banner">
            <div className="insight-icon"><Sparkles size={19} /></div>
            <div><b>Set up your profile to see targets</b><p>Progress compares your meals with your daily calorie and protein goals.</p></div>
            <Link className="link-btn" href="/profile">Set up profile <ArrowUpRight size={15} /></Link>
          </div>
        )}

        <div className="stats-grid progress-stats">
          <div className="stat-card"><div className="stat-topline">Days logged</div><div className="stat-number">{stats.logged}<small>of {range}</small></div></div>
          <div className="stat-card"><div className="stat-topline">Average calories</div><div className="stat-number">{Math.round(stats.avgCal)}<small>kcal / day</small></div></div>
          <div className="stat-card"><div className="stat-topline">Average protein</div><div className="stat-number">{Math.round(stats.avgPro)}<small>g / day</small></div></div>
          <div className="stat-card"><div className="stat-topline">Protein goal met</div><div className="stat-number">{stats.proteinHit}<small>{stats.logged ? `of ${stats.logged} days` : "days"}</small></div></div>
        </div>

        <section className="panel chart-panel">
          <div className="panel-head">
            <div><h3>Daily {metric}</h3><p>{target ? `Dashed line marks your ${target}${unit} goal.` : "Set up your profile to see your goal line."} Averages count only days you logged.</p></div>
            <div className="segmented" role="group" aria-label="Chart metric">
              <button className={metric === "calories" ? "seg active" : "seg"} onClick={() => setMetric("calories")} aria-pressed={metric === "calories"}>Calories</button>
              <button className={metric === "protein" ? "seg active" : "seg"} onClick={() => setMetric("protein")} aria-pressed={metric === "protein"}>Protein</button>
            </div>
          </div>
          {loading ? <p className="empty-state">Loading…</p> : stats.logged === 0 ? (
            <p className="empty-state">No meals logged in the last {range} days. Log a meal in the <Link className="inline-link" href="/log">Food log</Link> or tell the <Link className="inline-link" href="/chat">coach</Link> what you ate.</p>
          ) : (
            <div className="bar-chart" role="img" aria-label={`Daily ${metric} for the last ${range} days`}>
              {target > 0 && <span className="goal-line" style={{ bottom: `calc(18px + (100% - 18px) * ${target / chartMax})` }} />}
              {series.map((point, index) => (
                <div className="bar-col" key={point.date} title={`${shortDay(point.date)}: ${point.logged ? `${Math.round(point.value)} ${unit}` : "nothing logged"}`}>
                  <div className="bar-slot">
                    <span className={`bar ${point.logged ? (target && point.value > target * 1.05 && metric === "calories" ? "over" : "") : "none"}`} style={{ height: `${point.logged ? Math.max(3, (point.value / chartMax) * 100) : 0}%` }} />
                  </div>
                  <small>{range <= 14 || index % 5 === 0 || index === series.length - 1 ? shortDay(point.date) : ""}</small>
                </div>
              ))}
            </div>
          )}
        </section>

        <Consistency calorieTarget={calorieTarget} proteinTarget={proteinTarget} />

        <div className="content-grid progress-grid">
          <section className="panel">
            <div className="panel-head"><div><h3>Weight goal</h3><p>{goalLabel(profile?.goal)}</p></div></div>
            {current !== undefined && goalWeight !== undefined && diff !== null ? (
              <>
                <div className="weight-row">
                  <div><span>Now</span><b>{current}<small> kg</small></b></div>
                  <div className="weight-arrow" aria-hidden="true">→</div>
                  <div><span>Goal</span><b>{goalWeight}<small> kg</small></b></div>
                </div>
                <p className="weight-note">{diff === 0 ? "You're at your goal weight." : diff < 0 ? `${Math.abs(diff)} kg to lose to reach your goal.` : `${diff} kg to gain to reach your goal.`}</p>
                <p className="weight-note muted">Updating your weight on your <Link className="inline-link" href="/profile">profile</Link> recalculates your targets.</p>
              </>
            ) : <p className="empty-state">Add your weights on your profile to see your goal here.</p>}
          </section>

          <section className="panel">
            <div className="panel-head"><div><h3>Most logged foods</h3><p>What you eat most often</p></div></div>
            {foods.length === 0 ? <p className="empty-state">Foods you log will show up here.</p> : (
              <div className="food-bars">
                {foods.map(food => (
                  <div className="food-bar-row" key={food.food_name}>
                    <div className="food-bar-label"><b>{food.food_name}</b><span>{food.times_logged}×</span></div>
                    <div className="progress-track"><span className="progress-fill blue" style={{ width: `${(food.times_logged / topCount) * 100}%` }} /></div>
                  </div>
                ))}
              </div>
            )}
          </section>
        </div>

        <section className="panel wt-panel">
          <div className="panel-head"><div><h3>Weight over time</h3><p>Log a reading whenever you weigh yourself. Your trend and estimated goal date update automatically.</p></div></div>
          <WeightTracker goalWeight={goalWeight} startWeight={undefined} />
        </section>

        {patterns.length > 0 && (
          <section className="panel patterns-panel">
            <div className="panel-head"><div><h3>What I&apos;ve noticed</h3><p>Patterns from your recent days</p></div><TrendingUp size={18} /></div>
            <ul className="pattern-list">
              {patterns.map(p => <li key={p.pattern_type}>{p.description}</li>)}
            </ul>
          </section>
        )}
      </div>
    </Shell>
  );
}