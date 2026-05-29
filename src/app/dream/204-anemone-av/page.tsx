"use client";

import { Canvas, useFrame } from "@react-three/fiber";
import { OrbitControls } from "@react-three/drei";
import { EffectComposer, Bloom } from "@react-three/postprocessing";
import Link from "next/link";
import { useRef, useState, useEffect, useMemo, useCallback } from "react";
import * as THREE from "three";

// ─── Audio types + helpers ────────────────────────────────────────────────────
interface AudioData {
  bands: number[];
  amplitude: number;
  centroid: number;
  onset: number;
}

const BAND_RANGES: [number, number][] = [
  [20, 60], [60, 250], [250, 500], [500, 2000], [2000, 4000], [4000, 20000],
];

function computeAudioData(buf: Float32Array, binHz: number): Omit<AudioData, "onset"> {
  const bands = BAND_RANGES.map(([lo, hi]) => {
    const loBin = Math.floor(lo / binHz);
    const hiBin = Math.min(buf.length, Math.ceil(hi / binHz));
    let sum = 0; let count = 0;
    for (let b = loBin; b < hiBin; b++) { sum += buf[b]; count++; }
    const avgDb = count > 0 ? sum / count : -100;
    return Math.max(0, Math.min(1, (avgDb + 80) / 70));
  });
  const amplitude = bands.reduce((a, b) => a + b, 0) / 6;
  let wSum = 0; let wTot = 0;
  for (let b = 0; b < buf.length; b++) {
    const lin = Math.pow(10, buf[b] / 20);
    wSum += b * binHz * lin; wTot += lin;
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
    osc.frequency.value = FREQS[i]; osc.type = "sine";
    lfo.frequency.value = LFO_RATES[i]; lfoGain.gain.value = 0.4; gain.gain.value = 0.5;
    lfo.connect(lfoGain); lfoGain.connect(gain.gain);
    osc.connect(gain); gain.connect(analyser);
    osc.start(); lfo.start();
    toStop.push(osc, lfo);
  }
  return () => { toStop.forEach(n => { try { n.stop(); } catch { /* already stopped */ } }); };
}

// ─── GLSL shaders ─────────────────────────────────────────────────────────────

const TENTACLE_VERT = /* glsl */ `
  varying vec2 vUv;
  varying float vGlowT;

  uniform float u_time;
  uniform float u_bass;
  uniform float u_mid;
  uniform float u_treble;
  uniform float u_onset;
  uniform float u_phase;

  void main() {
    float t = vUv.y; // 0 = base (near stalk crown), 1 = tip

    // Radial + tangential sway direction derived from XZ world-space position
    float rLen = length(vec2(position.x, position.z)) + 0.001;
    float outX = position.x / rLen;
    float outZ = position.z / rLen;

    // Slow sway radially outward/inward, amplitude grows toward tip
    float radial = sin(u_time * 1.05 + u_phase + t * 2.2) * (u_bass * 0.45 + 0.10) * t;
    // Lateral sway (perpendicular in XZ), mid-frequency driven
    float lateral = sin(u_time * 0.72 + u_phase * 0.88 + t * 1.7) * (u_mid * 0.28 + 0.06) * t;
    // Vertical nod
    float vertNod = sin(u_time * 0.58 + u_phase * 1.15 + t * 1.3) * (u_bass * 0.14 + 0.04) * t;
    // Fast tip flicker from treble
    float flicker = sin(u_time * 5.2 + u_phase * 0.65 + t * 5.5) * u_treble * 0.16 * t * t;

    // Onset radial pulse (more at tips)
    float pulse = 1.0 + u_onset * 0.22 * t;

    vec3 p = position;
    p.x += (radial * outX + lateral * (-outZ) + flicker * outX) * pulse;
    p.z += (radial * outZ + lateral * outX + flicker * outZ) * pulse;
    p.y += vertNod * pulse;

    vUv = uv;
    // Glow factor: brighter at tip, boosted by treble + bass
    vGlowT = t * (0.45 + u_treble * 0.38 + u_bass * 0.22);

    gl_Position = projectionMatrix * modelViewMatrix * vec4(p, 1.0);
  }
`;

const TENTACLE_FRAG = /* glsl */ `
  varying vec2 vUv;
  varying float vGlowT;

  uniform float u_centroidNorm;
  uniform float u_bass;

  vec3 hsl2rgb(float h, float s, float l) {
    float c = (1.0 - abs(2.0 * l - 1.0)) * s;
    float hp = mod(h * 6.0, 6.0);
    float x = c * (1.0 - abs(mod(hp, 2.0) - 1.0));
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
    float t = vUv.y;

    // Hue: deep cyan (0.53) at base → violet (0.76) at tip, shifted by spectral centroid
    float hue = 0.53 + t * 0.23 - u_centroidNorm * 0.07;
    hue = mod(hue, 1.0);

    // Luminance: base dim, tip glows, boosted by audio
    float lum = 0.04 + t * 0.30 + vGlowT * 0.18 + u_bass * 0.08;
    lum = clamp(lum, 0.0, 0.88);

    float sat = 0.88 + t * 0.08;

    vec3 col = hsl2rgb(hue, sat, lum);

    // Subtle tonemap
    col = col / (col + 0.32);

    gl_FragColor = vec4(col, 1.0);
  }
`;

