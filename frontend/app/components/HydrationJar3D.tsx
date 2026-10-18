"use client";

import React, { useMemo, useRef, useEffect } from "react";
import { Canvas, useFrame } from "@react-three/fiber";
import * as THREE from "three";
import { useQualityTier, useTierCapabilities } from "../hooks/useQualityTier";

export type HydrationJar3DProps = {
  consumedL: number;
  targetL: number;
  onQuickAdd?: (amountL: number) => void;
  mobile?: boolean;
};

function JarModel({
  fillPct,
  mobile,
}: {
  fillPct: number;
  mobile: boolean;
}) {
  const root = useRef<THREE.Group>(null);
  const liquidGroup = useRef<THREE.Group>(null!);
  const liquidMesh = useRef<THREE.Mesh>(null!);
  const meniscusMesh = useRef<THREE.Mesh>(null!);
  const curFill = useRef(fillPct);
  const prevFill = useRef(fillPct);
  const wobble = useRef(0);
  const { allowTransmission } = useTierCapabilities();

  // Trigger ripple when fillPct increases
  useEffect(() => {
    if (fillPct !== prevFill.current) {
      wobble.current = 1.0;
      prevFill.current = fillPct;
    }
  }, [fillPct]);

  // Outer Glass Material: depthWrite must be false so internal liquid is never culled
  const glassMat = useMemo(() => {
    if (allowTransmission) {
      return new THREE.MeshPhysicalMaterial({
        color: "#ffffff",
        roughness: 0.08,
        transmission: 0.92,
        thickness: 0.5,
        ior: 1.48,
        transparent: true,
        opacity: 0.85,
        depthWrite: false,
        side: THREE.FrontSide,
      });
    }
    return new THREE.MeshStandardMaterial({
      color: "#e6eff2",
      roughness: 0.12,
      metalness: 0.15,
      transparent: true,
      opacity: 0.55,
      depthWrite: false,
      side: THREE.FrontSide,
    });
  }, [allowTransmission]);

  const corkMat = useMemo(
    () =>
      new THREE.MeshStandardMaterial({
        color: "#b28654",
        roughness: 0.75,
        metalness: 0.05,
      }),
    []
  );

  // Liquid Material: vibrant botanical water teal with emissive depth
  const liquidMat = useMemo(
    () =>
      new THREE.MeshStandardMaterial({
        color: "#2c7a91",
        emissive: "#154d5c",
        emissiveIntensity: 0.45,
        roughness: 0.15,
        transparent: true,
        opacity: 0.92,
        side: THREE.DoubleSide,
      }),
    []
  );

  const meniscusMat = useMemo(
    () =>
      new THREE.MeshStandardMaterial({
        color: "#54b2cc",
        emissive: "#1b6275",
        emissiveIntensity: 0.5,
        roughness: 0.1,
        transparent: true,
        opacity: 0.95,
        side: THREE.DoubleSide,
      }),
    []
  );

  useFrame(({ clock, pointer }) => {
    const t = clock.getElapsedTime();

    // Gentle interactive pointer tilt
    if (root.current) {
      const rotY = pointer.x * 0.22 + Math.sin(t * 0.4) * 0.03;
      const rotX = -pointer.y * 0.12 + 0.05;
      root.current.rotation.y += (rotY - root.current.rotation.y) * 0.06;
      root.current.rotation.x += (rotX - root.current.rotation.x) * 0.06;
    }

    // Smooth lerp to target fill percentage
    curFill.current += (fillPct - curFill.current) * 0.08;

    // Decay the slosh wobble
    if (wobble.current > 0.005) {
      wobble.current *= 0.94;
    } else {
      wobble.current = 0;
    }

    // Water level height calculations
    const maxLiquidHeight = 1.6;
    const wobbleOffset = Math.sin(t * 14) * wobble.current * 0.06;
    const h = Math.max(0.04, Math.min(maxLiquidHeight, curFill.current * maxLiquidHeight + wobbleOffset));

    if (liquidMesh.current && meniscusMesh.current) {
      liquidMesh.current.scale.set(1, h, 1);
      liquidMesh.current.position.y = -0.85 + h / 2;
      // Meniscus disk sits right at top of liquid column
      meniscusMesh.current.position.y = -0.85 + h;
      meniscusMesh.current.rotation.z = Math.sin(t * 10) * wobble.current * 0.08;
    }
  });

  return (
    <group ref={root} position={[0, -0.1, 0]}>
      {/* 1. INTERNAL LIQUID (Rendered FIRST, renderOrder = 1) */}
      <group ref={liquidGroup}>
        {/* Liquid Cylinder Column */}
        <mesh ref={liquidMesh} renderOrder={1} position={[0, -0.85, 0]}>
          <cylinderGeometry args={[0.72, 0.7, 1, mobile ? 28 : 40, 1, true]} />
          <primitive object={liquidMat} attach="material" />
        </mesh>
        {/* Liquid Bottom Disk */}
        <mesh position={[0, -0.84, 0]} rotation={[-Math.PI / 2, 0, 0]} renderOrder={1}>
          <circleGeometry args={[0.7, 32]} />
          <primitive object={liquidMat} attach="material" />
        </mesh>
        {/* Liquid Top Meniscus Disk */}
        <mesh ref={meniscusMesh} rotation={[-Math.PI / 2, 0, 0]} renderOrder={1}>
          <circleGeometry args={[0.71, 32]} />
          <primitive object={meniscusMat} attach="material" />
        </mesh>
      </group>

      {/* 2. CORK STOPPER (Solid Opaque, renderOrder = 2) */}
      <mesh position={[0, 1.34, 0]} material={corkMat} renderOrder={2}>
        <cylinderGeometry args={[0.32, 0.28, 0.34, 32]} />
      </mesh>

      {/* 3. OUTER GLASS BODY (Transparent, renderOrder = 3, depthWrite = false) */}
      <mesh material={glassMat} renderOrder={3}>
        <cylinderGeometry args={[0.78, 0.75, 1.8, mobile ? 32 : 48]} />
      </mesh>
      {/* Glass Shoulder */}
      <mesh position={[0, 0.98, 0]} material={glassMat} renderOrder={3}>
        <cylinderGeometry args={[0.38, 0.78, 0.28, mobile ? 32 : 48]} />
      </mesh>
      {/* Glass Neck Lip */}
      <mesh position={[0, 1.2, 0]} material={glassMat} renderOrder={3}>
        <torusGeometry args={[0.38, 0.06, 16, mobile ? 32 : 48]} />
      </mesh>
    </group>
  );
}

