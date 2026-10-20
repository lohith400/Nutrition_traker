"use client";

import dynamic from "next/dynamic";
import Link from "next/link";
import { CSSProperties, ReactNode, useEffect, useRef, useState } from "react";
import gsap from "gsap";
import { ScrollTrigger } from "gsap/ScrollTrigger";
import Lenis from "lenis";
import {
  Activity, ArrowRight, Bell, BookOpen, Camera, Check, ChefHat, Droplets, Flame, Footprints,
  HeartPulse, Leaf, Mic, Moon, Scale, Smartphone, Sparkles, Target,
} from "lucide-react";
import { DailyBloom } from "../components/DailyBloom";
import type { MicronutrientItem } from "../components/VitaminShelf";
import "./story.css";

gsap.registerPlugin(ScrollTrigger);

const HeroScene = dynamic(() => import("./Scenes").then((m) => m.HeroScene), { ssr: false });
const FoodGlobe = dynamic(() => import("./Scenes").then((m) => m.FoodGlobe), { ssr: false });

/* ── small helpers ─────────────────────────────────────────────────────── */

function useInView<T extends Element>(margin = "0px 0px -12% 0px", once = true) {
  const ref = useRef<T>(null);
  const [inView, setInView] = useState(false);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const io = new IntersectionObserver(
      ([e]) => {
        if (e.isIntersecting) { setInView(true); if (once) io.disconnect(); }
        else if (!once) setInView(false);
      },
      { rootMargin: margin }
    );
    io.observe(el);
    return () => io.disconnect();
  }, [margin, once]);
  return [ref, inView] as const;
}

function Reveal({ children, d = 0, className = "" }: { children: ReactNode; d?: number; className?: string }) {
  const [ref, on] = useInView<HTMLDivElement>();
  return (
    <div ref={ref} className={`sx-rv ${on ? "in" : ""} ${className}`} style={{ transitionDelay: `${d * 90}ms` }}>
      {children}
    </div>
  );
}

function Tilt({ children, className = "", max = 9 }: { children: ReactNode; className?: string; max?: number }) {
  const ref = useRef<HTMLDivElement>(null);
  const move = (e: React.PointerEvent) => {
    if (e.pointerType !== "mouse" || !ref.current) return;
    const r = ref.current.getBoundingClientRect();
    const px = (e.clientX - r.left) / r.width - 0.5;
    const py = (e.clientY - r.top) / r.height - 0.5;
    ref.current.style.setProperty("--ry", `${px * max * 2}deg`);
    ref.current.style.setProperty("--rx", `${-py * max * 2}deg`);
  };
  const leave = () => {
    ref.current?.style.setProperty("--ry", "0deg");
    ref.current?.style.setProperty("--rx", "0deg");
  };
  return (
    <div ref={ref} className={`sx-tilt ${className}`} onPointerMove={move} onPointerLeave={leave}>
      {children}
    </div>
  );
}

function Chapter({ id, tone, tag, title, children, visual, flip = false }: {
  id: string; tone: string; tag: string; title: string; children: ReactNode; visual: ReactNode; flip?: boolean;
}) {
  return (
    <section id={id} className={`sx-ch sx-${tone}`}>
      <div className={`sx-wrap sx-two ${flip ? "flip" : ""}`}>
        <div className="sx-copy">
          <Reveal><span className="sx-tag"><i />{tag}</span></Reveal>
          <Reveal d={1}><h2 className="sx-h2">{title}</h2></Reveal>
          <Reveal d={2}>{children}</Reveal>
        </div>
        <div className="sx-visual">{visual}</div>
      </div>
    </section>
  );
}

/* ── chapter visuals ───────────────────────────────────────────────────── */

