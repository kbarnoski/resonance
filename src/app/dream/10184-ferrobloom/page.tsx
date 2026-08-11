"use client";

// ─────────────────────────────────────────────────────────────────────────────
// 10184 · Ferrobloom — sing a field of living metal spikes from a pool.
//
//   ONE QUESTION
//   What if your voice were a magnet — and singing raised a field of living
//   metal spikes from a pool of ferrofluid that ripples, peaks, and rings under
//   the pull of your own sound?
//
//   The microphone is the sensor. RMS loudness becomes the effective MAGNETIC
//   FIELD driving the instability: sing louder and the field pushes past the
//   critical threshold so more/taller spikes erupt. Spectral centroid sets spike
//   sharpness / lattice spacing (a brighter voice packs finer, tighter peaks).
//   Onsets fire ripples that radiate across the surface.
//
//   OUTPUT is WebGL2: a fragment-shader height-field h(x,y) on ping-pong float
//   textures, evolved under a Swift–Hohenberg-type Rosensweig (normal-field)
//   instability so a flat interface self-organises into a HEXAGONAL LATTICE OF
//   UP-SPIKES — the classic ferrofluid peaks. Normals are reconstructed from the
//   field and shaded as warm liquid metal (dark bronze, amber/copper/gold
//   speculars, Fresnel rim, a faint slow heat-glow at the tips).
//
//   The field answers in INHARMONIC metal — a singing-bowl partial bank whose
//   brightness + roughness track the field energy, a low ferric drone, and a
//   bright metallic "ting" on every new spike birth. Never silent.
//
//   No mic → a seeded "breathing" LFO drives the field so a muted phone still
//   sees spikes rise and fall (badged). No WebGL2 / no float targets → 8-bit
//   packed height fallback, or audio + notice. See README.
//
//   REFS  Cowley & Rosensweig, "The interfacial stability of a ferromagnetic
//   fluid" (J. Fluid Mech. 30, 1967); Robert Leitl's WebGL ferrofluid experiment
//   (web-technique lineage). This cycle's research direction: metallic sound ↔
//   structure via the Rosensweig instability.
// ─────────────────────────────────────────────────────────────────────────────

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { PrototypeNav } from "../_shared/prototype-nav";
import { createSafeMaster } from "../_shared/visionary/safeMaster";
import { createFerroBackend, SIM_RES, type FerroBackend } from "./webgl";
import { FerroAudio } from "./audio";
import { attachMic, type MicHandle } from "./mic";

