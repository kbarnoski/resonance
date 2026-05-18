"use client";

import { Canvas, useFrame } from "@react-three/fiber";
import { OrbitControls } from "@react-three/drei";
import { EffectComposer, Bloom } from "@react-three/postprocessing";
import Link from "next/link";
import { useRef, useState, useEffect, useMemo, useCallback } from "react";
import * as THREE from "three";

// ─── GLSL shaders ─────────────────────────────────────────────────────
const VERT = /* glsl */ `
  uniform float u_bands[6];
  uniform float u_amplitude;
  uniform float u_time;

  varying float vDisplace;
  varying vec3 vViewNormal;

  float hashNoise(vec3 p) {
    p = fract(p * 0.3183099 + 0.1);
    p *= 17.0;
    return fract(p.x * p.y * p.z * (p.x + p.y + p.z));
  }

  float valueNoise(vec3 x) {
    vec3 i = floor(x);
    vec3 f = fract(x);
    f = f * f * (3.0 - 2.0 * f);
    return mix(
      mix(mix(hashNoise(i),                 hashNoise(i + vec3(1,0,0)), f.x),
          mix(hashNoise(i + vec3(0,1,0)),   hashNoise(i + vec3(1,1,0)), f.x), f.y),
      mix(mix(hashNoise(i + vec3(0,0,1)),   hashNoise(i + vec3(1,0,1)), f.x),
          mix(hashNoise(i + vec3(0,1,1)),   hashNoise(i + vec3(1,1,1)), f.x), f.y),
      f.z
    );
  }

  void main() {
    vec3 n = normalize(normal);
    float absY = abs(n.y);

    // Spatial band weights: bass pushes equator, treble pushes poles
    float equatorial = max(0.0, 1.0 - absY * 3.5);
    float polar      = max(0.0, absY * 2.0 - 0.5);
    float global     = 0.55;

    float d =
      u_bands[0] * 0.45 * equatorial +
      u_bands[1] * 0.38 * equatorial +
      u_bands[2] * 0.22 * global +
      u_bands[3] * 0.18 * global +
      u_bands[4] * 0.33 * polar +
      u_bands[5] * 0.38 * polar;

    // Organic time-varying noise — slower on idle, faster with loud input
    float rawNoise = valueNoise(n * 2.8 + vec3(0.0, u_time * 0.22, u_time * 0.14)) * 2.0 - 1.0;
    d += rawNoise * (0.04 + u_amplitude * 0.10);

    vDisplace    = clamp(d, 0.0, 1.2);
    vViewNormal  = normalize(normalMatrix * normal);

    vec3 newPos = position + n * d;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(newPos, 1.0);
  }
`;

const FRAG = /* glsl */ `
  uniform float u_centroidNorm;
  uniform float u_amplitude;

  varying float vDisplace;
  varying vec3 vViewNormal;

  vec3 hsl2rgb(float h, float s, float l) {
    float c  = (1.0 - abs(2.0 * l - 1.0)) * s;
    float hp = mod(h * 6.0, 6.0);
    float x  = c * (1.0 - abs(mod(hp, 2.0) - 1.0));
    vec3 rgb;
    if      (hp < 1.0) rgb = vec3(c, x, 0.0);
    else if (hp < 2.0) rgb = vec3(x, c, 0.0);
    else if (hp < 3.0) rgb = vec3(0.0, c, x);
    else if (hp < 4.0) rgb = vec3(0.0, x, c);
    else if (hp < 5.0) rgb = vec3(x, 0.0, c);
    else               rgb = vec3(c, 0.0, x);
    return rgb + (l - c * 0.5);
  }

  void main() {
    // Hue: indigo (dark/bassy = 0.72) → cyan (mid = 0.52) → orange (treble = 0.08)
    float hue = 0.72 - u_centroidNorm * 0.64;

    // Brightness: base glow proportional to displacement
    float glow   = clamp(vDisplace * 1.6, 0.0, 0.72);
    float luma   = 0.06 + glow;
    float sat    = 0.88 + vDisplace * 0.25;

    vec3 col = hsl2rgb(hue, sat, luma);

    // Edge glow: surfaces facing away from camera rim-light with secondary hue
    float edgeFactor = 1.0 - abs(vViewNormal.z);
    float rimHue     = hue + 0.12;
    vec3  rim        = hsl2rgb(rimHue, 1.0, 0.45) * pow(edgeFactor, 2.5) * 0.6;
    col += rim;

    // Subtle filmic tonemap
    col = col / (col + 0.28);
    col = pow(col, vec3(0.88));

    gl_FragColor = vec4(col, 1.0);
  }
`;

