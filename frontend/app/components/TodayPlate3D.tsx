"use client";

import { useMemo, useRef } from "react";
import { Canvas, useFrame } from "@react-three/fiber";
import * as THREE from "three";

type Props = {
  protPct: number;
  carbPct: number;
  fatPct: number;
  fibrePct: number;
  mobile?: boolean;
  active?: boolean;
};

// Bowled quadrant angles (top-right, bottom-right, bottom-left, top-left)
const ANGLES = [
  Math.PI * 0.25,  // Protein (top-right)
  Math.PI * 0.75,  // Carbs (bottom-right)
  Math.PI * 1.25,  // Fat (bottom-left)
  Math.PI * 1.75,  // Fibre (top-left)
];

const COLORS = [
  { base: "#7ec27a", emissive: "#366e33" }, // Protein
  { base: "#f2a43a", emissive: "#7d480e" }, // Carbs
  { base: "#e8603a", emissive: "#73240e" }, // Fat
  { base: "#8ba858", emissive: "#3e521e" }, // Fibre
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

  // Ceramic plate material
  const ceramicMat = useMemo(
    () =>
      new THREE.MeshStandardMaterial({
        color: "#fcfaf4",
        roughness: 0.38,
        metalness: 0.05,
      }),
    []
  );

  const rimMat = useMemo(
    () =>
      new THREE.MeshStandardMaterial({
        color: "#ede7da",
        roughness: 0.5,
        metalness: 0.1,
      }),
    []
  );

  const katoriMat = useMemo(
    () =>
      new THREE.MeshStandardMaterial({
        color: "#f4eee1",
        roughness: 0.32,
        metalness: 0.12,
        side: THREE.DoubleSide,
      }),
    []
  );

  // Smooth pointer tilt & fill animation
  useFrame(({ clock, pointer }) => {
    const t = clock.getElapsedTime();
    if (root.current) {
      // Subtle interactive wobble / tilt
      const targetRotY = pointer.x * 0.28 + Math.sin(t * 0.6) * 0.04;
      const targetRotX = -pointer.y * 0.22 + Math.PI * 0.28; // gentle top-down perspective angle
      root.current.rotation.y += (targetRotY - root.current.rotation.y) * 0.06;
      root.current.rotation.x += (targetRotX - root.current.rotation.x) * 0.06;
    }

    // Interpolate fills
    for (let i = 0; i < 4; i++) {
      curFills.current[i] += (targets[i] - curFills.current[i]) * 0.06;
      const mesh = fills.current[i];
      if (mesh) {
        const val = curFills.current[i];
        const h = Math.max(0.01, val * 0.28);
        mesh.scale.set(1, h, 1);
        mesh.position.y = 0.06 + h / 2;
        mesh.visible = val > 0.01;
      }
    }
  });

  const bowlRadius = 1.05;

  return (
    <group ref={root} rotation={[Math.PI * 0.28, 0, 0]}>
      {/* Base ceramic dish */}
      <mesh material={ceramicMat} receiveShadow>
        <cylinderGeometry args={[1.72, 1.5, 0.14, mobile ? 36 : 56]} />
      </mesh>
      {/* Outer raised rim */}
      <mesh position={[0, 0.08, 0]} material={rimMat}>
        <torusGeometry args={[1.68, 0.06, 12, mobile ? 36 : 56]} />
      </mesh>
      {/* Inner central boss */}
      <mesh position={[0, 0.075, 0]} material={ceramicMat}>
        <cylinderGeometry args={[0.55, 0.55, 0.03, 32]} />
      </mesh>

      {/* 4 Quadrant Katoris and data-driven macro fills */}
      {ANGLES.map((angle, idx) => {
        const x = Math.cos(angle) * bowlRadius;
        const z = Math.sin(angle) * bowlRadius;
        const col = COLORS[idx];

        return (
          <group key={idx} position={[x, 0.08, z]}>
            {/* Katori Bowl Cup */}
            <mesh material={katoriMat} castShadow receiveShadow>
              <cylinderGeometry args={[0.38, 0.3, 0.24, mobile ? 24 : 36, 1, true]} />
            </mesh>
            <mesh position={[0, -0.11, 0]} material={katoriMat}>
              <circleGeometry args={[0.3, mobile ? 20 : 32]} />
            </mesh>

            {/* Glowing Organic Macro Fill */}
            <mesh
              ref={(el) => {
                fills.current[idx] = el;
              }}
              position={[0, 0.06, 0]}
            >
              <cylinderGeometry args={[0.36, 0.34, 1, mobile ? 20 : 32]} />
              <meshStandardMaterial
                color={col.base}
                emissive={col.emissive}
                emissiveIntensity={0.35}
                roughness={0.25}
                transparent
                opacity={0.92}
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
}: Props) {
  return (
    <div style={{ width: "100%", height: "100%", pointerEvents: "none" }}>
      <Canvas
        frameloop={active ? "always" : "demand"}
        dpr={[1, mobile ? 1.5 : 2]}
        camera={{ position: [0, 2.8, 3.4], fov: 36 }}
        gl={{ antialias: true, alpha: true, powerPreference: "high-performance" }}
        style={{ width: "100%", height: "100%" }}
      >
        <ambientLight intensity={1.2} />
        <directionalLight position={[4, 6, 3]} intensity={1.8} color="#fff8e8" />
        <pointLight position={[-3, 2, 2]} intensity={0.8} color="#dbe6db" />
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
