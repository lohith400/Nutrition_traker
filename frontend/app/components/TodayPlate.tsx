"use client";

import React from "react";
import { Plus } from "lucide-react";
import { useClientNow } from "../hooks/useClientNow";
import { DailyBloom } from "./DailyBloom";
import type { MicronutrientItem } from "./VitaminShelf";

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
  micros?: MicronutrientItem[] | null;
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
  micros = null,
  meals = [],
  greeting,
  userName,
  onLogClick,
}: TodayPlateProps) {
  const now = useClientNow();
  const remaining = Math.round(target - consumed);
  const over = target > 0 && consumed > target;

  // Segment percentages for the plate rim (each capped at 100%)
  const protPct = proteinTarget > 0 ? Math.min(1, protein / proteinTarget) : 0;
  const carbPct = carbsTarget > 0 ? Math.min(1, carbs / carbsTarget) : 0;
  const fatPct = fatTarget > 0 ? Math.min(1, fat / fatTarget) : 0;
  const fibrePct = fibreTarget > 0 ? Math.min(1, fibre / fibreTarget) : 0;

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

      {/* Left: the Daily Bloom (all of today's intake in one view). Right: exact macro rails. */}
      <div className="plate-stage">
        <DailyBloom
          consumed={consumed}
          target={target}
          burned={burned}
          protein={protein}
          proteinTarget={proteinTarget}
          carbs={carbs}
          carbsTarget={carbsTarget}
          fat={fat}
          fatTarget={fatTarget}
          fibre={fibre}
          fibreTarget={fibreTarget}
          micros={micros}
          meals={meals}
        />

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
