"use client";

import { useMemo, useRef } from "react";
import { Canvas, useFrame } from "@react-three/fiber";
import * as THREE from "three";

type Props = { level: number; active: boolean };

function Vessel({ level }: { level: number }) {
  const root = useRef<THREE.Group>(null);
  const liquid = useRef<THREE.Group>(null);
  const body = useRef<THREE.Mesh>(null);
  const bubbles = useRef<THREE.InstancedMesh>(null);
  const cur = useRef(0);
  const dummy = useMemo(() => new THREE.Object3D(), []);
  const seeds = useMemo(
    () => Array.from({ length: 12 }, (_, i) => ({ x: ((i * 37) % 17) / 17 - 0.5, p: (i * 0.173) % 1, s: 0.03 + ((i * 13) % 7) / 100 })),
    []
  );
  const H = 2.4;

  useFrame(({ clock, pointer }) => {
    const t = clock.getElapsedTime();
    const prev = cur.current;
    cur.current += (level - cur.current) * 0.06;
    const moving = Math.abs(level - cur.current);
    const f = cur.current;

    if (root.current) {
      root.current.rotation.y += ((pointer.x * 0.9) - root.current.rotation.y) * 0.05;
      root.current.rotation.x += ((-pointer.y * 0.15) - root.current.rotation.x) * 0.05;
    }
    if (body.current) {
      const h = Math.max(0.001, H * f);
      body.current.scale.set(1 + 0.18 * f, h, 1 + 0.18 * f);
      body.current.position.y = -H / 2 + h / 2;
      body.current.visible = f > 0.004;
    }
    if (liquid.current) {
      liquid.current.position.y = -H / 2 + H * f;
      liquid.current.rotation.z = Math.sin(t * 2.2) * (0.015 + moving * 0.5);
      liquid.current.rotation.x = Math.cos(t * 1.7) * (0.012 + moving * 0.4);
      liquid.current.visible = f > 0.004;
    }
    if (bubbles.current) {
      seeds.forEach((b, i) => {
        const rise = (b.p + t * 0.12) % 1;
        dummy.position.set(b.x * 1.1, -H / 2 + rise * H * f, ((i % 3) - 1) * 0.25);
        dummy.scale.setScalar(f > 0.05 ? b.s : 0.0001);
        dummy.updateMatrix();
        bubbles.current!.setMatrixAt(i, dummy.matrix);
      });
      bubbles.current.instanceMatrix.needsUpdate = true;
    }
    void prev;
  });

  return (
    <group ref={root}>
      {/* glass */}
      <mesh>
        <cylinderGeometry args={[1.0, 0.82, H, 56, 1, true]} />
        <meshPhysicalMaterial color="#d6f3f0" transparent opacity={0.16} roughness={0.04} metalness={0} side={THREE.DoubleSide} clearcoat={1} />
      </mesh>
      <mesh position={[0, -H / 2, 0]} rotation={[-Math.PI / 2, 0, 0]}>
        <circleGeometry args={[0.82, 48]} />
        <meshStandardMaterial color="#bfe6e2" transparent opacity={0.35} roughness={0.2} />
      </mesh>
      {/* water body: unit cylinder scaled in y by fill */}
      <mesh ref={body}>
        <cylinderGeometry args={[0.9, 0.8, 1, 48]} />
        <meshStandardMaterial color="#7fd6d0" transparent opacity={0.78} roughness={0.15} emissive="#2a8f8a" emissiveIntensity={0.25} />
      </mesh>
      {/* sloshing surface */}
      <group ref={liquid}>
        <mesh rotation={[-Math.PI / 2, 0, 0]}>
          <circleGeometry args={[0.98, 48]} />
          <meshStandardMaterial color="#aef0ea" transparent opacity={0.9} roughness={0.05} emissive="#58c4bd" emissiveIntensity={0.35} />
        </mesh>
      </group>
      <instancedMesh ref={bubbles} args={[undefined, undefined, 12]} frustumCulled={false}>
        <sphereGeometry args={[1, 10, 10]} />
        <meshStandardMaterial color="#ffffff" transparent opacity={0.5} roughness={0.1} />
      </instancedMesh>
    </group>
  );
}

export default function HydrationVessel({ level, active }: Props) {
  return (
    <Canvas
      frameloop={active ? "always" : "never"}
      dpr={[1, 1.75]}
      camera={{ position: [0, 0.3, 5.4], fov: 34 }}
      gl={{ antialias: true, alpha: true }}
      style={{ touchAction: "pan-y" }}
    >
      <hemisphereLight args={["#e8fffb", "#0e2a24", 1]} />
      <directionalLight position={[3, 5, 4]} intensity={2.2} color="#fff1d0" />
      <pointLight position={[-3, 1, 3]} intensity={12} color="#7fd6d0" />
      <Vessel level={level} />
    </Canvas>
  );
}
