"use client";

import { Canvas, useFrame } from "@react-three/fiber";
import { OrbitControls } from "@react-three/drei";
import { EffectComposer, Bloom } from "@react-three/postprocessing";
import Link from "next/link";
import { useRef, useMemo, useState, useEffect, useCallback } from "react";
import * as THREE from "three";

// ── types ────────────────────────────────────────────────────────────────
interface AudioData {
  bands: number[];
  amplitude: number;
  onset: boolean;
}

interface TentacleCfg {
  angle: number;
  swayDir: number;
  phase: number;
  segLen: number;
  radiusFactor: number;
}

// ── constants ─────────────────────────────────────────────────────────────
const NUM_TENTACLES = 14;
const SEG_COUNT = 4;
const BASE_SPREAD = 0.36;

const BAND_RANGES: [number, number][] = [
  [20, 60], [60, 250], [250, 500], [500, 2000], [2000, 4000], [4000, 20000],
];

// ── audio helpers ─────────────────────────────────────────────────────────
function extractAudio(
  fftBuf: Float32Array,
  binHz: number,
  prevAmp: number,
): AudioData & { prevAmp: number } {
  const bands = BAND_RANGES.map(([lo, hi]) => {
    const lo0 = Math.floor(lo / binHz);
    const hi0 = Math.min(fftBuf.length, Math.ceil(hi / binHz));
    let sum = 0;
    let n = 0;
    for (let b = lo0; b < hi0; b++) { sum += fftBuf[b]; n++; }
    return Math.max(0, Math.min(1, ((n > 0 ? sum / n : -100) + 80) / 70));
  });
  const amplitude = bands.reduce((a, b) => a + b, 0) / 6;
  const onset = amplitude > prevAmp + 0.14 && amplitude > 0.30;
  return { bands, amplitude, onset, prevAmp: amplitude };
}

function buildDemoAudio(analyser: AnalyserNode, ctx: AudioContext): () => void {
  const FREQS = [40, 110, 350, 1100, 3000, 9200];
  const LFO_RATES = [0.07, 0.13, 0.21, 0.09, 0.28, 0.16];
  const nodes: AudioScheduledSourceNode[] = [];
  FREQS.forEach((f, i) => {
    const osc = ctx.createOscillator();
    const lfo = ctx.createOscillator();
    const lfoG = ctx.createGain();
    const gainN = ctx.createGain();
    osc.frequency.value = f;
    osc.type = "sine";
    lfo.frequency.value = LFO_RATES[i];
    lfoG.gain.value = 0.38;
    gainN.gain.value = 0.42;
    lfo.connect(lfoG);
    lfoG.connect(gainN.gain);
    osc.connect(gainN);
    gainN.connect(analyser);
    osc.start();
    lfo.start();
    nodes.push(osc, lfo);
  });
  return () => nodes.forEach(n => { try { n.stop(); } catch { /* stopped */ } });
}

