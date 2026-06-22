"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";

import {
  applyCoupling,
  applyCouplingWeights,
  applyFeedbackGain,
  applyMasterVolume,
  applyMute,
  applyTimbre,
  buildAudioEngine,
  buildEdges,
  buildNodes,
  injectImpulse,
  MAX_COUPLING,
  NODE_COUNT,
  readEnergy,
  ROOT_HZ,
  SCALE_PRESETS,
  type AudioNodes,
  type Edge,
  type ResonatorNode,
} from "./audio";
import {
  createHebbian,
  createLorenz,
  lorenzToModulation,
  stepHebbian,
  stepLorenz,
  type HebbianState,
  type LorenzState,
} from "./evolution";
import { NetworkRenderer } from "./renderer";

/*
 * 847 · FEEDBACK ECOLOGY II
 *
 * Cycle-2 of 820 (`820-feedback-ecology`). 820's own README queued this:
 * "add Lorenz-attractor coupling weights that drift over time."
 *
 * The 820 resonator network now drives its OWN topology over minutes — a
 * Lorenz attractor weathers the global coupling / self-feedback / timbre, and
 * Hebbian edges strengthen-or-die — rendered on raw WebGL2 with ping-pong FBO
 * feedback trails. No user input required: it's a long-form self-running
 * instrument that is different at minute 5 than at minute 0.
 */

type Phase = "idle" | "running" | "noaudio";

const SCALE_NAME = "overtone";
// Lorenz drift speed multiplier (1 ≈ minutes-long weather; higher = faster).
const DRIFT_SPEED = 1;

