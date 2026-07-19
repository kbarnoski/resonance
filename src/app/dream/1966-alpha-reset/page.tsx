"use client";

// ════════════════════════════════════════════════════════════════════════════
// 1966 — Alpha Reset
//
// THE QUESTION: What if SOUND could reset the phase of your visual cortex, so
// each note snaps a drifting, incoherent form-constant field into momentary
// crystalline coherence, then it drifts apart again?
//
// Sound phase-resets the ~10 Hz alpha rhythm of visual cortex (Romei et al.
// 2012); the audiovisual temporal-binding window scales with individual alpha
// (Cecere et al. 2015); all Klüver form constants are one pattern seen through
// the retina→V1 log-polar map (Bressloff–Cowan). Here, a spectral-flux onset
// detector snaps the phase offsets of four form-constant layers into alignment
// on every note — crystallise, then dissolve into "visual snow".
//
// See README.md / the "Read the design notes" modal.
// ════════════════════════════════════════════════════════════════════════════

import { useCallback, useEffect, useRef, useState } from "react";
import * as THREE from "three";
import { FRAG, VERT } from "./shader";
import { AudioEngine } from "./audio";
import { README_TEXT } from "./readme-text";

type Phase = "idle" | "running";

// prefers-reduced-motion (SSR-safe)
function reducedMotion(): boolean {
  if (typeof window === "undefined" || typeof window.matchMedia !== "function") return false;
  try {
    return window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  } catch {
    return false;
  }
}

// deterministic PRNG for the per-layer drift rates (no Math.random)
function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const lerp = (a: number, b: number, t: number) => a + (b - a) * t;

