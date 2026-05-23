"use client";

import { Canvas, useFrame } from "@react-three/fiber";
import { OrbitControls } from "@react-three/drei";
import { EffectComposer, Bloom } from "@react-three/postprocessing";
import Link from "next/link";
import * as THREE from "three";
import { useRef, useState, useEffect, useCallback, useMemo } from "react";

// ─── types ─────────────────────────────────────────────────────────────────

interface JourneyDef {
  name: string;
  desc: string;
  pos: [number, number, number];
  color: string;
  emissive: string;
}

interface AudioEng {
  ctx: AudioContext;
  gains: GainNode[];
  cleanup: () => void;
}

// ─── journey constants ─────────────────────────────────────────────────────

const JOURNEYS: JourneyDef[] = [
  { name: "Cosmic Homecoming", desc: "The vast return",        pos: [0, 3.2, 0],     color: "#c4b5fd", emissive: "#7c3aed" },
  { name: "Earth Grounding",   desc: "Root and settle",       pos: [0, -3.2, 0],    color: "#86efac", emissive: "#16a34a" },
  { name: "Inner Sanctuary",   desc: "The warm still",        pos: [-2.5, 0.5, -2], color: "#fcd34d", emissive: "#b45309" },
  { name: "Ocean Breath",      desc: "Fluid and open",        pos: [2.8, 0, 2],     color: "#67e8f9", emissive: "#0e7490" },
  { name: "Snowflake",         desc: "Crystalline and pure",  pos: [3, 0.5, -0.5],  color: "#e0f2fe", emissive: "#3b82f6" },
  { name: "Ghost",             desc: "Liminal threshold",     pos: [-3, -0.5, 0.5], color: "#d8b4fe", emissive: "#6d28d9" },
];

// ─── audio engine ──────────────────────────────────────────────────────────

