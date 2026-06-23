"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import * as THREE from "three";

import {
  type AudioGraph,
  type Edge,
  NODE_COUNT,
  buildAudioGraph,
  buildEdges,
  buildFrequencies,
  applyFeedbackGain,
  applyTopology,
  applyMasterVolume,
  applyMute,
  injectImpulse,
  readEnergy,
} from "./audio";
import {
  type LorenzState,
  createLorenz,
  stepLorenz,
  normalizeLorenz,
  sampleTrail,
} from "./lorenz";

/*
 * 872 · LIVING TOPOLOGY
 *
 * Cycle 3 of the 820-feedback-ecology thread. A network of high-Q feedback
 * resonators whose coupling topology is no longer static — it is continuously
 * rewired by a Lorenz attractor. Connections strengthen and fade; the
 * small-world graph reorganizes; the sound never repeats. Zero user input is
 * required: the chaotic drift evolves the piece on its own (hands-free demo).
 */

type Phase = "idle" | "running" | "noaudio";

// House palette: deep indigo/violet → warm gold accents.
const NODE_COLORS = [
  0x8b7bff, 0x7c6bff, 0x9d8bff, 0xb39dff, 0xc7a8ff, 0xffd27a, 0xffc24f,
  0xffb347, 0xe8a0ff, 0x6fb8ff, 0x9ad0ff,
].map((h) => new THREE.Color(h));

const ATTRACTOR_COLOR = new THREE.Color(0xffd27a);

// Place nodes on a sphere (Fibonacci sphere for even spread).
function computeNodePositions(radius: number): THREE.Vector3[] {
  const pts: THREE.Vector3[] = [];
  const golden = Math.PI * (3 - Math.sqrt(5));
  for (let i = 0; i < NODE_COUNT; i++) {
    const y = 1 - (i / (NODE_COUNT - 1)) * 2;
    const r = Math.sqrt(Math.max(0, 1 - y * y));
    const theta = golden * i;
    pts.push(
      new THREE.Vector3(
        Math.cos(theta) * r * radius,
        y * radius,
        Math.sin(theta) * r * radius
      )
    );
  }
  return pts;
}

