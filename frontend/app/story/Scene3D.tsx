"use client";

import { MutableRefObject, useMemo, useRef } from "react";
import { Canvas, useFrame, useThree } from "@react-three/fiber";
import * as THREE from "three";

type Props = { progress: MutableRefObject<number>; mobile: boolean; active: boolean };

const PROTEIN = "#7ec27a";
const CARBS = "#f2a43a";
const FAT = "#e8603a";
const MACROS = [PROTEIN, CARBS, FAT];

const smooth = (a: number, b: number, x: number) => {
  const t = Math.min(1, Math.max(0, (x - a) / (b - a)));
  return t * t * (3 - 2 * t);
};
const lerp = (a: number, b: number, t: number) => a + (b - a) * t;

// Small seeded generator so the scene is identical on every load.
function rng(seed: number) {
  let s = seed;
  return () => {
    s = (s * 16807) % 2147483647;
    return (s - 1) / 2147483646;
  };
}

const BOWL_ANGLES = [Math.PI / 2, Math.PI / 2 + (Math.PI * 2) / 3, Math.PI / 2 + (Math.PI * 4) / 3];
const BOWL_RADIUS = 0.98;

function bowlGeometry() {
  const pts = [
    [0, 0], [0.26, 0], [0.4, 0.05], [0.5, 0.16], [0.56, 0.3], [0.535, 0.315],
    [0.48, 0.17], [0.38, 0.09], [0.26, 0.055], [0, 0.055],
  ].map(([x, y]) => new THREE.Vector2(x, y));
  return new THREE.LatheGeometry(pts, 40);
}

function glowTexture() {
  const c = document.createElement("canvas");
  c.width = c.height = 64;
  const g = c.getContext("2d")!;
  const grd = g.createRadialGradient(32, 32, 0, 32, 32, 32);
  grd.addColorStop(0, "rgba(255,255,255,1)");
  grd.addColorStop(0.35, "rgba(255,255,255,0.55)");
  grd.addColorStop(1, "rgba(255,255,255,0)");
  g.fillStyle = grd;
  g.fillRect(0, 0, 64, 64);
  return new THREE.CanvasTexture(c);
}

function Thali({ progress, mobile }: { progress: MutableRefObject<number>; mobile: boolean }) {
  const group = useRef<THREE.Group>(null);
  const liquids = useRef<(THREE.Mesh | null)[]>([]);
  const pointsRef = useRef<THREE.Points>(null);
  const posAttr = useRef<THREE.BufferAttribute>(null);
  const { viewport } = useThree();

  const bowl = useMemo(bowlGeometry, []);
  const steel = useMemo(
    () => new THREE.MeshStandardMaterial({ color: "#d8dcdd", metalness: 0.55, roughness: 0.32, side: THREE.DoubleSide }),
    []
  );
  const tex = useMemo(glowTexture, []);

  const N = mobile ? 650 : 1500;
  const data = useMemo(() => {
    const r = rng(7);
    const cloud = new Float32Array(N * 3);
    const target = new Float32Array(N * 3);
    const phase = new Float32Array(N);
    const colors = new Float32Array(N * 3);
    const col = new THREE.Color();
    for (let i = 0; i < N; i++) {
      const u = r(), v = r();
      const radius = 2.6 + r() * 5.5;
      const th = u * Math.PI * 2;
      const ph = Math.acos(2 * v - 1);
      cloud.set([radius * Math.sin(ph) * Math.cos(th), (radius * Math.cos(ph)) * 0.7 + 1, radius * Math.sin(ph) * Math.sin(th) - 1], i * 3);
      const b = i % 3;
      const a = r() * Math.PI * 2;
      const rr = Math.sqrt(r()) * 0.42;
      target.set(
        [Math.cos(BOWL_ANGLES[b]) * BOWL_RADIUS + Math.cos(a) * rr, 0.35 + r() * 1.1, Math.sin(BOWL_ANGLES[b]) * BOWL_RADIUS + Math.sin(a) * rr],
        i * 3
      );
      phase[i] = r() * Math.PI * 2;
      col.set(MACROS[b]);
      colors.set([col.r, col.g, col.b], i * 3);
    }
    return { cloud, target, phase, colors, positions: new Float32Array(N * 3) };
  }, [N]);

  useFrame(({ clock, camera }) => {
    const p = progress.current;
    const t = clock.getElapsedTime();
    const g = group.current;
    if (!g) return;

    const wide = viewport.width / viewport.height > 1.1;
    const toCentre = smooth(0.1, 0.35, p);
    g.position.x = wide ? lerp(1.9, 0, toCentre) : 0;
    g.position.y = (wide ? 0 : lerp(0.9, 0, toCentre)) + Math.sin(t * 0.9) * 0.07 * (1 - smooth(0.2, 0.5, p));
    g.rotation.y = t * 0.12 + p * 1.6;
    g.rotation.x = lerp(0.12, 0, smooth(0.15, 0.6, p));

    const camMix = smooth(0.15, 0.6, p);
    camera.position.set(0, lerp(2.4, 6.2, camMix), lerp(7.4, 3.6, camMix));
    camera.lookAt(0, 0, 0);

    // Katoris fill with their macro colour.
    const fill = smooth(0.58, 0.97, p);
    liquids.current.forEach((m) => {
      if (m) m.position.y = lerp(0.075, 0.27, fill);
    });

    // Nutrient points fly from a loose cloud into the three katoris.
    const m = smooth(0.2, 0.62, p);
    const sink = smooth(0.62, 0.95, p);
    const { cloud, target, phase, positions } = data;
    for (let i = 0; i < N; i++) {
      const k = i * 3;
      const w = (1 - m) * 0.3;
      const ty = lerp(target[k + 1], 0.12 + (phase[i] % 0.2), sink);
      positions[k] = lerp(cloud[k], target[k], m) + Math.sin(t * 0.6 + phase[i]) * w;
      positions[k + 1] = lerp(cloud[k + 1], ty, m) + Math.cos(t * 0.5 + phase[i] * 1.3) * w;
      positions[k + 2] = lerp(cloud[k + 2], target[k + 2], m) + Math.sin(t * 0.4 + phase[i] * 0.7) * w;
    }
    if (posAttr.current) posAttr.current.needsUpdate = true;
    if (pointsRef.current) (pointsRef.current.material as THREE.PointsMaterial).opacity = 1 - smooth(0.9, 1, p) * 0.7;
  });

  return (
    <group ref={group}>
      {/* plate */}
      <mesh position={[0, 0, 0]} material={steel}>
        <cylinderGeometry args={[2.15, 2.0, 0.08, 72]} />
      </mesh>
      <mesh position={[0, 0.045, 0]} rotation={[Math.PI / 2, 0, 0]} material={steel}>
        <torusGeometry args={[2.15, 0.06, 16, 90]} />
      </mesh>
      <mesh position={[0, 0.045, 0]} rotation={[Math.PI / 2, 0, 0]}>
        <torusGeometry args={[1.85, 0.012, 8, 90]} />
        <meshStandardMaterial color="#9aa1a3" metalness={0.5} roughness={0.5} />
      </mesh>

      {/* three katoris */}
      {BOWL_ANGLES.map((a, i) => (
        <group key={i} position={[Math.cos(a) * BOWL_RADIUS, 0.04, Math.sin(a) * BOWL_RADIUS]}>
          <mesh geometry={bowl} material={steel} />
          <mesh
            ref={(el) => { liquids.current[i] = el; }}
            position={[0, 0.075, 0]}
            rotation={[-Math.PI / 2, 0, 0]}
          >
            <circleGeometry args={[0.47, 40]} />
            <meshStandardMaterial color={MACROS[i]} emissive={MACROS[i]} emissiveIntensity={0.35} roughness={0.55} />
          </mesh>
        </group>
      ))}

      {/* nutrient points */}
      <points ref={pointsRef} frustumCulled={false}>
        <bufferGeometry>
          <bufferAttribute ref={posAttr} attach="attributes-position" args={[data.positions, 3]} />
          <bufferAttribute attach="attributes-color" args={[data.colors, 3]} />
        </bufferGeometry>
        <pointsMaterial
          map={tex}
          size={mobile ? 0.16 : 0.13}
          vertexColors
          transparent
          depthWrite={false}
          blending={THREE.AdditiveBlending}
          sizeAttenuation
        />
      </points>
    </group>
  );
}

