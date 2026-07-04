"use client";

// ─────────────────────────────────────────────────────────────────────────────
// /dream/1142-orbital-cloud — Orbital Cloud
//
//   Reach into a hydrogen atom and pump it between (n,l,m) eigenstates. The real
//   |ψ_nlm|² probability density is drawn as a glowing WebGL2 point cloud that
//   morphs on every transition; each downward jump fires a "photon" whose pitch
//   is the Rydberg-formula emission line, so the atom plays its own spectrum.
//
//   Physics in ./orbital.ts · rendering in ./render.ts · sound in ./audio.ts.
// ─────────────────────────────────────────────────────────────────────────────

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { createSafeFlicker, prefersReducedMotion } from "../_shared/psych/safeFlicker";
import {
  L_LABELS,
  energyToAudibleHz,
  levelToDroneHz,
  rydbergEnergyEv,
  sampleCloud,
  sublevels,
  type CloudSample,
  type OrbitalState,
} from "./orbital";
import {
  createCanvas2DRenderer,
  createGLRenderer,
  mat4Multiply,
  mat4Perspective,
  mat4View,
  type CloudRenderer,
  type Vec3,
} from "./render";
import { createAtomAudio, type AtomAudio } from "./audio";

// ── palette: actual hydrogen Balmer emission wavelengths, on near-black ───────
const H_ALPHA: Vec3 = [1.0, 0.19, 0.26]; // 656 nm red
const H_BETA: Vec3 = [0.17, 0.9, 1.0]; //  486 nm cyan
const H_GAMMA: Vec3 = [0.3, 0.44, 1.0]; // 434 nm blue
const H_DELTA: Vec3 = [0.62, 0.31, 1.0]; // 410 nm violet
const MAGENTA: Vec3 = [1.0, 0.24, 0.66]; // accent

// phase-lobe colour pairs, indexed by l (s,p,d,f)
const PAIRS: Array<{ pos: Vec3; neg: Vec3 }> = [
  { pos: H_ALPHA, neg: MAGENTA },
  { pos: H_BETA, neg: H_ALPHA },
  { pos: H_GAMMA, neg: MAGENTA },
  { pos: H_DELTA, neg: H_BETA },
];

const N_POINTS = 7000;
const TARGET_RMS = 1.35; // desired world-space spread (auto-framing)
const CAM_DIST = 4.6;
const TAU = 0.19; // morph time-constant (s) → settles in ~0.6 s
const IDLE_MS = 2600; // silence before the atom auto-plays
const IDLE_STEP_S = 1.5; // seconds between idle transitions

const GREEK = ["α", "β", "γ", "δ", "ε"];
function lineLabel(ni: number, nf: number): string {
  const series = nf === 1 ? "Lyman" : nf === 2 ? "Balmer" : nf === 3 ? "Paschen" : "Brackett";
  const g = GREEK[ni - nf - 1] ?? "";
  const eV = rydbergEnergyEv(ni, nf);
  const nm = Math.round(1239.84 / eV);
  return `${series} ${g} · ${nm} nm · ${ni}→${nf}`;
}

interface Readout {
  n: number;
  l: number;
  m: number;
  line: string;
}

// engine handles kept off React state to avoid re-render churn
interface Engine {
  cur: Float32Array;
  curPhase: Float32Array;
  tgt: Float32Array;
  tgtPhase: Float32Array;
  scaled: Float32Array;
  curGain: number;
  tgtGain: number;
  curPos: Vec3;
  curNeg: Vec3;
  tgtPos: Vec3;
  tgtNeg: Vec3;
  state: OrbitalState;
  lastInteract: number;
  idleAccum: number;
  cache: Map<string, CloudSample>;
}

