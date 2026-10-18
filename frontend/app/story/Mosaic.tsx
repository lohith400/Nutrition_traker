"use client";

import { useEffect, useRef } from "react";
import gsap from "gsap";
import { ScrollTrigger } from "gsap/ScrollTrigger";

const TOTAL = 1014;
const PALETTE = ["#6fae7a", "#9ccf7a", "#f2a43a", "#e8603a", "#7fd6d0", "#f6e3b4", "#c9d86a"];

function seeded(seed: number) {
  let s = seed;
  return () => {
    s = (s * 16807) % 2147483647;
    return (s - 1) / 2147483646;
  };
}

export default function Mosaic({ reduced }: { reduced: boolean }) {
  const section = useRef<HTMLElement>(null);
  const canvas = useRef<HTMLCanvasElement>(null);
  const counter = useRef<HTMLSpanElement>(null);

  useEffect(() => {
    const cv = canvas.current;
    const sec = section.current;
    if (!cv || !sec) return;
    const ctx2d = cv.getContext("2d");
    if (!ctx2d) return;

    const r = seeded(99);
    const colorIdx = Array.from({ length: TOTAL }, () => Math.floor(r() * PALETTE.length));
    const noise = Array.from({ length: TOTAL }, () => r());
    let cols = 1, rows = 1, cell = 10, w = 0, h = 0, rank = new Int32Array(TOTAL);
    let progress = reduced ? 1 : 0;

    function layout() {
      const holder = cv!.parentElement!;
      w = holder.clientWidth;
      h = holder.clientHeight;
      cols = Math.max(8, Math.round(Math.sqrt((TOTAL * w) / h)));
      cell = w / cols;
      rows = Math.ceil(TOTAL / cols);
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      cv!.width = Math.round(w * dpr);
      cv!.height = Math.round(rows * cell * dpr);
      cv!.style.width = `${w}px`;
      cv!.style.height = `${rows * cell}px`;
      ctx2d!.setTransform(dpr, 0, 0, dpr, 0, 0);
      // Light up from the left, with some randomness so it feels organic.
      const order = Array.from({ length: TOTAL }, (_, i) => i).sort(
        (a, b) => ((a % cols) / cols) * 0.7 + noise[a] * 0.3 - (((b % cols) / cols) * 0.7 + noise[b] * 0.3)
      );
      order.forEach((tile, pos) => { rank[tile] = pos; });
      draw();
    }

    function draw() {
      const lit = progress * TOTAL * 1.2;
      ctx2d!.clearRect(0, 0, w, rows * cell);
      const pad = Math.max(1.5, cell * 0.08);
      for (let i = 0; i < TOTAL; i++) {
        const x = (i % cols) * cell;
        const y = Math.floor(i / cols) * cell;
        const a = Math.min(1, Math.max(0, (lit - rank[i]) / 60));
        ctx2d!.fillStyle = "#12291d";
        ctx2d!.fillRect(x + pad, y + pad, cell - pad * 2, cell - pad * 2);
        if (a > 0) {
          ctx2d!.globalAlpha = a;
          ctx2d!.fillStyle = PALETTE[colorIdx[i]];
          ctx2d!.fillRect(x + pad, y + pad, cell - pad * 2, cell - pad * 2);
          ctx2d!.globalAlpha = 1;
        }
      }
      if (counter.current) counter.current.textContent = Math.min(TOTAL, Math.round(Math.min(1, progress * 1.2) * TOTAL)).toLocaleString("en-IN");
    }

    layout();
    const onResize = () => { layout(); ScrollTrigger.refresh(); };
    window.addEventListener("resize", onResize);
    let st: ScrollTrigger | undefined;
    if (!reduced) {
      gsap.registerPlugin(ScrollTrigger);
      st = ScrollTrigger.create({
        trigger: sec, start: "top top", end: "bottom bottom", scrub: true,
        onUpdate: (s) => { progress = s.progress; draw(); },
      });
    }
    return () => { window.removeEventListener("resize", onResize); st?.kill(); };
  }, [reduced]);

  return (
    <section className="st-mosaic" ref={section}>
      <div className="st-mosaic-sticky">
        <div className="st-mosaic-grid"><canvas ref={canvas} aria-hidden="true" /></div>
        <div className="st-mosaic-shade" />
        <div className="st-mosaic-copy">
          <p className="st-bignum"><span ref={counter}>0</span> <small>of 1,014 foods</small></p>
          <h2 className="st-display st-h2">Every food on the list is checked.</h2>
          <p className="st-lead">The database comes from IFCT and Anuvaad, the Indian food tables. Dal, idli, ragi mudde and the rest are matched to real values, not guessed from a barcode.</p>
        </div>
      </div>
    </section>
  );
}