function PhoneScan() {
  const [ref, on] = useInView<HTMLDivElement>("0px 0px -20% 0px");
  return (
    <div ref={ref} className={`sx-phone-wrap ${on ? "on" : ""}`}>
      <Tilt max={7}>
        <div className="sx-phone">
          <div className="sx-phone-notch" />
          <div className="sx-phone-screen">
            <svg viewBox="0 0 240 300" preserveAspectRatio="xMidYMid slice" className="sx-photo" aria-label="Illustration of an idli, sambar and chutney plate">
              <rect width="240" height="300" fill="#E8D5B0" />
              <rect y="0" width="240" height="300" fill="url(#cloth)" opacity=".35" />
              <defs>
                <pattern id="cloth" width="14" height="14" patternUnits="userSpaceOnUse"><rect width="7" height="14" fill="#fff" opacity=".35" /></pattern>
                <radialGradient id="plateG" cx=".4" cy=".35" r=".8"><stop offset="0" stopColor="#B7E0AE" /><stop offset="1" stopColor="#7DBB7E" /></radialGradient>
              </defs>
              <ellipse cx="124" cy="160" rx="104" ry="104" fill="#000" opacity=".16" />
              <circle cx="120" cy="154" r="102" fill="url(#plateG)" />
              <circle cx="120" cy="154" r="84" fill="none" stroke="#5FA364" strokeOpacity=".55" strokeWidth="2" />
              {[[96, 150], [128, 138], [124, 172]].map(([x, y], i) => (
                <g key={i}>
                  <ellipse cx={x} cy={y + 3} rx="21" ry="9" fill="#000" opacity=".1" />
                  <ellipse cx={x} cy={y} rx="21" ry="15" fill="#FFFDF6" stroke="#EDE3CC" strokeWidth="1" />
                  <ellipse cx={x - 5} cy={y - 5} rx="9" ry="4" fill="#fff" opacity=".9" />
                </g>
              ))}
              <circle cx="168" cy="106" r="27" fill="#fff" stroke="#E6DAC0" /><circle cx="168" cy="106" r="21" fill="#E08A3A" />
              <circle cx="160" cy="100" r="3" fill="#C56E26" /><circle cx="176" cy="112" r="3" fill="#C56E26" /><circle cx="170" cy="98" r="2.4" fill="#3FA36F" />
              <circle cx="72" cy="112" r="25" fill="#fff" stroke="#E6DAC0" /><circle cx="72" cy="112" r="19" fill="#FBF6E8" />
              <circle cx="66" cy="108" r="2.6" fill="#3FA36F" /><circle cx="78" cy="116" r="2.2" fill="#3FA36F" />
            </svg>
            <div className="sx-scan" />
            <span className="sx-box b1"><b>Idli × 3</b></span>
            <span className="sx-box b2"><b>Sambar</b></span>
            <span className="sx-box b3"><b>Coconut chutney</b></span>
            <div className="sx-sheet">
              <div className="sx-sheet-t"><Camera size={14} /> 3 foods found</div>
              <div className="sx-sheet-r"><span>Idli</span><em>3 pieces</em></div>
              <div className="sx-sheet-r"><span>Sambar</span><em>1 bowl</em></div>
              <div className="sx-sheet-r"><span>Coconut chutney</span><em>2 tbsp</em></div>
              <button type="button" className="sx-sheet-b" tabIndex={-1}>Log as breakfast</button>
            </div>
          </div>
        </div>
      </Tilt>
      <p className="sx-cap">Illustration. You confirm the meal and the amount before anything is logged.</p>
    </div>
  );
}

