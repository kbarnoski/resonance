"use client";

import { Canvas, useFrame, useThree } from "@react-three/fiber";
import { EffectComposer, Bloom } from "@react-three/postprocessing";
import Link from "next/link";
import { MutableRefObject, useCallback, useEffect, useMemo, useRef, useState } from "react";
import * as THREE from "three";

// ─── journey themes ────────────────────────────────────────────────────────────

interface Journey {
  name: string;
  desc: string;
  rgb:  readonly [number, number, number];
  cam:  readonly [number, number, number];
}

const JOURNEYS: readonly Journey[] = [
  { name: "Cosmic Homecoming", desc: "Rise through the star field",   rgb: [0.65, 0.35, 1.00], cam: [0,   14,  3] },
  { name: "Earth Grounding",   desc: "Settle into the roots",         rgb: [0.20, 0.82, 0.42], cam: [0,   -9, 12] },
  { name: "Ocean Breath",      desc: "Flow into the deep",            rgb: [0.10, 0.75, 0.95], cam: [-13,  3,  7] },
  { name: "Snowflake",         desc: "Crystalline silence",           rgb: [0.72, 0.88, 1.00], cam: [11,   7, -7] },
  { name: "Inner Sanctuary",   desc: "The warm still center",         rgb: [0.98, 0.78, 0.22], cam: [5,    1, 13] },
  { name: "Ghost",             desc: "Liminal threshold",             rgb: [0.75, 0.52, 1.00], cam: [-9,  -4, -9] },
] as const;

const N_SPECIES = 6;
const N_PER     = 1000;
const N         = N_SPECIES * N_PER; // 6 000 particles
const COOLDOWN  = 380;               // ms between camera cuts

// ─── particle initialization ───────────────────────────────────────────────────

interface ParticleData {
  pos: Float32Array;
  vel: Float32Array;
  col: Float32Array;
  ctr: Float32Array; // species attractor centers [x,y,z] × 6
}

function buildParticleData(): ParticleData {
  const pos = new Float32Array(N * 3);
  const vel = new Float32Array(N * 3);
  const col = new Float32Array(N * 3);
  const ctr = new Float32Array(N_SPECIES * 3);

  for (let s = 0; s < N_SPECIES; s++) {
    const θ = (s / N_SPECIES) * Math.PI * 2;
    const r = 5.5;
    ctr[s * 3]     =  Math.cos(θ) * r;
    ctr[s * 3 + 1] =  Math.sin(θ) * r * 0.55;
    ctr[s * 3 + 2] =  Math.sin(θ * 2) * r * 0.55;

    const [cr, cg, cb] = JOURNEYS[s].rgb;
    for (let j = 0; j < N_PER; j++) {
      const i = (s * N_PER + j) * 3;
      pos[i]     = ctr[s * 3]     + (Math.random() - 0.5) * 3;
      pos[i + 1] = ctr[s * 3 + 1] + (Math.random() - 0.5) * 3;
      pos[i + 2] = ctr[s * 3 + 2] + (Math.random() - 0.5) * 3;
      vel[i]     = (Math.random() - 0.5) * 0.02;
      vel[i + 1] = (Math.random() - 0.5) * 0.02;
      vel[i + 2] = (Math.random() - 0.5) * 0.02;
      col[i]     = cr;
      col[i + 1] = cg;
      col[i + 2] = cb;
    }
  }
  return { pos, vel, col, ctr };
}

// ─── scene component ───────────────────────────────────────────────────────────

interface SceneProps {
  analRef: MutableRefObject<AnalyserNode | null>;
  isMic:   MutableRefObject<boolean>;
  onSnap:  (idx: number) => void;
}

