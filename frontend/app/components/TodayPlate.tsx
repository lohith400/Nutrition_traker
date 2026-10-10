"use client";

import React, { useEffect, useState } from "react";
import { Flame, Plus, Sparkles, TrendingUp } from "lucide-react";
import { FoodGlyph } from "./art/FoodGlyph";
import { useClientNow } from "../hooks/useClientNow";

interface TodayPlateProps {
  consumed: number;
  target: number;
  burned?: number;
  protein: number;
  proteinTarget: number;
  carbs: number;
  carbsTarget: number;
  fat: number;
  fatTarget: number;
  fibre?: number;
  fibreTarget?: number;
  meals?: Array<{ food_name: string; meal_type: string; calories: number; protein_g: number }>;
  greeting: string;
  userName: string;
  onLogClick?: () => void;
}

export function TodayPlate({
  consumed,
  target,
  burned = 0,
  protein,
  proteinTarget,
  carbs,
  carbsTarget,
  fat,
  fatTarget,
  fibre = 0,
  fibreTarget = 30,
  meals = [],
  greeting,
  userName,
  onLogClick,
}: TodayPlateProps) {
  const now = useClientNow();
  // Count-up display for calories
  const [displayedCal, setDisplayedCal] = useState(0);

  useEffect(() => {
    const end = Math.round(consumed);
    if (end === 0) {
      setDisplayedCal(0);
      return;
    }
    const duration = 750; // ms
    const startTime = performance.now();
    let animId: number;

    const tick = (now: number) => {
      const elapsed = now - startTime;
      const progress = Math.min(1, elapsed / duration);
      // easeOutExpo
      const eased = progress === 1 ? 1 : 1 - Math.pow(2, -10 * progress);
      setDisplayedCal(Math.round(eased * end));
      if (progress < 1) {
        animId = requestAnimationFrame(tick);
      }
    };

    animId = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(animId);
  }, [consumed]);

  const remaining = Math.round(target - consumed);
  const over = target > 0 && consumed > target;

  // Segment percentages for the plate rim (each capped at 100%)
  const protPct = proteinTarget > 0 ? Math.min(1, protein / proteinTarget) : 0;
  const carbPct = carbsTarget > 0 ? Math.min(1, carbs / carbsTarget) : 0;
  const fatPct = fatTarget > 0 ? Math.min(1, fat / fatTarget) : 0;
  const fibrePct = fibreTarget > 0 ? Math.min(1, fibre / fibreTarget) : 0;

  // Geometry for SVG segmented rim
  // Circle perimeter = 2 * PI * r
  const r = 98;
  const circumference = 2 * Math.PI * r; // ~615.75
  // Each of the 4 segments takes 1/4th of circumference (~153.9) minus gap
  const quadLen = circumference / 4;
  const gap = 6;
  const arcLen = quadLen - gap;

  // Unique meals to place as stamps on the plate
  const plateMeals = meals.slice(0, 5);

  return (
    <div className="today-plate-hero">
      {/* Editorial Header */}
      <div className="plate-hero-intro">
        <div className="almanac-eyebrow">
          <span>ALMANAC DAILY DISPATCH</span>
          <span className="dot-sep">·</span>
          <span suppressHydrationWarning>{now ? now.toLocaleDateString("en-IN", { weekday: "short", month: "short", day: "numeric" }) : "Today"}</span>
        </div>
        <h1 className="almanac-serif">
          {greeting}, <em>{userName}</em>
        </h1>
        <p className="plate-sub">
          {target === 0
            ? "Complete your profile to generate today's targeted plate balance."
            : over
            ? `You've reached today's ceiling (${Math.abs(remaining)} kcal over). Focus on restorative hydration and gentle movement.`
            : `${remaining} kcal and ${Math.max(0, Math.round(proteinTarget - protein))}g protein remaining to balance today's plate.`}
        </p>
      </div>

      {/* The Crafted Plate Ceramic Experience */}
      <div className="plate-stage">
        <div className="plate-ceramic-wrap">
          <svg
            className="plate-ceramic-svg"
            viewBox="0 0 240 240"
            role="img"
            aria-label={`Today's Plate: ${Math.round(consumed)} of ${Math.round(target)} calories eaten`}
          >
            {/* Outer Ceramic Plate Base */}
            <circle cx="120" cy="120" r="114" fill="#faf8f2" stroke="#e0d9ca" strokeWidth="2" />
            <circle cx="120" cy="120" r="108" fill="#ffffff" stroke="#ede7dc" strokeWidth="1" />
            <circle cx="120" cy="120" r="82" fill="#fcfaf5" stroke="#eadecb" strokeWidth="1" strokeDasharray="2 3" />

            {/* Segment Track 1: Protein (Top-Right, 0° to 90° -> 270° offset in SVG) */}
            <circle
              cx="120"
              cy="120"
              r={r}
              fill="none"
              stroke="#ebf1ec"
              strokeWidth="9"
              strokeDasharray={`${arcLen} ${circumference - arcLen}`}
              transform="rotate(-90 120 120)"
            />
            <circle
              cx="120"
              cy="120"
              r={r}
              fill="none"
              stroke="var(--sage-leaf)"
              strokeWidth="9"
              strokeLinecap="round"
              strokeDasharray={`${protPct * arcLen} ${circumference - (protPct * arcLen)}`}
              transform="rotate(-90 120 120)"
              className="plate-arc"
            />

            {/* Segment Track 2: Carbs (Bottom-Right, 90° to 180° -> 0° offset) */}
            <circle
              cx="120"
              cy="120"
              r={r}
              fill="none"
              stroke="#fcf2dc"
              strokeWidth="9"
              strokeDasharray={`${arcLen} ${circumference - arcLen}`}
              transform="rotate(0 120 120)"
            />
            <circle
              cx="120"
              cy="120"
              r={r}
              fill="none"
              stroke="var(--mustard)"
              strokeWidth="9"
              strokeLinecap="round"
              strokeDasharray={`${carbPct * arcLen} ${circumference - (carbPct * arcLen)}`}
              transform="rotate(0 120 120)"
              className="plate-arc"
            />

            {/* Segment Track 3: Fat (Bottom-Left, 180° to 270° -> 90° offset) */}
            <circle
              cx="120"
              cy="120"
              r={r}
              fill="none"
              stroke="#faeae4"
              strokeWidth="9"
              strokeDasharray={`${arcLen} ${circumference - arcLen}`}
              transform="rotate(90 120 120)"
            />
            <circle
              cx="120"
              cy="120"
              r={r}
              fill="none"
              stroke="var(--terracotta)"
              strokeWidth="9"
              strokeLinecap="round"
              strokeDasharray={`${fatPct * arcLen} ${circumference - (fatPct * arcLen)}`}
              transform="rotate(90 120 120)"
              className="plate-arc"
            />

            {/* Segment Track 4: Fibre (Top-Left, 270° to 360° -> 180° offset) */}
            <circle
              cx="120"
              cy="120"
              r={r}
              fill="none"
              stroke="#f0f3e6"
              strokeWidth="9"
              strokeDasharray={`${arcLen} ${circumference - arcLen}`}
              transform="rotate(180 120 120)"
            />
            <circle
              cx="120"
              cy="120"
              r={r}
              fill="none"
              stroke="var(--olive)"
              strokeWidth="9"
              strokeLinecap="round"
              strokeDasharray={`${fibrePct * arcLen} ${circumference - (fibrePct * arcLen)}`}
              transform="rotate(180 120 120)"
              className="plate-arc"
            />
          </svg>

          {/* Plate Center: Energetic Numerical Hub */}
          <div className="plate-center-hub">
            <span className="plate-center-label almanac-eyebrow">
              {target > 0 ? (over ? "OVER TARGET" : "REMAINING") : "TOTAL EATEN"}
            </span>
            <div className="plate-center-cal almanac-serif tabular">
              {target > 0 ? Math.abs(remaining) : displayedCal}
            </div>
            <span className="plate-center-unit almanac-mono">kcal</span>

            {burned > 0 && (
              <div className="plate-burned-pill" title={`${Math.round(burned)} kcal burned recorded in Google Fit`}>
                <Flame size={12} />
                <span className="tabular">{Math.round(burned)}</span> burned
              </div>
            )}
          </div>

          {/* Food Glyphs Settling on the Plate */}
          {plateMeals.length > 0 && (
            <div className="plate-food-stamps">
              {plateMeals.map((m, idx) => (
                <div
                  key={`${m.food_name}-${idx}`}
                  className="plate-stamp-chip"
                  style={{ animationDelay: `${idx * 0.12}s` }}
                  title={`${m.food_name} (${m.calories} kcal, ${m.protein_g}g P)`}
                >
                  <FoodGlyph name={m.food_name} mealType={m.meal_type} size={22} />
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Quadrant Legend & Macro Progress Rails */}
        <div className="plate-quadrant-legend">
          <div className="quadrant-item quad-protein">
            <div className="quad-head">
              <span className="quad-dot" />
              <b className="almanac-serif">Protein</b>
              <span className="quad-val tabular">{Math.round(protein)} / {Math.round(proteinTarget)}g</span>
            </div>
            <div className="progress-track">
              <span className="progress-fill" style={{ width: `${protPct * 100}%`, background: "var(--sage-leaf)" }} />
            </div>
          </div>

          <div className="quadrant-item quad-carbs">
            <div className="quad-head">
              <span className="quad-dot" />
              <b className="almanac-serif">Carbs</b>
              <span className="quad-val tabular">{Math.round(carbs)} / {Math.round(carbsTarget)}g</span>
            </div>
            <div className="progress-track">
              <span className="progress-fill" style={{ width: `${carbPct * 100}%`, background: "var(--mustard)" }} />
            </div>
          </div>

          <div className="quadrant-item quad-fat">
            <div className="quad-head">
              <span className="quad-dot" />
              <b className="almanac-serif">Fat</b>
              <span className="quad-val tabular">{Math.round(fat)} / {Math.round(fatTarget)}g</span>
            </div>
            <div className="progress-track">
              <span className="progress-fill" style={{ width: `${fatPct * 100}%`, background: "var(--terracotta)" }} />
            </div>
          </div>

          <div className="quadrant-item quad-fibre">
            <div className="quad-head">
              <span className="quad-dot" />
              <b className="almanac-serif">Dietary Fibre</b>
              <span className="quad-val tabular">{Math.round(fibre)} / {Math.round(fibreTarget)}g</span>
            </div>
            <div className="progress-track">
              <span className="progress-fill" style={{ width: `${fibrePct * 100}%`, background: "var(--olive)" }} />
            </div>
          </div>

          {onLogClick && (
            <button type="button" className="plate-action-btn primary-btn" onClick={onLogClick}>
              <Plus size={16} /> Log today&apos;s food
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
