"use client";

import dynamic from "next/dynamic";
import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import gsap from "gsap";
import { ScrollTrigger } from "gsap/ScrollTrigger";
import Lenis from "lenis";
import Mosaic from "./Mosaic";
import Plant from "./Plant";
import CoachDemo from "./CoachDemo";
import ThaliFallback from "./ThaliFallback";
import "./story.css";

const Scene3D = dynamic(() => import("./Scene3D"), { ssr: false });
const HydrationVessel = dynamic(() => import("./HydrationVessel"), { ssr: false });

type Mode = "pending" | "full" | "lite";

function hasWebGL() {
  try {
    const c = document.createElement("canvas");
    return !!(c.getContext("webgl2") || c.getContext("webgl"));
  } catch {
    return false;
  }
}

function useInView<T extends Element>(rootMargin = "100px") {
  const ref = useRef<T>(null);
  const [inView, setInView] = useState(false);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const io = new IntersectionObserver(([e]) => setInView(e.isIntersecting), { rootMargin });
    io.observe(el);
    return () => io.disconnect();
  }, [rootMargin]);
  return [ref, inView] as const;
}

export default function StoryExperience() {
  const root = useRef<HTMLDivElement>(null);
  const progress = useRef(0);
  const [mode, setMode] = useState<Mode>("pending");
  const [mobile, setMobile] = useState(false);
  const [stageRef, stageActive] = useInView<HTMLElement>("200px");
  const [waterRef, waterActive] = useInView<HTMLDivElement>("100px");
  const [glasses, setGlasses] = useState(0);
  const reduced = mode === "lite";

  useEffect(() => {
    const prefersReduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    setMobile(window.innerWidth < 768);
    setMode(!prefersReduced && hasWebGL() ? "full" : "lite");
  }, []);

  useEffect(() => {
    if (mode !== "full") return;
    gsap.registerPlugin(ScrollTrigger);
    const lenis = new Lenis({ lerp: 0.1 });
    lenis.on("scroll", ScrollTrigger.update);
    const tick = (t: number) => lenis.raf(t * 1000);
    gsap.ticker.add(tick);
    gsap.ticker.lagSmoothing(0);

    const ctx = gsap.context(() => {
      const trigger = { trigger: ".st-stage", start: "top top", end: "bottom bottom" };
      ScrollTrigger.create({ ...trigger, scrub: true, onUpdate: (s) => { progress.current = s.progress; } });
      const tl = gsap.timeline({ scrollTrigger: { ...trigger, scrub: 0.6 } });
      tl.to(".st-bgB", { opacity: 1, duration: 0.3, ease: "none" }, 0.18)
        .to(".st-p1", { opacity: 0, y: -60, duration: 0.1 }, 0.16)
        .fromTo(".st-p2", { opacity: 0, y: 60 }, { opacity: 1, y: 0, duration: 0.1 }, 0.3)
        .to(".st-p2", { opacity: 0, y: -60, duration: 0.1 }, 0.54)
        .fromTo(".st-p3", { opacity: 0, y: 60 }, { opacity: 1, y: 0, duration: 0.1 }, 0.68)
        .set({}, {}, 1);
    }, root);

    return () => {
      ctx.revert();
      gsap.ticker.remove(tick);
      lenis.destroy();
    };
  }, [mode]);

  return (
    <div className={`st-root ${reduced ? "st-reduced" : ""}`} ref={root}>
      <header className="st-nav">
        <span className="st-brand">NutriSync</span>
        <Link href="/" className="st-open">Open the app</Link>
      </header>

      <section className="st-stage" ref={stageRef}>
        <div className="st-sticky">
          <div className="st-bg st-bgA" />
          <div className="st-bg st-bgB" />
          <div className="st-canvas">
            {mode === "full" ? <Scene3D progress={progress} mobile={mobile} active={stageActive} /> : mode === "lite" ? <ThaliFallback /> : null}
          </div>

          <div className="st-panel st-p1">
            <h1 className="st-display st-h1">Your thali, measured.</h1>
            <p className="st-lead">NutriSync is a nutrition tracker and AI coach made for Indian food. Tell it what you ate in plain words.</p>
            <p className="st-cue">Scroll to build the plate</p>
          </div>
          <div className="st-panel st-p2">
            <h2 className="st-display st-h2">Every meal is made of three things.</h2>
            <p className="st-lead">Type “two rotis and dal” and NutriSync splits it into protein, carbs and fat.</p>
          </div>
          <div className="st-panel st-p3">
            <ul className="st-legend">
              <li><i style={{ background: "#7ec27a" }} />Protein</li>
              <li><i style={{ background: "#f2a43a" }} />Carbs</li>
              <li><i style={{ background: "#e8603a" }} />Fat</li>
            </ul>
            <p className="st-lead">Your plate fills up as the day goes on, so you can see what is still missing.</p>
          </div>
        </div>
      </section>

      <Mosaic reduced={reduced} />

      <section className="st-coach">
        <div className="st-wrap st-two">
          <div>
            <h2 className="st-display st-h2">Ask the coach anything.</h2>
            <p className="st-lead">It knows what you have eaten today, so the answer fits your day. Ask by typing or by voice.</p>
          </div>
          <CoachDemo reduced={reduced} />
        </div>
      </section>

      <section className="st-water">
        <div className="st-wrap st-two">
          <div className="st-vessel" ref={waterRef}>
            {mode === "full" ? <HydrationVessel level={glasses / 8} active={waterActive} /> : mode === "lite" ? <div className="st-vessel-flat"><div style={{ height: `${(glasses / 8) * 100}%` }} /></div> : null}
          </div>
          <div>
            <h2 className="st-display st-h2">Water counts too.</h2>
            <p className="st-lead">Track each glass and watch the jar fill. Drag the jar to turn it.</p>
            <p className="st-count">{glasses} of 8 glasses</p>
            <div className="st-actions">
              <button type="button" className="st-btn" onClick={() => setGlasses((g) => Math.min(8, g + 1))}>Add a glass</button>
              <button type="button" className="st-btn st-btn-ghost" onClick={() => setGlasses(0)}>Start over</button>
            </div>
          </div>
        </div>
      </section>

      <Plant reduced={reduced} />

      <section className="st-cta">
        <div className="st-wrap">
          <h2 className="st-display st-h2">Ready to log your first meal?</h2>
          <p className="st-lead">Open NutriSync and add what you ate today.</p>
          <Link href="/" className="st-btn st-btn-dark">Open the app</Link>
        </div>
      </section>
    </div>
  );
}
