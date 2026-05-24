"use client";

import { Canvas, useFrame } from "@react-three/fiber";
import { EffectComposer, Bloom } from "@react-three/postprocessing";
import Link from "next/link";
import { MutableRefObject, useCallback, useEffect, useMemo, useRef, useState } from "react";
import * as THREE from "three";
import { useMicAnalyser } from "../_shared/use-mic-analyser";

// ── audio data shared via ref ──────────────────────────────────────────────────

interface AudioState {
  subBass: number;   // 0-1
  bass: number;      // 0-1
  lowMid: number;    // 0-1
  highMid: number;   // 0-1
  onset: number;     // 0-1 decaying
}

// ── geometry helpers ───────────────────────────────────────────────────────────

function buildTentacleCurve(
  baseX: number, baseZ: number, height: number, lean: number
): THREE.CatmullRomCurve3 {
  const mid = height * 0.55;
  return new THREE.CatmullRomCurve3([
    new THREE.Vector3(baseX, 0, baseZ),
    new THREE.Vector3(baseX * 1.12 + lean * 0.3, mid * 0.5, baseZ * 1.12),
    new THREE.Vector3(baseX * 1.25 + lean * 0.8, mid, baseZ * 1.25),
    new THREE.Vector3(baseX * 1.1 + lean, height, baseZ * 1.1),
  ]);
}

// ── scene component ────────────────────────────────────────────────────────────

const ARM_COUNT = 8;
const BRANCH_COLORS = [
  "#4dd8ff", // cyan
  "#7b5ea7", // violet
  "#4dd8ff",
  "#a78bfa",
  "#4dd8ff",
  "#7c3aed",
  "#4dd8ff",
  "#a78bfa",
] as const;

interface SceneProps {
  audioRef: MutableRefObject<AudioState>;
}

function TentacleArm({
  index, baseX, baseZ, audioRef,
}: {
  index: number;
  baseX: number;
  baseZ: number;
  audioRef: MutableRefObject<AudioState>;
}) {
  const groupRef = useRef<THREE.Group>(null!);
  const tipRef = useRef<THREE.Mesh>(null!);
  const matRef = useRef<THREE.MeshStandardMaterial>(null!);
  const phase = (index / ARM_COUNT) * Math.PI * 2;

  useFrame(({ clock }) => {
    const t = clock.getElapsedTime();
    const { subBass, lowMid, highMid, onset } = audioRef.current;

    if (groupRef.current) {
      // Sway driven by sub-bass + slow LFO
      const swayAmt = 0.18 + subBass * 0.22;
      groupRef.current.rotation.z =
        Math.sin(t * 0.7 + phase) * swayAmt * Math.cos(t * 0.3);
      groupRef.current.rotation.x =
        Math.cos(t * 0.55 + phase + 1.2) * swayAmt * 0.6;

      // Low-mid spreads arms outward (scale XZ)
      const spread = 1 + lowMid * 0.25;
      groupRef.current.scale.set(spread, 1 + onset * 0.08, spread);
    }

    // Tip flicker from high-mid
    if (tipRef.current && matRef.current) {
      const flicker = 0.8 + highMid * 1.4 + Math.sin(t * 18 + phase) * highMid * 0.5;
      matRef.current.emissiveIntensity = flicker;
    }
  });

  const tubeGeo = useMemo(() => {
    const curve = buildTentacleCurve(baseX, baseZ, 1.6 + (index % 3) * 0.18, (index % 2 === 0 ? 1 : -1) * 0.12);
    return new THREE.TubeGeometry(curve, 12, 0.035 - index * 0.002, 6, false);
  }, [baseX, baseZ, index]);

  const color = BRANCH_COLORS[index % BRANCH_COLORS.length];

  return (
    <group ref={groupRef}>
      <mesh geometry={tubeGeo}>
        <meshStandardMaterial
          color={color}
          emissive={color}
          emissiveIntensity={0.7}
          transparent
          opacity={0.92}
        />
      </mesh>
      {/* glowing tip */}
      <mesh
        ref={tipRef}
        position={[baseX * 1.12, 1.6 + (index % 3) * 0.18, baseZ * 1.12]}
      >
        <sphereGeometry args={[0.055 + (index % 3) * 0.01, 8, 8]} />
        <meshStandardMaterial
          ref={matRef}
          color="#ffffff"
          emissive={color}
          emissiveIntensity={1.2}
        />
      </mesh>
    </group>
  );
}

