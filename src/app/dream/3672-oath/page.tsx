"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { OathEngine, mulberry32, type Vow } from "./audio";

// ---------------------------------------------------------------------------
// 3672 · OATH
// "What if composing meant making vows you can never take back?"
// Every committed note locks into an eternal loop. No undo. No erase.
// ---------------------------------------------------------------------------

const BPM = 100;
const BEATS = 8; // 8-beat looping bar (~4.8 s at 100 BPM)
const KEYS = ["a", "s", "d", "f", "g", "h", "j", "k"] as const;
const KEY_LABELS = KEYS.map((k) => k.toUpperCase());
// D-major-ish spread, low -> high. These are only the STARTING pitches;
// the arrow keys bend continuously off them so a wrong pitch is vowable.
const BASE_ROOT = 146.83; // D3
const SEMIS = [0, 2, 4, 5, 7, 9, 11, 12];
const BEND_RATE = 130; // cents per second while an arrow is held
const BEND_LIMIT = 350; // +/- cents
const QUANT = 16; // commit positions quantized to 1/16 of the bar
const IDLE_START_MS = 1500; // autopilot kicks in if the rite sits idle

// Just-interval anchors (cents within an octave) for the consonance readout.
const JUST = [0, 204, 316, 386, 498, 702, 884, 1200];

// Art-layer colors (raw hex is allowed ONLY inside the canvas, never chrome).
const C_RING = "#3a1d78";
const C_RING_HOT = "#c4b5fd";
const C_VIOLET = "#8b5cf6";
const C_VIOLET_HI = "#ddd6fe";
const C_CLASH = "#e0567a"; // dim red edge — honest consequence, no fail buzzer
const C_WHITE = "#ffffff";

function keyBaseFreq(i: number): number {
  return BASE_ROOT * Math.pow(2, SEMIS[i] / 12);
}

function clamp(v: number, lo: number, hi: number): number {
  return v < lo ? lo : v > hi ? hi : v;
}

/** Circular distance between two phases in 0..1. */
function phaseDist(a: number, b: number): number {
  let d = Math.abs(a - b) % 1;
  if (d > 0.5) d = 1 - d;
  return d;
}

/**
 * Dissonance of a live pitch against the committed canon, 0 (consonant) .. 1
 * (clashing). Distance of each interval to its nearest simple ratio, blended
 * between the worst offender and the average.
 */
function dissonanceOf(freq: number, vows: Vow[]): number {
  if (vows.length === 0) return 0;
  let worst = 0;
  let sum = 0;
  for (const v of vows) {
    let cents = 1200 * Math.log2(freq / v.freq);
    cents = ((cents % 1200) + 1200) % 1200;
    let best = 1200;
    for (const j of JUST) {
      const d = Math.abs(cents - j);
      if (d < best) best = d;
    }
    const diss = clamp(best / 55, 0, 1);
    sum += diss;
    if (diss > worst) worst = diss;
  }
  return 0.55 * worst + 0.45 * (sum / vows.length);
}

function lerpHex(a: string, b: string, t: number): string {
  const pa = [
    parseInt(a.slice(1, 3), 16),
    parseInt(a.slice(3, 5), 16),
    parseInt(a.slice(5, 7), 16),
  ];
  const pb = [
    parseInt(b.slice(1, 3), 16),
    parseInt(b.slice(3, 5), 16),
    parseInt(b.slice(5, 7), 16),
  ];
  const c = pa.map((v, i) => Math.round(v + (pb[i] - v) * t));
  return `rgb(${c[0]},${c[1]},${c[2]})`;
}

interface LiveState {
  auditioning: boolean;
  keyIndex: number;
  freq: number;
  cents: number;
  dissonance: number;
}

interface AutoStep {
  t: number; // seconds after start
  keyIndex: number;
  phase: number; // 0..1, already on the 1/16 grid
  cents: number;
}

