"use client";

import React, { useMemo, useRef } from "react";
import { Canvas, useFrame } from "@react-three/fiber";
import * as THREE from "three";
import { useQualityTier, useTierCapabilities } from "../hooks/useQualityTier";

export type CoachOrbState = "idle" | "listening" | "thinking" | "streaming" | "tool_active" | "success";

export interface CoachOrbProps {
  state?: CoachOrbState;
  size?: number; // px size
  className?: string;
  onClick?: () => void;
}

// Color schemes per state
const STATE_COLORS: Record<CoachOrbState, { core: string; rim: string; speed: number; wobble: number }> = {
  idle: { core: "#d48c28", rim: "#5b8266", speed: 0.8, wobble: 0.15 },
  listening: { core: "#2c7a91", rim: "#68c5db", speed: 1.6, wobble: 0.35 },
  thinking: { core: "#c85a32", rim: "#d97736", speed: 2.8, wobble: 0.5 },
  tool_active: { core: "#c85a32", rim: "#f59e0b", speed: 3.2, wobble: 0.65 },
  streaming: { core: "#10b981", rim: "#f59e0b", speed: 2.0, wobble: 0.4 },
  success: { core: "#d48c28", rim: "#eab308", speed: 1.2, wobble: 0.2 },
};

function OrbParticleCloud({
  state = "idle",
  caps,
}: {
  state: CoachOrbState;
  caps: ReturnType<typeof useTierCapabilities>;
}) {
  const pointsRef = useRef<THREE.Points>(null!);
  const currentConfig = STATE_COLORS[state] || STATE_COLORS.idle;

  // Particle count adapted dynamically to hardware tier
  const count = caps.tier === "high" ? 6000 : caps.tier === "mid" ? 2400 : 800;

  // Generate spherical point cloud on fibonacci lattice
  const [positions, initialPositions, colors] = useMemo(() => {
    const pos = new Float32Array(count * 3);
    const initPos = new Float32Array(count * 3);
    const cols = new Float32Array(count * 3);

    const coreCol = new THREE.Color(currentConfig.core);
    const rimCol = new THREE.Color(currentConfig.rim);

    const phi = Math.PI * (3 - Math.sqrt(5)); // Golden angle

    for (let i = 0; i < count; i++) {
      const y = 1 - (i / (count - 1)) * 2; // y goes from 1 to -1
      const radiusAtY = Math.sqrt(1 - y * y);
      const theta = phi * i;

      const r = 1.0 + (Math.random() - 0.5) * 0.18;
      const x = Math.cos(theta) * radiusAtY * r;
      const z = Math.sin(theta) * radiusAtY * r;
      const actualY = y * r;

      pos[i * 3] = x;
      pos[i * 3 + 1] = actualY;
      pos[i * 3 + 2] = z;

      initPos[i * 3] = x;
      initPos[i * 3 + 1] = actualY;
      initPos[i * 3 + 2] = z;

      // Color interpolation: core in center, rim on outer edges
      const mixRatio = Math.min(1, Math.max(0, (r - 0.9) / 0.3));
      const vertexCol = coreCol.clone().lerp(rimCol, mixRatio);

      cols[i * 3] = vertexCol.r;
      cols[i * 3 + 1] = vertexCol.g;
      cols[i * 3 + 2] = vertexCol.b;
    }

    return [pos, initPos, cols];
  }, [count]);

  const targetCore = useMemo(() => new THREE.Color(currentConfig.core), [currentConfig.core]);
  const targetRim = useMemo(() => new THREE.Color(currentConfig.rim), [currentConfig.rim]);

  useFrame(({ clock, pointer }) => {
    if (!pointsRef.current) return;
    const t = clock.getElapsedTime() * currentConfig.speed;
    const posAttr = pointsRef.current.geometry.attributes.position as THREE.BufferAttribute;
    const colAttr = pointsRef.current.geometry.attributes.color as THREE.BufferAttribute;
    const posArr = posAttr.array as Float32Array;
    const colArr = colAttr.array as Float32Array;

    const wobbleAmount = currentConfig.wobble;

    for (let i = 0; i < count; i++) {
      const i3 = i * 3;
      const ix = initialPositions[i3];
      const iy = initialPositions[i3 + 1];
      const iz = initialPositions[i3 + 2];

      // Harmonic 3D breathing wave
      const wave = Math.sin(t + ix * 2.5 + iy * 3.0) * wobbleAmount;
      const pulse = 1.0 + Math.sin(t * 0.8) * 0.06;

      posArr[i3] = ix * (pulse + wave);
      posArr[i3 + 1] = iy * (pulse + wave);
      posArr[i3 + 2] = iz * (pulse + wave);

      // Smoothly morph particle colors toward state target
      colArr[i3] += (targetCore.r - colArr[i3]) * 0.05;
      colArr[i3 + 1] += (targetCore.g - colArr[i3 + 1]) * 0.05;
      colArr[i3 + 2] += (targetCore.b - colArr[i3 + 2]) * 0.05;
    }

    posAttr.needsUpdate = true;
    colAttr.needsUpdate = true;

    // Gentle pointer rotation
    pointsRef.current.rotation.y += 0.004;
    pointsRef.current.rotation.x = pointer.y * 0.15;
  });

  return (
    <points ref={pointsRef}>
      <bufferGeometry>
        <bufferAttribute
          attach="attributes-position"
          args={[positions, 3]}
        />
        <bufferAttribute
          attach="attributes-color"
          args={[colors, 3]}
        />
      </bufferGeometry>
      <pointsMaterial
        size={caps.tier === "high" ? 0.045 : 0.06}
        vertexColors
        transparent
        opacity={0.88}
        blending={THREE.AdditiveBlending}
        depthWrite={false}
      />
    </points>
  );
}

