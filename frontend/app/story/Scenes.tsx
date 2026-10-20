"use client";

import { MutableRefObject, useEffect, useMemo, useRef } from "react";
import { Canvas, useFrame } from "@react-three/fiber";
import * as THREE from "three";

const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
const sm = (a: number, b: number, x: number) => {
  const t = Math.min(1, Math.max(0, (x - a) / (b - a)));
  return t * t * (3 - 2 * t);
};
function rng(seed: number) {
  let s = seed;
  return () => {
    s = (s * 16807) % 2147483647;
    return (s - 1) / 2147483646;
  };
}

const PALETTE = ["#3FA36F", "#F2B632", "#EF6F5A", "#7B6CD9", "#38B2C4"];

function bowlGeo() {
  const pts = [
    [0, 0], [0.26, 0], [0.4, 0.05], [0.5, 0.16], [0.56, 0.3], [0.535, 0.315],
    [0.48, 0.17], [0.38, 0.09], [0.26, 0.055], [0, 0.055],
  ].map(([x, y]) => new THREE.Vector2(x, y));
  return new THREE.LatheGeometry(pts, 48);
}

function softShadow() {
  const c = document.createElement("canvas");
  c.width = c.height = 128;
  const g = c.getContext("2d")!;
  const grd = g.createRadialGradient(64, 64, 6, 64, 64, 62);
  grd.addColorStop(0, "rgba(60,45,20,0.34)");
  grd.addColorStop(0.6, "rgba(60,45,20,0.12)");
  grd.addColorStop(1, "rgba(60,45,20,0)");
  g.fillStyle = grd;
  g.fillRect(0, 0, 128, 128);
  return new THREE.CanvasTexture(c);
}

type SceneProps = { progress?: MutableRefObject<number>; mobile: boolean; active: boolean };

/* ─────────────────────────── Hero: a porcelain thali ─────────────────────────── */

const CERAMIC = ["#BFE3CE", "#FFE08A", "#FFC4B8"];
const ANGLES = [Math.PI / 2, Math.PI / 2 + (Math.PI * 2) / 3, Math.PI / 2 + (Math.PI * 4) / 3];