// ── 3-D scene (runs inside R3F Canvas) ────────────────────────────────────
function AnemoneScene({
  dataRef,
}: {
  dataRef: React.MutableRefObject<AudioData | null>;
}) {
  const onsetRef = useRef(0);

  // Deterministic pseudo-random based on index
  const hash = (n: number) => (Math.sin(n * 127.1 + 311.7) * 43758.5453) % 1;
  const abs = (n: number) => Math.abs(hash(n));

  const sceneRef = useRef<{
    cfgs: TentacleCfg[];
    segs: THREE.Group[][];
    disp: (THREE.BufferGeometry | THREE.Material)[];
  } | null>(null);

  const rootGroup = useMemo(() => {
    const root = new THREE.Group();
    const disp: (THREE.BufferGeometry | THREE.Material)[] = [];
    const allSegs: THREE.Group[][] = [];

    const cfgs: TentacleCfg[] = Array.from({ length: NUM_TENTACLES }, (_, i) => ({
      angle: (i / NUM_TENTACLES) * Math.PI * 2,
      swayDir: (i / NUM_TENTACLES) * Math.PI * 2 + 0.45,
      phase: ((i / NUM_TENTACLES) * Math.PI * 2 * 0.618) % (Math.PI * 2),
      segLen: 0.38 + abs(i * 7) * 0.16,
      radiusFactor: 0.82 + abs(i * 13) * 0.26,
    }));

    // Body disc
    const bodyGeo = new THREE.SphereGeometry(0.19, 16, 10);
    bodyGeo.scale(1, 0.55, 1);
    const bodyMat = new THREE.MeshStandardMaterial({
      color: new THREE.Color(0, 0.8, 0.75),
      emissive: new THREE.Color(0, 0.85, 0.8),
      emissiveIntensity: 2.4,
      roughness: 0.3,
    });
    root.add(new THREE.Mesh(bodyGeo, bodyMat));
    disp.push(bodyGeo, bodyMat);

    // Tentacles
    for (let ti = 0; ti < NUM_TENTACLES; ti++) {
      const cfg = cfgs[ti];
      const px = Math.cos(cfg.angle) * BASE_SPREAD * cfg.radiusFactor;
      const pz = Math.sin(cfg.angle) * BASE_SPREAD * cfg.radiusFactor;

      const tentRoot = new THREE.Group();
      tentRoot.position.set(px, 0, pz);
      root.add(tentRoot);

      const segs: THREE.Group[] = [];

      for (let si = 0; si < SEG_COUNT; si++) {
        const segGroup = new THREE.Group();

        const baseR = 0.052 * Math.pow(0.70, si);
        const tipR = baseR * 0.62;
        const geo = new THREE.CylinderGeometry(tipR, baseR, cfg.segLen, 5, 1);

        // Hue: cyan (0.50) → violet (0.30) along tentacle
        const t0 = si / (SEG_COUNT - 1);
        const hue = 0.50 - t0 * 0.20;
        const emissive = new THREE.Color().setHSL(hue, 1.0, 0.48 + t0 * 0.12);
        const mat = new THREE.MeshStandardMaterial({
          color: emissive.clone().multiplyScalar(0.22),
          emissive: emissive,
          emissiveIntensity: 1.7 + si * 0.55,
          roughness: 0.35,
          transparent: true,
          opacity: 0.94 - si * 0.04,
        });
        const cyl = new THREE.Mesh(geo, mat);
        cyl.position.y = cfg.segLen * 0.5;
        segGroup.add(cyl);
        disp.push(geo, mat);

        // Glowing tip bead on last segment
        if (si === SEG_COUNT - 1) {
          const tipGeo = new THREE.SphereGeometry(baseR * 2.4, 7, 5);
          const tipMat = new THREE.MeshStandardMaterial({
            color: new THREE.Color(0.45, 0.15, 1),
            emissive: new THREE.Color(0.60, 0.20, 1.0),
            emissiveIntensity: 5.0,
            roughness: 0.15,
          });
          const tipMesh = new THREE.Mesh(tipGeo, tipMat);
          tipMesh.position.y = cfg.segLen;
          segGroup.add(tipMesh);
          disp.push(tipGeo, tipMat);
        }

        // FK chain: seg 0 attaches to tentRoot, others to previous seg
        if (si === 0) {
          tentRoot.add(segGroup);
        } else {
          segs[si - 1].add(segGroup);
          segGroup.position.y = cfg.segLen;
        }
        segs.push(segGroup);
      }

      allSegs.push(segs);
    }

    sceneRef.current = { cfgs, segs: allSegs, disp };
    return root;
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    return () => {
      sceneRef.current?.disp.forEach(d => d.dispose());
    };
  }, []);

  useFrame(({ clock }) => {
    const scene = sceneRef.current;
    if (!scene) return;

    const t = clock.elapsedTime;
    const audio = dataRef.current;
    const sb = audio?.bands[0] ?? 0.04;
    const ba = audio?.bands[1] ?? 0.04;
    const lm = audio?.bands[2] ?? 0.03;
    const hm = audio?.bands[4] ?? 0.03;
    const hi = audio?.bands[5] ?? 0.03;

    if (audio?.onset) onsetRef.current = 1.0;
    onsetRef.current *= 0.89;
    const flash = onsetRef.current;

    for (let ti = 0; ti < NUM_TENTACLES; ti++) {
      const cfg = scene.cfgs[ti];
      const segs = scene.segs[ti];
      if (!segs) continue;

      for (let si = 0; si < SEG_COUNT; si++) {
        const seg = segs[si];
        if (!seg) continue;

        const segPhase = cfg.phase + si * 0.88;
        const swayFreq = 0.28 + si * 0.11 + sb * 0.38;
        // Sway amplitude grows toward the tip (FK amplification)
        const baseAmp = 0.055 + sb * 0.20 + ba * 0.08 + flash * 0.20;
        const swayAmp = baseAmp * (1 + si * 0.60);

        const swayAngle =
          Math.sin(t * swayFreq + segPhase) * swayAmp +
          lm * 0.05 * Math.sin(t * 2.3 + segPhase * 0.8);

        seg.rotation.x = Math.sin(cfg.swayDir) * swayAngle;
        seg.rotation.z = Math.cos(cfg.swayDir) * swayAngle;

        // Tip bead flicker (high-frequency on last segment)
        if (si === SEG_COUNT - 1) {
          const flicker =
            1.0 +
            hm * 0.30 * Math.sin(t * 10.5 + cfg.phase * 2.1) +
            hi * 0.14 +
            flash * 0.42;
          seg.scale.setScalar(flicker);
        }
      }
    }
  });

  return <primitive object={rootGroup} />;
}

