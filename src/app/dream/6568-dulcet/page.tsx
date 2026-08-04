"use client";

import { useEffect, useRef, useState } from "react";
import {
  makeRng,
  clamp,
  lerp,
  computeStrike,
  nearestCourse,
  strikePosOn,
  noteHz,
  courseY,
  courseX0,
  courseX1,
  bridgeLeftX,
  bridgeRightX,
  VIEW_W,
  VIEW_H,
  COURSES,
  N,
  VIS_FUND,
  type Mode,
} from "./dulcimer";

// ════════════════════════════════════════════════════════════════════════════
// Dulcet (6568) — a pure-SVG hammered dulcimer you PLAY (cycle 2 of the lab's
// "vector strings" line; cycle 1 was 6456-loomstring).
//
// What if you could strike the crossing courses of a hammered dulcimer, where
// each struck string rings as a bank of decaying resonant MODES — strike velocity
// sets brightness, strike position along the string sets which modes ring — and
// the SVG string you watch vibrates with the exact modal decay you hear?
//
// INPUT   Pointer Events (mouse + pen + MULTI-TOUCH → two hammers). A played
//         instrument: fast taps / drags roll the characteristic dulcimer tremolo.
// OUTPUT  Pure SVG. Zero GPU — each course is a <polyline> whose vertices are the
//         summed modal displacement Σ aₖ·sin(kπx)·cos(ωₖt)·e^(−t/τₖ). No canvas.
// TECH    Modal synthesis (bank of enveloped sine modes) per struck string. The
//         SAME mode bank drives audio and the visible shape → see = hear.
// ════════════════════════════════════════════════════════════════════════════

const AMP_FULL = 30; // px per unit modal displacement
const AMP_REDUCED = 12;
const COURSE_COOLDOWN = 0.055; // s between re-strikes of one course
const REHIT_DX = 26; // horizontal px a held pointer must travel to re-strike
const MAX_EXC = 3; // superimposed strikes kept per course (visual)
const MAX_VOICES = 16; // concurrent struck voices through the limiter
const SPEED_REF = 2600; // view-units/s that maps to a full-velocity strike
const IDLE_PERIOD = 2.35; // s between attract strikes
const IDLE_QUIET = 4.0; // s of silence after a touch before attract resumes
const ENV_FLOOR = 0.0001;

interface Excitation {
  t0: number;
  modes: Mode[];
  level: number; // strike loudness 0..1
  vscale: number; // visual time-scale (VIS_FUND / f0) — slows oscillation to see
  dampT0: number; // >0 once palm-muted: extra fast decay from this time
}

interface Voice {
  voiceGain: GainNode;
  oscs: OscillatorNode[];
  stopBy: number; // ctx time this voice is fully released
}

