"use client";

import { useEffect, useRef, useState } from "react";

// ════════════════════════════════════════════════════════════════════════════
// Ruledline (6584)
//
// ONE QUESTION: What if a Xenakis-style ruled architectural surface were a
// playable instrument — where the straight generator lines you reshape by hand
// ARE the string glissandi you hear?
//
// A ruled surface is a family of straight lines ("generators"): each generator
// connects a point A(t) on one director curve to the matching point B(t) on a
// second director curve. Bow the two directors by dragging their control points
// and the whole fan of straight lines twists and converges — architecture in
// motion. A playhead sweeps left→right across the fan; the instant it crosses a
// generator, that line SOUNDS as a string glissando gliding from the pitch of
// its low endpoint to the pitch of its high endpoint. A sweep-dot rides the line
// bottom→top in lock-step with the portamento — the slope and length of the line
// you SEE is literally the glissando you HEAR. See = hear, welded.
//
// This ports the method of Xenakis' Philips Pavilion (1958) — reconstructed as
// ruled surfaces whose governing straight lines generate string glissandi
// (arXiv:2607.06589, 2026) — into a live, hand-played browser instrument. The
// overlapping glissando cluster near the playhead is the string-mass texture of
// Xenakis' Metastaseis (1954).
//
// INPUT   Pointer Events (mouse + multi-touch). Drag a control handle to sculpt
//         a director; drag empty space to scrub the playhead by hand.
// OUTPUT  Pure SVG. Zero GPU — every generator is a <line>; no canvas/WebGL.
// AUDIO   Per generator: a sawtooth → lowpass voice with a frequency portamento
//         (linearRampToValueAtTime), short attack/release, capped polyphony with
//         oldest-voice stealing, into a seeded convolution reverb + limiter.
//
// Determinism: all randomness runs through mulberry32 seeded 0x6584. No
// Math.random / Date.now — time is performance.now / requestAnimationFrame.
// ════════════════════════════════════════════════════════════════════════════

// ── Seeded PRNG (mulberry32) ────────────────────────────────────────────────
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

function clamp(x: number, lo: number, hi: number): number {
  return x < lo ? lo : x > hi ? hi : x;
}

type Pt = { x: number; y: number };

// ── Geometry ────────────────────────────────────────────────────────────────
const VIEW_W = 1000;
const VIEW_H = 680;
const G = 24; // generator lines
const PITCH_TOP = 96; // screen-Y of the highest pitch
const PITCH_BOT = 588; // screen-Y of the lowest pitch
const HANDLE_HIT = 46; // view-units: pointerdown radius to grab a handle

// ── Pitch map: screen-Y → lightly scale-snapped frequency ───────────────────
const BASE_HZ = 130.81; // C3
const SPAN_SEMI = 31; // ~2.6 octaves
const MAJOR = [0, 2, 4, 5, 7, 9, 11];
function snapSemi(s: number): number {
  const oct = Math.floor(s / 12);
  const within = s - oct * 12;
  let best = MAJOR[0];
  let bd = Infinity;
  for (const m of MAJOR) {
    const d = Math.abs(m - within);
    if (d < bd) {
      bd = d;
      best = m;
    }
  }
  if (Math.abs(12 - within) < bd) best = 12;
  return oct * 12 + best;
}
function freqFromY(y: number): number {
  const frac = clamp((PITCH_BOT - y) / (PITCH_BOT - PITCH_TOP), 0, 1);
  return BASE_HZ * Math.pow(2, snapSemi(frac * SPAN_SEMI) / 12);
}

// ── Catmull-Rom director evaluation (curve passes through every handle) ──────
function cr(p0: Pt, p1: Pt, p2: Pt, p3: Pt, t: number): Pt {
  const t2 = t * t;
  const t3 = t2 * t;
  return {
    x:
      0.5 *
      (2 * p1.x +
        (-p0.x + p2.x) * t +
        (2 * p0.x - 5 * p1.x + 4 * p2.x - p3.x) * t2 +
        (-p0.x + 3 * p1.x - 3 * p2.x + p3.x) * t3),
    y:
      0.5 *
      (2 * p1.y +
        (-p0.y + p2.y) * t +
        (2 * p0.y - 5 * p1.y + 4 * p2.y - p3.y) * t2 +
        (-p0.y + 3 * p1.y - 3 * p2.y + p3.y) * t3),
  };
}
function evalDirector(pts: Pt[], t: number): Pt {
  const n = pts.length;
  if (n === 1) return pts[0];
  const seg = clamp(t, 0, 1) * (n - 1);
  let i = Math.floor(seg);
  if (i >= n - 1) i = n - 2;
  const lt = seg - i;
  return cr(
    pts[Math.max(0, i - 1)],
    pts[i],
    pts[i + 1],
    pts[Math.min(n - 1, i + 2)],
    lt,
  );
}