function BeatScene({ analRef, isMic, onSnap }: SceneProps) {
  const { camera } = useThree();

  const data = useRef<ParticleData | null>(null);
  if (!data.current) data.current = buildParticleData();
  const { pos, vel, col, ctr } = data.current;

  const geom = useMemo(() => {
    const g = new THREE.BufferGeometry();
    g.setAttribute("position", new THREE.BufferAttribute(pos, 3));
    g.setAttribute("color",    new THREE.BufferAttribute(col, 3));
    return g;
  }, [pos, col]);

  const camIdxRef      = useRef(0);
  const lastCutRef     = useRef(0);
  const prevBufRef     = useRef<Uint8Array | null>(null);
  const demoNextCutRef = useRef(performance.now() + 900);

  useEffect(() => {
    const [cx, cy, cz] = JOURNEYS[0].cam;
    camera.position.set(cx, cy, cz);
    camera.lookAt(0, 0, 0);
  }, [camera]);

  useFrame((_, delta) => {
    const dt  = Math.min(delta, 0.05);
    const t   = performance.now() / 1000;
    const now = performance.now();

    // ── onset detection ────────────────────────────────────────────────────
    let shouldCut = false;
    const anal = analRef.current;

    if (isMic.current && anal) {
      const fbc = anal.frequencyBinCount;
      if (!prevBufRef.current) prevBufRef.current = new Uint8Array(fbc);
      const buf = new Uint8Array(fbc);
      anal.getByteFrequencyData(buf);
      let flux = 0;
      for (let b = 0; b < fbc; b++) {
        const d = buf[b] - prevBufRef.current[b];
        if (d > 0) flux += d;
      }
      prevBufRef.current.set(buf);
      if (flux > 7500) shouldCut = true;
    } else if (!isMic.current && now >= demoNextCutRef.current) {
      shouldCut = true;
      demoNextCutRef.current = now + 700 + Math.random() * 800;
    }

    if (shouldCut && now - lastCutRef.current > COOLDOWN) {
      lastCutRef.current = now;
      camIdxRef.current  = (camIdxRef.current + 1) % N_SPECIES;
      const [cx, cy, cz] = JOURNEYS[camIdxRef.current].cam;
      camera.position.set(cx, cy, cz);
      camera.lookAt(0, 0, 0);
      onSnap(camIdxRef.current);
    }

    // ── species attractor drift (Lissajous per species) ────────────────────
    const ω = 0.22;
    for (let s = 0; s < N_SPECIES; s++) {
      const φ = (s / N_SPECIES) * Math.PI * 2;
      const r = 5.5;
      ctr[s * 3]     = Math.sin(t * ω * 0.73 + φ) * r;
      ctr[s * 3 + 1] = Math.sin(t * ω * 1.09 + φ * 1.31) * r * 0.70;
      ctr[s * 3 + 2] = Math.cos(t * ω * 0.87 + φ * 0.69) * r;
    }

    // ── particle physics (O(N) spring-attractor model) ─────────────────────
    const spring = 1.6 * dt;
    const damp   = 1 - 3.2 * dt;
    const turb   = 0.06;

    for (let i = 0; i < N; i++) {
      const p = i * 3;
      const s = Math.floor(i / N_PER);
      const c = s * 3;

      vel[p]     += (ctr[c]     - pos[p])     * spring + (Math.random() - 0.5) * turb * dt;
      vel[p + 1] += (ctr[c + 1] - pos[p + 1]) * spring + (Math.random() - 0.5) * turb * dt;
      vel[p + 2] += (ctr[c + 2] - pos[p + 2]) * spring + (Math.random() - 0.5) * turb * dt;
      vel[p]     *= damp;
      vel[p + 1] *= damp;
      vel[p + 2] *= damp;
      pos[p]     += vel[p];
      pos[p + 1] += vel[p + 1];
      pos[p + 2] += vel[p + 2];
    }

    (geom.attributes.position as THREE.BufferAttribute).needsUpdate = true;
  });

  return (
    <points geometry={geom}>
      <pointsMaterial
        size={0.11}
        vertexColors
        sizeAttenuation
        transparent
        opacity={0.88}
        blending={THREE.AdditiveBlending}
        depthWrite={false}
      />
    </points>
  );
}

// ─── audio setup ───────────────────────────────────────────────────────────────

