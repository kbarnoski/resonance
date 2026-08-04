"use client";

import { useEffect, useRef, useState } from "react";

// ════════════════════════════════════════════════════════════════════════════
// Loomstring (6456)
//
// What if you could PLAY a woven net of strings? A cat's-cradle loom of vector
// lines — eight horizontal strings crossing eight vertical ones — hangs in the
// dark. Poke any intersection and a transverse pulse is injected into BOTH the
// string it lies on: waves race outward along the coupled mesh, and wherever a
// travelling wavefront reaches a crossing it rings a note. The polyline you WATCH
// bend IS the wave state that drives the sound: see = hear, welded.
//
// INPUT   Pointer Events (mouse + touch, setPointerCapture). A played instrument.
// OUTPUT  Pure SVG. Zero GPU — every string is a <polyline> whose vertices are the
//         discretised wave-displacement samples. No canvas, no WebGL.
// TECH    Coupled 1-D wave equations (a lattice of digital-waveguide strings that
//         exchange transverse momentum at every crossing) for the visuals; each
//         crossing rings a hand-built Karplus–Strong plucked voice when a wave
//         front arrives. Position → pitch: row = pitch class (just intonation),
//         column = octave.
// VIBE    Playful, tactile, woven, musical. Not cosmic. String-art you strum.
//
// Determinism: every random draw goes through mulberry32 seeded 0x6456. No
// Math.random, no Date.now — timing is performance.now / requestAnimationFrame.
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

// ── Loom geometry ───────────────────────────────────────────────────────────
const NR = 8; // horizontal strings (rows)
const NC = 8; // vertical strings (columns)
const N = 49; // samples per string (index 0 and N-1 are the fixed frame ends)
const VIEW_W = 1000;
const VIEW_H = 680;
const MARGIN_X = 64;
const MARGIN_Y = 60;
const INNER_W = VIEW_W - 2 * MARGIN_X;
const INNER_H = VIEW_H - 2 * MARGIN_Y;

// Interior sample index each column / row sits on (so crossings land on vertices)
const colIndex: number[] = Array.from({ length: NC }, (_, c) =>
  Math.round(((c + 1) / (NC + 1)) * (N - 1)),
);
const rowIndex: number[] = Array.from({ length: NR }, (_, r) =>
  Math.round(((r + 1) / (NR + 1)) * (N - 1)),
);
// Baseline pixel positions derived from those indices (consistent both ways).
const colX: number[] = colIndex.map((k) => MARGIN_X + (k / (N - 1)) * INNER_W);
const rowY: number[] = rowIndex.map((k) => MARGIN_Y + (k / (N - 1)) * INNER_H);

// ── Pitch map: row = just-intonation pitch class, column = octave ───────────
// Just major scale over an octave. Reversed so the TOP row rings brightest.
const RATIOS = [1, 9 / 8, 5 / 4, 4 / 3, 3 / 2, 5 / 3, 15 / 8, 2];
const BASE_HZ = 65.41; // C2
function ratioOfRow(r: number): number {
  return RATIOS[NR - 1 - r];
}
function octaveOfCol(c: number): number {
  return Math.floor(c / 2); // 0..3
}

// ── Wave-simulation constants ───────────────────────────────────────────────
const C2 = 0.28; // Courant² — propagation speed² in sample units (<1 = stable)
const DAMP = 0.9955; // global per-step decay
const COUPLING = 0.19; // transverse momentum exchange at each crossing
const AMP_FULL = 46; // px per unit displacement
const AMP_REDUCED = 17;
const U_CLAMP = 2.2; // hard displacement clamp — keeps a big strum bounded
const RING_ON = 0.11; // displacement magnitude that fires a crossing note
const RING_OFF = 0.045; // hysteresis release
const NODE_COOLDOWN = 0.13; // s between re-triggers of one crossing
const IDLE_PERIOD = 2.05; // s between idle ripples
const IDLE_QUIET = 3.8; // s of silence after a touch before idle resumes
const MAX_VOICES = 22;

