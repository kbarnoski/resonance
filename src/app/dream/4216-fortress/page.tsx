"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import {
  screenToCortex,
  cortexToScreen,
  formConstant,
} from "../_shared/visionary/logpolar";
import {
  createSafeFlicker,
  prefersReducedMotion,
  type SafeFlicker,
} from "../_shared/visionary/safeFlicker";
import { startDroneBank, type DroneBank } from "../_shared/visionary/droneBank";

// ════════════════════════════════════════════════════════════════════════════
// 4216 — Fortress
//
// THE QUESTION: "What if you could WATCH and HEAR a migraine visual aura — the
// scintillating scotoma — sweep across your visual field, as a playable
// altered-states instrument?"
//
// The migraine aura is a REAL cortical phenomenon: cortical spreading
// depression (CSD), a slow wave of neural depolarization that crawls across V1
// at ~3 mm/min. Because the retina→V1 map is a complex logarithm (Bressloff–
// Cowan; the same log-polar warp behind Klüver's form constants), a wave that
// is a simple expanding arc in *cortical* space APPEARS in the visual field as
// a shimmering C-shaped band of zig-zag "fortification" chevrons that starts
// near fixation and swells toward the periphery, dragging a blind gray
// SCOTOMA behind it.
//
// We model the front at cortical radius u = u0 + v_csd·t, warp it to the screen
// with r = exp(u) (cortexToScreen), draw fortification chevrons at the leading
// edge and a desaturated blind wedge behind it. A ≤3 Hz SafeFlicker gate drives
// the scintillation shimmer (never a hard strobe). Audio: a rising detuned
// partial bank sings the leading edge (tremolo-gated by the same flicker) over
// a low drone that swells with the growing scotoma. Keyboard seeds + steers it;
// a seeded self-demo loops hands-free until the first keypress.
//
// See README.md for the design notes and named references.
// ════════════════════════════════════════════════════════════════════════════

// ── Deterministic PRNG (seeded; never Math.random for demo-critical values) ──
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

// ── Cortical geometry constants (principled via the log-polar warp) ──────────
const R_SEED = 0.045; // visual-field radius where the aura is born (near fovea)
const R_EDGE = 2.3; // radius at which the front has swept fully off-screen
const U_START = screenToCortex(R_SEED, 0)[0]; // = log(R_SEED)  ≈ -3.10
const U_MAX = screenToCortex(R_EDGE, 0)[0]; // = log(R_EDGE)   ≈  0.83
const U_RANGE = U_MAX - U_START;

const V_CSD_DEFAULT = U_RANGE / 60; // cortical units / s → ~60 s crossing
const V_CSD_MIN = U_RANGE / 105;
const V_CSD_MAX = U_RANGE / 32;

const SPAN0 = 0.42; // initial angular half-width of the C (radians)
const SPAN_MAX = 1.35; // the C opens as it grows
const SPAN_RATE = 0.018; // radians / s

const LEAD_BAND = 0.1; // cortical thickness of the bright scintillation band
const NBANDS = 4; // trailing fortification bands
const BAND_DU = 0.052; // cortical spacing between bands
const ZIG = 0.03; // chevron zig-zag amplitude (cortical radial)
const RESTART_PAUSE = 1.1; // seconds of dark between auras

// ─────────────────────────────────────────────────────────────────────────────
// Audio: a detuned high partial bank sings the leading edge (tremolo-gated by
// the flicker) over a low drone that swells with the scotoma. All continuous
// pitch — no drums, no scale snap.
// ─────────────────────────────────────────────────────────────────────────────
interface AudioUpdate {
  progress: number; // 0..1 how far the front has crossed
  flickerLum: number; // ≤3 Hz safe luminance multiplier
  active: boolean; // is an aura currently sweeping?
}

class FortressAudio {
  private ctx: AudioContext;
  private master: GainNode;
  private shimmer: GainNode;
  private drone: DroneBank;
  private partials: { osc: OscillatorNode; gain: GainNode; ratio: number }[] = [];
  private closed = false;

