"use client";

/*
 * 4568 · MARBLE
 *
 * "What if you could only SUBTRACT — sing a form out of a solid block of
 *  sound-material that RESISTS you, where every removal is permanent, and what
 *  remains when you stop is the sculpture?"
 *
 * The piece opens as a saturated block: 48 sine partials sounding at once, a
 * solid violet slab. You CARVE by pitch — the mic detects the fundamental of a
 * hum / sung note / whistle (time-domain YIN, NOT an FFT feature field) and
 * silences the nearest partial FOREVER. The stone resists: fresh cuts make
 * their neighbours lean back (louder, brighter), the block slowly re-tunes, and
 * greedy sweeping is punished while precise carving is rewarded. What you choose
 * to LEAVE is the figure in the marble.
 *
 * Michelangelo's levare — "the figure is already in the marble; I remove what
 * isn't." Material agency (Zheng, Xambó & Bryan-Kinns 2026; Magnusson /
 * Intelligent Instruments Lab): the instrument's material has a will you
 * negotiate with, not a tool that merely obeys.
 */

import { useEffect, useRef, useState } from "react";

import { MarbleAudio } from "./audio";
import { detectPitchYIN } from "./pitch";
import {
  N_PARTIALS,
  FIGURE_NAME,
  THIN_WARNING,
  SEED,
  createBlock,
  autoSculptOrder,
  nearestAlivePartial,
  freqToNote,
  aliveCount,
  type Partial,
} from "./material";

// ── art layer constants (raw hex allowed only inside the SVG) ──────────────
const VIEW_W = 960;
const VIEW_H = 540;
const TOP = 40;
const GROUND = 502;
const SPAN = GROUND - TOP; // max bar height
const BAR_W = VIEW_W / N_PARTIALS;
const FRAME_BG = "#070511";
// violet ramp: deep → primary → light (brief: #4c1d95 → #8b5cf6 → #ede9fe)
const RAMP = ["#2a0e5c", "#4c1d95", "#6d28d9", "#8b5cf6", "#c4b5fd", "#ede9fe"];
const DEAD = "#2c2c38"; // carved partials desaturate toward this gray

const PER_GAIN = 0.14; // per-partial audio gain; 48 of these + compressor = roar

type Mode = "auto" | "live-mic" | "fallback";

// keyboard fallback: this row of keys maps left→right across the whole slab
const KEY_ROW = "1234567890qwertyuiopasdfghjklzxcvbnm";

function easeOutCubic(x: number): number {
  return 1 - Math.pow(1 - x, 3);
}

function clamp01(x: number): number {
  return x < 0 ? 0 : x > 1 ? 1 : x;
}

function toHex2(n: number): string {
  const v = Math.max(0, Math.min(255, Math.round(n)));
  return v.toString(16).padStart(2, "0");
}

/** blend two #rrggbb hex colors → #rrggbb (composable — always returns hex) */
function lerpColor(a: string, b: string, t: number): string {
  const pa = parseInt(a.slice(1), 16);
  const pb = parseInt(b.slice(1), 16);
  const ar = (pa >> 16) & 255,
    ag = (pa >> 8) & 255,
    ab = pa & 255;
  const br = (pb >> 16) & 255,
    bg = (pb >> 8) & 255,
    bb = pb & 255;
  const r = ar + (br - ar) * t;
  const g = ag + (bg - ag) * t;
  const bl = ab + (bb - ab) * t;
  return `#${toHex2(r)}${toHex2(g)}${toHex2(bl)}`;
}

/** color of a live partial by its position along the slab, brightened by boost */
function rampColor(t: number): string {
  const x = clamp01(t) * (RAMP.length - 1);
  const i = Math.min(RAMP.length - 2, Math.floor(x));
  return lerpColor(RAMP[i], RAMP[i + 1], x - i);
}