function Droplets({ progress }: { progress: MutableRefObject<number> }) {
  const mesh = useRef<THREE.InstancedMesh>(null);
  const mat = useRef<THREE.MeshStandardMaterial>(null);
  const COUNT = 14;
  const seeds = useMemo(() => {
    const r = rng(21);
    return Array.from({ length: COUNT }, () => ({
      x: (r() - 0.5) * 7, z: (r() - 0.5) * 3 - 0.5, y: r() * 4, s: 0.05 + r() * 0.1, v: 0.18 + r() * 0.3,
    }));
  }, []);
  const dummy = useMemo(() => new THREE.Object3D(), []);

  useFrame(({ clock }) => {
    const m = mesh.current;
    if (!m) return;
    const t = clock.getElapsedTime();
    const p = progress.current;
    seeds.forEach((d, i) => {
      dummy.position.set(d.x + Math.sin(t * 0.5 + i) * 0.2, ((d.y + t * d.v) % 4.6) - 1.4, d.z);
      dummy.scale.setScalar(d.s);
      dummy.updateMatrix();
      m.setMatrixAt(i, dummy.matrix);
    });
    m.instanceMatrix.needsUpdate = true;
    if (mat.current) mat.current.opacity = 0.55 * (1 - smooth(0.08, 0.3, p));
  });

  return (
    <instancedMesh ref={mesh} args={[undefined, undefined, COUNT]} frustumCulled={false}>
      <sphereGeometry args={[1, 16, 16]} />
      <meshStandardMaterial ref={mat} color="#c5f0ea" transparent opacity={0.55} roughness={0.05} metalness={0.1} />
    </instancedMesh>
  );
}

export default function Scene3D({ progress, mobile, active }: Props) {
  return (
    <Canvas
      frameloop={active ? "always" : "never"}
      dpr={[1, mobile ? 1.5 : 2]}
      camera={{ position: [0, 2.4, 7.4], fov: 38 }}
      gl={{ antialias: !mobile, alpha: true, powerPreference: "high-performance" }}
      style={{ position: "absolute", inset: 0 }}
    >
      <hemisphereLight args={["#ffd9a0", "#10281c", 0.9]} />
      <directionalLight position={[4, 6, 3]} intensity={2} color="#ffe2b0" />
      <pointLight position={[-4, 2.5, -2]} intensity={14} color="#7fd6d0" />
      <pointLight position={[3, 1.5, 4]} intensity={10} color="#f2a43a" />
      <Thali progress={progress} mobile={mobile} />
      <Droplets progress={progress} />
    </Canvas>
  );
}
