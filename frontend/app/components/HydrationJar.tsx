"use client";

import React, { useState } from "react";
import { Droplets, Sparkles } from "lucide-react";

interface HydrationJarProps {
  consumed: number; // in Liters
  target: number; // in Liters
  onLogWater: (amountL: number, label: string) => Promise<void> | void;
  disabled?: boolean;
}

export function HydrationJar({
  consumed,
  target,
  onLogWater,
  disabled = false,
}: HydrationJarProps) {
  const [rippling, setRippling] = useState(false);

  const safeTarget = target > 0 ? target : 6.5;
  const pct = Math.min(100, Math.round((consumed / safeTarget) * 100));

  // Height of water inside SVG: jar body goes from Y=45 (top neck) to Y=175 (bottom)
  // Total usable height is 130px.
  const waterHeight = Math.max(4, Math.min(130, (pct / 100) * 130));
  const waterY = 175 - waterHeight;

  async function handleQuick(amt: number, label: string) {
    if (disabled) return;
    setRippling(true);
    setTimeout(() => setRippling(false), 900);
    await onLogWater(amt, label);
  }

  return (
    <div className="hydration-jar-card panel" role="region" aria-label="Hydration Jar">
      <div className="jar-card-head">
        <div>
          <span className="almanac-eyebrow">APOTHECARY HYDRATION</span>
          <h3 className="almanac-serif">The Daily Water Carboy</h3>
        </div>
        <div className="jar-stamp-pct stamp-tag teal tabular">
          <Droplets size={12} /> {pct}% of goal
        </div>
      </div>

      <div className="jar-stage">
        {/* SVG Glass Jar with Wave Fill */}
        <div className={`jar-glass-wrap ${rippling ? "ripple-active" : ""}`}>
          <svg
            className="jar-glass-svg"
            viewBox="0 0 140 200"
            role="img"
            aria-label={`Water Jar: ${consumed.toFixed(1)} L of ${safeTarget.toFixed(1)} L goal`}
          >
            <defs>
              {/* Liquid Gradient */}
              <linearGradient id="jarWaterGrad" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="#4ea3b8" />
                <stop offset="60%" stopColor="#2c7a91" />
                <stop offset="100%" stopColor="#1e5d70" />
              </linearGradient>

              {/* Clip path matching inside of the jar */}
              <clipPath id="jarInsideClip">
                <path d="M 46 45 L 94 45 C 104 48 116 60 118 85 L 118 166 C 118 174 110 178 95 178 L 45 178 C 30 178 22 174 22 166 L 22 85 C 24 60 36 48 46 45 Z" />
              </clipPath>
            </defs>

            {/* Cork Stopper */}
            <path d="M 50 20 L 90 20 L 86 35 L 54 35 Z" fill="#c49b66" stroke="#876435" strokeWidth="1.5" />
            <line x1="56" y1="28" x2="84" y2="28" stroke="#a67c46" strokeWidth="1" />

            {/* Glass Neck Lip */}
            <rect x="42" y="35" width="56" height="10" rx="3" fill="#fcfaf5" stroke="#7f7b70" strokeWidth="1.8" />

            {/* Glass Jar Body Outline */}
            <path
              d="M 46 45 L 94 45 C 105 48 118 60 120 85 L 120 166 C 120 176 110 182 95 182 L 45 182 C 30 182 20 176 20 166 L 20 85 C 22 60 35 48 46 45 Z"
              fill="#ffffff"
              stroke="#545147"
              strokeWidth="2"
            />

            {/* Glass Volume Graduations */}
            <g stroke="#cfc7b8" strokeWidth="1" opacity="0.8">
              <line x1="108" y1="80" x2="116" y2="80" />
              <line x1="104" y1="100" x2="116" y2="100" />
              <line x1="108" y1="120" x2="116" y2="120" />
              <line x1="104" y1="140" x2="116" y2="140" />
              <line x1="108" y1="160" x2="116" y2="160" />
            </g>

            {/* Water Inside with Gentle Wave */}
            <g clipPath="url(#jarInsideClip)">
              {/* Back wave */}
              <path
                d={`M 10 ${waterY + 2} Q 40 ${waterY - 3} 70 ${waterY + 2} T 130 ${waterY + 2} L 130 190 L 10 190 Z`}
                fill="#2c7a91"
                opacity="0.4"
                className="jar-wave-back"
              />
              {/* Front wave */}
              <path
                d={`M 10 ${waterY} Q 40 ${waterY + 4} 70 ${waterY} T 130 ${waterY} L 130 190 L 10 190 Z`}
                fill="url(#jarWaterGrad)"
                className="jar-wave-front"
              />
              {/* Internal Bubbles */}
              {pct > 15 && <circle cx="50" cy={waterY + 30} r="2" fill="#fff" opacity="0.6" className="jar-bubble b1" />}
              {pct > 40 && <circle cx="85" cy={waterY + 60} r="2.5" fill="#fff" opacity="0.5" className="jar-bubble b2" />}
              {pct > 60 && <circle cx="65" cy={waterY + 80} r="1.8" fill="#fff" opacity="0.7" className="jar-bubble b3" />}
            </g>

            {/* Outer Specular Highlights */}
            <path
              d="M 26 88 L 26 160"
              stroke="#ffffff"
              strokeWidth="2.5"
              strokeLinecap="round"
              opacity="0.7"
            />
            <path
              d="M 32 82 Q 36 60 48 50"
              stroke="#ffffff"
              strokeWidth="2"
              strokeLinecap="round"
              fill="none"
              opacity="0.6"
            />
          </svg>

          {/* Value Display overlay on jar */}
          <div className="jar-numeric-readout">
            <span className="jar-current-liters almanac-serif tabular">{consumed.toFixed(1)}</span>
            <span className="jar-liters-unit almanac-mono">/ {safeTarget.toFixed(1)} L</span>
          </div>
        </div>

        {/* Quick Log Action Rails */}
        <div className="jar-controls">
          <p className="jar-hint">
            {pct >= 100
              ? "Daily hydration target achieved! Drink to natural thirst."
              : `${((safeTarget - consumed)).toFixed(1)} L remaining to complete today's carboy.`}
          </p>

          <div className="water-quick-buttons">
            <button
              type="button"
              className="water-pip-btn"
              onClick={() => handleQuick(0.15, "+150 ml")}
              disabled={disabled}
              title="Add 150 ml (half cup / cutting chai glass)"
            >
              <Droplets size={13} />
              <span>+150 ml</span>
              <small>Glass</small>
            </button>
            <button
              type="button"
              className="water-pip-btn"
              onClick={() => handleQuick(0.25, "+250 ml")}
              disabled={disabled}
              title="Add 250 ml (standard glass)"
            >
              <Droplets size={13} />
              <span>+250 ml</span>
              <small>Regular</small>
            </button>
            <button
              type="button"
              className="water-pip-btn"
              onClick={() => handleQuick(0.5, "+500 ml")}
              disabled={disabled}
              title="Add 500 ml (half bottle)"
            >
              <Droplets size={13} />
              <span>+500 ml</span>
              <small>Bottle</small>
            </button>
            <button
              type="button"
              className="water-pip-btn"
              onClick={() => handleQuick(1.0, "+1 L")}
              disabled={disabled}
              title="Add 1 Liter (full water bottle / flask)"
            >
              <Droplets size={13} />
              <span>+1.0 L</span>
              <small>Carafe</small>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