function VoiceDemo() {
  const [ref, on] = useInView<HTMLDivElement>("0px 0px -20% 0px");
  const full = "two rotis, dal and a bowl of curd";
  const [typed, setTyped] = useState(0);
  useEffect(() => {
    if (!on) return;
    let n = 0;
    const id = setInterval(() => { n += 1; setTyped(n); if (n >= full.length) clearInterval(id); }, 55);
    return () => clearInterval(id);
  }, [on]);
  const done = typed >= full.length;
  return (
    <div ref={ref} className={`sx-voice ${on ? "on" : ""}`}>
      <Tilt max={6}>
        <div className="sx-card sx-voice-card">
          <div className="sx-mic"><span /><span /><Mic size={22} /></div>
          <div className="sx-wave" aria-hidden="true">{Array.from({ length: 26 }).map((_, i) => <i key={i} style={{ "--i": i } as CSSProperties} />)}</div>
          <p className="sx-typed">&ldquo;{full.slice(0, typed)}<span className="sx-caret" />&rdquo;</p>
          <div className={`sx-chips ${done ? "in" : ""}`}>
            {["Roti × 2", "Dal", "Curd, 1 bowl"].map((c, i) => (
              <span key={c} style={{ transitionDelay: `${i * 120}ms` }}><Check size={13} /> {c}</span>
            ))}
          </div>
          <p className="sx-fine">Matched to the food database, then added to today.</p>
        </div>
      </Tilt>
    </div>
  );
}

const GLOBE_CHIPS = ["Masala dosa", "Ragi mudde", "Idli", "Dal tadka", "Palak paneer", "Bisi bele bath"];

function GlobeVisual({ mobile }: { mobile: boolean }) {
  const [ref, on] = useInView<HTMLDivElement>("200px 0px 200px 0px", false);
  const scroll = useRef(0);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const st = ScrollTrigger.create({ trigger: el, start: "top bottom", end: "bottom top", onUpdate: (s) => { scroll.current = s.progress; } });
    return () => st.kill();
  }, [ref]);
  return (
    <div ref={ref} className="sx-globe">
      <FoodGlobe scroll={scroll} mobile={mobile} active={on} />
      {GLOBE_CHIPS.map((c, i) => <span key={c} className={`sx-gchip g${i}`}>{c}</span>)}
    </div>
  );
}

const DEMO_MICROS: MicronutrientItem[] = (
  [
    ["vita", "Vitamin A", "A", "vitamin", 1000, "µg", 62], ["vitc", "Vitamin C", "C", "vitamin", 80, "mg", 118],
    ["vitd", "Vitamin D", "D", "vitamin", 15, "µg", 12], ["vite", "Vitamin E", "E", "vitamin", 10, "mg", 48],
    ["vitk", "Vitamin K", "K", "vitamin", 55, "µg", 85], ["folate", "Folate / B9", "B9", "vitamin", 300, "µg", 35],
    ["bcomplex", "B-Complex", "B", "vitamin", 100, "%", 71], ["iron", "Iron", "Fe", "mineral", 19, "mg", 55],
    ["calcium", "Calcium", "Ca", "mineral", 1000, "mg", 34], ["zinc", "Zinc", "Zn", "mineral", 17, "mg", 90],
    ["magnesium", "Magnesium", "Mg", "mineral", 440, "mg", 66], ["potassium", "Potassium", "K⁺", "mineral", 3500, "mg", 40],
  ] as const
).map(([key, name, symbol, group, target, unit, pct]) => ({
  key, name, symbol, group, target, unit, pct, amount: Math.round(((target * pct) / 100) * 10) / 10, topFoods: [],
})) as unknown as MicronutrientItem[];

function BloomVisual() {
  const [ref, on] = useInView<HTMLDivElement>("0px 0px -25% 0px");
  return (
    <div ref={ref} className="sx-bloom">
      <div className="sx-card sx-bloom-card">
        {on ? (
          <DailyBloom
            consumed={1240} target={1800} protein={58} proteinTarget={90} carbs={190} carbsTarget={260}
            fat={44} fatTarget={65} fibre={18} fibreTarget={30} micros={DEMO_MICROS} showShelfLink={false}
          />
        ) : <div className="sx-bloom-hold" />}
      </div>
      <p className="sx-cap">An example day. Yours fills in as you log.</p>
    </div>
  );
}