function Thali({ progress, mobile }: { progress: MutableRefObject<number>; mobile: boolean }) {
  const root = useRef<THREE.Group>(null);
  const bowlRefs = useRef<(THREE.Group | null)[]>([]);
  const dal = useRef<THREE.Mesh>(null);
  const bowl = useMemo(bowlGeo, []);
  const shadow = useMemo(softShadow, []);
  const data = useMemo(() => {
    const r = rng(11);
    const sabzi = Array.from({ length: 16 }, () => ({
      x: (r() - 0.5) * 0.64, z: (r() - 0.5) * 0.64, y: 0.2 + r() * 0.14, s: 0.07 + r() * 0.05,
      c: ["#3FA36F", "#2E8B57", "#EF6F5A", "#F28C38"][Math.floor(r() * 4)],
    }));
    const cumin = Array.from({ length: 10 }, () => ({ x: (r() - 0.5) * 0.7, z: (r() - 0.5) * 0.7 }));
    const rice = Array.from({ length: mobile ? 28 : 56 }, () => {
      const a = r() * Math.PI * 2;
      const b = r() * 1.25;
      return { x: 0.62 * Math.sin(b) * Math.cos(a), y: 0.18 + 0.34 * Math.cos(b), z: 0.62 * Math.sin(b) * Math.sin(a), rot: r() * 3 };
    });
    return { sabzi, cumin, rice };
  }, [mobile]);

  useFrame(({ clock, camera, pointer }) => {
    const t = clock.getElapsedTime();
    const p = progress.current;
    const g = root.current;
    if (!g) return;
    g.rotation.y = t * 0.1 + p * 2.2;
    g.rotation.x = pointer.y * 0.05;
    g.rotation.z = pointer.x * -0.04;
    g.position.y = Math.sin(t * 0.8) * 0.05;
    const spread = sm(0.05, 0.85, p);
    bowlRefs.current.forEach((b, i) => {
      if (!b) return;
      const rad = lerp(1.3, 1.62, spread);
      b.position.set(Math.cos(ANGLES[i]) * rad, 0.06 + spread * 0.1, Math.sin(ANGLES[i]) * rad);
    });
    if (dal.current) dal.current.rotation.y = t * 0.6;
    const m = sm(0.1, 0.9, p);
    camera.position.set(0, lerp(3.5, 6.1, m), lerp(5.9, 2.9, m));
    camera.lookAt(0, 0.1, 0);
  });

  return (
    <>
      <mesh position={[0, -0.09, 0]} rotation={[-Math.PI / 2, 0, 0]}>
        <planeGeometry args={[8, 8]} />
        <meshBasicMaterial map={shadow} transparent depthWrite={false} />
      </mesh>
      <group ref={root}>
        {/* plate */}
        <mesh position={[0, 0, 0]}>
          <cylinderGeometry args={[2.35, 2.12, 0.12, 80]} />
          <meshStandardMaterial color="#FFFDF7" roughness={0.32} />
        </mesh>
        <mesh position={[0, 0.06, 0]} rotation={[Math.PI / 2, 0, 0]}>
          <torusGeometry args={[2.3, 0.07, 16, 96]} />
          <meshStandardMaterial color="#FFFFFF" roughness={0.28} />
        </mesh>
        <mesh position={[0, 0.062, 0]} rotation={[Math.PI / 2, 0, 0]}>
          <torusGeometry args={[2.4, 0.016, 8, 96]} />
          <meshStandardMaterial color="#E7C26E" roughness={0.4} metalness={0.3} />
        </mesh>
        <mesh position={[0, 0.062, 0]} rotation={[Math.PI / 2, 0, 0]}>
          <torusGeometry args={[1.9, 0.012, 8, 96]} />
          <meshStandardMaterial color="#EADFC8" roughness={0.6} />
        </mesh>

        {/* rice mound */}
        <mesh position={[0, 0.16, 0]} scale={[1, 0.55, 1]}>
          <sphereGeometry args={[0.62, 32, 20]} />
          <meshStandardMaterial color="#FFFCF3" roughness={0.55} />
        </mesh>
        {data.rice.map((g, i) => (
          <mesh key={i} position={[g.x, g.y, g.z]} rotation={[g.rot, g.rot * 2, 0]} scale={[1, 0.38, 0.38]}>
            <sphereGeometry args={[0.07, 8, 6]} />
            <meshStandardMaterial color="#FFFFFF" roughness={0.5} />
          </mesh>
        ))}

        {/* roti stack, lemon and chilli in the gaps */}
        <group position={[Math.cos(Math.PI / 6) * 1.55, 0.08, Math.sin(Math.PI / 6) * 1.55]}>
          <mesh>
            <cylinderGeometry args={[0.6, 0.6, 0.05, 40]} />
            <meshStandardMaterial color="#F3D49B" roughness={0.8} />
          </mesh>
          <mesh position={[0.04, 0.05, -0.02]} rotation={[0, 0.5, 0]}>
            <cylinderGeometry args={[0.58, 0.58, 0.05, 40]} />
            <meshStandardMaterial color="#F6DBA8" roughness={0.8} />
          </mesh>
          {[[-0.2, 0.1, 0.1], [0.15, 0.1, 0.2], [0.05, 0.1, -0.22]].map((q, i) => (
            <mesh key={i} position={[q[0], q[1], q[2]]} scale={[1, 0.4, 1]}>
              <sphereGeometry args={[0.055, 8, 6]} />
              <meshStandardMaterial color="#C98B4E" roughness={0.9} />
            </mesh>
          ))}
        </group>
        <group position={[Math.cos((Math.PI * 5) / 6) * 1.62, 0.1, Math.sin((Math.PI * 5) / 6) * 1.62]}>
          <mesh rotation={[0, 0, 0]} scale={[1, 0.7, 1]}>
            <sphereGeometry args={[0.26, 20, 12, 0, Math.PI * 2, 0, Math.PI / 2]} />
            <meshStandardMaterial color="#F7DE5E" roughness={0.5} />
          </mesh>
        </group>
        <mesh position={[Math.cos((Math.PI * 3) / 2) * 1.7, 0.1, Math.sin((Math.PI * 3) / 2) * 1.7]} rotation={[0, 0.7, Math.PI / 2]}>
          <capsuleGeometry args={[0.05, 0.5, 6, 12]} />
          <meshStandardMaterial color="#3FA36F" roughness={0.5} />
        </mesh>

        {/* three katoris: sabzi, dal, curd */}
        {ANGLES.map((a, i) => (
          <group key={i} ref={(el) => { bowlRefs.current[i] = el; }} position={[Math.cos(a) * 1.3, 0.06, Math.sin(a) * 1.3]}>
            <mesh geometry={bowl} scale={0.96}>
              <meshStandardMaterial color={CERAMIC[i]} roughness={0.3} side={THREE.DoubleSide} />
            </mesh>
            {i === 0 && data.sabzi.map((s, k) => (
              <mesh key={k} position={[s.x, s.y, s.z]}>
                <icosahedronGeometry args={[s.s, 0]} />
                <meshStandardMaterial color={s.c} roughness={0.6} flatShading />
              </mesh>
            ))}
            {i === 1 && (
              <>
                <mesh position={[0, 0.2, 0]}>
                  <cylinderGeometry args={[0.46, 0.46, 0.05, 36]} />
                  <meshStandardMaterial color="#F3B63B" roughness={0.35} />
                </mesh>
                <mesh ref={dal} position={[0, 0.23, 0]} rotation={[Math.PI / 2, 0, 0]}>
                  <torusGeometry args={[0.2, 0.02, 8, 36]} />
                  <meshStandardMaterial color="#FFF1C9" roughness={0.4} />
                </mesh>
                {data.cumin.map((c, k) => (
                  <mesh key={k} position={[c.x * 0.6, 0.235, c.z * 0.6]}>
                    <sphereGeometry args={[0.018, 6, 6]} />
                    <meshStandardMaterial color="#7A4B22" />
                  </mesh>
                ))}
              </>
            )}
            {i === 2 && (
              <>
                <mesh position={[0, 0.2, 0]} scale={[1, 0.5, 1]}>
                  <sphereGeometry args={[0.47, 28, 16]} />
                  <meshStandardMaterial color="#FFFEFA" roughness={0.45} />
                </mesh>
                {[[-0.12, 0.34, 0.08], [0.1, 0.35, -0.1], [0.14, 0.33, 0.14]].map((q, k) => (
                  <mesh key={k} position={[q[0], q[1], q[2]]}>
                    <icosahedronGeometry args={[0.04, 0]} />
                    <meshStandardMaterial color="#3FA36F" flatShading />
                  </mesh>
                ))}
              </>
            )}
          </group>
        ))}
      </group>
    </>
  );
}

