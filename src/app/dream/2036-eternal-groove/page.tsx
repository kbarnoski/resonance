"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { N_LAYERS, hann, wrapOct, RissetRhythmEngine } from "./audio";

// ---------------------------------------------------------------------------
// Tuning
// ---------------------------------------------------------------------------
const MAX_SPEED = 0.34; // octaves / second at full sweep
const INNER_R = 34; // px — radius of the innermost (slowest) ring position
const OUTER_R = 200; // px — radius of the outermost (fastest) ring position
const REV_PER_BEAT = 0.25; // visual spin: quarter turn per beat
const FLASH_HALFLIFE = 0.12; // s

// Warm-craft palette — lives ONLY in the art layer (ink-on-paper / aged brass).
const BRASS_DIM: [number, number, number] = [92, 74, 46]; // #5c4a2e
const BRASS_HOT: [number, number, number] = [240, 220, 174]; // #f0dcae

// Auto-demo script: [sweep value, hold seconds]. Cycles until the user takes over.
const DEMO_SCRIPT: [number, number][] = [
  [0.34, 8], // endless accelerando
  [-0.3, 7], // endless ritardando
  [0.06, 5], // near-hold shimmer
  [0.34, 8],
];

function lerpColor(
  a: [number, number, number],
  b: [number, number, number],
  t: number,
): string {
  const c = a.map((v, i) => Math.round(v + (b[i] - v) * t));
  return `rgb(${c[0]},${c[1]},${c[2]})`;
}

function clamp(v: number, lo: number, hi: number): number {
  return v < lo ? lo : v > hi ? hi : v;
}