const ABILITIES = [
  "Look up any food", "Log a meal", "Sum up your day", "Suggest a meal", "Log water", "Set reminders",
  "Manage your grocery list", "Cook from your pantry", "Analyse a recipe", "Read your fitness data",
];

function CoachVisual() {
  const [ref, on] = useInView<HTMLDivElement>("0px 0px -20% 0px");
  return (
    <div ref={ref} className={`sx-coach ${on ? "on" : ""}`}>
      <Tilt max={5}>
        <div className="sx-card sx-chat">
          <div className="sx-msg you">I had a plain dosa and sambar. What should dinner be?</div>
          <div className="sx-steps">
            <span><Check size={12} /> Looked up the foods</span>
            <span><Check size={12} /> Logged to breakfast</span>
            <span><Check size={12} /> Checked your day</span>
          </div>
          <div className="sx-msg bot">Logged. You are light on protein today, so try dal and two rotis tonight, with a bowl of curd.</div>
        </div>
      </Tilt>
      <div className="sx-abilities">
        {ABILITIES.map((a, i) => <span key={a} style={{ transitionDelay: `${i * 60}ms` }}>{a}</span>)}
      </div>
    </div>
  );
}

function PlanVisual() {
  const [ref, on] = useInView<HTMLDivElement>("0px 0px -20% 0px");
  const dishes: Array<[string, number, string]> = [["Palak dal", 78, "#3FA36F"], ["Jowar roti × 2", 64, "#F2B632"], ["Curd, 1 bowl", 46, "#7B6CD9"]];
  return (
    <div ref={ref} className={`sx-plan ${on ? "on" : ""}`}>
      <Tilt max={8}>
        <div className="sx-card sx-plan-a">
          <h4>Today&apos;s plan</h4>
          <p className="sx-fine">Dishes that fit what is left of your day</p>
          {dishes.map(([n, w, c]) => (
            <div key={n} className="sx-row"><span>{n}</span><div className="sx-bar"><i style={{ width: `${w}%`, background: c }} /></div></div>
          ))}
        </div>
      </Tilt>
      <Tilt max={8}>
        <div className="sx-card sx-plan-b">
          <h4>Your pantry</h4>
          <p className="sx-fine">The coach cooks only from this</p>
          {["Spinach", "Toor dal", "Jowar flour", "Curd", "Onion"].map((n, i) => (
            <div key={n} className="sx-tick" style={{ transitionDelay: `${i * 110 + 300}ms` }}><Check size={13} />{n}</div>
          ))}
        </div>
      </Tilt>
    </div>
  );
}

