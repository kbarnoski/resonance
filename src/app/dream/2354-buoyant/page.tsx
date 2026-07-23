"use client";

// ─────────────────────────────────────────────────────────────────────────────
// 2354-buoyant — "does the sound of your own movement change how heavy you feel?"
//
//   A drug-free altered-state-of-the-BODY piece. Hold the phone, bounce/step in
//   place; each footfall is sonified. Two GENUINELY INDEPENDENT axes:
//
//     1. BRIGHTNESS / pitch of the movement-sound  (SoniBand axis)
//        bright + airy → the body feels light, buoyant; dark → heavy, grounded.
//     2. SYNC / lag between movement and its echo   (ownership axis)
//        tight → you OWN the altered weight; lagged → it floats free of you,
//        uncanny, derealized.
//
//   They CONFLICT: bright-but-lagged = a floating you don't own; dark-but-tight
//   = heavy but fully yours. There is deliberately NO single intensity dial.
//
//   Grounded in: Tajadura-Jiménez et al. SoniBand (CHI 2026); "As Light as Your
//   Footsteps" (CHI 2015); Lenggenhager/Blanke full-body ownership. See README.
// ─────────────────────────────────────────────────────────────────────────────

import { useCallback, useEffect, useRef, useState } from "react";

// ── seeded PRNG (mulberry32) — deterministic autopilot, no Math.random reliance
function makeRng(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function prefersReducedMotion(): boolean {
  if (typeof window === "undefined" || typeof window.matchMedia !== "function")
    return false;
  try {
    return window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  } catch {
    return false;
  }
}

// iOS exposes a non-standard permission gate on the constructor.
type MotionCtor = {
  requestPermission?: () => Promise<"granted" | "denied" | "default">;
};

// ── shared, mutable parameters (the two axes) ────────────────────────────────
interface Axes {
  brightness: number; // 0 = dark/heavy … 1 = bright/light   (SoniBand axis)
  lag: number; // seconds of movement→echo offset            (ownership axis)
}

// ─────────────────────────────────────────────────────────────────────────────
// AUDIO — raw Web Audio movement-sonification synth. No libraries. No scales;
// continuous pitch + stretched-inharmonic partials only (pentatonic is banned).
// ─────────────────────────────────────────────────────────────────────────────
class BuoyantAudio {
  private ctx: AudioContext | null = null;
  private master: GainNode | null = null;
  private droneGain: GainNode | null = null;
  private droneFilter: BiquadFilterNode | null = null;
  private partials: OscillatorNode[] = [];
  private noiseBuf: AudioBuffer | null = null;

  async start(): Promise<void> {
    if (this.ctx) {
      if (this.ctx.state === "suspended") await this.ctx.resume();
      return;
    }
    const Ctor =
      window.AudioContext ||
      (window as unknown as { webkitAudioContext: typeof AudioContext })
        .webkitAudioContext;
    const ctx = new Ctor();
    this.ctx = ctx;
    if (ctx.state === "suspended") await ctx.resume();

    // master chain: low gain behind a compressor, no clipping.
    const comp = ctx.createDynamicsCompressor();
    comp.threshold.value = -18;
    comp.ratio.value = 4;
    comp.attack.value = 0.004;
    comp.release.value = 0.18;
    const master = ctx.createGain();
    master.gain.value = 0.0001;
    master.gain.exponentialRampToValueAtTime(0.15, ctx.currentTime + 1.2);
    master.connect(comp);
    comp.connect(ctx.destination);
    this.master = master;

    // shared noise buffer for impact grains + drone bed.
    const len = Math.floor(ctx.sampleRate * 1.5);
    const buf = ctx.createBuffer(1, len, ctx.sampleRate);
    const d = buf.getChannelData(0);
    const rng = makeRng(2354);
    for (let i = 0; i < len; i++) d[i] = rng() * 2 - 1;
    this.noiseBuf = buf;

    // sustained buoyancy drone bed — stretched-inharmonic partials.
    const droneGain = ctx.createGain();
    droneGain.gain.value = 0.0001;
    droneGain.gain.exponentialRampToValueAtTime(0.06, ctx.currentTime + 2.0);
    const droneFilter = ctx.createBiquadFilter();
    droneFilter.type = "lowpass";
    droneFilter.frequency.value = 700;
    droneFilter.Q.value = 0.6;
    droneFilter.connect(droneGain);
    droneGain.connect(master);
    this.droneGain = droneGain;
    this.droneFilter = droneFilter;

    const ratios = [1, 2.76, 5.4];
    const types: OscillatorType[] = ["sine", "sine", "triangle"];
    const gains = [0.55, 0.28, 0.14];
    ratios.forEach((r, i) => {
      const osc = ctx.createOscillator();
      osc.type = types[i];
      osc.frequency.value = 55 * r;
      const g = ctx.createGain();
      g.gain.value = gains[i];
      osc.connect(g);
      g.connect(droneFilter);
      osc.start();
      this.partials.push(osc);
    });

    // faint airy noise bed inside the drone (rises with brightness).
    const bedSrc = ctx.createBufferSource();
    bedSrc.buffer = buf;
    bedSrc.loop = true;
    const bedBp = ctx.createBiquadFilter();
    bedBp.type = "bandpass";
    bedBp.frequency.value = 1400;
    bedBp.Q.value = 0.7;
    const bedG = ctx.createGain();
    bedG.gain.value = 0.05;
    bedSrc.connect(bedBp);
    bedBp.connect(bedG);
    bedG.connect(droneFilter);
    bedSrc.start();
  }

  /** Continuously track axis-1 brightness in the sustained bed. */
  updateDrone(brightness: number): void {
    const ctx = this.ctx;
    if (!ctx || !this.droneFilter) return;
    const b = Math.max(0, Math.min(1, brightness));
    const base = 52 + b * 46; // 52 → 98 Hz, continuous
    // inharmonicity STRETCHES as it brightens — bell-like lift, never a scale.
    const ratios = [1, 2.76 + b * 0.7, 5.4 + b * 1.6];
    this.partials.forEach((osc, i) => {
      osc.frequency.setTargetAtTime(base * ratios[i], ctx.currentTime, 0.08);
    });
    this.droneFilter.frequency.setTargetAtTime(
      420 + b * 3200,
      ctx.currentTime,
      0.1
    );
  }

  /** One sonified footfall. delaySec applies the ownership (sync/lag) axis. */
  footstep(strength: number, brightness: number, delaySec: number): void {
    const ctx = this.ctx;
    const master = this.master;
    if (!ctx || !master || !this.noiseBuf) return;
    const b = Math.max(0, Math.min(1, brightness));
    const s = Math.max(0.05, Math.min(1, strength));
    const t0 = ctx.currentTime + Math.max(0, delaySec);

    // — impact: filtered noise burst. Bright = high, short tick; dark = low thud.
    const src = ctx.createBufferSource();
    src.buffer = this.noiseBuf;
    src.loop = true;
    const bp = ctx.createBiquadFilter();
    bp.type = "bandpass";
    bp.frequency.value = 240 + b * 3200; // continuous spectral centroid
    bp.Q.value = 0.7 + b * 3.5;
    const ig = ctx.createGain();
    const decay = 0.24 - b * 0.13; // dark lingers (heavy), bright is crisp
    ig.gain.setValueAtTime(0.0001, t0);
    ig.gain.exponentialRampToValueAtTime(0.5 * s, t0 + 0.006);
    ig.gain.exponentialRampToValueAtTime(0.0001, t0 + decay);
    src.connect(bp);
    bp.connect(ig);
    ig.connect(master);
    src.start(t0);
    src.stop(t0 + decay + 0.05);

    // — body-resonance tone: continuous pitch tracks brightness, plus a
    //   stretched-inharmonic partial. Bright hums high; dark rumbles low.
    const f = 78 + b * 300;
    [
      { r: 1, type: "sine" as OscillatorType, g: 0.34 },
      { r: 2.76, type: "sine" as OscillatorType, g: 0.12 },
    ].forEach(({ r, type, g }) => {
      const osc = ctx.createOscillator();
      osc.type = type;
      osc.frequency.value = f * r;
      const og = ctx.createGain();
      const td = 0.18 + (1 - b) * 0.22; // heavy tones ring longer
      og.gain.setValueAtTime(0.0001, t0);
      og.gain.exponentialRampToValueAtTime(g * s, t0 + 0.01);
      og.gain.exponentialRampToValueAtTime(0.0001, t0 + td);
      osc.connect(og);
      og.connect(master);
      osc.start(t0);
      osc.stop(t0 + td + 0.05);
    });
  }

  suspend(): void {
    if (this.ctx && this.ctx.state === "running") void this.ctx.suspend();
  }

  dispose(): void {
    try {
      this.partials.forEach((o) => o.stop());
    } catch {
      /* already stopped */
    }
    if (this.ctx) void this.ctx.close();
    this.ctx = null;
    this.master = null;
    this.partials = [];
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// WORLD — the buoyancy field simulation + input plumbing (all in a ref).
// ─────────────────────────────────────────────────────────────────────────────
interface Pulse {
  fireAt: number; // perf ms — when the (lagged) response lands
  strength: number;
  brightness: number; // brightness captured at input time
}
interface Particle {
  ang: number;
  rad: number;
  ph: number;
  jx: number;
  jy: number;
}
interface World {
  yn: number; // normalized cluster height, 0 top … 1 bottom
  vy: number;
  spread: number; // current visual spread of the soft body
  energy: number; // smoothed motion energy
  particles: Particle[];
  pending: Pulse[]; // scheduled (lagged) visual responses
  inputFlash: number; // perf ms of the most recent RAW input onset
  lastRealInput: number; // perf ms — when a human last drove it
  drift: number; // slow luminance-drift phase
  rng: () => number;
  autoNext: number; // perf ms — next autopilot footfall
}

const RESP_UP = 0.28; // rest height when fully light (near top)
const RESP_DOWN = 0.74; // rest height when fully heavy (near bottom)

function makeWorld(): World {
  const rng = makeRng(9137);
  const particles: Particle[] = [];
  for (let i = 0; i < 84; i++) {
    particles.push({
      ang: rng() * Math.PI * 2,
      rad: 0.25 + rng() * 0.75,
      ph: rng() * Math.PI * 2,
      jx: 0,
      jy: 0,
    });
  }
  return {
    yn: 0.6,
    vy: 0,
    spread: 1,
    energy: 0,
    particles,
    pending: [],
    inputFlash: -1e9,
    lastRealInput: -1e9,
    drift: 0,
    rng,
    autoNext: 0,
  };
}

export default function BuoyantPage() {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const worldRef = useRef<World>(makeWorld());
  const axesRef = useRef<Axes>({ brightness: 0.62, lag: 0.09 });
  const audioRef = useRef<BuoyantAudio | null>(null);
  const rafRef = useRef<number>(0);
  const reducedRef = useRef<boolean>(false);
  const startedRef = useRef<boolean>(false);
  const motionSeenRef = useRef<boolean>(false);

  // pointer-drag fallback state
  const dragRef = useRef<{ active: boolean; lastY: number; lastT: number }>({
    active: false,
    lastY: 0,
    lastT: 0,
  });
  // devicemotion onset-detection state
  const motionRef = useRef<{ env: bufferState }>(
    { env: { baseline: 9.8, smooth: 0, prev: 0, lastOnset: 0 } }
  );

  const [phase, setPhase] = useState<"idle" | "live">("idle");
  const [mode, setMode] = useState<"listening" | "motion" | "pointer">(
    "listening"
  );
  const [autoOn, setAutoOn] = useState(true);
  const [notesOpen, setNotesOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [ui, setUi] = useState<Axes>({ brightness: 0.62, lag: 0.09 });
  const [state, setState] = useState<string>("");

  // ── fire a footfall: raw input mark + scheduled (lagged) audio & visual ──
  const runFootstep = useCallback((strength: number) => {
    const now = performance.now();
    const w = worldRef.current;
    const { brightness, lag } = axesRef.current;
    w.inputFlash = now;
    w.pending.push({
      fireAt: now + lag * 1000,
      strength,
      brightness,
    });
    if (w.pending.length > 32) w.pending.shift();
    if (audioRef.current) audioRef.current.footstep(strength, brightness, lag);
  }, []);

  // ── DeviceMotion onset detection ──────────────────────────────────────────
  const onMotion = useCallback(
    (e: DeviceMotionEvent) => {
      motionSeenRef.current = true;
      if (mode === "listening") setMode("motion");
      const a =
        e.accelerationIncludingGravity ??
        (e.acceleration as DeviceMotionEventAcceleration | null);
      if (!a) return;
      const mag = Math.hypot(a.x ?? 0, a.y ?? 0, a.z ?? 0);
      const st = motionRef.current.env;
      // slow baseline (gravity) tracker → high-pass the movement out
      st.baseline += (mag - st.baseline) * 0.02;
      const mv = Math.abs(mag - st.baseline);
      st.smooth += (mv - st.smooth) * 0.35;
      const w = worldRef.current;
      w.energy = Math.min(1, w.energy * 0.85 + st.smooth * 0.12);
      const now = performance.now();
      // peak-pick: rising through threshold, past the refractory window
      const THRESH = 1.4;
      if (
        st.smooth > THRESH &&
        st.prev <= THRESH &&
        now - st.lastOnset > 220
      ) {
        st.lastOnset = now;
        w.lastRealInput = now;
        runFootstep(Math.min(1, 0.35 + st.smooth * 0.12));
      }
      st.prev = st.smooth;
    },
    [mode, runFootstep]
  );

  // ── begin (user gesture): start audio, request motion, arm fallback ───────
  const begin = useCallback(async () => {
    setError(null);
    try {
      const audio = new BuoyantAudio();
      await audio.start();
      audioRef.current = audio;
    } catch {
      setError("Audio could not start — the visual still runs.");
    }
    startedRef.current = true;
    setPhase("live");

    // Attach devicemotion where available; otherwise straight to pointer.
    const DM = (
      typeof window !== "undefined" ? window.DeviceMotionEvent : undefined
    ) as (typeof DeviceMotionEvent & MotionCtor) | undefined;
    if (DM) {
      try {
        if (typeof DM.requestPermission === "function") {
          const res = await DM.requestPermission();
          if (res !== "granted") {
            setMode("pointer");
          }
        }
        window.addEventListener("devicemotion", onMotion);
        // fallback arm: if no events land in ~1.6s, it's pointer/desktop.
        window.setTimeout(() => {
          if (!motionSeenRef.current) setMode("pointer");
        }, 1600);
      } catch {
        setMode("pointer");
      }
    } else {
      setMode("pointer");
    }
  }, [onMotion]);

  // ── pointer-drag fallback: vertical drag → energy + onsets ────────────────
  const onPointerDown = useCallback((e: React.PointerEvent) => {
    if (mode === "listening") return; // wait until we know sensors are absent
    const d = dragRef.current;
    d.active = true;
    d.lastY = e.clientY;
    d.lastT = performance.now();
    (e.target as Element).setPointerCapture?.(e.pointerId);
  }, [mode]);

  const onPointerMove = useCallback(
    (e: React.PointerEvent) => {
      const d = dragRef.current;
      if (!d.active) return;
      const now = performance.now();
      const dy = e.clientY - d.lastY;
      const dt = Math.max(8, now - d.lastT);
      const speed = Math.abs(dy) / dt; // px/ms
      const w = worldRef.current;
      w.energy = Math.min(1, w.energy * 0.8 + speed * 0.9);
      w.lastRealInput = now;
      // a fast drag stroke = a footfall (refractory-limited)
      const st = motionRef.current.env;
      if (speed > 0.9 && now - st.lastOnset > 160) {
        st.lastOnset = now;
        runFootstep(Math.min(1, 0.3 + speed * 0.4));
      }
      d.lastY = e.clientY;
      d.lastT = now;
    },
    [runFootstep]
  );

  const onPointerUp = useCallback(() => {
    dragRef.current.active = false;
  }, []);

  // ── slider handlers (the two INDEPENDENT axes) ────────────────────────────
  const setBrightness = useCallback((v: number) => {
    axesRef.current.brightness = v;
    setUi((u) => ({ ...u, brightness: v }));
  }, []);
  const setLag = useCallback((v: number) => {
    axesRef.current.lag = v;
    setUi((u) => ({ ...u, lag: v }));
  }, []);

  // ── render + physics loop (runs from mount; visual autopilot pre-audio) ───
  useEffect(() => {
    reducedRef.current = prefersReducedMotion();
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    let W = 0;
    let H = 0;
    let dpr = 1;
    const resize = () => {
      dpr = Math.min(2, window.devicePixelRatio || 1);
      const r = canvas.getBoundingClientRect();
      W = r.width;
      H = r.height;
      canvas.width = Math.max(1, Math.floor(W * dpr));
      canvas.height = Math.max(1, Math.floor(H * dpr));
    };
    resize();
    const ro = new ResizeObserver(resize);
    ro.observe(canvas);

    let prev = performance.now();
    let uiTick = 0;

    const frame = (now: number) => {
      const dt = Math.min(0.05, (now - prev) / 1000);
      prev = now;
      const w = worldRef.current;
      const reduced = reducedRef.current;
      const { brightness, lag } = axesRef.current;

      if (audioRef.current) audioRef.current.updateDrone(brightness);

      // — seeded autopilot: supply footfalls ONLY (never touches the two axes),
      //   so a silent glance shows the mass breathing but the axes stay yours.
      const idle = now - w.lastRealInput > 2600;
      if (autoOn && idle && !reduced) {
        if (now >= w.autoNext) {
          const s = 0.4 + w.rng() * 0.4;
          runFootstep(s);
          w.autoNext = now + 620 + w.rng() * 620;
        }
      }

      // — fire scheduled (lagged) visual responses
      for (let i = w.pending.length - 1; i >= 0; i--) {
        if (now >= w.pending[i].fireAt) {
          const p = w.pending[i];
          // buoyant kick: bright leaps & hangs, heavy barely lifts
          w.vy -= (0.6 + 1.7 * p.brightness) * p.strength;
          w.energy = Math.min(1, w.energy + 0.4 * p.strength);
          // particles scatter (light) or squash (heavy)
          for (const pt of w.particles) {
            const lift = (0.4 + p.brightness) * p.strength;
            pt.jy -= lift * (0.5 + w.rng()) * 6;
            pt.jx += (w.rng() - 0.5) * lift * 6 * p.brightness;
          }
          w.pending.splice(i, 1);
        }
      }

      // — buoyancy physics: rest height + damping set the FELT WEIGHT
      const restY = RESP_DOWN - (RESP_DOWN - RESP_UP) * brightness;
      const springK = 9;
      const ay = (restY - w.yn) * springK + (1 - brightness) * 1.1; // heavy sags
      w.vy += ay * dt;
      const damp = Math.pow(0.72 + 0.2 * brightness, dt * 60); // light bobs; heavy dead
      w.vy *= damp;
      w.yn += w.vy * dt;
      if (w.yn > 0.94) {
        w.yn = 0.94;
        w.vy *= -0.2 * brightness; // heavy lands dead, light rebounds a touch
      }
      if (w.yn < 0.08) {
        w.yn = 0.08;
        w.vy *= -0.3;
      }
      w.energy *= Math.pow(0.9, dt * 60);
      // spread: bright = wide airy plume, dark = tight dense mass
      const targetSpread = 0.7 + brightness * 0.9 + w.energy * 0.5;
      w.spread += (targetSpread - w.spread) * Math.min(1, dt * 4);

      // particle jitter relax
      const jitterAmp = reduced ? 0.15 : 1;
      for (const pt of w.particles) {
        pt.jx *= Math.pow(0.86, dt * 60);
        pt.jy *= Math.pow(0.86, dt * 60);
        pt.ph += dt * (0.4 + brightness * 0.7) * jitterAmp;
      }

      w.drift += dt * 0.12;

      drawScene(ctx, W, H, dpr, w, brightness, lag, reduced, now);

      // throttled UI + state readout (~5/s)
      uiTick++;
      if (uiTick % 12 === 0) {
        setState(describeState(brightness, lag));
      }

      rafRef.current = requestAnimationFrame(frame);
    };
    rafRef.current = requestAnimationFrame(frame);

    return () => {
      cancelAnimationFrame(rafRef.current);
      ro.disconnect();
    };
  }, [autoOn, runFootstep]);

  // ── cleanup on unmount ────────────────────────────────────────────────────
  useEffect(() => {
    return () => {
      if (typeof window !== "undefined")
        window.removeEventListener("devicemotion", onMotion);
      audioRef.current?.dispose();
    };
  }, [onMotion]);

  // pause audio when tab hidden
  useEffect(() => {
    const onVis = () => {
      if (document.hidden) audioRef.current?.suspend();
      else if (startedRef.current) void audioRef.current?.start();
    };
    document.addEventListener("visibilitychange", onVis);
    return () => document.removeEventListener("visibilitychange", onVis);
  }, []);

  const lagMs = Math.round(ui.lag * 1000);
  const modeNote =
    mode === "listening"
      ? "checking for a motion sensor…"
      : mode === "motion"
        ? "motion sensor active — bounce or step in place"
        : "no motion sensor — drag up and down on the field instead";

  return (
    <div className="relative min-h-[calc(100vh-3rem)] w-full overflow-hidden bg-background text-foreground">
      {/* ART LAYER — the buoyancy field (high-key aerial palette) */}
      <canvas
        ref={canvasRef}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={onPointerUp}
        className="absolute inset-0 h-full w-full touch-none"
        aria-label="buoyancy field"
      />

      {/* CHROME LAYER */}
      <div className="pointer-events-none absolute inset-0 flex flex-col justify-between p-5 sm:p-7">
        {/* header */}
        <header className="pointer-events-auto max-w-xl">
          <p className="font-mono text-xs uppercase tracking-[0.18em] text-muted-foreground">
            2354 · buoyant
          </p>
          <h1 className="mt-2 text-2xl font-semibold tracking-tight text-foreground">
            The weight of your own footsteps
          </h1>
          <p className="mt-2 max-w-md text-base text-muted-foreground">
            The sound your body makes when it moves can change how heavy your
            body feels. Make it brighter to feel buoyant; keep it tightly synced
            to feel that the change is truly yours.
          </p>

          {phase === "idle" ? (
            <div className="mt-4 flex flex-wrap items-center gap-3">
              <button
                onClick={begin}
                className="min-h-[44px] rounded-md bg-primary px-6 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90"
              >
                Start — hold your phone and bounce
              </button>
              <button
                onClick={() => setNotesOpen(true)}
                className="min-h-[44px] rounded-md border border-border bg-background/60 px-4 text-sm text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
              >
                Read the design notes
              </button>
            </div>
          ) : (
            <p className="mt-3 font-mono text-xs uppercase tracking-[0.14em] text-muted-foreground">
              {modeNote}
            </p>
          )}
          {error ? (
            <p className="mt-2 text-sm text-destructive">{error}</p>
          ) : null}
        </header>

        {/* footer — the two independent axes + live state */}
        <footer className="pointer-events-auto flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
          <div className="flex flex-wrap items-end gap-6">
            {/* AXIS 1 — brightness / lightness */}
            <label className="flex flex-col gap-1">
              <span className="font-mono text-xs uppercase tracking-[0.18em] text-muted-foreground">
                lightness · {Math.round(ui.brightness * 100)}
              </span>
              <input
                type="range"
                min={0}
                max={1}
                step={0.01}
                value={ui.brightness}
                onChange={(e) => setBrightness(parseFloat(e.target.value))}
                className="h-2 w-44 cursor-pointer appearance-none rounded-full bg-accent accent-primary"
                aria-label="brightness / lightness axis"
              />
              <span className="text-xs text-muted-foreground">
                dark &amp; heavy ↔ bright &amp; buoyant
              </span>
            </label>

            {/* AXIS 2 — sync / ownership */}
            <label className="flex flex-col gap-1">
              <span className="font-mono text-xs uppercase tracking-[0.18em] text-muted-foreground">
                ownership · {lagMs}ms lag
              </span>
              <input
                type="range"
                min={0}
                max={0.55}
                step={0.01}
                value={ui.lag}
                onChange={(e) => setLag(parseFloat(e.target.value))}
                className="h-2 w-44 cursor-pointer appearance-none rounded-full bg-accent accent-primary"
                aria-label="sync / ownership axis"
              />
              <span className="text-xs text-muted-foreground">
                tight &amp; yours ↔ lagged &amp; uncanny
              </span>
            </label>
          </div>

          <div className="max-w-xs sm:text-right">
            <p className="font-mono text-xs uppercase tracking-[0.18em] text-muted-foreground">
              felt state
            </p>
            <p className="mt-1 text-base text-foreground">{state}</p>
            {phase === "live" ? (
              <button
                onClick={() => setAutoOn((v) => !v)}
                className="mt-2 min-h-[44px] rounded-md border border-border bg-background/60 px-4 text-sm text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
              >
                autopilot: {autoOn ? "on" : "off"}
              </button>
            ) : null}
          </div>
        </footer>
      </div>

      {/* corner: notes toggle while live */}
      {phase === "live" ? (
        <button
          onClick={() => setNotesOpen(true)}
          className="pointer-events-auto absolute right-5 top-5 min-h-[44px] rounded-md border border-border bg-background/60 px-4 text-sm text-muted-foreground transition-colors hover:bg-accent hover:text-foreground sm:right-7 sm:top-7"
        >
          notes
        </button>
      ) : null}

      {/* DESIGN NOTES overlay */}
      {notesOpen ? (
        <div className="absolute inset-0 z-20 flex items-start justify-center overflow-y-auto bg-background/85 p-5 backdrop-blur-sm">
          <div className="mt-6 max-w-2xl rounded-lg border border-border bg-background/95 p-6 text-muted-foreground">
            <div className="flex items-start justify-between gap-4">
              <h2 className="text-xl font-semibold tracking-tight text-foreground">
                Design notes
              </h2>
              <button
                onClick={() => setNotesOpen(false)}
                className="min-h-[44px] rounded-md border border-border bg-background/60 px-4 text-sm text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
              >
                close
              </button>
            </div>
            <p className="mt-4 text-base">
              <span className="text-foreground">The question:</span> what if the
              sound your body makes when you move could change how heavy your own
              body feels — buoyant and light, or leaden and grounded, with no
              drug?
            </p>
            <p className="mt-4 text-base">
              Two axes that never collapse to one dial:
            </p>
            <ul className="mt-2 list-disc space-y-2 pl-5 text-base">
              <li>
                <span className="text-foreground">Lightness</span> — the
                brightness / pitch of your movement-sound. Brighter → the body
                feels lighter (SoniBand).
              </li>
              <li>
                <span className="text-foreground">Ownership</span> — the sync /
                lag between the movement and its echo. Tight → you own the
                altered weight; lagged → it floats free of you, uncanny.
              </li>
            </ul>
            <p className="mt-4 text-base">
              They conflict on purpose: bright-but-lagged is a floating you
              don&apos;t own; dark-but-tight is heavy but fully yours.
            </p>
            <p className="mt-4 font-mono text-xs uppercase tracking-[0.14em]">
              references
            </p>
            <p className="mt-1 text-sm">
              Tajadura-Jiménez et al., SoniBand (CHI 2026) · &ldquo;As Light as
              Your Footsteps&rdquo; (CHI 2015) · Lenggenhager &amp; Blanke,
              full-body ownership.
            </p>
          </div>
        </div>
      ) : null}
    </div>
  );
}

// helper type for the onset detector's smoothing state
interface bufferState {
  baseline: number;
  smooth: number;
  prev: number;
  lastOnset: number;
}

// ── which of the four conflicting quadrants are we in? ──────────────────────
function describeState(brightness: number, lag: number): string {
  const light = brightness > 0.5;
  const owned = lag < 0.16;
  if (light && owned) return "Buoyant — and it is yours.";
  if (light && !owned) return "Floating free — it isn't quite yours.";
  if (!light && owned) return "Heavy, grounded, fully owned.";
  return "Leaden — and strangely detached.";
}

// ─────────────────────────────────────────────────────────────────────────────
// DRAW — Canvas 2D. High-key aerial palette; slow luminance drift, never a
// strobe; reduced-motion freezes the drift.
// ─────────────────────────────────────────────────────────────────────────────
function drawScene(
  ctx: CanvasRenderingContext2D,
  W: number,
  H: number,
  dpr: number,
  w: World,
  brightness: number,
  lag: number,
  reduced: boolean,
  now: number
): void {
  ctx.save();
  ctx.scale(dpr, dpr);

  // slow luminance drift (≤0.12 Hz, floor 0.9) — a breath, not a flash.
  const lum = reduced ? 1 : 0.94 + 0.06 * Math.sin(w.drift * Math.PI * 2 * 0.1);

  // sky gradient: pale aerial daylight, warmer near the horizon.
  const top = mixHex("#cfe4ff", "#eaf4ff", brightness);
  const horizon = mixHex("#f3ece0", "#fbf6ef", brightness);
  const g = ctx.createLinearGradient(0, 0, 0, H);
  g.addColorStop(0, shade(top, lum));
  g.addColorStop(0.82, shade(horizon, lum));
  g.addColorStop(1, shade("#e7ddcd", lum));
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, W, H);

  const cx = W * 0.5;
  const cy = w.yn * H;
  const baseR = Math.min(W, H) * 0.11;
  const spread = w.spread;

  // contact shadow on the ground — bigger & darker the heavier/lower the mass.
  const groundY = H * 0.9;
  const heavy = 1 - brightness;
  const closeness = Math.max(0, 1 - (groundY - cy) / (H * 0.7));
  const shR = baseR * (1.1 + heavy * 1.2) * (0.5 + closeness);
  const shA = 0.06 + heavy * 0.16 * closeness;
  const sg = ctx.createRadialGradient(cx, groundY, 0, cx, groundY, shR);
  sg.addColorStop(0, `rgba(70,80,100,${shA})`);
  sg.addColorStop(1, "rgba(70,80,100,0)");
  ctx.fillStyle = sg;
  ctx.beginPath();
  ctx.ellipse(cx, groundY, shR, shR * 0.28, 0, 0, Math.PI * 2);
  ctx.fill();

  // the soft body — a cluster of cloud-like grains.
  // light = warm-white airy; heavy = cool slate. Squash vertically when heavy.
  const bodyLight = mixHex("#8fb7e8", "#fff7ec", brightness);
  const squash = 1 - heavy * 0.28 * closeness;
  for (const pt of w.particles) {
    const wob = Math.sin(pt.ph) * 0.12 * spread;
    const rr = baseR * spread * (pt.rad + wob);
    const px = cx + Math.cos(pt.ang) * rr + pt.jx;
    const py = cy + Math.sin(pt.ang) * rr * squash + pt.jy;
    const grainR = baseR * (0.34 + 0.22 * pt.rad) * (0.7 + brightness * 0.6);
    const pg = ctx.createRadialGradient(px, py, 0, px, py, grainR);
    const a = (0.1 + 0.12 * brightness) * lum;
    pg.addColorStop(0, hexA(bodyLight, a));
    pg.addColorStop(1, hexA(bodyLight, 0));
    ctx.fillStyle = pg;
    ctx.beginPath();
    ctx.arc(px, py, grainR, 0, Math.PI * 2);
    ctx.fill();
  }

  // warm core glow
  const core = ctx.createRadialGradient(cx, cy, 0, cx, cy, baseR * spread);
  const coreA = (0.14 + brightness * 0.2) * lum;
  core.addColorStop(0, hexA(mixHex("#bcd6f5", "#fffaf2", brightness), coreA));
  core.addColorStop(1, hexA("#ffffff", 0));
  ctx.fillStyle = core;
  ctx.beginPath();
  ctx.arc(cx, cy, baseR * spread, 0, Math.PI * 2);
  ctx.fill();

  // ── OWNERSHIP made legible: a raw-input marker that fires NOW, while the
  //    mass responds `lag` later. The gap you SEE is the derealization axis.
  const sinceInput = now - w.inputFlash;
  if (sinceInput < 700) {
    const ia = (1 - sinceInput / 700) * 0.9;
    const iy = H * 0.14;
    ctx.strokeStyle = `rgba(120,140,175,${ia})`;
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(cx, iy, 10 + sinceInput * 0.03, 0, Math.PI * 2);
    ctx.stroke();
    // a thread from the input toward the (still-lagging) mass
    if (lag > 0.14) {
      ctx.strokeStyle = `rgba(120,140,175,${ia * 0.5})`;
      ctx.setLineDash([4, 6]);
      ctx.beginPath();
      ctx.moveTo(cx, iy + 12);
      ctx.lineTo(cx, cy - baseR * spread);
      ctx.stroke();
      ctx.setLineDash([]);
    }
  }

  // soft top vignette so chrome text stays readable over the bright sky
  const v = ctx.createLinearGradient(0, 0, 0, H * 0.4);
  v.addColorStop(0, "rgba(10,14,20,0.28)");
  v.addColorStop(1, "rgba(10,14,20,0)");
  ctx.fillStyle = v;
  ctx.fillRect(0, 0, W, H * 0.4);
  const vb = ctx.createLinearGradient(0, H * 0.62, 0, H);
  vb.addColorStop(0, "rgba(10,14,20,0)");
  vb.addColorStop(1, "rgba(10,14,20,0.34)");
  ctx.fillStyle = vb;
  ctx.fillRect(0, H * 0.62, W, H * 0.38);

  ctx.restore();
}

// ── tiny color helpers (art layer only) ─────────────────────────────────────
function hexToRgb(hex: string): [number, number, number] {
  const h = hex.replace("#", "");
  return [
    parseInt(h.slice(0, 2), 16),
    parseInt(h.slice(2, 4), 16),
    parseInt(h.slice(4, 6), 16),
  ];
}
function mixHex(a: string, b: string, t: number): string {
  const [ar, ag, ab] = hexToRgb(a);
  const [br, bg, bb] = hexToRgb(b);
  const k = Math.max(0, Math.min(1, t));
  const r = Math.round(ar + (br - ar) * k);
  const g = Math.round(ag + (bg - ag) * k);
  const bl = Math.round(ab + (bb - ab) * k);
  return `#${r.toString(16).padStart(2, "0")}${g
    .toString(16)
    .padStart(2, "0")}${bl.toString(16).padStart(2, "0")}`;
}
function shade(hex: string, mul: number): string {
  const [r, g, b] = hexToRgb(hex);
  return `rgb(${Math.round(r * mul)},${Math.round(g * mul)},${Math.round(
    b * mul
  )})`;
}
function hexA(hex: string, a: number): string {
  const [r, g, b] = hexToRgb(hex);
  return `rgba(${r},${g},${b},${Math.max(0, Math.min(1, a))})`;
}
