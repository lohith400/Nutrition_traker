"use client";

import React, { useMemo, useRef, useState } from "react";
import { Canvas, useFrame } from "@react-three/fiber";
import * as THREE from "three";
import { useQualityTier, useTierCapabilities } from "../hooks/useQualityTier";
import { MicronutrientItem } from "./VitaminShelf";

interface VitaminShelf3DProps {
  items?: MicronutrientItem[] | null;
  activeKey?: string | null;
  onSelectKey?: (key: string | null) => void;
  mobile?: boolean;
}

// 6 Core Featured Apothecary Jars for the 3D Stage
const FEATURED_MICROS = [
  { key: "iron", name: "Iron", symbol: "Fe", color: "#c85a32", emissive: "#782e14" },
  { key: "calcium", name: "Calcium", symbol: "Ca", color: "#5b8266", emissive: "#2d4d38" },
  { key: "vitd", name: "Vitamin D", symbol: "D", color: "#d48c28", emissive: "#7d480e" },
  { key: "folate", name: "Folate / B9", symbol: "B₉", color: "#8c5674", emissive: "#4a243a" },
  { key: "zinc", name: "Zinc", symbol: "Zn", color: "#448c82", emissive: "#184d46" },
  { key: "vitc", name: "Vitamin C", symbol: "C", color: "#d97736", emissive: "#7a3710" },
];

function Jar3D({
  item,
  xOffset,
  pct,
  isSelected,
  onPointerDown,
}: {
  item: typeof FEATURED_MICROS[0];
  xOffset: number;
  pct: number;
  isSelected: boolean;
  onPointerDown: () => void;
}) {
  const group = useRef<THREE.Group>(null);
  const fillMesh = useRef<THREE.Mesh>(null);
  const fillHeight = Math.max(0.1, Math.min(1.0, pct / 100));

  // Materials: Turned Brass Lid, Ceramic/Glass Body, Luminous Botanical Fill
  const brassMat = useMemo(
    () =>
      new THREE.MeshStandardMaterial({
        color: "#d8c49d",
        roughness: 0.3,
        metalness: 0.8,
      }),
    []
  );

  const glassBodyMat = useMemo(
    () =>
      new THREE.MeshStandardMaterial({
        color: "#fcfaf5",
        roughness: 0.15,
        metalness: 0.1,
        transparent: true,
        opacity: 0.45,
      }),
    []
  );

  const fillMat = useMemo(
    () =>
      new THREE.MeshStandardMaterial({
        color: item.color,
        emissive: item.emissive,
        emissiveIntensity: isSelected ? 0.6 : 0.28,
        roughness: 0.35,
        transparent: true,
        opacity: 0.88,
      }),
    [item.color, item.emissive, isSelected]
  );

  useFrame(() => {
    if (group.current) {
      const targetY = isSelected ? 0.18 : 0;
      group.current.position.y += (targetY - group.current.position.y) * 0.1;
    }
  });

  return (
    <group
      ref={group}
      position={[xOffset, 0, 0]}
      onPointerDown={(e) => {
        e.stopPropagation();
        onPointerDown();
      }}
    >
      {/* Turned Brass Cap / Stopper */}
      <mesh position={[0, 0.95, 0]} material={brassMat}>
        <cylinderGeometry args={[0.26, 0.26, 0.18, 32]} />
      </mesh>
      <mesh position={[0, 1.08, 0]} material={brassMat}>
        <sphereGeometry args={[0.09, 16, 16]} />
      </mesh>

      {/* Glass Canister Neck */}
      <mesh position={[0, 0.8, 0]} material={glassBodyMat}>
        <cylinderGeometry args={[0.24, 0.28, 0.15, 32]} />
      </mesh>

      {/* Main Glass Canister Body */}
      <mesh position={[0, 0.35, 0]} material={glassBodyMat}>
        <cylinderGeometry args={[0.38, 0.38, 0.85, 32]} />
      </mesh>

      {/* Luminous Nutrient Fill */}
      <mesh
        ref={fillMesh}
        position={[0, -0.05 + (fillHeight * 0.75) / 2, 0]}
        scale={[0.9, fillHeight, 0.9]}
        material={fillMat}
      >
        <cylinderGeometry args={[0.34, 0.34, 0.75, 32]} />
      </mesh>
    </group>
  );
}

