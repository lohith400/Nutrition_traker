"use client";

import { useMemo, useRef, useState } from "react";
import { Canvas, useFrame } from "@react-three/fiber";
import * as THREE from "three";
import { MicronutrientItem } from "./VitaminShelf";

type Props = {
  items: MicronutrientItem[];
  activeKey: string | null;
  onSelect: (key: string) => void;
  mobile?: boolean;
  active?: boolean;
};

// 3D Single Apothecary Jar on Shelf
function Jar3D({
  item,
  x,
  isSelected,
  onSelect,
  mobile,
}: {
  item: MicronutrientItem;
  x: number;
  isSelected: boolean;
  onSelect: (key: string) => void;
  mobile: boolean;
}) {
  const meshGroup = useRef<THREE.Group>(null);
  const liquidMesh = useRef<THREE.Mesh>(null);
  const [hovered, setHovered] = useState(false);

  const pct = item.pct ?? 0;
  const isUnknown = item.amount === null;
  const targetFill = isUnknown ? 0.05 : Math.min(1, Math.max(0.08, pct / 100));

  const liquidColor = item.group === "vitamin" ? "#8c5674" : "#448c82";
  const liquidEmissive = item.group === "vitamin" ? "#4a233b" : "#1e4d46";

  useFrame((_, delta) => {
    if (meshGroup.current) {
      // Hover / select subtle lift
      const targetY = isSelected ? 0.22 : hovered ? 0.1 : 0;
      meshGroup.current.position.y += (targetY - meshGroup.current.position.y) * 0.15;

      const targetRotZ = hovered ? 0.04 : 0;
      meshGroup.current.rotation.z += (targetRotZ - meshGroup.current.rotation.z) * 0.15;
    }
    if (liquidMesh.current) {
      const curScale = liquidMesh.current.scale.y;
      liquidMesh.current.scale.y += (targetFill - curScale) * 0.1;
      liquidMesh.current.position.y = (liquidMesh.current.scale.y * 0.7) / 2;
    }
  });

  return (
    <group
      ref={meshGroup}
      position={[x, 0, 0]}
      onClick={(e) => {
        e.stopPropagation();
        onSelect(item.key);
      }}
      onPointerOver={(e) => {
        e.stopPropagation();
        setHovered(true);
      }}
      onPointerOut={() => setHovered(false)}
    >
      {/* Wooden shelf contact shadow / ring */}
      <mesh position={[0, 0.005, 0]} rotation={[-Math.PI / 2, 0, 0]}>
        <ringGeometry args={[0.2, 0.26, 16]} />
        <meshBasicMaterial color="#000000" opacity={0.12} transparent />
      </mesh>

      {/* Glass Body */}
      <mesh position={[0, 0.42, 0]}>
        <cylinderGeometry args={[0.23, 0.23, 0.8, mobile ? 16 : 28]} />
        <meshPhysicalMaterial
          color="#f4fbfa"
          transparent
          opacity={0.3}
          roughness={0.08}
          transmission={0.88}
          ior={1.48}
        />
      </mesh>

      {/* Internal Liquid Fill */}
      <mesh ref={liquidMesh} position={[0, 0.05, 0]}>
        <cylinderGeometry args={[0.21, 0.21, 0.7, mobile ? 14 : 24]} />
        <meshStandardMaterial
          color={liquidColor}
          emissive={liquidEmissive}
          emissiveIntensity={isSelected ? 0.45 : 0.2}
          transparent
          opacity={isUnknown ? 0.25 : 0.85}
          roughness={0.2}
        />
      </mesh>

      {/* Cork Stopper at top */}
      <mesh position={[0, 0.88, 0]}>
        <cylinderGeometry args={[0.12, 0.15, 0.16, mobile ? 12 : 20]} />
        <meshStandardMaterial color="#b08851" roughness={0.85} />
      </mesh>

      {/* Selection Glow Indicator */}
      {isSelected && (
        <mesh position={[0, 0.42, 0]}>
          <cylinderGeometry args={[0.27, 0.27, 0.86, 20]} />
          <meshBasicMaterial color="#ffeed1" wireframe transparent opacity={0.35} />
        </mesh>
      )}
    </group>
  );
}

function ShelfScene({
  items,
  activeKey,
  onSelect,
  mobile,
}: {
  items: MicronutrientItem[];
  activeKey: string | null;
  onSelect: (key: string) => void;
  mobile: boolean;
}) {
  const root = useRef<THREE.Group>(null);
  const displayItems = items.slice(0, 12);
  const count = displayItems.length;
  const spacing = mobile ? 0.62 : 0.74;
  const startX = -((count - 1) * spacing) / 2;

  useFrame(({ pointer }) => {
    if (root.current) {
      // Subtle parallax shelf sway
      const targetRotY = pointer.x * 0.14;
      const targetRotX = -pointer.y * 0.08;
      root.current.rotation.y += (targetRotY - root.current.rotation.y) * 0.04;
      root.current.rotation.x += (targetRotX - root.current.rotation.x) * 0.04;
    }
  });

  return (
    <group ref={root}>
      {/* Wooden Ledge Plank */}
      <mesh position={[0, -0.06, 0]}>
        <boxGeometry args={[count * spacing + 0.6, 0.12, 1.2]} />
        <meshStandardMaterial color="#4a3625" roughness={0.7} />
      </mesh>
      {/* Wood Trim Strip */}
      <mesh position={[0, 0.02, 0.58]}>
        <boxGeometry args={[count * spacing + 0.62, 0.04, 0.04]} />
        <meshStandardMaterial color="#6a4f37" roughness={0.6} />
      </mesh>

      {/* Apothecary Jars */}
      {displayItems.map((item, idx) => (
        <Jar3D
          key={item.key}
          item={item}
          x={startX + idx * spacing}
          isSelected={activeKey === item.key}
          onSelect={onSelect}
          mobile={mobile}
        />
      ))}
    </group>
  );
}

export default function VitaminShelf3D({
  items,
  activeKey,
  onSelect,
  mobile = false,
  active = true,
}: Props) {
  return (
    <div style={{ width: "100%", height: "160px", position: "relative" }}>
      <Canvas
        frameloop={active ? "always" : "demand"}
        dpr={[1, mobile ? 1.5 : 2]}
        camera={{ position: [0, 1.2, 5.2], fov: 32 }}
        gl={{ antialias: true, alpha: true, powerPreference: "high-performance" }}
        style={{ width: "100%", height: "100%" }}
      >
        <ambientLight intensity={1.2} />
        <directionalLight position={[4, 6, 5]} intensity={1.8} color="#fffaf0" />
        <pointLight position={[-3, 2, 3]} intensity={1.0} color="#bce5de" />
        <ShelfScene
          items={items}
          activeKey={activeKey}
          onSelect={onSelect}
          mobile={mobile}
        />
      </Canvas>
    </div>
  );
}
