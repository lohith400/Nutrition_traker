"use client";

import { useEffect, useState } from "react";

/** Fire a small celebration from anywhere:  celebrate("Protein goal reached"). */
export function celebrate(label: string) {
  if (typeof window !== "undefined") window.dispatchEvent(new CustomEvent("nutrisync-celebrate", { detail: { label } }));
}

const SHAPES = ["grain", "leaf", "drop", "seed"] as const;
const COLORS = ["#d89b2b", "#4d6b3a", "#c2492f", "#2f5d50", "#e9b44c"];

/** A brief shower of grains, leaves and drops with a quiet toast. Rendered once, near the root. */
export default function GoalBurst() {
  const [burst, setBurst] = useState<{ id: number; label: string } | null>(null);

  useEffect(() => {
    let timer = 0;
    const on = (e: Event) => {
      const label = (e as CustomEvent<{ label: string }>).detail?.label || "Goal reached";
      setBurst({ id: Date.now(), label });
      window.clearTimeout(timer);
      timer = window.setTimeout(() => setBurst(null), 3200);
    };
    window.addEventListener("nutrisync-celebrate", on);
    return () => {
      window.removeEventListener("nutrisync-celebrate", on);
      window.clearTimeout(timer);
    };
  }, []);

  if (!burst) return null;
  const pieces = Array.from({ length: 22 }, (_, i) => {
    const angle = (i / 22) * Math.PI * 2 + (i % 3) * 0.2;
    const dist = 90 + ((i * 37) % 120);
    return {
      i,
      shape: SHAPES[i % SHAPES.length],
      color: COLORS[i % COLORS.length],
      dx: Math.cos(angle) * dist,
      dy: Math.sin(angle) * dist - 60,
      rot: (i * 53) % 360,
      delay: (i % 6) * 40,
    };
  });

  return (
    <div className="goal-burst" key={burst.id} role="status" aria-live="polite">
      <div className="goal-burst-pieces" aria-hidden="true">
        {pieces.map((p) => (
          <span
            key={p.i}
            className={`gb-piece gb-${p.shape}`}
            style={{ ["--dx" as string]: `${p.dx}px`, ["--dy" as string]: `${p.dy}px`, ["--rot" as string]: `${p.rot}deg`, background: p.color, animationDelay: `${p.delay}ms` }}
          />
        ))}
      </div>
      <div className="goal-burst-toast">
        <span className="goal-burst-star" aria-hidden="true">✦</span>
        {burst.label}
      </div>
    </div>
  );
}