export default function LoomstringPage() {
  const svgRef = useRef<SVGSVGElement | null>(null);
  const hRefs = useRef<(SVGPolylineElement | null)[]>([]);
  const vRefs = useRef<(SVGPolylineElement | null)[]>([]);
  const hGlowRefs = useRef<(SVGPolylineElement | null)[]>([]);
  const vGlowRefs = useRef<(SVGPolylineElement | null)[]>([]);
  const nodeRefs = useRef<(SVGCircleElement | null)[]>([]);

  const [started, setStarted] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showNotes, setShowNotes] = useState(false);

  useEffect(() => {
    const svgMaybe = svgRef.current;
    if (!svgMaybe) return;
    const svg: SVGSVGElement = svgMaybe;

    try {
      const rng = makeRng(0x6456);
      const reducedMotion =
        typeof window !== "undefined" &&
        window.matchMedia("(prefers-reduced-motion: reduce)").matches;
      const AMP = reducedMotion ? AMP_REDUCED : AMP_FULL;
      const injScale = reducedMotion ? 0.5 : 1;

      // ── Wave state: displacement u and velocity v, per string, per sample ──
      const uH: Float32Array[] = Array.from({ length: NR }, () => new Float32Array(N));
      const vH: Float32Array[] = Array.from({ length: NR }, () => new Float32Array(N));
      const uV: Float32Array[] = Array.from({ length: NC }, () => new Float32Array(N));
      const vV: Float32Array[] = Array.from({ length: NC }, () => new Float32Array(N));

      // Per-crossing ring state
      const nodeHot = new Uint8Array(NR * NC);
      const nodeLast = new Float32Array(NR * NC); // last trigger time (s)
      const nodeGlow = new Float32Array(NR * NC); // visual glow 0..1

      // ── Audio graph (built lazily on first gesture) ─────────────────────
      type Audio = {
        ctx: AudioContext;
        input: GainNode;
        master: GainNode;
        comp: DynamicsCompressorNode;
        conv: ConvolverNode;
        wet: GainNode;
        dry: GainNode;
        octaveBuf: AudioBuffer[];
        voices: number;
      };
      let audio: Audio | null = null;

      function buildKarplus(ctx: AudioContext, freq: number, dur: number): AudioBuffer {
        const sr = ctx.sampleRate;
        const len = Math.floor(sr * dur);
        const buf = ctx.createBuffer(1, len, sr);
        const out = buf.getChannelData(0);
        const p = Math.max(2, Math.round(sr / freq));
        const ring = new Float32Array(p);
        for (let i = 0; i < p; i++) ring[i] = rng() * 2 - 1;
        const decay = 0.9965; // string damping in the feedback loop
        let idx = 0;
        for (let i = 0; i < len; i++) {
          const cur = ring[idx];
          out[i] = cur;
          const nxt = ring[(idx + 1) % p];
          ring[idx] = 0.5 * (cur + nxt) * decay;
          idx = (idx + 1) % p;
        }
        // amplitude envelope: tiny attack, gentle exp tail
        for (let i = 0; i < len; i++) {
          const t = i / len;
          const atk = Math.min(1, i / (sr * 0.004));
          out[i] *= atk * Math.exp(-3.2 * t);
        }
        return buf;
      }

      function buildReverb(ctx: AudioContext): AudioBuffer {
        const sr = ctx.sampleRate;
        const len = Math.floor(sr * 1.7);
        const ir = ctx.createBuffer(2, len, sr);
        for (let ch = 0; ch < 2; ch++) {
          const d = ir.getChannelData(ch);
          for (let i = 0; i < len; i++) {
            const t = i / len;
            d[i] = (rng() * 2 - 1) * Math.pow(1 - t, 2.4) * Math.exp(-3 * t);
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
        dry.gain.value = 0.82;
        const wet = ctx.createGain();
        wet.gain.value = 0.34;
        const conv = ctx.createConvolver();
        conv.buffer = buildReverb(ctx);
        const comp = ctx.createDynamicsCompressor();
        comp.threshold.value = -10;
        comp.knee.value = 6;
        comp.ratio.value = 20;
        comp.attack.value = 0.003;
        comp.release.value = 0.18;
        const master = ctx.createGain();
        master.gain.value = 0.16;

        input.connect(dry);
        dry.connect(comp);
        input.connect(conv);
        conv.connect(wet);
        wet.connect(comp);
        comp.connect(master);
        master.connect(ctx.destination);

        const octaveBuf: AudioBuffer[] = [];
        for (let o = 0; o < 4; o++) {
          octaveBuf.push(buildKarplus(ctx, BASE_HZ * Math.pow(2, o), 0.95));
        }
        audio = { ctx, input, master, comp, conv, wet, dry, octaveBuf, voices: 0 };
        return audio;
      }

      function playNote(r: number, c: number, vel: number) {
        const a = audio;
        if (!a) return;
        if (a.ctx.state === "suspended") void a.ctx.resume();
        if (a.voices >= MAX_VOICES) return;
        const o = octaveOfCol(c);
        const src = a.ctx.createBufferSource();
        src.buffer = a.octaveBuf[o];
        src.playbackRate.value = ratioOfRow(r);
        const g = a.ctx.createGain();
        g.gain.value = clamp(vel, 0.12, 1) * 0.85;
        src.connect(g);
        g.connect(a.input);
        a.voices++;
        src.onended = () => {
          a.voices--;
          try {
            src.disconnect();
            g.disconnect();
          } catch {
            /* already gone */
          }
        };
        src.start();
      }

      // ── Injection: poke a crossing → gaussian pulse into BOTH strings ──────
      function injectString(u: Float32Array, center: number, strength: number) {
        for (let d = -3; d <= 3; d++) {
          const k = center + d;
          if (k <= 0 || k >= N - 1) continue;
          u[k] += strength * Math.exp(-(d * d) / (2 * 1.3 * 1.3));
        }
      }

      function pokeCrossing(r: number, c: number, strength: number, sound: boolean) {
        injectString(uH[r], colIndex[c], strength);
        injectString(uV[c], rowIndex[r], strength);
        if (sound) {
          const node = r * NC + c;
          nodeGlow[node] = 1;
          playNote(r, c, clamp(strength * 0.7 + 0.25, 0.15, 1));
          nodeLast[node] = nowSec();
        }
      }

      function nearestCrossing(px: number, py: number): [number, number] {
        let bc = 0;
        let bd = Infinity;
        for (let c = 0; c < NC; c++) {
          const d = Math.abs(px - colX[c]);
          if (d < bd) {
            bd = d;
            bc = c;
          }
        }
        let br = 0;
        bd = Infinity;
        for (let r = 0; r < NR; r++) {
          const d = Math.abs(py - rowY[r]);
          if (d < bd) {
            bd = d;
            br = r;
          }
        }
        return [br, bc];
      }

      // ── One physics substep ──────────────────────────────────────────────
      function stepStrings(us: Float32Array[], vs: Float32Array[]) {
        for (let s = 0; s < us.length; s++) {
          const u = us[s];
          const v = vs[s];
          for (let k = 1; k < N - 1; k++) {
            const acc = C2 * (u[k - 1] - 2 * u[k] + u[k + 1]);
            v[k] = (v[k] + acc) * DAMP;
          }
        }
      }

      function step() {
        stepStrings(uH, vH);
        stepStrings(uV, vV);
        // Couple: exchange transverse momentum at every crossing.
        for (let r = 0; r < NR; r++) {
          const ci = colIndex; // sample idx on horizontal string
          for (let c = 0; c < NC; c++) {
            const kh = ci[c];
            const kv = rowIndex[r];
            const a = vH[r][kh];
            const b = vV[c][kv];
            const m = 0.5 * (a + b);
            vH[r][kh] = a + COUPLING * (m - a);
            vV[c][kv] = b + COUPLING * (m - b);
          }
        }
        // Integrate displacement + clamp (bounds a big strum).
        for (let r = 0; r < NR; r++) {
          const u = uH[r];
          const v = vH[r];
          for (let k = 1; k < N - 1; k++) u[k] = clamp(u[k] + v[k], -U_CLAMP, U_CLAMP);
        }
        for (let c = 0; c < NC; c++) {
          const u = uV[c];
          const v = vV[c];
          for (let k = 1; k < N - 1; k++) u[k] = clamp(u[k] + v[k], -U_CLAMP, U_CLAMP);
        }
      }

      // ── Ring detection: a wavefront reaching a crossing plays a note ──────
      function detectRings(t: number) {
        for (let r = 0; r < NR; r++) {
          for (let c = 0; c < NC; c++) {
            const node = r * NC + c;
            const disp = Math.abs(uH[r][colIndex[c]]) + Math.abs(uV[c][rowIndex[r]]);
            if (!nodeHot[node] && disp > RING_ON && t - nodeLast[node] > NODE_COOLDOWN) {
              nodeHot[node] = 1;
              nodeLast[node] = t;
              nodeGlow[node] = Math.max(nodeGlow[node], clamp(disp, 0.3, 1));
              playNote(r, c, clamp(disp * 0.8, 0.15, 1));
            } else if (nodeHot[node] && disp < RING_OFF) {
              nodeHot[node] = 0;
            }
          }
        }
      }

      // ── Draw: write polyline points + node glow straight to the DOM ───────
      const bufH: string[] = new Array(N);
      const bufV: string[] = new Array(N);
      function draw() {
        for (let r = 0; r < NR; r++) {
          const el = hRefs.current[r];
          const u = uH[r];
          const by = rowY[r];
          for (let k = 0; k < N; k++) {
            const x = MARGIN_X + (k / (N - 1)) * INNER_W;
            const y = by + u[k] * AMP;
            bufH[k] = `${x.toFixed(1)},${y.toFixed(1)}`;
          }
          const pts = bufH.join(" ");
          if (el) el.setAttribute("points", pts);
          const gl = hGlowRefs.current[r];
          if (gl) gl.setAttribute("points", pts);
        }
        for (let c = 0; c < NC; c++) {
          const el = vRefs.current[c];
          const u = uV[c];
          const bx = colX[c];
          for (let k = 0; k < N; k++) {
            const y = MARGIN_Y + (k / (N - 1)) * INNER_H;
            const x = bx + u[k] * AMP;
            bufV[k] = `${x.toFixed(1)},${y.toFixed(1)}`;
          }
          const pts = bufV.join(" ");
          if (el) el.setAttribute("points", pts);
          const gl = vGlowRefs.current[c];
          if (gl) gl.setAttribute("points", pts);
        }
        for (let node = 0; node < NR * NC; node++) {
          const el = nodeRefs.current[node];
          if (!el) continue;
          const g = nodeGlow[node];
          nodeGlow[node] = g * 0.9;
          el.setAttribute("r", (2 + g * 6.2).toFixed(2));
          el.setAttribute("opacity", (0.3 + g * 0.7).toFixed(3));
        }
      }

      // ── Timing / idle ────────────────────────────────────────────────────
      const startPerf = performance.now();
      function nowSec(): number {
        return (performance.now() - startPerf) / 1000;
      }
      let lastPointer = -100;
      let idleAccum = 0;
      let prevT = nowSec();

      function idleTick(t: number, dt: number) {
        if (t - lastPointer < IDLE_QUIET) return;
        idleAccum += dt;
        if (idleAccum >= IDLE_PERIOD) {
          idleAccum = 0;
          const r = Math.floor(rng() * NR);
          const c = Math.floor(rng() * NC);
          pokeCrossing(r, c, 0.85 * injScale, audio !== null);
        }
      }

      // ── Main loop ──────────────────────────────────────────────────────────
      let raf = 0;
      function frame() {
        const t = nowSec();
        const dt = Math.min(0.05, t - prevT);
        prevT = t;
        step();
        detectRings(t);
        idleTick(t, dt);
        draw();
        raf = requestAnimationFrame(frame);
      }
      raf = requestAnimationFrame(frame);

      // ── Pointer interaction ────────────────────────────────────────────────
      function toView(e: PointerEvent): [number, number] | null {
        const pt = svg.createSVGPoint();
        pt.x = e.clientX;
        pt.y = e.clientY;
        const ctm = svg.getScreenCTM();
        if (!ctm) return null;
        const p = pt.matrixTransform(ctm.inverse());
        return [p.x, p.y];
      }

      let dragging = false;
      let lastR = -1;
      let lastC = -1;

      function onDown(e: PointerEvent) {
        e.preventDefault();
        ensureAudio();
        if (!started) setStarted(true);
        lastPointer = nowSec();
        const v = toView(e);
        if (!v) return;
        try {
          svg.setPointerCapture(e.pointerId);
        } catch {
          /* capture optional */
        }
        dragging = true;
        const [r, c] = nearestCrossing(v[0], v[1]);
        lastR = r;
        lastC = c;
        pokeCrossing(r, c, 1.2 * injScale, true);
      }

      function onMove(e: PointerEvent) {
        if (!dragging) return;
        lastPointer = nowSec();
        const v = toView(e);
        if (!v) return;
        const [r, c] = nearestCrossing(v[0], v[1]);
        // Strum: only fire when the drag reaches a new crossing.
        if (r !== lastR || c !== lastC) {
          lastR = r;
          lastC = c;
          pokeCrossing(r, c, 0.95 * injScale, true);
        }
      }

      function onUp(e: PointerEvent) {
        dragging = false;
        lastPointer = nowSec();
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
            audio.master.disconnect();
            audio.comp.disconnect();
            audio.conv.disconnect();
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
        err instanceof Error ? err.message : "The loom failed to warp up.",
      );
      return;
    }
    // Mount-once engine; all live state lives in refs/closures above.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const nodes: { r: number; c: number }[] = [];
  for (let r = 0; r < NR; r++) {
    for (let c = 0; c < NC; c++) nodes.push({ r, c });
  }

  return (
    <main className="relative flex min-h-[calc(100dvh-3rem)] w-full flex-col overflow-hidden bg-[#07040e]">
      {/* ── Woven loom (pure SVG, zero GPU) ─────────────────────────────── */}
      <svg
        ref={svgRef}
        viewBox={`0 0 ${VIEW_W} ${VIEW_H}`}
        preserveAspectRatio="xMidYMid meet"
        className="absolute inset-0 h-full w-full touch-none select-none"
        style={{ cursor: "crosshair" }}
        aria-label="A woven net of playable strings"
      >
        <defs>
          <radialGradient id="loomBg" cx="50%" cy="42%" r="75%">
            <stop offset="0%" stopColor="#160b2c" />
            <stop offset="60%" stopColor="#0b0713" />
            <stop offset="100%" stopColor="#05030a" />
          </radialGradient>
          <filter id="loomGlow" x="-20%" y="-20%" width="140%" height="140%">
            <feGaussianBlur stdDeviation="3.2" />
          </filter>
        </defs>

        <rect x="0" y="0" width={VIEW_W} height={VIEW_H} fill="url(#loomBg)" />

        {/* Soft blurred echo of every string — the loom's glow, tracks the wave */}
        <g filter="url(#loomGlow)" opacity="0.5">
          {Array.from({ length: NR }, (_, r) => (
            <polyline
              key={`hg-${r}`}
              ref={(el) => {
                hGlowRefs.current[r] = el;
              }}
              fill="none"
              stroke="#a78bfa"
              strokeWidth={5}
              strokeLinecap="round"
              points={`${MARGIN_X},${rowY[r]} ${VIEW_W - MARGIN_X},${rowY[r]}`}
              opacity={0.22}
            />
          ))}
          {Array.from({ length: NC }, (_, c) => (
            <polyline
              key={`vg-${c}`}
              ref={(el) => {
                vGlowRefs.current[c] = el;
              }}
              fill="none"
              stroke="#c4b5fd"
              strokeWidth={5}
              strokeLinecap="round"
              points={`${colX[c]},${MARGIN_Y} ${colX[c]},${VIEW_H - MARGIN_Y}`}
              opacity={0.18}
            />
          ))}
        </g>

        {/* Crisp horizontal strings */}
        {Array.from({ length: NR }, (_, r) => (
          <polyline
            key={`h-${r}`}
            ref={(el) => {
              hRefs.current[r] = el;
            }}
            fill="none"
            stroke="#b9a5fb"
            strokeWidth={1.7}
            strokeLinecap="round"
            strokeLinejoin="round"
            opacity={0.72}
            points={`${MARGIN_X},${rowY[r]} ${VIEW_W - MARGIN_X},${rowY[r]}`}
          />
        ))}
        {/* Crisp vertical strings */}
        {Array.from({ length: NC }, (_, c) => (
          <polyline
            key={`v-${c}`}
            ref={(el) => {
              vRefs.current[c] = el;
            }}
            fill="none"
            stroke="#d6cafd"
            strokeWidth={1.5}
            strokeLinecap="round"
            strokeLinejoin="round"
            opacity={0.6}
            points={`${colX[c]},${MARGIN_Y} ${colX[c]},${VIEW_H - MARGIN_Y}`}
          />
        ))}

        {/* Crossing pegs — each rings and glows when a wave reaches it */}
        {nodes.map(({ r, c }, i) => (
          <circle
            key={`n-${r}-${c}`}
            ref={(el) => {
              nodeRefs.current[i] = el;
            }}
            cx={colX[c]}
            cy={rowY[r]}
            r={2}
            fill="#ede9fe"
            opacity={0.3}
          />
        ))}
      </svg>

      {/* ── Header overlay ──────────────────────────────────────────────── */}
      <div className="pointer-events-none relative z-10 max-w-xl p-6">
        <p className="font-mono text-xs uppercase tracking-[0.18em] text-muted-foreground">
          Woven waveguide mesh
        </p>
        <h1 className="mt-2 text-2xl font-semibold tracking-tight text-foreground">
          Loomstring
        </h1>
        <p className="mt-2 text-base text-muted-foreground">
          Poke any crossing of the woven net. A pulse races along both strings,
          and every peg it reaches rings a note. The line you watch bend is the
          wave you hear.
        </p>
      </div>

      {/* ── Tap-to-play hint (until first touch) ───────────────────────── */}
      {!started && !error && (
        <div className="pointer-events-none absolute inset-x-0 bottom-24 z-10 flex justify-center">
          <p className="text-base text-muted-foreground">
            Tap or drag across the web to play
          </p>
        </div>
      )}

      {/* ── Error notice ────────────────────────────────────────────────── */}
      {error && (
        <div className="absolute inset-x-0 bottom-24 z-20 flex justify-center px-6">
          <p className="max-w-md text-center text-sm text-destructive">
            {error}
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
            <div className="prose-sm space-y-3 text-sm leading-relaxed text-muted-foreground">
              <p>
                Each visible string is a discretised{" "}
                <span className="text-foreground">1-D wave equation</span> — a row
                of{" "}
                <span className="font-mono">{N}</span> displacement samples with
                fixed ends. The eight horizontal and eight vertical strings share
                every crossing, where they exchange transverse momentum each step.
                That coupling is what makes a poke on one string spill into the
                other, so a single ripple races along <em>both</em> axes: a small,
                honest 2-D <span className="text-foreground">digital-waveguide mesh</span>{" "}
                (Van&nbsp;Duyne &amp; Smith, 1993). The polyline you watch bend{" "}
                <em>is</em> that wave state — nothing is faked for the eye.
              </p>
              <p>
                When a wavefront reaches a crossing it rings a{" "}
                <span className="text-foreground">Karplus–Strong</span> plucked
                voice (Karplus &amp; Strong,{" "}
                <em>Digital Synthesis of Plucked-String and Drum Timbres</em>,
                1983), hand-built as a delay-line buffer with a lowpass feedback
                loop — no samples, no libraries. Position is the score: the row
                picks a just-intonation pitch class, the column its octave. A code-
                built convolution reverb and a compressor/limiter keep a heavy
                strum from clipping.
              </p>
              <p>
                It plays itself gently on load — a slow seeded ripple crosses the
                web every couple of seconds — but yields the instant you touch it.
                The grid-as-instrument spirit owes a debt to Toshio Iwai&rsquo;s{" "}
                <em>TENORI-ON</em>. On the lineage of the technique see{" "}
                <em>Four Decades of Digital Waveguides</em> (arXiv:2604.12878,
                2026). All randomness runs through a seeded mulberry32 PRNG; the
                whole loom is drawn in SVG with zero GPU.
              </p>
            </div>
          </div>
        </div>
      )}
    </main>
  );
}