/** Seeded autopilot canon — a few consonant vows and one daring, sharp one. */
function buildAutoScript(): AutoStep[] {
  const rng = mulberry32(0x3672);
  const q = (p: number) => Math.round(p * QUANT) / QUANT;
  const pick = (choices: number[]) =>
    choices[Math.floor(rng() * choices.length)];
  // chord tones: root, third, fifth, octave, sixth
  const steps: AutoStep[] = [
    { t: 0.45, keyIndex: 0, phase: q(0.0 + rng() * 0.02), cents: 0 },
    { t: 0.95, keyIndex: 4, phase: q(0.5), cents: 0 },
    { t: 1.45, keyIndex: 2, phase: q(0.25), cents: 0 },
    { t: 1.95, keyIndex: 7, phase: q(0.75), cents: 0 },
    // the daring vow — deliberately sharp of a chord tone, and it stays forever
    { t: 2.5, keyIndex: pick([3, 5]), phase: q(0.625), cents: 38 + rng() * 14 },
  ];
  return steps;
}

export default function OathPage() {
  const [supported, setSupported] = useState(true);
  const [audioOK, setAudioOK] = useState(true);
  const [running, setRunning] = useState(false);
  const [showNotes, setShowNotes] = useState(false);
  const [tookOver, setTookOver] = useState(false);
  const [vowCount, setVowCount] = useState(0);
  const [live, setLive] = useState<LiveState>({
    auditioning: false,
    keyIndex: -1,
    freq: 0,
    cents: 0,
    dissonance: 0,
  });

  const engineRef = useRef<OathEngine | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const rafRef = useRef<number | null>(null);
  const hudTimerRef = useRef<number | null>(null);
  const lastTsRef = useRef<number | null>(null);

  // live audition state (refs so the rAF loop reads them without re-render)
  const activeKeyRef = useRef<number>(-1);
  const bendRef = useRef<number>(0);
  const arrowDirRef = useRef<number>(0);
  const liveRef = useRef<LiveState>(live);

  // autopilot / hand-over
  const tookOverRef = useRef(false);
  const runningRef = useRef(false);
  const autoScriptRef = useRef<AutoStep[]>([]);
  const autoIdxRef = useRef(0);
  const startClockRef = useRef(0);

  useEffect(() => {
    const AC =
      typeof window !== "undefined" &&
      (window.AudioContext ||
        (window as unknown as { webkitAudioContext?: unknown })
          .webkitAudioContext);
    setSupported(!!AC);
  }, []);

  const currentLiveFreq = useCallback((): number => {
    const k = activeKeyRef.current;
    if (k < 0) return 0;
    return keyBaseFreq(k) * Math.pow(2, bendRef.current / 1200);
  }, []);

  // --- hand control from the autopilot to the player -----------------------
  const handOver = useCallback(() => {
    if (tookOverRef.current) return;
    tookOverRef.current = true;
    setTookOver(true);
  }, []);

  // --- start the rite (first gesture) --------------------------------------
  const begin = useCallback(async () => {
    if (runningRef.current) return;
    const engine = new OathEngine(BPM, BEATS);
    engineRef.current = engine;
    const ok = await engine.start();
    setAudioOK(ok);
    autoScriptRef.current = buildAutoScript();
    autoIdxRef.current = 0;
    startClockRef.current = engine.now();
    runningRef.current = true;
    setRunning(true);
  }, []);

  // --- key handling --------------------------------------------------------
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      const key = e.key.toLowerCase();
      const isNote = (KEYS as readonly string[]).includes(key);
      const isCommit = e.key === " " || e.code === "Space";
      const isUp = e.key === "ArrowUp";
      const isDown = e.key === "ArrowDown";

      if (!isNote && !isCommit && !isUp && !isDown) return;
      if (isCommit || isUp || isDown) e.preventDefault();

      // start on first meaningful key if the rite hasn't begun
      if (!runningRef.current) {
        if (isNote || isCommit) void begin();
        // fall through so the very first note also auditions
      }

      // the first real keypress takes control from the autopilot
      handOver();

      if (isNote) {
        if (e.repeat) return;
        const idx = KEYS.indexOf(key as (typeof KEYS)[number]);
        activeKeyRef.current = idx;
        bendRef.current = 0;
        engineRef.current?.audition(keyBaseFreq(idx));
        return;
      }

      if (isUp) {
        arrowDirRef.current = 1;
        return;
      }
      if (isDown) {
        arrowDirRef.current = -1;
        return;
      }

      if (isCommit) {
        const eng = engineRef.current;
        const k = activeKeyRef.current;
        if (!eng || k < 0) return; // must be auditioning to vow
        const phase = Math.round(eng.phaseNow() * QUANT) / QUANT;
        const freq = currentLiveFreq();
        eng.commit(phase % 1, freq, k, bendRef.current);
        setVowCount(eng.vows.length);
      }
    };

    const onKeyUp = (e: KeyboardEvent) => {
      const key = e.key.toLowerCase();
      if ((KEYS as readonly string[]).includes(key)) {
        const idx = KEYS.indexOf(key as (typeof KEYS)[number]);
        if (activeKeyRef.current === idx) {
          activeKeyRef.current = -1;
          engineRef.current?.endAudition();
        }
        return;
      }
      if (e.key === "ArrowUp" && arrowDirRef.current === 1)
        arrowDirRef.current = 0;
      if (e.key === "ArrowDown" && arrowDirRef.current === -1)
        arrowDirRef.current = 0;
    };

    window.addEventListener("keydown", onKeyDown);
    window.addEventListener("keyup", onKeyUp);
    return () => {
      window.removeEventListener("keydown", onKeyDown);
      window.removeEventListener("keyup", onKeyUp);
    };
  }, [begin, handOver, currentLiveFreq]);

  // --- idle autopilot kickoff ----------------------------------------------
  useEffect(() => {
    if (!supported) return;
    const t = window.setTimeout(() => {
      if (!runningRef.current && !tookOverRef.current) void begin();
    }, IDLE_START_MS);
    return () => clearTimeout(t);
  }, [supported, begin]);

  // --- HUD sync (throttled — keeps rAF free of React re-renders) -----------
  useEffect(() => {
    hudTimerRef.current = window.setInterval(() => {
      setLive({ ...liveRef.current });
    }, 90);
    return () => {
      if (hudTimerRef.current !== null) clearInterval(hudTimerRef.current);
    };
  }, []);

  // --- canvas renderer -----------------------------------------------------
  const drawScene = useCallback(
    (
      ctx: CanvasRenderingContext2D,
      canvas: HTMLCanvasElement,
      eng: OathEngine | null,
    ) => {
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      const cssW = canvas.clientWidth || 480;
      const cssH = canvas.clientHeight || 480;
      if (canvas.width !== Math.round(cssW * dpr)) {
        canvas.width = Math.round(cssW * dpr);
        canvas.height = Math.round(cssH * dpr);
      }
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

      const w = cssW;
      const h = cssH;
      const cx = w / 2;
      const cy = h / 2;
      const R = Math.min(w, h) * 0.34;

      // backdrop
      const bg = ctx.createRadialGradient(cx, cy, 0, cx, cy, Math.max(w, h) * 0.7);
      bg.addColorStop(0, "#150c26");
      bg.addColorStop(0.6, "#0b0713");
      bg.addColorStop(1, "#05030a");
      ctx.fillStyle = bg;
      ctx.fillRect(0, 0, w, h);

      const now = eng ? eng.now() : performance.now() / 1000;
      const phase = eng ? eng.phaseNow() : 0;
      const angleFor = (p: number) => -Math.PI / 2 + p * Math.PI * 2;

      // faint concentric aura
      ctx.strokeStyle = "rgba(139,92,246,0.06)";
      ctx.lineWidth = 1;
      for (let i = 1; i <= 3; i++) {
        ctx.beginPath();
        ctx.arc(cx, cy, R + i * 18, 0, Math.PI * 2);
        ctx.stroke();
      }

      // beat ticks
      for (let b = 0; b < BEATS; b++) {
        const a = angleFor(b / BEATS);
        const inner = R - 10;
        const outer = R + 10;
        ctx.strokeStyle = "rgba(196,181,253,0.28)";
        ctx.lineWidth = b === 0 ? 2.4 : 1.2;
        ctx.beginPath();
        ctx.moveTo(cx + Math.cos(a) * inner, cy + Math.sin(a) * inner);
        ctx.lineTo(cx + Math.cos(a) * outer, cy + Math.sin(a) * outer);
        ctx.stroke();
      }

      // the ceremonial ring
      ctx.save();
      ctx.shadowColor = C_VIOLET;
      ctx.shadowBlur = 18;
      ctx.strokeStyle = C_RING;
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.arc(cx, cy, R, 0, Math.PI * 2);
      ctx.stroke();
      ctx.restore();

      // committed vows — engraved glyphs welded to the ring
      const vows = eng?.vows ?? [];
      for (const v of vows) {
        const a = angleFor(v.phase);
        // higher pitch sits a touch further out
        const pitchOff = clamp((v.keyIndex - 3.5) * 2.2 + v.cents * 0.02, -14, 16);
        const rr = R + pitchOff;
        const gx = cx + Math.cos(a) * rr;
        const gy = cy + Math.sin(a) * rr;

        // pulse as the playhead crosses this vow
        const d = phaseDist(phase, v.phase);
        const pulse = Math.exp(-(d * 22) * (d * 22));

        // birth ripple (fresh vows announce themselves)
        const age = now - v.born;
        if (age >= 0 && age < 0.7) {
          const rp = age / 0.7;
          ctx.strokeStyle = `rgba(221,214,254,${(1 - rp) * 0.6})`;
          ctx.lineWidth = 2;
          ctx.beginPath();
          ctx.arc(gx, gy, 6 + rp * 26, 0, Math.PI * 2);
          ctx.stroke();
        }

        // weld line to the ring
        ctx.strokeStyle = `rgba(139,92,246,${0.35 + pulse * 0.5})`;
        ctx.lineWidth = 1 + pulse * 1.5;
        ctx.beginPath();
        ctx.moveTo(cx + Math.cos(a) * (R - 3), cy + Math.sin(a) * (R - 3));
        ctx.lineTo(gx, gy);
        ctx.stroke();

        // the glyph — a diamond rune, brightening on each pass
        const sz = 5 + pulse * 4.5;
        ctx.save();
        ctx.translate(gx, gy);
        ctx.rotate(a + Math.PI / 4);
        ctx.shadowColor = C_VIOLET;
        ctx.shadowBlur = 6 + pulse * 16;
        ctx.fillStyle = lerpHex(C_VIOLET, C_VIOLET_HI, pulse);
        ctx.fillRect(-sz / 2, -sz / 2, sz, sz);
        ctx.restore();
      }

      // playhead sweep
      const pa = angleFor(phase);
      const grad = ctx.createLinearGradient(
        cx,
        cy,
        cx + Math.cos(pa) * (R + 26),
        cy + Math.sin(pa) * (R + 26),
      );
      grad.addColorStop(0, "rgba(221,214,254,0.04)");
      grad.addColorStop(1, "rgba(221,214,254,0.65)");
      ctx.strokeStyle = grad;
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(cx, cy);
      ctx.lineTo(cx + Math.cos(pa) * (R + 26), cy + Math.sin(pa) * (R + 26));
      ctx.stroke();

      // playhead head on the ring
      ctx.save();
      ctx.shadowColor = C_RING_HOT;
      ctx.shadowBlur = 14;
      ctx.fillStyle = C_WHITE;
      ctx.beginPath();
      ctx.arc(cx + Math.cos(pa) * R, cy + Math.sin(pa) * R, 3.2, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();

      // live audition cursor — glows violet if consonant, gains a red edge if it will clash
      const ls = liveRef.current;
      if (ls.auditioning) {
        const pitchOff = clamp(
          (ls.keyIndex - 3.5) * 2.2 + ls.cents * 0.02,
          -14,
          16,
        );
        const rr = R + pitchOff;
        const lx = cx + Math.cos(pa) * rr;
        const ly = cy + Math.sin(pa) * rr;
        const clashColor = lerpHex(C_VIOLET_HI, C_CLASH, clamp(ls.dissonance, 0, 1));

        // clash edge halo
        ctx.save();
        ctx.strokeStyle = clashColor;
        ctx.globalAlpha = 0.5 + 0.4 * ls.dissonance;
        ctx.lineWidth = 1.5 + 3 * ls.dissonance;
        ctx.beginPath();
        ctx.arc(lx, ly, 11, 0, Math.PI * 2);
        ctx.stroke();
        ctx.restore();

        // bright cursor core
        ctx.save();
        ctx.shadowColor = clashColor;
        ctx.shadowBlur = 20;
        ctx.fillStyle = lerpHex(C_VIOLET, C_VIOLET_HI, 1 - ls.dissonance * 0.6);
        ctx.beginPath();
        ctx.arc(lx, ly, 6.5, 0, Math.PI * 2);
        ctx.fill();
        ctx.restore();
      }

      // centre sigil — vow count
      ctx.fillStyle = "rgba(221,214,254,0.85)";
      ctx.font = "600 30px ui-sans-serif, system-ui, sans-serif";
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.fillText(String(vows.length), cx, cy - 6);
      ctx.fillStyle = "rgba(138,138,147,0.85)";
      ctx.font = "600 9px ui-monospace, monospace";
      ctx.fillText(vows.length === 1 ? "VOW SWORN" : "VOWS SWORN", cx, cy + 14);
    },
    [],
  );

  // --- animation + autopilot loop ------------------------------------------
  useEffect(() => {
    const draw = (ts: number) => {
      rafRef.current = requestAnimationFrame(draw);
      const eng = engineRef.current;
      const canvas = canvasRef.current;
      if (!canvas) return;
      const ctx = canvas.getContext("2d");
      if (!ctx) return;

      const last = lastTsRef.current ?? ts;
      const dt = Math.min(0.05, (ts - last) / 1000);
      lastTsRef.current = ts;

      // advance pitch bend while an arrow is held
      if (activeKeyRef.current >= 0 && arrowDirRef.current !== 0) {
        bendRef.current = clamp(
          bendRef.current + arrowDirRef.current * BEND_RATE * dt,
          -BEND_LIMIT,
          BEND_LIMIT,
        );
        eng?.bendAudition(currentLiveFreq());
      }

      // autopilot: fire scripted vows until the player takes over
      if (eng && runningRef.current && !tookOverRef.current) {
        const elapsed = eng.now() - startClockRef.current;
        const script = autoScriptRef.current;
        while (
          autoIdxRef.current < script.length &&
          elapsed >= script[autoIdxRef.current].t
        ) {
          const s = script[autoIdxRef.current];
          const freq = keyBaseFreq(s.keyIndex) * Math.pow(2, s.cents / 1200);
          eng.commit(s.phase, freq, s.keyIndex, s.cents);
          setVowCount(eng.vows.length);
          autoIdxRef.current++;
        }
      }

      // update live readout ref
      const k = activeKeyRef.current;
      if (eng && k >= 0) {
        const freq = currentLiveFreq();
        liveRef.current = {
          auditioning: true,
          keyIndex: k,
          freq,
          cents: bendRef.current,
          dissonance: dissonanceOf(freq, eng.vows),
        };
      } else if (liveRef.current.auditioning) {
        liveRef.current = { ...liveRef.current, auditioning: false };
      }

      drawScene(ctx, canvas, eng);
    };
    rafRef.current = requestAnimationFrame(draw);
    return () => {
      if (rafRef.current !== null) cancelAnimationFrame(rafRef.current);
    };
  }, [currentLiveFreq, drawScene]);

  // --- teardown ------------------------------------------------------------
  useEffect(() => {
    return () => {
      if (rafRef.current !== null) cancelAnimationFrame(rafRef.current);
      if (hudTimerRef.current !== null) clearInterval(hudTimerRef.current);
      engineRef.current?.stop();
      engineRef.current = null;
    };
  }, []);

  const centsLabel =
    live.cents > 3
      ? `+${Math.round(live.cents)}¢`
      : live.cents < -3
        ? `${Math.round(live.cents)}¢`
        : "in tune";
  const consonanceLabel = !live.auditioning
    ? "—"
    : live.dissonance < 0.28
      ? "consonant with the canon"
      : live.dissonance < 0.55
        ? "tense against the canon"
        : "clashing — vow with care";

  return (
    <main className="min-h-screen bg-background text-foreground">
      <div className="mx-auto flex max-w-4xl flex-col gap-6 px-6 py-10">
        {/* Header */}
        <header className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
          <div className="max-w-xl">
            <p className="font-mono text-xs uppercase tracking-[0.18em] text-muted-foreground">
              Dream 3672 &middot; append-only ledger
            </p>
            <h1 className="mt-2 text-2xl font-semibold tracking-tight sm:text-3xl">
              Oath
            </h1>
            <p className="mt-2 text-base text-muted-foreground">
              Every note you commit locks into an eternal loop &mdash; no undo,
              no erase. The piece you end with is the sum of every choice you
              dared to keep.
            </p>
          </div>
          <div className="flex shrink-0 items-center gap-3">
            {!running ? (
              <button
                onClick={() => void begin()}
                disabled={!supported}
                className="min-h-[44px] rounded-md bg-primary px-6 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90 disabled:opacity-50"
              >
                Begin the rite
              </button>
            ) : (
              <span
                className={`font-mono text-xs uppercase tracking-[0.18em] ${
                  tookOver ? "text-primary" : "text-muted-foreground"
                }`}
              >
                {tookOver ? "YOU" : "AUTO"} &middot; {vowCount}{" "}
                {vowCount === 1 ? "vow" : "vows"}
              </span>
            )}
          </div>
        </header>

        {!supported && (
          <p className="text-base text-destructive">
            Web Audio isn&rsquo;t available in this browser, so no vow will
            sound &mdash; but the ring still turns. Try a recent Chrome,
            Firefox, or Safari.
          </p>
        )}
        {supported && running && !audioOK && (
          <p className="text-base text-destructive">
            The audio engine failed to start, so vows are silent &mdash; the
            visual rite continues.
          </p>
        )}

        {/* Stage */}
        <section className="flex flex-col items-center gap-4">
          <canvas
            ref={canvasRef}
            className="aspect-square w-full max-w-[480px] rounded-lg"
            style={{
              background:
                "radial-gradient(circle at 50% 48%, #150c26 0%, #0b0713 60%, #05030a 100%)",
              boxShadow: "inset 0 0 90px rgba(0,0,0,0.6)",
            }}
            aria-label="Ceremonial ring. A playhead sweeps one looping bar; committed vows are engraved as glyphs that pulse when the playhead crosses them."
          />

          {/* Live readout */}
          <div className="flex min-h-[24px] flex-wrap items-center justify-center gap-x-4 gap-y-1 text-center">
            {live.auditioning ? (
              <>
                <span className="font-mono text-xs uppercase tracking-[0.18em] text-primary">
                  {KEY_LABELS[live.keyIndex]} &middot;{" "}
                  {Math.round(live.freq)} Hz &middot; {centsLabel}
                </span>
                <span
                  className={`font-mono text-xs uppercase tracking-[0.18em] ${
                    live.dissonance < 0.28
                      ? "text-primary"
                      : live.dissonance < 0.55
                        ? "text-muted-foreground"
                        : "text-destructive"
                  }`}
                >
                  {consonanceLabel}
                </span>
              </>
            ) : (
              <span className="font-mono text-xs uppercase tracking-[0.18em] text-muted-foreground">
                {running
                  ? "hold a key to audition · space to vow"
                  : "press begin, or any key, to open the rite"}
              </span>
            )}
          </div>
        </section>

        {/* Legend + permanence warning */}
        <section className="grid gap-4 sm:grid-cols-2">
          <div className="rounded-md border border-border bg-card/40 p-4">
            <p className="font-mono text-xs uppercase tracking-[0.18em] text-muted-foreground">
              The keys
            </p>
            <ul className="mt-3 space-y-1.5 text-sm text-foreground">
              <li>
                <span className="font-mono text-xs text-primary">A S D F G H J K</span>{" "}
                &mdash; hold to audition a pitch, low to high
              </li>
              <li>
                <span className="font-mono text-xs text-primary">
                  &uarr; / &darr;
                </span>{" "}
                &mdash; bend the held pitch continuously (no safe scale)
              </li>
              <li>
                <span className="font-mono text-xs text-primary">Space</span>{" "}
                &mdash; <span className="text-foreground">vow</span> the live
                note at the playhead, forever
              </li>
            </ul>
          </div>
          <div className="rounded-md border border-destructive/40 bg-destructive/5 p-4">
            <p className="font-mono text-xs uppercase tracking-[0.18em] text-destructive">
              No undo
            </p>
            <p className="mt-3 text-sm text-muted-foreground">
              Every commit is permanent. There is no delete, no erase, no clear.
              A beautiful vow and an ugly one both stay for the life of the
              piece. The live cursor glows violet when it agrees with the canon
              and reddens when it will clash &mdash; you always know the weight
              before you swear.
            </p>
          </div>
        </section>

        {/* Design notes toggle */}
        <div>
          <button
            onClick={() => setShowNotes((s) => !s)}
            className="font-mono text-xs uppercase tracking-[0.18em] text-muted-foreground underline decoration-dotted underline-offset-4 transition-colors hover:text-primary"
          >
            {showNotes ? "Hide the design notes" : "Read the design notes"}
          </button>
          {showNotes && (
            <div className="mt-4 space-y-4 rounded-md border border-border bg-card/40 p-5 text-sm text-muted-foreground">
              <p>
                <span className="text-foreground">The one question.</span> What
                if composing meant making vows you can never take back? The
                stakes here model no physical system &mdash; they come entirely
                from irreversibility.
              </p>
              <p>
                <span className="text-foreground">Mechanic.</span> A luminous
                ring is one looping bar ({BEATS} beats at {BPM} BPM). Holding a
                key auditions a continuous pitch live; the arrows bend it off
                any safe scale. Pressing Space welds that exact pitch to the
                ring at the current beat as a permanent looping voice. Vows
                accumulate irreversibly, so minute three genuinely differs from
                minute one.
              </p>
              <p>
                <span className="text-foreground">Audio.</span> Each vow is a
                short pluck scheduled by a look-ahead scheduler (a 25&nbsp;ms
                interval that queues WebAudio events ~100&nbsp;ms ahead &mdash;
                the &ldquo;Tale of Two Clocks&rdquo; pattern). Everything runs
                through a compressor and a master gain of 0.28 so nothing peaks.
              </p>
              <p>
                <span className="text-foreground">References.</span> Tehching
                Hsieh&rsquo;s <em>One Year Performances</em> (irreversible lived
                commitment as art), Terry Riley&rsquo;s <em>In&nbsp;C</em>{" "}
                (looping additive cells), and the folk idiom &ldquo;you
                can&rsquo;t un-ring a bell.&rdquo;
              </p>
              <p className="text-xs">
                Not verified in this build container: real audio output and
                interactive keypresses &mdash; only static compilation is
                checked here.
              </p>
            </div>
          )}
        </div>
      </div>
    </main>
  );
}