export default function DulcetPage() {
  const svgRef = useRef<SVGSVGElement | null>(null);
  const lineRefs = useRef<(SVGPolylineElement | null)[]>([]);
  const glowRefs = useRef<(SVGPolylineElement | null)[]>([]);
  const dampRef = useRef(false);

  const [started, setStarted] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showNotes, setShowNotes] = useState(false);
  const [dampUI, setDampUI] = useState(false);

  useEffect(() => {
    const svgMaybe = svgRef.current;
    if (!svgMaybe) return;
    const svg: SVGSVGElement = svgMaybe;

    try {
      const rng = makeRng(0x6568);
      const reducedMotion =
        typeof window !== "undefined" &&
        window.matchMedia("(prefers-reduced-motion: reduce)").matches;
      const AMP = reducedMotion ? AMP_REDUCED : AMP_FULL;

      // ── Per-course live state ────────────────────────────────────────────
      const excitations: Excitation[][] = Array.from({ length: COURSES }, () => []);
      const glow = new Float32Array(COURSES);
      const lastStrikeT = new Float32Array(COURSES).fill(-100);
      const vscaleOf = courseY.map((_, i) => VIS_FUND / noteHz(i));

      // ── Timing ───────────────────────────────────────────────────────────
      const startPerf = performance.now();
      function nowSec(): number {
        return (performance.now() - startPerf) / 1000;
      }

      // ── Audio graph (built lazily on first gesture) ──────────────────────
      type Audio = {
        ctx: AudioContext;
        bus: GainNode;
        comp: DynamicsCompressorNode;
        conv: ConvolverNode;
        wet: GainNode;
        master: GainNode;
        voices: Voice[];
      };
      let audio: Audio | null = null;

      function buildReverb(ctx: AudioContext): AudioBuffer {
        const sr = ctx.sampleRate;
        const len = Math.floor(sr * 1.5);
        const ir = ctx.createBuffer(2, len, sr);
        for (let ch = 0; ch < 2; ch++) {
          const d = ir.getChannelData(ch);
          for (let n = 0; n < len; n++) {
            const t = n / len;
            d[n] = (rng() * 2 - 1) * Math.pow(1 - t, 2.6) * Math.exp(-3.4 * t);
          }
        }
        return ir;
      }

      function ensureAudio(): Audio | null {
        if (audio) return audio;
        const Ctor =
          window.AudioContext ||
          (window as unknown as { webkitAudioContext?: typeof AudioContext })
            .webkitAudioContext;
        if (!Ctor) return null;
        const ctx = new Ctor();
        const bus = ctx.createGain();
        bus.gain.value = 0.9;
        const conv = ctx.createConvolver();
        conv.buffer = buildReverb(ctx);
        const wet = ctx.createGain();
        wet.gain.value = 0.24;
        const comp = ctx.createDynamicsCompressor();
        comp.threshold.value = -12;
        comp.knee.value = 8;
        comp.ratio.value = 20;
        comp.attack.value = 0.003;
        comp.release.value = 0.18;
        const master = ctx.createGain();
        master.gain.value = 0.15;

        bus.connect(comp);
        bus.connect(conv);
        conv.connect(wet);
        wet.connect(comp);
        comp.connect(master);
        master.connect(ctx.destination);

        audio = { ctx, bus, comp, conv, wet, master, voices: [] };
        return audio;
      }

      function playModal(modes: Mode[], level: number) {
        const a = audio;
        if (!a) return;
        if (a.ctx.state === "suspended") void a.ctx.resume();
        // Voice cap: steal the oldest struck voice if we're full.
        if (a.voices.length >= MAX_VOICES) {
          const old = a.voices.shift();
          if (old) {
            try {
              const now = a.ctx.currentTime;
              old.voiceGain.gain.setTargetAtTime(ENV_FLOOR, now, 0.03);
              for (const o of old.oscs) o.stop(now + 0.14);
            } catch {
              /* already stopped */
            }
          }
        }
        const t0 = a.ctx.currentTime + 0.001;
        const voiceGain = a.ctx.createGain();
        voiceGain.gain.value = 1;
        voiceGain.connect(a.bus);
        const oscs: OscillatorNode[] = [];
        let stopBy = t0;
        for (const m of modes) {
          const peak = m.amp * level * 0.9;
          if (peak < 0.0004) continue; // inaudible mode — skip to save a voice
          const osc = a.ctx.createOscillator();
          osc.type = "sine";
          osc.frequency.value = m.f;
          const g = a.ctx.createGain();
          const tau = Math.min(m.tau, 3.6);
          g.gain.setValueAtTime(ENV_FLOOR, t0);
          g.gain.linearRampToValueAtTime(peak, t0 + 0.004);
          g.gain.exponentialRampToValueAtTime(ENV_FLOOR, t0 + tau);
          osc.connect(g);
          g.connect(voiceGain);
          const end = t0 + tau + 0.05;
          osc.start(t0);
          osc.stop(end);
          if (end > stopBy) stopBy = end;
          oscs.push(osc);
        }
        if (oscs.length === 0) {
          try {
            voiceGain.disconnect();
          } catch {
            /* noop */
          }
          return;
        }
        const voice: Voice = { voiceGain, oscs, stopBy };
        a.voices.push(voice);
        oscs[0].onended = () => {
          const idx = a.voices.indexOf(voice);
          if (idx >= 0) a.voices.splice(idx, 1);
          try {
            voiceGain.disconnect();
          } catch {
            /* noop */
          }
        };
      }

      // Palm mute: choke every currently-ringing voice (audio) — the visual
      // side is choked in parallel via each excitation's dampT0.
      function dampAllVoices() {
        const a = audio;
        if (!a) return;
        const now = a.ctx.currentTime;
        for (const v of a.voices) {
          try {
            v.voiceGain.gain.setTargetAtTime(ENV_FLOOR, now, 0.045);
            for (const o of v.oscs) o.stop(now + 0.22);
          } catch {
            /* already stopped */
          }
        }
      }

      // ── A strike: one modal excitation, welded across sound + sight ──────
      function strike(course: number, pos: number, vel: number, sound: boolean) {
        const t = nowSec();
        if (t - lastStrikeT[course] < COURSE_COOLDOWN) return;
        lastStrikeT[course] = t;
        const damp = dampRef.current;
        const modes = computeStrike(course, pos, vel, damp);
        const level = clamp(vel, 0.12, 1);

        const arr = excitations[course];
        arr.push({ t0: t, modes, level, vscale: vscaleOf[course], dampT0: 0 });
        if (arr.length > MAX_EXC) arr.shift();
        glow[course] = Math.max(glow[course], level);

        if (sound) playModal(modes, level);
      }

      // ── Attract: a soft seeded phrase so it's alive on a silent glance ───
      let lastPointer = -100;
      let idleAccum = 0;
      let prevT = nowSec();
      // Pre-roll a couple of gentle strikes so load isn't a dead board.
      strike(2, 0.5, 0.34, false);
      strike(6, 0.44, 0.3, false);

      function attractTick(t: number, dt: number) {
        if (t - lastPointer < IDLE_QUIET) return;
        idleAccum += dt;
        if (idleAccum < IDLE_PERIOD) return;
        idleAccum = 0;
        const course = Math.floor(rng() * COURSES);
        const pos = 0.32 + rng() * 0.36; // near-middle → warm, fundamental-heavy
        const vel = 0.26 + rng() * 0.16; // soft
        strike(course, pos, vel, audio !== null);
      }

      // ── Draw: modal displacement → polyline points, straight to the DOM ──
      const buf: string[] = new Array(N);
      const DAMP_TAU = 0.12; // palm-mute visual decay
      function draw(t: number) {
        for (let i = 0; i < COURSES; i++) {
          const arr = excitations[i];
          const x0 = courseX0[i];
          const x1 = courseX1[i];
          const by = courseY[i];
          // Prune spent excitations (fundamental envelope below ~2%).
          for (let e = arr.length - 1; e >= 0; e--) {
            const ex = arr[e];
            const dt = t - ex.t0;
            let env0 = Math.exp(-dt / ex.modes[0].tau);
            if (ex.dampT0 > 0) env0 *= Math.exp(-(t - ex.dampT0) / DAMP_TAU);
            if (env0 < 0.02) arr.splice(e, 1);
          }
          for (let j = 0; j < N; j++) {
            const xf = j / (N - 1);
            let sum = 0;
            for (let e = 0; e < arr.length; e++) {
              const ex = arr[e];
              const dt = t - ex.t0;
              const dampMul =
                ex.dampT0 > 0 ? Math.exp(-(t - ex.dampT0) / DAMP_TAU) : 1;
              for (let mi = 0; mi < ex.modes.length; mi++) {
                const m = ex.modes[mi];
                const env = Math.exp(-dt / m.tau) * dampMul;
                if (env < 0.01) continue;
                sum +=
                  ex.level *
                  m.amp *
                  Math.sin(m.k * Math.PI * xf) *
                  Math.cos(2 * Math.PI * m.f * ex.vscale * dt) *
                  env;
              }
            }
            const px = lerp(x0, x1, xf);
            const py = by + sum * AMP;
            buf[j] = `${px.toFixed(1)},${py.toFixed(1)}`;
          }
          const pts = buf.join(" ");
          const el = lineRefs.current[i];
          if (el) el.setAttribute("points", pts);
          const gl = glowRefs.current[i];
          if (gl) {
            gl.setAttribute("points", pts);
            const g = glow[i];
            gl.setAttribute("opacity", (0.05 + g * 0.5).toFixed(3));
            gl.setAttribute("stroke-width", (2.2 + g * 4.5).toFixed(2));
          }
          const line = lineRefs.current[i];
          if (line) line.setAttribute("opacity", (0.5 + glow[i] * 0.5).toFixed(3));
          glow[i] *= 0.9;
        }
      }

      // ── Palm-mute edge handling ──────────────────────────────────────────
      let prevDamp = false;
      function syncDamp(t: number) {
        const d = dampRef.current;
        if (d && !prevDamp) {
          // Rising edge: choke everything currently ringing.
          dampAllVoices();
          for (let i = 0; i < COURSES; i++) {
            for (const ex of excitations[i]) if (ex.dampT0 === 0) ex.dampT0 = t;
          }
        }
        prevDamp = d;
      }

      // ── Main loop ────────────────────────────────────────────────────────
      let raf = 0;
      function frame() {
        const t = nowSec();
        const dt = Math.min(0.05, t - prevT);
        prevT = t;
        syncDamp(t);
        attractTick(t, dt);
        draw(t);
        raf = requestAnimationFrame(frame);
      }
      raf = requestAnimationFrame(frame);

      // ── Pointer interaction (multi-touch = two hammers) ──────────────────
      function toView(e: PointerEvent): [number, number] | null {
        const pt = svg.createSVGPoint();
        pt.x = e.clientX;
        pt.y = e.clientY;
        const ctm = svg.getScreenCTM();
        if (!ctm) return null;
        const p = pt.matrixTransform(ctm.inverse());
        return [p.x, p.y];
      }

      interface Hammer {
        x: number;
        y: number;
        t: number;
        course: number;
        markX: number; // x at last strike (for the one-course tremolo re-hit)
      }
      const hammers = new Map<number, Hammer>();

      function velFromSpeed(speed: number): number {
        return clamp(0.28 + speed / SPEED_REF, 0.28, 1);
      }

      function onDown(e: PointerEvent) {
        e.preventDefault();
        ensureAudio();
        if (!started) setStarted(true);
        const t = nowSec();
        lastPointer = t;
        const v = toView(e);
        if (!v) return;
        try {
          svg.setPointerCapture(e.pointerId);
        } catch {
          /* capture optional */
        }
        const course = nearestCourse(v[1]);
        const pos = strikePosOn(course, v[0]);
        hammers.set(e.pointerId, {
          x: v[0],
          y: v[1],
          t,
          course,
          markX: v[0],
        });
        strike(course, pos, 0.72, true); // a deliberate tap
      }

      function onMove(e: PointerEvent) {
        const h = hammers.get(e.pointerId);
        if (!h) return;
        const t = nowSec();
        lastPointer = t;
        const v = toView(e);
        if (!v) return;
        const dt = Math.max(1e-3, t - h.t);
        const speed = Math.hypot(v[0] - h.x, v[1] - h.y) / dt;
        h.x = v[0];
        h.y = v[1];
        h.t = t;
        const course = nearestCourse(v[1]);
        const pos = strikePosOn(course, v[0]);
        if (course !== h.course) {
          // Rolled onto a new course → strike it (velocity from pointer speed).
          h.course = course;
          h.markX = v[0];
          strike(course, pos, velFromSpeed(speed), true);
        } else if (Math.abs(v[0] - h.markX) > REHIT_DX) {
          // Tremolo on one course: a back-and-forth wag re-strikes it.
          h.markX = v[0];
          strike(course, pos, velFromSpeed(speed), true);
        }
      }

      function onUp(e: PointerEvent) {
        hammers.delete(e.pointerId);
        lastPointer = nowSec();
        try {
          svg.releasePointerCapture(e.pointerId);
        } catch {
          /* nothing captured */
        }
      }

      function onKey(down: boolean) {
        return (e: KeyboardEvent) => {
          if (e.key === "Shift") {
            dampRef.current = down;
            setDampUI(down);
          }
        };
      }
      const onKeyDown = onKey(true);
      const onKeyUp = onKey(false);

      svg.addEventListener("pointerdown", onDown);
      svg.addEventListener("pointermove", onMove);
      svg.addEventListener("pointerup", onUp);
      svg.addEventListener("pointercancel", onUp);
      window.addEventListener("keydown", onKeyDown);
      window.addEventListener("keyup", onKeyUp);

      // ── Teardown ─────────────────────────────────────────────────────────
      return () => {
        cancelAnimationFrame(raf);
        svg.removeEventListener("pointerdown", onDown);
        svg.removeEventListener("pointermove", onMove);
        svg.removeEventListener("pointerup", onUp);
        svg.removeEventListener("pointercancel", onUp);
        window.removeEventListener("keydown", onKeyDown);
        window.removeEventListener("keyup", onKeyUp);
        if (audio) {
          try {
            for (const v of audio.voices) {
              for (const o of v.oscs) {
                try {
                  o.stop();
                } catch {
                  /* already stopped */
                }
              }
              v.voiceGain.disconnect();
            }
            audio.bus.disconnect();
            audio.conv.disconnect();
            audio.wet.disconnect();
            audio.comp.disconnect();
            audio.master.disconnect();
            void audio.ctx.close();
          } catch {
            /* already torn down */
          }
          audio = null;
        }
      };
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "The dulcimer failed to tune up.",
      );
      return;
    }
    // Mount-once engine; all live state lives in refs / closures above.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function toggleDamp() {
    const next = !dampRef.current;
    dampRef.current = next;
    setDampUI(next);
  }

  return (
    <main className="relative flex min-h-[calc(100dvh-3rem)] w-full flex-col overflow-hidden bg-[#08040f]">
      {/* ── The dulcimer (pure SVG, zero GPU) ───────────────────────────── */}
      <svg
        ref={svgRef}
        viewBox={`0 0 ${VIEW_W} ${VIEW_H}`}
        preserveAspectRatio="xMidYMid meet"
        className="absolute inset-0 h-full w-full touch-none select-none"
        style={{ cursor: "crosshair" }}
        aria-label="A hammered dulcimer of playable strings"
      >
        <defs>
          <radialGradient id="dulBg" cx="50%" cy="40%" r="78%">
            <stop offset="0%" stopColor="#170c2e" />
            <stop offset="60%" stopColor="#0b0714" />
            <stop offset="100%" stopColor="#05030a" />
          </radialGradient>
          <linearGradient id="dulBoard" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#1a1030" stopOpacity="0.55" />
            <stop offset="100%" stopColor="#0d0820" stopOpacity="0.35" />
          </linearGradient>
          <filter id="dulGlow" x="-20%" y="-20%" width="140%" height="140%">
            <feGaussianBlur stdDeviation="3.4" />
          </filter>
        </defs>

        <rect x="0" y="0" width={VIEW_W} height={VIEW_H} fill="url(#dulBg)" />

        {/* Trapezoidal soundboard */}
        <polygon
          points={`${courseX0[COURSES - 1] - 18},${courseY[COURSES - 1] - 22} ${
            courseX1[COURSES - 1] + 18
          },${courseY[COURSES - 1] - 22} ${courseX1[0] + 22},${
            courseY[0] + 26
          } ${courseX0[0] - 22},${courseY[0] + 26}`}
          fill="url(#dulBoard)"
          stroke="#3a2a63"
          strokeWidth={1.5}
          strokeLinejoin="round"
        />

        {/* Two bridges crossing the board */}
        {[bridgeLeftX, bridgeRightX].map((bx, bi) => (
          <polyline
            key={`bridge-${bi}`}
            fill="none"
            stroke="#7c5cc4"
            strokeWidth={3.2}
            strokeLinecap="round"
            opacity={0.55}
            points={bx.map((x, i) => `${x},${courseY[i]}`).join(" ")}
          />
        ))}

        {/* Blurred glow echo of each course — tracks the live modal displacement */}
        <g filter="url(#dulGlow)">
          {Array.from({ length: COURSES }, (_, i) => (
            <polyline
              key={`glow-${i}`}
              ref={(el) => {
                glowRefs.current[i] = el;
              }}
              fill="none"
              stroke={i % 7 === 0 ? "#c4b5fd" : "#a78bfa"}
              strokeWidth={2.2}
              strokeLinecap="round"
              opacity={0.05}
              points={`${courseX0[i]},${courseY[i]} ${courseX1[i]},${courseY[i]}`}
            />
          ))}
        </g>

        {/* Bridge posts (where each course crosses a bridge) */}
        {courseY.map((y, i) => (
          <g key={`posts-${i}`}>
            <circle cx={bridgeLeftX[i]} cy={y} r={2.6} fill="#d6cafd" opacity={0.5} />
            <circle cx={bridgeRightX[i]} cy={y} r={2.6} fill="#d6cafd" opacity={0.5} />
          </g>
        ))}

        {/* Crisp courses — each a taut set of strings; the vertices ARE the sound */}
        {Array.from({ length: COURSES }, (_, i) => (
          <polyline
            key={`course-${i}`}
            ref={(el) => {
              lineRefs.current[i] = el;
            }}
            fill="none"
            stroke={i % 7 === 0 ? "#e6ddff" : "#c3b1fb"}
            strokeWidth={i % 7 === 0 ? 2 : 1.5}
            strokeLinecap="round"
            strokeLinejoin="round"
            opacity={0.55}
            points={`${courseX0[i]},${courseY[i]} ${courseX1[i]},${courseY[i]}`}
          />
        ))}
      </svg>

      {/* ── Header overlay ──────────────────────────────────────────────── */}
      <div className="pointer-events-none relative z-10 max-w-xl p-6">
        <p className="font-mono text-xs uppercase tracking-[0.18em] text-muted-foreground">
          Modal-synthesis hammered dulcimer
        </p>
        <h1 className="mt-2 text-2xl font-semibold tracking-tight text-foreground">
          Dulcet
        </h1>
        <p className="mt-2 text-base text-muted-foreground">
          Strike the crossing courses. Each struck string rings as a bank of
          decaying modes — the vibrating line you watch is the exact modal decay
          you hear.
        </p>
        <p className="mt-2 text-sm text-muted-foreground">
          Strike the strings · faster taps roll · strike near the ends for a
          brighter tone · two fingers = two hammers · hold Shift or tap Palm to mute.
        </p>
      </div>

      {/* ── Palm-mute toggle ────────────────────────────────────────────── */}
      <button
        type="button"
        onClick={toggleDamp}
        aria-pressed={dampUI}
        className={
          dampUI
            ? "absolute left-4 bottom-6 z-20 min-h-[44px] rounded-md bg-primary px-6 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90"
            : "absolute left-4 bottom-6 z-20 min-h-[44px] rounded-md border border-border bg-background/60 px-4 text-sm text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
        }
      >
        {dampUI ? "Palm · muting" : "Palm"}
      </button>

      {/* ── Tap-to-play hint (until first touch) ────────────────────────── */}
      {!started && !error && (
        <div className="pointer-events-none absolute inset-x-0 bottom-24 z-10 flex justify-center">
          <p className="text-base text-muted-foreground">
            Tap or drag across the strings to play
          </p>
        </div>
      )}

      {/* ── Error notice ────────────────────────────────────────────────── */}
      {error && (
        <div className="absolute inset-x-0 bottom-24 z-20 flex justify-center px-6">
          <p className="max-w-md text-center text-sm text-destructive">{error}</p>
        </div>
      )}

      {/* ── Design notes affordance ─────────────────────────────────────── */}
      <button
        type="button"
        onClick={() => setShowNotes((s) => !s)}
        className="absolute right-4 top-4 z-20 min-h-[44px] rounded-md border border-border bg-background/60 px-4 text-sm text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
      >
        {showNotes ? "Close" : "Design notes"}
      </button>

      {showNotes && (
        <div className="absolute inset-0 z-30 flex items-start justify-center overflow-y-auto bg-black/50 p-6 backdrop-blur-sm">
          <div className="mt-16 max-w-lg rounded-lg border border-border bg-background p-6 shadow-lg">
            <h2 className="mb-3 text-xl font-semibold tracking-tight text-foreground">
              Design notes
            </h2>
            <div className="space-y-3 text-sm leading-relaxed text-muted-foreground">
              <p>
                Each struck course rings by{" "}
                <span className="text-foreground">modal synthesis</span>: a small
                bank of {"decaying resonant modes"} — sine partials at slightly
                inharmonic ratios, each with its own decay time. A short strike
                excites them all at once. Where a real hammered dulcimer stores
                that energy in steel wire, this stores it in a handful of enveloped{" "}
                <span className="font-mono">OscillatorNode</span>s summed into a
                limiter — no samples, no libraries.
              </p>
              <p>
                <span className="text-foreground">Strike position</span> genuinely
                changes timbre, not just volume: each mode <em>k</em> is weighted by{" "}
                <span className="font-mono">|sin(k·π·pos)|</span> — the classic
                struck-string spectrum. Hit the middle and even modes vanish, the
                fundamental dominates, the tone is round; hit near an end and the
                high partials ring through, bright and thin.{" "}
                <span className="text-foreground">Strike velocity</span> tilts the
                spectrum — a hard hammer flattens the roll-off and pushes energy
                into the upper modes (brighter); a soft one darkens it.
              </p>
              <p>
                <span className="text-foreground">See = hear.</span> The same mode
                bank that feeds the oscillators also draws the string: each course
                is a <span className="font-mono">&lt;polyline&gt;</span> whose
                vertices are the superposed modal displacement{" "}
                <span className="font-mono">Σ aₖ·sin(kπx)·cos(ωₖt)·e^(−t/τₖ)</span>.
                The mode shapes, their strike-weighted amplitudes and their decay
                envelopes are exactly the acoustic ones — only the oscillation is
                slowed to a visible few Hz so you can watch each mode beat and
                settle in wall-clock time with the sound.
              </p>
              <p>
                <span className="text-foreground">Played, not poked.</span> Fast
                taps and drags roll the tremolo a dulcimer is known for, with
                per-strike velocity from pointer speed; two fingers give you two
                hammers (multi-touch). Hold <span className="font-mono">Shift</span>{" "}
                or tap <em>Palm</em> to mute — shortening every decay for a choked,
                expressive damp. It plays a soft seeded phrase on load and yields
                the instant you touch it.
              </p>
              <p>
                Sixteen-voice cap through a compressor/limiter; all randomness runs
                through a seeded mulberry32 PRNG (0x6568); the whole instrument is
                drawn in SVG with zero GPU. See{" "}
                <em>Physical Audio Signal Processing</em> (J.O. Smith) and Adrien&rsquo;s
                modal-synthesis formulation; the{" "}
                <em>Review of String Instrument Synthesis Methods</em> (TISMIR,
                2026) finds physical-modeling — modal among its named families —
                dominates the real-time interactive landscape.
              </p>
            </div>
          </div>
        </div>
      )}
    </main>
  );
}
