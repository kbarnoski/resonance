"use client";

import { Canvas, ThreeEvent, useFrame } from "@react-three/fiber";
import { MutableRefObject, useMemo, useRef } from "react";
import * as THREE from "three";
import { MusicBoxAudio } from "./ks-audio";
import { ROW_COLORS, ROW_COUNT } from "./ks-audio";
import { Pattern, STEP_COUNT } from "./store";

// ── layout constants ─────────────────────────────────────────────────────────
const RADIUS = 2.1;
const HEIGHT = 4.2;            // along the cylinder axis (Y is mapped to length)
const ROT_PERIOD = 9;          // seconds per full rotation (slow, calm)
// Pluck point = the camera-facing front of the cylinder. A pin's local angle a
// uses x=sin(a), z=cos(a), so the front (+Z, toward the camera) is world angle 0.
// After rotating the body by `rot`, a pin at step s sits at world angle a+rot,
// and is at the comb when a+rot ≡ 0, i.e. a ≡ -rot. So COMB_ANGLE is 0.
const COMB_ANGLE = 0;

// row 0 (low) at bottom, row ROW_COUNT-1 (high) at top
function rowY(row: number): number {
  const span = HEIGHT * 0.78;
  const t = row / (ROW_COUNT - 1);
  return -span / 2 + t * span;
}
function stepAngle(step: number): number {
  return (step / STEP_COUNT) * Math.PI * 2;
}

interface SceneProps {
  patternRef: MutableRefObject<Pattern>;
  audioRef: MutableRefObject<MusicBoxAudio | null>;
  onToggle: (row: number, step: number) => void;
  // version bumps whenever the pattern changes so studs re-render
  version: number;
  paused: boolean;
}

