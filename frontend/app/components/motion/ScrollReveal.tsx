"use client";

import React, { useRef, useEffect, ReactNode } from "react";
import gsap from "gsap";
import { ScrollTrigger } from "gsap/ScrollTrigger";
import { useGSAP } from "@gsap/react";

gsap.registerPlugin(ScrollTrigger);

export interface ScrollRevealProps {
  children: ReactNode;
  className?: string;
  style?: React.CSSProperties;
  delay?: number;
  distance?: number;
}

export function ScrollReveal({
  children,
  className = "",
  style = {},
  delay = 0,
  distance = 32,
}: ScrollRevealProps) {
  const elementRef = useRef<HTMLDivElement>(null!);

  useGSAP(
    () => {
      // 1. Reduced motion -> immediate display
      if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
        if (elementRef.current) {
          elementRef.current.style.opacity = "1";
          elementRef.current.style.transform = "none";
        }
        return;
      }

      if (elementRef.current) {
        gsap.fromTo(
          elementRef.current,
          {
            opacity: 0,
            y: distance,
          },
          {
            opacity: 1,
            y: 0,
            duration: 0.8,
            ease: "cubic-bezier(0.22, 1, 0.36, 1)",
            delay,
            scrollTrigger: {
              trigger: elementRef.current,
              start: "top 90%",
              toggleActions: "play none none none",
              once: true,
            },
            onComplete: () => {
              if (elementRef.current) {
                elementRef.current.style.transform = "none";
                elementRef.current.style.willChange = "auto";
              }
            },
          }
        );
      }
    },
    { scope: elementRef, dependencies: [delay, distance] }
  );

  return (
    <div
      ref={elementRef}
      className={`css-scroll-reveal ${className}`}
      style={{
        willChange: "transform, opacity",
        ...style,
      }}
    >
      {children}
    </div>
  );
}