// ─── Audio helpers ─────────────────────────────────────────────────────
interface AudioData {
  bands: number[];
  amplitude: number;
  centroid: number;
}

const BAND_RANGES: [number, number][] = [
  [20, 60], [60, 250], [250, 500], [500, 2000], [2000, 4000], [4000, 20000],
];

function computeAudioData(buf: Float32Array, binHz: number): AudioData {
  const bands = BAND_RANGES.map(([lo, hi]) => {
    const loBin = Math.floor(lo / binHz);
    const hiBin = Math.min(buf.length, Math.ceil(hi / binHz));
    let sum = 0;
    let count = 0;
    for (let b = loBin; b < hiBin; b++) { sum += buf[b]; count++; }
    const avgDb = count > 0 ? sum / count : -100;
    return Math.max(0, Math.min(1, (avgDb + 80) / 70));
  });
  const amplitude = bands.reduce((a, b) => a + b, 0) / 6;
  let wSum = 0;
  let wTot = 0;
  for (let b = 0; b < buf.length; b++) {
    const lin = Math.pow(10, buf[b] / 20);
    wSum += b * binHz * lin;
    wTot += lin;
  }
  const centroid = wTot > 0 ? wSum / wTot : 1000;
  return { bands, amplitude, centroid };
}

function buildDemoOscillators(analyser: AnalyserNode, ctx: AudioContext): () => void {
  const FREQS = [55, 140, 380, 1100, 3000, 9500];
  const LFO_RATES = [0.09, 0.13, 0.19, 0.07, 0.24, 0.15];
  const toStop: AudioScheduledSourceNode[] = [];

  for (let i = 0; i < 6; i++) {
    const osc = ctx.createOscillator();
    const lfo = ctx.createOscillator();
    const lfoGain = ctx.createGain();
    const gain = ctx.createGain();

    osc.frequency.value = FREQS[i];
    osc.type = "sine";
    lfo.frequency.value = LFO_RATES[i];
    lfoGain.gain.value = 0.4;
    gain.gain.value = 0.5;

    lfo.connect(lfoGain);
    lfoGain.connect(gain.gain);
    osc.connect(gain);
    gain.connect(analyser);

    osc.start();
    lfo.start();
    toStop.push(osc, lfo);
  }

  return () => {
    toStop.forEach(n => { try { n.stop(); } catch { /* already stopped */ } });
  };
}

// ─── 3D mesh scene (runs inside R3F Canvas) ───────────────────────────
function MeshScene({ dataRef }: { dataRef: React.MutableRefObject<AudioData | null> }) {
  const geometry = useMemo(() => {
    const geo = new THREE.IcosahedronGeometry(1.35, 4);
    geo.computeVertexNormals();
    return geo;
  }, []);

  const material = useMemo(() => new THREE.ShaderMaterial({
    vertexShader: VERT,
    fragmentShader: FRAG,
    uniforms: {
      u_bands:       { value: [0, 0, 0, 0, 0, 0] },
      u_amplitude:   { value: 0 },
      u_centroidNorm:{ value: 0.3 },
      u_time:        { value: 0 },
    },
    side: THREE.FrontSide,
  }), []);

  useEffect(() => () => { geometry.dispose(); material.dispose(); }, [geometry, material]);

  useFrame(({ clock }) => {
    const u = material.uniforms;
    u.u_time.value = clock.elapsedTime;
    const audio = dataRef.current;
    if (!audio) return;
    u.u_bands.value       = audio.bands;
    u.u_amplitude.value   = audio.amplitude;
    u.u_centroidNorm.value = Math.min(1, audio.centroid / 7000);
  });

  return <mesh geometry={geometry} material={material} />;
}