  // additive bank: slightly inharmonic so it shimmers rather than fuses
  private static RATIOS = [1, 2.01, 3.02, 4.05, 5.09, 6.14];

  constructor() {
    const Ctor: typeof AudioContext =
      window.AudioContext ??
      (window as unknown as { webkitAudioContext: typeof AudioContext })
        .webkitAudioContext;
    this.ctx = new Ctor();

    // safety limiter on the bus so nothing ever spikes
    const limiter = this.ctx.createDynamicsCompressor();
    limiter.threshold.value = -10;
    limiter.knee.value = 6;
    limiter.ratio.value = 12;
    limiter.attack.value = 0.003;
    limiter.release.value = 0.25;

    this.master = this.ctx.createGain();
    this.master.gain.value = 0.9;
    this.master.connect(limiter);
    limiter.connect(this.ctx.destination);

    // low void drone — swells with the growing blind scotoma
    this.drone = startDroneBank(this.ctx, this.master, {
      root: 46,
      ratios: [1, 3 / 2, 2, 5 / 2],
      cutoffLow: 130,
      cutoffHigh: 1400,
      peakGain: 0.26,
    });

    // shimmer bus — its gain is the tremolo, written every frame
    this.shimmer = this.ctx.createGain();
    this.shimmer.gain.value = 0.0001;
    this.shimmer.connect(this.master);

    const now = this.ctx.currentTime;
    for (let i = 0; i < FortressAudio.RATIOS.length; i++) {
      const ratio = FortressAudio.RATIOS[i];
      const osc = this.ctx.createOscillator();
      osc.type = "sine";
      osc.frequency.value = 700 * ratio;
      osc.detune.value = (i - 2.5) * 3; // fixed micro-detune → beating shimmer
      const gain = this.ctx.createGain();
      gain.gain.value = 0.0001;
      osc.connect(gain);
      gain.connect(this.shimmer);
      osc.start(now);
      this.partials.push({ osc, gain, ratio });
    }
  }

  update({ progress, flickerLum, active }: AudioUpdate): void {
    if (this.closed) return;
    const now = this.ctx.currentTime;

    // leading-edge pitch RISES as the arc expands toward the periphery
    const base = 640 + progress * 1500;
    for (let i = 0; i < this.partials.length; i++) {
      const p = this.partials[i];
      p.osc.frequency.setTargetAtTime(base * p.ratio, now, 0.07);
      // higher partials fade IN with progress → the edge brightens as it grows
      const roll = 1 / (1 + i * 0.9);
      const bright = i === 0 ? 1 : 0.25 + 0.75 * progress;
      p.gain.gain.setTargetAtTime(active ? 0.16 * roll * bright : 0, now, 0.08);
    }

    // tremolo = the SAME safe-flicker luminance the eye sees (sight ↔ sound)
    const trem = active ? 0.5 * flickerLum * (0.35 + 0.65 * progress) : 0;
    this.shimmer.gain.setTargetAtTime(Math.max(0.0001, trem), now, 0.03);

    // drone drive swells with the scotoma
    this.drone.setDrive(active ? 0.12 + 0.62 * progress : 0.05);
  }

  stop(): void {
    if (this.closed) return;
    this.closed = true;
    try {
      this.drone.stop();
    } catch {
      /* closing */
    }
    const killAt = this.ctx.currentTime + 0.35;
    for (const p of this.partials) {
      try {
        p.gain.gain.setTargetAtTime(0.0001, this.ctx.currentTime, 0.08);
        p.osc.stop(killAt);
      } catch {
        /* already stopped */
      }
    }
    window.setTimeout(() => {
      if (this.ctx.state !== "closed") this.ctx.close().catch(() => {});
    }, 500);
  }
}

// ── Mutable per-frame aura state (kept in a ref; never triggers re-render) ────
interface AuraState {
  auraStart: number; // performance.now()/1000 when this aura was seeded
  restartAt: number; // wall time to spawn the next aura (0 = running)
  u0: number; // cortical seed radius (steered by ↑/↓)
  vCsd: number; // CSD speed (steered by [ / ])
  seedAngle: number; // center angle of the C in the visual field (← / →)
  userTookOver: boolean; // first keypress hands control to the human
  prng: () => number;
}