export default function HydrationJar3D({
  consumedL,
  targetL,
  onQuickAdd,
  mobile = false,
}: HydrationJar3DProps) {
  const tier = useQualityTier();
  const caps = useTierCapabilities();

  const safeTarget = targetL > 0 ? targetL : 3.5;
  const pct = Math.min(1, Math.max(0, consumedL / safeTarget));

  if (!caps.render3D) {
    return null;
  }

  return (
    <div style={{ width: "100%", height: "100%", position: "relative" }}>
      <Canvas
        frameloop="always"
        dpr={[1, caps.dpr]}
        camera={{ position: [0, 0.35, 3.2], fov: 40 }}
        gl={{
          antialias: tier !== "low",
          alpha: true,
          powerPreference: "high-performance",
        }}
        style={{ width: "100%", height: "100%" }}
      >
        <ambientLight intensity={1.2} color="#faf6ee" />
        <directionalLight position={[3, 5, 3]} intensity={2.4} color="#fff4df" />
        <directionalLight position={[-3.5, 0.5, -2]} intensity={1.0} color="#a6cbde" />
        <pointLight position={[0, -0.5, 1.2]} intensity={0.6} color="#4ea3b8" />

        <JarModel fillPct={pct} mobile={mobile} />
      </Canvas>
    </div>
  );
}