export default function EternalGroovePage() {
  const [supported, setSupported] = useState(true);
  const [running, setRunning] = useState(false);
  const [showNotes, setShowNotes] = useState(false);
  const [baseBPM, setBaseBPM] = useState(110);
  const [sweep, setSweep] = useState(0.34); // -1..1, encodes direction + speed
  const [tookOver, setTookOver] = useState(false);

  // refs shared with the animation / audio loops
  const engineRef = useRef<RissetRhythmEngine | null>(null);
  const phaseRef = useRef(0); // octaves — single source of truth
  const sweepRef = useRef(0.34);
  const baseBpmRef = useRef(110);
  const tookOverRef = useRef(false);

  const ringsRef = useRef<(HTMLDivElement | null)[]>([]);
  const hubRef = useRef<HTMLDivElement | null>(null);
  const rotRef = useRef<number[]>(new Array(N_LAYERS).fill(0));
  const flashRef = useRef<number[]>(new Array(N_LAYERS).fill(0));
  const rafRef = useRef<number | null>(null);
  const lastTsRef = useRef<number | null>(null);
  const demoTimerRef = useRef<number | null>(null);

  const tapTimesRef = useRef<number[]>([]);
  const [perceived, setPerceived] = useState(110);

  useEffect(() => {
    const ok =
      typeof window !== "undefined" &&
      !!(window.AudioContext ||
        (window as unknown as { webkitAudioContext?: unknown }).webkitAudioContext);
    setSupported(ok);
  }, []);

  // ---- user takes manual control of the sweep (stops the auto-demo) ----------
  const applySweep = useCallback((v: number, manual: boolean) => {
    const s = clamp(v, -1, 1);
    sweepRef.current = s;
    setSweep(s);
    if (manual && !tookOverRef.current) {
      tookOverRef.current = true;
      setTookOver(true);
      if (demoTimerRef.current !== null) {
        clearTimeout(demoTimerRef.current);
        demoTimerRef.current = null;
      }
    }
  }, []);

  const setTempo = useCallback((bpm: number) => {
    const b = clamp(Math.round(bpm), 40, 240);
    baseBpmRef.current = b;
    setBaseBPM(b);
    if (engineRef.current) engineRef.current.baseBPM = b;
  }, []);

  // ---- tap tempo (spacebar / tap / button) -----------------------------------
  const tap = useCallback(() => {
    const now = performance.now();
    const arr = tapTimesRef.current;
    arr.push(now);
    if (arr.length > 5) arr.shift();
    // drop stale taps (> 2s gap) so a new tempo can be tapped cleanly
    while (arr.length > 1 && now - arr[0] > 2000) arr.shift();
    if (arr.length >= 2) {
      const intervals: number[] = [];
      for (let i = 1; i < arr.length; i++) intervals.push(arr[i] - arr[i - 1]);
      intervals.sort((a, b) => a - b);
      const median = intervals[Math.floor(intervals.length / 2)];
      if (median > 0) setTempo(60000 / median);
    }
  }, [setTempo]);

  // ---- auto-demo scheduler ---------------------------------------------------
  const runDemo = useCallback(
    (i: number) => {
      if (tookOverRef.current) return;
      const [v, secs] = DEMO_SCRIPT[i % DEMO_SCRIPT.length];
      sweepRef.current = v;
      setSweep(v);
      demoTimerRef.current = window.setTimeout(
        () => runDemo(i + 1),
        secs * 1000,
      );
    },
    [],
  );

  // ---- animation loop (visuals + phase integration + flash sync) -------------
  const frame = useCallback((ts: number) => {
    const eng = engineRef.current;
    const last = lastTsRef.current;
    lastTsRef.current = ts;
    const dt = last === null ? 0 : clamp((ts - last) / 1000, 0, 0.05);

    // integrate the shared phase (octaves) from the sweep control
    phaseRef.current = wrapOct(phaseRef.current + sweepRef.current * MAX_SPEED * dt);
    const phase = phaseRef.current;
    const bpm = baseBpmRef.current;

    // drain audio-scheduled strikes into visual flashes, in sync with the clock
    if (eng) {
      const at = eng.audioTime;
      const q = eng.flashes;
      while (q.length && q[0].t <= at) {
        const f = q.shift()!;
        flashRef.current[f.k] = Math.min(1, Math.max(flashRef.current[f.k], f.w * 1.2));
      }
    }

    const decay = Math.pow(0.5, dt / FLASH_HALFLIFE);
    let hubGlow = 0;

    for (let k = 0; k < N_LAYERS; k++) {
      const o = wrapOct(phase + k);
      const w = hann(o);
      const tempo = bpm * Math.pow(2, o - N_LAYERS / 2);
      rotRef.current[k] += (tempo / 60) * REV_PER_BEAT * 360 * dt;
      flashRef.current[k] *= decay;
      const fl = flashRef.current[k];

      // proximity to the window peak (o = N/2) drives the hub pulse
      hubGlow = Math.max(hubGlow, fl * w);

      const el = ringsRef.current[k];
      if (!el) continue;
      const rFrac = o / N_LAYERS;
      const radius = INNER_R + rFrac * (OUTER_R - INNER_R);
      const scale = radius / OUTER_R;
      const op = clamp(0.05 + 0.95 * w + fl * 0.35, 0, 1);
      el.style.transform = `translate(-50%,-50%) rotate(${rotRef.current[k]}deg) scale(${scale})`;
      el.style.opacity = op.toFixed(3);
      el.style.borderColor = lerpColor(BRASS_DIM, BRASS_HOT, clamp(w + fl * 0.6, 0, 1));
      el.style.filter = `brightness(${(1 + fl * 1.8).toFixed(2)})`;
    }

    if (hubRef.current) {
      hubRef.current.style.transform = `translate(-50%,-50%) scale(${(1 + hubGlow * 0.5).toFixed(3)})`;
      hubRef.current.style.opacity = (0.5 + hubGlow * 0.5).toFixed(3);
    }

    // cheap readout: perceived centre tempo (fixed) — updated occasionally
    if ((ts | 0) % 8 === 0) setPerceived(bpm);

    rafRef.current = requestAnimationFrame(frame);
  }, []);

  // ---- start / stop ----------------------------------------------------------
  const begin = useCallback(async () => {
    if (!supported || running) return;
    tookOverRef.current = false;
    setTookOver(false);
    phaseRef.current = 0;
    rotRef.current = new Array(N_LAYERS).fill(0);
    flashRef.current = new Array(N_LAYERS).fill(0);

    const eng = new RissetRhythmEngine(() => phaseRef.current);
    eng.baseBPM = baseBpmRef.current;
    engineRef.current = eng;
    await eng.start();

    setRunning(true);
    lastTsRef.current = null;
    rafRef.current = requestAnimationFrame(frame);
    runDemo(0);
  }, [supported, running, frame, runDemo]);

  const stop = useCallback(() => {
    if (rafRef.current !== null) {
      cancelAnimationFrame(rafRef.current);
      rafRef.current = null;
    }
    if (demoTimerRef.current !== null) {
      clearTimeout(demoTimerRef.current);
      demoTimerRef.current = null;
    }
    engineRef.current?.stop();
    engineRef.current = null;
    setRunning(false);
  }, []);

  // ---- keyboard: spacebar = tap ---------------------------------------------
  useEffect(() => {
    if (!running) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.code === "Space") {
        e.preventDefault();
        tap();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [running, tap]);

  // ---- teardown on unmount ---------------------------------------------------
  useEffect(() => {
    return () => {
      if (rafRef.current !== null) cancelAnimationFrame(rafRef.current);
      if (demoTimerRef.current !== null) clearTimeout(demoTimerRef.current);
      engineRef.current?.stop();
      engineRef.current = null;
    };
  }, []);

  // ---- stage pointer: drag (up/down) = sweep, click = tap --------------------
  const dragState = useRef<{ y: number; moved: boolean; startSweep: number } | null>(
    null,
  );

  const onPointerDown = useCallback(
    (e: React.PointerEvent) => {
      if (!running) return;
      (e.target as HTMLElement).setPointerCapture?.(e.pointerId);
      dragState.current = { y: e.clientY, moved: false, startSweep: sweepRef.current };
    },
    [running],
  );

  const onPointerMove = useCallback(
    (e: React.PointerEvent) => {
      const d = dragState.current;
      if (!d) return;
      const dy = d.y - e.clientY; // up = positive
      if (Math.abs(dy) > 8) d.moved = true;
      if (d.moved) applySweep(d.startSweep + dy / 160, true);
    },
    [applySweep],
  );

  const onPointerUp = useCallback(
    (e: React.PointerEvent) => {
      const d = dragState.current;
      dragState.current = null;
      (e.target as HTMLElement).releasePointerCapture?.(e.pointerId);
      if (d && !d.moved) tap();
    },
    [tap],
  );

  const sweepLabel =
    sweep > 0.03
      ? "accelerating ↑"
      : sweep < -0.03
        ? "decelerating ↓"
        : "holding — steady shimmer";

  // ---------------------------------------------------------------------------
  return (
    <main className="min-h-screen bg-background text-foreground">
      <div className="mx-auto flex max-w-4xl flex-col gap-6 px-6 py-10">
        {/* Header */}
        <header className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
          <div className="max-w-xl">
            <p className="font-mono text-xs uppercase tracking-[0.18em] text-muted-foreground">
              Dream 2036 &middot; Risset rhythm
            </p>
            <h1 className="mt-2 text-2xl font-semibold tracking-tight sm:text-3xl">
              Eternal Groove
            </h1>
            <p className="mt-2 text-base text-muted-foreground">
              A percussion loop that accelerates forever without ever getting
              faster &mdash; a Shepard tone for tempo.
            </p>
          </div>
          <div className="flex shrink-0 items-center gap-3">
            {!running ? (
              <button
                onClick={begin}
                disabled={!supported}
                className="min-h-[44px] rounded-md bg-primary px-6 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90 disabled:opacity-50"
              >
                Begin
              </button>
            ) : (
              <button
                onClick={stop}
                className="min-h-[44px] rounded-md bg-primary px-6 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90"
              >
                Stop
              </button>
            )}
          </div>
        </header>

        {!supported && (
          <p className="text-base text-destructive">
            Web Audio isn&rsquo;t available in this browser, so the groove
            can&rsquo;t sound. Try a recent Chrome, Firefox, or Safari.
          </p>
        )}

        {/* Stage */}
        <section
          onPointerDown={onPointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={onPointerUp}
          className="relative flex aspect-square w-full max-w-[460px] touch-none select-none items-center justify-center self-center overflow-hidden rounded-lg"
          style={{
            background:
              "radial-gradient(circle at 50% 46%, #1b150e 0%, #120d08 55%, #0b0805 100%)",
            boxShadow: "inset 0 0 90px rgba(0,0,0,0.65)",
            cursor: running ? "ns-resize" : "default",
          }}
          aria-label="Risset-rhythm stage. Drag up to accelerate forever, down to decelerate, tap to set the pulse."
        >
          {/* concentric tempo-layer rings (one DOM element per layer) */}
          {Array.from({ length: N_LAYERS }).map((_, k) => (
            <div
              key={k}
              ref={(el) => {
                ringsRef.current[k] = el;
              }}
              className="pointer-events-none absolute left-1/2 top-1/2"
              style={{
                width: OUTER_R * 2,
                height: OUTER_R * 2,
                marginLeft: 0,
                marginTop: 0,
                borderRadius: "9999px",
                border: "1.5px solid #5c4a2e",
                willChange: "transform, opacity, filter",
                transform: "translate(-50%,-50%) scale(0.2)",
                opacity: 0.1,
              }}
            >
              {/* two opposed tick markers make the rotation legible */}
              <span
                className="absolute left-1/2 top-0 -translate-x-1/2 -translate-y-1/2 rounded-full"
                style={{ width: 8, height: 8, background: "#e8c98a" }}
              />
              <span
                className="absolute bottom-0 left-1/2 -translate-x-1/2 translate-y-1/2 rounded-full"
                style={{ width: 5, height: 5, background: "#b08d57" }}
              />
            </div>
          ))}

          {/* centre hub — pulses on the loudest (band-centre) strike */}
          <div
            ref={hubRef}
            className="pointer-events-none absolute left-1/2 top-1/2 rounded-full"
            style={{
              width: 26,
              height: 26,
              background:
                "radial-gradient(circle, #f0dcae 0%, #b08d57 60%, #6b4f2a 100%)",
              transform: "translate(-50%,-50%) scale(1)",
              opacity: 0.5,
            }}
          />

          {!running && (
            <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
              <p className="font-mono text-xs uppercase tracking-[0.18em] text-muted-foreground">
                press begin
              </p>
            </div>
          )}
        </section>

        {/* Controls */}
        <section className="flex flex-col gap-5">
          <div className="flex flex-wrap items-center justify-center gap-3">
            <button
              onClick={() => applySweep(0.34, true)}
              disabled={!running}
              className="min-h-[44px] rounded-md border border-border bg-background/60 px-4 text-sm text-muted-foreground transition-colors hover:bg-accent hover:text-foreground disabled:opacity-40"
            >
              Accelerate &uarr;
            </button>
            <button
              onClick={() => applySweep(0, true)}
              disabled={!running}
              className="min-h-[44px] rounded-md border border-border bg-background/60 px-4 text-sm text-muted-foreground transition-colors hover:bg-accent hover:text-foreground disabled:opacity-40"
            >
              Hold &middot;
            </button>
            <button
              onClick={() => applySweep(-0.34, true)}
              disabled={!running}
              className="min-h-[44px] rounded-md border border-border bg-background/60 px-4 text-sm text-muted-foreground transition-colors hover:bg-accent hover:text-foreground disabled:opacity-40"
            >
              Decelerate &darr;
            </button>
            <button
              onClick={tap}
              disabled={!running}
              className="min-h-[44px] rounded-md border border-border bg-background/60 px-4 text-sm text-muted-foreground transition-colors hover:bg-accent hover:text-foreground disabled:opacity-40"
            >
              Tap the pulse
            </button>
          </div>

          <div className="mx-auto flex w-full max-w-md flex-col gap-2">
            <div className="flex items-center justify-between font-mono text-xs uppercase tracking-[0.18em] text-muted-foreground">
              <span>ritardando</span>
              <span>sweep</span>
              <span>accelerando</span>
            </div>
            <input
              type="range"
              min={-1}
              max={1}
              step={0.01}
              value={sweep}
              disabled={!running}
              onChange={(e) => applySweep(parseFloat(e.target.value), true)}
              className="w-full accent-primary disabled:opacity-40"
              aria-label="Sweep direction and speed"
            />
          </div>

          <div className="flex flex-wrap items-center justify-center gap-x-8 gap-y-2 font-mono text-xs uppercase tracking-[0.18em] text-muted-foreground">
            <span>
              centre tempo{" "}
              <span className="text-foreground">{perceived} bpm</span>
            </span>
            <span>
              motion <span className="text-foreground">{sweepLabel}</span>
            </span>
            <span>
              layers <span className="text-foreground">{N_LAYERS} octaves</span>
            </span>
            {running && !tookOver && (
              <span className="text-foreground">auto-demo running</span>
            )}
          </div>
        </section>

        <button
          onClick={() => setShowNotes(true)}
          className="self-center font-mono text-xs uppercase tracking-[0.18em] text-muted-foreground underline-offset-4 transition-colors hover:text-foreground hover:underline"
        >
          Read the design notes
        </button>
      </div>

      {/* Design-notes overlay */}
      {showNotes && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4 backdrop-blur-sm"
          onClick={() => setShowNotes(false)}
        >
          <div
            className="max-h-[80vh] max-w-lg overflow-y-auto rounded-lg border border-border bg-background p-6 shadow-lg"
            onClick={(e) => e.stopPropagation()}
          >
            <h2 className="text-lg font-semibold tracking-tight">
              Eternal Groove &mdash; design notes
            </h2>
            <div className="mt-3 space-y-3 text-sm leading-relaxed text-muted-foreground">
              <p>
                <strong className="text-foreground">The question:</strong> what
                if a groove could accelerate forever without ever actually
                getting faster &mdash; a Shepard tone for tempo?
              </p>
              <p>
                Five percussive layers are stacked one octave apart in tempo. In
                log-tempo space layer <em>k</em> sits at position{" "}
                <em>o&#8341; = (phase + k) mod 5</em> and fires at{" "}
                <em>baseBPM &times; 2^(o&#8341; &minus; 2.5)</em>. A fixed
                raised-cosine (Hann) window over that axis sets each layer&rsquo;s
                loudness; because the window is fixed and the layers glide through
                it, one layer fades in at the audible centre exactly as another
                fades out an octave away.
              </p>
              <p>
                Advancing <em>phase</em> slides every layer up the ladder at
                once; a layer that reaches the top wraps silently to the bottom
                (its window weight there is ~0). The perceived tempo rises (or
                falls) endlessly while the pattern is static and loops
                seamlessly. The Hann window&rsquo;s sum stays constant across
                phase, so overall loudness never pulses.
              </p>
              <p>
                Strikes are timed by a ~25ms look-ahead scheduler off{" "}
                <em>AudioContext.currentTime</em>; the visuals and the phase run
                on requestAnimationFrame. Each ring rotates at its layer&rsquo;s
                rate and flashes on every strike, so the active band visibly
                streams outward (accelerando) or inward (ritardando).
              </p>
              <p>
                <strong className="text-foreground">Reference:</strong>{" "}
                Jean-Claude Risset&rsquo;s &ldquo;endless accelerando&rdquo; /
                rhythmic Shepard-tone illusion, after Roger Shepard&rsquo;s
                original pitch illusion (with Kenneth Knowlton in that lineage of
                perceptual-loop experiments).
              </p>
            </div>
            <button
              onClick={() => setShowNotes(false)}
              className="mt-5 min-h-[44px] rounded-md border border-border bg-background/60 px-4 text-sm text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
            >
              Close
            </button>
          </div>
        </div>
      )}
    </main>
  );
}
