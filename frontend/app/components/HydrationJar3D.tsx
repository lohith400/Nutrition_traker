"use client";

import React, { useMemo, useRef, useState, useEffect } from "react";
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
  rippling,
  mobile,
}: {
  fillPct: number;
  rippling: boolean;
  mobile: boolean;
}) {
  const root = useRef<THREE.Group>(null);
  const liquidRef = useRef<THREE.Mesh>(null!);
  const curFill = useRef(fillPct);
  const wobble = useRef(0);
  const { allowTransmission } = useTierCapabilities();

  useEffect(() => {
    if (rippling) {
      wobble.current = 1.0;
    }
  }, [rippling]);

  // Materials
  const glassMat = useMemo(() => {
    if (allowTransmission) {
      return new THREE.MeshPhysicalMaterial({
        color: "#ffffff",
        roughness: 0.05,
        transmission: 0.94,
        thickness: 0.6,
        ior: 1.48,
        transparent: true,
        opacity: 0.9,
      });
    }
    return new THREE.MeshStandardMaterial({
      color: "#e6eff2",
      roughness: 0.1,
      metalness: 0.15,
      transparent: true,
      opacity: 0.68,
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

  const liquidMat = useMemo(
    () =>
      new THREE.MeshStandardMaterial({
        color: "#2c7a91",
        emissive: "#134250",
        emissiveIntensity: 0.35,
        roughness: 0.18,
        transparent: true,
        opacity: 0.88,
      }),
    []
  );

  useFrame(({ clock, pointer }) => {
    const t = clock.getElapsedTime();

    // Gentle pointer sway
    if (root.current) {
      const rotY = pointer.x * 0.2 + Math.sin(t * 0.4) * 0.02;
      root.current.rotation.y += (rotY - root.current.rotation.y) * 0.05;
    }

    // Smooth fill transition
    curFill.current += (fillPct - curFill.current) * 0.05;

    // Decay wobble
    if (wobble.current > 0.01) {
      wobble.current *= 0.92;
    }

    if (liquidRef.current) {
      const wobbleOffset = Math.sin(t * 12) * wobble.current * 0.05;
      const h = Math.max(0.05, curFill.current * 1.5 + wobbleOffset);
      liquidRef.current.scale.set(1, h, 1);
      liquidRef.current.position.y = -0.85 + h / 2;
    }
  });

  return (
    <group ref={root} position={[0, -0.1, 0]}>
      {/* Outer Carboy Glass Body */}
      <mesh material={glassMat}>
        <cylinderGeometry args={[0.78, 0.75, 1.8, mobile ? 32 : 48]} />
      </mesh>
      {/* Glass Shoulder */}
      <mesh position={[0, 0.98, 0]} material={glassMat}>
        <cylinderGeometry args={[0.38, 0.78, 0.28, mobile ? 32 : 48]} />
      </mesh>
      {/* Glass Neck Lip */}
      <mesh position={[0, 1.2, 0]} material={glassMat}>
        <torusGeometry args={[0.38, 0.06, 16, mobile ? 32 : 48]} />
      </mesh>

      {/* Cork Stopper */}
      <mesh position={[0, 1.34, 0]} material={corkMat}>
        <cylinderGeometry args={[0.32, 0.28, 0.34, 32]} />
      </mesh>

      {/* Liquid Water Column */}
      <mesh ref={liquidRef} position={[0, -0.85, 0]}>
        <cylinderGeometry args={[0.71, 0.7, 1, mobile ? 28 : 40]} />
        <primitive object={liquidMat} attach="material" />
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
  const [rippling, setRippling] = useState(false);

  const safeTarget = targetL > 0 ? targetL : 3.5;
  const pct = Math.min(1, Math.max(0, consumedL / safeTarget));

  function triggerAdd() {
    setRippling(true);
    setTimeout(() => setRippling(false), 900);
    onQuickAdd?.(0.25);
  }

  if (!caps.render3D) {
    return null;
  }

  return (
    <div style={{ width: "100%", height: "100%", position: "relative" }}>
      <Canvas
        frameloop="always"
        dpr={[1, caps.dpr]}
        camera={{ position: [0, 0.4, 3.4], fov: 38 }}
        gl={{
          antialias: tier !== "low",
          alpha: true,
          powerPreference: "high-performance",
        }}
        style={{ width: "100%", height: "100%" }}
      >
        <ambientLight intensity={1.1} color="#faf6ee" />
        <directionalLight position={[3, 5, 3]} intensity={2.2} color="#fff4df" />
        <directionalLight position={[-3.5, 0, -2]} intensity={0.9} color="#a6cbde" />
        <pointLight position={[0, -1, 1]} intensity={0.5} color="#4ea3b8" />

        <JarModel fillPct={pct} rippling={rippling} mobile={mobile} />
      </Canvas>
    </div>
  );
}
