"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { Flame, Scale, Trash2, TrendingDown, TrendingUp } from "lucide-react";
import { API } from "../components/Shell";
import { FoodGlyph } from "../components/art/FoodGlyph";

type WeightEntry = { log_date: string; weight_kg: number; note?: string | null };

function iso(d: Date): string {
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}
const dayMs = 86400000;
const toTime = (s: string) => new Date(`${s}T00:00:00`).getTime();

/** Least-squares slope in kg/day over the readings (needs 3+ readings over 5+ days). */
function trend(entries: WeightEntry[]): number | null {
  if (entries.length < 3) return null;
  const t0 = toTime(entries[0].log_date);
  const xs = entries.map(e => (toTime(e.log_date) - t0) / dayMs);
  if (xs[xs.length - 1] < 5) return null;
  const n = xs.length;
  const mx = xs.reduce((a, b) => a + b, 0) / n;
  const my = entries.reduce((a, e) => a + e.weight_kg, 0) / n;
  const num = xs.reduce((a, x, i) => a + (x - mx) * (entries[i].weight_kg - my), 0);
  const den = xs.reduce((a, x) => a + (x - mx) ** 2, 0);
  return den ? num / den : null;
}

export function WeightTracker({ goalWeight, startWeight, onChange }: { goalWeight?: number; startWeight?: number; onChange?: () => void }) {
  const [entries, setEntries] = useState<WeightEntry[]>([]);
  const [value, setValue] = useState("");
  const [date, setDate] = useState(iso(new Date()));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [hover, setHover] = useState<number | null>(null);

  const load = useCallback(() => {
    fetch(`${API}/api/weight?days=365`, { cache: "no-store" }).then(r => r.json()).then(d => setEntries(d.entries || [])).catch(() => {});
  }, []);
  useEffect(() => { load(); }, [load]);

  async function add() {
    const w = parseFloat(value);
    if (!Number.isFinite(w) || w <= 25 || w >= 300) { setError("Enter your weight in kg, for example 72.4."); return; }
    setBusy(true); setError("");
    try {
      const res = await fetch(`${API}/api/weight`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ weight_kg: w, date: date === iso(new Date()) ? null : date }) });
      const data = await res.json();
      if (!res.ok) throw new Error(typeof data.detail === "string" ? data.detail : "Could not save.");
      setEntries(data.entries || []); setValue(""); onChange?.();
    } catch (e) { setError(e instanceof Error ? e.message : "Could not save."); }
    finally { setBusy(false); }
  }
  async function remove(d: string) {
    const res = await fetch(`${API}/api/weight/${d}`, { method: "DELETE" });
    if (res.ok) { const data = await res.json(); setEntries(data.entries || []); }
  }

  const latest = entries[entries.length - 1];
  const first = entries[0];
  const change = latest && first && entries.length > 1 ? Math.round((latest.weight_kg - first.weight_kg) * 10) / 10 : null;
  const slope = useMemo(() => trend(entries.slice(-30)), [entries]);

  const projection = useMemo(() => {
    if (!latest || goalWeight == null || slope == null) return null;
    const remaining = goalWeight - latest.weight_kg;
    if (Math.abs(remaining) < 0.3) return { reached: true as const };
    if (Math.abs(slope) < 0.004 || Math.sign(slope) !== Math.sign(remaining)) return { off: true as const, perWeek: slope * 7 };
    const days = remaining / slope;
    if (days > 700) return { off: true as const, perWeek: slope * 7 };
    return { date: new Date(Date.now() + days * dayMs), perWeek: slope * 7 };
  }, [latest, goalWeight, slope]);

  // chart geometry
  const W = 640, H = 220, PX = 38, PY = 18;
  const chart = useMemo(() => {
    if (entries.length === 0) return null;
    const ws = entries.map(e => e.weight_kg).concat(goalWeight != null ? [goalWeight] : []);
    let lo = Math.min(...ws), hi = Math.max(...ws);
    const pad = Math.max((hi - lo) * 0.15, 0.8);
    lo -= pad; hi += pad;
    const t0 = toTime(entries[0].log_date);
    const t1 = Math.max(toTime(entries[entries.length - 1].log_date), t0 + dayMs * 6);
    const x = (s: string) => PX + ((toTime(s) - t0) / (t1 - t0)) * (W - PX - 14);
    const y = (w: number) => PY + (1 - (w - lo) / (hi - lo)) * (H - PY * 2);
    const pts = entries.map(e => ({ x: x(e.log_date), y: y(e.weight_kg), e }));
    return { pts, y, lo, hi, line: pts.map((p, i) => `${i ? "L" : "M"}${p.x.toFixed(1)},${p.y.toFixed(1)}`).join(" ") };
  }, [entries, goalWeight]);

  const toGoal = latest && goalWeight != null ? Math.round((goalWeight - latest.weight_kg) * 10) / 10 : null;
  const startW = startWeight ?? first?.weight_kg;
  const progressPct = latest && goalWeight != null && startW != null && startW !== goalWeight
    ? Math.max(0, Math.min(100, ((startW - latest.weight_kg) / (startW - goalWeight)) * 100)) : null;

  return (
    <div className="wt">
      <div className="wt-log">
        <div className="wt-input"><Scale size={16} />
          <input inputMode="decimal" placeholder="Today’s weight (kg)" value={value} onChange={e => setValue(e.target.value)} onKeyDown={e => e.key === "Enter" && add()} aria-label="Weight in kg" />
        </div>
        <input type="date" className="wt-date" value={date} max={iso(new Date())} onChange={e => setDate(e.target.value || iso(new Date()))} aria-label="Date" />
        <button type="button" className="primary-btn" disabled={busy || !value} onClick={add}>{busy ? "Saving…" : "Log weight"}</button>
      </div>
      {error && <p className="fo-error">{error}</p>}

      {entries.length === 0 ? (
        <p className="empty-state small">Log your weight whenever you weigh yourself. Weekly is plenty. The trend and your goal date appear here.</p>
      ) : (
        <>
          <div className="wt-stats">
            <div><small>Latest</small><b>{latest.weight_kg}<em> kg</em></b></div>
            <div><small>Change</small><b className={change != null && change !== 0 ? "chg" : ""}>{change == null ? "—" : `${change > 0 ? "+" : ""}${change}`}<em> kg</em></b></div>
            <div><small>To goal</small><b>{toGoal == null ? "—" : Math.abs(toGoal)}<em> kg</em></b></div>
            <div><small>Pace</small><b>{slope == null ? "—" : `${slope * 7 > 0 ? "+" : ""}${(slope * 7).toFixed(2)}`}<em> kg/wk</em></b></div>
          </div>
          {progressPct != null && (
            <div className="wt-progress" aria-label={`${Math.round(progressPct)}% of the way to your goal weight`}>
              <div className="progress-track"><span className="progress-fill green" style={{ width: `${progressPct}%` }} /></div>
              <small>{Math.round(progressPct)}% of the way from {startW} kg to {goalWeight} kg</small>
            </div>
          )}
          {projection && (
            <p className="wt-proj">
              {"reached" in projection ? <><TrendingDown size={14} /> You&apos;re at your goal weight.</>
                : "off" in projection ? <><TrendingUp size={14} /> Your recent pace ({projection.perWeek > 0 ? "+" : ""}{projection.perWeek.toFixed(2)} kg/week) isn&apos;t heading toward your goal yet.</>
                  : <><TrendingDown size={14} /> If your recent pace holds ({projection.perWeek > 0 ? "+" : ""}{projection.perWeek.toFixed(2)} kg/week) you&apos;d reach {goalWeight} kg around <b>{projection.date.toLocaleDateString(undefined, { day: "numeric", month: "short", year: "numeric" })}</b>.</>}
            </p>
          )}
          {slope == null && entries.length > 0 && <p className="wt-proj muted">Log a few readings over a week or more and I&apos;ll show your pace and an estimated goal date.</p>}

          {chart && (
            <div className="wt-chart">
              <svg viewBox={`0 0 ${W} ${H}`} role="img" aria-label="Weight over time" onMouseLeave={() => setHover(null)}>
                {[0, 0.5, 1].map(f => { const v = chart.lo + (chart.hi - chart.lo) * f; const yy = chart.y(v); return <g key={f}><line x1={PX} x2={W - 14} y1={yy} y2={yy} stroke="#efeae0" /><text x={PX - 6} y={yy + 4} textAnchor="end" fontSize="10" fill="#9b9a93">{v.toFixed(1)}</text></g>; })}
                {goalWeight != null && <g><line x1={PX} x2={W - 14} y1={chart.y(goalWeight)} y2={chart.y(goalWeight)} stroke="#4a6559" strokeDasharray="5 4" /><text x={W - 16} y={chart.y(goalWeight) - 5} textAnchor="end" fontSize="10" fill="#4a6559">goal {goalWeight}</text></g>}
                <path d={chart.line} fill="none" stroke="#2f4d42" strokeWidth="2.5" strokeLinejoin="round" strokeLinecap="round" />
                {chart.pts.map((p, i) => (
                  <g key={p.e.log_date}>
                    <circle cx={p.x} cy={p.y} r={hover === i ? 6 : 4} fill="#fff" stroke="#2f4d42" strokeWidth="2" />
                    <circle cx={p.x} cy={p.y} r="14" fill="transparent" onMouseEnter={() => setHover(i)} onClick={() => setHover(i)} />
                  </g>
                ))}
                {hover != null && chart.pts[hover] && (() => {
                  const p = chart.pts[hover]; const left = p.x > W - 130;
                  return <g><rect x={left ? p.x - 112 : p.x + 10} y={p.y - 34} width="102" height="36" rx="8" fill="#22221e" /><text x={left ? p.x - 61 : p.x + 61} y={p.y - 19} textAnchor="middle" fontSize="11" fill="#fff" fontWeight="700">{p.e.weight_kg} kg</text><text x={left ? p.x - 61 : p.x + 61} y={p.y - 6} textAnchor="middle" fontSize="10" fill="#cfd6cf">{new Date(`${p.e.log_date}T00:00:00`).toLocaleDateString(undefined, { day: "numeric", month: "short" })}</text></g>;
                })()}
              </svg>
            </div>
          )}
          <details className="wt-history">
            <summary>All readings ({entries.length})</summary>
            <ul>
              {[...entries].reverse().slice(0, 30).map(e => (
                <li key={e.log_date}><span>{new Date(`${e.log_date}T00:00:00`).toLocaleDateString(undefined, { weekday: "short", day: "numeric", month: "short" })}</span><b>{e.weight_kg} kg</b>
                  <button type="button" className="icon-mini" aria-label={`Delete reading from ${e.log_date}`} onClick={() => remove(e.log_date)}><Trash2 size={13} /></button></li>
              ))}
            </ul>
          </details>
        </>
      )}
    </div>
  );
}