// ── Colour: violet ramp across the generator fan ────────────────────────────
function genColor(t: number): string {
  const l = 62 + t * 20; // 62 → 82
  const s = 82 - t * 18;
  return `hsl(${268 - t * 10} ${s}% ${l}%)`;
}

const MAX_VOICES = 10;
const MAX_SWEEP = 12;
const GLIDE = 0.36; // s — portamento time == sweep-dot travel time
const HOLD = 0.16;
const RELEASE = 0.26;
const FIRE_COOLDOWN = 0.11; // s per generator

// Handle homes: 3 for the top director (A), 3 for the bottom director (B).
const HOME: Pt[] = [
  { x: 150, y: 168 },
  { x: 500, y: 120 },
  { x: 850, y: 188 },
  { x: 150, y: 520 },
  { x: 500, y: 566 },
  { x: 850, y: 486 },
];

export default function RuledlinePage() {
  const svgRef = useRef<SVGSVGElement | null>(null);
  const genRefs = useRef<(SVGLineElement | null)[]>([]);
  const glowRefs = useRef<(SVGLineElement | null)[]>([]);
  const dirRefs = useRef<(SVGPathElement | null)[]>([]);
  const handleRefs = useRef<(SVGCircleElement | null)[]>([]);
  const sweepRefs = useRef<(SVGCircleElement | null)[]>([]);
  const playRef = useRef<SVGLineElement | null>(null);
  const playHeadRef = useRef<SVGCircleElement | null>(null);

  const [started, setStarted] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showNotes, setShowNotes] = useState(false);

  useEffect(() => {
    const svgMaybe = svgRef.current;
    if (!svgMaybe) return;
    const svg: SVGSVGElement = svgMaybe;

    try {
      const rng = makeRng(0x6584);
      const reduced =
        typeof window !== "undefined" &&
        window.matchMedia("(prefers-reduced-motion: reduce)").matches;

      // ── Warp parameters per handle (seeded breathing around its home) ────
      const home: Pt[] = HOME.map((p) => ({ x: p.x, y: p.y }));
      const warp = HOME.map(() => {
        const ampBase = reduced ? 6 : 22;
        return {
          ax: ampBase * (0.6 + rng()),
          ay: ampBase * (0.6 + rng()),
          fx: 0.05 + rng() * 0.09,
          fy: 0.05 + rng() * 0.09,
          px: rng() * Math.PI * 2,
          py: rng() * Math.PI * 2,
        };
      });

      // Live handle positions (home + breathing), rebuilt each frame.
      const pos: Pt[] = HOME.map((p) => ({ x: p.x, y: p.y }));
      const dragged = new Uint8Array(6); // handle currently held?

      function rebuildHandles(t: number) {
        for (let i = 0; i < 6; i++) {
          if (dragged[i]) {
            pos[i].x = home[i].x;
            pos[i].y = home[i].y;
          } else {
            const w = warp[i];
            pos[i].x = home[i].x + w.ax * Math.sin(2 * Math.PI * w.fx * t + w.px);
            pos[i].y = home[i].y + w.ay * Math.sin(2 * Math.PI * w.fy * t + w.py);
          }
        }
      }

      const dirA = (): Pt[] => [pos[0], pos[1], pos[2]];
      const dirB = (): Pt[] => [pos[3], pos[4], pos[5]];

      // Generator endpoints, recomputed each frame.
      const gA: Pt[] = Array.from({ length: G }, () => ({ x: 0, y: 0 }));
      const gB: Pt[] = Array.from({ length: G }, () => ({ x: 0, y: 0 }));
      const genGlow = new Float32Array(G);
      const lastFired = new Float32Array(G).fill(-100);

      function rebuildGenerators() {
        const A = dirA();
        const B = dirB();
        for (let i = 0; i < G; i++) {
          const t = i / (G - 1);
          const a = evalDirector(A, t);
          const b = evalDirector(B, t);
          gA[i].x = a.x;
          gA[i].y = a.y;
          gB[i].x = b.x;
          gB[i].y = b.y;
        }
      }

      // ── Audio graph (built lazily on first gesture) ──────────────────────
      type Voice = {
        osc: OscillatorNode;
        lp: BiquadFilterNode;
        g: GainNode;
        end: number;
      };
      type Audio = {
        ctx: AudioContext;
        input: GainNode;
        master: GainNode;
        comp: DynamicsCompressorNode;
        conv: ConvolverNode;
        wet: GainNode;
        dry: GainNode;
        voices: Voice[];
      };
      let audio: Audio | null = null;

      function buildReverb(ctx: AudioContext): AudioBuffer {
        const sr = ctx.sampleRate;
        const len = Math.floor(sr * 1.8);
        const ir = ctx.createBuffer(2, len, sr);
        for (let ch = 0; ch < 2; ch++) {
          const d = ir.getChannelData(ch);
          for (let i = 0; i < len; i++) {
            const x = i / len;
            d[i] = (rng() * 2 - 1) * Math.pow(1 - x, 2.6) * Math.exp(-2.8 * x);
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
        const input = ctx.createGain();
        input.gain.value = 1;
        const dry = ctx.createGain();
        dry.gain.value = 0.8;
        const wet = ctx.createGain();
        wet.gain.value = 0.4;
        const conv = ctx.createConvolver();
        conv.buffer = buildReverb(ctx);
        const comp = ctx.createDynamicsCompressor();
        comp.threshold.value = -12;
        comp.knee.value = 8;
        comp.ratio.value = 18;
        comp.attack.value = 0.003;
        comp.release.value = 0.2;
        const master = ctx.createGain();
        master.gain.value = 0.16;

        input.connect(dry);
        dry.connect(comp);
        input.connect(conv);
        conv.connect(wet);
        wet.connect(comp);
        comp.connect(master);
        master.connect(ctx.destination);

        audio = { ctx, input, master, comp, conv, wet, dry, voices: [] };
        return audio;
      }

      function stopVoice(v: Voice) {
        try {
          v.osc.stop();
        } catch {
          /* already stopped */
        }
        try {
          v.osc.disconnect();
          v.lp.disconnect();
          v.g.disconnect();
        } catch {
          /* already gone */
        }
      }

      // Fire generator i as a string glissando (low pitch → high pitch).
      function fireGenerator(i: number, tNow: number) {
        genGlow[i] = 1;
        lastFired[i] = tNow;
        const a = gA[i];
        const b = gB[i];
        const low = a.y > b.y ? a : b; // screen-lower endpoint = lower pitch
        const high = a.y > b.y ? b : a;
        const startF = freqFromY(low.y);
        const endF = freqFromY(high.y);

        const au = audio;
        if (!au) return;
        if (au.ctx.state === "suspended") void au.ctx.resume();
        // Steal oldest if at the polyphony cap.
        if (au.voices.length >= MAX_VOICES) {
          const old = au.voices.shift();
          if (old) stopVoice(old);
        }
        const now = au.ctx.currentTime;
        const osc = au.ctx.createOscillator();
        osc.type = "sawtooth";
        const lp = au.ctx.createBiquadFilter();
        lp.type = "lowpass";
        lp.Q.value = 0.8;
        const g = au.ctx.createGain();
        g.gain.value = 0;

        osc.frequency.setValueAtTime(startF, now);
        osc.frequency.linearRampToValueAtTime(endF, now + GLIDE); // portamento
        lp.frequency.setValueAtTime(clamp(startF * 3, 400, 6000), now);
        lp.frequency.linearRampToValueAtTime(
          clamp(endF * 3.2, 400, 7000),
          now + GLIDE,
        );

        const peak = 0.5;
        g.gain.setValueAtTime(0, now);
        g.gain.linearRampToValueAtTime(peak, now + 0.02);
        g.gain.setValueAtTime(peak, now + GLIDE + HOLD);
        g.gain.linearRampToValueAtTime(0.0001, now + GLIDE + HOLD + RELEASE);

        osc.connect(lp);
        lp.connect(g);
        g.connect(au.input);
        const end = now + GLIDE + HOLD + RELEASE + 0.02;
        osc.start(now);
        osc.stop(end);
        const v: Voice = { osc, lp, g, end };
        osc.onended = () => {
          const idx = au.voices.indexOf(v);
          if (idx >= 0) au.voices.splice(idx, 1);
          try {
            osc.disconnect();
            lp.disconnect();
            g.disconnect();
          } catch {
            /* already gone */
          }
        };
        au.voices.push(v);

        // Spawn a sweep-dot that rides the line low→high over GLIDE.
        spawnSweep(i, tNow);
      }

      // ── Sweep-dot pool (visual portamento tracer) ────────────────────────
      const sweepGen = new Int16Array(MAX_SWEEP).fill(-1);
      const sweepT0 = new Float32Array(MAX_SWEEP);
      let sweepCursor = 0;
      function spawnSweep(i: number, tNow: number) {
        // Prefer a free slot; else overwrite round-robin (oldest-ish).
        let slot = -1;
        for (let s = 0; s < MAX_SWEEP; s++) {
          if (sweepGen[s] < 0) {
            slot = s;
            break;
          }
        }
        if (slot < 0) {
          slot = sweepCursor;
          sweepCursor = (sweepCursor + 1) % MAX_SWEEP;
        }
        sweepGen[slot] = i;
        sweepT0[slot] = tNow;
      }

      // ── Playhead ─────────────────────────────────────────────────────────
      const SWEEP_PERIOD = reduced ? 14 : 9; // s for one left→right pass
      let playX = 40;
      let prevX = 40;
      let manual = false;
      let scrubTarget = 40;

      // ── Timing ─────────────────────────────────────────────────────────────
      const startPerf = performance.now();
      function nowSec(): number {
        return (performance.now() - startPerf) / 1000;
      }
      let prevT = nowSec();

      function advancePlayhead(dt: number) {
        prevX = playX;
        if (manual) {
          playX += (scrubTarget - playX) * Math.min(1, dt * 12);
        } else {
          playX += (VIEW_W / SWEEP_PERIOD) * dt;
          if (playX > VIEW_W - 20) {
            playX = 20;
            prevX = 20; // wrap: don't fire the whole fan at once
          }
        }
      }

      function detectCrossings(t: number) {
        const lo = Math.min(prevX, playX);
        const hi = Math.max(prevX, playX);
        for (let i = 0; i < G; i++) {
          const mid = (gA[i].x + gB[i].x) / 2;
          if (mid > lo && mid <= hi && t - lastFired[i] > FIRE_COOLDOWN) {
            fireGenerator(i, t);
          }
        }
      }

      // ── Draw straight to the DOM ─────────────────────────────────────────
      function draw(t: number) {
        for (let i = 0; i < G; i++) {
          const a = gA[i];
          const b = gB[i];
          const gl = genGlow[i];
          genGlow[i] = gl * 0.9;
          const el = genRefs.current[i];
          if (el) {
            el.setAttribute("x1", a.x.toFixed(1));
            el.setAttribute("y1", a.y.toFixed(1));
            el.setAttribute("x2", b.x.toFixed(1));
            el.setAttribute("y2", b.y.toFixed(1));
            el.setAttribute("stroke-width", (1.4 + gl * 3.2).toFixed(2));
            el.setAttribute("opacity", (0.5 + gl * 0.5).toFixed(3));
          }
          const gel = glowRefs.current[i];
          if (gel) {
            gel.setAttribute("x1", a.x.toFixed(1));
            gel.setAttribute("y1", a.y.toFixed(1));
            gel.setAttribute("x2", b.x.toFixed(1));
            gel.setAttribute("y2", b.y.toFixed(1));
            gel.setAttribute("opacity", (0.06 + gl * 0.5).toFixed(3));
          }
        }

        // Director guide curves (24-sample polylined path).
        const A = dirA();
        const B = dirB();
        for (let d = 0; d < 2; d++) {
          const pts = d === 0 ? A : B;
          let path = "";
          for (let k = 0; k <= 24; k++) {
            const p = evalDirector(pts, k / 24);
            path += (k === 0 ? "M" : "L") + p.x.toFixed(1) + " " + p.y.toFixed(1);
          }
          const el = dirRefs.current[d];
          if (el) el.setAttribute("d", path);
        }

        // Handles.
        for (let i = 0; i < 6; i++) {
          const el = handleRefs.current[i];
          if (el) {
            el.setAttribute("cx", pos[i].x.toFixed(1));
            el.setAttribute("cy", pos[i].y.toFixed(1));
            el.setAttribute("r", dragged[i] ? "11" : "7");
          }
        }

        // Sweep-dots — position along the current line, low→high.
        for (let s = 0; s < MAX_SWEEP; s++) {
          const el = sweepRefs.current[s];
          if (!el) continue;
          const gi = sweepGen[s];
          if (gi < 0) {
            el.setAttribute("opacity", "0");
            continue;
          }
          const tau = (t - sweepT0[s]) / GLIDE;
          if (tau >= 1) {
            sweepGen[s] = -1;
            el.setAttribute("opacity", "0");
            continue;
          }
          const a = gA[gi];
          const b = gB[gi];
          const low = a.y > b.y ? a : b;
          const high = a.y > b.y ? b : a;
          const x = low.x + (high.x - low.x) * tau;
          const y = low.y + (high.y - low.y) * tau;
          el.setAttribute("cx", x.toFixed(1));
          el.setAttribute("cy", y.toFixed(1));
          el.setAttribute("opacity", (0.85 * (1 - tau * 0.4)).toFixed(3));
        }

        // Playhead.
        const pl = playRef.current;
        if (pl) {
          pl.setAttribute("x1", playX.toFixed(1));
          pl.setAttribute("x2", playX.toFixed(1));
        }
        const ph = playHeadRef.current;
        if (ph) ph.setAttribute("cx", playX.toFixed(1));
      }

      // ── Main loop ────────────────────────────────────────────────────────
      let raf = 0;
      function frame() {
        const t = nowSec();
        const dt = Math.min(0.05, t - prevT);
        prevT = t;
        rebuildHandles(t);
        rebuildGenerators();
        advancePlayhead(dt);
        detectCrossings(t);
        draw(t);
        raf = requestAnimationFrame(frame);
      }
      raf = requestAnimationFrame(frame);

      // ── Pointer interaction ────────────────────────────────────────────────
      function toView(e: PointerEvent): Pt | null {
        const pt = svg.createSVGPoint();
        pt.x = e.clientX;
        pt.y = e.clientY;
        const ctm = svg.getScreenCTM();
        if (!ctm) return null;
        const p = pt.matrixTransform(ctm.inverse());
        return { x: p.x, y: p.y };
      }

      // pointerId → handle index, or -1 for a playhead scrub.
      const active = new Map<number, number>();

      function nearestHandle(v: Pt): number {
        let best = -1;
        let bd = HANDLE_HIT * HANDLE_HIT;
        for (let i = 0; i < 6; i++) {
          const dx = v.x - pos[i].x;
          const dy = v.y - pos[i].y;
          const d = dx * dx + dy * dy;
          if (d < bd) {
            bd = d;
            best = i;
          }
        }
        return best;
      }

      function onDown(e: PointerEvent) {
        e.preventDefault();
        ensureAudio();
        if (!started) setStarted(true);
        const v = toView(e);
        if (!v) return;
        try {
          svg.setPointerCapture(e.pointerId);
        } catch {
          /* capture optional */
        }
        const h = nearestHandle(v);
        if (h >= 0) {
          active.set(e.pointerId, h);
          dragged[h] = 1;
          home[h].x = clamp(v.x, 40, VIEW_W - 40);
          home[h].y = clamp(v.y, 40, VIEW_H - 40);
        } else {
          active.set(e.pointerId, -1);
          manual = true;
          scrubTarget = clamp(v.x, 20, VIEW_W - 20);
        }
      }

      function onMove(e: PointerEvent) {
        const role = active.get(e.pointerId);
        if (role === undefined) return;
        const v = toView(e);
        if (!v) return;
        if (role >= 0) {
          home[role].x = clamp(v.x, 40, VIEW_W - 40);
          home[role].y = clamp(v.y, 40, VIEW_H - 40);
        } else {
          scrubTarget = clamp(v.x, 20, VIEW_W - 20);
        }
      }

      function onUp(e: PointerEvent) {
        const role = active.get(e.pointerId);
        if (role !== undefined) {
          if (role >= 0) dragged[role] = 0;
          active.delete(e.pointerId);
          // No scrub pointers left → resume auto-sweep from where we are.
          let anyScrub = false;
          active.forEach((r) => {
            if (r < 0) anyScrub = true;
          });
          if (!anyScrub) manual = false;
        }
        try {
          svg.releasePointerCapture(e.pointerId);
        } catch {
          /* nothing captured */
        }
      }

      svg.addEventListener("pointerdown", onDown);
      svg.addEventListener("pointermove", onMove);
      svg.addEventListener("pointerup", onUp);
      svg.addEventListener("pointercancel", onUp);

      // ── Teardown ────────────────────────────────────────────────────────
      return () => {
        cancelAnimationFrame(raf);
        svg.removeEventListener("pointerdown", onDown);
        svg.removeEventListener("pointermove", onMove);
        svg.removeEventListener("pointerup", onUp);
        svg.removeEventListener("pointercancel", onUp);
        if (audio) {
          try {
            for (const v of audio.voices) stopVoice(v);
            audio.master.disconnect();
            audio.comp.disconnect();
            audio.conv.disconnect();
            audio.wet.disconnect();
            audio.dry.disconnect();
            audio.input.disconnect();
            void audio.ctx.close();
          } catch {
            /* already torn down */
          }
          audio = null;
        }
      };
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "The ruled surface failed to rise.",
      );
      return;
    }
    // Mount-once engine; all live state lives in refs/closures above.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <main className="relative flex min-h-[calc(100dvh-3rem)] w-full flex-col overflow-hidden bg-[#07040e]">
      {/* ── Ruled surface (pure SVG, zero GPU) ──────────────────────────── */}
      <svg
        ref={svgRef}
        viewBox={`0 0 ${VIEW_W} ${VIEW_H}`}
        preserveAspectRatio="xMidYMid meet"
        className="absolute inset-0 h-full w-full touch-none select-none"
        style={{ cursor: "crosshair" }}
        aria-label="A playable ruled architectural surface"
      >
        <defs>
          <radialGradient id="rlBg" cx="50%" cy="42%" r="78%">
            <stop offset="0%" stopColor="#160b2c" />
            <stop offset="60%" stopColor="#0b0713" />
            <stop offset="100%" stopColor="#05030a" />
          </radialGradient>
          <filter id="rlGlow" x="-20%" y="-20%" width="140%" height="140%">
            <feGaussianBlur stdDeviation="3.4" />
          </filter>
        </defs>

        <rect x="0" y="0" width={VIEW_W} height={VIEW_H} fill="url(#rlBg)" />

        {/* Blurred echo of every generator — brightens as it sounds */}
        <g filter="url(#rlGlow)">
          {Array.from({ length: G }, (_, i) => (
            <line
              key={`glow-${i}`}
              ref={(el) => {
                glowRefs.current[i] = el;
              }}
              stroke={genColor(i / (G - 1))}
              strokeWidth={6}
              strokeLinecap="round"
              opacity={0.06}
              x1={0}
              y1={0}
              x2={0}
              y2={0}
            />
          ))}
        </g>

        {/* Straight generator lines — the ruled surface you play */}
        {Array.from({ length: G }, (_, i) => (
          <line
            key={`gen-${i}`}
            ref={(el) => {
              genRefs.current[i] = el;
            }}
            stroke={genColor(i / (G - 1))}
            strokeWidth={1.5}
            strokeLinecap="round"
            opacity={0.55}
            x1={0}
            y1={0}
            x2={0}
            y2={0}
          />
        ))}

        {/* Director guide curves (faint architectural edges) */}
        {[0, 1].map((d) => (
          <path
            key={`dir-${d}`}
            ref={(el) => {
              dirRefs.current[d] = el;
            }}
            fill="none"
            stroke="#ede9fe"
            strokeWidth={1.4}
            strokeDasharray="2 7"
            strokeLinecap="round"
            opacity={0.35}
          />
        ))}

        {/* Sweep-dots — ride each sounding line low→high with the portamento */}
        {Array.from({ length: MAX_SWEEP }, (_, s) => (
          <circle
            key={`sweep-${s}`}
            ref={(el) => {
              sweepRefs.current[s] = el;
            }}
            r={5}
            fill="#f5f3ff"
            opacity={0}
          />
        ))}

        {/* Playhead */}
        <line
          ref={playRef}
          x1={40}
          y1={40}
          x2={40}
          y2={VIEW_H - 40}
          stroke="#c4b5fd"
          strokeWidth={2}
          opacity={0.55}
        />
        <circle ref={playHeadRef} cx={40} cy={54} r={5} fill="#ede9fe" opacity={0.8} />

        {/* Director control handles — drag to sculpt the surface */}
        {Array.from({ length: 6 }, (_, i) => (
          <circle
            key={`h-${i}`}
            ref={(el) => {
              handleRefs.current[i] = el;
            }}
            cx={HOME[i].x}
            cy={HOME[i].y}
            r={7}
            fill="#0b0713"
            stroke="#c4b5fd"
            strokeWidth={2.2}
          />
        ))}
      </svg>

      {/* ── Header overlay ──────────────────────────────────────────────── */}
      <div className="pointer-events-none relative z-10 max-w-xl p-6">
        <p className="font-mono text-xs uppercase tracking-[0.18em] text-muted-foreground">
          Ruled surface · string glissandi
        </p>
        <h1 className="mt-2 text-2xl font-semibold tracking-tight text-foreground">
          Ruledline
        </h1>
        <p className="mt-2 text-base text-muted-foreground">
          Xenakis&rsquo; Philips Pavilion as an instrument: bow the two director
          curves and the fan of straight generator lines twists in real time. A
          playhead sweeps across them, and each line you cross sings as a string
          glissando — the slope you see is the glide you hear.
        </p>
      </div>

      {/* ── Hint (until first touch) ────────────────────────────────────── */}
      {!started && !error && (
        <div className="pointer-events-none absolute inset-x-0 bottom-16 z-10 flex justify-center px-6">
          <p className="text-base text-muted-foreground">
            Drag a glowing handle to sculpt the surface · drag empty space to
            scrub the playhead
          </p>
        </div>
      )}

      {/* ── Error notice ────────────────────────────────────────────────── */}
      {error && (
        <div className="absolute inset-x-0 bottom-16 z-20 flex justify-center px-6">
          <p className="max-w-md text-center text-sm text-destructive">
            Audio is unavailable in this browser, so Ruledline is running silent —
            the surface still moves. ({error})
          </p>
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
                A <span className="text-foreground">ruled surface</span> is a
                surface swept by a moving straight line. Here two{" "}
                <span className="text-foreground">director</span> curves — a top
                edge and a bottom edge, each a Catmull-Rom spline through three
                draggable handles — are sampled at matching parameters{" "}
                <span className="font-mono">t</span>, and the{" "}
                <span className="font-mono">{G}</span> straight{" "}
                <span className="text-foreground">generator</span> lines connect
                A(t) to B(t). Bow a director and every generator re-aims at once:
                the hyperbolic-paraboloid fan you watch twist is honest geometry,
                nothing faked for the eye.
              </p>
              <p>
                The playhead sweeps left→right; the instant it crosses a
                generator that line sounds a{" "}
                <span className="text-foreground">string glissando</span> whose
                pitch glides (a sawtooth voice with a{" "}
                <span className="font-mono">linearRampToValueAtTime</span>{" "}
                portamento through a lowpass) from the pitch of its screen-low
                endpoint to its high endpoint. Screen-Y maps to a lightly
                scale-snapped pitch over ~2.6 octaves, so endpoints land
                consonant while the glide stays continuous. A steep line is a fast
                wide glissando; a flat line a steady tone. A bright sweep-dot
                rides each line bottom→top in lock-step with the portamento — the
                <span className="text-foreground"> see = hear weld</span>.
                Generators bunched near the playhead pile into a shifting
                glissando cluster: the string-mass texture of Xenakis&rsquo;{" "}
                <em>Metastaseis</em> (1954).
              </p>
              <p>
                This ports the method of{" "}
                <em>
                  Extending Xenakis: From Architectural Geometry to Sonification
                  of the Philips Pavilion
                </em>{" "}
                (arXiv:2607.06589, 2026), which reconstructs Le Corbusier &amp;
                Xenakis&rsquo; 1958 Brussels-Expo pavilion as ruled surfaces whose
                governing straight lines generate glissandi — into a live,
                hand-played instrument. Polyphony is capped at{" "}
                <span className="font-mono">{MAX_VOICES}</span> voices (oldest
                stolen) into a seeded convolution reverb and a limiter. It plays
                itself on load — a slow seeded warp plus an auto-sweep — and
                yields the instant you touch it. All randomness runs through a
                mulberry32 PRNG seeded <span className="font-mono">0x6584</span>;
                the whole surface is drawn in SVG with zero GPU.
              </p>
            </div>
          </div>
        </div>
      )}
    </main>
  );
}