// ── Page ──────────────────────────────────────────────────────────────────
export default function AnemoneAV() {
  const [mode, setMode] = useState<"idle" | "demo" | "mic">("idle");
  const [error, setError] = useState<string | null>(null);
  const [descVisible, setDescVisible] = useState(false);
  const dataRef = useRef<AudioData | null>(null);
  const cleanupRef = useRef<(() => void) | null>(null);
  const prevAmpRef = useRef(0);

  const stopAll = useCallback(() => {
    cleanupRef.current?.();
    cleanupRef.current = null;
    dataRef.current = null;
    prevAmpRef.current = 0;
    setMode("idle");
  }, []);

  const startDemo = useCallback(() => {
    const ACtx =
      window.AudioContext ||
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (window as any).webkitAudioContext as typeof AudioContext | undefined;
    if (!ACtx) { setError("Web Audio not supported."); return; }
    const ctx = new ACtx();
    const analyser = ctx.createAnalyser();
    analyser.fftSize = 2048;
    analyser.smoothingTimeConstant = 0.62;
    const fft = new Float32Array(new ArrayBuffer(analyser.frequencyBinCount * 4));
    const binHz = ctx.sampleRate / analyser.fftSize;
    const stopOsc = buildDemoAudio(analyser, ctx);

    let rafId = 0;
    const tick = () => {
      analyser.getFloatFrequencyData(fft as unknown as Float32Array<ArrayBuffer>);
      const result = extractAudio(fft, binHz, prevAmpRef.current);
      prevAmpRef.current = result.prevAmp;
      dataRef.current = { bands: result.bands, amplitude: result.amplitude, onset: result.onset };
      rafId = requestAnimationFrame(tick);
    };
    rafId = requestAnimationFrame(tick);
    cleanupRef.current = () => {
      cancelAnimationFrame(rafId);
      stopOsc();
      void ctx.close();
    };
    setMode("demo");
    setError(null);
  }, []);

  const startMic = useCallback(async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: { echoCancellation: false, noiseSuppression: false, autoGainControl: false },
      });
      const ACtx =
        window.AudioContext ||
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        (window as any).webkitAudioContext as typeof AudioContext | undefined;
      if (!ACtx) { setError("Web Audio not supported."); return; }
      const ctx = new ACtx();
      const source = ctx.createMediaStreamSource(stream);
      const analyser = ctx.createAnalyser();
      analyser.fftSize = 2048;
      analyser.smoothingTimeConstant = 0.62;
      source.connect(analyser);
      const fft = new Float32Array(new ArrayBuffer(analyser.frequencyBinCount * 4));
      const binHz = ctx.sampleRate / analyser.fftSize;

      let rafId = 0;
      const tick = () => {
        analyser.getFloatFrequencyData(fft as unknown as Float32Array<ArrayBuffer>);
        const result = extractAudio(fft, binHz, prevAmpRef.current);
        prevAmpRef.current = result.prevAmp;
        dataRef.current = { bands: result.bands, amplitude: result.amplitude, onset: result.onset };
        rafId = requestAnimationFrame(tick);
      };
      rafId = requestAnimationFrame(tick);
      cleanupRef.current = () => {
        cancelAnimationFrame(rafId);
        stream.getTracks().forEach(track => track.stop());
        void ctx.close();
      };
      setMode("mic");
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Microphone unavailable. Check permissions.");
    }
  }, []);

  // Show descriptor briefly on mode start
  useEffect(() => {
    if (mode !== "idle") {
      setDescVisible(true);
      const timer = setTimeout(() => setDescVisible(false), 3200);
      return () => clearTimeout(timer);
    }
  }, [mode]);

  useEffect(() => () => { cleanupRef.current?.(); }, []);

  return (
    <div
      style={{
        width: "100%",
        height: "calc(100vh - 3rem)",
        position: "relative",
        background: "#000",
        overflow: "hidden",
      }}
    >
      {/* R3F Canvas — always mounted so the scene is ready */}
      <Canvas
        camera={{ position: [0, 1.1, 3.6], fov: 52, near: 0.1, far: 100 }}
        style={{ position: "absolute", inset: 0 }}
        gl={{ antialias: true, alpha: false }}
      >
        <color attach="background" args={["#000000"]} />
        <AnemoneScene dataRef={dataRef} />
        <OrbitControls enablePan={false} minDistance={1.8} maxDistance={11} />
        <EffectComposer>
          <Bloom
            intensity={2.4}
            luminanceThreshold={0.04}
            luminanceSmoothing={0.92}
            mipmapBlur
          />
        </EffectComposer>
      </Canvas>

      {/* Idle splash */}
      {mode === "idle" && (
        <div
          style={{
            position: "absolute",
            inset: 0,
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            justifyContent: "center",
            textAlign: "center",
            padding: "1.5rem",
            pointerEvents: "none",
          }}
        >
          <h1
            style={{
              fontSize: "1.4rem",
              letterSpacing: "0.2em",
              fontWeight: 300,
              marginBottom: "0.5rem",
              textTransform: "uppercase",
            }}
          >
            Anemone AV
          </h1>
          <p
            style={{
              fontSize: "0.78rem",
              color: "rgba(255,255,255,0.45)",
              maxWidth: "28rem",
              lineHeight: 1.65,
              marginBottom: "1.8rem",
            }}
          >
            A bioluminescent sea anemone dancing to audio. Sub-bass sways the
            whole trunk. Low-mids ripple the branches. Treble pulses the glowing
            tips. Percussive hits cause a full-body flash. Drag to orbit.
          </p>
          <div style={{ display: "flex", gap: "1rem", pointerEvents: "auto" }}>
            <button onClick={startDemo} style={btnStyle}>
              Demo mode
            </button>
            <button onClick={() => { void startMic(); }} style={btnStyle}>
              Start mic
            </button>
          </div>
          {error && (
            <p
              style={{
                marginTop: "1rem",
                fontSize: "0.7rem",
                color: "rgb(248,113,113)",
                maxWidth: "22rem",
              }}
            >
              {error}
            </p>
          )}
          <Link
            href="/dream"
            style={{
              marginTop: "3rem",
              fontSize: "0.68rem",
              color: "rgba(255,255,255,0.28)",
              textDecoration: "none",
              letterSpacing: "0.08em",
            }}
          >
            ← dream sandbox
          </Link>
        </div>
      )}

      {/* Brief descriptor on start */}
      {mode !== "idle" && descVisible && (
        <div
          style={{
            position: "absolute",
            top: "50%",
            left: "50%",
            transform: "translate(-50%, -50%)",
            textAlign: "center",
            pointerEvents: "none",
          }}
        >
          <p
            style={{
              fontSize: "0.75rem",
              color: "rgba(0,240,220,0.65)",
              letterSpacing: "0.15em",
              textTransform: "uppercase",
            }}
          >
            {mode === "demo"
              ? "demo — 6 LFO oscillators driving the form"
              : "mic active — play something loud"}
          </p>
        </div>
      )}

      {/* Running HUD */}
      {mode !== "idle" && (
        <div
          style={{
            position: "absolute",
            bottom: "1rem",
            right: "1rem",
            display: "flex",
            flexDirection: "column",
            alignItems: "flex-end",
            gap: "0.5rem",
          }}
        >
          <span
            style={{
              fontSize: "0.62rem",
              color: "rgba(255,255,255,0.30)",
              letterSpacing: "0.15em",
              textTransform: "uppercase",
            }}
          >
            {mode === "demo" ? "Demo" : "Mic"} · drag to orbit · scroll to zoom
          </span>
          <div style={{ display: "flex", gap: "0.6rem" }}>
            <button onClick={stopAll} style={smallBtnStyle}>
              stop
            </button>
            <Link
              href="/dream"
              style={{ ...smallBtnStyle, textDecoration: "none" }}
            >
              ← back
            </Link>
          </div>
        </div>
      )}

      {/* Design notes link */}
      <div style={{ position: "absolute", top: "0.75rem", right: "1rem" }}>
        <Link
          href="https://github.com/kbarnoski/resonance/blob/dream/sandbox/src/app/dream/49-anemone-av/README.md"
          target="_blank"
          rel="noreferrer"
          style={{
            fontSize: "0.62rem",
            color: "rgba(255,255,255,0.22)",
            letterSpacing: "0.1em",
            textDecoration: "none",
          }}
        >
          design notes →
        </Link>
      </div>
    </div>
  );
}

const btnStyle: React.CSSProperties = {
  padding: "0.6rem 1.4rem",
  fontSize: "0.72rem",
  letterSpacing: "0.15em",
  textTransform: "uppercase",
  border: "1px solid rgba(255,255,255,0.28)",
  background: "transparent",
  color: "white",
  cursor: "pointer",
  borderRadius: "3px",
  fontFamily: "inherit",
};

const smallBtnStyle: React.CSSProperties = {
  padding: "0.35rem 0.8rem",
  fontSize: "0.62rem",
  letterSpacing: "0.12em",
  textTransform: "uppercase",
  border: "1px solid rgba(255,255,255,0.18)",
  background: "transparent",
  color: "rgba(255,255,255,0.5)",
  cursor: "pointer",
  borderRadius: "3px",
  fontFamily: "inherit",
  display: "inline-block",
};
