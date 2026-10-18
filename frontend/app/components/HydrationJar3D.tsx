"use client";

import { useMemo, useRef } from "react";
import { Canvas, useFrame } from "@react-three/fiber";
import * as THREE from "three";

type Props = {
  level: number; // 0 to 1
  rippling?: boolean;
  mobile?: boolean;
  active?: boolean;
};

function CarboyMesh({
  level,
  rippling,
  mobile,
}: {
  level: number;
  rippling: boolean;
  mobile: boolean;
}) {
  const root = useRef<THREE.Group>(null);
  const body = useRef<THREE.Mesh>(null);
  const liquid = useRef<THREE.Group>(null);
  const bubbles = useRef<THREE.InstancedMesh>(null);
  const curLevel = useRef(0);
  const dummy = useMemo(() => new THREE.Object3D(), []);

  const H = 2.2;
  const bubbleCount = mobile ? 8 : 16;
  const bubbleSeeds = useMemo(
    () =>
      Array.from({ length: bubbleCount }, (_, i) => ({
        x: ((i * 43) % 19) / 19 - 0.5,
        p: (i * 0.161) % 1,
        s: 0.025 + ((i * 11) % 5) / 100,
      })),
    [bubbleCount]
  );

  useFrame(({ clock, pointer }) => {
    const t = clock.getElapsedTime();
    // Smooth transition to target level
    curLevel.current += (level - curLevel.current) * 0.08;
    const f = Math.max(0.005, Math.min(1, curLevel.current));
    const extraWave = rippling ? 0.04 : 0.012;

    if (root.current) {
      // Gentle interactive tilt towards pointer
      const targetRotY = pointer.x * 0.35;
      const targetRotX = -pointer.y * 0.12;
      root.current.rotation.y += (targetRotY - root.current.rotation.y) * 0.05;
      root.current.rotation.x += (targetRotX - root.current.rotation.x) * 0.05;
    }

    if (body.current) {
      const h = Math.max(0.02, H * f);
      body.current.scale.set(0.85, h, 0.85);
      body.current.position.y = -H / 2 + h / 2;
      body.current.visible = f > 0.01;
    }

    if (liquid.current) {
      liquid.current.position.y = -H / 2 + H * f;
      liquid.current.rotation.z = Math.sin(t * 3.0) * extraWave;
      liquid.current.rotation.x = Math.cos(t * 2.4) * (extraWave * 0.8);
      liquid.current.visible = f > 0.01;
    }

    if (bubbles.current) {
      bubbleSeeds.forEach((b, i) => {
        const rise = (b.p + t * (rippling ? 0.35 : 0.12)) % 1;
        dummy.position.set(b.x * 0.8, -H / 2 + rise * H * f, ((i % 3) - 1) * 0.2);
        dummy.scale.setScalar(f > 0.08 ? b.s : 0.0001);
        dummy.updateMatrix();
        bubbles.current!.setMatrixAt(i, dummy.matrix);
      });
      bubbles.current.instanceMatrix.needsUpdate = true;
    }
  });

  return (
    <group ref={root} position={[0, -0.05, 0]}>
      {/* Cork Stopper at top */}
      <mesh position={[0, H / 2 + 0.32, 0]}>
        <cylinderGeometry args={[0.32, 0.38, 0.28, mobile ? 20 : 32]} />
        <meshStandardMaterial color="#c49b66" roughness={0.8} />
      </mesh>

      {/* Glass Neck Lip */}
      <mesh position={[0, H / 2 + 0.15, 0]}>
        <cylinderGeometry args={[0.42, 0.42, 0.12, mobile ? 24 : 36]} />
        <meshPhysicalMaterial
          color="#d9f0f5"
          transparent
          opacity={0.3}
          roughness={0.08}
          transmission={0.85}
          ior={1.45}
        />
      </mesh>

      {/* Outer Apothecary Glass Carboy Body */}
      <mesh position={[0, 0, 0]}>
        <cylinderGeometry args={[0.95, 0.9, H, mobile ? 36 : 56, 1, true]} />
        <meshPhysicalMaterial
          color="#e6f6f8"
          transparent
          opacity={0.25}
          roughness={0.06}
          metalness={0.05}
          side={THREE.DoubleSide}
          clearcoat={1}
          clearcoatRoughness={0.1}
        />
      </mesh>

      {/* Glass Base */}
      <mesh position={[0, -H / 2, 0]} rotation={[-Math.PI / 2, 0, 0]}>
        <circleGeometry args={[0.9, mobile ? 28 : 48]} />
        <meshStandardMaterial color="#bfe6e2" transparent opacity={0.4} roughness={0.2} />
      </mesh>

      {/* Internal Water Body */}
      <mesh ref={body}>
        <cylinderGeometry args={[0.92, 0.88, 1, mobile ? 28 : 44]} />
        <meshStandardMaterial
          color="#2c7a91"
          transparent
          opacity={0.82}
          roughness={0.15}
          emissive="#1e5d70"
          emissiveIntensity={0.22}
        />
      </mesh>

      {/* Sloshing Water Meniscus Surface */}
      <group ref={liquid}>
        <mesh rotation={[-Math.PI / 2, 0, 0]}>
          <circleGeometry args={[0.92, mobile ? 28 : 44]} />
          <meshStandardMaterial
            color="#4ea3b8"
            transparent
            opacity={0.92}
            roughness={0.08}
            emissive="#388fa3"
            emissiveIntensity={0.3}
          />
        </mesh>
      </group>

      {/* Instanced Bubbles */}
      <instancedMesh
        ref={bubbles}
        args={[undefined, undefined, bubbleCount]}
        frustumCulled={false}
      >
        <sphereGeometry args={[1, 8, 8]} />
        <meshStandardMaterial color="#ffffff" transparent opacity={0.65} roughness={0.1} />
      </instancedMesh>
    </group>
  );
}

export default function HydrationJar3D({
  level,
  rippling = false,
  mobile = false,
  active = true,
}: Props) {
  return (
    <div style={{ width: "100%", height: "100%", pointerEvents: "none" }}>
      <Canvas
        frameloop={active ? "always" : "demand"}
        dpr={[1, mobile ? 1.5 : 2]}
        camera={{ position: [0, 0.25, 4.2], fov: 38 }}
        gl={{ antialias: true, alpha: true, powerPreference: "high-performance" }}
        style={{ width: "100%", height: "100%" }}
      >
        <ambientLight intensity={1.1} />
        <directionalLight position={[3, 5, 4]} intensity={2.0} color="#fff8e8" />
        <pointLight position={[-3, 1, 3]} intensity={1.2} color="#7fd6d0" />
        <CarboyMesh
          level={Math.min(1, Math.max(0, level))}
          rippling={rippling}
          mobile={mobile}
        />
      </Canvas>
    </div>
  );
}
