"use client";

// ─────────────────────────────────────────────────────────────────────────────
// 15328-bloomwork — a recording that GROWS itself into a sunflower.
//
// Pick one of Karel's real piano recordings. As it plays, every note in its
// analyzed note-roll places a new seed (a "primordium") on a phyllotactic
// spiral: the i-th note lands at angle i·137.507° (the golden angle) and eases
// out from the meristem to Vogel's radius c·√i. Pitch-class sets each seed's
// hue around the full chromatic wheel; velocity sets its size and brightness.
// A single Bézier thread runs through the seeds in the order they were played —
// the literal melodic contour of the piece, bowed by each interval. By the end
// you are looking at the whole recording bloomed into one readable Fibonacci
// seed-head. Audio → safeMaster → speakers; the shimmer is driven by its
// analyser tap.
//
// This is GROWTH, not a pre-seeded field: the bloom accretes in real time from
// his own melody. (The static golden-angle packing already lives in the lab as
// 3424-attending — the fresh move here is real-catalog-driven accretion +
// Bézier contour + chroma readback.)
// ─────────────────────────────────────────────────────────────────────────────

import { useCallback, useEffect, useRef, useState } from "react";
import * as THREE from "three";
import { COLLECTIONS, loadRealTrackBuffer } from "../_shared/welcomeHome";
import { loadTrackAnalysis, type TrackNote } from "../_shared/trackAnalysis";
import {
  createSafeMaster,
  type SafeMaster,
} from "../_shared/visionary/safeMaster";

type Phase = "idle" | "loading" | "playing" | "error";

// Vogel's golden angle ≈ 137.507°, in radians. The heart of phyllotaxis.
const GOLDEN_ANGLE = Math.PI * (3 - Math.sqrt(5));
const MAX_SEEDS = 4000; // cap; longer note-rolls stop emitting past this
const BEZIER_SEG = 6; // samples per melodic spoke

interface Seed {
  i: number; // phyllotaxis index (emission order)
  angle: number; // i · GOLDEN_ANGLE
  midi: number;
  vel: number; // 0..1
  hue: number; // 0..1 (pitch-class / 12)
  size: number; // world-units disc radius
  r: number; // current eased radius
  x: number;
  y: number;
  bornT: number; // playback seconds at birth
}