function MoveVisual() {
  const [ref, on] = useInView<HTMLDivElement>("0px 0px -20% 0px");
  const rings = [{ r: 78, p: 0.72, c: "#F2B632", l: "Steps" }, { r: 58, p: 0.55, c: "#EF6F5A", l: "Calories burned" }, { r: 38, p: 0.85, c: "#3FA36F", l: "Move minutes" }];
  return (
    <div ref={ref} className={`sx-move ${on ? "on" : ""}`}>
      <Tilt max={7}>
        <div className="sx-card sx-rings">
          <svg viewBox="0 0 200 200" aria-label="Activity rings for steps, calories burned and move minutes">
            {rings.map((g) => {
              const circ = 2 * Math.PI * g.r;
              return (
                <g key={g.l} transform="rotate(-90 100 100)">
                  <circle cx="100" cy="100" r={g.r} fill="none" stroke={g.c} strokeOpacity=".18" strokeWidth="13" />
                  <circle cx="100" cy="100" r={g.r} fill="none" stroke={g.c} strokeWidth="13" strokeLinecap="round"
                    strokeDasharray={circ} strokeDashoffset={on ? circ * (1 - g.p) : circ} style={{ transition: "stroke-dashoffset 1.6s cubic-bezier(.22,1,.36,1) .2s" }} />
                </g>
              );
            })}
          </svg>
          <ul className="sx-legend2">
            <li><Footprints size={14} /> Steps</li><li><Flame size={14} /> Calories burned</li><li><Activity size={14} /> Move minutes</li>
            <li><HeartPulse size={14} /> Heart rate</li><li><Moon size={14} /> Sleep</li>
          </ul>
        </div>
      </Tilt>
      <Tilt max={8}>
        <div className="sx-card sx-glass">
          <svg viewBox="0 0 120 170" aria-label="A glass of water filling up">
            <defs><clipPath id="glassClip"><path d="M22 14 H98 L90 150 Q89 158 80 158 H40 Q31 158 30 150 Z" /></clipPath></defs>
            <g clipPath="url(#glassClip)">
              <g style={{ transform: `translateY(${on ? 0 : 130}px)`, transition: "transform 2s cubic-bezier(.22,1,.36,1) .3s" }}>
                <rect x="0" y="64" width="120" height="120" fill="#6CCFE0" />
                <path className="sx-wavepath" d="M-40 64 Q-20 54 0 64 T40 64 T80 64 T120 64 T160 64 V80 H-40 Z" fill="#8EDCE9" />
              </g>
            </g>
            <path d="M22 14 H98 L90 150 Q89 158 80 158 H40 Q31 158 30 150 Z" fill="none" stroke="#1D3B33" strokeOpacity=".35" strokeWidth="2" />
          </svg>
          <p><Droplets size={14} /> Log a glass with a tap</p>
        </div>
      </Tilt>
    </div>
  );
}

const MORE: Array<[ReactNode, string, string, string]> = [
  [<Bell key="a" size={22} />, "Reminders", "Set a time, a food or a hydration goal. NutriSync pings you, even as a phone notification, and can log your routine for you.", "#FFE3CF"],
  [<Activity key="b" size={22} />, "Progress and rhythm", "See how your eating compares with your targets over days and weeks.", "#DDF0E3"],
  [<Scale key="c" size={22} />, "Weight log", "Add your weight whenever you like and watch the trend line.", "#E8E1F8"],
  [<ChefHat key="d" size={22} />, "Your own recipes", "Add the ingredients of a dish and the amounts. Each one is matched to real nutrition data and totalled for you.", "#FFF0C2"],
  [<BookOpen key="e" size={22} />, "A food log you can fix", "Change a quantity, delete a mistake, or add a meal you forgot on an earlier day.", "#DAEEF6"],
  [<Sparkles key="f" size={22} />, "Notices your habits", "It learns the foods you log often and the patterns in your week, then suggests accordingly.", "#FFDAD4"],
  [<Target key="g" size={22} />, "Targets that fit you", "Set up your profile once and get calorie, macro and water targets for you.", "#D5F0EC"],
  [<Leaf key="h" size={22} />, "Vitamins and minerals", "A full shelf for twelve vitamins and minerals, with the foods that supplied each one.", "#DDF0E3"],
  [<Smartphone key="i" size={22} />, "Lives on your phone", "Add it to your home screen and it opens like an app.", "#FFF0C2"],
];

/* ── page ──────────────────────────────────────────────────────────────── */