function Confetti({ mobile }: { mobile: boolean }) {
  const spheres = useRef<THREE.InstancedMesh>(null);
  const caps = useRef<THREE.InstancedMesh>(null);
  const dummy = useMemo(() => new THREE.Object3D(), []);
  const nS = mobile ? 14 : 24;
  const nC = mobile ? 6 : 10;
  const seeds = useMemo(() => {
    const r = rng(77);
    const mk = (n: number) => Array.from({ length: n }, () => ({
      a: r() * Math.PI * 2, rad: 3.1 + r() * 2.2, y: -0.2 + r() * 2.6, sp: 0.05 + r() * 0.12, s: 0.06 + r() * 0.09, ph: r() * 6,
    }));
    return { s: mk(nS), c: mk(nC) };
  }, [nS, nC]);

  useEffect(() => {
    const col = new THREE.Color();
    seeds.s.forEach((_, i) => { col.set(PALETTE[i % PALETTE.length]); spheres.current?.setColorAt(i, col); });
    seeds.c.forEach((_, i) => { col.set(i % 2 ? "#EF6F5A" : "#F2B632"); caps.current?.setColorAt(i, col); });
    if (spheres.current?.instanceColor) spheres.current.instanceColor.needsUpdate = true;
    if (caps.current?.instanceColor) caps.current.instanceColor.needsUpdate = true;
  }, [seeds]);

  useFrame(({ clock }) => {
    const t = clock.getElapsedTime();
    const place = (m: THREE.InstancedMesh | null, list: typeof seeds.s, tilt: boolean) => {
      if (!m) return;
      list.forEach((d, i) => {
        const a = d.a + t * d.sp;
        dummy.position.set(Math.cos(a) * d.rad, d.y + Math.sin(t * 0.7 + d.ph) * 0.25, Math.sin(a) * d.rad * 0.7 - 0.6);
        dummy.rotation.set(tilt ? t * 0.4 + d.ph : 0, tilt ? t * 0.3 : 0, tilt ? 0.6 : 0);
        dummy.scale.setScalar(d.s);
        dummy.updateMatrix();
        m.setMatrixAt(i, dummy.matrix);
      });
      m.instanceMatrix.needsUpdate = true;
    };
    place(spheres.current, seeds.s, false);
    place(caps.current, seeds.c, true);
  });

  return (
    <>
      <instancedMesh ref={spheres} args={[undefined, undefined, nS]} frustumCulled={false}>
        <sphereGeometry args={[1, 14, 12]} />
        <meshStandardMaterial roughness={0.45} />
      </instancedMesh>
      <instancedMesh ref={caps} args={[undefined, undefined, nC]} frustumCulled={false}>
        <capsuleGeometry args={[0.35, 1.3, 4, 8]} />
        <meshStandardMaterial roughness={0.5} />
      </instancedMesh>
    </>
  );
}