export default function BloomworkPage() {
  const [phase, setPhase] = useState<Phase>("idle");
  const [started, setStarted] = useState(false);
  const [webglOk, setWebglOk] = useState(true);
  const [showNotes, setShowNotes] = useState(false);

  const firstId = COLLECTIONS[0].tracks[0].id;
  const firstTitle = COLLECTIONS[0].tracks[0].title;
  const [activeId, setActiveId] = useState<string>(firstId);
  const [title, setTitle] = useState<string>(firstTitle);
  const [keyName, setKeyName] = useState<string>("");
  const [seedCount, setSeedCount] = useState(0);
  const phaseRef = useRef<Phase>("idle");
  useEffect(() => {
    phaseRef.current = phase;
  }, [phase]);

  // steering
  const [growthRate, setGrowthRate] = useState(0.06); // radial ease speed
  const [tightness, setTightness] = useState(0.34); // Vogel's c (spiral scale)
  const paramsRef = useRef({ growthRate, tightness });
  useEffect(() => {
    paramsRef.current = { growthRate, tightness };
  }, [growthRate, tightness]);

  // audio + timeline refs
  const ctxRef = useRef<AudioContext | null>(null);
  const safeRef = useRef<SafeMaster | null>(null);
  const srcRef = useRef<AudioBufferSourceNode | null>(null);
  const startedAtRef = useRef(0);
  const notesRef = useRef<TrackNote[]>([]);
  const emittedRef = useRef(0);
  const seedsRef = useRef<Seed[]>([]);
  const mountRef = useRef<HTMLDivElement | null>(null);

  const stopSource = useCallback(() => {
    const s = srcRef.current;
    if (s) {
      try {
        s.onended = null;
        s.stop();
      } catch {
        /* already stopped */
      }
      srcRef.current = null;
    }
  }, []);

  // Load + start one real track; reset the bloom so it grows from scratch.
  const play = useCallback(
    async (id: string) => {
      stopSource();
      setActiveId(id);
      setPhase("loading");
      setSeedCount(0);

      let ctx = ctxRef.current;
      if (!ctx) {
        const Ctx: typeof AudioContext =
          window.AudioContext ||
          (window as unknown as { webkitAudioContext: typeof AudioContext })
            .webkitAudioContext;
        ctx = new Ctx();
        ctxRef.current = ctx;
        safeRef.current = createSafeMaster(ctx);
      }
      await ctx.resume().catch(() => {});

      let buffer: AudioBuffer;
      let notes: TrackNote[] = [];
      try {
        const [audio, analysis] = await Promise.all([
          loadRealTrackBuffer(ctx, id),
          loadTrackAnalysis(id),
        ]);
        buffer = audio.buffer;
        setTitle(audio.title);
        setKeyName(analysis?.key_signature ?? "");
        notes = analysis?.notes ?? [];
      } catch {
        setPhase("error");
        return;
      }

      // Fallback: if analysis has no note-roll, derive a coarse onset timeline
      // from the buffer so the bloom still grows from the real audio.
      if (notes.length === 0) notes = onsetsFromBuffer(buffer);

      notesRef.current = notes;
      emittedRef.current = 0;
      seedsRef.current = [];

      const src = ctx.createBufferSource();
      src.buffer = buffer;
      src.connect(safeRef.current!.input);
      src.onended = () => {
        if (srcRef.current === src) {
          srcRef.current = null;
          setPhase("idle");
        }
      };
      srcRef.current = src;
      startedAtRef.current = ctx.currentTime;
      src.start();
      setPhase("playing");
    },
    [stopSource],
  );

  // First gesture: mount the three scene, then grow the selected track.
  const handleStart = useCallback(() => {
    if (typeof window === "undefined") return;
    // WebGL capability probe.
    try {
      const test = document.createElement("canvas");
      const gl =
        test.getContext("webgl2") || test.getContext("webgl");
      if (!gl) {
        setWebglOk(false);
        return;
      }
    } catch {
      setWebglOk(false);
      return;
    }
    setStarted(true);
    void play(activeId);
  }, [activeId, play]);

  // Full teardown on unmount.
  useEffect(
    () => () => {
      stopSource();
      safeRef.current?.disconnect();
      ctxRef.current?.close().catch(() => {});
    },
    [stopSource],
  );

  // ── three.js scene + growth loop ───────────────────────────────────────────
  useEffect(() => {
    if (!started) return;
    const mount = mountRef.current;
    if (!mount) return;

    let renderer: THREE.WebGLRenderer;
    try {
      renderer = new THREE.WebGLRenderer({ antialias: true, alpha: false });
    } catch {
      setWebglOk(false);
      return;
    }

    const width = mount.clientWidth || window.innerWidth;
    const height = mount.clientHeight || window.innerHeight;

    const scene = new THREE.Scene();
    scene.background = new THREE.Color(0x05060b);

    const camera = new THREE.PerspectiveCamera(50, width / height, 0.1, 500);
    camera.position.set(0, 0, 40);
    camera.lookAt(0, 0, 0);

    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    renderer.setSize(width, height);
    mount.appendChild(renderer.domElement);

    // Instanced seeds — the required WebGL surface. One glowing disc per note.
    const discGeo = new THREE.CircleGeometry(1, 20);
    const discMat = new THREE.MeshBasicMaterial({
      vertexColors: true,
      transparent: true,
      opacity: 0.95,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
    });
    const seedMesh = new THREE.InstancedMesh(discGeo, discMat, MAX_SEEDS);
    seedMesh.count = 0;
    seedMesh.instanceColor = new THREE.InstancedBufferAttribute(
      new Float32Array(MAX_SEEDS * 3),
      3,
    );
    scene.add(seedMesh);

    // Bright inner cores for a luminous center to each seed.
    const coreGeo = new THREE.CircleGeometry(0.42, 14);
    const coreMat = new THREE.MeshBasicMaterial({
      color: 0xffffff,
      transparent: true,
      opacity: 0.5,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
    });
    const coreMesh = new THREE.InstancedMesh(coreGeo, coreMat, MAX_SEEDS);
    coreMesh.count = 0;
    scene.add(coreMesh);

    // The melodic contour: one Bézier thread through the seeds in play order.
    const MAX_PTS = 1 + MAX_SEEDS * BEZIER_SEG;
    const linePos = new Float32Array(MAX_PTS * 3);
    const lineCol = new Float32Array(MAX_PTS * 3);
    const lineGeo = new THREE.BufferGeometry();
    lineGeo.setAttribute("position", new THREE.BufferAttribute(linePos, 3));
    lineGeo.setAttribute("color", new THREE.BufferAttribute(lineCol, 3));
    lineGeo.setDrawRange(0, 0);
    const lineMat = new THREE.LineBasicMaterial({
      vertexColors: true,
      transparent: true,
      opacity: 0.55,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
    });
    const contour = new THREE.Line(lineGeo, lineMat);
    scene.add(contour);

    // Meristem glow — the growing point at the heart of the seed-head.
    const meristemGeo = new THREE.CircleGeometry(2.2, 32);
    const meristemMat = new THREE.MeshBasicMaterial({
      color: 0xffe8b0,
      transparent: true,
      opacity: 0.0,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
    });
    const meristem = new THREE.Mesh(meristemGeo, meristemMat);
    meristem.position.z = -0.2;
    scene.add(meristem);

    const dummy = new THREE.Object3D();
    const tmpColor = new THREE.Color();
    const P0 = new THREE.Vector2();
    const P1 = new THREE.Vector2();
    const CTRL = new THREE.Vector2();

    const freqData = new Uint8Array(
      safeRef.current ? safeRef.current.analyser.frequencyBinCount : 512,
    );

    let rafId = 0;
    let rot = 0;
    let camZ = 40;

    const onResize = () => {
      const w = mount.clientWidth || window.innerWidth;
      const h = mount.clientHeight || window.innerHeight;
      camera.aspect = w / h;
      camera.updateProjectionMatrix();
      renderer.setSize(w, h);
    };
    window.addEventListener("resize", onResize);

    const draw = () => {
      rafId = requestAnimationFrame(draw);
      const { growthRate, tightness } = paramsRef.current;
      const ctx = ctxRef.current;
      const seeds = seedsRef.current;
      const notes = notesRef.current;

      // Emit new primordia for every note whose onset has passed.
      if (phaseRef.current === "playing" && ctx) {
        const t = ctx.currentTime - startedAtRef.current;
        let emitted = emittedRef.current;
        while (
          emitted < notes.length &&
          seeds.length < MAX_SEEDS &&
          notes[emitted].time <= t
        ) {
          const n = notes[emitted];
          const vel = Math.max(0.05, Math.min(1, n.velocity / 127));
          seeds.push({
            i: emitted,
            angle: emitted * GOLDEN_ANGLE,
            midi: n.midi,
            vel,
            hue: (((n.midi % 12) + 12) % 12) / 12,
            size: 0.16 + vel * 0.42,
            r: 0, // born at the meristem, eases outward
            x: 0,
            y: 0,
            bornT: t,
          });
          emitted++;
        }
        if (emitted !== emittedRef.current) {
          emittedRef.current = emitted;
          setSeedCount(emitted);
        }
      }

      // Audio-reactive shimmer from the safe-master analyser tap.
      let rms = 0;
      const analyser = safeRef.current?.analyser;
      if (analyser) {
        analyser.getByteFrequencyData(freqData);
        let sum = 0;
        for (let k = 0; k < freqData.length; k++) sum += freqData[k];
        rms = sum / (freqData.length * 255); // ~0..1
      }
      const shimmer = 0.82 + rms * 0.7;
      discMat.color.setScalar(shimmer);
      meristemMat.opacity = 0.12 + rms * 0.55;
      meristem.scale.setScalar(1 + rms * 0.6);

      rot += 0.0016 + rms * 0.004;
      contour.rotation.z = rot;
      seedMesh.rotation.z = rot;
      coreMesh.rotation.z = rot;

      // Update every seed: ease its radius toward Vogel's c·√i, write matrices.
      const n = seeds.length;
      let maxR = 4;
      const ease = Math.min(0.5, Math.max(0.01, growthRate));
      for (let k = 0; k < n; k++) {
        const s = seeds[k];
        const target = tightness * Math.sqrt(s.i);
        s.r += (target - s.r) * ease;
        s.x = s.r * Math.cos(s.angle);
        s.y = s.r * Math.sin(s.angle);
        if (s.r > maxR) maxR = s.r;

        // young seeds swell in as they settle
        const age = Math.min(1, (s.r / (target + 0.001)) * 1.2);
        const sz = s.size * (0.35 + 0.65 * age);
        dummy.position.set(s.x, s.y, 0);
        dummy.scale.setScalar(sz);
        dummy.updateMatrix();
        seedMesh.setMatrixAt(k, dummy.matrix);

        dummy.scale.setScalar(sz * 0.9);
        dummy.updateMatrix();
        coreMesh.setMatrixAt(k, dummy.matrix);

        // chroma hue → RGB, velocity → lightness/brightness
        tmpColor.setHSL(s.hue, 0.85, 0.42 + s.vel * 0.28);
        seedMesh.setColorAt(k, tmpColor);
      }
      seedMesh.count = n;
      coreMesh.count = n;
      seedMesh.instanceMatrix.needsUpdate = true;
      coreMesh.instanceMatrix.needsUpdate = true;
      if (seedMesh.instanceColor) seedMesh.instanceColor.needsUpdate = true;

      // Rebuild the Bézier contour thread from current seed positions each frame
      // so it stays attached as seeds glide outward / the spiral is re-steered.
      let pi = 0;
      if (n > 0) {
        // start at the innermost seed
        linePos[0] = seeds[0].x;
        linePos[1] = seeds[0].y;
        linePos[2] = 0;
        writeLineColor(lineCol, 0, tmpColor, seeds[0].hue, seeds[0].vel, n, 0);
        pi = 1;
        for (let k = 1; k < n; k++) {
          const a = seeds[k - 1];
          const b = seeds[k];
          P0.set(a.x, a.y);
          P1.set(b.x, b.y);
          // control point bowed perpendicular by the melodic interval
          const dx = P1.x - P0.x;
          const dy = P1.y - P0.y;
          const len = Math.hypot(dx, dy) || 1;
          const px = -dy / len;
          const py = dx / len;
          const interval = b.midi - a.midi;
          const bow = Math.max(-3.5, Math.min(3.5, interval * 0.14));
          CTRL.set((P0.x + P1.x) / 2 + px * bow, (P0.y + P1.y) / 2 + py * bow);
          for (let seg = 1; seg <= BEZIER_SEG; seg++) {
            const u = seg / BEZIER_SEG;
            const iu = 1 - u;
            const x =
              iu * iu * P0.x + 2 * iu * u * CTRL.x + u * u * P1.x;
            const y =
              iu * iu * P0.y + 2 * iu * u * CTRL.y + u * u * P1.y;
            linePos[pi * 3] = x;
            linePos[pi * 3 + 1] = y;
            linePos[pi * 3 + 2] = 0;
            writeLineColor(lineCol, pi, tmpColor, b.hue, b.vel, n, k);
            pi++;
          }
        }
        lineGeo.attributes.position.needsUpdate = true;
        lineGeo.attributes.color.needsUpdate = true;
      }
      lineGeo.setDrawRange(0, pi);

      // Dolly the camera to keep the whole bloom framed as it grows.
      const targetZ = Math.max(
        16,
        Math.min(240, (maxR * 1.25) / Math.tan((camera.fov * Math.PI) / 360)),
      );
      camZ += (targetZ - camZ) * 0.03;
      camera.position.z = camZ;

      renderer.render(scene, camera);
    };
    rafId = requestAnimationFrame(draw);

    return () => {
      window.removeEventListener("resize", onResize);
      cancelAnimationFrame(rafId);
      discGeo.dispose();
      discMat.dispose();
      coreGeo.dispose();
      coreMat.dispose();
      lineGeo.dispose();
      lineMat.dispose();
      meristemGeo.dispose();
      meristemMat.dispose();
      renderer.dispose();
      if (renderer.domElement.parentNode) {
        renderer.domElement.parentNode.removeChild(renderer.domElement);
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [started]);

  // ── UI chrome (tokens only — art palette lives inside the canvas) ───────────
  return (
    <main className="relative h-dvh w-full overflow-hidden bg-background text-foreground">
      <div ref={mountRef} className="absolute inset-0 h-full w-full" />

      {/* pre-start / degrade overlay */}
      {!started && (
        <div className="absolute inset-0 flex items-center justify-center px-6">
          <div className="max-w-lg text-center">
            <p className="font-mono text-xs uppercase tracking-[0.18em] text-muted-foreground">
              Phyllotactic growth · full chromatic
            </p>
            <h1 className="mt-3 text-2xl font-semibold tracking-tight sm:text-3xl">
              Bloomwork
            </h1>
            <p className="mt-3 text-base leading-relaxed text-muted-foreground">
              One of Karel&rsquo;s piano recordings grows itself into a living
              sunflower: every note it plays places a seed at the golden angle,
              until the whole take has bloomed into one Fibonacci spiral.
            </p>

            {!webglOk ? (
              <p className="mt-6 text-base text-destructive">
                WebGL isn&rsquo;t available in this browser, so the bloom
                can&rsquo;t render. Try a WebGL-capable browser.
              </p>
            ) : (
              <div className="mt-6 flex flex-col items-center gap-3">
                <label className="sr-only" htmlFor="track-pre">
                  Track
                </label>
                <select
                  id="track-pre"
                  value={activeId}
                  onChange={(e) => setActiveId(e.target.value)}
                  className="min-h-[44px] w-full max-w-xs rounded-md border border-border bg-background/60 px-4 text-sm text-foreground focus:border-primary focus:outline-none"
                >
                  {COLLECTIONS.map((c) => (
                    <optgroup key={c.name} label={c.name}>
                      {c.tracks.map((t) => (
                        <option key={t.id} value={t.id}>
                          {t.title}
                        </option>
                      ))}
                    </optgroup>
                  ))}
                </select>
                <button
                  type="button"
                  onClick={handleStart}
                  className="min-h-[44px] rounded-md bg-primary px-6 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90"
                >
                  Grow
                </button>
                <button
                  type="button"
                  onClick={() => setShowNotes(true)}
                  className="text-sm text-muted-foreground underline-offset-4 hover:text-foreground hover:underline"
                >
                  Read the design notes
                </button>
              </div>
            )}
          </div>
        </div>
      )}

      {/* live HUD */}
      {started && (
        <>
          <div className="pointer-events-none absolute inset-x-0 top-5 flex flex-col items-center gap-1 text-center">
            <div className="text-base font-medium text-foreground">{title}</div>
            <div className="font-mono text-xs uppercase tracking-[0.18em] text-muted-foreground">
              {keyName ? `${keyName} · ` : ""}Karel Barnoski
            </div>
            {phase === "loading" && (
              <div className="mt-1 animate-pulse font-mono text-xs uppercase tracking-[0.18em] text-muted-foreground">
                loading
              </div>
            )}
            {phase === "error" && (
              <div className="mt-1 text-sm text-destructive">
                Couldn&rsquo;t load that track — pick another below.
              </div>
            )}
            {phase !== "error" && (
              <div className="mt-1 font-mono text-xs tracking-[0.14em] text-muted-foreground">
                {seedCount} seeds
              </div>
            )}
          </div>

          {/* controls */}
          <div className="absolute inset-x-0 bottom-0 flex flex-col items-center gap-3 bg-gradient-to-t from-background/80 to-transparent px-4 pb-5 pt-10">
            <div className="flex w-full max-w-xl flex-col gap-3 sm:flex-row sm:items-center sm:justify-center">
              <label className="flex flex-1 items-center gap-2 font-mono text-xs uppercase tracking-[0.14em] text-muted-foreground">
                Growth
                <input
                  type="range"
                  min={0.015}
                  max={0.2}
                  step={0.005}
                  value={growthRate}
                  onChange={(e) => setGrowthRate(parseFloat(e.target.value))}
                  className="h-1 flex-1 cursor-pointer accent-primary"
                />
              </label>
              <label className="flex flex-1 items-center gap-2 font-mono text-xs uppercase tracking-[0.14em] text-muted-foreground">
                Spiral
                <input
                  type="range"
                  min={0.18}
                  max={0.6}
                  step={0.01}
                  value={tightness}
                  onChange={(e) => setTightness(parseFloat(e.target.value))}
                  className="h-1 flex-1 cursor-pointer accent-primary"
                />
              </label>
            </div>
            <div className="flex flex-wrap items-center justify-center gap-3">
              <label className="sr-only" htmlFor="track-live">
                Track
              </label>
              <select
                id="track-live"
                value={activeId}
                onChange={(e) => void play(e.target.value)}
                className="min-h-[44px] rounded-md border border-border bg-background/60 px-4 text-sm text-foreground focus:border-primary focus:outline-none"
              >
                {COLLECTIONS.map((c) => (
                  <optgroup key={c.name} label={c.name}>
                    {c.tracks.map((t) => (
                      <option key={t.id} value={t.id}>
                        {t.title}
                      </option>
                    ))}
                  </optgroup>
                ))}
              </select>
              {phase === "idle" || phase === "error" ? (
                <button
                  type="button"
                  onClick={() => void play(activeId)}
                  className="min-h-[44px] rounded-md bg-primary px-6 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90"
                >
                  Grow again
                </button>
              ) : null}
              <button
                type="button"
                onClick={() => setShowNotes(true)}
                className="min-h-[44px] rounded-md border border-border bg-background/60 px-4 text-sm text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
              >
                Design notes
              </button>
            </div>
          </div>
        </>
      )}

      {/* design-notes modal */}
      {showNotes && (
        <div
          className="absolute inset-0 z-20 flex items-center justify-center bg-black/50 p-6 backdrop-blur-sm"
          onClick={() => setShowNotes(false)}
        >
          <div
            className="max-w-lg rounded-lg border border-border bg-background p-6 shadow-lg"
            onClick={(e) => e.stopPropagation()}
          >
            <h2 className="text-2xl font-semibold tracking-tight">Bloomwork</h2>
            <div className="mt-4 space-y-3 text-sm leading-relaxed text-muted-foreground">
              <p>
                Phyllotaxis — the spiral packing of a sunflower&rsquo;s seeds —
                isn&rsquo;t a fixed template. It&rsquo;s the residue of{" "}
                <em>growth</em>: new primordia bud one at a time at the plant&rsquo;s
                meristem and are pushed outward as later ones crowd in behind
                them. Bloomwork borrows that: it doesn&rsquo;t draw a finished
                spiral, it grows one, live, from Karel&rsquo;s own playing.
              </p>
              <p>
                Each track&rsquo;s analyzed note-roll is the emission timeline.
                The i-th note it plays plants a seed at angle{" "}
                <span className="font-mono">i · 137.507°</span> (the golden
                angle) and radius <span className="font-mono">c · √i</span>{" "}
                (Vogel&rsquo;s 1979 model), born at the center and easing
                outward. Pitch-class sets the hue around the full chromatic wheel
                (12 semitones → 12 colors); velocity sets each seed&rsquo;s size
                and brightness.
              </p>
              <p>
                A single Bézier thread runs through the seeds in the order they
                were played — the literal melodic contour — each spoke bowed
                perpendicular by its interval. The two sliders steer the living
                pattern: <em>Growth</em> is how fast a new seed settles to its
                radius; <em>Spiral</em> is Vogel&rsquo;s c, re-tightening the
                whole head as you drag.
              </p>
              <p>
                Audio is Karel&rsquo;s real recording, routed through the shared
                ear-safety master; the center glow and shimmer follow its
                analyser.
              </p>
              <p className="text-xs">
                References: <em>Music Visualization Using Dynamic Phyllotactic
                Patterns</em> (Archives of Design Research, 2026); H. Vogel,
                &ldquo;A better way to construct the sunflower head&rdquo;
                (Mathematical Biosciences, 1979).
              </p>
              <p className="font-mono text-xs">
                input: catalog playback · output: three.js · technique:
                phyllotactic-growth · palette: full-chromatic
              </p>
            </div>
            <button
              type="button"
              onClick={() => setShowNotes(false)}
              className="mt-5 min-h-[44px] w-full rounded-md border border-border bg-background/60 px-4 text-sm text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
            >
              Close
            </button>
          </div>
        </div>
      )}
    </main>
  );
}

// Per-vertex color for the contour thread: destination seed's chroma hue,
// brighter for velocity and for the most recently grown segments.
function writeLineColor(
  out: Float32Array,
  idx: number,
  tmp: THREE.Color,
  hue: number,
  vel: number,
  total: number,
  k: number,
) {
  const recency = total > 1 ? k / (total - 1) : 1; // 0 old → 1 newest
  const light = 0.16 + vel * 0.16 + recency * 0.24;
  tmp.setHSL(hue, 0.8, Math.min(0.7, light));
  out[idx * 3] = tmp.r;
  out[idx * 3 + 1] = tmp.g;
  out[idx * 3 + 2] = tmp.b;
}

// Fallback timeline if a track has no analyzed note-roll: coarse onset picking
// on the real audio so the bloom still grows from Karel's recording (never a
// synth). Envelope-follower peak picking on a mono mixdown.
function onsetsFromBuffer(buffer: AudioBuffer): TrackNote[] {
  const data = buffer.getChannelData(0);
  const sr = buffer.sampleRate;
  const hop = Math.floor(sr * 0.03); // 30 ms frames
  const win = hop;
  const env: number[] = [];
  for (let i = 0; i + win < data.length; i += hop) {
    let sum = 0;
    for (let j = 0; j < win; j++) sum += data[i + j] * data[i + j];
    env.push(Math.sqrt(sum / win));
  }
  const notes: TrackNote[] = [];
  let prev = 0;
  for (let f = 1; f < env.length - 1; f++) {
    const rise = env[f] - prev;
    if (env[f] > 0.02 && rise > 0.012 && env[f] >= env[f + 1]) {
      const t = (f * hop) / sr;
      // pseudo-pitch from where the energy sits; keeps hue varied but real-timed
      const midi = 48 + Math.round((env[f] * 900) % 36);
      notes.push({
        midi,
        time: t,
        duration: 0.3,
        velocity: Math.min(127, Math.round(env[f] * 400)),
      });
    }
    prev = env[f];
  }
  return notes;
}
