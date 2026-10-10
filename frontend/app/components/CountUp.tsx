"use client";

import { useEffect, useRef, useState } from "react";

/** A number that glides to its new value (and skips the glide for people who prefer reduced motion). */
export function CountUp({
  value,
  duration = 900,
  format = (n: number) => String(Math.round(n * 10) / 10),
}: {
  value: number;
  duration?: number;
  format?: (n: number) => string;
}) {
  const [shown, setShown] = useState(0);
  const from = useRef(0);

  useEffect(() => {
    const target = Number(value) || 0;
    if (typeof window !== "undefined" && window.matchMedia?.("(prefers-reduced-motion: reduce)").matches) {
      from.current = target;
      setShown(target);
      return;
    }
    const start = performance.now();
    const origin = from.current;
    let id = 0;
    const tick = (t: number) => {
      const p = Math.min(1, (t - start) / duration);
      const eased = 1 - Math.pow(1 - p, 3);
      const now = origin + (target - origin) * eased;
      from.current = now;
      setShown(now);
      if (p < 1) id = requestAnimationFrame(tick);
    };
    id = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(id);
  }, [value, duration]);

  return <>{format(shown)}</>;
}