export function HeroScene({ progress, mobile, active }: SceneProps & { progress: MutableRefObject<number> }) {
  return (
    <Canvas
      frameloop={active ? "always" : "never"}
      dpr={[1, mobile ? 1.5 : 2]}
      camera={{ position: [0, 3.5, 5.9], fov: 34 }}
      gl={{ antialias: !mobile, alpha: true }}
      style={{ position: "absolute", inset: 0 }}
    >
      <hemisphereLight args={["#FFF7E8", "#E9DCC3", 1.25]} />
      <directionalLight position={[4, 7, 4]} intensity={2.1} color="#FFF1D6" />
      <directionalLight position={[-5, 3, -2]} intensity={0.8} color="#DDEFFF" />
      <Thali progress={progress} mobile={mobile} />
      <Confetti mobile={mobile} />
    </Canvas>
  );
}

/* ───────────────────── Globe: 1,014 foods on a golden spiral ───────────────────── */

const FOODS = 1014;

function Globe({ scroll, mobile }: { scroll: MutableRefObject<number>; mobile: boolean }) {
  const mesh = useRef<THREE.InstancedMesh>(null);
  const group = useRef<THREE.Group>(null);
  const dummy = useMemo(() => new THREE.Object3D(), []);
  const R = mobile ? 2.2 : 2.5;
  const pts = useMemo(() => {
    const a = new Float32Array(FOODS * 3);
    const golden = Math.PI * (3 - Math.sqrt(5));
    for (let i = 0; i < FOODS; i++) {
      const y = 1 - (i / (FOODS - 1)) * 2;
      const r = Math.sqrt(1 - y * y);
      const phi = i * golden;
      a[i * 3] = Math.cos(phi) * r;
      a[i * 3 + 1] = y;
      a[i * 3 + 2] = Math.sin(phi) * r;
    }
    return a;
  }, []);

  useEffect(() => {
    const m = mesh.current;
    if (!m) return;
    const col = new THREE.Color();
    for (let i = 0; i < FOODS; i++) {
      col.set(PALETTE[(i * 7 + Math.floor(i / 11)) % PALETTE.length]);
      m.setColorAt(i, col);
    }
    if (m.instanceColor) m.instanceColor.needsUpdate = true;
  }, []);

  useFrame(({ clock, pointer }) => {
    const m = mesh.current;
    const g = group.current;
    if (!m || !g) return;
    const t = clock.getElapsedTime();
    g.rotation.y = t * 0.12 + scroll.current * 3;
    g.rotation.x = 0.25 + pointer.y * 0.25;
    g.rotation.z = pointer.x * 0.12;
    for (let i = 0; i < FOODS; i++) {
      const x = pts[i * 3], y = pts[i * 3 + 1], z = pts[i * 3 + 2];
      const wave = Math.max(0, Math.sin(t * 1.5 - y * 3.2));
      dummy.position.set(x * R, y * R, z * R);
      dummy.scale.setScalar(0.062 * (1 + wave * 0.9));
      dummy.updateMatrix();
      m.setMatrixAt(i, dummy.matrix);
    }
    m.instanceMatrix.needsUpdate = true;
  });

  return (
    <group ref={group}>
      <instancedMesh ref={mesh} args={[undefined, undefined, FOODS]} frustumCulled={false}>
        <sphereGeometry args={[1, 12, 10]} />
        <meshStandardMaterial roughness={0.4} />
      </instancedMesh>
    </group>
  );
}

export function FoodGlobe({ scroll, mobile, active }: SceneProps & { scroll: MutableRefObject<number> }) {
  return (
    <Canvas
      frameloop={active ? "always" : "never"}
      dpr={[1, mobile ? 1.5 : 2]}
      camera={{ position: [0, 0, 7.2], fov: 36 }}
      gl={{ antialias: !mobile, alpha: true }}
      style={{ position: "absolute", inset: 0 }}
    >
      <hemisphereLight args={["#FFFFFF", "#CFE6EF", 1.3]} />
      <directionalLight position={[3, 4, 5]} intensity={1.8} color="#FFF3DC" />
      <Globe scroll={scroll} mobile={mobile} />
    </Canvas>
  );
}
