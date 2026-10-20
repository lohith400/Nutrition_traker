"use client";

import React, { useRef } from "react";
import gsap from "gsap";
import { ScrollTrigger } from "gsap/ScrollTrigger";
import { useGSAP } from "@gsap/react";

gsap.registerPlugin(ScrollTrigger);

export interface SplitTextHeadlineProps {
  lines: string[];
  as?: "h1" | "h2" | "h3" | "h4" | "p";
  className?: string;
  style?: React.CSSProperties;
  delay?: number;
}

export function SplitTextHeadline({
  lines,
  as = "h2",
  className = "",
  style = {},
  delay = 0,
}: SplitTextHeadlineProps) {
  const containerRef = useRef<HTMLHeadingElement>(null!);
  const lineRefs = useRef<HTMLSpanElement[]>([]);

  useGSAP(
    () => {
      // Respect reduced motion
      if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
        return;
      }

      if (!containerRef.current || lineRefs.current.length === 0) return;

      gsap.fromTo(
        lineRefs.current,
        {
          yPercent: 105,
          opacity: 0,
        },
        {
          yPercent: 0,
          opacity: 1,
          duration: 1.1,
          stagger: 0.12,
          ease: "power3.out", // Equivalent to cubic-bezier(0.22, 1, 0.36, 1)
          delay,
          scrollTrigger: {
            trigger: containerRef.current,
            start: "top 85%",
            toggleActions: "play none none none",
            once: true,
          },
        }
      );
    },
    { scope: containerRef, dependencies: [lines, delay] }
  );

  const Component: React.ElementType = as;

  return (
    <Component
      ref={containerRef as any}
      className={className}
      style={{
        margin: 0,
        fontFamily: "var(--font-serif, Fraunces, serif)",
        letterSpacing: "-0.015em",
        ...style,
      }}
    >
      {lines.map((line, idx) => (
        <span
          key={idx}
          style={{
            display: "block",
            overflow: "hidden",
            paddingBottom: "0.08em",
          }}
        >
          <span
            ref={(el) => {
              if (el) lineRefs.current[idx] = el;
            }}
            style={{
              display: "block",
              willChange: "transform, opacity",
            }}
          >
            {line}
          </span>
        </span>
      ))}
    </Component>
  );
}