function buildAudioEng(): AudioEng {
  const CtxCtor =
    window.AudioContext ??
    (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
  const ctx = new CtxCtor();

  const master = ctx.createGain();
  master.gain.value = 0.55;
  master.connect(ctx.destination);

  const gains: GainNode[] = [];
  const allOscs: OscillatorNode[] = [];

  function makeOsc(type: OscillatorType, freq: number): OscillatorNode {
    const o = ctx.createOscillator();
    o.type = type;
    o.frequency.value = freq;
    allOscs.push(o);
    return o;
  }

  function makeGain(vol: number): GainNode {
    const g = ctx.createGain();
    g.gain.value = vol;
    return g;
  }

  function addBandGain(): GainNode {
    const g = makeGain(0); // starts silent; camera tracker drives this
    g.connect(master);
    gains.push(g);
    return g;
  }

  // ── 0: Cosmic Homecoming — detuned pad (A4 cluster + A3 anchor) ──────────
  {
    const g = addBandGain();
    [440, 441.2, 220, 221.1].forEach((f, i) => {
      const o = makeOsc("sine", f);
      const v = makeGain(i < 2 ? 0.24 : 0.14);
      o.connect(v); v.connect(g); o.start();
    });
  }

  // ── 1: Earth Grounding — deep bass (B1 sawtooth + lowpass) ───────────────
  {
    const g = addBandGain();
    const o = makeOsc("sawtooth", 61.74);
    const filt = ctx.createBiquadFilter();
    filt.type = "lowpass"; filt.frequency.value = 190;
    const v = makeGain(0.65);
    o.connect(v); v.connect(filt); filt.connect(g); o.start();
  }

  // ── 2: Inner Sanctuary — FM warm tone (A3 carrier mod'd by A3) ───────────
  {
    const g = addBandGain();
    const mod = makeOsc("sine", 220);
    const modAmt = makeGain(95); // mod index ~0.43
    const car = makeOsc("sine", 220);
    const v = makeGain(0.42);
    mod.connect(modAmt); modAmt.connect(car.frequency);
    car.connect(v); v.connect(g);
    mod.start(); car.start();
  }

  // ── 3: Ocean Breath — C major chord (C3 / E3 / G3) ───────────────────────
  {
    const g = addBandGain();
    [130.81, 164.81, 196.0].forEach((f) => {
      const o = makeOsc("sine", f);
      const v = makeGain(0.28);
      o.connect(v); v.connect(g); o.start();
    });
  }

  // ── 4: Snowflake — high crystalline triangle (A6, barely beating) ─────────
  {
    const g = addBandGain();
    [1760, 1763.5].forEach((f) => {
      const o = makeOsc("triangle", f);
      const v = makeGain(0.13);
      o.connect(v); v.connect(g); o.start();
    });
  }

  // ── 5: Ghost — A-minor arpeggio (pre-scheduled, no setTimeout) ───────────
  {
    const g = addBandGain();
    const o = makeOsc("triangle", 220);
    const v = makeGain(0.40);
    o.connect(v); v.connect(g);
    const startT = ctx.currentTime + 0.05;
    o.start(startT);
    // Pre-schedule 140 steps = ~119 seconds of arpeggio. ctx.close() cancels all.
    const arpeggioFreqs = [220, 261.63, 329.63, 261.63]; // A3 C4 E4 C4
    for (let s = 0; s < 140; s++) {
      o.frequency.setValueAtTime(arpeggioFreqs[s % arpeggioFreqs.length], startT + s * 0.85);
    }
  }

  return {
    ctx,
    gains,
    cleanup() {
      allOscs.forEach((o) => {
        try { o.stop(); } catch { /* oscillator already stopped */ }
      });
      void ctx.close();
    },
  };
}

// ─── R3F: single journey orb ───────────────────────────────────────────────

interface OrbProps {
  journey: JourneyDef;
  idx: number;
  focusRef: { current: number[] };
}

function OrbMesh({ journey, idx, focusRef }: OrbProps) {
  const meshRef = useRef<THREE.Mesh>(null);
  const lightRef = useRef<THREE.PointLight>(null);

  useFrame(({ clock }) => {
    const mesh = meshRef.current;
    const light = lightRef.current;
    if (!mesh || !light) return;

    const focus = focusRef.current[idx] ?? 0;
    const t = clock.getElapsedTime();
    const pulse = 0.5 + 0.5 * Math.sin(t * 0.65 + idx * 1.07);

    mesh.scale.setScalar(0.88 + 0.14 * pulse + focus * 0.58);
    const mat = mesh.material as THREE.MeshStandardMaterial;
    mat.emissiveIntensity = 0.12 + 0.22 * pulse + focus * 4.5;
    light.intensity = 0.25 + focus * 3.8;
    light.distance = 3.5 + focus * 2.5;
  });

  return (
    <group position={journey.pos}>
      <mesh ref={meshRef}>
        <sphereGeometry args={[0.42, 32, 32]} />
        <meshStandardMaterial
          color={journey.color}
          emissive={journey.emissive}
          emissiveIntensity={0.12}
          roughness={0.08}
          metalness={0.25}
        />
      </mesh>
      <pointLight ref={lightRef} color={journey.color} intensity={0.25} distance={3.5} />
    </group>
  );
}

// ─── R3F: camera tracker (no mesh, drives audio + label) ──────────────────

interface TrackerProps {
  engineRef: { current: AudioEng | null };
  focusRef: { current: number[] };
  labelRef: { current: HTMLDivElement | null };
  descRef: { current: HTMLParagraphElement | null };
}

function CameraTracker({ engineRef, focusRef, labelRef, descRef }: TrackerProps) {
  // Pre-allocated vectors — reused every frame to avoid GC pressure.
  const dirRef = useRef(new THREE.Vector3());
  const toOrbRef = useRef(new THREE.Vector3());

  useFrame(({ camera }) => {
    const dir = dirRef.current;
    const toOrb = toOrbRef.current;
    camera.getWorldDirection(dir);

    let maxFocus = -1;
    let maxIdx = 0;

    for (let i = 0; i < JOURNEYS.length; i++) {
      const j = JOURNEYS[i];
      toOrb.set(j.pos[0], j.pos[1], j.pos[2]).sub(camera.position).normalize();
      const dot = dir.dot(toOrb);
      const focus = Math.max(0, dot * dot); // cosine-squared falloff
      focusRef.current[i] = focus;

      if (focus > maxFocus) { maxFocus = focus; maxIdx = i; }

      const eng = engineRef.current;
      if (eng) {
        eng.gains[i].gain.setTargetAtTime(
          0.03 + focus * 0.97,
          eng.ctx.currentTime,
          0.18,
        );
      }
    }

    // Update DOM labels directly — no React state, no re-renders.
    if (labelRef.current) {
      labelRef.current.textContent = JOURNEYS[maxIdx].name;
      labelRef.current.style.color = JOURNEYS[maxIdx].color;
    }
    if (descRef.current) {
      descRef.current.textContent = JOURNEYS[maxIdx].desc;
    }
  });

  return null;
}

// ─── R3F: background star field ────────────────────────────────────────────

function StarField() {
  const geo = useMemo(() => {
    const g = new THREE.BufferGeometry();
    const N = 650;
    const pos = new Float32Array(N * 3);
    for (let i = 0; i < N; i++) {
      const r = 14 + Math.random() * 9;
      const theta = Math.random() * Math.PI * 2;
      const phi = Math.acos(2 * Math.random() - 1);
      pos[i * 3]     = r * Math.sin(phi) * Math.cos(theta);
      pos[i * 3 + 1] = r * Math.sin(phi) * Math.sin(theta);
      pos[i * 3 + 2] = r * Math.cos(phi);
    }
    g.setAttribute("position", new THREE.BufferAttribute(pos, 3));
    return g;
  }, []);

  return (
    <points geometry={geo}>
      <pointsMaterial color="#ffffff" size={0.032} sizeAttenuation transparent opacity={0.5} />
    </points>
  );
}

// ─── main page ─────────────────────────────────────────────────────────────

export default function CameraSongPage() {
  const [phase, setPhase] = useState<"idle" | "active">("idle");
  const engineRef = useRef<AudioEng | null>(null);
  const focusRef = useRef<number[]>([0, 0, 0, 0, 0, 0]);
  const labelRef = useRef<HTMLDivElement>(null);
  const descRef = useRef<HTMLParagraphElement>(null);

  const handleStart = useCallback(() => {
    if (engineRef.current) return;
    engineRef.current = buildAudioEng();
    setPhase("active");
  }, []);

  // Dispose audio on unmount.
  useEffect(() => {
    return () => {
      engineRef.current?.cleanup();
      engineRef.current = null;
    };
  }, []);

  return (
    <div className="relative w-full h-screen bg-black overflow-hidden">

      {/* ── splash screen ─────────────────────────────────────────────── */}
      {phase === "idle" && (
        <div className="flex flex-col items-center justify-center h-full gap-8 px-6 text-center">
          <div>
            <h1 className="text-3xl font-mono font-bold text-white/95 mb-3 tracking-tight">
              camera-song
            </h1>
            <p className="text-base text-white/75 max-w-sm mx-auto leading-relaxed">
              Six journeys orbit in the dark. As you turn to face one, its music rises.
              Turn away — it fades.
            </p>
            <p className="text-base text-white/55 italic mt-2 max-w-sm mx-auto">
              You&apos;re not listening to music. You&apos;re walking through it.
            </p>
          </div>

          <button
            onClick={handleStart}
            className="px-8 py-3 rounded-full bg-violet-500/20 border border-violet-400/50 text-violet-300 text-base font-mono hover:bg-violet-500/30 hover:border-violet-400/70 transition-all min-h-[44px]"
          >
            Enter the space
          </button>

          <div className="flex flex-col gap-1.5 items-center">
            {JOURNEYS.map((j) => (
              <span key={j.name} className="text-sm font-mono" style={{ color: j.color }}>
                {j.name}
              </span>
            ))}
          </div>

          <div className="flex flex-col items-center gap-1">
            <span className="text-xs text-white/40">drag to orbit · headphones recommended</span>
            <Link href="/dream" className="text-xs text-white/40 hover:text-white/65 transition-colors">
              ← dream lab
            </Link>
          </div>
        </div>
      )}

      {/* ── active scene ──────────────────────────────────────────────── */}
      {phase === "active" && (
        <>
          <Canvas
            camera={{ position: [0, 0, 8.5], fov: 58, near: 0.1, far: 200 }}
            gl={{ antialias: true }}
            style={{ position: "absolute", inset: 0 }}
          >
            <color attach="background" args={["#000008"]} />
            <ambientLight intensity={0.05} />

            <StarField />

            {JOURNEYS.map((j, i) => (
              <OrbMesh key={j.name} journey={j} idx={i} focusRef={focusRef} />
            ))}

            <CameraTracker
              engineRef={engineRef}
              focusRef={focusRef}
              labelRef={labelRef}
              descRef={descRef}
            />

            <OrbitControls
              enablePan={false}
              enableZoom
              minDistance={2.5}
              maxDistance={13}
            />

            <EffectComposer>
              <Bloom luminanceThreshold={0.08} intensity={2.4} mipmapBlur />
            </EffectComposer>
          </Canvas>

          {/* HUD overlay */}
          <div className="absolute inset-0 pointer-events-none flex flex-col justify-between p-5">
            <div className="flex items-center justify-between">
              <span className="font-mono text-xs text-white/45">camera-song</span>
              <Link
                href="/dream"
                className="text-xs text-white/45 hover:text-white/65 pointer-events-auto transition-colors"
              >
                ← dream
              </Link>
            </div>

            <div className="text-center">
              <div
                ref={labelRef}
                className="text-2xl font-mono font-semibold"
                style={{ color: JOURNEYS[0].color }}
              >
                {JOURNEYS[0].name}
              </div>
              <p
                ref={descRef}
                className="text-sm text-white/55 mt-1"
              >
                {JOURNEYS[0].desc}
              </p>
              <p className="text-xs text-white/35 mt-3 font-mono">
                drag to orbit · the music follows your gaze
              </p>
            </div>
          </div>
        </>
      )}

    </div>
  );
}
