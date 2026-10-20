"use client";

import { useEffect, useState, useCallback, useSyncExternalStore } from "react";

export type QualityTier = "high" | "mid" | "low" | "none";

export interface TierCapabilities {
  tier: QualityTier;
  dpr: number;
  maxParticles: number;
  allowBloom: boolean;
  allowTransmission: boolean;
  transmissionSamples: number;
  transmissionResolution: number;
  render3D: boolean;
}

export const TIER_CONFIGS: Record<QualityTier, TierCapabilities> = {
  high: {
    tier: "high",
    dpr: 1.75,
    maxParticles: 30000,
    allowBloom: true,
    allowTransmission: true,
    transmissionSamples: 6,
    transmissionResolution: 512,
    render3D: true,
  },
  mid: {
    tier: "mid",
    dpr: 1.5,
    maxParticles: 8000,
    allowBloom: true,
    allowTransmission: false,
    transmissionSamples: 0,
    transmissionResolution: 0,
    render3D: true,
  },
  low: {
    tier: "low",
    dpr: 1.0,
    maxParticles: 2000,
    allowBloom: false,
    allowTransmission: false,
    transmissionSamples: 0,
    transmissionResolution: 0,
    render3D: true,
  },
  none: {
    tier: "none",
    dpr: 1.0,
    maxParticles: 0,
    allowBloom: false,
    allowTransmission: false,
    transmissionSamples: 0,
    transmissionResolution: 0,
    render3D: false,
  },
};

// Global tier state so all components in the session stay synchronized
let currentTier: QualityTier = "mid";
const listeners = new Set<() => void>();

function notify() {
  listeners.forEach((listener) => listener());
}

function detectInitialTier(): QualityTier {
  if (typeof window === "undefined") return "mid";

  // 1. Reduced motion preference -> Flat 2D fallback
  if (window.matchMedia?.("(prefers-reduced-motion: reduce)").matches) {
    return "none";
  }

  // 2. WebGL capability check
  try {
    const canvas = document.createElement("canvas");
    const gl = canvas.getContext("webgl2") || canvas.getContext("webgl");
    if (!gl) return "none";
  } catch {
    return "none";
  }

  // 3. Network Save-Data check
  const conn = (navigator as unknown as { connection?: { saveData?: boolean } }).connection;
  if (conn?.saveData) {
    return "low";
  }

  // 4. Hardware specifications
  const cores = navigator.hardwareConcurrency || 4;
  const memory = (navigator as unknown as { deviceMemory?: number }).deviceMemory || 4;
  const isMobile = window.innerWidth < 768;

  if (cores >= 8 && memory >= 6 && !isMobile) {
    return "high";
  } else if (cores >= 4 && memory >= 4) {
    return "mid";
  } else {
    return "low";
  }
}

// Initialize once on client
if (typeof window !== "undefined") {
  currentTier = detectInitialTier();
}

/**
 * Step down tier dynamically if PerformanceMonitor triggers under-performance.
 * Strict rule: Never step up automatically during a session.
 */
export function stepDownQualityTier(): void {
  if (currentTier === "high") {
    currentTier = "mid";
    notify();
  } else if (currentTier === "mid") {
    currentTier = "low";
    notify();
  } else if (currentTier === "low") {
    currentTier = "none";
    notify();
  }
}

/**
 * Manually force a tier (e.g., for testing or user settings)
 */
export function setQualityTier(tier: QualityTier): void {
  currentTier = tier;
  notify();
}

export function getQualityTier(): QualityTier {
  return currentTier;
}

export function useQualityTier(): QualityTier {
  const tier = useSyncExternalStore<QualityTier>(
    (onStoreChange) => {
      listeners.add(onStoreChange);
      return () => listeners.delete(onStoreChange);
    },
    () => currentTier,
    (): QualityTier => "mid" // Server snapshot
  );

  return tier;
}

export function useTierCapabilities(): TierCapabilities {
  const tier = useQualityTier();
  return TIER_CONFIGS[tier];
}
