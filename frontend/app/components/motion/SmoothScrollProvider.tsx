"use client";

import React, { createContext, useContext, useEffect, useRef, useState, ReactNode } from "react";
import Lenis from "lenis";
import gsap from "gsap";
import { ScrollTrigger } from "gsap/ScrollTrigger";

gsap.registerPlugin(ScrollTrigger);

interface SmoothScrollContextValue {
  lenis: Lenis | null;
  isReducedMotion: boolean;
}

const SmoothScrollContext = createContext<SmoothScrollContextValue>({
  lenis: null,
  isReducedMotion: false,
});

export function useSmoothScroll() {
  return useContext(SmoothScrollContext);
}

export function SmoothScrollProvider({
  children,
  enabled = true,
  smoothWheel = false,
}: {
  children: ReactNode;
  enabled?: boolean;
  smoothWheel?: boolean;
}) {
  const [lenisInstance, setLenisInstance] = useState<Lenis | null>(null);
  const [isReducedMotion, setIsReducedMotion] = useState(false);

  useEffect(() => {
    // 1. Check prefers-reduced-motion
    const reducedMotionQuery = window.matchMedia("(prefers-reduced-motion: reduce)");
    if (reducedMotionQuery.matches || !enabled) {
      setIsReducedMotion(true);
      return;
    }

    // 2. Initialize Lenis (smoothWheel: false allows 100% native hardware scroll without JS hijacking)
    const lenis = new Lenis({
      lerp: 0.1,
      wheelMultiplier: 1.0,
      touchMultiplier: 1.5,
      orientation: "vertical",
      gestureOrientation: "vertical",
      smoothWheel,
      infinite: false,
    });

    setLenisInstance(lenis);

    // 3. Synchronize Lenis scroll updates with GSAP ScrollTrigger
    lenis.on("scroll", ScrollTrigger.update);

    // 4. Drive Lenis through GSAP ticker with healthy lag smoothing
    const updateTicker = (time: number) => {
      lenis.raf(time * 1000);
    };

    gsap.ticker.add(updateTicker);
    // Maintain healthy lag smoothing so frame drops don't lock or stutter the scroll
    gsap.ticker.lagSmoothing(500, 33);

    return () => {
      gsap.ticker.remove(updateTicker);
      lenis.destroy();
      setLenisInstance(null);
    };
  }, [enabled]);

  return (
    <SmoothScrollContext.Provider value={{ lenis: lenisInstance, isReducedMotion }}>
      {children}
    </SmoothScrollContext.Provider>
  );
}