export default function OrbitalCloudPage() {
  const [begun, setBegun] = useState(false);
  const [showNotes, setShowNotes] = useState(false);
  const [fallback, setFallback] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [readout, setReadout] = useState<Readout>({ n: 3, l: 1, m: 0, line: "ground poised" });

  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const engineRef = useRef<Engine | null>(null);
  const audioRef = useRef<AtomAudio | null>(null);
  const navRef = useRef<((next: OrbitalState, emit: boolean) => void) | null>(null);

  const cloudFor = useCallback((eng: Engine, s: OrbitalState): CloudSample => {
    const key = `${s.n}-${s.l}-${s.m}`;
    let c = eng.cache.get(key);
    if (!c) {
      c = sampleCloud(s, N_POINTS);
      eng.cache.set(key, c);
    }
    return c;
  }, []);

  // ── main engine effect: runs once Begin is pressed ─────────────────────────
  useEffect(() => {
    if (!begun) return;
    const canvas = canvasRef.current;
    if (!canvas) return;

    const reduced = prefersReducedMotion();
    const flicker = createSafeFlicker({ maxHz: 8, defaultHz: 2, floor: 0.6 }); // steady by default

    // audio (needs the user gesture that set begun=true)
    const audio = createAtomAudio();
    audioRef.current = audio;
    if (audio) audio.resume();

    // renderer selection
    let gl: WebGL2RenderingContext | null = null;
    let glRenderer: CloudRenderer | null = null;
    let c2dRenderer: ReturnType<typeof createCanvas2DRenderer> | null = null;
    let ctx2d: CanvasRenderingContext2D | null = null;
    try {
      gl = canvas.getContext("webgl2", { premultipliedAlpha: true, alpha: false });
      if (gl) glRenderer = createGLRenderer(gl);
    } catch {
      gl = null;
    }
    if (!gl || !glRenderer) {
      ctx2d = canvas.getContext("2d");
      if (ctx2d) {
        c2dRenderer = createCanvas2DRenderer(ctx2d);
        setFallback(true);
      } else {
        setError("This browser exposes neither WebGL2 nor Canvas2D — cannot render the cloud.");
        return;
      }
    }

    // initial orbital state
    const s0: OrbitalState = { n: 3, l: 1, m: 0 };
    const first = sampleCloud(s0, N_POINTS);
    const eng: Engine = {
      cur: first.positions.slice(),
      curPhase: first.phase.slice(),
      tgt: first.positions.slice(),
      tgtPhase: first.phase.slice(),
      scaled: new Float32Array(N_POINTS * 3),
      curGain: TARGET_RMS / first.rms,
      tgtGain: TARGET_RMS / first.rms,
      curPos: PAIRS[1].pos,
      curNeg: PAIRS[1].neg,
      tgtPos: PAIRS[1].pos,
      tgtNeg: PAIRS[1].neg,
      state: s0,
      lastInteract: performance.now(),
      idleAccum: 0,
      cache: new Map([[`3-1-0`, first]]),
    };
    engineRef.current = eng;

    if (audio) audio.setLevel(levelToDroneHz(s0.n));

    // navigation: move to a new eigenstate, optionally emitting a photon
    const navigate = (next: OrbitalState, emit: boolean) => {
      const prev = eng.state;
      const sample = cloudFor(eng, next);
      eng.tgt = sample.positions;
      eng.tgtPhase = sample.phase;
      eng.tgtGain = TARGET_RMS / sample.rms;
      const pair = PAIRS[Math.min(3, next.l)];
      eng.tgtPos = pair.pos;
      eng.tgtNeg = pair.neg;
      eng.state = next;

      let line = `${next.n}${L_LABELS[next.l]} · m=${next.m >= 0 ? "+" + next.m : next.m}`;
      if (emit && next.n < prev.n) {
        const eV = rydbergEnergyEv(prev.n, next.n);
        const hz = energyToAudibleHz(eV);
        if (audio) audio.emitPhoton(hz, 1);
        line = lineLabel(prev.n, next.n);
      } else if (next.n > prev.n) {
        // absorption: a soft low swell, no bright line
        if (audio) audio.emitPhoton(energyToAudibleHz(rydbergEnergyEv(next.n, prev.n)) * 0.5, 0.35);
        line = `absorb ${prev.n}→${next.n}`;
      } else if (next.l !== prev.l || next.m !== prev.m) {
        // reorientation blip
        if (audio) audio.emitPhoton(energyToAudibleHz(2.4 + next.l * 0.6), 0.28);
      }
      if (audio) audio.setLevel(levelToDroneHz(next.n));
      setReadout({ n: next.n, l: next.l, m: next.m, line });
    };
    navRef.current = navigate;

    // idle auto-play: wander the spectrum so there is always life + sound
    const autoStep = () => {
      const s = eng.state;
      let next: OrbitalState;
      if (s.n > 1 && Math.random() < 0.66) {
        // relax one level (emits a real spectral line)
        const nn = s.n - 1;
        const ll = Math.min(s.l, nn - 1);
        const subs = sublevels(nn);
        const pick = subs[Math.floor(Math.random() * subs.length)] ?? { l: ll, m: 0 };
        next = { n: nn, l: Math.max(0, pick.l), m: pick.m };
        navigate(next, true);
      } else {
        // excite back up
        const nn = Math.min(4, s.n + 1);
        const subs = sublevels(nn);
        const pick = subs[Math.floor(Math.random() * subs.length)] ?? { l: 0, m: 0 };
        next = { n: nn, l: pick.l, m: pick.m };
        navigate(next, false);
      }
    };

    // ── pointer interaction: drag to pump ──────────────────────────────────────
    let dragging = false;
    let accX = 0;
    let accY = 0;
    let moved = 0;
    let px = 0;
    let py = 0;

    const stepSublevel = (dir: number) => {
      const subs = sublevels(eng.state.n);
      const idx = subs.findIndex((v) => v.l === eng.state.l && v.m === eng.state.m);
      const ni = ((idx + dir) % subs.length + subs.length) % subs.length;
      const { l, m } = subs[ni];
      navigate({ n: eng.state.n, l, m }, false);
    };

    const stepLevel = (dir: number) => {
      const prev = eng.state;
      const nn = Math.min(4, Math.max(1, prev.n + dir));
      if (nn === prev.n) return;
      const l = Math.min(prev.l, nn - 1);
      navigate({ n: nn, l, m: nn - 1 >= Math.abs(prev.m) ? prev.m : 0 }, dir < 0);
    };

    const onDown = (e: PointerEvent) => {
      dragging = true;
      accX = 0;
      accY = 0;
      moved = 0;
      px = e.clientX;
      py = e.clientY;
      eng.lastInteract = performance.now();
      canvas.setPointerCapture?.(e.pointerId);
    };
    const onMove = (e: PointerEvent) => {
      if (!dragging) return;
      const dx = e.clientX - px;
      const dy = e.clientY - py;
      px = e.clientX;
      py = e.clientY;
      accX += dx;
      accY += dy;
      moved += Math.abs(dx) + Math.abs(dy);
      eng.lastInteract = performance.now();
      const THRESH = 58;
      while (accY <= -THRESH) {
        accY += THRESH;
        stepLevel(+1); // drag up → excite
      }
      while (accY >= THRESH) {
        accY -= THRESH;
        stepLevel(-1); // drag down → relax (emits)
      }
      while (accX <= -THRESH) {
        accX += THRESH;
        stepSublevel(-1);
      }
      while (accX >= THRESH) {
        accX -= THRESH;
        stepSublevel(+1);
      }
    };
    const onUp = (e: PointerEvent) => {
      if (dragging && moved < 8) stepSublevel(+1); // tap → reorient m
      dragging = false;
      eng.lastInteract = performance.now();
      canvas.releasePointerCapture?.(e.pointerId);
    };
    canvas.addEventListener("pointerdown", onDown);
    canvas.addEventListener("pointermove", onMove);
    canvas.addEventListener("pointerup", onUp);
    canvas.addEventListener("pointercancel", onUp);

    // ── sizing ─────────────────────────────────────────────────────────────────
    let vw = 1;
    let vh = 1;
    let dpr = 1;
    const resize = () => {
      const rect = canvas.getBoundingClientRect();
      dpr = Math.min(window.devicePixelRatio || 1, 2);
      vw = Math.max(1, Math.floor(rect.width * dpr));
      vh = Math.max(1, Math.floor(rect.height * dpr));
      canvas.width = vw;
      canvas.height = vh;
      if (glRenderer) glRenderer.resize(vw, vh);
    };
    resize();
    const ro = new ResizeObserver(resize);
    ro.observe(canvas);

    // ── the loop ───────────────────────────────────────────────────────────────
    let raf = 0;
    let last = performance.now();
    let tSec = 0;
    let yaw = 0.6;
    const rotSpeed = reduced ? 0.04 : 0.12;
    const breathAmp = reduced ? 0.02 : 0.06;

    // guarantee life within ~1 s of Begin: a first relax after 0.5 s
    let kicked = false;

    const lerp3 = (a: Vec3, b: Vec3, t: number): Vec3 => [
      a[0] + (b[0] - a[0]) * t,
      a[1] + (b[1] - a[1]) * t,
      a[2] + (b[2] - a[2]) * t,
    ];

    const tick = (now: number) => {
      const dt = Math.min(0.05, Math.max(0, (now - last) / 1000));
      last = now;
      tSec += dt;

      if (!kicked && tSec > 0.5) {
        kicked = true;
        autoStep();
      }

      // idle auto-play
      if (now - eng.lastInteract > IDLE_MS) {
        eng.idleAccum += dt;
        if (eng.idleAccum > IDLE_STEP_S) {
          eng.idleAccum = 0;
          autoStep();
        }
      } else {
        eng.idleAccum = 0;
      }

      // morph toward target eigenstate
      const k = 1 - Math.exp(-dt / TAU);
      const cur = eng.cur;
      const tgt = eng.tgt;
      const cp = eng.curPhase;
      const tp = eng.tgtPhase;
      for (let i = 0; i < cur.length; i++) cur[i] += (tgt[i] - cur[i]) * k;
      for (let i = 0; i < cp.length; i++) cp[i] += (tp[i] - cp[i]) * k;
      eng.curGain += (eng.tgtGain - eng.curGain) * k;
      eng.curPos = lerp3(eng.curPos, eng.tgtPos, k);
      eng.curNeg = lerp3(eng.curNeg, eng.tgtNeg, k);

      const breath = 1 + breathAmp * Math.sin(tSec * 0.9);
      const gain = eng.curGain * breath;
      const scaled = eng.scaled;
      for (let i = 0; i < scaled.length; i++) scaled[i] = cur[i] * gain;

      yaw += dt * rotSpeed;
      const pitch = 0.32 + 0.12 * Math.sin(tSec * 0.13);
      const bright = 0.95 * flicker.value(tSec);

      if (glRenderer && gl) {
        gl.viewport(0, 0, vw, vh);
        gl.clearColor(0.02, 0.024, 0.04, 1);
        gl.clear(gl.COLOR_BUFFER_BIT);
        const proj = mat4Perspective((48 * Math.PI) / 180, vw / vh, 0.1, 100);
        const view = mat4View(CAM_DIST, pitch, yaw);
        const mvp = mat4Multiply(proj, view);
        glRenderer.updateBuffers(scaled, cp, N_POINTS);
        glRenderer.render({
          count: N_POINTS,
          mvp,
          pointSize: 150 * dpr,
          bright,
          colPos: eng.curPos,
          colNeg: eng.curNeg,
          time: tSec,
        });
      } else if (c2dRenderer && ctx2d) {
        ctx2d.fillStyle = "#05060a";
        ctx2d.fillRect(0, 0, vw, vh);
        c2dRenderer.render(scaled, cp, {
          count: N_POINTS,
          pitch,
          yaw,
          scale: (Math.min(vw, vh) / 6) * 1,
          cx: vw / 2,
          cy: vh / 2,
          bright,
          colPos: eng.curPos,
          colNeg: eng.curNeg,
          time: tSec,
        });
      }
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);

    return () => {
      cancelAnimationFrame(raf);
      ro.disconnect();
      canvas.removeEventListener("pointerdown", onDown);
      canvas.removeEventListener("pointermove", onMove);
      canvas.removeEventListener("pointerup", onUp);
      canvas.removeEventListener("pointercancel", onUp);
      glRenderer?.dispose();
      audio?.dispose();
      audioRef.current = null;
      engineRef.current = null;
      navRef.current = null;
    };
  }, [begun, cloudFor]);

  // ── fallback slider handlers (drive the same state machine + audio) ─────────
  const onLevelSlider = useCallback((n: number) => {
    const eng = engineRef.current;
    const nav = navRef.current;
    if (!eng || !nav) return;
    const l = Math.min(eng.state.l, n - 1);
    nav({ n, l, m: 0 }, n < eng.state.n);
  }, []);
  const onSubSlider = useCallback((idx: number) => {
    const eng = engineRef.current;
    const nav = navRef.current;
    if (!eng || !nav) return;
    const subs = sublevels(eng.state.n);
    const s = subs[Math.max(0, Math.min(subs.length - 1, idx))];
    nav({ n: eng.state.n, l: s.l, m: s.m }, false);
  }, []);

  const subsForN = sublevels(readout.n);
  const subIdx = Math.max(
    0,
    subsForN.findIndex((v) => v.l === readout.l && v.m === readout.m),
  );

  return (
    <main className="relative min-h-dvh w-full overflow-hidden bg-[#05060a] text-white">
      {/* the cloud */}
      <canvas
        ref={canvasRef}
        className="absolute inset-0 h-full w-full touch-none"
        style={{ display: begun ? "block" : "none", cursor: "grab" }}
      />

      {/* radial vignette for depth */}
      <div
        className="pointer-events-none absolute inset-0"
        style={{
          background:
            "radial-gradient(ellipse at center, transparent 40%, rgba(5,6,10,0.55) 100%)",
        }}
      />

      {/* ── pre-Begin hero ── */}
      {!begun && (
        <div className="relative z-10 mx-auto flex min-h-dvh max-w-2xl flex-col items-center justify-center gap-6 px-6 text-center">
          <p className="font-mono text-sm tracking-[0.3em] text-white/55">DREAM · 1142</p>
          <h1 className="font-serif text-4xl leading-tight text-white sm:text-5xl">
            Orbital Cloud
          </h1>
          <p className="max-w-lg text-base leading-relaxed text-white/80">
            Reach into a hydrogen atom and pump it between electron orbitals. Watch the real
            quantum probability cloud <span className="text-white/95">|ψ|²</span> morph in 3D and
            hear the atom play its own emission spectrum — the actual Rydberg spectral lines as a
            scale.
          </p>
          <button
            type="button"
            onClick={() => setBegun(true)}
            className="min-h-[44px] rounded-full border border-white/25 bg-white/5 px-8 py-2.5 font-mono text-base text-white/95 transition hover:bg-white/10"
          >
            Begin
          </button>
          <p className="font-mono text-sm text-white/55">
            drag up/down to excite &amp; relax · left/right to reshape · tap to reorient
          </p>
          {error && <p className="text-base text-rose-300">{error}</p>}
        </div>
      )}

      {/* ── live HUD ── */}
      {begun && (
        <>
          <div className="pointer-events-none absolute left-0 top-0 z-10 p-5">
            <h1 className="font-serif text-xl text-white/95">Orbital Cloud</h1>
            <p className="mt-1 font-mono text-sm text-white/70">
              n={readout.n} &nbsp; {readout.n}
              {L_LABELS[readout.l]} &nbsp; m={readout.m >= 0 ? `+${readout.m}` : readout.m}
            </p>
            <p className="mt-0.5 font-mono text-sm text-[#5ff0ff]/80">{readout.line}</p>
          </div>

          {error && (
            <div className="absolute left-1/2 top-4 z-20 -translate-x-1/2">
              <p className="text-base text-rose-300">{error}</p>
            </div>
          )}

          {/* fallback controls (Canvas2D path) */}
          {fallback && (
            <div className="absolute inset-x-0 bottom-0 z-20 flex flex-col gap-3 bg-black/50 p-5 backdrop-blur">
              <p className="text-base text-rose-300">
                WebGL2 unavailable — showing a Canvas2D projection. The atom still plays its
                spectrum; use the sliders to pump it.
              </p>
              <label className="font-mono text-sm text-white/75">
                energy level n = {readout.n}
                <input
                  type="range"
                  min={1}
                  max={4}
                  step={1}
                  value={readout.n}
                  onChange={(e) => onLevelSlider(Number(e.target.value))}
                  className="mt-1 block w-full"
                />
              </label>
              <label className="font-mono text-sm text-white/75">
                sublevel ({readout.n}
                {L_LABELS[readout.l]} m={readout.m})
                <input
                  type="range"
                  min={0}
                  max={Math.max(0, subsForN.length - 1)}
                  step={1}
                  value={subIdx}
                  onChange={(e) => onSubSlider(Number(e.target.value))}
                  className="mt-1 block w-full"
                />
              </label>
            </div>
          )}

          {/* design notes toggle */}
          <div className="absolute bottom-4 right-4 z-20 max-w-sm">
            {showNotes ? (
              <div className="rounded-lg border border-white/15 bg-black/60 p-4 backdrop-blur">
                <p className="text-base leading-relaxed text-white/80">
                  Each point is placed by rejection-sampling the genuine hydrogen wavefunction
                  <span className="text-white/95"> |ψ_nlm|² = R_nl(r)² · Y_lm(θ,φ)²</span> — real
                  Laguerre radial functions times real spherical harmonics. Colour is the phase
                  (sign) of ψ. Downward jumps emit a photon whose pitch is the Rydberg line
                  <span className="text-white/95"> ΔE = 13.6 eV·(1/n_f² − 1/n_i²)</span>, folded
                  into an audible register. Palette anchors are the real Balmer wavelengths (Hα
                  656, Hβ 486, Hγ 434, Hδ 410 nm). Full notes in README.md.
                </p>
                <button
                  type="button"
                  onClick={() => setShowNotes(false)}
                  className="mt-3 min-h-[44px] rounded-full border border-white/25 px-4 py-2.5 font-mono text-sm text-white/80"
                >
                  close
                </button>
              </div>
            ) : (
              <button
                type="button"
                onClick={() => setShowNotes(true)}
                className="min-h-[44px] rounded-full border border-white/20 bg-black/40 px-4 py-2.5 font-mono text-sm text-white/70 backdrop-blur transition hover:text-white/95"
              >
                design notes
              </button>
            )}
          </div>

          <div className="absolute left-4 bottom-4 z-20">
            <Link
              href="/dream"
              className="font-mono text-sm text-white/55 transition hover:text-white/90"
            >
              ← dream
            </Link>
          </div>
        </>
      )}
    </main>
  );
}
