"use client";

import React, { useState, useEffect, useRef } from "react";
import Link from "next/link";
import { ArrowLeft, ArrowUpRight, Compass, Sparkles, BookOpen, Layers, ShieldCheck, Flame } from "lucide-react";
import { SmoothScrollProvider } from "../components/motion/SmoothScrollProvider";
import { SplitTextHeadline } from "../components/motion/SplitTextHeadline";
import { ScrollReveal } from "../components/motion/ScrollReveal";
import { StoryCanvas } from "../components/story/StoryCanvas";
import { FoodGlyph, resolveGlyph } from "../components/art/FoodGlyph";
import { useQualityTier } from "../hooks/useQualityTier";

// IFCT Food Data for Act II Showcase
const FOOD_CATEGORIES = [
  {
    name: "Millets & Ancient Grains",
    desc: "Low-glycemic complex carbohydrates rich in trace minerals and slow-burning starches.",
    foods: [
      { name: "Finger Millet (Ragi)", hindi: "रागी / नाचनी", cal: 328, prot: 7.3, fibre: 11.5, key: "Calcium: 344mg (34% DV)" },
      { name: "Pearl Millet (Bajra)", hindi: "बाजरा", cal: 361, prot: 11.6, fibre: 11.2, key: "Iron: 8.0mg (44% DV)" },
      { name: "Sorghum (Jowar)", hindi: "ज्वार", cal: 349, prot: 10.4, fibre: 10.2, key: "Magnesium: 133mg" },
    ],
  },
  {
    name: "Pulses & Legumes",
    desc: "The backbone of Indian plant protein, rich in lysine, folate, and dietary fiber.",
    foods: [
      { name: "Pigeon Pea (Toor Dal)", hindi: "अरहर / तुवर दाल", cal: 343, prot: 22.3, fibre: 15.2, key: "Folate: 103µg (26% DV)" },
      { name: "Bengal Gram (Chana Dal)", hindi: "चना दाल", cal: 372, prot: 20.8, fibre: 15.3, key: "Zinc: 2.7mg" },
      { name: "Mung Bean (Moong Dal)", hindi: "मूँग दाल", cal: 348, prot: 24.5, fibre: 16.3, key: "Potassium: 843mg" },
    ],
  },
  {
    name: "Seasonal Greens & Herbs",
    desc: "Bioactive chloroplast-rich botanicals providing carotenoids, lutein, and non-heme iron.",
    foods: [
      { name: "Fenugreek Leaves (Methi)", hindi: "मेथी पत्ता", cal: 49, prot: 4.4, fibre: 4.9, key: "Calcium: 395mg · Iron: 1.9mg" },
      { name: "Spinach (Palak)", hindi: "पालक", cal: 26, prot: 2.0, fibre: 2.2, key: "Vitamin A: 469µg" },
      { name: "Amaranth Leaves (Chaulai)", hindi: "चौलाई", cal: 45, prot: 4.0, fibre: 6.1, key: "Vitamin C: 99mg" },
    ],
  },
  {
    name: "Traditional Dairy & Healthy Fats",
    desc: "Lipid carriers facilitating the absorption of fat-soluble vitamins A, D, E, and K.",
    foods: [
      { name: "Cultured Cow Curd (Dahi)", hindi: "दही", cal: 60, prot: 3.1, fibre: 0, key: "Active Probiotics · B12" },
      { name: "Fresh Milk Paneer", hindi: "पनीर", cal: 289, prot: 18.3, fibre: 0, key: "Calcium: 480mg · High Bioavailability" },
      { name: "Bilona Cow Ghee", hindi: "देसी घी", cal: 884, prot: 0, fibre: 0, key: "Short-Chain Butyric Acid" },
    ],
  },
];

const ACT_TITLES = [
  "Act I · The Measured Kitchen",
  "Act II · The 1,014 Foods",
  "Act III · The Invisible Gap",
  "Act IV · The Real-Time Ledger",
  "Act V · The Living Pantry",
];

