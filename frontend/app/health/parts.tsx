"use client";

import { ReactNode, useEffect, useMemo, useRef, useState } from "react";
import { AlertTriangle, CheckCircle2, Lightbulb, Minus, Plus } from "lucide-react";

/* ---------------------------------- types ---------------------------------- */
export type Extras = {
  move_minutes?: number; heart_points?: number; hr_avg?: number; hr_min?: number; hr_max?: number;
  weight_kg?: number; sleep_minutes?: number; distance_km?: number;
  activities?: Record<string, number>; missing?: string[];
};
export type FitnessDay = {
  log_date: string; steps: number; calories_burned: number; running_minutes: number;
  distance_km: number | null; active_minutes: number | null; source: string; synced_at: string; extras?: Extras;
};
export type Row = {
  date: string; is_today: boolean; eaten: number; burned: number; steps: number;
  protein_g: number; carbs_g: number; fat_g: number; water_l: number;
  has_food: boolean; has_fit: boolean; balance: number | null;
};
export type Insights = {
  status: string; rows: Row[];
  profile: { name?: string; age: number; sex: string; height_cm: number; weight_kg: number; target_weight_kg: number;
    goal: string; activity_level: string; target_calories?: number; target_water_l?: number };
  math: { bmr: number; sex_const: number; tdee: number; activity_factor_used: number | null; activity_factor_real: number | null;
    measured_burn: number; days_used: number; complete_days: number; confidence: string; avg_eaten: number; avg_burned: number;
    avg_balance: number; weekly_kg: number; kcal_per_kg_fat: number; remaining_kg: number; eta_weeks: number | null;
    avg_protein_g: number; protein_per_kg: number; macro_pct: { protein: number; carbs: number; fat: number };
    fit_days: number };
  walk: { stride_m: number; kcal_per_km: number; kcal_per_step: number; steps_per_km: number };
  insights: { tone: "good" | "warn" | "info"; title: string; body: string }[];
};

export const fmt = (n: number) => Math.round(n).toLocaleString();
const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));
export const shortDay = (iso: string) => new Date(`${iso}T00:00:00`).toLocaleDateString(undefined, { day: "numeric", month: "short" });