const STALK_VERT2 = /* glsl */ `
  varying float vT;

  uniform float u_time;
  uniform float u_bass;
  uniform float u_onset;

  void main() {
    vT = uv.y;
    float t = uv.y;

    float sway = sin(u_time * 0.82 + t * 1.4) * (u_bass * 0.07 + 0.02) * t;
    float pulse = 1.0 + u_onset * 0.12 * t;

    vec3 p = position;
    p.x += sway * pulse;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(p, 1.0);
  }
`;

const STALK_FRAG = /* glsl */ `
  varying float vT;
  uniform float u_bass;

  vec3 hsl2rgb2(float h, float s, float l) {
    float c = (1.0 - abs(2.0 * l - 1.0)) * s;
    float hp = mod(h * 6.0, 6.0);
    float x = c * (1.0 - abs(mod(hp, 2.0) - 1.0));
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
    // Stalk: deep teal, brightening toward crown
    float lum = 0.04 + vT * 0.22 + u_bass * 0.06;
    vec3 col = hsl2rgb2(0.50, 0.90, lum);
    col = col / (col + 0.35);
    gl_FragColor = vec4(col, 1.0);
  }
`;

// ─── Geometry builders ────────────────────────────────────────────────────────

function buildTentacleCurve(angle: number): THREE.CatmullRomCurve3 {
  const c = Math.cos(angle);
  const s = Math.sin(angle);
  return new THREE.CatmullRomCurve3([
    new THREE.Vector3(c * 0.10, 0.55, s * 0.10),   // base: at stalk crown
    new THREE.Vector3(c * 0.32, 0.85, s * 0.32),   // lift off outward
    new THREE.Vector3(c * 0.72, 1.18, s * 0.72),   // rising outward
    new THREE.Vector3(c * 1.10, 1.08, s * 1.10),   // near-horizontal peak
    new THREE.Vector3(c * 1.42, 0.60, s * 1.42),   // tip droops down
  ]);
}

function buildStalkCurve(): THREE.CatmullRomCurve3 {
  return new THREE.CatmullRomCurve3([
    new THREE.Vector3( 0.00, -1.10, 0.00),
    new THREE.Vector3( 0.02, -0.20, 0.00),
    new THREE.Vector3(-0.02,  0.35, 0.00),
    new THREE.Vector3( 0.00,  0.72, 0.00),
  ]);
}

// ─── Scene ────────────────────────────────────────────────────────────────────

const N = 12;
const ANGLES = Array.from({ length: N }, (_v, i) => (i / N) * Math.PI * 2);
const PHASES = Array.from({ length: N }, (_v, i) => i * 0.523 + 0.1);

interface SceneProps {
  dataRef: React.MutableRefObject<AudioData | null>;
}

