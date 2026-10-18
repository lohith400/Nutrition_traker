"use client";

import React, { useState } from "react";
import dynamic from "next/dynamic";
import {
  useQualityTier,
  useTierCapabilities,
  setQualityTier,
  QualityTier,
} from "../../hooks/useQualityTier";
import { SmoothScrollProvider } from "../../components/motion/SmoothScrollProvider";
import { SplitTextHeadline } from "../../components/motion/SplitTextHeadline";
import { ScrollReveal } from "../../components/motion/ScrollReveal";

// Dynamically import 3D components with SSR disabled to enforce bundle budget
const TodayPlate3D = dynamic(() => import("../../components/TodayPlate3D"), {
  ssr: false,
});
const HydrationJar3D = dynamic(() => import("../../components/HydrationJar3D"), {
  ssr: false,
});
const VitaminShelf3D = dynamic(() => import("../../components/VitaminShelf3D"), {
  ssr: false,
});

export default function Dev3DTestPage() {
  const tier = useQualityTier();
  const caps = useTierCapabilities();

  // Interactive macro state for testing 3D Thali
  const [protein, setProtein] = useState(85);
  const [carbs, setCarbs] = useState(65);
  const [fat, setFat] = useState(45);
  const [fibre, setFibre] = useState(90);

  // Interactive water state for testing 3D Hydration Jar
  const [waterL, setWaterL] = useState(2.25);
  const targetWaterL = 3.5;

  // Interactive apothecary canister state for testing 3D Vitamin Shelf
  const [activeCanisterKey, setActiveCanisterKey] = useState<string | null>("iron");

  // Scroll mode toggle: defaults to 100% native hardware scrolling (never gets stuck)
  const [smoothScrollEnabled, setSmoothScrollEnabled] = useState(false);

  return (
    <SmoothScrollProvider enabled={true} smoothWheel={smoothScrollEnabled}>
      <div
        style={{
          minHeight: "100vh",
          background: "#faf6ee",
          color: "#1c3a2b",
          fontFamily: "var(--font-sans, system-ui, sans-serif)",
          padding: "36px 24px",
          maxWidth: 1140,
          margin: "0 auto",
        }}
      >
        <style>{`
          .warmup { display: none !important; }
        `}</style>

        {/* Header with SplitTextHeadline line reveal */}
        <header style={{ marginBottom: 32, borderBottom: "1px solid #e2dac9", paddingBottom: 22 }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", flexWrap: "wrap", gap: 14 }}>
            <div>
              <p
                style={{
                  fontSize: 11,
                  letterSpacing: "0.14em",
                  textTransform: "uppercase",
                  color: "#c85a32",
                  fontWeight: 700,
                  margin: "0 0 8px 0",
                }}
              >
                The Pantry Almanac · Spatial & Motion Foundation
              </p>
              <SplitTextHeadline
                as="h1"
                lines={["The Measured Kitchen,", "Rendered With Craft."]}
                style={{
                  fontSize: 34,
                  lineHeight: 1.15,
                  color: "#1c3a2b",
                  letterSpacing: "-0.015em",
                }}
              />
            </div>
            <div style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap" }}>
              <button
                onClick={() => setSmoothScrollEnabled((prev) => !prev)}
                style={{
                  display: "inline-flex",
                  alignItems: "center",
                  gap: 8,
                  padding: "8px 14px",
                  borderRadius: 24,
                  background: smoothScrollEnabled ? "#1c3a2b" : "#f0ede6",
                  color: smoothScrollEnabled ? "#ffffff" : "#6c6659",
                  border: `1px solid ${smoothScrollEnabled ? "#1c3a2b" : "#d8d1c3"}`,
                  fontSize: 12.5,
                  fontWeight: 600,
                  cursor: "pointer",
                  transition: "all 0.15s ease",
                }}
              >
                <span>Scroll:</span>
                <strong>{smoothScrollEnabled ? "Fluid Momentum (Lenis)" : "Standard Native"}</strong>
              </button>

              <div
                style={{
                  display: "inline-flex",
                  alignItems: "center",
                  gap: 8,
                  padding: "8px 16px",
                  borderRadius: 24,
                  background: tier === "none" ? "#f3e8e8" : "#e8efe9",
                  border: `1px solid ${tier === "none" ? "#d9a4a4" : "#bed2c2"}`,
                  fontSize: 13,
                  fontWeight: 600,
                }}
              >
                <span
                  style={{
                    width: 9,
                    height: 9,
                    borderRadius: "50%",
                    background:
                      tier === "high"
                        ? "#2d8a4e"
                        : tier === "mid"
                        ? "#d48c28"
                        : tier === "low"
                        ? "#c85a32"
                        : "#7f7b70",
                  }}
                />
                Active Tier: <strong style={{ textTransform: "uppercase" }}>{tier}</strong>
              </div>
            </div>
          </div>
        </header>

        {/* Quality Tier Simulator Panel */}
        <section
          style={{
            background: "#ffffff",
            border: "1px solid #e5ded0",
            borderRadius: 14,
            padding: 22,
            marginBottom: 32,
            boxShadow: "0 4px 18px rgba(28,58,43,0.04)",
          }}
        >
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 12, marginBottom: 16 }}>
            <div>
              <h2 style={{ fontSize: 16, margin: 0, fontWeight: 700, letterSpacing: "-0.01em" }}>
                Quality Tier Simulator (Dynamic Adaptation)
              </h2>
              <span style={{ fontSize: 12, color: "#6c6659" }}>
                Factors hardware cores, device memory, Save-Data, and prefers-reduced-motion.
              </span>
            </div>
            <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
              {(["high", "mid", "low", "none"] as QualityTier[]).map((t) => (
                <button
                  key={t}
                  onClick={() => setQualityTier(t)}
                  style={{
                    padding: "8px 18px",
                    borderRadius: 8,
                    border: tier === t ? "2px solid #1c3a2b" : "1px solid #dcd5c7",
                    background: tier === t ? "#1c3a2b" : "#faf8f2",
                    color: tier === t ? "#ffffff" : "#1c3a2b",
                    fontWeight: 600,
                    cursor: "pointer",
                    fontSize: 13,
                    textTransform: "capitalize",
                    transition: "all 0.15s ease",
                  }}
                >
                  Force {t}
                </button>
              ))}
            </div>
          </div>

          <div
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(auto-fit, minmax(190px, 1fr))",
              gap: 12,
              background: "#faf7f0",
              padding: 14,
              borderRadius: 10,
              fontSize: 12.5,
            }}
          >
            <div><strong>DPR Cap:</strong> {caps.dpr}x</div>
            <div><strong>Max GPU Particles:</strong> {caps.maxParticles.toLocaleString()}</div>
            <div><strong>Physical Transmission:</strong> {caps.allowTransmission ? "Enabled (Samples: 6)" : "Disabled"}</div>
            <div><strong>Bloom:</strong> {caps.allowBloom ? "Enabled" : "Disabled"}</div>
            <div><strong>Rendering Engine:</strong> {caps.render3D ? "React Three Fiber (WebGL)" : "Archival Vector 2D"}</div>
          </div>
        </section>

        {/* Main 3D Component Benchmarks */}
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(360px, 1fr))", gap: 28, marginBottom: 44 }}>
          
          {/* Card 1: TodayPlate3D */}
          <ScrollReveal>
            <div
              style={{
                background: "#ffffff",
                border: "1px solid #e5ded0",
                borderRadius: 16,
                overflow: "hidden",
                boxShadow: "0 6px 24px rgba(28,58,43,0.06)",
                display: "flex",
                flexDirection: "column",
              }}
            >
              <div style={{ padding: "18px 22px", borderBottom: "1px solid #f0eae0" }}>
                <span style={{ fontSize: 11, fontWeight: 700, color: "#d48c28", textTransform: "uppercase", letterSpacing: "0.08em" }}>
                  Benchmark 01 · Authentic Metalwork
                </span>
                <h3 style={{ margin: "4px 0 0 0", fontSize: 20, fontFamily: "var(--font-serif, serif)" }}>
                  The Almanac Thali (TodayPlate3D)
                </h3>
                <p style={{ margin: "4px 0 0 0", fontSize: 13, color: "#5b8266" }}>
                  Brushed steel plate, brass rolled rim, 4 quadrant katoris with interactive pointer tilt.
                </p>
              </div>

              {/* 3D Canvas or 2D Fallback */}
              <div
                style={{
                  height: 380,
                  position: "relative",
                  background: "radial-gradient(circle at 50% 50%, #f7f3ea 0%, #ede5d5 100%)",
                  display: "grid",
                  placeItems: "center",
                }}
              >
                {caps.render3D ? (
                  <TodayPlate3D
                    protPct={protein / 100}
                    carbPct={carbs / 100}
                    fatPct={fat / 100}
                    fibrePct={fibre / 100}
                    active={true}
                  />
                ) : (
                  <div style={{ textAlign: "center", padding: 20 }}>
                    <svg viewBox="0 0 200 200" style={{ width: 150, height: 150, margin: "0 auto 12px auto", display: "block" }}>
                      <circle cx="100" cy="100" r="92" fill="#ded7c7" stroke="#bfae92" strokeWidth="4" />
                      <circle cx="100" cy="100" r="82" fill="none" stroke="#cfc5b4" strokeWidth="1.2" strokeDasharray="3 2" />
                      <circle cx="70" cy="70" r="23" fill="#5b8266" opacity={protein / 100} stroke="#44614d" strokeWidth="1.5" />
                      <circle cx="130" cy="70" r="23" fill="#d48c28" opacity={carbs / 100} stroke="#996319" strokeWidth="1.5" />
                      <circle cx="70" cy="130" r="23" fill="#c85a32" opacity={fat / 100} stroke="#913b1d" strokeWidth="1.5" />
                      <circle cx="130" cy="130" r="23" fill="#8ba858" opacity={fibre / 100} stroke="#5b7336" strokeWidth="1.5" />
                      <circle cx="100" cy="100" r="12" fill="#faf6ee" stroke="#bdae95" strokeWidth="1.5" />
                    </svg>
                    <div style={{ fontSize: 12, fontWeight: 700, color: "#1c3a2b", textTransform: "uppercase" }}>
                      Archival 2D Steel Thali
                    </div>
                    <p style={{ margin: "4px 0 0 0", fontSize: 12, color: "#7a7265" }}>
                      Zero-overhead vector fallback active under tier: <strong>none</strong>
                    </p>
                  </div>
                )}
              </div>

              {/* Macro Sliders */}
              <div style={{ padding: "18px 22px", background: "#fcfbf7", borderTop: "1px solid #f0eae0", display: "grid", gap: 10, fontSize: 12 }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                  <span style={{ fontWeight: 600, color: "#5b8266" }}>Protein: {protein}%</span>
                  <input type="range" min="0" max="100" value={protein} onChange={(e) => setProtein(Number(e.target.value))} style={{ width: 140 }} />
                </div>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                  <span style={{ fontWeight: 600, color: "#d48c28" }}>Carbohydrates: {carbs}%</span>
                  <input type="range" min="0" max="100" value={carbs} onChange={(e) => setCarbs(Number(e.target.value))} style={{ width: 140 }} />
                </div>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                  <span style={{ fontWeight: 600, color: "#c85a32" }}>Healthy Fats: {fat}%</span>
                  <input type="range" min="0" max="100" value={fat} onChange={(e) => setFat(Number(e.target.value))} style={{ width: 140 }} />
                </div>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                  <span style={{ fontWeight: 600, color: "#8ba858" }}>Dietary Fibre: {fibre}%</span>
                  <input type="range" min="0" max="100" value={fibre} onChange={(e) => setFibre(Number(e.target.value))} style={{ width: 140 }} />
                </div>
              </div>
            </div>
          </ScrollReveal>

          {/* Card 2: HydrationJar3D */}
          <ScrollReveal delay={0.15}>
            <div
              style={{
                background: "#ffffff",
                border: "1px solid #e5ded0",
                borderRadius: 16,
                overflow: "hidden",
                boxShadow: "0 6px 24px rgba(28,58,43,0.06)",
                display: "flex",
                flexDirection: "column",
              }}
            >
              <div style={{ padding: "18px 22px", borderBottom: "1px solid #f0eae0" }}>
                <span style={{ fontSize: 11, fontWeight: 700, color: "#2c7a91", textTransform: "uppercase", letterSpacing: "0.08em" }}>
                  Benchmark 02 · Glass & Liquid Shader
                </span>
                <h3 style={{ margin: "4px 0 0 0", fontSize: 20, fontFamily: "var(--font-serif, serif)" }}>
                  The Water Carboy (HydrationJar3D)
                </h3>
                <p style={{ margin: "4px 0 0 0", fontSize: 13, color: "#5b8266" }}>
                  Refractive glass on high tier, cork stopper, and dynamic water wobble on intake.
                </p>
              </div>

              {/* 3D Canvas or 2D Fallback */}
              <div
                style={{
                  height: 380,
                  position: "relative",
                  background: "radial-gradient(circle at 50% 50%, #f7f3ea 0%, #ede5d5 100%)",
                  display: "grid",
                  placeItems: "center",
                }}
              >
                {caps.render3D ? (
                  <HydrationJar3D
                    consumedL={waterL}
                    targetL={targetWaterL}
                    onQuickAdd={(amt) => setWaterL((w) => Math.min(targetWaterL, Number((w + amt).toFixed(2))))}
                  />
                ) : (
                  <div style={{ textAlign: "center", padding: 20 }}>
                    <svg viewBox="0 0 100 170" style={{ width: 95, height: 155, margin: "0 auto 12px auto", display: "block" }}>
                      <rect x="36" y="8" width="28" height="16" rx="3" fill="#b28654" stroke="#7d5930" strokeWidth="1.2" />
                      <rect x="32" y="24" width="36" height="6" rx="2" fill="#dce6df" stroke="#5b8266" strokeWidth="1.2" />
                      <rect x="22" y="44" width="56" height="114" rx="14" fill="#e8f2f4" stroke="#2c7a91" strokeWidth="1.5" />
                      <rect
                        x="23"
                        y={156 - (waterL / targetWaterL) * 110}
                        width="54"
                        height={(waterL / targetWaterL) * 110}
                        rx="12"
                        fill="#2c7a91"
                        opacity="0.88"
                      />
                    </svg>
                    <div style={{ fontSize: 12, fontWeight: 700, color: "#1c3a2b", textTransform: "uppercase" }}>
                      Archival 2D Water Carboy
                    </div>
                    <p style={{ margin: "4px 0 0 0", fontSize: 12, color: "#7a7265" }}>
                      Zero-overhead vector fallback active under tier: <strong>none</strong>
                    </p>
                  </div>
                )}
              </div>

              {/* Interactive Water Controls */}
              <div style={{ padding: "18px 22px", background: "#fcfbf7", borderTop: "1px solid #f0eae0", display: "grid", gap: 12 }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                  <div>
                    <span style={{ fontSize: 11, fontWeight: 700, color: "#6c6659", textTransform: "uppercase", letterSpacing: "0.06em" }}>Water Intake</span>
                    <strong style={{ fontSize: 18, color: "#2c7a91", fontFamily: "var(--font-mono, monospace)", display: "block" }}>
                      {waterL.toFixed(2)} / {targetWaterL.toFixed(1)} L ({Math.round((waterL / targetWaterL) * 100)}%)
                    </strong>
                  </div>
                  <div style={{ display: "flex", gap: 8 }}>
                    <button
                      onClick={() => setWaterL((w) => Math.min(targetWaterL, Number((w + 0.25).toFixed(2))))}
                      style={{
                        padding: "8px 14px",
                        borderRadius: 8,
                        background: "#2c7a91",
                        color: "#ffffff",
                        border: 0,
                        fontSize: 13,
                        fontWeight: 600,
                        cursor: "pointer",
                        boxShadow: "0 2px 6px rgba(44,122,145,0.25)",
                      }}
                    >
                      +250 ml (Wobble)
                    </button>
                    <button
                      onClick={() => setWaterL(0.5)}
                      style={{
                        padding: "8px 12px",
                        borderRadius: 8,
                        background: "#ece7dc",
                        color: "#1c3a2b",
                        border: "1px solid #d5cebf",
                        fontSize: 12,
                        fontWeight: 600,
                        cursor: "pointer",
                      }}
                    >
                      Empty
                    </button>
                  </div>
                </div>

                <div style={{ display: "flex", alignItems: "center", gap: 12, fontSize: 12 }}>
                  <span style={{ color: "#6c6659", minWidth: 64 }}>Level:</span>
                  <input
                    type="range"
                    min="0"
                    max={targetWaterL}
                    step="0.05"
                    value={waterL}
                    onChange={(e) => setWaterL(Number(e.target.value))}
                    style={{ flex: 1 }}
                  />
                </div>
              </div>
            </div>
          </ScrollReveal>

          {/* Card 3: VitaminShelf3D */}
          <div style={{ gridColumn: "1 / -1" }}>
            <ScrollReveal>
              <div
                style={{
                  background: "#ffffff",
                  border: "1px solid #e5ded0",
                  borderRadius: 16,
                  overflow: "hidden",
                  boxShadow: "0 6px 24px rgba(28,58,43,0.06)",
                  display: "flex",
                  flexDirection: "column",
                }}
              >
                <div style={{ padding: "18px 22px", borderBottom: "1px solid #f0eae0", display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 12 }}>
                  <div>
                    <span style={{ fontSize: 11, fontWeight: 700, color: "#8c5674", textTransform: "uppercase", letterSpacing: "0.08em" }}>
                      Benchmark 03 · Apothecary Spice Ledge
                    </span>
                    <h3 style={{ margin: "4px 0 0 0", fontSize: 20, fontFamily: "var(--font-serif, serif)" }}>
                      The Micronutrient Canisters (VitaminShelf3D)
                    </h3>
                    <p style={{ margin: "4px 0 0 0", fontSize: 13, color: "#5b8266" }}>
                      Solid teak wood ledge with 6 turned brass apothecary canisters, luminous botanical fills, and pointer physics.
                    </p>
                  </div>
                  <div style={{ fontSize: 13, color: "#1c3a2b", fontWeight: 600 }}>
                    Selected Canister: <strong style={{ color: "#c85a32", textTransform: "uppercase" }}>{activeCanisterKey || "None"}</strong>
                  </div>
                </div>

                <div
                  style={{
                    height: 280,
                    position: "relative",
                    background: "radial-gradient(circle at 50% 50%, #faf6ee 0%, #ede5d5 100%)",
                    display: "grid",
                    placeItems: "center",
                  }}
                >
                  {caps.render3D ? (
                    <VitaminShelf3D
                      activeKey={activeCanisterKey}
                      onSelectKey={setActiveCanisterKey}
                    />
                  ) : (
                    <div style={{ textAlign: "center", padding: 20 }}>
                      <p style={{ fontSize: 13, color: "#7a7265", margin: 0 }}>
                        Archival 2D Apothecary Shelf active under tier: <strong>none</strong>
                      </p>
                    </div>
                  )}
                </div>
              </div>
            </ScrollReveal>
          </div>

        </div>

        {/* Phase 1 Motion Foundation Reference Panel */}
        <ScrollReveal distance={24}>
          <section
            style={{
              background: "#ffffff",
              border: "1px solid #e5ded0",
              borderRadius: 14,
              padding: 24,
              boxShadow: "0 4px 18px rgba(28,58,43,0.04)",
              marginBottom: 32,
            }}
          >
            <span style={{ fontSize: 11, fontWeight: 700, color: "#c85a32", textTransform: "uppercase", letterSpacing: "0.1em" }}>
              Phase 1 Deliverable · Motion System
            </span>
            <h3 style={{ margin: "4px 0 12px 0", fontSize: 22, fontFamily: "var(--font-serif, serif)" }}>
              The Cinematic Motion Rules
            </h3>
            <p style={{ margin: "0 0 16px 0", fontSize: 13.5, color: "#5c574c", lineHeight: 1.6 }}>
              All motion follows the product-film aesthetic: slow, weighted inertia (600ms to 1400ms), eased strictly with <code style={{ background: "#f6f2e8", padding: "2px 6px", borderRadius: 4 }}>cubic-bezier(0.22, 1, 0.36, 1)</code>. Zero spring wobble, zero looping decoration. Lenis smooth scrolling drives GSAP ScrollTrigger ticks, and headlines reveal line-by-line using masked containers.
            </p>

            <div
              style={{
                display: "grid",
                gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))",
                gap: 14,
                background: "#faf7f0",
                padding: 16,
                borderRadius: 10,
                fontSize: 12.5,
              }}
            >
              <div>
                <strong>Lenis Inertial Scroll:</strong>
                <p style={{ margin: "4px 0 0 0", color: "#6c6659" }}>Duration: 1.2s, wheelMultiplier: 0.9, syncs GSAP ticker directly.</p>
              </div>
              <div>
                <strong>Headline SplitText:</strong>
                <p style={{ margin: "4px 0 0 0", color: "#6c6659" }}>Line-by-line mask, yPercent 105% → 0%, ease power3.out.</p>
              </div>
              <div>
                <strong>Scroll-Driven Reveals:</strong>
                <p style={{ margin: "4px 0 0 0", color: "#6c6659" }}>CSS animation-timeline: view() with GSAP fallback for Firefox.</p>
              </div>
            </div>
          </section>
        </ScrollReveal>

        <footer style={{ marginTop: 44, textAlign: "center", fontSize: 12, color: "#8a8376" }}>
          NutriSync Spatial 3D Platform · Phase 1 Motion Foundation · Built on Lenis, GSAP & The Pantry Almanac
        </footer>
      </div>
    </SmoothScrollProvider>
  );
}
