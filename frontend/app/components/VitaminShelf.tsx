"use client";

import React, { useState } from "react";
import { Info, Sparkles, ChevronDown } from "lucide-react";

export type MicronutrientItem = {
  key: string;
  name: string;
  symbol: string;
  group: "vitamin" | "mineral";
  amount: number | null; // null represents unknown, not zero
  target: number;
  unit: string;
  pct: number | null; // null if unknown
  topFoods?: Array<{ food_name: string; amount: string }>;
};

interface VitaminShelfProps {
  items?: MicronutrientItem[] | null;
  status?: "ok" | "loading" | "not_available";
  compact?: boolean;
  className?: string;
}

const DEFAULT_SLOTS: MicronutrientItem[] = [
  { key: "vita", name: "Vitamin A", symbol: "A", group: "vitamin", amount: null, target: 1000, unit: "µg", pct: null },
  { key: "vitc", name: "Vitamin C", symbol: "C", group: "vitamin", amount: null, target: 80, unit: "mg", pct: null },
  { key: "vitd", name: "Vitamin D", symbol: "D", group: "vitamin", amount: null, target: 15, unit: "µg", pct: null },
  { key: "vite", name: "Vitamin E", symbol: "E", group: "vitamin", amount: null, target: 10, unit: "mg", pct: null },
  { key: "vitk", name: "Vitamin K", symbol: "K", group: "vitamin", amount: null, target: 55, unit: "µg", pct: null },
  { key: "folate", name: "Folate / B9", symbol: "B₉", group: "vitamin", amount: null, target: 300, unit: "µg", pct: null },
  { key: "bcomplex", name: "B-Complex", symbol: "B", group: "vitamin", amount: null, target: 100, unit: "%", pct: null },
  { key: "iron", name: "Iron", symbol: "Fe", group: "mineral", amount: null, target: 19, unit: "mg", pct: null },
  { key: "calcium", name: "Calcium", symbol: "Ca", group: "mineral", amount: null, target: 1000, unit: "mg", pct: null },
  { key: "zinc", name: "Zinc", symbol: "Zn", group: "mineral", amount: null, target: 17, unit: "mg", pct: null },
  { key: "magnesium", name: "Magnesium", symbol: "Mg", group: "mineral", amount: null, target: 440, unit: "mg", pct: null },
  { key: "potassium", name: "Potassium", symbol: "K+", group: "mineral", amount: null, target: 3500, unit: "mg", pct: null },
];