// ── pin studs ────────────────────────────────────────────────────────────────
// One instanced-ish set: we render an array of small cylinders for active pins.
function Studs({
  patternRef,
  version,
  pingRef,
}: {
  patternRef: MutableRefObject<Pattern>;
  version: number;
  pingRef: MutableRefObject<Map<string, number>>;
}) {
  // recompute active pin list when version changes
  const pins = useMemo(() => {
    const list: Array<{ row: number; step: number; key: string }> = [];
    const p = patternRef.current;
    for (let r = 0; r < ROW_COUNT; r++) {
      for (let s = 0; s < STEP_COUNT; s++) {
        if (p[r]?.[s]) list.push({ row: r, step: s, key: `${r}-${s}` });
      }
    }
    return list;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [version]);

  const refs = useRef<Array<THREE.Mesh | null>>([]);

  useFrame(() => {
    // animate a little "pop" ping when a pin was just plucked
    const now = performance.now();
    for (let i = 0; i < pins.length; i++) {
      const mesh = refs.current[i];
      if (!mesh) continue;
      const t = pingRef.current.get(pins[i].key) ?? 0;
      const age = (now - t) / 260;
      const pop = t > 0 && age < 1 ? Math.sin(age * Math.PI) : 0;
      const s = 1 + pop * 0.9;
      mesh.scale.set(s, 1 + pop * 1.4, s);
      const mat = mesh.material as THREE.MeshStandardMaterial;
      mat.emissiveIntensity = 0.25 + pop * 1.6;
    }
  });

  return (
    <>
      {pins.map((pin, i) => {
        const y = rowY(pin.row);
        const a = stepAngle(pin.step);
        const x = Math.sin(a) * (RADIUS + 0.02);
        const z = Math.cos(a) * (RADIUS + 0.02);
        const color = ROW_COLORS[pin.row] ?? "#ffd166";
        return (
          <mesh
            key={pin.key}
            ref={(m) => {
              refs.current[i] = m;
            }}
            position={[x, y, z]}
            rotation={[Math.PI / 2, 0, -a]}
          >
            {/* a little raised stud (pin) */}
            <cylinderGeometry args={[0.12, 0.16, 0.34, 12]} />
            <meshStandardMaterial
              color={color}
              emissive={color}
              emissiveIntensity={0.25}
              roughness={0.4}
              metalness={0.1}
            />
          </mesh>
        );
      })}
    </>
  );
}

// ── tappable slot grid (front face only) ─────────────────────────────────────
// Invisible little hit-planes at each slot, only added for slots whose angle is
// near the camera-facing front, so taps land on the front of the cylinder.
function HitGrid({
  rotationRef,
  onToggle,
}: {
  rotationRef: MutableRefObject<number>;
  onToggle: (row: number, step: number) => void;
}) {
  const groupRef = useRef<THREE.Group>(null!);

  // keep the hit-grid rotating in lockstep with the visible cylinder
  useFrame(() => {
    if (groupRef.current) groupRef.current.rotation.y = rotationRef.current;
  });

  const slots = useMemo(() => {
    const arr: Array<{ row: number; step: number }> = [];
    for (let r = 0; r < ROW_COUNT; r++) {
      for (let s = 0; s < STEP_COUNT; s++) arr.push({ row: r, step: s });
    }
    return arr;
  }, []);

  return (
    <group ref={groupRef}>
      {slots.map(({ row, step }) => {
        const y = rowY(row);
        const a = stepAngle(step);
        const x = Math.sin(a) * (RADIUS + 0.04);
        const z = Math.cos(a) * (RADIUS + 0.04);
        return (
          <mesh
            key={`hit-${row}-${step}`}
            position={[x, y, z]}
            rotation={[0, a, 0]}
            onPointerDown={(e: ThreeEvent<PointerEvent>) => {
              // Only accept taps on the front-facing side: the slot's world
              // normal must point roughly toward the camera (+Z after rotation).
              const worldQuat = new THREE.Quaternion();
              (e.object as THREE.Mesh).getWorldQuaternion(worldQuat);
              const normal = new THREE.Vector3(0, 0, 1).applyQuaternion(
                worldQuat,
              );
              if (normal.z > 0.25) {
                e.stopPropagation();
                onToggle(row, step);
              }
            }}
          >
            {/* generous tap target */}
            <planeGeometry args={[(RADIUS * 2 * Math.PI) / STEP_COUNT * 0.9, (HEIGHT * 0.78) / (ROW_COUNT - 1) * 0.95]} />
            <meshBasicMaterial transparent opacity={0} depthWrite={false} side={THREE.DoubleSide} />
          </mesh>
        );
      })}
    </group>
  );
}

// ── the rotating body + comb + pluck detection ───────────────────────────────
function Box({
  patternRef,
  audioRef,
  onToggle,
  version,
  paused,
}: SceneProps) {
  const bodyRef = useRef<THREE.Group>(null!);
  const rotationRef = useRef(0);
  const lastStepRef = useRef(-1);
  const pingRef = useRef<Map<string, number>>(new Map());

  useFrame((_, delta) => {
    if (!paused) {
      rotationRef.current += (delta / ROT_PERIOD) * Math.PI * 2;
    }
    if (bodyRef.current) bodyRef.current.rotation.y = rotationRef.current;

    // Which step is currently passing the comb point?
    // A pin at step s sits at world angle (stepAngle(s) + rotation). It is at
    // the comb when that angle ≡ COMB_ANGLE (mod 2π).
    const twoPi = Math.PI * 2;
    const rot = ((rotationRef.current % twoPi) + twoPi) % twoPi;
    // pin step s is at comb when stepAngle(s) + rot == COMB_ANGLE (mod 2π)
    // => stepAngle(s) == COMB_ANGLE - rot
    let target = COMB_ANGLE - rot;
    target = ((target % twoPi) + twoPi) % twoPi;
    const stepFloat = (target / twoPi) * STEP_COUNT;
    const step = Math.round(stepFloat) % STEP_COUNT;

    if (step !== lastStepRef.current) {
      lastStepRef.current = step;
      if (!paused) {
        const p = patternRef.current;
        const audio = audioRef.current;
        for (let r = 0; r < ROW_COUNT; r++) {
          if (p[r]?.[step]) {
            audio?.pluck(r, 0.9);
            pingRef.current.set(`${r}-${step}`, performance.now());
          }
        }
      }
    }
  });

  return (
    <>
      <group ref={bodyRef}>
        {/* main cylinder body */}
        <mesh castShadow receiveShadow>
          <cylinderGeometry args={[RADIUS, RADIUS, HEIGHT, 48]} />
          <meshStandardMaterial
            color="#6b4f3a"
            roughness={0.6}
            metalness={0.25}
          />
        </mesh>
        {/* brass end caps */}
        <mesh position={[0, HEIGHT / 2, 0]}>
          <cylinderGeometry args={[RADIUS + 0.06, RADIUS + 0.06, 0.18, 48]} />
          <meshStandardMaterial color="#c89b53" roughness={0.35} metalness={0.7} />
        </mesh>
        <mesh position={[0, -HEIGHT / 2, 0]}>
          <cylinderGeometry args={[RADIUS + 0.06, RADIUS + 0.06, 0.18, 48]} />
          <meshStandardMaterial color="#c89b53" roughness={0.35} metalness={0.7} />
        </mesh>
        <Studs patternRef={patternRef} version={version} pingRef={pingRef} />
      </group>

      {/* hit grid rotates in lockstep but lives outside the visual body group */}
      <HitGrid rotationRef={rotationRef} onToggle={onToggle} />

      {/* the fixed comb: a row of teeth on the camera-facing side */}
      <group position={[0, 0, RADIUS + 0.55]}>
        {Array.from({ length: ROW_COUNT }).map((_, r) => (
          <mesh key={`tooth-${r}`} position={[0, rowY(r), 0]}>
            <boxGeometry args={[1.4, 0.07, 0.07]} />
            <meshStandardMaterial
              color={ROW_COLORS[r] ?? "#e9d8a6"}
              emissive={ROW_COLORS[r] ?? "#e9d8a6"}
              emissiveIntensity={0.35}
              roughness={0.3}
              metalness={0.6}
            />
          </mesh>
        ))}
        {/* comb base bar */}
        <mesh position={[0.85, 0, 0]}>
          <boxGeometry args={[0.16, HEIGHT * 0.85, 0.16]} />
          <meshStandardMaterial color="#d8b35e" roughness={0.3} metalness={0.7} />
        </mesh>
      </group>
    </>
  );
}

export function MusicBoxCanvas(props: SceneProps) {
  return (
    <Canvas
      camera={{ position: [0, 0.6, 7.4], fov: 42 }}
      dpr={[1, 2]}
      gl={{ antialias: true }}
      onCreated={({ gl }) => {
        gl.setClearColor("#1a120b", 1);
      }}
    >
      <ambientLight intensity={0.55} />
      <directionalLight position={[4, 6, 6]} intensity={1.1} color="#ffe9c7" />
      <directionalLight position={[-5, 2, 3]} intensity={0.5} color="#9bbcff" />
      <pointLight position={[0, 0, 5]} intensity={0.6} color="#ffd9a0" />
      <Box {...props} />
    </Canvas>
  );
}
