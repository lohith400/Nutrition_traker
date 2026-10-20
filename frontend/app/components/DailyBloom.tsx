"use client";

import React, { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { Flame } from "lucide-react";
import { FoodGlyph } from "./art/FoodGlyph";
import type { MicronutrientItem } from "./VitaminShelf";
import "./DailyBloom.css";

/* ──────────────────────────────────────────────────────────────────────────
   Daily Bloom
   One flower = one day of eating.
   - 16 petals: 4 macros, 7 vitamins, 5 minerals. Petal length = % of today's target.
   - The dotted ring is 100% of target. A petal that reaches it = target met.
   - The faint "ghost flower" is the ideal day; the coloured flower is today.
   - The outer ring is calories. The hub shows what is left (or any petal you hover/tap).
   Pure SVG, no libraries, no WebGL, no network assets.
   ────────────────────────────────────────────────────────────────────────── */

export type BloomGroup = "macro" | "vitamin" | "mineral";
export type BloomItem = {
  key: string;
  label: string;
  short: string;
  group: BloomGroup;
  tone: string;
  amount: number | null;
  target: number;
  unit: string;
  pct: number | null; // 0..n, null = no data / no target
};

const C = 180; // viewBox centre
const R0 = 62; // petal base radius (hub edge)
const R100 = 130; // 100% of target
const LEN100 = R100 - R0;
const CAP = 1.15; // petals stop growing at 115%
const RING_R = 148; // calorie ring
const LABEL_R = 164;
const BASE_HALF = 7;
const MAX_HALF = 10.5;

const TONES: Record<string, string> = {
  protein: "#3e5d4e",
  carbs: "#d49b35",
  fat: "#b84e37",
  fibre: "#606c38",
  vitamin: "#8a5673",
  mineral: "#2f6f73",
};

const DEFAULT_MICROS: Array<Pick<MicronutrientItem, "key" | "name" | "symbol" | "group" | "target" | "unit">> = [
  { key: "vita", name: "Vitamin A", symbol: "A", group: "vitamin", target: 1000, unit: "µg" },
  { key: "vitc", name: "Vitamin C", symbol: "C", group: "vitamin", target: 80, unit: "mg" },
  { key: "vitd", name: "Vitamin D", symbol: "D", group: "vitamin", target: 15, unit: "µg" },
  { key: "vite", name: "Vitamin E", symbol: "E", group: "vitamin", target: 10, unit: "mg" },
  { key: "vitk", name: "Vitamin K", symbol: "K", group: "vitamin", target: 55, unit: "µg" },
  { key: "folate", name: "Folate / B9", symbol: "B9", group: "vitamin", target: 300, unit: "µg" },
  { key: "bcomplex", name: "B-Complex", symbol: "B", group: "vitamin", target: 100, unit: "%" },
  { key: "iron", name: "Iron", symbol: "Fe", group: "mineral", target: 19, unit: "mg" },
  { key: "calcium", name: "Calcium", symbol: "Ca", group: "mineral", target: 1000, unit: "mg" },
  { key: "zinc", name: "Zinc", symbol: "Zn", group: "mineral", target: 17, unit: "mg" },
  { key: "magnesium", name: "Magnesium", symbol: "Mg", group: "mineral", target: 440, unit: "mg" },
  { key: "potassium", name: "Potassium", symbol: "K⁺", group: "mineral", target: 3500, unit: "mg" },
];

function ratio(amount: number, target: number): number | null {
  return target > 0 ? amount / target : null;
}

export function buildBloomItems(args: {
  protein: number; proteinTarget: number;
  carbs: number; carbsTarget: number;
  fat: number; fatTarget: number;
  fibre: number; fibreTarget: number;
  micros?: MicronutrientItem[] | null;
}): BloomItem[] {
  const macros: BloomItem[] = [
    { key: "protein", label: "Protein", short: "Pro", group: "macro", tone: TONES.protein, amount: args.protein, target: args.proteinTarget, unit: "g", pct: ratio(args.protein, args.proteinTarget) },
    { key: "carbs", label: "Carbs", short: "Carb", group: "macro", tone: TONES.carbs, amount: args.carbs, target: args.carbsTarget, unit: "g", pct: ratio(args.carbs, args.carbsTarget) },
    { key: "fat", label: "Fat", short: "Fat", group: "macro", tone: TONES.fat, amount: args.fat, target: args.fatTarget, unit: "g", pct: ratio(args.fat, args.fatTarget) },
    { key: "fibre", label: "Dietary fibre", short: "Fib", group: "macro", tone: TONES.fibre, amount: args.fibre, target: args.fibreTarget, unit: "g", pct: ratio(args.fibre, args.fibreTarget) },
  ];
  const byKey = new Map((args.micros || []).map((m) => [m.key, m]));
  const micros: BloomItem[] = DEFAULT_MICROS.map((d) => {
    const m = byKey.get(d.key);
    const pct = m && m.pct !== null && m.pct !== undefined ? m.pct / 100 : null;
    return {
      key: d.key,
      label: m?.name || d.name,
      short: m?.symbol || d.symbol,
      group: d.group,
      tone: d.group === "vitamin" ? TONES.vitamin : TONES.mineral,
      amount: m?.amount ?? null,
      target: m?.target ?? d.target,
      unit: m?.unit || d.unit,
      pct,
    };
  });
  return [...macros, ...micros];
}

/* ── geometry ─────────────────────────────────────────────────────────── */

function petalPath(len: number): string {
  const k = Math.max(len, 0.0001);
  const y0 = -R0;
  const y1 = -(R0 + k);
  return (
    `M ${-BASE_HALF} ${y0} ` +
    `C ${-MAX_HALF * 1.05} ${y0 - k * 0.32}, ${-MAX_HALF} ${y0 - k * 0.78}, 0 ${y1} ` +
    `C ${MAX_HALF} ${y0 - k * 0.78}, ${MAX_HALF * 1.05} ${y0 - k * 0.32}, ${BASE_HALF} ${y0} Z`
  );
}

const rad = (deg: number) => (deg * Math.PI) / 180;

function fmt(n: number | null, unit: string): string {
  if (n === null || n === undefined) return "no data yet";
  const v = n >= 100 ? Math.round(n) : Math.round(n * 10) / 10;
  return `${v} ${unit}`;
}

/* ── pure SVG (also used for static previews) ─────────────────────────── */

export function BloomSvg(props: {
  items: BloomItem[];
  pcts: number[]; // tweened 0..n, one per item
  calPct: number; // tweened 0..1
  active: number | null;
  onEnter?: (i: number) => void;
  onLeave?: () => void;
  onToggle?: (i: number) => void;
  ariaLabel: string;
}) {
  const { items, pcts, calPct, active, onEnter, onLeave, onToggle, ariaLabel } = props;
  const n = items.length;
  const step = 360 / n;
  const circ = 2 * Math.PI * RING_R;
  const calLen = Math.max(0, Math.min(1, calPct)) * circ;
  const dim = active !== null;

  return (
    <svg className="bloom-svg" viewBox="0 0 360 360" role="group" aria-label={ariaLabel}>
      <defs>
        {Object.entries(TONES).map(([k, c]) => (
          <linearGradient key={k} id={`bloomG-${k}`} x1="0" y1="1" x2="0" y2="0">
            <stop offset="0" stopColor={c} stopOpacity="0.42" />
            <stop offset="1" stopColor={c} stopOpacity="1" />
          </linearGradient>
        ))}
        <linearGradient id="bloomCal" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#d49b35" />
          <stop offset="1" stopColor="#b84e37" />
        </linearGradient>
        <radialGradient id="bloomHub" cx="50%" cy="42%" r="62%">
          <stop offset="0" stopColor="#fffefa" />
          <stop offset="1" stopColor="#f6efe0" />
        </radialGradient>
      </defs>

      {/* calorie ring */}
      <circle cx={C} cy={C} r={RING_R} fill="none" stroke="#efe7d6" strokeWidth="6" />
      {calLen > 0.5 && (
        <circle
          cx={C} cy={C} r={RING_R} fill="none" stroke="url(#bloomCal)" strokeWidth="6" strokeLinecap="round"
          strokeDasharray={`${calLen} ${circ - calLen}`} transform={`rotate(-90 ${C} ${C})`}
        />
      )}

      {/* guide rings: 50% (faint) and 100% of target (dotted) */}
      <circle cx={C} cy={C} r={R0 + LEN100 * 0.5} fill="none" stroke="#e6dcc7" strokeWidth="0.8" strokeDasharray="1 4" strokeLinecap="round" />
      <circle cx={C} cy={C} r={R100} fill="none" stroke="#bfae8a" strokeWidth="1.1" strokeDasharray="1.5 4.5" strokeLinecap="round" />

      {/* petals */}
      {items.map((it, i) => {
        const angle = i * step;
        const v = pcts[i] ?? 0;
        const hasData = it.pct !== null;
        const len = hasData ? Math.max(v > 0.004 ? 5 : 0, Math.min(v, CAP) * LEN100) : 0;
        const isActive = active === i;
        const faded = dim && !isActive;
        const tx = C + LABEL_R * Math.sin(rad(angle));
        const ty = C - LABEL_R * Math.cos(rad(angle));
        const grp = it.group === "macro" ? it.key : it.group;
        const spoken = hasData
          ? `${it.label}: ${Math.round((it.pct as number) * 100)} percent of daily target`
          : `${it.label}: no data yet`;
        return (
          <g key={it.key}>
            <g
              className={`bloom-petal${isActive ? " is-active" : ""}`}
              transform={`translate(${C} ${C}) rotate(${angle})`}
              tabIndex={0}
              role="img"
              aria-label={spoken}
              onPointerEnter={(e) => { if (e.pointerType === "mouse") onEnter?.(i); }}
              onPointerLeave={(e) => { if (e.pointerType === "mouse") onLeave?.(); }}
              onFocus={() => onEnter?.(i)}
              onBlur={() => onLeave?.()}
              onClick={() => onToggle?.(i)}
              style={{ opacity: faded ? 0.34 : 1 }}
            >
              {/* ghost = the ideal day (also the hit area) */}
              <path d={petalPath(LEN100)} fill="rgba(255,255,255,0.0)" stroke="#d8ccb2" strokeWidth="0.8" pointerEvents="all" />
              {hasData ? (
                <>
                  <path d={petalPath(len)} fill={`url(#bloomG-${grp})`} stroke={it.tone} strokeOpacity="0.55" strokeWidth="0.7" />
                  {len > 16 && (
                    <path d={`M 0 ${-(R0 + 3)} L 0 ${-(R0 + len * 0.86)}`} stroke="#fff" strokeOpacity="0.38" strokeWidth="1" strokeLinecap="round" />
                  )}
                </>
              ) : (
                <circle cx="0" cy={-(R0 + 9)} r="2.4" fill="none" stroke="#b9ad92" strokeWidth="1" strokeDasharray="1.5 2" />
              )}
            </g>
            <text
              x={tx} y={ty} textAnchor="middle" dominantBaseline="central"
              className="bloom-label" fill={it.tone}
              style={{ opacity: faded ? 0.3 : isActive ? 1 : 0.82, fontWeight: isActive ? 700 : 500 }}
            >
              {it.short}
            </text>
          </g>
        );
      })}

      {/* hub disc */}
      <circle cx={C} cy={C} r={R0 - 5} fill="url(#bloomHub)" stroke="#e7dcc6" strokeWidth="1" />
    </svg>
  );
}

/* ── animation: ease petals open once, then glide on updates ───────────── */

function useTween(targets: number[], reduced: boolean, staggerCount: number): number[] {
  const [vals, setVals] = useState<number[]>(() => targets.map(() => 0));
  const cur = useRef<number[]>(targets.map(() => 0));
  const first = useRef(true);
  const sig = targets.map((t) => t.toFixed(3)).join(",");

  useEffect(() => {
    if (reduced) {
      cur.current = [...targets];
      setVals([...targets]);
      return;
    }
    const from = [...cur.current];
    const t0 = performance.now();
    const stagger = first.current ? 40 : 0;
    first.current = false;
    const dur = 1150;
    const total = dur + staggerCount * stagger;
    let raf = 0;
    const tick = (now: number) => {
      const out = targets.map((to, i) => {
        const delay = i < staggerCount ? i * stagger : 0;
        const p = Math.min(1, Math.max(0, (now - t0 - delay) / dur));
        const e = p === 1 ? 1 : 1 - Math.pow(2, -9 * p);
        return from[i] + (to - from[i]) * e;
      });
      cur.current = out;
      setVals(out);
      if (now - t0 < total) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sig, reduced]);

  return vals;
}

/* ── component ────────────────────────────────────────────────────────── */

export interface DailyBloomProps {
  consumed: number;
  target: number;
  burned?: number;
  protein: number; proteinTarget: number;
  carbs: number; carbsTarget: number;
  fat: number; fatTarget: number;
  fibre?: number; fibreTarget?: number;
  micros?: MicronutrientItem[] | null;
  showShelfLink?: boolean;
  meals?: Array<{ food_name: string; meal_type: string; calories: number; protein_g: number }>;
}

export function DailyBloom({
  consumed, target, burned = 0,
  protein, proteinTarget, carbs, carbsTarget, fat, fatTarget,
  fibre = 0, fibreTarget = 30, micros = null, showShelfLink = true, meals = [],
}: DailyBloomProps) {
  const [reduced, setReduced] = useState(false);
  const [hover, setHover] = useState<number | null>(null);
  const [pinned, setPinned] = useState<number | null>(null);

  useEffect(() => {
    const mq = window.matchMedia("(prefers-reduced-motion: reduce)");
    setReduced(mq.matches);
    const on = () => setReduced(mq.matches);
    mq.addEventListener?.("change", on);
    return () => mq.removeEventListener?.("change", on);
  }, []);

  const items = useMemo(
    () => buildBloomItems({ protein, proteinTarget, carbs, carbsTarget, fat, fatTarget, fibre, fibreTarget, micros }),
    [protein, proteinTarget, carbs, carbsTarget, fat, fatTarget, fibre, fibreTarget, micros]
  );

  const remaining = Math.round(target - consumed);
  const over = target > 0 && consumed > target;
  const hubTarget = target > 0 ? Math.abs(remaining) : Math.round(consumed);
  const calTarget = target > 0 ? Math.min(1, consumed / target) : 0;

  const targets = useMemo(
    () => [...items.map((it) => it.pct ?? 0), calTarget, hubTarget],
    [items, calTarget, hubTarget]
  );
  const vals = useTween(targets, reduced, items.length);
  const pcts = vals.slice(0, items.length);
  const calPct = vals[items.length] ?? 0;
  const hubNumber = Math.round(vals[items.length + 1] ?? 0);

  const active = hover ?? pinned;
  const a = active !== null ? items[active] : null;
  const withData = items.filter((it) => it.pct !== null);
  const metCount = withData.filter((it) => (it.pct as number) >= 1).length;

  const ariaLabel =
    `Daily nutrition bloom. ${Math.round(consumed)} of ${Math.round(target)} calories eaten. ` +
    `${withData.length} of ${items.length} nutrients have data today.`;

  return (
    <div className="bloom">
      <div className="bloom-wrap">
        <BloomSvg
          items={items}
          pcts={pcts}
          calPct={calPct}
          active={active}
          onEnter={setHover}
          onLeave={() => setHover(null)}
          onToggle={(i) => setPinned((p) => (p === i ? null : i))}
          ariaLabel={ariaLabel}
        />
        <div className="bloom-hub" aria-live="polite">
          {a ? (
            <>
              <span className="bloom-hub-eyebrow" style={{ color: a.tone }}>{a.label}</span>
              <span className="bloom-hub-num almanac-serif tabular">
                {a.pct !== null ? `${Math.round(a.pct * 100)}%` : "–"}
              </span>
              <span className="bloom-hub-sub almanac-mono">
                {a.pct !== null ? `${fmt(a.amount, a.unit)} of ${fmt(a.target, a.unit)}` : "no data yet"}
              </span>
            </>
          ) : (
            <>
              <span className="bloom-hub-eyebrow">{target > 0 ? (over ? "OVER TARGET" : "REMAINING") : "TOTAL EATEN"}</span>
              <span className="bloom-hub-num almanac-serif tabular">{hubNumber}</span>
              <span className="bloom-hub-sub almanac-mono">kcal</span>
            </>
          )}
        </div>
      </div>

      <div className="bloom-legend" aria-hidden="true">
        <span><i style={{ background: TONES.protein }} />Macros</span>
        <span><i style={{ background: TONES.vitamin }} />Vitamins</span>
        <span><i style={{ background: TONES.mineral }} />Minerals</span>
      </div>
      <p className="bloom-hint">
        Dotted ring = 100% of today&apos;s target.{" "}
        {withData.length > 0 ? `${metCount} of ${withData.length} reached.` : "Log a meal to open the petals."}{" "}
        Hover or tap a petal.{" "}
        {showShelfLink && <Link href="/health#vitamins" className="bloom-link">Open the full vitamin shelf</Link>}
      </p>

      {(meals.length > 0 || burned > 0) && (
        <div className="bloom-foot">
          {meals.length > 0 && (
            <div className="bloom-meals" aria-label="Foods logged today">
              {meals.slice(0, 6).map((m, idx) => (
                <span
                  key={`${m.food_name}-${idx}`}
                  className="bloom-chip"
                  style={{ animationDelay: `${0.5 + idx * 0.09}s` }}
                  title={`${m.food_name} · ${m.calories} kcal · ${m.protein_g} g protein`}
                >
                  <FoodGlyph name={m.food_name} mealType={m.meal_type} size={22} />
                </span>
              ))}
            </div>
          )}
          {burned > 0 && (
            <span className="plate-burned-pill" title={`${Math.round(burned)} kcal burned recorded in Google Fit`}>
              <Flame size={12} />
              <span className="tabular">{Math.round(burned)}</span> burned
            </span>
          )}
        </div>
      )}
    </div>
  );
}

export default DailyBloom;