export function VitaminShelf({
  items,
  status = "ok",
  compact = false,
  className = "",
}: VitaminShelfProps) {
  const [activeKey, setActiveKey] = useState<string | null>(null);

  const displayList = items && items.length > 0 ? items : DEFAULT_SLOTS;
  const isAvailable = status === "ok" && items && items.length > 0;

  return (
    <div className={`vitamin-shelf-card panel ${compact ? "compact" : ""} ${className}`} role="region" aria-label="Vitamin & Mineral Shelf">
      <div className="shelf-header">
        <div>
          <span className="almanac-eyebrow">APOTHECARY PANTRY</span>
          <h3 className="almanac-serif">Vitamins &amp; Minerals Shelf</h3>
        </div>
        <div className="shelf-legend">
          <span className="legend-pip vit"><i /> Vitamins</span>
          <span className="legend-pip min"><i /> Minerals</span>
        </div>
      </div>

      {!isAvailable && (
        <div className="shelf-calm-notice">
          <Sparkles size={14} />
          <span>
            Micronutrient shelf activates as logs are recorded with ICMR-NIN reference mappings.
          </span>
        </div>
      )}

      {/* Apothecary Wooden Ledge Rack */}
      <div className="shelf-rack-stage">
        <div className="shelf-jars-grid">
          {displayList.map((item) => {
            const isUnknown = item.amount === null;
            const pct = item.pct ?? 0;
            const isSelected = activeKey === item.key;
            const isAdequate = !isUnknown && pct >= 100;
            const isMid = !isUnknown && pct >= 50 && pct < 100;
            const isLow = !isUnknown && pct > 0 && pct < 50;
            const isZero = !isUnknown && pct === 0;

            const fillHeightPct = isUnknown ? 0 : Math.min(100, Math.max(8, pct));

            return (
              <div
                key={item.key}
                className={`shelf-jar-col ${item.group} ${isUnknown ? "unknown" : ""} ${isSelected ? "selected" : ""}`}
                onClick={() => setActiveKey(isSelected ? null : item.key)}
                tabIndex={0}
                role="button"
                aria-label={`${item.name}: ${isUnknown ? "Data pending" : `${pct}% of daily target`}`}
                onKeyDown={(e) => {
                  if (e.key === "Enter" || e.key === " ") setActiveKey(isSelected ? null : item.key);
                }}
              >
                {/* SVG Apothecary Jar */}
                <div className="shelf-jar-svg-wrap">
                  <svg viewBox="0 0 46 68" className="shelf-jar-svg" role="img">
                    {/* Cork Cap */}
                    <path d="M 17 6 L 29 6 L 27 12 L 19 12 Z" fill="#b08851" stroke="#6e4f25" strokeWidth="1" />
                    {/* Glass Rim */}
                    <rect x="14" y="12" width="18" height="4" rx="1.5" fill="#fcfaf5" stroke="#545147" strokeWidth="1.2" />
                    {/* Glass Jar Body */}
                    <path
                      d="M 16 16 L 30 16 C 36 17 41 22 41 30 L 41 58 C 41 62 38 64 34 64 L 12 64 C 8 64 5 62 5 58 L 5 30 C 5 22 10 17 16 16 Z"
                      fill="#ffffff"
                      stroke={item.group === "vitamin" ? "#6e445b" : "#33716a"}
                      strokeWidth="1.4"
                    />

                    {/* Liquid Fill */}
                    {!isUnknown && (
                      <g clipPath={`url(#jarClip-${item.key})`}>
                        <rect
                          x="6"
                          y={64 - (fillHeightPct / 100) * 46}
                          width="34"
                          height={(fillHeightPct / 100) * 46}
                          fill={item.group === "vitamin" ? "#8c5674" : "#448c82"}
                          opacity={isAdequate ? 0.85 : 0.65}
                          className="shelf-liquid"
                        />
                      </g>
                    )}

                    <clipPath id={`jarClip-${item.key}`}>
                      <path d="M 16 17 L 30 17 C 35 18 40 23 40 30 L 40 58 C 40 62 37 63 33 63 L 13 63 C 9 63 6 62 6 58 L 6 30 C 6 23 11 18 16 17 Z" />
                    </clipPath>

                    {/* Printed Label Stamp on Jar */}
                    <rect x="10" y="27" width="26" height="22" rx="2" fill="#faf7f0" stroke="#cfc7b8" strokeWidth="0.8" />
                    <text
                      x="23"
                      y="42"
                      textAnchor="middle"
                      fontSize="12"
                      fontWeight="bold"
                      fontFamily="var(--font-serif)"
                      fill="#1c1b18"
                    >
                      {item.symbol}
                    </text>
                  </svg>
                </div>

                {/* Subtitle / Status Under Jar */}
                <span className="jar-title">{item.name}</span>
                <span className="jar-status-sub almanac-mono tabular">
                  {isUnknown ? "—" : `${pct}%`}
                </span>
              </div>
            );
          })}
        </div>

        {/* Ledge Wood Plank */}
        <div className="shelf-wood-ledge" />
      </div>

      {/* Expanded Drawer Details for Active Jar */}
      {activeKey && (
        <div className="shelf-detail-card" role="region" aria-label="Micronutrient detail">
          {(() => {
            const it = displayList.find((x) => x.key === activeKey);
            if (!it) return null;
            return (
              <div className="shelf-detail-content">
                <div className="detail-top">
                  <div>
                    <b className="almanac-serif">{it.name} ({it.symbol})</b>
                    <small className="almanac-mono">
                      {it.amount != null ? `${it.amount} ${it.unit}` : "No logged intake today"} · Target: {it.target} {it.unit}
                    </small>
                  </div>
                  <button type="button" className="detail-close" onClick={() => setActiveKey(null)} aria-label="Close">
                    ×
                  </button>
                </div>

                {it.topFoods && it.topFoods.length > 0 && (
                  <div className="detail-foods">
                    <span className="almanac-eyebrow">TOP CONTRIBUTING FOODS:</span>
                    <div className="detail-chips">
                      {it.topFoods.map((f, i) => (
                        <span key={i} className="stamp-tag forest">
                          {f.food_name} ({f.amount})
                        </span>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            );
          })()}
        </div>
      )}
    </div>
  );
}
