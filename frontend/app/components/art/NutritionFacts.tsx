"use client";

import React from "react";

interface NutritionFactsProps {
  title?: string;
  subtitle?: string;
  calories: number;
  protein_g: number;
  carbs_g: number;
  fat_g: number;
  fibre_g?: number | null;
  dailyTargets?: {
    calories?: number;
    protein_g?: number;
    carbs_g?: number;
    fat_g?: number;
    fibre_g?: number;
  };
  compact?: boolean;
  className?: string;
}

export function NutritionFacts({
  title = "Nutrition Facts",
  subtitle,
  calories,
  protein_g,
  carbs_g,
  fat_g,
  fibre_g,
  dailyTargets,
  compact = false,
  className = "",
}: NutritionFactsProps) {
  // Standard Indian ICMR-NIN 2000 kcal reference percentages when custom daily targets not given
  const refCal = dailyTargets?.calories || 2000;
  const refProt = dailyTargets?.protein_g || 60;
  const refCarb = dailyTargets?.carbs_g || 260;
  const refFat = dailyTargets?.fat_g || 67;
  const refFibre = dailyTargets?.fibre_g || 30;

  const pct = (val: number, ref: number) => Math.min(999, Math.round((val / ref) * 100));

  return (
    <div className={`nutrition-facts-card ${compact ? "compact" : ""} ${className}`} role="region" aria-label="Nutrition Facts">
      <div className="nf-header">
        <h4 className="nf-title">{title}</h4>
        {subtitle && <p className="nf-sub">{subtitle}</p>}
      </div>

      <div className="nf-divider-thick" />

      <div className="nf-calories-row">
        <div>
          <span className="nf-label">Amount Per Serving</span>
          <b className="nf-cal-title">Calories</b>
        </div>
        <div className="nf-cal-val tabular">{Math.round(calories)}</div>
      </div>

      <div className="nf-divider-med" />

      <div className="nf-dv-header">
        <span>% Daily Value*</span>
      </div>

      <div className="nf-divider-thin" />

      <div className="nf-line">
        <span>
          <b>Total Fat</b> <span className="tabular">{fat_g.toFixed(1)}g</span>
        </span>
        <b className="nf-dv tabular">{pct(fat_g, refFat)}%</b>
      </div>

      <div className="nf-divider-thin" />

      <div className="nf-line">
        <span>
          <b>Total Carbohydrate</b> <span className="tabular">{carbs_g.toFixed(1)}g</span>
        </span>
        <b className="nf-dv tabular">{pct(carbs_g, refCarb)}%</b>
      </div>

      {fibre_g != null && (
        <>
          <div className="nf-divider-thin" />
          <div className="nf-line nf-indent">
            <span>
              Dietary Fibre <span className="tabular">{fibre_g.toFixed(1)}g</span>
            </span>
            <b className="nf-dv tabular">{pct(fibre_g, refFibre)}%</b>
          </div>
        </>
      )}

      <div className="nf-divider-thin" />

      <div className="nf-line">
        <span>
          <b>Protein</b> <span className="tabular">{protein_g.toFixed(1)}g</span>
        </span>
        <b className="nf-dv tabular">{pct(protein_g, refProt)}%</b>
      </div>

      <div className="nf-divider-thick" />

      {!compact && (
        <p className="nf-footnote">
          *Percent Daily Values are based on your personal NutriSync targets (or 2,000 kcal reference).
        </p>
      )}
    </div>
  );
}