export default function StoryPage() {
  const root = useRef<HTMLDivElement>(null);
  const heroRef = useRef<HTMLElement>(null);
  const progress = useRef(0);
  const [mode, setMode] = useState<"pending" | "full" | "lite">("pending");
  const [mobile, setMobile] = useState(false);
  const [heroActive, setHeroActive] = useState(true);

  useEffect(() => {
    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    let gl = false;
    try { const c = document.createElement("canvas"); gl = !!(c.getContext("webgl2") || c.getContext("webgl")); } catch { gl = false; }
    setMobile(window.innerWidth < 768);
    setMode(!reduced && gl ? "full" : "lite");
  }, []);

  useEffect(() => {
    if (mode === "pending") return;
    gsap.registerPlugin(ScrollTrigger);
    let lenis: Lenis | null = null;
    let tick: ((t: number) => void) | null = null;
    if (mode === "full") {
      lenis = new Lenis({ lerp: 0.1 });
      lenis.on("scroll", ScrollTrigger.update);
      tick = (t: number) => lenis!.raf(t * 1000);
      gsap.ticker.add(tick);
      gsap.ticker.lagSmoothing(0);
    }
    const ctx = gsap.context(() => {
      if (!heroRef.current) return;
      ScrollTrigger.create({
        trigger: heroRef.current, start: "top top", end: "bottom bottom", scrub: true,
        onUpdate: (s) => { progress.current = s.progress; },
        onToggle: (s) => setHeroActive(s.isActive || s.progress < 0.5),
      });
    }, root);
    return () => {
      ctx.revert();
      if (tick) gsap.ticker.remove(tick);
      lenis?.destroy();
    };
  }, [mode]);

  const lite = mode === "lite";
  return (
    <div className={`sx ${lite ? "sx-lite" : ""}`} ref={root}>
      <header className="sx-nav">
        <span className="sx-brand" style={{ display: "inline-flex", alignItems: "center", gap: 8 }}>
          <img src="/logo-icon.png" alt="NutriSync" style={{ width: 26, height: 26, borderRadius: "50%", objectFit: "cover" }} />
          <span>NutriSync</span>
        </span>
        <Link href="/" className="sx-btn sx-btn-ink sx-btn-sm">Open the app</Link>
      </header>

      <section className="sx-hero" ref={heroRef}>
        <div className="sx-hero-pin">
          <i className="sx-disc d1" /><i className="sx-disc d2" />
          <div className="sx-hero-copy">
            <Reveal><span className="sx-tag"><i />AI nutrition coach for Indian food</span></Reveal>
            <Reveal d={1}><h1 className="sx-h1">Your thali, understood.</h1></Reveal>
            <Reveal d={2}>
              <p className="sx-lead">Snap your plate, say what you ate, or type it. NutriSync does the counting and checks every food against real data.</p>
            </Reveal>
            <Reveal d={3}>
              <div className="sx-cta-row">
                <Link href="/" className="sx-btn sx-btn-ink">Open NutriSync <ArrowRight size={16} /></Link>
                <a href="#snap" className="sx-btn sx-btn-ghost">See how it works</a>
              </div>
            </Reveal>
          </div>
          <div className="sx-hero-stage">
            {mode === "full" ? (
              <HeroScene progress={progress} mobile={mobile} active={heroActive} />
            ) : lite ? (
              <svg viewBox="0 0 300 300" className="sx-flat" aria-label="A thali with three katoris">
                <ellipse cx="150" cy="260" rx="110" ry="14" fill="#1D3B33" opacity=".1" />
                <circle cx="150" cy="140" r="120" fill="#FFFDF7" stroke="#E7C26E" strokeWidth="3" />
                <circle cx="150" cy="140" r="98" fill="none" stroke="#EADFC8" strokeWidth="2" />
                <circle cx="150" cy="140" r="34" fill="#fff" stroke="#EADFC8" />
                {[[150, 62, "#BFE3CE", "#3FA36F"], [82, 180, "#FFE08A", "#F3B63B"], [218, 180, "#FFC4B8", "#FFFEFA"]].map(([x, y, a, b], i) => (
                  <g key={i}><circle cx={x as number} cy={y as number} r="34" fill={a as string} /><circle cx={x as number} cy={y as number} r="25" fill={b as string} /></g>
                ))}
              </svg>
            ) : null}
          </div>
          <p className="sx-scroll">Scroll</p>
        </div>
      </section>

      <Chapter id="snap" tone="mint" tag="Snap it" title="Point your camera at dinner."
        visual={<PhoneScan />}>
        <p className="sx-lead">Attach a photo of your meal in the coach chat. NutriSync spots the foods, estimates the portions and asks before it logs anything, so you stay in charge.</p>
        <ul className="sx-list"><li>Works with JPG, PNG and WebP photos</li><li>You confirm the meal and the amount</li><li>Edit or delete any log later</li></ul>
      </Chapter>

      <Chapter id="say" tone="butter" tag="Say it" title="Or just say it." flip visual={<VoiceDemo />}>
        <p className="sx-lead">Talk to the coach or type in plain words, like &ldquo;two rotis, dal and a bowl of curd&rdquo;. Every food is matched to the database, not guessed.</p>
        <ul className="sx-list"><li>Voice in and voice out, where your browser supports it</li><li>Quick add from anywhere with Ctrl K</li><li>Forgot a meal? Add it to an earlier day</li></ul>
      </Chapter>

      <Chapter id="foods" tone="sky" tag="Real data" title="1,014 foods, each one checked." visual={<GlobeVisual mobile={mobile} />}>
        <p className="sx-lead">The database comes from IFCT and Anuvaad, the Indian food tables. Dal, idli, ragi mudde and the rest carry real values for calories, macros, vitamins and minerals.</p>
        <p className="sx-fine">Each dot on the globe is one food.</p>
      </Chapter>

      <Chapter id="bloom" tone="blush" tag="Your day" title="All of your day in one flower." flip visual={<BloomVisual />}>
        <p className="sx-lead">Sixteen petals show four macros and twelve vitamins and minerals against your daily targets. The dotted ring is 100%. Hover or tap a petal for the exact numbers.</p>
      </Chapter>

      <Chapter id="coach" tone="lavender" tag="Your coach" title="A coach that does things, not just talks." visual={<CoachVisual />}>
        <p className="sx-lead">Ask in plain words. The coach looks up foods, logs meals, sums up your day and suggests what to eat next. It can also set reminders and manage your grocery list.</p>
      </Chapter>

      <Chapter id="plan" tone="apricot" tag="Plan and pantry" title="Dinner, decided." flip visual={<PlanVisual />}>
        <p className="sx-lead">Get suggested dishes for the rest of the day that fit your remaining macros. Keep a list of what is at home, and the coach cooks only from it.</p>
      </Chapter>

      <Chapter id="move" tone="aqua" tag="Move and drink" title="Food is half the story." visual={<MoveVisual />}>
        <p className="sx-lead">Log water with a tap. Connect Google Fit to see steps, calories burned, heart rate and sleep next to what you ate, with an energy balance that shows both sides.</p>
      </Chapter>

      <section className="sx-ch sx-paper" id="more">
        <div className="sx-wrap">
          <Reveal><span className="sx-tag"><i />And more</span></Reveal>
          <Reveal d={1}><h2 className="sx-h2">The small things that add up.</h2></Reveal>
          <div className="sx-bento">
            {MORE.map(([icon, t, body, bg], i) => (
              <Reveal key={t} d={i % 3} className="sx-bento-cell">
                <Tilt max={7}>
                  <div className="sx-bcard" style={{ background: bg }}>
                    <span className="sx-ico">{icon}</span>
                    <h4>{t}</h4>
                    <p>{body}</p>
                  </div>
                </Tilt>
              </Reveal>
            ))}
          </div>
        </div>
      </section>

      <section className="sx-ch sx-butter sx-end">
        <div className="sx-wrap sx-center">
          <Reveal><h2 className="sx-h2">Ready for your first plate?</h2></Reveal>
          <Reveal d={1}><p className="sx-lead">Open NutriSync and log your next meal with a photo, your voice or a few words.</p></Reveal>
          <Reveal d={2}><Link href="/" className="sx-btn sx-btn-ink sx-btn-lg">Open NutriSync <ArrowRight size={18} /></Link></Reveal>
        </div>
      </section>
    </div>
  );
}