function AnemoneCore({ audioRef }: SceneProps) {
  const rootRef = useRef<THREE.Group>(null!);
  const stalkMatRef = useRef<THREE.MeshStandardMaterial>(null!);
  const baseMatRef = useRef<THREE.MeshStandardMaterial>(null!);
  const pulseRef = useRef(0);

  useFrame(({ clock }) => {
    const t = clock.getElapsedTime();
    const { subBass, onset } = audioRef.current;

    // Onset pulse decays over ~80ms
    if (onset > 0.8) pulseRef.current = 1.0;
    pulseRef.current *= 0.88;

    if (rootRef.current) {
      // Very gentle macro sway of the whole organism
      const sway = 0.06 + subBass * 0.08;
      rootRef.current.rotation.x = Math.sin(t * 0.25) * sway;
      rootRef.current.rotation.z = Math.cos(t * 0.18) * sway * 0.7;
      // Onset pulse: whole-body scale
      const pulse = 1 + pulseRef.current * 0.09;
      rootRef.current.scale.setScalar(pulse);
    }

    if (stalkMatRef.current) {
      stalkMatRef.current.emissiveIntensity = 1.4 + subBass * 0.8 + pulseRef.current * 0.6;
    }
    if (baseMatRef.current) {
      baseMatRef.current.emissiveIntensity = 0.9 + subBass * 0.5;
    }
  });

  const arms = useMemo(() => {
    return Array.from({ length: ARM_COUNT }, (_, i) => {
      const angle = (i / ARM_COUNT) * Math.PI * 2;
      const r = 0.55 + (i % 2) * 0.12;
      return { index: i, baseX: Math.cos(angle) * r, baseZ: Math.sin(angle) * r };
    });
  }, []);

  return (
    <group ref={rootRef}>
      {/* central stalk */}
      <mesh>
        <cylinderGeometry args={[0.04, 0.11, 1.8, 8, 1]} />
        <meshStandardMaterial
          ref={stalkMatRef}
          color="#ede9fe"
          emissive="#8b5cf6"
          emissiveIntensity={1.4}
        />
      </mesh>

      {/* basal bulb */}
      <mesh position={[0, -0.9, 0]}>
        <sphereGeometry args={[0.18, 12, 10]} />
        <meshStandardMaterial
          ref={baseMatRef}
          color="#c4b5fd"
          emissive="#6d28d9"
          emissiveIntensity={0.9}
        />
      </mesh>

      {/* tentacle arms */}
      {arms.map(({ index, baseX, baseZ }) => (
        <TentacleArm
          key={index}
          index={index}
          baseX={baseX}
          baseZ={baseZ}
          audioRef={audioRef}
        />
      ))}

      {/* inner crown ring — six small spheres at the top of the stalk */}
      {Array.from({ length: 6 }, (_, i) => {
        const a = (i / 6) * Math.PI * 2;
        return (
          <mesh key={i} position={[Math.cos(a) * 0.22, 0.92, Math.sin(a) * 0.22]}>
            <sphereGeometry args={[0.04, 6, 6]} />
            <meshStandardMaterial
              color="#e0f2fe"
              emissive="#38bdf8"
              emissiveIntensity={1.6}
            />
          </mesh>
        );
      })}
    </group>
  );
}

// ── demo LFO audio source ──────────────────────────────────────────────────────

function buildDemoState(t: number): AudioState {
  return {
    subBass: (Math.sin(t * 0.28) * 0.5 + 0.5) * 0.65,
    bass: (Math.sin(t * 0.41 + 1.1) * 0.5 + 0.5) * 0.5,
    lowMid: (Math.sin(t * 0.67 + 2.3) * 0.5 + 0.5) * 0.4,
    highMid: (Math.sin(t * 2.8 + 0.7) * 0.5 + 0.5) * 0.35,
    onset: 0,
  };
}

// ── main page ──────────────────────────────────────────────────────────────────

type Screen = "start" | "running";
type Source = "demo" | "mic";

export default function AnemoneAVPage() {
  const [screen, setScreen] = useState<Screen>("start");
  const [source, setSource] = useState<Source>("demo");
  const audioStateRef = useRef<AudioState>({
    subBass: 0, bass: 0, lowMid: 0, highMid: 0, onset: 0,
  });

  const { running, error, start: startMic, stop: stopMic, getFrame } = useMicAnalyser();

  // Demo LFO updater
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

  // Mic frame updater
  const micRafRef = useRef<number>(0);
  const startMicLoop = useCallback(() => {
    const tick = () => {
      const frame = getFrame();
      if (frame) {
        const [subBass, bass, , lowMid, highMid] = frame.bands;
        const onsetDecay = audioStateRef.current.onset * 0.84;
        audioStateRef.current = {
          subBass: subBass ?? 0,
          bass: bass ?? 0,
          lowMid: lowMid ?? 0,
          highMid: highMid ?? 0,
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
          <h1 className="text-3xl font-serif text-white/95 tracking-tight">Anemone</h1>
          <p className="text-base text-white/75">
            A bioluminescent sea creature dancing in the dark. Its tentacles sway to
            the bass, its tips flicker with the highs.
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

        <p className="text-xs text-white/55">Headphones recommended · WebGL required</p>

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
        camera={{ position: [0, 0.8, 4.5], fov: 55 }}
        gl={{ antialias: true, alpha: false }}
        style={{ background: "#000000" }}
      >
        <ambientLight intensity={0.05} />
        <pointLight position={[0, 3, 2]} intensity={1.2} color="#c4b5fd" />
        <pointLight position={[0, -2, 1]} intensity={0.4} color="#38bdf8" />

        <AnemoneCore audioRef={audioStateRef} />

        <EffectComposer>
          <Bloom
            luminanceThreshold={0.18}
            luminanceSmoothing={0.9}
            intensity={1.8}
            radius={0.85}
          />
        </EffectComposer>
      </Canvas>

      {/* HUD overlay */}
      <div className="absolute top-4 left-4 right-4 flex items-start justify-between pointer-events-none">
        <div>
          <p className="text-base font-serif text-white/95">Anemone</p>
          <p className="text-xs text-white/55 mt-0.5">
            {source === "mic" ? (running ? "Mic active" : "Mic starting…") : "Demo mode"}
          </p>
        </div>
        <Link
          href="/dream"
          className="text-xs text-white/55 hover:text-white/75 transition-colors pointer-events-auto"
        >
          ← Dream lab
        </Link>
      </div>

      {/* mic error */}
      {error && (
        <div className="absolute bottom-8 left-0 right-0 flex justify-center pointer-events-none">
          <p className="text-sm text-rose-300 bg-black/60 px-4 py-2 rounded-lg">{error}</p>
        </div>
      )}

      {/* design notes link */}
      <div className="absolute bottom-4 right-4 pointer-events-none">
        <Link
          href="/dream/134-anemone-av/README.md"
          className="text-xs text-white/40 hover:text-white/60 transition-colors pointer-events-auto"
        >
          Design notes
        </Link>
      </div>
    </div>
  );
}
