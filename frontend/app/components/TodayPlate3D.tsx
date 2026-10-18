"use client";

import React, { useMemo, useRef } from "react";
import { Canvas, useFrame } from "@react-three/fiber";
import * as THREE from "three";
import { useQualityTier, useTierCapabilities } from "../hooks/useQualityTier";

export type TodayPlate3DProps = {
  protPct: number;
  carbPct: number;
  fatPct: number;
  fibrePct: number;
  mobile?: boolean;
  active?: boolean;
};

// Quadrant angles: Protein (top-right), Carbs (bottom-right), Fat (bottom-left), Fibre (top-left)
const ANGLES = [
  Math.PI * 0.25,
  Math.PI * 0.75,
  Math.PI * 1.25,
  Math.PI * 1.75,
];

const COLORS = [
  { base: "#5b8266", emissive: "#2d4d38", name: "Protein" },  // Sage Forest
  { base: "#d48c28", emissive: "#7d480e", name: "Carbohydrates" }, // Ochre Mustard
  { base: "#c85a32", emissive: "#6e2914", name: "Healthy Fats" },  // Terracotta Ember
  { base: "#8ba858", emissive: "#3e521e", name: "Dietary Fibre" }, // Olive Botanical
];

function PlateMesh({
  protPct,
  carbPct,
  fatPct,
  fibrePct,
  mobile,
}: {
  protPct: number;
  carbPct: number;
  fatPct: number;
  fibrePct: number;
  mobile: boolean;
}) {
  const root = useRef<THREE.Group>(null);
  const fills = useRef<(THREE.Mesh | null)[]>([]);
  const curFills = useRef([0, 0, 0, 0]);
  const targets = [
    Math.min(1, Math.max(0, protPct)),
    Math.min(1, Math.max(0, carbPct)),
    Math.min(1, Math.max(0, fatPct)),
    Math.min(1, Math.max(0, fibrePct)),
  ];

  // Cinematic Brushed Steel & Brass Materials
  const steelMat = useMemo(
    () =>
      new THREE.MeshStandardMaterial({
        color: "#dcd6c8",
        roughness: 0.28,
        metalness: 0.82,
      }),
    []
  );

  const brassRimMat = useMemo(
    () =>
      new THREE.MeshStandardMaterial({
        color: "#d8c49d",
        roughness: 0.32,
        metalness: 0.75,
      }),
    []
  );

  const katoriMat = useMemo(
    () =>
      new THREE.MeshStandardMaterial({
        color: "#e2dcce",
        roughness: 0.26,
        metalness: 0.78,
        side: THREE.DoubleSide,
      }),
    []
  );

  // Slow, physically weighted camera/pointer tilt with easing
  useFrame(({ clock, pointer }) => {
    const t = clock.getElapsedTime();
    if (root.current) {
      const targetRotY = pointer.x * 0.24 + Math.sin(t * 0.5) * 0.03;
      const targetRotX = -pointer.y * 0.18 + Math.PI * 0.22;
      root.current.rotation.y += (targetRotY - root.current.rotation.y) * 0.05;
      root.current.rotation.x += (targetRotX - root.current.rotation.x) * 0.05;
    }

    // Smoothly interpolate fills
    for (let i = 0; i < 4; i++) {
      curFills.current[i] += (targets[i] - curFills.current[i]) * 0.05;
      const mesh = fills.current[i];
      if (mesh) {
        const val = curFills.current[i];
        const h = Math.max(0.01, val * 0.3);
        mesh.scale.set(1, h, 1);
        mesh.position.y = 0.06 + h / 2;
        mesh.visible = val > 0.01;
      }
    }
  });

  const bowlRadius = 1.08;

  return (
    <group ref={root} rotation={[Math.PI * 0.22, 0, 0]}>
      {/* Base Brushed Steel Thali */}
      <mesh material={steelMat} receiveShadow>
        <cylinderGeometry args={[1.78, 1.54, 0.14, mobile ? 40 : 64]} />
      </mesh>
      {/* Brass Outer Rolled Rim */}
      <mesh position={[0, 0.08, 0]} material={brassRimMat}>
        <torusGeometry args={[1.74, 0.055, 16, mobile ? 40 : 64]} />
      </mesh>
      {/* Concentric Boss Ring */}
      <mesh position={[0, 0.075, 0]} material={steelMat}>
        <cylinderGeometry args={[0.55, 0.55, 0.03, 36]} />
      </mesh>
      {/* Brass Center Seal */}
      <mesh position={[0, 0.092, 0]} material={brassRimMat}>
        <cylinderGeometry args={[0.18, 0.18, 0.02, 24]} />
      </mesh>

      {/* 4 Quadrant Katoris */}
      {ANGLES.map((angle, idx) => {
        const x = Math.cos(angle) * bowlRadius;
        const z = Math.sin(angle) * bowlRadius;
        const col = COLORS[idx];

        return (
          <group key={idx} position={[x, 0.08, z]}>
            {/* Katori Dish Cup */}
            <mesh material={katoriMat} castShadow receiveShadow>
              <cylinderGeometry args={[0.42, 0.32, 0.28, mobile ? 28 : 44, 1, true]} />
            </mesh>
            {/* Katori Rim */}
            <mesh position={[0, 0.14, 0]} material={brassRimMat}>
              <torusGeometry args={[0.42, 0.025, 12, 32]} />
            </mesh>
            <mesh position={[0, -0.13, 0]} material={katoriMat}>
              <circleGeometry args={[0.32, 32]} />
            </mesh>

            {/* Glowing Organic Macro Fill */}
            <mesh
              ref={(el) => {
                fills.current[idx] = el;
              }}
              position={[0, 0.06, 0]}
            >
              <cylinderGeometry args={[0.39, 0.36, 1, 32]} />
              <meshStandardMaterial
                color={col.base}
                emissive={col.emissive}
                emissiveIntensity={0.32}
                roughness={0.35}
                transparent
                opacity={0.94}
              />
            </mesh>
          </group>
        );
      })}
    </group>
  );
}

export default function TodayPlate3D({
  protPct,
  carbPct,
  fatPct,
  fibrePct,
  mobile = false,
  active = true,
}: TodayPlate3DProps) {
  const tier = useQualityTier();
  const caps = useTierCapabilities();

  // If tier is none or reduced motion, caller displays the 2D version
  if (!caps.render3D) {
    return null;
  }

  return (
    <div style={{ width: "100%", height: "100%", position: "relative", pointerEvents: "auto" }}>
      <Canvas
        frameloop={active ? "always" : "demand"}
        dpr={[1, caps.dpr]}
        camera={{ position: [0, 3.6, 4.2], fov: 34 }}
        gl={{
          antialias: tier !== "low",
          alpha: true,
          powerPreference: "high-performance",
        }}
        style={{ width: "100%", height: "100%" }}
      >
        {/* Cinematic Indian Kitchen Lighting Model */}
        {/* Soft Ambient Fill */}
        <ambientLight intensity={1.1} color="#faf6ee" />
        {/* Warm Tungsten Key Light */}
        <directionalLight position={[4, 7, 3.5]} intensity={2.4} color="#fff1d6" castShadow />
        {/* Cool Slate Rim Light */}
        <directionalLight position={[-4, 1.5, -2.5]} intensity={1.1} color="#9bbcd2" />
        {/* Subtle Hearth Bounce */}
        <pointLight position={[0, -2, 2]} intensity={0.4} color="#d48c28" />

        <PlateMesh
          protPct={protPct}
          carbPct={carbPct}
          fatPct={fatPct}
          fibrePct={fibrePct}
          mobile={mobile}
        />
      </Canvas>
    </div>
  );
}