interface Hud {
  hemi: number; // seed angle in degrees
  mmMin: number; // flavored CSD speed (mm/min)
  flicker: boolean;
  flickerHz: number;
  mode: "self-demo" | "you";
  progress: number;
}

export default function Page() {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const rafRef = useRef<number | null>(null);
  const audioRef = useRef<FortressAudio | null>(null);
  const flickerRef = useRef<SafeFlicker | null>(null);
  const stateRef = useRef<AuraState | null>(null);
  const sizeRef = useRef({ w: 0, h: 0, dpr: 1 });
  const hudTickRef = useRef(0);

  const [started, setStarted] = useState(false);
  const [showNotes, setShowNotes] = useState(false);
  const [hud, setHud] = useState<Hud>({
    hemi: 0,
    mmMin: 3,
    flicker: true,
    flickerHz: 2,
    mode: "self-demo",
    progress: 0,
  });

  // ── Seed a fresh aura. In self-demo mode the seeded PRNG varies it; once the
  //    human has taken over, keep their chosen params. ──────────────────────
  const spawnAura = useCallback((now: number) => {
    const st = stateRef.current;
    if (!st) return;
    if (!st.userTookOver) {
      const r = st.prng;
      // alternate hemifields + a little elevation jitter, deterministically
      const side = r() < 0.5 ? 0 : Math.PI;
      st.seedAngle = side + (r() - 0.5) * 0.9;
      st.u0 = U_START + (r() - 0.5) * 0.35;
      st.vCsd = V_CSD_MIN + r() * (V_CSD_MAX - V_CSD_MIN) * 0.7;
    }
    st.auraStart = now;
    st.restartAt = 0;
  }, []);

  // ── Main render + audio loop (runs from mount; audio only once started) ───
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return; // graceful degrade: no 2D context, bail quietly

    const reduced = prefersReducedMotion();
    const flicker = createSafeFlicker({ maxHz: 3, defaultHz: 2, floor: 0.6 });
    // soft shimmer on by default (floor 0.6, ≤3 Hz — safe); honor reduced-motion
    // by leaving it OFF, so value()=1 and the scintillation falls to near-static.
    if (!reduced) flicker.enable();
    flickerRef.current = flicker;

    const prng = mulberry32(0x4216);
    const state: AuraState = {
      auraStart: performance.now() / 1000,
      restartAt: 0,
      u0: U_START,
      vCsd: V_CSD_DEFAULT,
      seedAngle: 0,
      userTookOver: false,
      prng,
    };
    stateRef.current = state;
    spawnAura(state.auraStart);

    // ── canvas sizing ──
    const resize = () => {
      const dpr = Math.min(2, window.devicePixelRatio || 1);
      const rect = canvas.getBoundingClientRect();
      const w = Math.max(1, Math.round(rect.width));
      const h = Math.max(1, Math.round(rect.height));
      canvas.width = Math.round(w * dpr);
      canvas.height = Math.round(h * dpr);
      sizeRef.current = { w, h, dpr };
    };
    resize();
    const ro = new ResizeObserver(resize);
    ro.observe(canvas);

    // ── one aura's screen geometry, drawn through the log-polar warp ──
    const drawScene = (nowSec: number) => {
      const st = stateRef.current;
      if (!st) return;
      const { w, h, dpr } = sizeRef.current;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

      const cx = w / 2;
      const cy = h / 2;
      const scale = Math.min(w, h) * 0.42;
      const toPx = (u: number, v: number): [number, number] => {
        const [sx, sy] = cortexToScreen(u, v);
        return [cx + sx * scale, cy + sy * scale];
      };

      // background: near-black violet field with a soft vignette
      const bg = ctx.createRadialGradient(cx, cy, 0, cx, cy, Math.max(w, h) * 0.7);
      bg.addColorStop(0, "#0b0713");
      bg.addColorStop(1, "#050308");
      ctx.fillStyle = bg;
      ctx.fillRect(0, 0, w, h);

      // aura timing
      const t = nowSec - st.auraStart;
      const uFront = st.u0 + st.vCsd * t;
      const rawProgress = (uFront - st.u0) / (U_MAX - st.u0);
      const progress = Math.max(0, Math.min(1, rawProgress));
      const active = st.restartAt === 0 && uFront < U_MAX;

      // handle completion → schedule the next aura (loop)
      if (st.restartAt === 0 && uFront >= U_MAX) {
        st.restartAt = nowSec + RESTART_PAUSE;
      }
      if (st.restartAt !== 0 && nowSec >= st.restartAt) {
        spawnAura(nowSec);
      }

      const lum = flicker.value(nowSec);

      if (active) {
        const span = Math.min(SPAN_MAX, SPAN0 + SPAN_RATE * t);
        const lo = st.seedAngle - span;
        const hi = st.seedAngle + span;

        // ── SCOTOMA: the blind gray wedge the wave has already crossed ──
        // annular sector between the seed radius and just behind the front
        const uInner = st.u0;
        const uOuter = Math.max(uInner + 0.001, uFront - LEAD_BAND);
        const arcSteps = 60;
        ctx.beginPath();
        for (let i = 0; i <= arcSteps; i++) {
          const th = lo + ((hi - lo) * i) / arcSteps;
          const [px, py] = toPx(uOuter, th);
          if (i === 0) ctx.moveTo(px, py);
          else ctx.lineTo(px, py);
        }
        for (let i = arcSteps; i >= 0; i--) {
          const th = lo + ((hi - lo) * i) / arcSteps;
          const [px, py] = toPx(uInner, th);
          ctx.lineTo(px, py);
        }
        ctx.closePath();
        // desaturated dead gray, slightly lifted vs the surround → reads "blind"
        const [mx, my] = toPx((uInner + uOuter) / 2, st.seedAngle);
        const scot = ctx.createRadialGradient(mx, my, 0, mx, my, scale * 1.4);
        scot.addColorStop(0, "rgba(104,101,110,0.62)");
        scot.addColorStop(1, "rgba(58,56,66,0.30)");
        ctx.fillStyle = scot;
        ctx.fill();

        // ── SCINTILLATION: fortification chevrons at the leading edge ──
        const phase = nowSec * 2.1;
        const stepRad = 0.05;
        const nSteps = Math.max(20, Math.round((hi - lo) / stepRad));
        ctx.lineCap = "round";
        ctx.lineJoin = "round";

        for (let b = 0; b < NBANDS; b++) {
          const ub = uFront - b * BAND_DU;
          if (ub <= st.u0) continue;
          const trail = Math.pow(1 - b / NBANDS, 1.4);
          const glow = b === 0 ? 14 : 4;
          ctx.shadowBlur = glow * dpr;

          let prev: [number, number] | null = null;
          for (let i = 0; i <= nSteps; i++) {
            const th = lo + ((hi - lo) * i) / nSteps;
            const zz = i % 2 === 0 ? ZIG : -ZIG; // the zig-zag fortification
            const [px, py] = toPx(ub + zz, th);
            if (prev) {
              // spoke-like shimmer along the front (phi ≈ PI/2), gated by flicker
              const fc = formConstant(ub, th, Math.PI / 2 - 0.25, 7.5, phase);
              const a = trail * lum * (0.28 + 0.72 * fc);
              const hue = 258 + 46 * fc; // violet → magenta iridescence
              const light = b === 0 ? 62 + 26 * fc : 46 + 18 * fc;
              const sat = b === 0 ? 88 - 30 * fc : 82;
              ctx.strokeStyle = `hsla(${hue}, ${sat}%, ${light}%, ${a})`;
              ctx.shadowColor = `hsla(${hue}, 90%, 60%, ${a})`;
              ctx.lineWidth = (b === 0 ? 2.6 : 1.7) * dpr;
              ctx.beginPath();
              ctx.moveTo(prev[0], prev[1]);
              ctx.lineTo(px, py);
              ctx.stroke();
            }
            prev = [px, py];
          }
        }
        ctx.shadowBlur = 0;
      }

      // faint fixation cross (where the eye is held)
      ctx.strokeStyle = "rgba(180,170,210,0.22)";
      ctx.lineWidth = 1 * dpr;
      ctx.beginPath();
      ctx.moveTo(cx - 7, cy);
      ctx.lineTo(cx + 7, cy);
      ctx.moveTo(cx, cy - 7);
      ctx.lineTo(cx, cy + 7);
      ctx.stroke();

      // drive the audio with the same numbers the eye just used
      if (audioRef.current) {
        audioRef.current.update({ progress, flickerLum: lum, active });
      }

      // throttled HUD (~5 Hz) — avoid per-frame React churn
      hudTickRef.current += 1;
      if (hudTickRef.current % 12 === 0) {
        const deg = ((((st.seedAngle * 180) / Math.PI) % 360) + 360) % 360;
        setHud({
          hemi: Math.round(deg),
          mmMin: Math.round((st.vCsd / V_CSD_DEFAULT) * 3 * 10) / 10,
          flicker: flicker.enabled,
          flickerHz: Math.round(flicker.rateHz * 10) / 10,
          mode: st.userTookOver ? "you" : "self-demo",
          progress,
        });
      }
    };

    const frame = () => {
      drawScene(performance.now() / 1000);
      rafRef.current = requestAnimationFrame(frame);
    };
    rafRef.current = requestAnimationFrame(frame);

    // ── keyboard: seed + steer; first key hands control to the human ──
    const onKey = (e: KeyboardEvent) => {
      const st = stateRef.current;
      const fl = flickerRef.current;
      if (!st || !fl) return;
      let handled = true;
      switch (e.code) {
        case "Space":
          spawnAura(performance.now() / 1000);
          break;
        case "ArrowLeft":
          st.seedAngle += 0.28; // sweep toward the left hemifield
          break;
        case "ArrowRight":
          st.seedAngle -= 0.28; // sweep toward the right hemifield
          break;
        case "ArrowUp":
          st.u0 = Math.min(U_START + 0.9, st.u0 + 0.12); // seed farther out
          break;
        case "ArrowDown":
          st.u0 = Math.max(U_START - 0.9, st.u0 - 0.12); // seed nearer fixation
          break;
        case "BracketLeft":
          st.vCsd = Math.max(V_CSD_MIN, st.vCsd * 0.85); // slower CSD
          break;
        case "BracketRight":
          st.vCsd = Math.min(V_CSD_MAX, st.vCsd * 1.18); // faster CSD
          break;
        case "KeyF":
          fl.toggle(); // safe-flicker shimmer on/off
          break;
        default:
          handled = false;
      }
      if (handled) {
        e.preventDefault();
        st.userTookOver = true;
      }
    };
    window.addEventListener("keydown", onKey);

    return () => {
      window.removeEventListener("keydown", onKey);
      ro.disconnect();
      if (rafRef.current !== null) cancelAnimationFrame(rafRef.current);
      audioRef.current?.stop();
      audioRef.current = null;
    };
  }, [spawnAura]);

  // ── Start button: create the AudioContext inside the user gesture ──
  const onStart = useCallback(() => {
    if (audioRef.current) return;
    try {
      audioRef.current = new FortressAudio();
      setStarted(true);
    } catch (err) {
      console.error("audio init failed", err);
    }
  }, []);

  return (
    <main className="relative flex h-screen w-full flex-col overflow-hidden bg-background text-foreground">
      {/* header */}
      <header className="z-10 flex flex-col gap-1 px-5 pt-4 pb-3 sm:px-8">
        <p className="font-mono text-xs uppercase tracking-[0.18em] text-muted-foreground">
          Dream lab · 4216
        </p>
        <h1 className="text-xl font-semibold tracking-tight sm:text-2xl">Fortress</h1>
        <p className="text-base text-muted-foreground">
          Watch a migraine aura cross your visual field.
        </p>
      </header>

      {/* canvas stage */}
      <div className="relative flex-1">
        <canvas ref={canvasRef} className="absolute inset-0 h-full w-full" />

        {/* start overlay — audio needs a gesture */}
        {!started && (
          <div className="absolute inset-0 flex items-center justify-center p-6">
            <div className="max-w-md rounded-lg border border-border bg-background/70 p-6 text-center backdrop-blur-sm">
              <p className="font-mono text-xs uppercase tracking-[0.18em] text-muted-foreground">
                Scintillating scotoma
              </p>
              <p className="mt-3 text-base text-muted-foreground">
                The aura is already sweeping. Press start to hear it sing — a
                rising shimmer at the leading edge over the drone of the blind
                spot behind it.
              </p>
              <button
                onClick={onStart}
                className="mt-5 min-h-[44px] rounded-md bg-primary px-6 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90"
              >
                Start sound
              </button>
            </div>
          </div>
        )}

        {/* status (top-right) */}
        <div className="pointer-events-none absolute right-3 top-3 rounded-lg border border-border bg-background/55 px-3 py-2 backdrop-blur-sm">
          <p className="font-mono text-xs uppercase tracking-[0.18em] text-muted-foreground">
            {hud.mode}
          </p>
          <p className="mt-1 font-mono text-xs text-muted-foreground">
            CSD <span className="text-foreground">{hud.mmMin.toFixed(1)} mm/min</span>
          </p>
          <p className="font-mono text-xs text-muted-foreground">
            seed <span className="text-foreground">{hud.hemi}°</span>
          </p>
          <p className="font-mono text-xs text-muted-foreground">
            flicker{" "}
            <span className="text-foreground">
              {hud.flicker ? `${hud.flickerHz.toFixed(1)} Hz` : "off"}
            </span>
          </p>
          <div className="mt-1.5 h-1 w-28 overflow-hidden rounded-full bg-muted">
            <div
              className="h-full bg-primary/80"
              style={{ width: `${Math.round(hud.progress * 100)}%` }}
            />
          </div>
        </div>

        {/* key legend (bottom-left) */}
        <div className="pointer-events-none absolute bottom-3 left-3 rounded-lg border border-border bg-background/55 px-3 py-2 backdrop-blur-sm">
          <p className="font-mono text-xs uppercase tracking-[0.18em] text-muted-foreground">
            Keys
          </p>
          <ul className="mt-1 space-y-0.5 font-mono text-xs text-muted-foreground">
            <li>
              <span className="text-foreground">Space</span> new aura
            </li>
            <li>
              <span className="text-foreground">← →</span> sweep hemifield
            </li>
            <li>
              <span className="text-foreground">↑ ↓</span> seed radius
            </li>
            <li>
              <span className="text-foreground">[ ]</span> CSD speed
            </li>
            <li>
              <span className="text-foreground">F</span> flicker on/off
            </li>
          </ul>
        </div>

        {/* design-notes toggle (bottom-right) */}
        <div className="absolute bottom-3 right-3 flex flex-col items-end gap-2">
          {showNotes && (
            <div className="pointer-events-auto max-w-sm rounded-lg border border-border bg-background/80 p-4 text-left backdrop-blur-sm">
              <p className="font-mono text-xs uppercase tracking-[0.18em] text-muted-foreground">
                Design notes
              </p>
              <p className="mt-2 text-base leading-relaxed text-muted-foreground">
                A wave of cortical spreading depression crawls across V1 at
                ~3&nbsp;mm/min. The retina→cortex map is a complex logarithm, so
                a simple expanding arc at cortical radius{" "}
                <span className="text-foreground">u = u₀ + v·t</span> warps
                (r&nbsp;=&nbsp;eᵘ) into the C-shaped fortification band you see —
                bright zig-zag chevrons at the front, a blind gray scotoma
                behind. The shimmer is a{" "}
                <span className="text-foreground">≤3&nbsp;Hz</span> soft
                luminance drift (never a strobe); the same value is the audio
                tremolo, so sight and sound match.
              </p>
            </div>
          )}
          <button
            onClick={() => setShowNotes((s) => !s)}
            className="pointer-events-auto min-h-[44px] rounded-md border border-border bg-background/60 px-4 text-sm text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
          >
            {showNotes ? "Hide notes" : "Design notes"}
          </button>
        </div>
      </div>
    </main>
  );
}