// ─── Page ──────────────────────────────────────────────────────────────
export default function ThreeMeshAV() {
  const [mode, setMode]   = useState<"idle" | "demo" | "mic">("idle");
  const [error, setError] = useState<string | null>(null);

  const dataRef   = useRef<AudioData | null>(null);
  const cleanupRef = useRef<(() => void) | null>(null);

  const stopAll = useCallback(() => {
    cleanupRef.current?.();
    cleanupRef.current = null;
    dataRef.current    = null;
    setMode("idle");
  }, []);

  const startDemo = useCallback(() => {
    const ACtx =
      window.AudioContext ||
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (window as any).webkitAudioContext as typeof AudioContext | undefined;
    if (!ACtx) { setError("Web Audio not supported in this browser."); return; }
    const ctx      = new ACtx();
    const analyser = ctx.createAnalyser();
    analyser.fftSize = 2048;
    analyser.smoothingTimeConstant = 0.5;
    const buf    = new Float32Array(new ArrayBuffer(analyser.frequencyBinCount * 4));
    const binHz  = ctx.sampleRate / analyser.fftSize;
    const stopOsc = buildDemoOscillators(analyser, ctx);

    let rafId = 0;
    const tick = () => {
      analyser.getFloatFrequencyData(buf as unknown as Float32Array<ArrayBuffer>);
      dataRef.current = computeAudioData(buf, binHz);
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
      const ctx      = new ACtx();
      const source   = ctx.createMediaStreamSource(stream);
      const analyser = ctx.createAnalyser();
      analyser.fftSize = 2048;
      analyser.smoothingTimeConstant = 0.5;
      const buf   = new Float32Array(new ArrayBuffer(analyser.frequencyBinCount * 4));
      const binHz = ctx.sampleRate / analyser.fftSize;
      source.connect(analyser);

      let rafId = 0;
      const tick = () => {
        analyser.getFloatFrequencyData(buf as unknown as Float32Array<ArrayBuffer>);
        dataRef.current = computeAudioData(buf, binHz);
        rafId = requestAnimationFrame(tick);
      };
      rafId = requestAnimationFrame(tick);

      cleanupRef.current = () => {
        cancelAnimationFrame(rafId);
        stream.getTracks().forEach(t => t.stop());
        void ctx.close();
      };
      setMode("mic");
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Microphone unavailable. Check permissions.");
    }
  }, []);

  // Cleanup on unmount
  useEffect(() => () => { cleanupRef.current?.(); }, []);

  return (
    <div
      style={{
        width: "100%",
        height: "calc(100vh - 3rem)",
        position: "relative",
        background: "#050212",
        overflow: "hidden",
      }}
    >
      {/* R3F canvas */}
      <Canvas
        camera={{ position: [0, 0, 4.2], fov: 50, near: 0.1, far: 100 }}
        style={{ position: "absolute", inset: 0 }}
        gl={{ antialias: true, alpha: false }}
      >
        <color attach="background" args={["#050212"]} />
        <MeshScene dataRef={dataRef} />
        <OrbitControls enablePan={false} enableZoom minDistance={2} maxDistance={10} />
        <EffectComposer>
          <Bloom intensity={1.4} luminanceThreshold={0.08} luminanceSmoothing={0.85} mipmapBlur />
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
            Mesh AV
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
            An icosahedron whose vertices breathe with audio. Bass expands the equator.
            Treble pushes the poles outward. Color shifts from indigo to orange as
            brightness rises. Drag to rotate.
          </p>
          <div style={{ display: "flex", gap: "1rem", pointerEvents: "auto" }}>
            <button
              onClick={startDemo}
              style={btnStyle}
            >
              Demo mode
            </button>
            <button
              onClick={() => { void startMic(); }}
              style={btnStyle}
            >
              Start mic
            </button>
          </div>
          {error && (
            <p style={{ marginTop: "1rem", fontSize: "0.7rem", color: "rgb(248,113,113)", maxWidth: "22rem" }}>
              {error}
            </p>
          )}
          <Link
            href="/dream"
            style={{ marginTop: "3rem", fontSize: "0.68rem", color: "rgba(255,255,255,0.28)", textDecoration: "none", letterSpacing: "0.08em" }}
          >
            ← dream sandbox
          </Link>
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
          <span style={{ fontSize: "0.62rem", color: "rgba(255,255,255,0.35)", letterSpacing: "0.15em", textTransform: "uppercase" }}>
            {mode === "demo" ? "Demo" : "Mic"} · drag to orbit · scroll to zoom
          </span>
          <div style={{ display: "flex", gap: "0.6rem" }}>
            <button onClick={stopAll} style={smallBtnStyle}>stop</button>
            <Link href="/dream" style={{ ...smallBtnStyle, textDecoration: "none" }}>← back</Link>
          </div>
        </div>
      )}

      {/* Design notes */}
      <div style={{ position: "absolute", top: "0.75rem", right: "1rem" }}>
        <Link
          href="https://github.com/kbarnoski/resonance/blob/dream/sandbox/src/app/dream/21-three-mesh-av/README.md"
          target="_blank"
          rel="noreferrer"
          style={{ fontSize: "0.62rem", color: "rgba(255,255,255,0.22)", letterSpacing: "0.1em", textDecoration: "none" }}
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