export default function StoryPage() {
  const [activeAct, setActiveAct] = useState(0);
  const [selectedCategory, setSelectedCategory] = useState(0);
  const [scrollProgress, setScrollProgress] = useState(0);
  const tier = useQualityTier();

  useEffect(() => {
    const handleScroll = () => {
      const scrollY = window.scrollY;
      const docHeight = document.documentElement.scrollHeight - window.innerHeight;
      const progress = docHeight > 0 ? Math.min(1, Math.max(0, scrollY / docHeight)) : 0;
      setScrollProgress(progress);

      // Determine active act based on scroll position (5 acts)
      const current = Math.min(4, Math.floor(progress * 5));
      setActiveAct(current);
    };

    window.addEventListener("scroll", handleScroll, { passive: true });
    return () => window.removeEventListener("scroll", handleScroll);
  }, []);

  const scrollToAct = (actIndex: number) => {
    const docHeight = document.documentElement.scrollHeight - window.innerHeight;
    const targetY = (actIndex / 4.5) * docHeight;
    window.scrollTo({ top: targetY, behavior: "smooth" });
  };

  return (
    <SmoothScrollProvider>
      <div
        style={{
          background: "#0b1a13",
          color: "#faf6ee",
          minHeight: "100vh",
          position: "relative",
          fontFamily: "var(--font-sans, system-ui, sans-serif)",
          overflowX: "hidden",
        }}
      >
        <style>{`
          /* Suppress workspace overlay buttons on the cinematic story route */
          .warmup, .goal-burst, [data-quick-add], .qa-float {
            display: none !important;
          }
          ::selection {
            background: #d48c28;
            color: #0b1a13;
          }
        `}</style>

        {/* Ambient Film Canvas Backdrop */}
        <StoryCanvas progress={scrollProgress} activeAct={activeAct} />

        {/* Floating Top Navigation */}
        <header
          style={{
            position: "fixed",
            top: 0,
            left: 0,
            right: 0,
            zIndex: 40,
            padding: "20px 32px",
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            backdropFilter: "blur(12px)",
            WebkitBackdropFilter: "blur(12px)",
            background: "rgba(11, 26, 19, 0.72)",
            borderBottom: "1px solid rgba(226, 218, 201, 0.1)",
          }}
        >
          <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
            <Link
              href="/"
              style={{
                display: "inline-flex",
                alignItems: "center",
                gap: 8,
                fontSize: 13,
                fontWeight: 600,
                color: "#e2dac9",
                textDecoration: "none",
                padding: "6px 12px",
                borderRadius: 8,
                background: "rgba(255,255,255,0.06)",
                border: "1px solid rgba(255,255,255,0.09)",
                transition: "all 0.15s ease",
              }}
            >
              <ArrowLeft size={14} /> Back to Dashboard
            </Link>
            <div style={{ height: 16, width: 1, background: "rgba(255,255,255,0.15)" }} />
            <span
              style={{
                fontSize: 11,
                letterSpacing: "0.14em",
                textTransform: "uppercase",
                color: "#d48c28",
                fontWeight: 700,
              }}
            >
              The Pantry Almanac · Exhibition
            </span>
          </div>

          <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
            <span
              style={{
                fontSize: 12,
                color: "#a6b5a9",
                fontFamily: "var(--font-mono, monospace)",
              }}
            >
              {ACT_TITLES[activeAct]}
            </span>
            <Link
              href="/"
              style={{
                padding: "8px 18px",
                background: "#c85a32",
                color: "#faf6ee",
                borderRadius: 20,
                fontSize: 12.5,
                fontWeight: 700,
                textDecoration: "none",
                letterSpacing: "0.02em",
                boxShadow: "0 4px 18px rgba(200, 90, 50, 0.35)",
              }}
            >
              Launch App ✦
            </Link>
          </div>
        </header>

        {/* Floating Right Side Act Scrubber */}
        <nav
          aria-label="Story chapters"
          style={{
            position: "fixed",
            right: 28,
            top: "50%",
            transform: "translateY(-50%)",
            zIndex: 40,
            display: "flex",
            flexDirection: "column",
            gap: 16,
          }}
        >
          {ACT_TITLES.map((title, idx) => (
            <button
              key={idx}
              onClick={() => scrollToAct(idx)}
              title={title}
              style={{
                width: 10,
                height: activeAct === idx ? 32 : 10,
                borderRadius: 6,
                background: activeAct === idx ? "#d48c28" : "rgba(250, 246, 238, 0.22)",
                border: "none",
                cursor: "pointer",
                padding: 0,
                transition: "all 0.25s cubic-bezier(0.22, 1, 0.36, 1)",
              }}
            />
          ))}
        </nav>

        {/* Main Content Flow */}
        <main style={{ position: "relative", zIndex: 10, maxWidth: 1080, margin: "0 auto", padding: "140px 24px 120px 24px" }}>
          
          {/* ========================================================= */}
          {/* ACT I: The Measured Kitchen */}
          {/* ========================================================= */}
          <section
            id="act-1"
            style={{
              minHeight: "88vh",
              display: "flex",
              flexDirection: "column",
              justifyContent: "center",
              marginBottom: 160,
              paddingTop: 40,
            }}
          >
            <div style={{ maxWidth: 840 }}>
              <div
                style={{
                  display: "inline-flex",
                  alignItems: "center",
                  gap: 8,
                  padding: "6px 14px",
                  borderRadius: 20,
                  background: "rgba(212, 140, 40, 0.12)",
                  border: "1px solid rgba(212, 140, 40, 0.28)",
                  color: "#d48c28",
                  fontSize: 11,
                  fontWeight: 700,
                  letterSpacing: "0.12em",
                  textTransform: "uppercase",
                  marginBottom: 20,
                }}
              >
                <Compass size={13} /> Act I · The Ancestral Ledger
              </div>

              <SplitTextHeadline
                as="h1"
                lines={["The Measured Kitchen.", "Lit by Memory & Science."]}
                style={{
                  fontSize: "clamp(2.6rem, 5.2vw, 4.4rem)",
                  lineHeight: 1.1,
                  fontFamily: "var(--font-serif, Georgia, serif)",
                  color: "#faf6ee",
                  letterSpacing: "-0.025em",
                  marginBottom: 28,
                }}
              />

              <p
                style={{
                  fontSize: "clamp(1.05rem, 1.8vw, 1.3rem)",
                  lineHeight: 1.65,
                  color: "#d1dcce",
                  marginBottom: 36,
                  maxWidth: 720,
                }}
              >
                For generations, an Indian kitchen was governed by intuition and vessel—the <em>anjali</em> of rice,
                the tight <em>mutthi</em> of dal, the bronze <em>katori</em> of spiced ghee. Food was seasonal alchemy:
                cooling coriander against scorching summers, warming methi against damp winters.
              </p>

              <div
                style={{
                  display: "grid",
                  gridTemplateColumns: "repeat(auto-fit, minmax(260px, 1fr))",
                  gap: 20,
                  marginTop: 18,
                }}
              >
                <div
                  style={{
                    background: "rgba(28, 58, 43, 0.35)",
                    border: "1px solid rgba(226, 218, 201, 0.12)",
                    borderRadius: 14,
                    padding: 22,
                    backdropFilter: "blur(8px)",
                  }}
                >
                  <span style={{ fontSize: 11, color: "#d48c28", fontWeight: 700, letterSpacing: "0.08em", textTransform: "uppercase" }}>
                    The Traditional Vessel
                  </span>
                  <h3 style={{ margin: "8px 0 6px 0", fontSize: 18, fontFamily: "var(--font-serif, serif)" }}>
                    The Handful & The Katori
                  </h3>
                  <p style={{ margin: 0, fontSize: 13, lineHeight: 1.55, color: "#a5b8a8" }}>
                    Measures designed around appetite, body proportions, and culinary harmony rather than sterile clinical units.
                  </p>
                </div>

                <div
                  style={{
                    background: "rgba(28, 58, 43, 0.35)",
                    border: "1px solid rgba(226, 218, 201, 0.12)",
                    borderRadius: 14,
                    padding: 22,
                    backdropFilter: "blur(8px)",
                  }}
                >
                  <span style={{ fontSize: 11, color: "#c85a32", fontWeight: 700, letterSpacing: "0.08em", textTransform: "uppercase" }}>
                    The Modern Precision
                  </span>
                  <h3 style={{ margin: "8px 0 6px 0", fontSize: 18, fontFamily: "var(--font-serif, serif)" }}>
                    19 Discrete Micronutrients
                  </h3>
                  <p style={{ margin: 0, fontSize: 13, lineHeight: 1.55, color: "#a5b8a8" }}>
                    Reconciled with bioavailable mineral absorption, glycemic velocity, and single-gram portion resolving.
                  </p>
                </div>
              </div>
            </div>
          </section>

          {/* ========================================================= */}
          {/* ACT II: The Food We Eat */}
          {/* ========================================================= */}
          <section
            id="act-2"
            style={{
              minHeight: "88vh",
              marginBottom: 160,
              paddingTop: 40,
            }}
          >
            <ScrollReveal>
              <div
                style={{
                  display: "inline-flex",
                  alignItems: "center",
                  gap: 8,
                  padding: "6px 14px",
                  borderRadius: 20,
                  background: "rgba(200, 90, 50, 0.14)",
                  border: "1px solid rgba(200, 90, 50, 0.3)",
                  color: "#e88059",
                  fontSize: 11,
                  fontWeight: 700,
                  letterSpacing: "0.12em",
                  textTransform: "uppercase",
                  marginBottom: 18,
                }}
              >
                <BookOpen size={13} /> Act II · The 1,014 Verified Foods
              </div>

              <SplitTextHeadline
                as="h2"
                lines={["Grounded in the IFCT.", "Not Foreign Approximations."]}
                style={{
                  fontSize: "clamp(2.2rem, 4.4vw, 3.6rem)",
                  lineHeight: 1.15,
                  fontFamily: "var(--font-serif, Georgia, serif)",
                  color: "#faf6ee",
                  letterSpacing: "-0.02em",
                  marginBottom: 20,
                }}
              />

              <p
                style={{
                  fontSize: "1.1rem",
                  lineHeight: 1.65,
                  color: "#c2d1c0",
                  maxWidth: 720,
                  marginBottom: 36,
                }}
              >
                Global trackers ask you to log &ldquo;Yellow Lentils&rdquo; or &ldquo;Pancake&rdquo;. But a dosa is not a pancake;
                fermented rice and black gram batter alters glycemic response, and tempering with curry leaves and mustard seeds changes lipid absorption.
                NutriSync is grounded in the <strong>Indian Food Composition Tables</strong> (NIN Hyderabad).
              </p>

              {/* Category Filter Tabs */}
              <div
                style={{
                  display: "flex",
                  gap: 10,
                  overflowX: "auto",
                  paddingBottom: 12,
                  marginBottom: 24,
                }}
              >
                {FOOD_CATEGORIES.map((cat, idx) => (
                  <button
                    key={cat.name}
                    onClick={() => setSelectedCategory(idx)}
                    style={{
                      padding: "10px 18px",
                      borderRadius: 24,
                      border: selectedCategory === idx ? "1px solid #d48c28" : "1px solid rgba(255,255,255,0.12)",
                      background: selectedCategory === idx ? "rgba(212, 140, 40, 0.16)" : "rgba(255,255,255,0.04)",
                      color: selectedCategory === idx ? "#faf6ee" : "#8ea492",
                      fontSize: 13,
                      fontWeight: 600,
                      cursor: "pointer",
                      whiteSpace: "nowrap",
                      transition: "all 0.18s ease",
                    }}
                  >
                    {cat.name}
                  </button>
                ))}
              </div>

              {/* Selected Category Showcase */}
              <div
                style={{
                  background: "rgba(14, 34, 25, 0.75)",
                  border: "1px solid rgba(226, 218, 201, 0.14)",
                  borderRadius: 18,
                  padding: "28px 28px",
                  backdropFilter: "blur(14px)",
                }}
              >
                <p style={{ margin: "0 0 20px 0", fontSize: 13.5, color: "#d48c28", fontStyle: "italic" }}>
                  {FOOD_CATEGORIES[selectedCategory].desc}
                </p>

                <div
                  style={{
                    display: "grid",
                    gridTemplateColumns: "repeat(auto-fit, minmax(280px, 1fr))",
                    gap: 18,
                  }}
                >
                  {FOOD_CATEGORIES[selectedCategory].foods.map((food) => (
                    <div
                      key={food.name}
                      style={{
                        background: "rgba(255, 255, 255, 0.03)",
                        border: "1px solid rgba(255, 255, 255, 0.08)",
                        borderRadius: 12,
                        padding: "18px 20px",
                        display: "flex",
                        alignItems: "flex-start",
                        gap: 14,
                      }}
                    >
                      <div
                        style={{
                          width: 44,
                          height: 44,
                          borderRadius: 10,
                          background: "rgba(212, 140, 40, 0.15)",
                          display: "grid",
                          placeItems: "center",
                          color: "#d48c28",
                          flexShrink: 0,
                        }}
                      >
                        <FoodGlyph glyph={resolveGlyph(food.name)} size={24} />
                      </div>
                      <div style={{ flex: 1 }}>
                        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline" }}>
                          <h4 style={{ margin: 0, fontSize: 15, fontWeight: 700, color: "#faf6ee" }}>
                            {food.name}
                          </h4>
                        </div>
                        <span style={{ fontSize: 12, color: "#8ca090", display: "block", marginTop: 2 }}>
                          {food.hindi}
                        </span>

                        <div
                          style={{
                            display: "flex",
                            gap: 12,
                            marginTop: 10,
                            fontSize: 12,
                            color: "#d1dcce",
                          }}
                        >
                          <span><strong>{food.cal}</strong> kcal</span>
                          <span>•</span>
                          <span><strong>{food.prot}g</strong> Protein</span>
                          <span>•</span>
                          <span><strong>{food.fibre}g</strong> Fiber</span>
                        </div>

                        <div
                          style={{
                            marginTop: 8,
                            padding: "4px 8px",
                            borderRadius: 6,
                            background: "rgba(91, 130, 102, 0.2)",
                            fontSize: 11,
                            color: "#8fc29d",
                            display: "inline-block",
                            fontWeight: 600,
                          }}
                        >
                          ✦ {food.key}
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </ScrollReveal>
          </section>

          {/* ========================================================= */}
          {/* ACT III: The Invisible Gap */}
          {/* ========================================================= */}
          <section
            id="act-3"
            style={{
              minHeight: "88vh",
              marginBottom: 160,
              paddingTop: 40,
            }}
          >
            <ScrollReveal>
              <div
                style={{
                  display: "inline-flex",
                  alignItems: "center",
                  gap: 8,
                  padding: "6px 14px",
                  borderRadius: 20,
                  background: "rgba(108, 70, 88, 0.22)",
                  border: "1px solid rgba(108, 70, 88, 0.45)",
                  color: "#d698b5",
                  fontSize: 11,
                  fontWeight: 700,
                  letterSpacing: "0.12em",
                  textTransform: "uppercase",
                  marginBottom: 18,
                }}
              >
                <Layers size={13} /> Act III · The Biochemical Truth
              </div>

              <SplitTextHeadline
                as="h2"
                lines={["The Invisible Nutrient Gap.", "What Everyday Thalis Conceal."]}
                style={{
                  fontSize: "clamp(2.2rem, 4.4vw, 3.6rem)",
                  lineHeight: 1.15,
                  fontFamily: "var(--font-serif, Georgia, serif)",
                  color: "#faf6ee",
                  letterSpacing: "-0.02em",
                  marginBottom: 20,
                }}
              />

              <p
                style={{
                  fontSize: "1.1rem",
                  lineHeight: 1.65,
                  color: "#c2d1c0",
                  maxWidth: 720,
                  marginBottom: 36,
                }}
              >
                A plate with 3 rotis, a bowl of dal, and aloo sabzi feels wholesome and full. But biochemical profiling reveals
                that typical urban Indian diets derive over 70% of calories from carbohydrates, while essential bioavailable protein,
                Vitamin B12, and Vitamin D fall into systemic deficits.
              </p>

              {/* Comparison Cards Grid */}
              <div
                style={{
                  display: "grid",
                  gridTemplateColumns: "repeat(auto-fit, minmax(240px, 1fr))",
                  gap: 18,
                }}
              >
                <div
                  style={{
                    background: "rgba(255, 255, 255, 0.03)",
                    border: "1px solid rgba(226, 218, 201, 0.12)",
                    borderRadius: 14,
                    padding: 22,
                  }}
                >
                  <div style={{ fontSize: 28, fontWeight: 700, color: "#c85a32", fontFamily: "var(--font-mono, monospace)" }}>
                    72%
                  </div>
                  <h4 style={{ margin: "6px 0 4px 0", fontSize: 16 }}>Protein Inadequacy</h4>
                  <p style={{ margin: 0, fontSize: 12.5, lineHeight: 1.55, color: "#9cb1a0" }}>
                    National dietary surveys show 7 out of 10 Indians consume less than 0.8g protein per kg body weight daily.
                  </p>
                </div>

                <div
                  style={{
                    background: "rgba(255, 255, 255, 0.03)",
                    border: "1px solid rgba(226, 218, 201, 0.12)",
                    borderRadius: 14,
                    padding: 22,
                  }}
                >
                  <div style={{ fontSize: 28, fontWeight: 700, color: "#d48c28", fontFamily: "var(--font-mono, monospace)" }}>
                    B₁₂ Void
                  </div>
                  <h4 style={{ margin: "6px 0 4px 0", fontSize: 16 }}>Vegetarian Blindspot</h4>
                  <p style={{ margin: 0, fontSize: 12.5, lineHeight: 1.55, color: "#9cb1a0" }}>
                    Cobalamin is absent in unfortified plant foods. NutriSync tracks bio-active dairy absorption to prevent cognitive fog.
                  </p>
                </div>

                <div
                  style={{
                    background: "rgba(255, 255, 255, 0.03)",
                    border: "1px solid rgba(226, 218, 201, 0.12)",
                    borderRadius: 14,
                    padding: 22,
                  }}
                >
                  <div style={{ fontSize: 28, fontWeight: 700, color: "#5b8266", fontFamily: "var(--font-mono, monospace)" }}>
                    Phytate Binding
                  </div>
                  <h4 style={{ margin: "6px 0 4px 0", fontSize: 16 }}>The Iron Paradox</h4>
                  <p style={{ margin: 0, fontSize: 12.5, lineHeight: 1.55, color: "#9cb1a0" }}>
                    High non-heme iron in spinach and lentils is blocked by phytates unless paired with Vitamin C (lemon, amla, tomato).
                  </p>
                </div>

                <div
                  style={{
                    background: "rgba(255, 255, 255, 0.03)",
                    border: "1px solid rgba(226, 218, 201, 0.12)",
                    borderRadius: 14,
                    padding: 22,
                  }}
                >
                  <div style={{ fontSize: 28, fontWeight: 700, color: "#9bbcd2", fontFamily: "var(--font-mono, monospace)" }}>
                    D₃ Deficiency
                  </div>
                  <h4 style={{ margin: "6px 0 4px 0", fontSize: 16 }}>Urban Melanin Factor</h4>
                  <p style={{ margin: 0, fontSize: 12.5, lineHeight: 1.55, color: "#9cb1a0" }}>
                    Melanin filters UV-B synthesis in tropical sunlight. Over 76% of urban Indians live in chronic Vitamin D insufficiency.
                  </p>
                </div>
              </div>
            </ScrollReveal>
          </section>

          {/* ========================================================= */}
          {/* ACT IV: The Real-Time Ledger */}
          {/* ========================================================= */}
          <section
            id="act-4"
            style={{
              minHeight: "88vh",
              marginBottom: 160,
              paddingTop: 40,
            }}
          >
            <ScrollReveal>
              <div
                style={{
                  display: "inline-flex",
                  alignItems: "center",
                  gap: 8,
                  padding: "6px 14px",
                  borderRadius: 20,
                  background: "rgba(91, 130, 102, 0.18)",
                  border: "1px solid rgba(91, 130, 102, 0.35)",
                  color: "#9cd6ad",
                  fontSize: 11,
                  fontWeight: 700,
                  letterSpacing: "0.12em",
                  textTransform: "uppercase",
                  marginBottom: 18,
                }}
              >
                <Sparkles size={13} /> Act IV · The Real-Time Ledger
              </div>

              <SplitTextHeadline
                as="h2"
                lines={["Conversational Hinglish.", "Streaming Intelligence."]}
                style={{
                  fontSize: "clamp(2.2rem, 4.4vw, 3.6rem)",
                  lineHeight: 1.15,
                  fontFamily: "var(--font-serif, Georgia, serif)",
                  color: "#faf6ee",
                  letterSpacing: "-0.02em",
                  marginBottom: 20,
                }}
              />

              <p
                style={{
                  fontSize: "1.1rem",
                  lineHeight: 1.65,
                  color: "#c2d1c0",
                  maxWidth: 720,
                  marginBottom: 36,
                }}
              >
                You don&apos;t think in &ldquo;grams of carbohydrates&rdquo;. You think: &ldquo;I had two jowar bhakris with a spoonful of homemade ghee,
                a bowl of chana masala, and a cold glass of salted buttermilk.&rdquo;
                Our streaming coach resolves regional nuances, understands Hinglish portions, and writes the ledger in real time.
              </p>

              {/* Simulated Live Parsing Card */}
              <div
                style={{
                  background: "rgba(18, 42, 31, 0.7)",
                  border: "1px solid rgba(226, 218, 201, 0.16)",
                  borderRadius: 18,
                  padding: 28,
                  backdropFilter: "blur(12px)",
                }}
              >
                <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 16 }}>
                  <span style={{ width: 10, height: 10, borderRadius: "50%", background: "#4ade80" }} />
                  <span style={{ fontSize: 12, color: "#9ab3a0", fontFamily: "var(--font-mono, monospace)" }}>
                    STREAMING AI PARSER · LATENCY: 280ms
                  </span>
                </div>

                <div
                  style={{
                    background: "rgba(0, 0, 0, 0.3)",
                    border: "1px solid rgba(255, 255, 255, 0.08)",
                    borderRadius: 10,
                    padding: "14px 18px",
                    fontSize: 14.5,
                    color: "#faf6ee",
                    fontFamily: "var(--font-sans, system-ui)",
                    marginBottom: 20,
                  }}
                >
                  &ldquo;2 jowar roti with half spoon ghee, 1 katori chana masala, and glass of chaas with roasted jeera&rdquo;
                </div>

                <div
                  style={{
                    display: "grid",
                    gridTemplateColumns: "repeat(auto-fit, minmax(130px, 1fr))",
                    gap: 12,
                  }}
                >
                  <div style={{ background: "rgba(255,255,255,0.04)", padding: "12px 14px", borderRadius: 8 }}>
                    <span style={{ fontSize: 10, color: "#8ca090", textTransform: "uppercase" }}>Energy</span>
                    <div style={{ fontSize: 18, fontWeight: 700, color: "#faf6ee" }}>518 kcal</div>
                  </div>
                  <div style={{ background: "rgba(255,255,255,0.04)", padding: "12px 14px", borderRadius: 8 }}>
                    <span style={{ fontSize: 10, color: "#8ca090", textTransform: "uppercase" }}>Protein</span>
                    <div style={{ fontSize: 18, fontWeight: 700, color: "#5b8266" }}>17.4 g</div>
                  </div>
                  <div style={{ background: "rgba(255,255,255,0.04)", padding: "12px 14px", borderRadius: 8 }}>
                    <span style={{ fontSize: 10, color: "#8ca090", textTransform: "uppercase" }}>Fiber</span>
                    <div style={{ fontSize: 18, fontWeight: 700, color: "#d48c28" }}>13.8 g</div>
                  </div>
                  <div style={{ background: "rgba(255,255,255,0.04)", padding: "12px 14px", borderRadius: 8 }}>
                    <span style={{ fontSize: 10, color: "#8ca090", textTransform: "uppercase" }}>Calcium</span>
                    <div style={{ fontSize: 18, fontWeight: 700, color: "#9bbcd2" }}>214 mg</div>
                  </div>
                  <div style={{ background: "rgba(255,255,255,0.04)", padding: "12px 14px", borderRadius: 8 }}>
                    <span style={{ fontSize: 10, color: "#8ca090", textTransform: "uppercase" }}>Iron</span>
                    <div style={{ fontSize: 18, fontWeight: 700, color: "#c85a32" }}>4.6 mg</div>
                  </div>
                </div>
              </div>
            </ScrollReveal>
          </section>

          {/* ========================================================= */}
          {/* ACT V: The Living Pantry */}
          {/* ========================================================= */}
          <section
            id="act-5"
            style={{
              minHeight: "75vh",
              display: "flex",
              flexDirection: "column",
              justifyContent: "center",
              alignItems: "center",
              textAlign: "center",
              padding: "60px 0 40px 0",
            }}
          >
            <ScrollReveal>
              <div
                style={{
                  display: "inline-flex",
                  alignItems: "center",
                  gap: 8,
                  padding: "6px 16px",
                  borderRadius: 20,
                  background: "rgba(212, 140, 40, 0.15)",
                  border: "1px solid rgba(212, 140, 40, 0.35)",
                  color: "#d48c28",
                  fontSize: 11,
                  fontWeight: 700,
                  letterSpacing: "0.14em",
                  textTransform: "uppercase",
                  marginBottom: 24,
                }}
              >
                <Flame size={13} /> Act V · The Living Pantry
              </div>

              <SplitTextHeadline
                as="h2"
                lines={["Your Pantry Is Waiting.", "Begin Your Measured Ledger."]}
                style={{
                  fontSize: "clamp(2.4rem, 4.8vw, 4rem)",
                  lineHeight: 1.15,
                  fontFamily: "var(--font-serif, Georgia, serif)",
                  color: "#faf6ee",
                  letterSpacing: "-0.025em",
                  marginBottom: 24,
                }}
              />

              <p
                style={{
                  fontSize: "1.15rem",
                  lineHeight: 1.7,
                  color: "#c2d1c0",
                  maxWidth: 640,
                  margin: "0 auto 36px auto",
                }}
              >
                No foreign diets. No forbidden carbohydrates. Just honest clarity, ancestral respect,
                and the computational craft of The Pantry Almanac.
              </p>

              <div style={{ display: "flex", gap: 14, justifyContent: "center", flexWrap: "wrap" }}>
                <Link
                  href="/"
                  style={{
                    padding: "16px 36px",
                    background: "#c85a32",
                    color: "#faf6ee",
                    borderRadius: 30,
                    fontSize: 15,
                    fontWeight: 700,
                    textDecoration: "none",
                    letterSpacing: "0.02em",
                    boxShadow: "0 8px 30px rgba(200, 90, 50, 0.4)",
                    display: "inline-flex",
                    alignItems: "center",
                    gap: 10,
                  }}
                >
                  Enter Your Almanac <ArrowUpRight size={18} />
                </Link>

                <Link
                  href="/dev/3d-test"
                  style={{
                    padding: "16px 28px",
                    background: "rgba(255, 255, 255, 0.06)",
                    color: "#faf6ee",
                    border: "1px solid rgba(255, 255, 255, 0.15)",
                    borderRadius: 30,
                    fontSize: 14,
                    fontWeight: 600,
                    textDecoration: "none",
                    display: "inline-flex",
                    alignItems: "center",
                    gap: 8,
                  }}
                >
                  Inspect Spatial 3D Benchmarks
                </Link>
              </div>
            </ScrollReveal>
          </section>

        </main>

        {/* Cinematic Minimal Footer */}
        <footer
          style={{
            position: "relative",
            zIndex: 10,
            borderTop: "1px solid rgba(226, 218, 201, 0.08)",
            padding: "36px 32px",
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            flexWrap: "wrap",
            gap: 16,
            fontSize: 12,
            color: "#6b7f70",
            maxWidth: 1080,
            margin: "0 auto",
          }}
        >
          <div>
            The Pantry Almanac · NutriSync v2.0 · National Institute of Nutrition (IFCT) Data
          </div>
          <div style={{ display: "flex", gap: 20 }}>
            <Link href="/" style={{ color: "#8ea492", textDecoration: "none" }}>Dashboard</Link>
            <Link href="/dev/3d-test" style={{ color: "#8ea492", textDecoration: "none" }}>3D Testbed</Link>
            <Link href="/chat" style={{ color: "#8ea492", textDecoration: "none" }}>AI Coach</Link>
          </div>
        </footer>
      </div>
    </SmoothScrollProvider>
  );
}