function AnemoneScene({ dataRef }: SceneProps) {
  const tentacleMats = useMemo(() =>
    PHASES.map(phase => new THREE.ShaderMaterial({
      vertexShader:   TENTACLE_VERT,
      fragmentShader: TENTACLE_FRAG,
      uniforms: {
        u_time:        { value: 0 },
        u_bass:        { value: 0 },
        u_mid:         { value: 0 },
        u_treble:      { value: 0 },
        u_onset:       { value: 0 },
        u_phase:       { value: phase },
        u_centroidNorm:{ value: 0.3 },
      },
    }))
  , []);

  const tentacleGeos = useMemo(() =>
    ANGLES.map(angle => {
      const geo = new THREE.TubeGeometry(buildTentacleCurve(angle), 24, 0.046, 8, false);
      return geo;
    })
  , []);

  const stalkGeo = useMemo(() => {
    const geo = new THREE.TubeGeometry(buildStalkCurve(), 20, 0.09, 8, false);
    return geo;
  }, []);

  const stalkMat = useMemo(() => new THREE.ShaderMaterial({
    vertexShader:   STALK_VERT2,
    fragmentShader: STALK_FRAG,
    uniforms: {
      u_time:  { value: 0 },
      u_bass:  { value: 0 },
      u_onset: { value: 0 },
    },
  }), []);

  useEffect(() => () => {
    tentacleMats.forEach(m => m.dispose());
    tentacleGeos.forEach(g => g.dispose());
    stalkGeo.dispose();
    stalkMat.dispose();
  }, [tentacleMats, tentacleGeos, stalkGeo, stalkMat]);

  useFrame(({ clock }) => {
    const t    = clock.elapsedTime;
    const d    = dataRef.current;
    const bass = d ? d.bands[0] * 0.6 + d.bands[1] * 0.4 : 0;
    const mid  = d ? d.bands[2] * 0.5 + d.bands[3] * 0.5 : 0;
    const treble = d ? d.bands[4] * 0.6 + d.bands[5] * 0.4 : 0;
    const onset  = d?.onset ?? 0;
    const cNorm  = d ? Math.min(1, d.centroid / 7000) : 0.3;

    for (const m of tentacleMats) {
      const u = m.uniforms;
      u.u_time.value        = t;
      u.u_bass.value        = bass;
      u.u_mid.value         = mid;
      u.u_treble.value      = treble;
      u.u_onset.value       = onset;
      u.u_centroidNorm.value = cNorm;
    }

    stalkMat.uniforms.u_time.value  = t;
    stalkMat.uniforms.u_bass.value  = bass;
    stalkMat.uniforms.u_onset.value = onset;
  });

  return (
    <group>
      <mesh geometry={stalkGeo} material={stalkMat} />
      {tentacleGeos.map((geo, i) => (
        <mesh key={i} geometry={geo} material={tentacleMats[i]} />
      ))}
    </group>
  );
}