// ── Deterministic PRNG (mulberry32, seed 0x10184) — never Math.random ────────
function makeRng(seed: number): () => number {
  let a = seed >>> 0;
  return function next(): number {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

interface OnsetRipple {
  x: number;
  y: number;
  strength: number;
}

type Phase = "idle" | "running";

export default function Ferrobloom() {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const [phase, setPhase] = useState<Phase>("idle");
  const [micOn, setMicOn] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const [webglFailed, setWebglFailed] = useState(false);
  const [showNotes, setShowNotes] = useState(false);

  // long-lived refs (loop state — never React state read inside rAF)
  const backendRef = useRef<FerroBackend | null>(null);
  const rafRef = useRef(0);
  const timeRef = useRef(0);
  const ctxRef = useRef<AudioContext | null>(null);
  const masterRef = useRef<ReturnType<typeof createSafeMaster> | null>(null);
  const audioRef = useRef<FerroAudio | null>(null);
  const micRef = useRef<MicHandle | null>(null);
  const micOnRef = useRef(false);

  // smoothed control signals
  const fieldRef = useRef(-0.1);
  const s2Ref = useRef(0.72);
  const energyRef = useRef(0);
  const glowRef = useRef(0.4);
  const ripplesRef = useRef<OnsetRipple[]>([]);
  const birthAccRef = useRef(0);
  const rng = useRef(makeRng(0x10184));

  // ── Mount: build WebGL backend + start the silent self-demo loop ───────────
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    // seeded initial height noise so hexagons have something to nucleate from
    const seed = new Float32Array(SIM_RES * SIM_RES);
    const r = makeRng(0x10184);
    for (let i = 0; i < seed.length; i++) seed[i] = (r() - 0.5) * 0.3;

    const backend = createFerroBackend(canvas, seed);
    backendRef.current = backend;
    if (!backend.ok) setWebglFailed(true);

    const resize = () => {
      const dpr = Math.min(2, window.devicePixelRatio || 1);
      const w = Math.floor(canvas.clientWidth * dpr);
      const h = Math.floor(canvas.clientHeight * dpr);
      if (canvas.width !== w || canvas.height !== h) {
        canvas.width = w;
        canvas.height = h;
      }
      backend.resize(canvas.width, canvas.height);
    };
    resize();
    window.addEventListener("resize", resize);

    let last = performance.now();
    const frame = (now: number) => {
      const dtReal = Math.min(0.05, (now - last) / 1000);
      last = now;
      timeRef.current += dtReal;
      const t = timeRef.current;

      // ── derive the field either from the mic (sensor) or a seeded LFO ──────
      let targetField: number;
      let targetS2: number;
      let centroid = 900;
      let onset = false;

      if (micOnRef.current && micRef.current) {
        const m = micRef.current.read();
        // RMS loudness → magnetic field strength (past critical = spikes)
        targetField = -0.28 + m.rms * 1.0;
        // brightness → finer lattice (higher centroid = smaller s2 = tighter)
        const cn = Math.min(1, Math.max(0, (m.centroid - 250) / 2600));
        targetS2 = 0.85 - cn * 0.34;
        centroid = m.centroid;
        onset = m.onset;
      } else {
        // seeded "breathing" LFO — crosses the critical threshold both ways
        const wob = 0.06 * Math.sin(t * 0.37 + 1.7);
        targetField = 0.14 + 0.34 * Math.sin(t * 0.85) + wob;
        targetS2 = 0.7 + 0.12 * Math.sin(t * 0.23);
        centroid = 700 + 500 * (0.5 + 0.5 * Math.sin(t * 0.6));
        // seeded auto-onsets so ripples still happen without a mic
        if (rng.current() < dtReal * 0.9) onset = true;
      }

      // smooth toward targets (no abrupt flicker)
      fieldRef.current += (targetField - fieldRef.current) * 0.08;
      s2Ref.current += (targetS2 - s2Ref.current) * 0.05;
      const field = fieldRef.current;

      // field energy: how far past critical we are
      const energyTarget = Math.min(1, Math.max(0, (field + 0.05) / 0.6));
      energyRef.current += (energyTarget - energyRef.current) * 0.06;
      const energy = energyRef.current;
      glowRef.current += (0.35 + energy * 0.6 - glowRef.current) * 0.04;

      // ── onsets → radiating ripples on the surface ─────────────────────────
      if (onset) {
        ripplesRef.current.push({
          x: rng.current(),
          y: rng.current(),
          strength: 0.04 + energy * 0.05,
        });
        if (ripplesRef.current.length > 6) ripplesRef.current.shift();
        // an onset is also a spike-birth event → ting
        audioRef.current?.ting(0.4 + energy * 0.6);
      }
      // age ripples
      const rip = ripplesRef.current;
      for (let i = rip.length - 1; i >= 0; i--) {
        rip[i].strength *= 0.9;
        if (rip[i].strength < 0.004) rip.splice(i, 1);
      }
      const onsetArr: number[] = [];
      for (const o of rip) onsetArr.push(o.x, o.y, o.strength);

      // ── spike births while strongly supercritical → periodic tings ────────
      birthAccRef.current += energy * energy * dtReal * 5.5;
      if (birthAccRef.current >= 1) {
        birthAccRef.current -= 1;
        if (rng.current() < 0.7) audioRef.current?.ting(0.3 + energy * 0.5);
      }

      // ── step the Rosensweig height-field sim + render metal ───────────────
      const b = backendRef.current;
      if (b && b.ok) {
        b.step({
          dt: 0.04,
          substeps: 3,
          field,
          s2: s2Ref.current,
          gQuad: 0.85,
          noise: 0.006,
          time: t,
          onsets: onsetArr,
        });
        b.render({
          time: t,
          heightScale: 0.09 - energy * 0.04,
          glow: glowRef.current,
          energy,
        });
      }

      // ── drive the metallic voice ──────────────────────────────────────────
      audioRef.current?.update(energy, centroid);

      rafRef.current = requestAnimationFrame(frame);
    };
    rafRef.current = requestAnimationFrame(frame);

    return () => {
      cancelAnimationFrame(rafRef.current);
      window.removeEventListener("resize", resize);
      micRef.current?.stop();
      micRef.current = null;
      audioRef.current?.stop();
      audioRef.current = null;
      masterRef.current?.disconnect();
      masterRef.current = null;
      const c = ctxRef.current;
      ctxRef.current = null;
      if (c && c.state !== "closed") void c.close();
      backendRef.current?.destroy();
      backendRef.current = null;
    };
  }, []);

  // ── Start audio (and optionally the mic) from a user gesture ───────────────
  const start = useCallback(async (withMic: boolean) => {
    if (!ctxRef.current) {
      const Ctx: typeof AudioContext =
        window.AudioContext ||
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        (window as any).webkitAudioContext;
      const ctx = new Ctx();
      ctxRef.current = ctx;
      const master = createSafeMaster(ctx, { gain: 0.16 });
      masterRef.current = master;
      const audio = new FerroAudio(ctx, master.input);
      audio.start();
      audioRef.current = audio;
    }
    void ctxRef.current.resume();

    if (withMic) {
      try {
        const handle = await attachMic(ctxRef.current);
        micRef.current = handle;
        micOnRef.current = true;
        setMicOn(true);
        setNotice(null);
      } catch {
        micOnRef.current = false;
        setMicOn(false);
        setNotice(
          "Microphone unavailable — the field is driven by a seeded breathing LFO instead. Spikes still rise and fall; sound still rings.",
        );
      }
    } else {
      setNotice("Muted demo — a seeded breathing LFO drives the field. Grant the mic to sing the spikes yourself.");
    }
    setPhase("running");
  }, []);

  const stop = useCallback(() => {
    micRef.current?.stop();
    micRef.current = null;
    micOnRef.current = false;
    setMicOn(false);
    audioRef.current?.stop();
    audioRef.current = null;
    masterRef.current?.disconnect();
    masterRef.current = null;
    const c = ctxRef.current;
    ctxRef.current = null;
    if (c && c.state !== "closed") void c.close();
    setPhase("idle");
    setNotice(null);
  }, []);

  const packed = backendRef.current?.packed ?? false;
  const sensorLabel = micOn ? "voice (mic)" : "seeded LFO (no mic)";

  return (
    <div className="relative h-screen w-full overflow-hidden bg-background">
      <canvas ref={canvasRef} className="absolute inset-0 h-full w-full" />

      {/* CSS fallback backdrop if WebGL2 is unavailable */}
      {webglFailed && (
        <div
          className="absolute inset-0"
          style={{
            background:
              "radial-gradient(circle at 50% 60%, #3a2410, #1a0f08 60%, #0a0604)",
          }}
        />
      )}

      {/* Header */}
      <div className="pointer-events-none absolute inset-x-0 top-0 flex items-start justify-between p-6">
        <div className="max-w-xl">
          <h1 className="text-2xl font-semibold tracking-tight text-foreground sm:text-3xl">
            Ferrobloom
          </h1>
          <p className="mt-1 text-base text-muted-foreground">
            Sing, and your voice becomes a magnet — raising a field of living
            metal spikes from a pool of ferrofluid that ripples, peaks, and rings
            under the pull of your own sound.
          </p>
        </div>
        <Link
          href="/dream"
          className="pointer-events-auto font-mono text-xs uppercase tracking-[0.18em] text-muted-foreground transition-colors hover:text-foreground"
        >
          ← dream lab
        </Link>
      </div>

      {/* Idle / start */}
      {phase === "idle" && (
        <div className="absolute inset-0 flex flex-col items-center justify-center gap-5 px-8 text-center">
          <p className="max-w-md text-base text-muted-foreground">
            Louder pushes the magnetic field past its critical threshold and more
            spikes erupt; a brighter voice packs them into a finer hexagonal
            lattice; each attack sends a ripple across the metal. The field is
            already breathing on its own — grant the mic to drive it yourself.
          </p>
          <div className="flex flex-wrap items-center justify-center gap-3">
            <button
              onClick={() => void start(true)}
              className="min-h-[44px] rounded-md bg-primary px-6 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90"
            >
              Start microphone
            </button>
            <button
              onClick={() => void start(false)}
              className="min-h-[44px] rounded-md border border-border bg-background/60 px-5 text-sm text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
            >
              Play muted demo
            </button>
          </div>
          <p className="max-w-md text-sm text-muted-foreground">
            Best with headphones. Warm liquid metal, inharmonic bell tones —
            smooth heat-glow, no flashing.
          </p>
          {webglFailed && (
            <p className="max-w-sm text-sm text-destructive">
              WebGL2 is unavailable in this browser — the visual sim can&apos;t
              run, but the audio and controls still work.
            </p>
          )}
        </div>
      )}

      {/* Running HUD */}
      {phase === "running" && (
        <div className="absolute inset-x-0 bottom-0 flex flex-wrap items-center gap-3 p-6">
          <div className="font-mono text-xs uppercase tracking-[0.18em] text-muted-foreground">
            webgl2 · rosensweig height-field
          </div>
          <div
            className={`font-mono text-xs uppercase tracking-[0.18em] ${
              micOn ? "text-primary" : "text-destructive"
            }`}
          >
            {sensorLabel}
          </div>
          {packed && (
            <div className="font-mono text-xs uppercase tracking-[0.18em] text-destructive">
              8-bit packed (no float targets)
            </div>
          )}
          <div className="flex-1" />
          {!micOn && (
            <button
              onClick={() => void start(true)}
              className="min-h-[44px] rounded-md bg-primary px-5 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90"
            >
              Enable microphone
            </button>
          )}
          <button
            onClick={() => setShowNotes(true)}
            className="min-h-[44px] rounded-md border border-border bg-background/60 px-4 text-sm text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
          >
            Design notes
          </button>
          <button
            onClick={stop}
            className="min-h-[44px] rounded-md border border-border bg-background/60 px-4 text-sm text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
          >
            Stop
          </button>
        </div>
      )}

      {/* Degrade / status notice */}
      {phase === "running" && notice && (
        <div className="pointer-events-none absolute inset-x-0 bottom-24 mx-6 max-w-xl">
          <p className="text-sm text-destructive">{notice}</p>
        </div>
      )}

      {/* Design-notes modal */}
      {showNotes && (
        <div
          className="absolute inset-0 z-50 flex items-center justify-center bg-black/50 p-6 backdrop-blur-sm"
          onClick={() => setShowNotes(false)}
        >
          <div
            className="max-h-[80vh] max-w-lg overflow-y-auto rounded-lg border border-border bg-background p-6 text-sm text-muted-foreground shadow-lg"
            onClick={(e) => e.stopPropagation()}
          >
            <h2 className="mb-2 text-lg font-semibold text-foreground">
              How Ferrobloom works
            </h2>
            <p className="mb-3">
              The surface is a height field h(x,y) evolved on ping-pong WebGL2
              textures under a Swift–Hohenberg form of the Rosensweig normal-field
              instability. Below a critical field the flat pool is stable; above
              it, a preferred wavelength (capillary-vs-magnetic balance) is
              amplified and a quadratic term biases UP-spikes, so the surface
              self-organises into a hexagonal lattice of ferrofluid peaks.
            </p>
            <p className="mb-3">
              Your voice is the magnet. RMS loudness sets the control parameter r
              (the field): sing past the threshold and spikes erupt. Spectral
              centroid sets the lattice spacing — brighter voice, finer spikes.
              Onsets inject radiating ripples. No mic? A seeded mulberry32 LFO
              breathes the field so it still lives.
            </p>
            <p className="mb-3">
              The metal answers with an inharmonic singing-bowl partial bank whose
              brightness and roughness track the field energy, a low ferric drone,
              and a bright metallic ting on every spike birth. Never silent.
            </p>
            <p className="text-xs">
              Refs: Cowley &amp; Rosensweig, J. Fluid Mech. 30 (1967); Robert
              Leitl&apos;s WebGL ferrofluid experiment.
            </p>
          </div>
        </div>
      )}

      <PrototypeNav slugs={["10184-ferrobloom"]} />
    </div>
  );
}