function buildDemoAudio(): { anal: AnalyserNode; cleanup: () => void } {
  const CtxCtor =
    window.AudioContext ??
    (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
  const ctx  = new CtxCtor();
  const anal = ctx.createAnalyser();
  anal.fftSize = 2048;
  anal.smoothingTimeConstant = 0.5;

  const freqs  = [220, 277.18, 329.63, 440, 554.37, 659.25];
  const master = ctx.createGain();
  master.gain.value = 0.45;
  master.connect(ctx.destination);

  const oscs: OscillatorNode[] = [];
  freqs.forEach(f => {
    const o = ctx.createOscillator();
    const g = ctx.createGain();
    o.type            = "sine";
    o.frequency.value = f;
    g.gain.value      = 0.07;
    o.connect(g);
    g.connect(anal);
    g.connect(master);
    o.start();
    oscs.push(o);
  });

  return {
    anal,
    cleanup: () => {
      oscs.forEach(o => { try { o.stop(); } catch (_) {} });
      void ctx.close();
    },
  };
}

async function buildMicAudio(): Promise<{ anal: AnalyserNode; cleanup: () => void }> {
  const CtxCtor =
    window.AudioContext ??
    (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
  const ctx    = new CtxCtor();
  const anal   = ctx.createAnalyser();
  anal.fftSize = 2048;
  anal.smoothingTimeConstant = 0.3;
  const gain = ctx.createGain();
  gain.gain.value = 2.5;

  const stream = await navigator.mediaDevices.getUserMedia({
    audio: { echoCancellation: false, noiseSuppression: false, autoGainControl: false },
  });
  const src = ctx.createMediaStreamSource(stream);
  src.connect(gain);
  gain.connect(anal);

  return {
    anal,
    cleanup: () => {
      stream.getTracks().forEach(t => t.stop());
      void ctx.close();
    },
  };
}

// ─── main component ────────────────────────────────────────────────────────────

type AppMode = "idle" | "demo" | "mic";

export default function BeatCutPage() {
  const [mode,   setMode]   = useState<AppMode>("idle");
  const [err,    setErr]    = useState<string | null>(null);
  const [curIdx, setCurIdx] = useState(0);
  const [flash,  setFlash]  = useState(false);

  const analRef  = useRef<AnalyserNode | null>(null);
  const isMicRef = useRef(false);
  const cleanRef = useRef<(() => void) | null>(null);

  const handleSnap = useCallback((idx: number) => {
    setCurIdx(idx);
    setFlash(true);
    setTimeout(() => setFlash(false), 110);
  }, []);

  const startDemo = useCallback(() => {
    cleanRef.current?.();
    const { anal, cleanup } = buildDemoAudio();
    analRef.current  = anal;
    isMicRef.current = false;
    cleanRef.current = cleanup;
    setMode("demo");
    setErr(null);
  }, []);

  const startMic = useCallback(async () => {
    setErr(null);
    try {
      cleanRef.current?.();
      const { anal, cleanup } = await buildMicAudio();
      analRef.current  = anal;
      isMicRef.current = true;
      cleanRef.current = cleanup;
      setMode("mic");
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Microphone unavailable — check browser permissions.");
    }
  }, []);

  const stop = useCallback(() => {
    cleanRef.current?.();
    cleanRef.current = null;
    analRef.current  = null;
    isMicRef.current = false;
    setMode("idle");
    setCurIdx(0);
  }, []);

  useEffect(() => () => { cleanRef.current?.(); }, []);

  // ─── idle / start screen ──────────────────────────────────────────────────

  if (mode === "idle") {
    return (
      <div style={{
        minHeight: "100vh", background: "#030308", display: "flex",
        flexDirection: "column", alignItems: "center", justifyContent: "center",
        padding: "24px 20px", fontFamily: "monospace", boxSizing: "border-box",
      }}>
        <div style={{ textAlign: "center", marginBottom: 32 }}>
          <h1 style={{ margin: 0, fontSize: 32, fontWeight: "bold", color: "#c4b5fd", letterSpacing: 3 }}>
            BEAT CUT
          </h1>
          <p style={{ margin: "12px 0 0", fontSize: 16, color: "rgba(255,255,255,0.75)", maxWidth: 400, lineHeight: 1.65 }}>
            Six journey themes. Six cameras. Every onset cuts to a new viewpoint —
            6,000 particles orbit through all of Karel&rsquo;s published worlds.
          </p>
        </div>

        <div style={{ display: "flex", gap: 14, flexWrap: "wrap", justifyContent: "center", marginBottom: 28 }}>
          <button
            onClick={startDemo}
            style={{
              background: "#4c1d95", color: "white", border: "none",
              padding: "14px 32px", fontSize: 16, fontFamily: "monospace",
              borderRadius: 8, cursor: "pointer", minHeight: 52, minWidth: 140,
            }}
          >
            ▶ Demo
          </button>
          <button
            onClick={() => { void startMic(); }}
            style={{
              background: "transparent", color: "#c4b5fd", border: "1px solid #4c1d95",
              padding: "14px 32px", fontSize: 16, fontFamily: "monospace",
              borderRadius: 8, cursor: "pointer", minHeight: 52, minWidth: 140,
            }}
          >
            🎤 Mic input
          </button>
        </div>

        {err && (
          <p style={{ color: "#fca5a5", fontSize: 14, marginBottom: 16, textAlign: "center", maxWidth: 380 }}>
            {err}
          </p>
        )}

        <div style={{ display: "flex", flexWrap: "wrap", gap: 10, justifyContent: "center", maxWidth: 480 }}>
          {JOURNEYS.map((j, idx) => (
            <div key={idx} style={{ display: "flex", alignItems: "center", gap: 7 }}>
              <div style={{
                width: 9, height: 9, borderRadius: "50%",
                background: `rgb(${j.rgb.map(v => Math.round(v * 255)).join(",")})`,
                boxShadow: `0 0 6px rgb(${j.rgb.map(v => Math.round(v * 255)).join(",")})`,
              }} />
              <span style={{ color: "rgba(255,255,255,0.55)", fontSize: 13 }}>{j.name}</span>
            </div>
          ))}
        </div>

        <p style={{ color: "rgba(255,255,255,0.30)", fontSize: 13, marginTop: 24, textAlign: "center" }}>
          Inspired by TouchDesigner camSequencer — ported to WebGL
        </p>
        <Link href="/dream" style={{ color: "rgba(255,255,255,0.25)", fontSize: 12, marginTop: 24, textDecoration: "none" }}>
          ← dream lab
        </Link>
      </div>
    );
  }

  // ─── active view ──────────────────────────────────────────────────────────

  const journey = JOURNEYS[curIdx];
  const dotColor = `rgb(${journey.rgb.map(v => Math.round(v * 255)).join(",")})`;

  return (
    <div style={{ position: "fixed", inset: 0, background: "#030308" }}>
      {/* Cut flash */}
      {flash && (
        <div style={{
          position: "absolute", inset: 0, background: "rgba(255,255,255,0.07)",
          zIndex: 10, pointerEvents: "none",
        }} />
      )}

      {/* Journey name */}
      <div style={{
        position: "absolute", bottom: 52, left: 0, right: 0,
        textAlign: "center", zIndex: 5, pointerEvents: "none",
      }}>
        <div style={{ fontSize: 22, fontWeight: "bold", color: dotColor, fontFamily: "monospace", letterSpacing: 2 }}>
          {journey.name}
        </div>
        <div style={{ fontSize: 14, color: "rgba(255,255,255,0.60)", fontFamily: "monospace", marginTop: 4 }}>
          {journey.desc}
        </div>
      </div>

      {/* Top-left: mode + stop */}
      <div style={{ position: "absolute", top: 16, left: 20, zIndex: 5, display: "flex", gap: 12, alignItems: "center" }}>
        <span style={{ fontFamily: "monospace", fontSize: 11, color: "rgba(255,255,255,0.30)", letterSpacing: 2 }}>
          {mode === "mic" ? "🎤 MIC" : "▶ DEMO"}
        </span>
        <button
          onClick={stop}
          style={{
            background: "transparent", border: "1px solid rgba(255,255,255,0.12)",
            color: "rgba(255,255,255,0.45)", padding: "4px 14px",
            fontFamily: "monospace", fontSize: 11, borderRadius: 4, cursor: "pointer",
          }}
        >
          STOP
        </button>
      </div>

      {/* Top-right: journey dots */}
      <div style={{ position: "absolute", top: 18, right: 20, zIndex: 5, display: "flex", gap: 8, alignItems: "center" }}>
        {JOURNEYS.map((j, idx) => (
          <div
            key={idx}
            style={{
              width: idx === curIdx ? 10 : 6,
              height: idx === curIdx ? 10 : 6,
              borderRadius: "50%",
              background: idx === curIdx
                ? `rgb(${j.rgb.map(v => Math.round(v * 255)).join(",")})`
                : "rgba(255,255,255,0.15)",
              boxShadow: idx === curIdx
                ? `0 0 8px rgb(${j.rgb.map(v => Math.round(v * 255)).join(",")})`
                : "none",
              transition: "all 0.12s",
            }}
          />
        ))}
      </div>

      {/* Back link */}
      <Link
        href="/dream"
        style={{
          position: "absolute", bottom: 18, right: 20, zIndex: 5,
          color: "rgba(255,255,255,0.22)", fontFamily: "monospace",
          fontSize: 11, textDecoration: "none",
        }}
      >
        ← dream
      </Link>

      <Canvas
        camera={{ position: [0, 14, 3], fov: 55 }}
        gl={{ antialias: false }}
        style={{ position: "absolute", inset: 0 }}
      >
        <BeatScene analRef={analRef} isMic={isMicRef} onSnap={handleSnap} />
        <EffectComposer>
          <Bloom luminanceThreshold={0.05} luminanceSmoothing={0.85} intensity={1.6} />
        </EffectComposer>
      </Canvas>
    </div>
  );
}