export default function FeedbackEcologyIIPage() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const audioRef = useRef<AudioNodes | null>(null);
  const nodesRef = useRef<ResonatorNode[]>([]);
  const edgesRef = useRef<Edge[]>([]);
  const rendererRef = useRef<NetworkRenderer | null>(null);
  const rafRef = useRef<number>(0);
  const lorenzRef = useRef<LorenzState>(createLorenz());
  const hebbRef = useRef<HebbianState | null>(null);
  const edgeIntensityRef = useRef<Float32Array>(new Float32Array(0));
  const startedAtRef = useRef<number>(0);
  const elapsedRef = useRef<number>(0);

  const [phase, setPhase] = useState<Phase>("idle");
  const [muted, setMuted] = useState(false);
  const [volume, setVolume] = useState(0.25);
  const [showNotes, setShowNotes] = useState(false);
  const [webglFailed, setWebglFailed] = useState(false);
  const [elapsed, setElapsed] = useState(0);

  // Build the static graph once.
  const buildGraph = useCallback(() => {
    const freqs = (SCALE_PRESETS[SCALE_NAME] ?? SCALE_PRESETS.overtone).slice(
      0,
      NODE_COUNT
    );
    nodesRef.current = buildNodes(freqs);
    edgesRef.current = buildEdges();
    hebbRef.current = createHebbian(edgesRef.current.length);
    edgeIntensityRef.current = new Float32Array(edgesRef.current.length);
  }, []);

  // ── Start ────────────────────────────────────────────────────────────────

  const startAudio = useCallback(async () => {
    if (!nodesRef.current.length) buildGraph();
    const freqs = nodesRef.current.map((n) => n.freq);
    let audio: AudioNodes;
    try {
      audio = buildAudioEngine(freqs, edgesRef.current);
      await audio.ctx.resume();
    } catch {
      setPhase("noaudio");
      return;
    }
    audioRef.current = audio;
    lorenzRef.current = createLorenz();
    startedAtRef.current = performance.now();

    // Gentle 2s start ramp (inherited from 820): low coupling + self-feedback.
    applyFeedbackGain(audio, 0.0);
    applyCoupling(audio, edgesRef.current, 0.0);
    applyMasterVolume(audio, volume);

    const rampSteps = 40;
    let step = 0;
    const ramp = window.setInterval(() => {
      step++;
      const t = step / rampSteps;
      applyFeedbackGain(audio, 0.45 * t * 0.7);
      applyCoupling(audio, edgesRef.current, 0.12 * t * 0.6);
      if (step >= rampSteps) {
        window.clearInterval(ramp);
        // Seed all nodes so the ecology starts alive; the autonomous
        // Lorenz/Hebbian loop takes over from here.
        for (let i = 0; i < NODE_COUNT; i++) {
          window.setTimeout(() => {
            if (audioRef.current) injectImpulse(audioRef.current, i);
          }, i * 80);
        }
      }
    }, 50);

    setPhase("running");
  }, [volume, buildGraph]);

  // ── Mute / volume ──────────────────────────────────────────────────────────

  const handleVolume = useCallback(
    (val: number) => {
      setVolume(val);
      if (audioRef.current && !muted) applyMasterVolume(audioRef.current, val);
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

  // ── Optional: tap a node to perturb (nice-to-have, NOT primary input) ──────

  const handleCanvasClick = useCallback(
    (
      e:
        | React.MouseEvent<HTMLCanvasElement>
        | React.TouchEvent<HTMLCanvasElement>
    ) => {
      if (phase !== "running" || !audioRef.current || !canvasRef.current) return;
      const rect = canvasRef.current.getBoundingClientRect();
      let clientX: number, clientY: number;
      if ("touches" in e) {
        const t = e.touches[0] ?? e.changedTouches[0];
        if (!t) return;
        clientX = t.clientX;
        clientY = t.clientY;
      } else {
        clientX = e.clientX;
        clientY = e.clientY;
      }
      const px = (clientX - rect.left) / rect.width;
      const py = (clientY - rect.top) / rect.height;
      let best = -1;
      let bestDist = 0.12;
      for (let i = 0; i < nodesRef.current.length; i++) {
        const n = nodesRef.current[i];
        const d = Math.hypot(n.x - px, n.y - py);
        if (d < bestDist) {
          bestDist = d;
          best = i;
        }
      }
      if (best >= 0) injectImpulse(audioRef.current, best);
    },
    [phase]
  );

  // ── Main loop: Lorenz drift + Hebbian edges + WebGL2 render ────────────────

  useEffect(() => {
    if (phase !== "running") return;
    const canvas = canvasRef.current;
    if (!canvas) return;

    const gl = canvas.getContext("webgl2", {
      alpha: false,
      antialias: false,
      premultipliedAlpha: false,
    });

    let renderer: NetworkRenderer | null = null;
    if (gl) {
      try {
        renderer = new NetworkRenderer(
          gl,
          NODE_COUNT,
          edgesRef.current.length
        );
        rendererRef.current = renderer;
      } catch {
        setWebglFailed(true);
        renderer = null;
      }
    } else {
      setWebglFailed(true);
    }

    let W = 0;
    let H = 0;
    const resize = () => {
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      W = canvas.offsetWidth;
      H = canvas.offsetHeight;
      canvas.width = Math.max(1, Math.floor(W * dpr));
      canvas.height = Math.max(1, Math.floor(H * dpr));
      renderer?.resize(canvas.width, canvas.height);
    };
    resize();
    const ro = new ResizeObserver(resize);
    ro.observe(canvas);

    const buf = new Uint8Array(256);
    const freqs = nodesRef.current.map((n) => n.freq);
    let lastSeed = performance.now();
    let lastUiUpdate = performance.now();

    const loop = () => {
      rafRef.current = requestAnimationFrame(loop);
      const audio = audioRef.current;
      const nodes = nodesRef.current;
      const edges = edgesRef.current;
      const hebb = hebbRef.current;
      if (!audio || !hebb) return;

      // 1. Update per-node energy from analysers.
      for (let i = 0; i < nodes.length; i++) {
        const eNow = readEnergy(audio.analysers[i], buf);
        nodes[i].energy = nodes[i].energy * 0.88 + eNow * 0.12;
      }

      // 2. Lorenz attractor drift → global modulation (the "weather").
      const L = lorenzRef.current;
      stepLorenz(L, DRIFT_SPEED);
      const mod = lorenzToModulation(L);
      applyFeedbackGain(audio, mod.selfFeedback);
      applyTimbre(audio, freqs, mod.qScale, mod.detuneCents);
      renderer?.pushLorenz(L);

      // 3. Hebbian adaptive edges evolve, then drive the coupling gains.
      stepHebbian(hebb, edges, nodes, 1);
      applyCouplingWeights(audio, edges, hebb.weights, mod.coupling);

      // 4. Autonomous seeding: every ~5.5s, gently kick the lowest-energy node
      //    so the ecology never dies — the Lorenz/Hebbian dynamics shape it.
      const now = performance.now();
      if (now - lastSeed > 5500) {
        lastSeed = now;
        let lowest = 0;
        for (let i = 1; i < nodes.length; i++) {
          if (nodes[i].energy < nodes[lowest].energy) lowest = i;
        }
        injectImpulse(audio, lowest);
      }

      // 5. WebGL2 render — edge draw intensity = Hebbian weight × signal flow
      //    × global coupling, so links visibly strengthen and die.
      if (renderer) {
        const ei = edgeIntensityRef.current;
        const couplingNorm = Math.min(mod.coupling / MAX_COUPLING, 1);
        for (let e = 0; e < edges.length; e++) {
          const a = nodes[edges[e].from];
          const b = nodes[edges[e].to];
          const flow = Math.min((a.energy + b.energy) * 0.5, 1);
          ei[e] = Math.min(
            (0.05 + flow * 0.7) * hebb.weights[e] * (0.3 + couplingNorm * 0.7),
            1
          );
        }
        renderer.render(nodes, edges, ei, L.nz);
      }

      // Throttled UI elapsed-time update.
      if (now - lastUiUpdate > 1000) {
        lastUiUpdate = now;
        const secs = (now - startedAtRef.current) / 1000;
        elapsedRef.current = secs;
        setElapsed(secs);
      }
    };

    rafRef.current = requestAnimationFrame(loop);

    return () => {
      cancelAnimationFrame(rafRef.current);
      ro.disconnect();
      renderer?.dispose();
      rendererRef.current = null;
    };
  }, [phase]);

  // ── Build graph on mount so idle state has a layout ────────────────────────

  useEffect(() => {
    buildGraph();
  }, [buildGraph]);

  // ── Cleanup on unmount ─────────────────────────────────────────────────────

  useEffect(() => {
    return () => {
      cancelAnimationFrame(rafRef.current);
      rendererRef.current?.dispose();
      const audio = audioRef.current;
      if (audio) {
        applyMute(audio);
        window.setTimeout(() => {
          audio.ctx.close().catch(() => undefined);
        }, 200);
      }
    };
  }, []);

  const mins = Math.floor(elapsed / 60);
  const secs = Math.floor(elapsed % 60);

  return (
    <main className="relative flex h-dvh w-full flex-col overflow-hidden bg-[#05060d]">
      {/* Header */}
      <header className="relative z-10 flex flex-col gap-1 p-4 pb-2">
        <div className="flex items-center justify-between">
          <h1 className="font-mono text-2xl font-bold text-white">
            Feedback Ecology II
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
          A self-running feedback network whose topology evolves on its own — a
          Lorenz attractor weathers the coupling while Hebbian edges strengthen
          or die. Minute 5 is not minute 0.
        </p>
      </header>

      {/* Design notes */}
      {showNotes && (
        <div className="relative z-20 mx-4 mb-2 max-h-[60vh] overflow-y-auto rounded-lg bg-black/60 p-4 font-mono text-base text-white/75 ring-1 ring-white/10 backdrop-blur-sm">
          <p className="mb-2">
            <strong className="text-white/90">Cycle-2 of 820.</strong> Inherits
            820&apos;s ear-safe engine wholesale: {NODE_COUNT} coupled high-Q
            BiquadFilter → DelayNode → feedback-GainNode resonators on a
            small-world graph, root {ROOT_HZ} Hz. The new layer makes the network
            drive its OWN topology — no user input required.
          </p>
          <p className="mb-2">
            <strong className="text-white/90">Lorenz weather.</strong> A Lorenz
            attractor (σ=10, ρ=28, β=8/3) is integrated every frame. Its x drives
            global coupling (sweeping the network through bifurcations: isolated
            pings ↔ entrainment ↔ roaring drone), y drives the edge-of-chaos
            self-feedback, z drives a slow timbral/register modulation. It never
            settles, so the instrument weathers over minutes.
          </p>
          <p className="mb-2">
            <strong className="text-white/90">Hebbian edges.</strong> Each edge
            has a live weight: when both endpoints are energetic the edge
            strengthens; idle edges decay toward a floor. The graph literally
            rewires itself — watch links brighten and fade. All of this passes
            through 820&apos;s hard clamps (coupling ≤ {MAX_COUPLING}, feedback ≤
            0.88) so ear-safety is preserved.
          </p>
          <p className="mb-2">
            <strong className="text-white/90">Render.</strong> Raw WebGL2 (no
            three.js, no Canvas2D): additive point-sprite node blobs, GPU edge
            lines whose brightness ∝ live weight × flow, a ping-pong FBO
            feedback-trail accumulation so energy leaves luminous decaying
            trails, and a faint Lorenz attractor trace as visible background
            weather.
          </p>
          <p className="mb-2">
            <strong className="text-white/90">Ear-safety.</strong> Brick-wall
            DynamicsCompressor limiter before master (default 0.25); gentle 2 s
            start ramp; AudioContext only after the explicit gesture below; panic
            mute always visible.
          </p>
          <p className="text-white/55">
            Refs: E. N. Lorenz, &ldquo;Deterministic Nonperiodic Flow,&rdquo;
            J. Atmos. Sci. 20 (1963), 130&ndash;141. Adaptive / time-varying
            pulse-coupled oscillator networks (Hebbian &ldquo;fire together,
            wire together&rdquo; edge plasticity). Inherited lineage: David
            Tudor, <em>Rainforest</em>/<em>Pulsers</em> feedback ecosystems;
            Toshimaru Nakamura no-input mixing board.
          </p>
        </div>
      )}

      {/* Canvas */}
      <div className="relative flex-1 overflow-hidden">
        <canvas
          ref={canvasRef}
          className="h-full w-full cursor-crosshair"
          onClick={handleCanvasClick}
          onTouchStart={handleCanvasClick}
        />

        {/* WebGL failure notice — audio keeps running */}
        {webglFailed && phase === "running" && (
          <div className="absolute left-4 top-4 z-20 max-w-xs rounded-lg bg-black/70 p-3 ring-1 ring-rose-400/30">
            <p className="text-base text-rose-300">
              WebGL2 is unavailable here, so the visuals are disabled — but the
              audio ecology is still running. The sound is the point; put on
              headphones.
            </p>
          </div>
        )}

        {/* Elapsed weathering readout */}
        {phase === "running" && (
          <div className="pointer-events-none absolute right-4 top-4 z-10 rounded-md bg-black/40 px-3 py-2 font-mono text-base text-white/55 ring-1 ring-white/10">
            weathering · {mins}:{secs.toString().padStart(2, "0")}
          </div>
        )}

        {/* Idle overlay */}
        {phase === "idle" && (
          <div className="absolute inset-0 z-20 flex flex-col items-center justify-center gap-5 bg-[#05060d]/75 backdrop-blur-sm">
            <div className="max-w-md space-y-3 px-6 text-center">
              <p className="text-base text-white/75">
                Eight resonators feed each other through a small-world graph. A
                Lorenz attractor slowly drifts the coupling through bifurcations
                while Hebbian edges strengthen-or-die. It runs itself — let it
                weather for minutes and it will not repeat.
              </p>
              <p className="font-mono text-base text-violet-300/80">
                No input needed. Use headphones.
              </p>
            </div>
            <button
              type="button"
              onClick={startAudio}
              className="min-h-[44px] rounded-full bg-violet-500/20 px-8 py-3 font-mono text-xl font-semibold text-violet-300 ring-1 ring-violet-400/40 transition hover:bg-violet-500/30 active:scale-95"
            >
              Awaken the Ecology
            </button>
          </div>
        )}

        {/* No audio notice */}
        {phase === "noaudio" && (
          <div className="absolute inset-0 z-20 flex items-center justify-center p-6">
            <p className="max-w-sm text-center text-base text-rose-300">
              Web Audio is unavailable in this browser. Try Chrome, Firefox, or
              Safari with audio permissions enabled.
            </p>
          </div>
        )}
      </div>

      {/* Controls */}
      {phase === "running" && (
        <div className="relative z-10 flex flex-col gap-3 border-t border-white/10 bg-black/40 px-4 py-3 backdrop-blur-sm">
          <div className="flex flex-wrap items-center gap-3">
            <span className="font-mono text-base text-white/55">
              self-running · autonomous Lorenz + Hebbian drift
            </span>
            <div className="ml-auto flex items-center gap-3">
              <label className="flex items-center gap-2 font-mono text-base text-white/80">
                <span>master</span>
                <input
                  type="range"
                  min={0}
                  max={0.3}
                  step={0.01}
                  value={volume}
                  onChange={(e) => handleVolume(parseFloat(e.target.value))}
                  className="w-32 cursor-pointer accent-emerald-400"
                  aria-label="master volume"
                />
              </label>
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
          <p className="font-mono text-base text-white/55">
            Tapping a node still perturbs it — but no input is required; the
            network shapes itself.
          </p>
        </div>
      )}
    </main>
  );
}