export function CoachOrb({
  state = "idle",
  size = 56,
  className = "",
  onClick,
}: CoachOrbProps) {
  const tier = useQualityTier();
  const caps = useTierCapabilities();
  const cfg = STATE_COLORS[state] || STATE_COLORS.idle;

  // Tier none fallback: Handcrafted 2D pulsing CSS avatar
  if (!caps.render3D) {
    return (
      <div
        className={className}
        onClick={onClick}
        style={{
          width: size,
          height: size,
          borderRadius: "50%",
          background: `radial-gradient(circle at 35% 35%, ${cfg.rim} 0%, ${cfg.core} 70%, #0b1a13 100%)`,
          boxShadow: `0 0 16px ${cfg.core}66`,
          display: "grid",
          placeItems: "center",
          cursor: onClick ? "pointer" : "default",
          position: "relative",
          flexShrink: 0,
        }}
      >
        <span
          style={{
            position: "absolute",
            inset: -3,
            borderRadius: "50%",
            border: `1.5px solid ${cfg.rim}`,
            opacity: 0.6,
            animation: "orbPulse2D 2s infinite ease-in-out",
          }}
        />
      </div>
    );
  }

  return (
    <div
      className={className}
      onClick={onClick}
      style={{
        width: size,
        height: size,
        position: "relative",
        borderRadius: "50%",
        overflow: "hidden",
        cursor: onClick ? "pointer" : "default",
        flexShrink: 0,
        background: "radial-gradient(circle, rgba(14,34,25,0.85) 0%, rgba(11,26,19,0) 70%)",
      }}
    >
      <Canvas
        frameloop="always"
        dpr={[1, Math.min(1.5, caps.dpr)]}
        camera={{ position: [0, 0, 2.5], fov: 45 }}
        gl={{
          alpha: true,
          antialias: tier !== "low",
          powerPreference: "high-performance",
        }}
        style={{ width: "100%", height: "100%", pointerEvents: "none" }}
      >
        <OrbParticleCloud state={state} caps={caps} />
      </Canvas>
    </div>
  );
}

export default CoachOrb;