export default function MarblePage() {
  // ── simulation state lives in refs (authoritative), UI reads via `tick` ──
  const partialsRef = useRef<Partial[]>(createBlock(SEED));
  const audioRef = useRef<MarbleAudio | null>(null);
  const rafRef = useRef<number>(0);
  const lastFrameRef = useRef<number>(0);
  const micBufRef = useRef<Float32Array>(new Float32Array(1024));
  const modeRef = useRef<Mode>("auto");

  const simRef = useRef({
    heat: 0, // greed accumulator — high heat = the stone fights back
    lastCarveAt: -1,
    resonance: 0, // reward pulse: the whole figure briefly sings
    lastMicIdx: -1,
    stableCount: 0,
    lastMicCarveAt: -1,
    detectedFreq: -1,
    frame: 0,
  });
  const autoRef = useRef({
    active: true,
    order: autoSculptOrder(SEED),
    ptr: 0,
    startAt: -1, // set on first frame (performance.now based)
    interval: 19, // ms between cuts → ~39 cuts ≈ 0.75s, well under 1s
  });

  // imperative API the event handlers call (defined once inside the effect)
  const apiRef = useRef<{
    carve: (i: number, source: "tap" | "key" | "mic" | "auto") => void;
    ensureAudio: () => void;
    startLive: () => void;
    newBlock: () => void;
  } | null>(null);

  const [, setTick] = useState(0);
  const [mode, setModeState] = useState<Mode>("auto");
  const [micDenied, setMicDenied] = useState(false);
  const [showNotes, setShowNotes] = useState(false);
  const [soundOn, setSoundOn] = useState(false);

  useEffect(() => {
    let disposed = false;

    const setMode = (m: Mode) => {
      modeRef.current = m;
      setModeState(m);
    };

    const ensureAudio = () => {
      if (disposed) return;
      let a = audioRef.current;
      if (!a) {
        a = new MarbleAudio();
        a.build(partialsRef.current);
        audioRef.current = a;
      }
      a.resume().then(() => {
        if (!disposed && audioRef.current?.running) setSoundOn(true);
      });
    };

    const stopAuto = () => {
      autoRef.current.active = false;
    };

    const carve = (i: number, source: "tap" | "key" | "mic" | "auto") => {
      const partials = partialsRef.current;
      const p = partials[i];
      if (!p || !p.alive) return;
      const sim = simRef.current;
      const now = performance.now();

      p.alive = false;
      p.carvedAt = now;
      p.fall = 0;

      const gap = sim.lastCarveAt < 0 ? 9999 : now - sim.lastCarveAt;
      sim.lastCarveAt = now;

      // greed: cuts closer together than ~0.6s stoke the material's resistance
      if (source !== "auto") {
        if (gap < 250) sim.heat = Math.min(3, sim.heat + 1.2);
        else if (gap < 600) sim.heat = Math.min(3, sim.heat + 0.5);
      }
      const greed =
        source === "auto" ? 1.05 : 1 + Math.min(2.2, sim.heat) * 0.6;

      // lean-back: neighbours of the cut push back (louder + brighter)
      for (const off of [-2, -1, 1, 2]) {
        const q = partials[i + off];
        if (q && q.alive) {
          const near = off === 1 || off === -1 ? 0.7 : 0.34;
          q.boost = Math.min(1.7, q.boost + near * greed);
        }
      }

      // reward restraint: a deliberate, spaced cut makes the figure sing
      const deliberate = source !== "auto" && gap > 750 && sim.heat < 0.7;
      if (deliberate) {
        sim.resonance = 1;
        audioRef.current?.chime(p.freq * 2);
      }
    };

    const startLive = () => {
      ensureAudio();
      stopAuto();
      // explicit intent to play → give a fresh, full block to carve
      newBlockInternal();
      const a = audioRef.current;
      if (!a) {
        setMode("fallback");
        return;
      }
      a.enableMic().then((ok) => {
        if (disposed) return;
        if (ok) {
          setMode("live-mic");
          setMicDenied(false);
        } else {
          setMode("fallback");
          setMicDenied(true);
        }
      });
    };

    const newBlockInternal = () => {
      partialsRef.current = createBlock(SEED);
      const sim = simRef.current;
      sim.heat = 0;
      sim.resonance = 0;
      sim.lastCarveAt = -1;
      sim.lastMicIdx = -1;
      sim.stableCount = 0;
      sim.lastMicCarveAt = -1;
    };

    const newBlock = () => {
      ensureAudio();
      stopAuto();
      newBlockInternal();
      if (modeRef.current === "auto") setMode("fallback");
    };

    apiRef.current = { carve, ensureAudio, startLive, newBlock };

    // any tap / key anywhere unlocks sound (and hands manual control over)
    const onFirstGesture = () => {
      ensureAudio();
      if (modeRef.current === "auto") {
        stopAuto();
        setMode("fallback");
      }
    };
    window.addEventListener("pointerdown", onFirstGesture);

    const onKeyDown = (e: KeyboardEvent) => {
      if (e.metaKey || e.ctrlKey || e.altKey) return;
      const k = e.key.toLowerCase();
      const pos = KEY_ROW.indexOf(k);
      if (pos === -1) return;
      onFirstGesture();
      const target = Math.round((pos / (KEY_ROW.length - 1)) * (N_PARTIALS - 1));
      // carve the nearest ALIVE partial to that key's region
      const partials = partialsRef.current;
      let best = -1;
      let bd = Infinity;
      for (const p of partials) {
        if (!p.alive) continue;
        const d = Math.abs(p.index - target);
        if (d < bd) {
          bd = d;
          best = p.index;
        }
      }
      if (best >= 0) carve(best, "key");
    };
    window.addEventListener("keydown", onKeyDown);

    // try to power the block up immediately (desktop autoplay); on mobile this
    // stays suspended until the first gesture resumes it — the visual
    // auto-sculptor paints regardless.
    ensureAudio();

    // ── the loop: drives BOTH the visual (always) and audio (when running) ──
    const frame = (now: number) => {
      if (disposed) return;
      const prev = lastFrameRef.current || now;
      const dtf = Math.min(0.05, (now - prev) / 1000);
      lastFrameRef.current = now;

      const partials = partialsRef.current;
      const sim = simRef.current;
      const auto = autoRef.current;
      const audio = audioRef.current;

      // auto-sculptor: chisel the figure out on its own within ~1s of load
      if (auto.active) {
        if (auto.startAt < 0) auto.startAt = now + 130; // brief slab beat first
        while (
          auto.ptr < auto.order.length &&
          now - auto.startAt >= auto.ptr * auto.interval
        ) {
          carve(auto.order[auto.ptr], "auto");
          auto.ptr++;
        }
        if (auto.ptr >= auto.order.length) auto.active = false;
      }

      // resistance decay + settling + fall animation
      sim.heat *= Math.exp(-dtf / 0.7);
      sim.resonance *= Math.exp(-dtf / 0.7);
      const settlePhase = now / 1000;
      for (let i = 0; i < partials.length; i++) {
        const p = partials[i];
        p.boost *= Math.exp(-dtf / 0.55);
        if (!p.alive && p.fall < 1) p.fall = clamp01(p.fall + dtf / 0.5);
        // slow re-tune / re-beat of the remaining block (settling)
        if (audio?.built) {
          const settle = Math.sin(settlePhase * 0.28 + i * 0.5);
          if (p.alive) {
            const g = PER_GAIN * (1 + p.boost * 0.95 + sim.resonance * 0.22);
            audio.setGainTarget(i, g);
            audio.setDetune(i, p.detune + settle * (2 + p.boost * 3));
          } else {
            audio.setGainTarget(i, 0);
          }
        }
      }

      // mic carving: detect fundamental (YIN) every other frame; require a
      // stable, in-tune hold so a wobble can't sweep the block away
      sim.frame++;
      if (
        modeRef.current === "live-mic" &&
        audio?.micReady &&
        sim.frame % 2 === 0
      ) {
        if (audio.readTime(micBufRef.current)) {
          const f = detectPitchYIN(micBufRef.current, audio.sampleRate);
          sim.detectedFreq = f;
          if (f > 0) {
            const { index, cents } = nearestAlivePartial(f, partials);
            if (index >= 0 && Math.abs(cents) < 55) {
              if (index === sim.lastMicIdx) sim.stableCount++;
              else {
                sim.lastMicIdx = index;
                sim.stableCount = 0;
              }
              if (sim.stableCount >= 2 && now - sim.lastMicCarveAt > 170) {
                carve(index, "mic");
                sim.lastMicCarveAt = now;
                sim.stableCount = 0;
              }
            }
          }
        }
      }

      setTick((t) => (t + 1) & 0xffff);
      rafRef.current = requestAnimationFrame(frame);
    };
    rafRef.current = requestAnimationFrame(frame);

    return () => {
      disposed = true;
      cancelAnimationFrame(rafRef.current);
      window.removeEventListener("pointerdown", onFirstGesture);
      window.removeEventListener("keydown", onKeyDown);
      audioRef.current?.dispose();
      audioRef.current = null;
    };
    // mount-once: the loop reads everything from refs
  }, []);

  // ── derived readouts (read refs; `tick` forces this to re-run each frame) ──
  const partials = partialsRef.current;
  const alive = aliveCount(partials);
  const remaining = alive / N_PARTIALS;
  const remainingPct = Math.round(remaining * 100);
  const detected = simRef.current.detectedFreq;
  const thin = remaining <= THIN_WARNING && alive > 0;
  const empty = alive === 0;

  const modeLabel =
    mode === "live-mic"
      ? "LIVE mic"
      : mode === "fallback"
        ? "tap / keys"
        : "auto-sculptor";

  const nowMs =
    typeof performance !== "undefined" ? performance.now() : 0;

  return (
    <main className="min-h-screen bg-background px-5 py-8 text-foreground sm:px-8">
      <div className="mx-auto max-w-4xl">
        <header className="mb-5">
          <p className="mb-2 font-mono text-xs uppercase tracking-[0.18em] text-muted-foreground">
            4568 · marble
          </p>
          <h1 className="text-2xl font-semibold tracking-tight text-foreground sm:text-3xl">
            Sing a form out of the block.
          </h1>
          <p className="mt-2 max-w-2xl text-base text-muted-foreground">
            The stone begins as one saturated roar — {N_PARTIALS} partials
            sounding at once. You can only <em>subtract</em>: hum a pitch and the
            nearest partial is carved away forever. The block resists. What you
            choose to leave is the figure.
          </p>
        </header>

        {/* ── the marble ──────────────────────────────────────────────── */}
        <div className="relative overflow-hidden rounded-lg border border-border">
          <svg
            viewBox={`0 0 ${VIEW_W} ${VIEW_H}`}
            className="block w-full"
            style={{ aspectRatio: `${VIEW_W} / ${VIEW_H}`, background: FRAME_BG }}
            role="img"
            aria-label={`Sound block, ${remainingPct}% of material remaining`}
          >
            <defs>
              <radialGradient id="marble-vignette" cx="50%" cy="42%" r="75%">
                <stop offset="0%" stopColor="#160a33" stopOpacity="0.9" />
                <stop offset="100%" stopColor={FRAME_BG} stopOpacity="0" />
              </radialGradient>
            </defs>
            <rect x="0" y="0" width={VIEW_W} height={VIEW_H} fill={FRAME_BG} />
            <rect
              x="0"
              y="0"
              width={VIEW_W}
              height={VIEW_H}
              fill="url(#marble-vignette)"
            />

            {partials.map((p) => {
              const x = p.index * BAR_W;
              const t = p.index / (N_PARTIALS - 1);
              const boost = p.boost;
              // live bars fill the frame (a solid slab); a slow settle shimmer
              const shimmer = Math.sin(nowMs / 1000 + p.index * 0.5) * 0.012;
              let h: number;
              let fill: string;
              let opacity: number;
              if (p.alive) {
                h = SPAN * (0.9 + shimmer + Math.min(0.09, boost * 0.06));
                fill = rampColor(t + boost * 0.28);
                opacity = 0.9 + Math.min(0.1, boost * 0.12);
              } else {
                const f = easeOutCubic(p.fall);
                h = SPAN * (0.9 * (1 - f) + 0.045);
                fill = lerpColor(rampColor(t), DEAD, 0.55 + f * 0.4);
                opacity = 0.85 - f * 0.5;
              }
              const y = GROUND - h;
              return (
                <rect
                  key={p.index}
                  x={x + 0.4}
                  y={y}
                  width={BAR_W - 0.8}
                  height={h}
                  rx={1.4}
                  fill={fill}
                  opacity={opacity}
                  style={{ cursor: p.alive ? "pointer" : "default" }}
                  onPointerDown={(e) => {
                    e.preventDefault();
                    if (p.alive) apiRef.current?.carve(p.index, "tap");
                  }}
                />
              );
            })}

            {/* fresh-cut flash — the chisel strikes, then fades */}
            {partials.map((p) => {
              if (p.carvedAt < 0) return null;
              const age = nowMs - p.carvedAt;
              if (age > 320) return null;
              const a = (1 - age / 320) * 0.85;
              const cx = p.index * BAR_W + BAR_W / 2;
              return (
                <line
                  key={`cut-${p.index}`}
                  x1={cx}
                  y1={TOP - 8}
                  x2={cx}
                  y2={GROUND}
                  stroke="#ede9fe"
                  strokeWidth={1.4}
                  opacity={a}
                />
              );
            })}

            <line
              x1="0"
              y1={GROUND + 0.5}
              x2={VIEW_W}
              y2={GROUND + 0.5}
              stroke="#3a1d78"
              strokeWidth={1}
              opacity={0.6}
            />
          </svg>

          {/* readout strip over the art */}
          <div className="pointer-events-none absolute left-3 top-3 flex flex-wrap items-center gap-x-4 gap-y-1 font-mono text-xs uppercase tracking-[0.18em] text-muted-foreground">
            <span className="rounded bg-background/70 px-2 py-1 text-foreground ring-1 ring-border backdrop-blur-sm">
              {modeLabel}
              {soundOn ? "" : " · muted"}
            </span>
            <span className="rounded bg-background/60 px-2 py-1 ring-1 ring-border backdrop-blur-sm">
              material {remainingPct}%
            </span>
            {mode === "live-mic" && (
              <span className="rounded bg-background/60 px-2 py-1 ring-1 ring-border backdrop-blur-sm">
                heard {detected > 0 ? freqToNote(detected) : "—"}
              </span>
            )}
          </div>

          {!soundOn && (
            <button
              type="button"
              onClick={() => apiRef.current?.ensureAudio()}
              className="absolute bottom-3 right-3 min-h-[44px] rounded-md border border-border bg-background/70 px-4 text-sm text-muted-foreground backdrop-blur-sm transition-colors hover:bg-accent hover:text-foreground"
            >
              tap for sound
            </button>
          )}
        </div>

        {/* thinning / empty warnings */}
        <div className="mt-3 min-h-[1.5rem] text-base">
          {empty ? (
            <p className="text-muted-foreground">
              You carved it all away — silence, an empty frame. Nothing remains
              to show.{" "}
              <button
                type="button"
                onClick={() => apiRef.current?.newBlock()}
                className="text-primary underline-offset-4 hover:underline"
              >
                Take a new block?
              </button>
            </p>
          ) : thin ? (
            <p className="italic text-muted-foreground">
              The stone is thin — {remainingPct}% remains. The art is restraint:
              what you leave <em>is</em> the figure.
            </p>
          ) : null}
        </div>

        {/* controls */}
        <div className="mt-4 flex flex-wrap items-center gap-3">
          <button
            type="button"
            onClick={() => apiRef.current?.startLive()}
            className="min-h-[44px] rounded-md bg-primary px-6 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90"
          >
            Carve it yourself
          </button>
          <button
            type="button"
            onClick={() => apiRef.current?.newBlock()}
            className="min-h-[44px] rounded-md border border-border bg-background/60 px-4 text-sm text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
          >
            New block
          </button>
          <button
            type="button"
            onClick={() => setShowNotes(true)}
            className="min-h-[44px] rounded-md border border-border bg-background/60 px-4 text-sm text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
          >
            Read the design notes
          </button>
        </div>

        {micDenied && (
          <p className="mt-3 text-base text-destructive">
            Mic unavailable — carving by tap and keyboard instead. Tap a column,
            or press keys along the row to chisel from low to high.
          </p>
        )}

        <p className="mt-4 max-w-2xl text-base text-muted-foreground">
          {mode === "live-mic"
            ? "Hold a steady pitch to carve the nearest partial. Space your cuts — hurry and the stone fights back."
            : "Tap any column to carve it, or press keys along your keyboard row to chisel low → high. Precise, spaced cuts are rewarded; sweeping is resisted."}{" "}
          The figure hidden in this block is a{" "}
          <span className="text-foreground">{FIGURE_NAME}</span> spread across
          four octaves.
        </p>
      </div>

      {/* ── design notes modal ──────────────────────────────────────────── */}
      {showNotes && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4 backdrop-blur-sm"
          onClick={() => setShowNotes(false)}
        >
          <div
            className="max-h-[85vh] max-w-lg overflow-y-auto rounded-lg border border-border bg-background p-6 shadow-lg"
            onClick={(e) => e.stopPropagation()}
          >
            <h2 className="text-2xl font-semibold tracking-tight text-foreground">
              The figure is already in the marble.
            </h2>
            <p className="mt-3 text-base text-muted-foreground">
              This piece inverts synthesis. Instead of building a sound up from
              silence (additive) or filtering a rich source (subtractive), it
              starts at <em>full additive saturation</em> — {N_PARTIALS} sine
              partials at once, the uncarved block — and makes music only by
              taking away. Every cut is permanent. You never add a partial back.
            </p>
            <p className="mt-3 text-base text-muted-foreground">
              The mic detects the fundamental pitch of your voice via{" "}
              <span className="text-foreground">time-domain YIN</span>{" "}
              (autocorrelation), not a spectral field, and carves the nearest
              partial. What survives when you stop is the sculpture — a sparse,
              luminous chord you revealed by removal.
            </p>
            <h3 className="mt-5 font-mono text-xs uppercase tracking-[0.18em] text-muted-foreground">
              Material agency — the block resists
            </h3>
            <ul className="mt-2 space-y-2 text-base text-muted-foreground">
              <li>
                Partials beside a fresh cut <strong>lean back</strong> — briefly
                louder and brighter. The stone pushes against the chisel.
              </li>
              <li>
                The remaining block slowly <strong>re-tunes and re-beats</strong>{" "}
                as it settles.
              </li>
              <li>
                <strong>Greedy sweeping is punished</strong> (the resistance
                swells); precise, spaced cuts are rewarded with a chime and a
                resonant bloom. Over-carve and you are left with silence and an
                empty frame.
              </li>
            </ul>
            <h3 className="mt-5 font-mono text-xs uppercase tracking-[0.18em] text-muted-foreground">
              References
            </h3>
            <ul className="mt-2 space-y-2 text-base text-muted-foreground">
              <li>
                Michelangelo&apos;s <em>levare</em> — the subtractive method: the
                figure is already in the marble; the sculptor removes what
                isn&apos;t the figure.
              </li>
              <li>
                Zheng, Xambó &amp; Bryan-Kinns,{" "}
                <em>Explainable AI through the Lens of Material Agency</em> (2026,
                cs.HC/cs.SD).
              </li>
              <li>
                Magnusson / Intelligent Instruments Lab,{" "}
                <em>Opening the Design Space</em> (arXiv:2604.23583, 2026): the
                instrument&apos;s material has agency the player negotiates with,
                rather than a tool that merely obeys.
              </li>
              <li>
                Subtractive vs. additive synthesis as a conceptual frame — here
                inverted: start at full additive saturation, then subtract.
              </li>
            </ul>
            <button
              type="button"
              onClick={() => setShowNotes(false)}
              className="mt-6 min-h-[44px] rounded-md bg-primary px-6 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90"
            >
              Close
            </button>
          </div>
        </div>
      )}
    </main>
  );
}
