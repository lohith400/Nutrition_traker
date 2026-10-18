"use client";

import { useEffect, useRef } from "react";
import gsap from "gsap";
import { ScrollTrigger } from "gsap/ScrollTrigger";

const STEM = "M200 560 C 200 470, 165 410, 192 330 C 220 250, 176 190, 204 96";
const LEAF = "M0 0 C 34 -34 92 -30 118 4 C 88 40 30 34 0 0 Z";
const AT = [0.16, 0.3, 0.44, 0.58, 0.72, 0.86];

export default function Plant({ reduced }: { reduced: boolean }) {
  const section = useRef<HTMLElement>(null);
  const stem = useRef<SVGPathElement>(null);
  const leaves = useRef<SVGGElement>(null);
  const bud = useRef<SVGCircleElement>(null);
  const days = useRef<HTMLSpanElement>(null);

  useEffect(() => {
    const path = stem.current;
    const lg = leaves.current;
    if (!path || !lg) return;
    const L = path.getTotalLength();
    // Place each leaf on the stem.
    Array.from(lg.children).forEach((el, i) => {
      const pt = path.getPointAtLength(L * AT[i]);
      const dir = i % 2 === 0 ? 1 : -1;
      el.setAttribute("transform", `translate(${pt.x} ${pt.y}) scale(${dir}, 1) rotate(${-8 - i * 2})`);
    });
    if (reduced) {
      path.style.strokeDasharray = `${L}`;
      path.style.strokeDashoffset = "0";
      if (days.current) days.current.textContent = "30";
      return;
    }
    gsap.registerPlugin(ScrollTrigger);
    path.style.strokeDasharray = `${L}`;
    path.style.strokeDashoffset = `${L}`;
    const ctx = gsap.context(() => {
      const tl = gsap.timeline({
        scrollTrigger: {
          trigger: section.current, start: "top top", end: "bottom bottom", scrub: 0.6,
          onUpdate: (s) => { if (days.current) days.current.textContent = String(Math.round(s.progress * 30)); },
        },
      });
      tl.to(path, { strokeDashoffset: 0, ease: "none", duration: 1 }, 0);
      Array.from(lg.children).forEach((el, i) => {
        tl.fromTo(el.firstElementChild, { opacity: 0, scale: 0 }, { opacity: 1, scale: 1, duration: 0.1, transformOrigin: "0% 50%" }, AT[i] - 0.02);
      });
      tl.fromTo(bud.current, { opacity: 0, scale: 0 }, { opacity: 1, scale: 1, duration: 0.12, transformOrigin: "50% 50%" }, 0.9);
    }, section);
    return () => ctx.revert();
  }, [reduced]);

  return (
    <section className="st-plant" ref={section}>
      <div className="st-plant-sticky">
        <div className="st-plant-copy">
          <h2 className="st-display st-h2">Small days add up.</h2>
          <p className="st-lead">Log a little every day and your streak grows with you. Miss a day and it simply waits.</p>
          <p className="st-count"><span ref={days}>0</span> days in a row <em>(example)</em></p>
        </div>
        <svg viewBox="0 0 400 600" className="st-plant-svg" role="img" aria-label="A plant growing taller as the days pass">
          <defs>
            <linearGradient id="stLeaf" x1="0" y1="0" x2="1" y2="1">
              <stop offset="0" stopColor="#9ccf7a" />
              <stop offset="1" stopColor="#3f8a55" />
            </linearGradient>
            <radialGradient id="stBud" cx="0.4" cy="0.35" r="0.8">
              <stop offset="0" stopColor="#ffe29a" />
              <stop offset="1" stopColor="#e8913a" />
            </radialGradient>
          </defs>
          <ellipse cx="200" cy="574" rx="120" ry="14" fill="#0b1a13" opacity="0.55" />
          <path ref={stem} d={STEM} fill="none" stroke="#6fae7a" strokeWidth="9" strokeLinecap="round" />
          <g ref={leaves}>
            {AT.map((_, i) => (
              <g key={i}><path d={LEAF} fill="url(#stLeaf)" /></g>
            ))}
          </g>
          <circle ref={bud} cx="204" cy="92" r="20" fill="url(#stBud)" />
        </svg>
      </div>
    </section>
  );
}
