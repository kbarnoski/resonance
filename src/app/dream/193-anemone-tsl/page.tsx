"use client";

import { Canvas, useFrame } from "@react-three/fiber";
import { OrbitControls } from "@react-three/drei";
import { EffectComposer, Bloom } from "@react-three/postprocessing";
import Link from "next/link";
import {
  MutableRefObject,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import * as THREE from "three";
import { useMicAnalyser } from "../_shared/use-mic-analyser";

// ── audio state shared via ref ─────────────────────────────────────────────────

interface AudioState {
  subBass: number;
  bass: number;
  mid: number;
  highMid: number;
  high: number;
  amplitude: number;
  centroid: number;
  onset: number;
}

// ── GLSL shaders ───────────────────────────────────────────────────────────────

const VERT = /* glsl */ `
uniform float u_time;
uniform float u_subBass;
uniform float u_bass;
uniform float u_mid;
uniform float u_highMid;
uniform float u_onset;

varying float vDisplace;
varying vec3  vViewNormal;

void main() {
  vViewNormal = normalize(normalMatrix * normal);

  // uv.x travels 0→1 along the knot tube path — the key for wave displacement
  float t = uv.x;

  float breathe = u_subBass * 0.22;
  float wave1   = sin(t * 18.85 + u_time * 2.2)         * u_bass    * 0.14;
  float wave2   = sin(t * 37.70 + u_time * 4.1  + 1.57) * u_mid     * 0.09;
  float flutter = sin(t * 94.25 + u_time * 12.0)         * u_highMid * 0.05;
  float burst   = u_onset * 0.20;

  float d = breathe + wave1 + wave2 + flutter + burst;
  vDisplace = clamp(d * 1.4, 0.0, 1.0);

  gl_Position = projectionMatrix * modelViewMatrix *
                vec4(position + normal * d, 1.0);
}
`;

const FRAG = /* glsl */ `
uniform float u_centroidNorm;

varying float vDisplace;
varying vec3  vViewNormal;

vec3 hsl2rgb(float h, float s, float l) {
  float c = (1.0 - abs(2.0 * l - 1.0)) * s;
  float x = c * (1.0 - abs(mod(h * 6.0, 2.0) - 1.0));
  float m = l - c * 0.5;
  vec3 rgb;
  if      (h < 0.1667) rgb = vec3(c, x, 0.0);
  else if (h < 0.3333) rgb = vec3(x, c, 0.0);
  else if (h < 0.5000) rgb = vec3(0.0, c, x);
  else if (h < 0.6667) rgb = vec3(0.0, x, c);
  else if (h < 0.8333) rgb = vec3(x, 0.0, c);
  else                 rgb = vec3(c, 0.0, x);
  return rgb + m;
}

void main() {
  // Hue sweeps violet→cyan with spectral centroid
  float hue   = 0.74 - u_centroidNorm * 0.24;
  float sat   = 0.85 + vDisplace * 0.12;
  float light = 0.04 + vDisplace * 0.68;
  vec3 col = hsl2rgb(hue, sat, light);

  // Rim light: bright cyan at silhouette edges
  float rim = pow(1.0 - abs(vViewNormal.z), 2.8);
  col += vec3(0.12, 0.72, 0.88) * rim * 0.55;

  // Filmic tonemap
  col = col / (col + vec3(0.28));

  gl_FragColor = vec4(col, 1.0);
}
`;

// ── torus-knot organism ────────────────────────────────────────────────────────

function KnotOrganism({
  audioRef,
}: {
  audioRef: MutableRefObject<AudioState>;
}) {
  const geometry = useMemo(
    () => new THREE.TorusKnotGeometry(1.0, 0.22, 300, 36, 2, 3),
    [],
  );

  const material = useMemo(
    () =>
      new THREE.ShaderMaterial({
        vertexShader: VERT,
        fragmentShader: FRAG,
        uniforms: {
          u_time: { value: 0 },
          u_subBass: { value: 0 },
          u_bass: { value: 0 },
          u_mid: { value: 0 },
          u_highMid: { value: 0 },
          u_onset: { value: 0 },
          u_centroidNorm: { value: 0.3 },
        },
        side: THREE.FrontSide,
      }),
    [],
  );

  useEffect(() => {
    return () => {
      geometry.dispose();
      material.dispose();
    };
  }, [geometry, material]);

  useFrame(({ clock }) => {
    const u = material.uniforms;
    u.u_time.value = clock.elapsedTime;

    const a = audioRef.current;
    u.u_subBass.value = a.subBass;
    u.u_bass.value = a.bass;
    u.u_mid.value = a.mid;
    u.u_highMid.value = a.highMid;
    u.u_centroidNorm.value = Math.min(1, a.centroid / 6000);

    // Onset burst — decay per-frame in useFrame so it's tied to render rate
    u.u_onset.value = Math.max(0, u.u_onset.value * 0.88);
    if (a.onset > 0.5) u.u_onset.value = 1.0;
  });

  return <mesh geometry={geometry} material={material} />;
}

// ── demo LFO audio source ──────────────────────────────────────────────────────

function buildDemoState(t: number): AudioState {
  return {
    subBass: (Math.sin(t * 0.30) * 0.5 + 0.5) * 0.60,
    bass: (Math.sin(t * 0.45 + 1.0) * 0.5 + 0.5) * 0.50,
    mid: (Math.sin(t * 0.70 + 2.1) * 0.5 + 0.5) * 0.35,
    highMid: (Math.sin(t * 3.10 + 0.5) * 0.5 + 0.5) * 0.30,
    high: (Math.sin(t * 7.00 + 1.8) * 0.5 + 0.5) * 0.20,
    amplitude: 0.38,
    centroid: 800 + Math.sin(t * 0.22) * 600,
    onset: 0,
  };
}

// ── main page ──────────────────────────────────────────────────────────────────

type Screen = "start" | "running";
type Source = "demo" | "mic";

export default function AnemoreTSLPage() {
  const [screen, setScreen] = useState<Screen>("start");
  const [source, setSource] = useState<Source>("demo");
  const audioStateRef = useRef<AudioState>({
    subBass: 0, bass: 0, mid: 0, highMid: 0, high: 0,
    amplitude: 0, centroid: 1000, onset: 0,
  });

  const { running, error, start: startMic, stop: stopMic, getFrame } =
    useMicAnalyser();

  // Demo RAF loop
  const demoRafRef = useRef<number>(0);
  const startDemo = useCallback(() => {
    const tick = () => {
      const t = performance.now() / 1000;
      audioStateRef.current = buildDemoState(t);
      demoRafRef.current = requestAnimationFrame(tick);
    };
    demoRafRef.current = requestAnimationFrame(tick);
  }, []);

  const stopDemo = useCallback(() => {
    cancelAnimationFrame(demoRafRef.current);
  }, []);

  // Mic RAF loop
  const micRafRef = useRef<number>(0);
  const startMicLoop = useCallback(() => {
    const tick = () => {
      const frame = getFrame();
      if (frame) {
        const [subBass, bass, , mid, highMid, high] = frame.bands;
        const onsetDecay = audioStateRef.current.onset * 0.84;
        audioStateRef.current = {
          subBass: subBass ?? 0,
          bass: bass ?? 0,
          mid: mid ?? 0,
          highMid: highMid ?? 0,
          high: high ?? 0,
          amplitude: frame.amplitude,
          centroid: frame.centroid,
          onset: frame.onset ? 1.0 : onsetDecay,
        };
      }
      micRafRef.current = requestAnimationFrame(tick);
    };
    micRafRef.current = requestAnimationFrame(tick);
  }, [getFrame]);

  const stopMicLoop = useCallback(() => {
    cancelAnimationFrame(micRafRef.current);
  }, []);

  useEffect(() => {
    return () => {
      stopDemo();
      stopMicLoop();
      stopMic();
    };
  }, [stopDemo, stopMicLoop, stopMic]);

  const handleDemo = useCallback(() => {
    setSource("demo");
    setScreen("running");
    startDemo();
  }, [startDemo]);

  const handleMic = useCallback(async () => {
    setSource("mic");
    await startMic();
    setScreen("running");
    startMicLoop();
  }, [startMic, startMicLoop]);

  // ── start screen ─────────────────────────────────────────────────────────────

  if (screen === "start") {
    return (
      <div className="min-h-screen bg-black flex flex-col items-center justify-center gap-8 p-6">
        <div className="text-center space-y-3 max-w-md">
          <h1 className="text-3xl font-serif text-white/95 tracking-tight">
            Anemone TSL
          </h1>
          <p className="text-base text-white/75">
            A torus-knot organism that breathes with your music. Bass stretches
            its surface; transients send it pulsing outward; spectral colour
            drifts violet to cyan.
          </p>
        </div>

        <div className="flex flex-col sm:flex-row gap-4">
          <button
            onClick={handleDemo}
            className="min-h-[44px] px-6 py-2.5 rounded-lg bg-violet-500/20 text-violet-300 text-base
                       hover:bg-violet-500/30 transition-colors border border-violet-500/30"
          >
            Demo Mode
          </button>
          <button
            onClick={handleMic}
            className="min-h-[44px] px-6 py-2.5 rounded-lg bg-cyan-500/20 text-cyan-300 text-base
                       hover:bg-cyan-500/30 transition-colors border border-cyan-500/30"
          >
            Start Mic
          </button>
        </div>

        {error && (
          <p className="text-sm text-rose-300 max-w-xs text-center">{error}</p>
        )}

        <p className="text-xs text-white/55">
          Headphones recommended · WebGL required
        </p>

        <Link
          href="/dream"
          className="text-xs text-white/55 hover:text-white/75 transition-colors"
        >
          ← Dream lab
        </Link>
      </div>
    );
  }

  // ── running screen ────────────────────────────────────────────────────────────

  return (
    <div className="relative w-full h-screen bg-black overflow-hidden">
      <Canvas
        camera={{ position: [0, 1.2, 4.2], fov: 52 }}
        gl={{ antialias: true, alpha: false }}
        style={{ background: "#000000" }}
      >
        <ambientLight intensity={0.04} />
        <pointLight position={[3, 3, 2]} intensity={1.0} color="#c4b5fd" />
        <pointLight position={[-2, -2, 1]} intensity={0.35} color="#38bdf8" />

        <KnotOrganism audioRef={audioStateRef} />

        <OrbitControls
          autoRotate
          autoRotateSpeed={0.6}
          enablePan={false}
          minDistance={2.5}
          maxDistance={9}
        />

        <EffectComposer>
          <Bloom
            luminanceThreshold={0.15}
            luminanceSmoothing={0.85}
            intensity={2.0}
            radius={0.9}
          />
        </EffectComposer>
      </Canvas>

      {/* HUD overlay */}
      <div className="absolute top-4 left-4 right-4 flex items-start justify-between pointer-events-none">
        <div>
          <p className="text-base font-serif text-white/95">Anemone TSL</p>
          <p className="text-xs text-white/55 mt-0.5">
            {source === "mic"
              ? running
                ? "Mic active"
                : "Mic starting…"
              : "Demo mode"}
          </p>
        </div>
        <Link
          href="/dream"
          className="text-xs text-white/55 hover:text-white/75 transition-colors pointer-events-auto"
        >
          ← Dream lab
        </Link>
      </div>

      {error && (
        <div className="absolute bottom-8 left-0 right-0 flex justify-center pointer-events-none">
          <p className="text-sm text-rose-300 bg-black/60 px-4 py-2 rounded-lg">
            {error}
          </p>
        </div>
      )}

      <div className="absolute bottom-4 right-4 pointer-events-none">
        <p className="text-xs text-white/40">drag to orbit</p>
      </div>
    </div>
  );
}