/* ------------------------------- animation hook ------------------------------ */
export function useTween(target: number, ms = 900): number {
  const [v, setV] = useState(0);
  const from = useRef(0);
  useEffect(() => {
    if (typeof window === "undefined" || window.matchMedia("(prefers-reduced-motion: reduce)").matches) { setV(target); from.current = target; return; }
    const start = performance.now(); const a = from.current; let raf = 0;
    const tick = (t: number) => {
      const p = clamp((t - start) / ms, 0, 1); const e = 1 - Math.pow(1 - p, 3);
      const cur = a + (target - a) * e; from.current = cur; setV(cur);
      if (p < 1) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [target, ms]);
  return v;
}

/* --------------------------- Energy balance scale ---------------------------- */
export function BalanceScale({ eaten, burned }: { eaten: number; burned: number }) {
  const diff = eaten - burned;
  const a = useTween(-clamp(diff / 700, -1, 1) * 0.19, 1100);
  const px = 220, py = 70, L = 150;
  const lx = px - L * Math.cos(a), ly = py - L * Math.sin(a);
  const rx = px + L * Math.cos(a), ry = py + L * Math.sin(a);
  const food = Math.min(8, eaten > 0 ? Math.max(1, Math.round(eaten / 250)) : 0);
  const shoes = Math.min(8, burned > 0 ? Math.max(1, Math.round(burned / 250)) : 0);
  const items = (n: number, cx: number, cy: number, set: string[]) =>
    Array.from({ length: n }, (_, i) => {
      const row = Math.floor(i / 4), col = i % 4, inRow = Math.min(4, n - row * 4);
      return <text key={i} x={cx + (col - (inRow - 1) / 2) * 27} y={cy - row * 27} fontSize="20" textAnchor="middle">{set[i % set.length]}</text>;
    });
  const pan = (cx: number, cy: number, fill: string) => (
    <g>
      <line x1={cx} y1={cy} x2={cx - 54} y2={cy + 78} stroke="#8c8270" strokeWidth="1.5" />
      <line x1={cx} y1={cy} x2={cx + 54} y2={cy + 78} stroke="#8c8270" strokeWidth="1.5" />
      <path d={`M ${cx - 62} ${cy + 78} Q ${cx} ${cy + 130} ${cx + 62} ${cy + 78} Z`} fill={fill} stroke="#c9bfae" strokeWidth="1.5" />
      <line x1={cx - 62} y1={cy + 78} x2={cx + 62} y2={cy + 78} stroke="#6e6556" strokeWidth="3" strokeLinecap="round" />
    </g>
  );
  const tone = Math.abs(diff) < 100 ? "even" : diff < 0 ? "deficit" : "surplus";
  return (
    <div className="hx-scale">
      <svg viewBox="0 0 440 262" role="img" aria-label={`Eaten ${fmt(eaten)} kilocalories, burned ${fmt(burned)}`}>
        {/* Solid Brass Center Fulcrum Stand */}
        <path d={`M ${px - 7} ${py + 9} L ${px - 14} 238 L ${px + 14} 238 L ${px + 7} ${py + 9} Z`} fill="#d5cca8" stroke="#877c57" strokeWidth="1.2" />
        <rect x={px - 62} y="238" width="124" height="13" rx="4" fill="#a6996d" stroke="#695f3b" strokeWidth="1" />
        {/* Tilting Wooden Balance Beam */}
        <line x1={lx} y1={ly} x2={rx} y2={ry} stroke="#695133" strokeWidth="8" strokeLinecap="round" />
        <line x1={lx} y1={ly} x2={rx} y2={ry} stroke="#8c704a" strokeWidth="3" strokeLinecap="round" strokeDasharray="6 8" />
        {pan(lx, ly, "#faf1ea")}{pan(rx, ry, "#eef5ed")}
        {items(food, lx, ly + 70, ["🍛", "🥗", "🍎", "🍞"])}
        {items(shoes, rx, ry + 70, ["🔥", "⚡", "👟"])}
        <circle cx={px} cy={py} r="10" fill="#2f4d42" stroke="#d5cca8" strokeWidth="2" />
        <circle cx={px} cy={py} r="3.5" fill="#fcfaf5" />
      </svg>
      <div className="hx-scale-legend">
        <div><small className="almanac-eyebrow">FOOD EATEN</small><b className="tabular almanac-serif" style={{ color: "var(--terracotta)", fontSize: "22px" }}>{fmt(eaten)}</b><span className="almanac-mono">kcal</span></div>
        <div className={`hx-verdict stamp-tag ${tone === "deficit" ? "sage" : tone === "surplus" ? "tomato" : "mustard"}`}>
          {tone === "even" ? "✦ Balanced State" : tone === "deficit" ? `✦ ${fmt(-diff)} kcal deficit` : `✦ ${fmt(diff)} kcal surplus`}
        </div>
        <div><small className="almanac-eyebrow">ENERGY BURNED</small><b className="tabular almanac-serif" style={{ color: "var(--sage-leaf)", fontSize: "22px" }}>{fmt(burned)}</b><span className="almanac-mono">kcal</span></div>
      </div>
    </div>
  );
}

/* ------------------------------- Plate with rings ---------------------------- */
export function PlateRings({ steps, kcal, active, kcalGoal }: { steps: number; kcal: number; active: number; kcalGoal: number }) {
  const [hover, setHover] = useState(0);
  const rings = [
    { label: "Steps", value: steps, goal: 10000, unit: "steps", color: "#dbb258", r: 94 },
    { label: "Energy burned", value: kcal, goal: kcalGoal, unit: "kcal", color: "#d88c72", r: 74 },
    { label: "Active minutes", value: active, goal: 30, unit: "min", color: "#4a6559", r: 54 },
  ];
  const prog = useTween(1, 1200);
  const cur = rings[hover];
  return (
    <div className="hx-plate">
      <svg viewBox="0 0 280 280" role="img" aria-label="Activity rings on a plate">
        <circle cx="140" cy="140" r="134" fill="#fff" stroke="#e7e1d8" />
        <circle cx="140" cy="140" r="122" fill="#fbf8f1" stroke="#efe9dd" />
        {rings.map((g, i) => {
          const c = 2 * Math.PI * g.r, p = clamp(g.value / g.goal, 0, 1) * prog;
          return (
            <g key={g.label} onMouseEnter={() => setHover(i)} onFocus={() => setHover(i)} style={{ cursor: "pointer" }} opacity={hover === i ? 1 : 0.78}>
              <circle cx="140" cy="140" r={g.r} fill="none" stroke="#efeadf" strokeWidth="14" />
              <circle cx="140" cy="140" r={g.r} fill="none" stroke={g.color} strokeWidth="14" strokeLinecap="round"
                strokeDasharray={c} strokeDashoffset={c * (1 - p)} transform="rotate(-90 140 140)" />
            </g>
          );
        })}
        <text x="140" y="138" textAnchor="middle" className="hx-plate-num">{fmt(cur.value)}</text>
        <text x="140" y="158" textAnchor="middle" className="hx-plate-lbl">{cur.unit} · {Math.round((cur.value / cur.goal) * 100)}%</text>
      </svg>
      <ul className="hx-plate-legend">
        {rings.map((g, i) => (
          <li key={g.label} onMouseEnter={() => setHover(i)} className={hover === i ? "on" : ""}>
            <i style={{ background: g.color }} /><span>{g.label}</span><b>{fmt(g.value)}<small> / {fmt(g.goal)}</small></b>
          </li>
        ))}
      </ul>
    </div>
  );
}

/* ----------------------------------- Tiles ---------------------------------- */
function Spark({ data, color }: { data: number[]; color: string }) {
  const pts = data.filter(v => v > 0);
  if (pts.length < 2) return <svg className="hx-spark" viewBox="0 0 80 24" />;
  const max = Math.max(...data), min = Math.min(...pts);
  const xy = data.map((v, i) => [(i / (data.length - 1)) * 78 + 1, v > 0 ? 22 - ((v - min) / (max - min || 1)) * 19 : null] as const);
  const d = xy.filter(p => p[1] !== null).map((p, i) => `${i ? "L" : "M"}${p[0].toFixed(1)} ${(p[1] as number).toFixed(1)}`).join(" ");
  return <svg className="hx-spark" viewBox="0 0 80 24" preserveAspectRatio="none"><path d={d} fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" /></svg>;
}

export function Tile(p: { icon: ReactNode; color: string; label: string; num?: number | null; decimals?: number; unit?: string;
  text?: string; sub?: string; spark?: number[]; missing?: boolean; hint?: string }) {
  const t = useTween(p.num ?? 0, 900);
  const has = p.text !== undefined || (p.num !== undefined && p.num !== null);
  const isSteps = p.label.toLowerCase().includes("step");
  const stepPct = isSteps && p.num ? Math.min(100, Math.round((p.num / 10000) * 100)) : 0;

  return (
    <div className={`hx-tile ${has ? "" : "empty"}`} style={{ ["--tc" as string]: p.color }}>
      <div className="hx-tile-top"><span className="hx-tile-icon">{p.icon}</span>{p.label}</div>
      {has ? (
        <div className="hx-tile-val tabular">{p.text ?? (p.decimals ? t.toFixed(p.decimals) : fmt(t))}{p.unit && <small> {p.unit}</small>}</div>
      ) : (
        <div className="hx-tile-na">{p.missing ? "Not shared yet" : "No data today"}</div>
      )}
      {isSteps && has && (
        <div className="hx-footprint-trail" style={{ margin: "4px 0", height: "4px", background: "rgba(0,0,0,0.06)", borderRadius: "2px", overflow: "hidden" }}>
          <div style={{ width: `${stepPct}%`, height: "100%", background: p.color, borderRadius: "2px" }} />
        </div>
      )}
      <div className="hx-tile-foot">
        <span className="almanac-mono">{has ? p.sub : p.missing ? p.hint : p.sub}</span>
        {p.spark && <Spark data={p.spark} color={p.color} />}
      </div>
    </div>
  );
}

/* --------------------------------- Trend chart ------------------------------- */
export function TrendChart({ rows, mode, target, calTarget }: { rows: Row[]; mode: "energy" | "steps"; target: number; calTarget?: number }) {
  const [hi, setHi] = useState<number | null>(null);
  const ref = useRef<SVGSVGElement>(null);
  const W = 760, H = 270, padL = 8, padR = 8, top = 16, bot = 34;
  const n = rows.length, cw = (W - padL - padR) / n;
  const val = (r: Row) => (mode === "steps" ? r.steps : r.burned);
  const max = Math.max(...rows.map(r => Math.max(val(r), mode === "energy" ? r.eaten : 0)), target, 100) * 1.1;
  const y = (v: number) => top + (H - top - bot) * (1 - v / max);
  const line = rows.map((r, i) => (r.has_food ? [padL + cw * (i + 0.5), y(r.eaten)] : null));
  let d = ""; let pen = false;
  line.forEach(p => { if (p) { d += `${pen ? "L" : "M"}${p[0].toFixed(1)} ${p[1].toFixed(1)} `; pen = true; } else pen = false; });
  const grow = useTween(1, 800);
  const onMove = (e: React.MouseEvent) => {
    const b = ref.current?.getBoundingClientRect(); if (!b) return;
    setHi(clamp(Math.floor(((e.clientX - b.left) / b.width * W - padL) / cw), 0, n - 1));
  };
  const h = hi !== null ? rows[hi] : null;
  return (
    <div className="hx-chart" onMouseLeave={() => setHi(null)}>
      <svg ref={ref} viewBox={`0 0 ${W} ${H}`} onMouseMove={onMove} role="img" aria-label={mode === "steps" ? "Daily steps" : "Calories eaten versus burned"}>
        <defs>
          <linearGradient id="hxBurn" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stopColor="#e6b562" /><stop offset="1" stopColor="#f1d9a8" /></linearGradient>
          <linearGradient id="hxStep" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stopColor="#6f9b82" /><stop offset="1" stopColor="#b9d1c0" /></linearGradient>
        </defs>
        {[0.25, 0.5, 0.75].map(f => <line key={f} x1={padL} x2={W - padR} y1={y(max * f / 1.1)} y2={y(max * f / 1.1)} stroke="#f0ece3" />)}
        {rows.map((r, i) => {
          const v = val(r), bh = (H - top - bot) * (v / max) * grow;
          return (
            <g key={r.date} opacity={hi === null || hi === i ? 1 : 0.55}>
              {hi === i && <rect x={padL + cw * i} y={top} width={cw} height={H - top - bot} fill="#4a6559" opacity=".06" rx="6" />}
              {v > 0 && <rect x={padL + cw * i + cw * 0.18} y={H - bot - bh} width={cw * 0.64} height={bh} rx="5" fill={mode === "steps" ? "url(#hxStep)" : "url(#hxBurn)"} />}
              {(n <= 14 || i % 3 === 0 || i === n - 1) && <text x={padL + cw * (i + 0.5)} y={H - 16} textAnchor="middle" className="hx-axis">{shortDay(r.date).replace(/ /, "\u00a0")}</text>}
              {mode === "energy" && r.balance !== null && n <= 14 && (
                <text x={padL + cw * (i + 0.5)} y={H - 3} textAnchor="middle" className="hx-axis" fill={r.balance <= 0 ? "#3d7a5a" : "#c26a4d"}>{r.balance > 0 ? "+" : "−"}{fmt(Math.abs(r.balance))}</text>
              )}
            </g>
          );
        })}
        <line x1={padL} x2={W - padR} y1={y(target)} y2={y(target)} stroke="#d88c72" strokeWidth="1.5" strokeDasharray="5 5" opacity=".8" />
        {mode === "energy" && calTarget ? <line x1={padL} x2={W - padR} y1={y(calTarget)} y2={y(calTarget)} stroke="#4a6559" strokeWidth="1" strokeDasharray="2 4" opacity=".6" /> : null}
        {mode === "energy" && <path d={d} fill="none" stroke="#2f4d42" strokeWidth="2.5" strokeLinejoin="round" strokeLinecap="round" />}
        {mode === "energy" && line.map((p, i) => p && <circle key={i} cx={p[0]} cy={p[1]} r={hi === i ? 5.5 : 3.5} fill="#fff" stroke="#2f4d42" strokeWidth="2" />)}
      </svg>
      {h && (
        <div className="hx-tip" style={{ left: `${clamp(((hi! + 0.5) / n) * 100, 14, 86)}%` }}>
          <b>{shortDay(h.date)}{h.is_today ? " · today" : ""}</b>
          {mode === "steps" ? <span>{fmt(h.steps)} steps</span> : (
            <>
              <span>Eaten <i>{h.has_food ? `${fmt(h.eaten)} kcal` : "not logged"}</i></span>
              <span>Burned <i>{h.has_fit ? `${fmt(h.burned)} kcal` : "no sync"}</i></span>
              {h.balance !== null && <span>Balance <i style={{ color: h.balance <= 0 ? "#3d7a5a" : "#c26a4d" }}>{h.balance > 0 ? "+" : "−"}{fmt(Math.abs(h.balance))}</i></span>}
            </>
          )}
        </div>
      )}
      <div className="hx-chart-key">
        {mode === "energy" ? (<><span><i className="k-bar" />Burned (Google Fit)</span><span><i className="k-dot" />Eaten (food log)</span><span><i className="k-dash" />Burn target</span></>)
          : (<><span><i className="k-bar green" />Steps</span><span><i className="k-dash" />10,000 goal</span></>)}
      </div>
    </div>
  );
}

/* ------------------------------ Worked maths panel --------------------------- */
export function MathPanel({ ins }: { ins: Insights }) {
  const { math: m, profile: p } = ins;
  const [all, setAll] = useState(false);
  const [open, setOpen] = useState<number | null>(null);
  const bal = m.avg_balance, wk = m.weekly_kg;
  const steps = useMemo(() => {
    const s: { t: string; f: string; r: string; note: string }[] = [
      { t: "Resting energy (BMR)", f: `10 × ${p.weight_kg} + 6.25 × ${p.height_cm} − 5 × ${p.age} ${m.sex_const >= 0 ? "+" : "−"} ${Math.abs(m.sex_const)}`, r: `${fmt(m.bmr)} kcal`,
        note: "Mifflin-St Jeor equation: the energy your body spends just staying alive, lying completely still." },
      { t: "Predicted daily burn (TDEE)", f: `${fmt(m.bmr)} × ${m.activity_factor_used ?? "—"} (${p.activity_level})`, r: `${fmt(m.tdee)} kcal`,
        note: "BMR scaled by the activity level you chose in your profile. It is a formula guess, not a measurement." },
    ];
    if (m.measured_burn) s.push({ t: "Measured daily burn", f: `average of ${m.fit_days} Google Fit day${m.fit_days === 1 ? "" : "s"}`, r: `${fmt(m.measured_burn)} kcal`,
      note: `Google Fit reports resting plus active energy. Your real activity factor is ${m.activity_factor_real ?? "—"}, against ${m.activity_factor_used ?? "—"} assumed.` });
    s.push({ t: "Average daily intake", f: `food log over ${m.days_used} day${m.days_used === 1 ? "" : "s"} with both food and Fit data`, r: `${fmt(m.avg_eaten)} kcal`,
      note: "Only days where you logged food and Google Fit synced are compared, so a missed log never fakes a deficit. Today is excluded until it ends." });
    s.push({ t: "Energy balance", f: `${fmt(m.avg_eaten)} − ${fmt(m.avg_burned)}`, r: `${bal > 0 ? "+" : "−"}${fmt(Math.abs(bal))} kcal/day`,
      note: "Negative means you spend more than you eat (deficit); positive means surplus." });
    s.push({ t: "Body-fat equivalent", f: `${bal > 0 ? "+" : "−"}${fmt(Math.abs(bal))} × 7 ÷ ${m.kcal_per_kg_fat.toLocaleString()}`, r: `${wk > 0 ? "+" : "−"}${Math.abs(wk).toFixed(2)} kg/week`,
      note: "About 7,700 kcal equals 1 kg of body fat. Real weight moves with water and muscle too, so treat this as a trend." });
    s.push({ t: "Time to your target", f: `${Math.abs(m.remaining_kg)} kg to ${m.remaining_kg >= 0 ? "lose" : "gain"} ÷ ${Math.abs(wk).toFixed(2)}`, r: m.eta_weeks ? `≈ ${m.eta_weeks} weeks` : "pace not heading there",
      note: `${p.weight_kg} kg now, ${p.target_weight_kg} kg target.` });
    return s;
  }, [ins]); // eslint-disable-line react-hooks/exhaustive-deps
  const mp = m.macro_pct;
  return (
    <div>
      <div className="hx-conf"><span className={`hx-badge ${m.confidence}`}>{m.confidence} confidence</span>
        <small>{m.complete_days} finished day{m.complete_days === 1 ? "" : "s"} with food and Fit data</small>
        <button className="link-btn" onClick={() => setAll(a => !a)}>{all ? "Hide working" : "Show all working"}</button></div>
      <ol className="hx-steps">
        {steps.map((s, i) => (
          <li key={s.t} className={all || open === i ? "open" : ""}>
            <button onClick={() => setOpen(open === i ? null : i)} aria-expanded={all || open === i}>
              <span className="hx-n">{i + 1}</span>
              <span className="hx-st"><b>{s.t}</b><code>{s.f}</code></span>
              <span className="hx-res">{s.r}</span>
            </button>
            <p>{s.note}</p>
          </li>
        ))}
      </ol>
      <div className="hx-macro">
        <div className="hx-macro-head"><b>Where your calories come from</b><small>protein 4 · carbs 4 · fat 9 kcal per gram</small></div>
        <div className="hx-macro-bar"><span style={{ width: `${mp.protein}%`, background: "#d88c72" }} /><span style={{ width: `${mp.carbs}%`, background: "#dbb258" }} /><span style={{ width: `${mp.fat}%`, background: "#6d9caf" }} /></div>
        <div className="hx-macro-key"><span><i style={{ background: "#d88c72" }} />Protein {mp.protein}%</span><span><i style={{ background: "#dbb258" }} />Carbs {mp.carbs}%</span><span><i style={{ background: "#6d9caf" }} />Fat {mp.fat}%</span></div>
      </div>
    </div>
  );
}

export function InsightList({ items }: { items: Insights["insights"] }) {
  if (!items.length) return <p className="empty-state">Log a few meals and sync Google Fit to unlock personal insights.</p>;
  const Icon = { good: CheckCircle2, warn: AlertTriangle, info: Lightbulb };
  return (
    <div className="hx-insights">
      {items.map(it => { const I = Icon[it.tone]; return (
        <div key={it.title} className={`hx-ins ${it.tone}`}><I size={17} /><div><b>{it.title}</b><p>{it.body}</p></div></div>
      ); })}
    </div>
  );
}

/* ----------------------------------- Food lab -------------------------------- */
const FOODS = [
  { name: "Banana", emoji: "🍌", kcal: 105 }, { name: "Idli", emoji: "🍚", kcal: 60 }, { name: "Roti", emoji: "🫓", kcal: 100 },
  { name: "Samosa", emoji: "🥟", kcal: 260 }, { name: "Masala dosa", emoji: "🌯", kcal: 250 }, { name: "Gulab jamun", emoji: "🍡", kcal: 150 },
  { name: "Chai (sugar)", emoji: "🍵", kcal: 85 }, { name: "Veg biryani", emoji: "🍛", kcal: 350 }, { name: "Pizza slice", emoji: "🍕", kcal: 285 },
];

export function FoodLab({ burned, eaten, avgBalance, walk, weight }: { burned: number; eaten: number; avgBalance: number | null;
  walk: Insights["walk"] | null; weight: number | null }) {
  const [sel, setSel] = useState(3);
  const [qty, setQty] = useState(1);
  const f = FOODS[sel], kcal = f.kcal * qty;
  const w = walk ?? { stride_m: 0.7, kcal_per_km: 0.55 * (weight ?? 65), kcal_per_step: 0.55 * (weight ?? 65) * 0.0007, steps_per_km: 1430 };
  const km = kcal / w.kcal_per_km, steps = kcal / w.kcal_per_step, mins = (km / 5) * 60;
  const dayAfter = eaten + kcal - burned;
  return (
    <div className="hx-lab">
      <div>
        <p className="hx-lab-lead">Your burn so far today <b>({fmt(burned)} kcal)</b> equals…</p>
        <div className="hx-foods">
          {FOODS.map((x, i) => (
            <button key={x.name} className={i === sel ? "on" : ""} onClick={() => setSel(i)} title={`${x.name}: about ${x.kcal} kcal`}>
              <span>{x.emoji}</span><b>{burned > 0 ? (burned / x.kcal).toFixed(1) : "0"}</b><small>{x.name}</small>
            </button>
          ))}
        </div>
        <small className="hx-fine">Calories per item are typical averages and vary by recipe and size.</small>
      </div>
      <div className="hx-sim">
        <div className="hx-sim-head"><span className="hx-sim-emoji">{f.emoji}</span>
          <div><b>What if I eat {qty} {f.name}?</b><small>{fmt(kcal)} kcal</small></div>
          <div className="hx-qty"><button onClick={() => setQty(q => Math.max(1, q - 1))} aria-label="Fewer"><Minus size={14} /></button><b>{qty}</b><button onClick={() => setQty(q => Math.min(8, q + 1))} aria-label="More"><Plus size={14} /></button></div>
        </div>
        <div className="hx-sim-grid">
          <div><b>{fmt(steps)}</b><small>steps to walk it off</small></div>
          <div><b>{km.toFixed(1)} km</b><small>≈ {Math.round(mins)} min brisk walk</small></div>
          <div><b style={{ color: dayAfter <= 0 ? "#3d7a5a" : "#c26a4d" }}>{dayAfter > 0 ? "+" : "−"}{fmt(Math.abs(dayAfter))}</b><small>today&apos;s balance after it</small></div>
          {avgBalance !== null && <div><b>{((avgBalance + kcal) * 7 / 7700) > 0 ? "+" : "−"}{Math.abs((avgBalance + kcal) * 7 / 7700).toFixed(2)} kg</b><small>per week if this was daily</small></div>}
        </div>
        <small className="hx-fine">Walking cost ≈ {w.kcal_per_km} kcal per km for your weight, {w.stride_m} m stride.</small>
      </div>
    </div>
  );
}

/* ------------------------------- Activity breakdown -------------------------- */
const ACT_EMOJI: Record<string, string> = { Walking: "🚶", Running: "🏃", Cycling: "🚴", Aerobics: "🤸", "Strength training": "🏋️", Yoga: "🧘", Football: "⚽", Basketball: "🏀", Badminton: "🏸", "On foot": "👣" };
export function ActivityMix({ acts }: { acts: Record<string, number> }) {
  const list = Object.entries(acts).sort((a, b) => b[1] - a[1]);
  if (!list.length) return <p className="empty-state">No workouts or walks recorded by Google Fit today yet.</p>;
  const max = list[0][1];
  return (
    <div className="hx-acts">
      {list.map(([k, v]) => (
        <div key={k}><span>{ACT_EMOJI[k] ?? "✨"}</span><b>{k}</b>
          <div className="progress-track"><span className="progress-fill emerald" style={{ width: `${(v / max) * 100}%` }} /></div><em>{Math.round(v)} min</em></div>
      ))}
    </div>
  );
}