// ─── Page ─────────────────────────────────────────────────────────────────────
export default function AnemoneAV() {
  const [mode, setMode]   = useState<"idle" | "demo" | "mic">("idle");
  const [error, setError] = useState<string | null>(null);

  const dataRef    = useRef<AudioData | null>(null);
  const cleanupRef = useRef<(() => void) | null>(null);
  const prevAmpRef = useRef(0);
  const onsetEmaRef = useRef(0);

  const stopAll = useCallback(() => {
    cleanupRef.current?.();
    cleanupRef.current = null;
    dataRef.current    = null;
    prevAmpRef.current = 0;
    onsetEmaRef.current = 0;
    setMode("idle");
  }, []);

  const startAudioLoop = useCallback((
    analyser: AnalyserNode,
    ctx: AudioContext,
    releaseAudio: () => void,
  ) => {
    const buf   = new Float32Array(analyser.frequencyBinCount);
    const binHz = ctx.sampleRate / analyser.fftSize;
    let rafId   = 0;

    const tick = () => {
      analyser.getFloatFrequencyData(buf as unknown as Float32Array<ArrayBuffer>);
      const { bands, amplitude, centroid } = computeAudioData(buf, binHz);
      const rawOnset = Math.max(0, amplitude - prevAmpRef.current) * 5;
      onsetEmaRef.current = onsetEmaRef.current * 0.82 + rawOnset * 0.18;
      prevAmpRef.current  = prevAmpRef.current  * 0.88 + amplitude * 0.12;
      dataRef.current = { bands, amplitude, centroid, onset: onsetEmaRef.current };
      rafId = requestAnimationFrame(tick);
    };
    rafId = requestAnimationFrame(tick);

    cleanupRef.current = () => {
      cancelAnimationFrame(rafId);
      releaseAudio();
      void ctx.close();
    };
  }, []);

  const startDemo = useCallback(() => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const ACtx = window.AudioContext || (window as any).webkitAudioContext as typeof AudioContext | undefined;
    if (!ACtx) { setError("Web Audio not supported in this browser."); return; }
    const ctx      = new ACtx();
    const analyser = ctx.createAnalyser();
    analyser.fftSize = 2048;
    analyser.smoothingTimeConstant = 0.6;
    const stopOsc = buildDemoOscillators(analyser, ctx);
    startAudioLoop(analyser, ctx, stopOsc);
    setMode("demo"); setError(null);
  }, [startAudioLoop]);

  const startMic = useCallback(async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: { echoCancellation: false, noiseSuppression: false, autoGainControl: false },
      });
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const ACtx = window.AudioContext || (window as any).webkitAudioContext as typeof AudioContext | undefined;
      if (!ACtx) { setError("Web Audio not supported."); return; }
      const ctx      = new ACtx();
      const source   = ctx.createMediaStreamSource(stream);
      const analyser = ctx.createAnalyser();
      analyser.fftSize = 2048;
      analyser.smoothingTimeConstant = 0.6;
      source.connect(analyser);
      startAudioLoop(analyser, ctx, () => stream.getTracks().forEach(t => t.stop()));
      setMode("mic"); setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Microphone unavailable. Check permissions.");
    }
  }, [startAudioLoop]);

  useEffect(() => () => { cleanupRef.current?.(); }, []);

  return (
    <div style={{
      width: "100%",
      height: "calc(100vh - 3rem)",
      position: "relative",
      background: "#020b12",
      overflow: "hidden",
    }}>
      <Canvas
        camera={{ position: [0, 0.6, 5.2], fov: 48, near: 0.1, far: 100 }}
        style={{ position: "absolute", inset: 0 }}
        gl={{ antialias: true, alpha: false }}
      >
        <color attach="background" args={["#020b12"]} />
        <AnemoneScene dataRef={dataRef} />
        <OrbitControls
          enablePan={false}
          enableZoom
          minDistance={2}
          maxDistance={12}
          target={[0, 0.2, 0]}
        />
        <EffectComposer>
          <Bloom intensity={1.9} luminanceThreshold={0.05} luminanceSmoothing={0.88} mipmapBlur />
        </EffectComposer>
      </Canvas>

      {/* Idle splash */}
      {mode === "idle" && (
        <div style={{
          position: "absolute", inset: 0,
          display: "flex", flexDirection: "column",
          alignItems: "center", justifyContent: "center",
          textAlign: "center", padding: "1.5rem",
          pointerEvents: "none",
        }}>
          <h1 style={{
            fontSize: "1.6rem",
            letterSpacing: "0.2em",
            fontWeight: 300,
            marginBottom: "0.5rem",
            textTransform: "uppercase",
            color: "rgba(255,255,255,0.93)",
          }}>
            Anemone
          </h1>
          <p style={{
            fontSize: "1rem",
            color: "rgba(255,255,255,0.72)",
            maxWidth: "28rem",
            lineHeight: 1.65,
            marginBottom: "2rem",
          }}>
            A bioluminescent sea creature that breathes with sound.
            Bass sways the tentacles. Treble makes the tips flicker.
            Onsets pulse the whole form. Drag to rotate.
          </p>
          <div style={{ display: "flex", gap: "1rem", pointerEvents: "auto" }}>
            <button onClick={startDemo} style={btnStyle}>Demo mode</button>
            <button onClick={() => { void startMic(); }} style={btnStyle}>Start mic</button>
          </div>
          {error && (
            <p style={{
              marginTop: "1rem",
              fontSize: "0.9rem",
              color: "rgb(248,113,113)",
              maxWidth: "22rem",
            }}>
              {error}
            </p>
          )}
          <Link
            href="/dream"
            style={{
              marginTop: "2.5rem",
              fontSize: "0.75rem",
              color: "rgba(255,255,255,0.32)",
              textDecoration: "none",
              letterSpacing: "0.08em",
            }}
          >
            ← dream sandbox
          </Link>
        </div>
      )}

      {/* Running HUD */}
      {mode !== "idle" && (
        <div style={{
          position: "absolute", bottom: "1rem", right: "1rem",
          display: "flex", flexDirection: "column",
          alignItems: "flex-end", gap: "0.5rem",
        }}>
          <span style={{
            fontSize: "0.68rem",
            color: "rgba(255,255,255,0.38)",
            letterSpacing: "0.14em",
            textTransform: "uppercase",
          }}>
            {mode === "demo" ? "Demo" : "Mic"} · drag to orbit · scroll to zoom
          </span>
          <div style={{ display: "flex", gap: "0.6rem" }}>
            <button onClick={stopAll} style={smallBtnStyle}>stop</button>
            <Link href="/dream" style={{ ...smallBtnStyle, textDecoration: "none" }}>
              ← back
            </Link>
          </div>
        </div>
      )}

      {/* Design notes link */}
      <div style={{ position: "absolute", top: "0.75rem", right: "1rem" }}>
        <Link
          href="https://github.com/kbarnoski/resonance/blob/main/src/app/dream/204-anemone-av/README.md"
          target="_blank"
          rel="noreferrer"
          style={{
            fontSize: "0.7rem",
            color: "rgba(255,255,255,0.26)",
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
  padding: "0.65rem 1.5rem",
  fontSize: "0.85rem",
  letterSpacing: "0.14em",
  textTransform: "uppercase",
  border: "1px solid rgba(255,255,255,0.30)",
  background: "transparent",
  color: "white",
  cursor: "pointer",
  borderRadius: "3px",
  fontFamily: "inherit",
  minHeight: "44px",
};

const smallBtnStyle: React.CSSProperties = {
  padding: "0.35rem 0.8rem",
  fontSize: "0.65rem",
  letterSpacing: "0.12em",
  textTransform: "uppercase",
  border: "1px solid rgba(255,255,255,0.18)",
  background: "transparent",
  color: "rgba(255,255,255,0.52)",
  cursor: "pointer",
  borderRadius: "3px",
  fontFamily: "inherit",
  display: "inline-block",
};