export default function Page() {
  const mountRef = useRef<HTMLDivElement | null>(null);
  const engineRef = useRef<AudioEngine | null>(null);
  const rafRef = useRef<number | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  const [phase, setPhase] = useState<Phase>("idle");
  const [showNotes, setShowNotes] = useState(false);
  const [dragActive, setDragActive] = useState(false);
  const [webglError, setWebglError] = useState(false);
  const [audioError, setAudioError] = useState(false);
  const [decodeError, setDecodeError] = useState(false);
  const [sourceLabel, setSourceLabel] = useState("generative carrier");
  const [coherenceHud, setCoherenceHud] = useState(0);

  // ── the render loop lives in a stable callback via refs ────────────────────
  const startVisuals = useCallback((engine: AudioEngine) => {
    const mount = mountRef.current;
    if (!mount) return;

    const reduced = reducedMotion();

    // three.js fullscreen quad
    let renderer: THREE.WebGLRenderer | null = null;
    try {
      renderer = new THREE.WebGLRenderer({ antialias: true, alpha: false });
    } catch {
      renderer = null;
    }
    if (!renderer) {
      setWebglError(true);
      return; // audio still runs; just no visuals
    }
    setWebglError(false);
    renderer.setPixelRatio(Math.min(2, window.devicePixelRatio || 1));
    renderer.setClearColor(new THREE.Color(0x04030a), 1);
    mount.appendChild(renderer.domElement);
    renderer.domElement.style.width = "100%";
    renderer.domElement.style.height = "100%";
    renderer.domElement.style.display = "block";

    const scene = new THREE.Scene();
    const cam = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
    cam.position.z = 1;

    const uniforms = {
      uAspect: { value: new THREE.Vector2(1, 1) },
      uTime: { value: 0 },
      uPhase: { value: 0 },
      uOff: { value: new THREE.Vector4(0, 0, 0, 0) },
      uWarp: { value: 0 },
      uZoom: { value: 1 },
      uFreq: { value: 5 },
      uFold: { value: reduced ? 3 : 6 },
      uDetail: { value: 0.5 },
      uSat: { value: 0.4 },
      uCoherence: { value: 0.2 },
      uGain: { value: 0.0 },
      uCA: { value: 0.0 },
      uReduced: { value: reduced ? 1 : 0 },
    };

    const mat = new THREE.ShaderMaterial({ vertexShader: VERT, fragmentShader: FRAG, uniforms });
    const geo = new THREE.PlaneGeometry(2, 2);
    const quad = new THREE.Mesh(geo, mat);
    scene.add(quad);

    const resize = () => {
      const w = mount.clientWidth || 1;
      const h = mount.clientHeight || 1;
      renderer?.setSize(w, h, false);
      if (w >= h) uniforms.uAspect.value.set(w / h, 1);
      else uniforms.uAspect.value.set(1, h / w);
    };
    resize();
    const ro = new ResizeObserver(resize);
    ro.observe(mount);

    // ── phase-reset controller state ─────────────────────────────────────────
    const NL = 4;
    const off = [0, 0, 0, 0];
    // slightly different drift rates -> incoherent smear when unforced
    const drng = mulberry32(0x9e3779b1);
    const driftRate = [0, 0, 0, 0].map(() => (drng() * 2 - 1) * 0.85);
    const driftScale = reduced ? 0.4 : 1.0;
    const pullTau = 0.16; // decay of the alignment pull
    const pullPeak = reduced ? 9 : 20; // onset -> alignment strength (1/s)
    let alignPull = 0;

    // smoothed audio-driven values (mutated per frame, no re-render)
    const s = { bass: 0, mid: 0, high: 0, loud: 0 };
    let phaseBase = 0;
    let bright = 0; // slew-limited global brightness envelope
    let coherence = 0.2;
    let hudAccum = 0;
    let lastHud = 0;

    let prevT = performance.now() / 1000;

    const frame = () => {
      rafRef.current = requestAnimationFrame(frame);
      const now = performance.now() / 1000;
      let dt = now - prevT;
      prevT = now;
      if (dt > 0.1) dt = 0.1; // clamp after tab-away
      if (dt <= 0) dt = 1 / 60;

      const res = engine.analyse();
      const b = res.bands;
      // smooth bands
      s.bass = lerp(s.bass, b.bass, 0.15);
      s.mid = lerp(s.mid, b.mid, 0.15);
      s.high = lerp(s.high, b.high, 0.15);
      s.loud = lerp(s.loud, b.loud, 0.12);

      // ── onset -> alignment pull spike (the "reset") ───────────────────────
      if (res.onset) {
        alignPull = Math.max(alignPull, pullPeak * (0.5 + 0.5 * res.onsetStrength));
      }
      alignPull *= Math.exp(-dt / pullTau);

      // slow common phase drift (tunnel motion)
      phaseBase += (reduced ? 0.09 : 0.22) * dt * (0.6 + 0.8 * s.mid);

      // per-layer: diverge by drift, converge toward their centroid by pull
      let mean = 0;
      for (let i = 0; i < NL; i++) mean += off[i];
      mean /= NL;
      for (let i = 0; i < NL; i++) {
        off[i] += driftRate[i] * driftScale * dt;
        off[i] += (mean - off[i]) * Math.min(1, alignPull * dt);
      }

      // coherence = 1 - normalized spread of the offsets
      let mn = off[0];
      let mx = off[0];
      for (let i = 1; i < NL; i++) {
        mn = Math.min(mn, off[i]);
        mx = Math.max(mx, off[i]);
      }
      const spread = mx - mn;
      const targetCoh = Math.max(0, 1 - spread / (Math.PI * 0.9));
      coherence = lerp(coherence, targetCoh, 0.25);

      // ── band -> uniform mapping (neural gain) ─────────────────────────────
      uniforms.uWarp.value = s.bass * 1.6;
      uniforms.uZoom.value = 1 + s.bass * 0.9;
      uniforms.uFreq.value = 4 + s.mid * 7;
      uniforms.uFold.value = (reduced ? 3 : 5) + Math.round(s.high * (reduced ? 2 : 7));
      uniforms.uDetail.value = 0.3 + s.high * 1.4;
      uniforms.uSat.value = Math.min(1, 0.25 + s.loud * 1.1) * (0.4 + 0.6 * coherence);
      uniforms.uCA.value = (reduced ? 0.01 : 0.025) * (0.3 + 0.7 * s.high);

      // GLOBAL brightness: slew-limited so it can't modulate faster than ~3 Hz.
      // NOT coupled to onsets — the snap is spatial only (photosensitive safety).
      const brightTarget = 0.5 + 0.42 * Math.min(1, s.loud * 1.3);
      bright = lerp(bright, brightTarget, 1 - Math.exp(-dt / 0.25));

      uniforms.uOff.value.set(off[0], off[1], off[2], off[3]);
      uniforms.uPhase.value = phaseBase;
      uniforms.uCoherence.value = coherence;
      uniforms.uGain.value = bright;
      uniforms.uTime.value = now;

      renderer?.render(scene, cam);

      // throttled HUD update (~5 Hz) so React isn't churned each frame
      hudAccum += dt;
      if (hudAccum - lastHud > 0.2) {
        lastHud = hudAccum;
        setCoherenceHud(coherence);
      }
    };
    rafRef.current = requestAnimationFrame(frame);

    // teardown closure stored on the engine object for unmount
    return () => {
      if (rafRef.current !== null) cancelAnimationFrame(rafRef.current);
      rafRef.current = null;
      ro.disconnect();
      geo.dispose();
      mat.dispose();
      if (renderer) {
        renderer.dispose();
        if (renderer.domElement.parentNode === mount) mount.removeChild(renderer.domElement);
      }
    };
  }, []);

  const teardownVisualsRef = useRef<null | (() => void)>(null);

  const begin = useCallback(async () => {
    if (phase === "running") return;
    let engine: AudioEngine;
    try {
      engine = new AudioEngine();
    } catch {
      setAudioError(true);
      return;
    }
    engineRef.current = engine;
    try {
      await engine.start();
    } catch {
      setAudioError(true);
      engine.dispose();
      engineRef.current = null;
      return;
    }
    setAudioError(false);
    setPhase("running");
    teardownVisualsRef.current = startVisuals(engine) ?? null;
  }, [phase, startVisuals]);

  const handleFile = useCallback(async (file: File | undefined) => {
    const engine = engineRef.current;
    if (!engine || !file) return;
    try {
      const buf = await file.arrayBuffer();
      await engine.loadFile(buf);
      setDecodeError(false);
      setSourceLabel(file.name);
    } catch {
      // decode failure -> notice + keep the carrier running
      setDecodeError(true);
      engine.useCarrier();
      setSourceLabel("generative carrier");
    }
  }, []);

  const onDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      setDragActive(false);
      const f = e.dataTransfer.files?.[0];
      if (f) void handleFile(f);
    },
    [handleFile],
  );

  // ── unmount teardown ───────────────────────────────────────────────────────
  useEffect(() => {
    return () => {
      if (rafRef.current !== null) cancelAnimationFrame(rafRef.current);
      if (teardownVisualsRef.current) teardownVisualsRef.current();
      if (engineRef.current) engineRef.current.dispose();
      engineRef.current = null;
    };
  }, []);

  const running = phase === "running";

  return (
    <div className="relative h-dvh w-full overflow-hidden bg-background text-foreground">
      {/* the shader canvas mounts here */}
      <div ref={mountRef} className="absolute inset-0" aria-hidden />

      {/* drag-drop overlay (only while running, no file dialog open) */}
      {running && (
        <div
          className="absolute inset-0"
          onDragOver={(e) => {
            e.preventDefault();
            setDragActive(true);
          }}
          onDragLeave={() => setDragActive(false)}
          onDrop={onDrop}
        >
          {dragActive && (
            <div className="pointer-events-none absolute inset-0 flex items-center justify-center bg-black/50 backdrop-blur-sm">
              <p className="rounded-lg border border-primary bg-background/80 px-6 py-4 text-base text-foreground">
                Drop an audio file to drive the reset
              </p>
            </div>
          )}
        </div>
      )}

      {/* ── idle / begin screen ─────────────────────────────────────────────── */}
      {!running && (
        <div className="absolute inset-0 flex items-center justify-center p-6">
          <div className="max-w-lg text-center">
            <h1 className="text-2xl font-semibold tracking-tight sm:text-3xl">Alpha Reset</h1>
            <p className="mt-4 text-base leading-relaxed text-muted-foreground">
              Sound phase-resets your visual cortex. Four hallucinatory form constants drift out
              of registration into visual snow — and each note in the music snaps them back into a
              crisp, iridescent mandala. Rhythmic music holds it coherent; silence lets it dissolve.
            </p>
            {audioError && (
              <p className="mt-4 text-base text-destructive">
                This browser could not open an audio context. Visuals may still run, but there is no
                sound.
              </p>
            )}
            <button
              type="button"
              onClick={begin}
              className="mt-8 inline-flex min-h-[44px] items-center justify-center rounded-md bg-primary px-6 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90"
            >
              Begin
            </button>
            <p className="mt-4 text-sm text-muted-foreground">
              Starts a generative carrier automatically — or add your own audio once running.
            </p>
          </div>
        </div>
      )}

      {/* ── running chrome ──────────────────────────────────────────────────── */}
      {running && (
        <>
          {/* top-left status */}
          <div className="pointer-events-none absolute left-4 top-4 select-none">
            <p className="text-sm text-muted-foreground">
              Source: <span className="text-foreground">{sourceLabel}</span>
            </p>
            <p className="mt-1 text-sm text-muted-foreground">
              Coherence:{" "}
              <span className="text-foreground">{(coherenceHud * 100).toFixed(0)}%</span>
            </p>
          </div>

          {/* top-right controls */}
          <div className="absolute right-4 top-4 flex flex-col items-end gap-2">
            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              className="inline-flex min-h-[44px] items-center justify-center rounded-md border border-border bg-background/60 px-4 text-sm text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
            >
              Load audio file
            </button>
            <input
              ref={fileInputRef}
              type="file"
              accept="audio/*"
              className="hidden"
              onChange={(e) => void handleFile(e.target.files?.[0])}
            />
            {decodeError && (
              <p className="max-w-[15rem] text-right text-sm text-destructive">
                Could not decode that file. Still running the generative carrier.
              </p>
            )}
            {webglError && (
              <p className="max-w-[15rem] text-right text-sm text-destructive">
                WebGL / three.js is unavailable, so the visuals are disabled. Audio still plays.
              </p>
            )}
          </div>

          {/* bottom-right: design notes affordance */}
          <button
            type="button"
            onClick={() => setShowNotes(true)}
            className="absolute bottom-4 right-4 inline-flex min-h-[44px] items-center justify-center rounded-md border border-border bg-background/60 px-4 text-sm text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
          >
            Read the design notes
          </button>
        </>
      )}

      {/* ── design-notes modal ──────────────────────────────────────────────── */}
      {showNotes && (
        <div
          className="absolute inset-0 z-10 flex items-center justify-center bg-black/50 p-6 backdrop-blur-sm"
          onClick={() => setShowNotes(false)}
        >
          <div
            className="max-h-[80dvh] max-w-lg overflow-y-auto rounded-lg border border-border bg-background p-6 shadow-lg"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-start justify-between gap-4">
              <h2 className="text-xl font-semibold tracking-tight">Design notes</h2>
              <button
                type="button"
                onClick={() => setShowNotes(false)}
                className="inline-flex min-h-[44px] items-center justify-center rounded-md border border-border bg-background/60 px-4 text-sm text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
              >
                Close
              </button>
            </div>
            <p className="mt-4 whitespace-pre-wrap text-sm leading-relaxed text-muted-foreground">
              {README_TEXT}
            </p>
          </div>
        </div>
      )}
    </div>
  );
}
