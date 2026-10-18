"use client";

import React, { useEffect, useRef } from "react";
import { useQualityTier } from "../../hooks/useQualityTier";

interface StoryCanvasProps {
  progress: number; // 0 to 1 scroll progress through the story
  activeAct: number; // 0 to 4 (Act I through V)
}

interface Particle {
  x: number;
  y: number;
  vx: number;
  vy: number;
  size: number;
  alpha: number;
  maxAlpha: number;
  life: number;
  maxLife: number;
}

export function StoryCanvas({ progress, activeAct }: StoryCanvasProps) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const tier = useQualityTier();
  const particlesRef = useRef<Particle[]>([]);
  const animFrameRef = useRef<number | null>(null);

  useEffect(() => {
    // Under tier "none", do not run canvas loops
    if (tier === "none") return;

    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d", { alpha: false });
    if (!ctx) return;

    let width = (canvas.width = window.innerWidth);
    let height = (canvas.height = window.innerHeight);

    const onResize = () => {
      if (!canvas) return;
      width = canvas.width = window.innerWidth;
      height = canvas.height = window.innerHeight;
    };
    window.addEventListener("resize", onResize, { passive: true });

    // Initialize atmospheric steam / warm spice particle field
    const count = tier === "high" ? 42 : tier === "mid" ? 20 : 8;
    const particles: Particle[] = [];
    for (let i = 0; i < count; i++) {
      particles.push({
        x: Math.random() * width,
        y: Math.random() * height,
        vx: (Math.random() - 0.5) * 0.35,
        vy: -0.25 - Math.random() * 0.45,
        size: 1.2 + Math.random() * 2.2,
        alpha: Math.random() * 0.35,
        maxAlpha: 0.2 + Math.random() * 0.3,
        life: Math.random() * 200,
        maxLife: 200 + Math.random() * 200,
      });
    }
    particlesRef.current = particles;

    let lastTime = performance.now();

    const render = (time: number) => {
      const dt = Math.min((time - lastTime) / 1000, 0.1);
      lastTime = time;

      // 1. Fill base night-kitchen background: #0b1a13 (deep forest night)
      ctx.fillStyle = "#0b1a13";
      ctx.fillRect(0, 0, width, height);

      // 2. Cinematic Tungsten Key Light (shifts location subtly per act)
      // Act 0: center top
      // Act 1: upper right (illuminating food table)
      // Act 2: center left (deep contrast on nutrient gap)
      // Act 3: center glow (streaming ledger)
      // Act 4: warm hearth (golden living pantry)
      const lightPositions = [
        { x: width * 0.5, y: height * 0.25, r: width * 0.65, col: "rgba(212, 140, 40, 0.14)" },
        { x: width * 0.72, y: height * 0.35, r: width * 0.7, col: "rgba(200, 90, 50, 0.12)" },
        { x: width * 0.28, y: height * 0.5, r: width * 0.65, col: "rgba(108, 70, 88, 0.13)" },
        { x: width * 0.5, y: height * 0.42, r: width * 0.7, col: "rgba(91, 130, 102, 0.15)" },
        { x: width * 0.5, y: height * 0.5, r: width * 0.8, col: "rgba(212, 140, 40, 0.18)" },
      ];

      const currentLight = lightPositions[activeAct] || lightPositions[0];
      const grad = ctx.createRadialGradient(
        currentLight.x,
        currentLight.y,
        10,
        currentLight.x,
        currentLight.y,
        currentLight.r
      );
      grad.addColorStop(0, currentLight.col);
      grad.addColorStop(0.5, "rgba(28, 58, 43, 0.08)");
      grad.addColorStop(1, "rgba(11, 26, 19, 0)");

      ctx.fillStyle = grad;
      ctx.fillRect(0, 0, width, height);

      // 3. Cool Slate Rim Light (opposing edge for product-film rim separation)
      const rimGrad = ctx.createLinearGradient(0, height, width, 0);
      rimGrad.addColorStop(0, "rgba(20, 45, 35, 0.35)");
      rimGrad.addColorStop(0.5, "rgba(11, 26, 19, 0)");
      rimGrad.addColorStop(1, "rgba(80, 120, 105, 0.05)");
      ctx.fillStyle = rimGrad;
      ctx.fillRect(0, 0, width, height);

      // 4. Subtle Atmospheric Steam Particles (simulating kitchen hearth aura)
      for (let i = 0; i < particles.length; i++) {
        const p = particles[i];
        p.x += p.vx;
        p.y += p.vy;
        p.life += 1;

        if (p.y < -10 || p.life > p.maxLife) {
          p.x = Math.random() * width;
          p.y = height + 10;
          p.life = 0;
          p.alpha = 0;
        }

        // Fade in and out curve
        const progressLife = p.life / p.maxLife;
        p.alpha = Math.sin(progressLife * Math.PI) * p.maxAlpha;

        ctx.fillStyle = `rgba(245, 230, 205, ${p.alpha})`;
        ctx.beginPath();
        ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2);
        ctx.fill();
      }

      animFrameRef.current = requestAnimationFrame(render);
    };

    animFrameRef.current = requestAnimationFrame(render);

    return () => {
      window.removeEventListener("resize", onResize);
      if (animFrameRef.current) cancelAnimationFrame(animFrameRef.current);
    };
  }, [tier, activeAct]);

  if (tier === "none") {
    return (
      <div
        style={{
          position: "fixed",
          inset: 0,
          background: "radial-gradient(circle at 50% 30%, #152d21 0%, #0b1a13 85%)",
          zIndex: 0,
          pointerEvents: "none",
        }}
      />
    );
  }

  return (
    <canvas
      ref={canvasRef}
      style={{
        position: "fixed",
        inset: 0,
        width: "100vw",
        height: "100vh",
        zIndex: 0,
        pointerEvents: "none",
      }}
    />
  );
}