export default function LivingTopologyPage() {
  const mountRef = useRef<HTMLDivElement>(null);
  const audioRef = useRef<AudioGraph | null>(null);
  const edgesRef = useRef<Edge[]>([]);
  const lorenzRef = useRef<LorenzState>(createLorenz());
  const rafRef = useRef<number>(0);
  const energiesRef = useRef<number[]>(new Array(NODE_COUNT).fill(0));
  const liveWeightsRef = useRef<number[]>([]);
  // Latest control values, read inside the rAF loop without re-subscribing.
  const couplingRef = useRef(0.7);
  const driftRef = useRef(1);

  const [phase, setPhase] = useState<Phase>("idle");
  const [muted, setMuted] = useState(false);
  const [volume, setVolume] = useState(0.22);
  const [coupling, setCoupling] = useState(0.7);
  const [drift, setDrift] = useState(1);
  const [showNotes, setShowNotes] = useState(false);
  const [lzReadout, setLzReadout] = useState<LorenzState>({ x: 0, y: 0, z: 0 });

  useEffect(() => {
    couplingRef.current = coupling;
  }, [coupling]);
  useEffect(() => {
    driftRef.current = drift;
  }, [drift]);

  // ── Start audio (inside user gesture) ──────────────────────────────────
  const startAudio = useCallback(async () => {
    if (audioRef.current) return;
    edgesRef.current = buildEdges();
    let graph: AudioGraph;
    try {
      graph = buildAudioGraph(buildFrequencies(), edgesRef.current);
      await graph.ctx.resume();
    } catch {
      setPhase("noaudio");
      return;
    }
    audioRef.current = graph;
    lorenzRef.current = createLorenz({ x: 0.1, y: 0.0, z: 0.0 });

    applyFeedbackGain(graph, 0);
    applyMasterVolume(graph, volume);

    // Gentle 2s ramp so there's no startup blast.
    const rampSteps = 40;
    let step = 0;
    const ramp = setInterval(() => {
      step++;
      applyFeedbackGain(graph, 0.78 * (step / rampSteps));
      if (step >= rampSteps) {
        clearInterval(ramp);
        applyFeedbackGain(graph, 0.78);
      }
    }, 50);

    // Auto-demo: seed all nodes so it sounds + animates within ~1s, no input.
    for (let i = 0; i < NODE_COUNT; i++) {
      setTimeout(() => {
        if (audioRef.current) injectImpulse(audioRef.current, i, 0.55);
      }, 200 + i * 70);
    }

    setPhase("running");
  }, [volume]);

  // ── Volume / mute / impulse handlers ───────────────────────────────────
  const handleVolume = useCallback(
    (v: number) => {
      setVolume(v);
      if (audioRef.current && !muted) applyMasterVolume(audioRef.current, v);
    },
    [muted]
  );

  const handleMute = useCallback(() => {
    if (!audioRef.current) return;
    if (muted) {
      applyMasterVolume(audioRef.current, volume);
      setMuted(false);
    } else {
      applyMute(audioRef.current);
      setMuted(true);
    }
  }, [muted, volume]);

  const seedAll = useCallback(() => {
    const g = audioRef.current;
    if (!g) return;
    for (let i = 0; i < NODE_COUNT; i++) {
      setTimeout(() => {
        if (audioRef.current) injectImpulse(audioRef.current, i, 0.6);
      }, i * 40);
    }
  }, []);

  // ── three.js scene + animation loop ────────────────────────────────────
  useEffect(() => {
    if (phase !== "running") return;
    const mount = mountRef.current;
    if (!mount) return;

    let renderer: THREE.WebGLRenderer;
    try {
      renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
    } catch {
      setPhase("noaudio");
      return;
    }
    const width = mount.clientWidth;
    const height = mount.clientHeight;
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.setSize(width, height);
    renderer.setClearColor(0x05060d, 1);
    mount.appendChild(renderer.domElement);

    const scene = new THREE.Scene();
    scene.fog = new THREE.FogExp2(0x05060d, 0.018);

    const camera = new THREE.PerspectiveCamera(55, width / height, 0.1, 200);
    camera.position.set(0, 0, 26);

    const RADIUS = 8;
    const positions = computeNodePositions(RADIUS);

    // ── Node spheres (glow via additive shells) ──
    const nodeMeshes: THREE.Mesh[] = [];
    const glowMeshes: THREE.Mesh[] = [];
    const nodeGeo = new THREE.SphereGeometry(0.55, 24, 24);
    const glowGeo = new THREE.SphereGeometry(1.0, 20, 20);
    const disposables: Array<{ dispose: () => void }> = [nodeGeo, glowGeo];

    for (let i = 0; i < NODE_COUNT; i++) {
      const mat = new THREE.MeshBasicMaterial({ color: NODE_COLORS[i].clone() });
      const mesh = new THREE.Mesh(nodeGeo, mat);
      mesh.position.copy(positions[i]);
      scene.add(mesh);
      nodeMeshes.push(mesh);
      disposables.push(mat);

      const glowMat = new THREE.MeshBasicMaterial({
        color: NODE_COLORS[i].clone(),
        transparent: true,
        opacity: 0.0,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
      });
      const glow = new THREE.Mesh(glowGeo, glowMat);
      glow.position.copy(positions[i]);
      scene.add(glow);
      glowMeshes.push(glow);
      disposables.push(glowMat);
    }

    // ── Edge lines (one LineSegments, per-vertex color = live weight × energy) ──
    const edges = edgesRef.current;
    const edgePosArr = new Float32Array(edges.length * 2 * 3);
    const edgeColArr = new Float32Array(edges.length * 2 * 3);
    for (let e = 0; e < edges.length; e++) {
      const a = positions[edges[e].from];
      const b = positions[edges[e].to];
      edgePosArr.set([a.x, a.y, a.z, b.x, b.y, b.z], e * 6);
    }
    const edgeGeo = new THREE.BufferGeometry();
    edgeGeo.setAttribute("position", new THREE.BufferAttribute(edgePosArr, 3));
    edgeGeo.setAttribute("color", new THREE.BufferAttribute(edgeColArr, 3));
    const edgeMat = new THREE.LineBasicMaterial({
      vertexColors: true,
      transparent: true,
      opacity: 0.9,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
    });
    const edgeLines = new THREE.LineSegments(edgeGeo, edgeMat);
    scene.add(edgeLines);
    disposables.push(edgeGeo, edgeMat);

    // ── Energy pulses: a Points cloud, one point per edge, riding along it ──
    const pulseGeo = new THREE.BufferGeometry();
    const pulsePos = new Float32Array(edges.length * 3);
    const pulseCol = new Float32Array(edges.length * 3);
    pulseGeo.setAttribute("position", new THREE.BufferAttribute(pulsePos, 3));
    pulseGeo.setAttribute("color", new THREE.BufferAttribute(pulseCol, 3));
    const pulseMat = new THREE.PointsMaterial({
      size: 0.5,
      vertexColors: true,
      transparent: true,
      opacity: 0.95,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
      sizeAttenuation: true,
    });
    const pulsePoints = new THREE.Points(pulseGeo, pulseMat);
    scene.add(pulsePoints);
    disposables.push(pulseGeo, pulseMat);

    // ── Lorenz ghost curve drifting in scene center ──
    const TRAIL_LEN = 600;
    const trailPos = new Float32Array(TRAIL_LEN * 3);
    const trailGeo = new THREE.BufferGeometry();
    trailGeo.setAttribute("position", new THREE.BufferAttribute(trailPos, 3));
    const trailMat = new THREE.LineBasicMaterial({
      color: ATTRACTOR_COLOR.clone(),
      transparent: true,
      opacity: 0.16,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
    });
    const trailLine = new THREE.Line(trailGeo, trailMat);
    scene.add(trailLine);
    disposables.push(trailGeo, trailMat);

    // A small marker bead at the live Lorenz state.
    const beadGeo = new THREE.SphereGeometry(0.3, 16, 16);
    const beadMat = new THREE.MeshBasicMaterial({
      color: ATTRACTOR_COLOR.clone(),
      transparent: true,
      opacity: 0.7,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
    });
    const bead = new THREE.Mesh(beadGeo, beadMat);
    scene.add(bead);
    disposables.push(beadGeo, beadMat);

    // Lorenz coordinate → scene transform (centered, scaled down).
    const LZ_SCALE = 0.16;
    const lzToScene = (p: [number, number, number]): [number, number, number] => [
      p[0] * LZ_SCALE,
      (p[2] - 25) * LZ_SCALE,
      p[1] * LZ_SCALE,
    ];

    const buf = new Uint8Array(256);
    const energies = energiesRef.current;
    const clock = new THREE.Clock();
    let topoTick = 0;
    let readoutTick = 0;

    const handleResize = () => {
      const w = mount.clientWidth;
      const h = mount.clientHeight;
      renderer.setSize(w, h);
      camera.aspect = w / h;
      camera.updateProjectionMatrix();
    };
    const ro = new ResizeObserver(handleResize);
    ro.observe(mount);

    const loop = () => {
      rafRef.current = requestAnimationFrame(loop);
      const g = audioRef.current;
      const dt = Math.min(clock.getDelta(), 0.05);
      const elapsed = clock.elapsedTime;

      // Advance the Lorenz driver. Drift slider scales steps/frame.
      const steps = Math.max(1, Math.round(6 * driftRef.current));
      stepLorenz(lorenzRef.current, 0.005, steps);
      const lz = normalizeLorenz(lorenzRef.current);

      // Rewire the topology from the Lorenz state (~30 Hz is plenty).
      let weights = liveWeightsRef.current;
      topoTick += dt;
      if (g && topoTick >= 0.033) {
        topoTick = 0;
        weights = applyTopology(g, edges, lz, couplingRef.current);
        liveWeightsRef.current = weights;
      }

      // Read per-node RMS energy.
      if (g) {
        for (let i = 0; i < NODE_COUNT; i++) {
          const e = readEnergy(g.analysers[i], buf);
          energies[i] = energies[i] * 0.85 + e * 0.15;
        }
      }

      // Update node visuals from energy.
      for (let i = 0; i < NODE_COUNT; i++) {
        const en = Math.min(1, energies[i] * 3.5);
        const s = 0.7 + en * 1.4;
        nodeMeshes[i].scale.setScalar(s);
        const glow = glowMeshes[i].material as THREE.MeshBasicMaterial;
        glow.opacity = 0.08 + en * 0.5;
        glowMeshes[i].scale.setScalar(1 + en * 1.8);
      }

      // Update edge colors from live weight × energy transfer.
      const col = edgeGeo.getAttribute("color") as THREE.BufferAttribute;
      const colArr = col.array as Float32Array;
      const maxW = 0.32;
      for (let e = 0; e < edges.length; e++) {
        const edge = edges[e];
        const w = (weights[e] ?? 0) / maxW; // 0..1
        const flow = Math.min(1, (energies[edge.from] + energies[edge.to]) * 2);
        const bright = Math.min(1, (0.06 + w * 0.9) * (0.35 + flow * 0.9));
        const c = NODE_COLORS[edge.from];
        const o = e * 6;
        colArr[o] = c.r * bright;
        colArr[o + 1] = c.g * bright;
        colArr[o + 2] = c.b * bright;
        colArr[o + 3] = c.r * bright;
        colArr[o + 4] = c.g * bright;
        colArr[o + 5] = c.b * bright;
      }
      col.needsUpdate = true;

      // Energy pulses traveling along active edges.
      const pPos = pulseGeo.getAttribute("position") as THREE.BufferAttribute;
      const pPosArr = pPos.array as Float32Array;
      const pCol = pulseGeo.getAttribute("color") as THREE.BufferAttribute;
      const pColArr = pCol.array as Float32Array;
      for (let e = 0; e < edges.length; e++) {
        const edge = edges[e];
        const a = positions[edge.from];
        const b = positions[edge.to];
        const w = (weights[e] ?? 0) / maxW;
        const flow = Math.min(1, energies[edge.from] * 3.5);
        const speed = 0.25 + flow * 0.9;
        const t = ((elapsed * speed + e * 0.137) % 1 + 1) % 1;
        const o = e * 3;
        pPosArr[o] = a.x + (b.x - a.x) * t;
        pPosArr[o + 1] = a.y + (b.y - a.y) * t;
        pPosArr[o + 2] = a.z + (b.z - a.z) * t;
        const vis = Math.min(1, w * flow * 1.6);
        const c = NODE_COLORS[edge.from];
        pColArr[o] = c.r * vis;
        pColArr[o + 1] = c.g * vis;
        pColArr[o + 2] = c.b * vis;
      }
      pPos.needsUpdate = true;
      pCol.needsUpdate = true;

      // Lorenz ghost curve: sample forward and write into the trail buffer.
      const trail = sampleTrail(lorenzRef.current, 0.005, TRAIL_LEN);
      const tAttr = trailGeo.getAttribute("position") as THREE.BufferAttribute;
      const tArr = tAttr.array as Float32Array;
      for (let i = 0; i < TRAIL_LEN; i++) {
        const p = lzToScene(trail[i]);
        tArr[i * 3] = p[0];
        tArr[i * 3 + 1] = p[1];
        tArr[i * 3 + 2] = p[2];
      }
      tAttr.needsUpdate = true;
      const head = lzToScene(trail[0]);
      bead.position.set(head[0], head[1], head[2]);

      // Slowly orbiting camera.
      const ang = elapsed * 0.08;
      camera.position.set(
        Math.cos(ang) * 26,
        Math.sin(elapsed * 0.05) * 6,
        Math.sin(ang) * 26
      );
      camera.lookAt(0, 0, 0);

      // Throttled HUD readout of the driver.
      readoutTick += dt;
      if (readoutTick >= 0.2) {
        readoutTick = 0;
        setLzReadout({ x: lz.x, y: lz.y, z: lz.z });
      }

      renderer.render(scene, camera);
    };
    rafRef.current = requestAnimationFrame(loop);

    return () => {
      cancelAnimationFrame(rafRef.current);
      ro.disconnect();
      for (const d of disposables) d.dispose();
      renderer.dispose();
      if (renderer.domElement.parentNode === mount) {
        mount.removeChild(renderer.domElement);
      }
    };
  }, [phase]);

  // ── Audio teardown on unmount ──────────────────────────────────────────
  useEffect(() => {
    return () => {
      cancelAnimationFrame(rafRef.current);
      const g = audioRef.current;
      if (g) {
        applyMute(g);
        setTimeout(() => {
          g.ctx.close().catch(() => undefined);
        }, 150);
        audioRef.current = null;
      }
    };
  }, []);

  // ── Render ─────────────────────────────────────────────────────────────
  return (
    <main className="relative flex h-dvh w-full flex-col overflow-hidden bg-[#05060d]">
      <header className="relative z-10 flex flex-col gap-1 p-4 pb-2">
        <div className="flex items-center justify-between">
          <h1 className="font-mono text-2xl font-bold text-white">
            Living Topology
          </h1>
          <div className="flex gap-2">
            <button
              type="button"
              onClick={() => setShowNotes((v) => !v)}
              className="min-h-[44px] rounded px-4 py-2.5 font-mono text-base text-white/75 ring-1 ring-white/15 transition hover:text-white"
            >
              {showNotes ? "close notes" : "design notes"}
            </button>
            <Link
              href="/dream"
              className="flex items-center font-mono text-base text-white/55 transition hover:text-white/75"
            >
              ← dream lab
            </Link>
          </div>
        </div>
        <p className="text-base text-white/75">
          A network of feedback resonators whose coupling topology rewires itself
          — steered by a Lorenz attractor drifting at the center. It evolves on
          its own and never repeats.
        </p>
      </header>

      {showNotes && (
        <div className="relative z-20 mx-4 mb-2 max-w-3xl rounded-lg bg-black/60 p-4 font-mono text-base text-white/75 ring-1 ring-white/10 backdrop-blur-sm">
          <p className="mb-2">
            <strong className="text-white/95">The idea:</strong> Cycle 3 of the
            feedback-ecology thread. In cycle 1 (820) the small-world coupling
            matrix was static. Here it is continuously driven by a Lorenz
            attractor (σ=10, ρ=28, β=8/3): its evolving (x,y,z) state modulates
            global coupling, which shortcut edges are active, and which node-pairs
            couple most strongly. The ring backbone stays present, so the network
            never goes silent — but the topology reorganizes over minutes.
          </p>
          <p className="mb-2">
            <strong className="text-white/95">Ear-safety:</strong> every path ends
            in a DynamicsCompressor brick-wall limiter (−8 dB, ratio 20) → master
            gain (default 0.22) → output. Self-feedback is hard-clamped below the
            divergence point; coupling is hard-clamped. Panic mute is always live.
          </p>
          <p className="text-white/55">
            Refs: Edward Lorenz, &ldquo;Deterministic Nonperiodic Flow&rdquo;
            (1963); 2026 work in <em>Chaos, Solitons &amp; Fractals</em> on
            synchronization of coupled Lorenz oscillators on Watts-Strogatz
            small-world networks; David Tudor&apos;s <em>Rainforest</em> and
            Toshimaru Nakamura&apos;s no-input mixing as feedback-instrument
            lineage.
          </p>
        </div>
      )}

      <div className="relative flex-1 overflow-hidden">
        <div ref={mountRef} className="h-full w-full" />

        {/* Lorenz driver HUD */}
        {phase === "running" && (
          <div className="pointer-events-none absolute left-4 top-4 z-10 rounded bg-black/40 px-3 py-2 font-mono text-base text-white/75 ring-1 ring-white/10 backdrop-blur-sm">
            <div className="text-violet-300">lorenz driver</div>
            <div>x {lzReadout.x.toFixed(2)}</div>
            <div>y {lzReadout.y.toFixed(2)}</div>
            <div>z {lzReadout.z.toFixed(2)}</div>
          </div>
        )}

        {phase === "idle" && (
          <div className="absolute inset-0 z-20 flex flex-col items-center justify-center gap-5 bg-[#05060d]/75 backdrop-blur-sm">
            <div className="max-w-sm space-y-3 px-6 text-center">
              <p className="text-base text-white/75">
                Eleven feedback resonators tuned to the overtone series on A1.
                Their coupling graph is rewired live by a chaotic Lorenz
                attractor — strengthening and fading connections so the drone
                reorganizes and never repeats. Hands-free: it evolves with no
                input. Use headphones.
              </p>
              <p className="font-mono text-base text-violet-300/90">
                The gold ghost-curve at the center is the chaotic driver.
              </p>
            </div>
            <button
              type="button"
              onClick={startAudio}
              className="min-h-[44px] rounded-full bg-violet-500/20 px-8 py-3 font-mono text-xl font-semibold text-violet-300 ring-1 ring-violet-400/40 transition hover:bg-violet-500/30 active:scale-95"
            >
              Awaken the Topology
            </button>
          </div>
        )}

        {phase === "noaudio" && (
          <div className="absolute inset-0 z-20 flex items-center justify-center p-6">
            <p className="max-w-sm text-center text-base text-rose-300">
              Audio or WebGL is unavailable in this browser. Try Chrome, Firefox,
              or Safari with audio enabled and hardware acceleration on.
            </p>
          </div>
        )}
      </div>

      {phase === "running" && (
        <div className="relative z-10 flex flex-col gap-3 border-t border-white/10 bg-black/40 px-4 py-3 backdrop-blur-sm">
          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={seedAll}
              className="min-h-[44px] rounded-full bg-white/5 px-4 py-2.5 font-mono text-base text-white/75 ring-1 ring-white/10 transition hover:bg-white/10"
            >
              seed network
            </button>
            <div className="ml-auto">
              <button
                type="button"
                onClick={handleMute}
                className={`min-h-[44px] rounded-full px-4 py-2.5 font-mono text-base ring-1 transition ${
                  muted
                    ? "bg-rose-500/25 text-rose-300 ring-rose-400/40"
                    : "bg-white/5 text-white/75 ring-white/10 hover:bg-white/10"
                }`}
              >
                {muted ? "unmute" : "panic mute"}
              </button>
            </div>
          </div>

          <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
            <Slider
              label="coupling"
              hint="global network density"
              value={coupling}
              min={0}
              max={1}
              step={0.01}
              onChange={setCoupling}
              accent="accent-violet-400"
            />
            <Slider
              label="chaos drift"
              hint="how fast the topology rewires"
              value={drift}
              min={0.2}
              max={3}
              step={0.05}
              onChange={setDrift}
              accent="accent-amber-400"
            />
            <Slider
              label="master volume"
              hint="always safe"
              value={volume}
              min={0}
              max={0.6}
              step={0.01}
              onChange={handleVolume}
              accent="accent-emerald-400"
            />
          </div>

          <p className="font-mono text-base text-white/55">
            Tap &ldquo;seed network&rdquo; to perturb · the Lorenz driver reshapes
            the graph on its own
          </p>
        </div>
      )}
    </main>
  );
}

interface SliderProps {
  label: string;
  hint: string;
  value: number;
  min: number;
  max: number;
  step: number;
  onChange: (v: number) => void;
  accent: string;
}

function Slider({
  label,
  hint,
  value,
  min,
  max,
  step,
  onChange,
  accent,
}: SliderProps) {
  const pct = Math.round(((value - min) / (max - min)) * 100);
  return (
    <div className="flex flex-col gap-1">
      <div className="flex items-baseline justify-between">
        <span className="font-mono text-base text-white/80">{label}</span>
        <span className="font-mono text-base text-white/55">{pct}%</span>
      </div>
      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(e) => onChange(parseFloat(e.target.value))}
        className={`w-full cursor-pointer ${accent}`}
      />
      <span className="font-mono text-base text-white/55">{hint}</span>
    </div>
  );
}