function ShelfScene({
  items,
  activeKey,
  onSelectKey,
  mobile,
}: {
  items?: MicronutrientItem[] | null;
  activeKey?: string | null;
  onSelectKey?: (key: string | null) => void;
}) {
  const rootGroup = useRef<THREE.Group>(null);

  // Gentle pointer tilt
  useFrame(({ pointer }) => {
    if (rootGroup.current) {
      const targetRotY = pointer.x * 0.15;
      const targetRotX = -pointer.y * 0.08 + 0.12;
      rootGroup.current.rotation.y += (targetRotY - rootGroup.current.rotation.y) * 0.05;
      rootGroup.current.rotation.x += (targetRotX - rootGroup.current.rotation.x) * 0.05;
    }
  });

  // Calculate actual percentages from passed items
  const lookup = useMemo(() => {
    const map = new Map<string, number>();
    if (items) {
      for (const it of items) {
        if (it.pct !== null) map.set(it.key, it.pct);
      }
    }
    return map;
  }, [items]);

  // Teak Wood Shelf Ledge Material
  const woodMat = useMemo(
    () =>
      new THREE.MeshStandardMaterial({
        color: "#3d2a1d",
        roughness: 0.65,
        metalness: 0.05,
      }),
    []
  );

  const spacing = mobile ? 0.9 : 1.15;
  const startX = -((FEATURED_MICROS.length - 1) * spacing) / 2;

  return (
    <group ref={rootGroup} position={[0, -0.3, 0]}>
      {/* Wooden Shelf Ledge */}
      <mesh position={[0, -0.15, 0]} material={woodMat}>
        <boxGeometry args={[FEATURED_MICROS.length * spacing + 0.6, 0.14, 1.2]} />
      </mesh>

      {/* Six Apothecary Canisters */}
      {FEATURED_MICROS.map((f, idx) => {
        const xOffset = startX + idx * spacing;
        const pct = lookup.get(f.key) ?? (idx === 0 ? 68 : idx === 1 ? 42 : idx === 2 ? 15 : idx === 3 ? 84 : 55);
        const isSelected = activeKey === f.key;

        return (
          <Jar3D
            key={f.key}
            item={f}
            xOffset={xOffset}
            pct={pct}
            isSelected={isSelected}
            onPointerDown={() => {
              if (onSelectKey) {
                onSelectKey(isSelected ? null : f.key);
              }
            }}
          />
        );
      })}
    </group>
  );
}

export default function VitaminShelf3D({
  items,
  activeKey = null,
  onSelectKey,
  mobile = false,
}: VitaminShelf3DProps) {
  const tier = useQualityTier();
  const caps = useTierCapabilities();

  if (!caps.render3D) {
    return null;
  }

  return (
    <div style={{ width: "100%", height: "100%", position: "relative" }}>
      <Canvas
        frameloop="demand"
        dpr={[1, caps.dpr]}
        camera={{ position: [0, 1.1, 4.8], fov: 36 }}
        gl={{
          antialias: tier !== "low",
          alpha: true,
          powerPreference: "high-performance",
        }}
        style={{ width: "100%", height: "100%" }}
      >
        <ambientLight intensity={1.1} color="#faf6ee" />
        <directionalLight position={[4, 6, 4]} intensity={2.2} color="#fff4df" />
        <directionalLight position={[-4, 1, -2]} intensity={0.9} color="#a6cbde" />
        <pointLight position={[0, -1, 1.5]} intensity={0.4} color="#d48c28" />

        <ShelfScene
          items={items}
          activeKey={activeKey}
          onSelectKey={onSelectKey}
          mobile={mobile}
        />
      </Canvas>
    </div>
  );
}