type Day = { date: string; total_calories: number; total_protein_g: number };

export function Consistency({ calorieTarget, proteinTarget }: { calorieTarget: number; proteinTarget: number }) {
  const [days, setDays] = useState<Day[]>([]);
  useEffect(() => { fetch(`${API}/api/history?days=35`, { cache: "no-store" }).then(r => r.json()).then(d => setDays(d.days || [])).catch(() => {}); }, []);

  const cells = useMemo(() => {
    const by = new Map(days.map(d => [d.date, d]));
    const out: { date: string; level: 0 | 1 | 2 | 3 | 4; kcal: number; protein: number; future: boolean }[] = [];
    const today = new Date(); today.setHours(0, 0, 0, 0);
    // 5 full weeks ending this week (Mon-first)
    const dow = (today.getDay() + 6) % 7;
    const start = new Date(today); start.setDate(today.getDate() - dow - 28);
    for (let i = 0; i < 35; i++) {
      const d = new Date(start); d.setDate(start.getDate() + i);
      const key = iso(d); const e = by.get(key);
      let level: 0 | 1 | 2 | 3 | 4 = 0;
      if (e) {
        level = 1;
        const calOk = calorieTarget ? e.total_calories >= calorieTarget * 0.75 && e.total_calories <= calorieTarget * 1.1 : true;
        const proOk = proteinTarget ? e.total_protein_g >= proteinTarget * 0.9 : true;
        if (calOk) level = 2;
        if (proOk) level = (calOk ? 4 : 3) as 3 | 4;
      }
      out.push({ date: key, level, kcal: e?.total_calories || 0, protein: e?.total_protein_g || 0, future: d > today });
    }
    return out;
  }, [days, calorieTarget, proteinTarget]);

  const streak = useMemo(() => {
    const by = new Set(days.map(d => d.date));
    let n = 0; const d = new Date();
    if (!by.has(iso(d))) d.setDate(d.getDate() - 1);   // today not logged yet doesn't break the streak
    while (by.has(iso(d))) { n++; d.setDate(d.getDate() - 1); }
    return n;
  }, [days]);
  const onTarget = cells.filter(c => c.level === 4).length;

  return (
    <section className="panel consistency">
      <div className="panel-head">
        <div>
          <span className="almanac-eyebrow">HABIT BOTANY</span>
          <h3 className="almanac-serif">Consistency &amp; Rhythm</h3>
          <p>Last 5 weeks. Darker cells indicate caloric discipline and protein targets met.</p>
        </div>
        <div className="streak stamp-tag sage" style={{ padding: "6px 14px", borderRadius: "99px" }}>
          <FoodGlyph name="sprout" size={19} />
          <b className="tabular almanac-mono" style={{ fontSize: "16px" }}>{streak}</b>
          <span>day streak</span>
        </div>
      </div>
      <div className="heat">
        {["M", "T", "W", "T", "F", "S", "S"].map((l, i) => <small key={i} className="heat-lbl">{l}</small>)}
        {cells.map(c => (
          <div key={c.date} className={`heat-cell l${c.level} ${c.future ? "future" : ""}`}
            title={c.future ? "" : c.level ? `${c.date}: ${Math.round(c.kcal)} kcal, ${Math.round(c.protein)} g protein` : `${c.date}: nothing logged`} />
        ))}
      </div>
      <div className="heat-legend"><span>{onTarget} day{onTarget === 1 ? "" : "s"} fully on target</span><span className="heat-scale">Less <i className="l1" /><i className="l2" /><i className="l3" /><i className="l4" /> More</span></div>
    </section>
  );
}
