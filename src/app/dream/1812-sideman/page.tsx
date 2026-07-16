"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { PrototypeNav } from "../_shared/prototype-nav";
import { JazzEngine, type Snapshot, type VisEvent } from "./audio";

// ── palette (warm jazz club: amber / warm-white on near-black) ───────────────
const BG0 = "#0a0705";
const BG1 = "#14100a";
const AMBER = "#e0a94a";
const AMBER_HI = "#ffd27a";
const WARM_WHITE = "#f3e9d6";
const DIM = "#6b5a3e";

// QWERTY rows → scale-degree indices in the current key.
const LOW_KEYS = ["z", "x", "c", "v", "b", "n", "m", ",", ".", "/"];
const HIGH_KEYS = ["q", "w", "e", "r", "t", "y", "u", "i", "o", "p"];

interface MidiInputLike {
  onmidimessage: ((e: { data: Uint8Array }) => void) | null;
}
interface MidiAccessLike {
  inputs: { values(): IterableIterator<MidiInputLike> };
}

// ── canvas drawing ───────────────────────────────────────────────────────────

function drawBackground(ctx: CanvasRenderingContext2D, w: number, h: number, energy: number) {
  const g = ctx.createLinearGradient(0, 0, 0, h);
  g.addColorStop(0, BG1);
  g.addColorStop(1, BG0);
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, w, h);
  // warm spotlight glow that breathes with the ensemble energy
  const glow = ctx.createRadialGradient(w * 0.5, h * 0.34, 10, w * 0.5, h * 0.42, h * 0.9);
  const a = 0.06 + energy * 0.13;
  glow.addColorStop(0, `rgba(224,169,74,${a})`);
  glow.addColorStop(0.5, `rgba(180,110,40,${a * 0.4})`);
  glow.addColorStop(1, "rgba(0,0,0,0)");
  ctx.fillStyle = glow;
  ctx.fillRect(0, 0, w, h);
}

function drawAnticipation(
  ctx: CanvasRenderingContext2D,
  w: number,
  snap: Snapshot,
) {
  const cx = w * 0.5;
  const y = 52;
  const barPhase = snap.beatInBar / 4; // 0..1 through the current bar
  const beatsLeft = snap.beatsUntilNext;
  const near = beatsLeft <= 1;

  // current → next chord line
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";

  ctx.font = "600 44px ui-monospace, monospace";
  ctx.fillStyle = AMBER_HI;
  const curW = ctx.measureText(snap.currentChord).width;
  const arrowW = 54;
  const nextText = snap.nextChord;
  const nextW = ctx.measureText(nextText).width;
  const total = curW + arrowW + nextW;
  const startX = cx - total / 2;

  ctx.textAlign = "left";
  ctx.fillStyle = AMBER_HI;
  ctx.fillText(snap.currentChord, startX, y);

  ctx.fillStyle = near ? AMBER_HI : DIM;
  ctx.font = "600 30px ui-monospace, monospace";
  ctx.fillText("→", startX + curW + 12, y + 2);

  // next chord pulses as the change approaches
  const pulse = near ? 0.7 + 0.3 * Math.sin(Date.now() / 90) : 1;
  ctx.font = "600 44px ui-monospace, monospace";
  ctx.fillStyle = near
    ? `rgba(255,210,122,${pulse})`
    : "rgba(224,169,74,0.72)";
  ctx.fillText(nextText, startX + curW + arrowW, y);

  // countdown caption
  ctx.textAlign = "center";
  ctx.font = "500 15px ui-monospace, monospace";
  ctx.fillStyle = near ? AMBER_HI : "rgba(243,233,214,0.8)";
  ctx.fillText(
    `next change in ${beatsLeft.toFixed(1)} beats`,
    cx,
    y + 40,
  );

  // progress bar toward the change (fills across the current bar)
  const bw = Math.min(560, w * 0.7);
  const bx = cx - bw / 2;
  const by = y + 58;
  ctx.fillStyle = "rgba(255,255,255,0.08)";
  ctx.fillRect(bx, by, bw, 7);
  ctx.fillStyle = near ? AMBER_HI : AMBER;
  ctx.fillRect(bx, by, bw * barPhase, 7);
  // beat ticks
  for (let i = 0; i <= 4; i++) {
    ctx.fillStyle = "rgba(243,233,214,0.35)";
    ctx.fillRect(bx + (bw * i) / 4, by - 3, 1.5, 13);
  }
}

function drawLane(
  ctx: CanvasRenderingContext2D,
  w: number,
  h: number,
  engine: JazzEngine,
  snap: Snapshot,
  now: number,
) {
  const laneTop = h * 0.42;
  const laneH = h * 0.30;
  const pxPerBeat = w / 8;
  const nowX = w * 0.32;
  const beatFloat = snap.beatFloat;
  const beatToX = (b: number) => nowX + (b - beatFloat) * pxPerBeat;

  // faint lane backdrop
  ctx.fillStyle = "rgba(255,255,255,0.02)";
  ctx.fillRect(0, laneTop, w, laneH);

  // beat gridlines + numbers
  const firstBeat = Math.floor(beatFloat) - 2;
  for (let b = firstBeat; b < firstBeat + 12; b++) {
    const x = beatToX(b);
    if (x < -20 || x > w + 20) continue;
    const inBar = ((b % 4) + 4) % 4;
    ctx.strokeStyle = inBar === 0 ? "rgba(224,169,74,0.22)" : "rgba(255,255,255,0.05)";
    ctx.lineWidth = inBar === 0 ? 1.5 : 1;
    ctx.beginPath();
    ctx.moveTo(x, laneTop);
    ctx.lineTo(x, laneTop + laneH);
    ctx.stroke();
    ctx.fillStyle = "rgba(243,233,214,0.35)";
    ctx.font = "500 11px ui-monospace, monospace";
    ctx.textAlign = "center";
    ctx.fillText(String(inBar + 1), x, laneTop + laneH + 14);
  }

  // chord blocks approaching the NOW line
  const blockH = 30;
  const blockY = laneTop + 8;
  for (let bar = snap.barIndex - 1; bar <= snap.barIndex + 5; bar++) {
    const x0 = beatToX(bar * 4);
    const bw = 4 * pxPerBeat;
    if (x0 + bw < 0 || x0 > w) continue;
    const isCurrent = bar === snap.barIndex;
    const isNext = bar === snap.barIndex + 1;
    ctx.fillStyle = isCurrent
      ? "rgba(224,169,74,0.28)"
      : isNext
        ? "rgba(224,169,74,0.15)"
        : "rgba(224,169,74,0.06)";
    roundRect(ctx, x0 + 3, blockY, bw - 6, blockH, 6);
    ctx.fill();
    if (isNext) {
      ctx.strokeStyle = AMBER_HI;
      ctx.lineWidth = 2;
      ctx.stroke();
    }
    ctx.fillStyle = isCurrent ? AMBER_HI : isNext ? WARM_WHITE : "rgba(243,233,214,0.55)";
    ctx.font = `${isCurrent ? "600 18px" : "500 15px"} ui-monospace, monospace`;
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText(engine.chordAt(bar).label, x0 + bw / 2, blockY + blockH / 2);
  }

  // NOW line
  ctx.strokeStyle = AMBER_HI;
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(nowX, laneTop - 4);
  ctx.lineTo(nowX, laneTop + laneH + 4);
  ctx.stroke();
  ctx.fillStyle = AMBER_HI;
  ctx.font = "500 10px ui-monospace, monospace";
  ctx.textAlign = "center";
  ctx.fillText("NOW", nowX, laneTop - 10);

  // event marks
  const vis = engine.getVis();
  const noteTop = laneTop + 46;
  const noteBot = laneTop + laneH - 4;
  const midiToY = (m: number, lo: number, hi: number) =>
    noteBot - ((m - lo) / (hi - lo)) * (noteBot - noteTop);

  for (const e of vis) {
    const x = nowX + (engine.timeToBeat(e.t) - beatFloat) * pxPerBeat;
    if (x < -10 || x > w + 10) continue;
    const age = Math.max(0, now - e.t);
    const fade = Math.max(0, 1 - age / 3);
    drawEventMark(ctx, e, x, midiToY, fade, laneTop, laneH);
  }
}

function drawEventMark(
  ctx: CanvasRenderingContext2D,
  e: VisEvent,
  x: number,
  midiToY: (m: number, lo: number, hi: number) => number,
  fade: number,
  laneTop: number,
  laneH: number,
) {
  if (e.kind === "user" || e.kind === "melody") {
    const y = midiToY(e.midi, 55, 88);
    const r = e.kind === "user" ? 6 : 4.5;
    if (e.kind === "user") {
      ctx.fillStyle = `rgba(255,210,122,${0.5 + 0.5 * fade})`;
      ctx.beginPath();
      ctx.arc(x, y, r, 0, Math.PI * 2);
      ctx.fill();
    } else {
      ctx.strokeStyle = `rgba(224,169,74,${0.4 + 0.5 * fade})`;
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.arc(x, y, r, 0, Math.PI * 2);
      ctx.stroke();
    }
  } else if (e.kind === "bass") {
    const y = midiToY(e.midi, 32, 54);
    ctx.fillStyle = `rgba(200,150,80,${0.35 + 0.5 * fade})`;
    ctx.fillRect(x - 3, y - 3, 6, 6);
  } else if (e.kind === "piano") {
    const y = midiToY(e.midi, 55, 88);
    ctx.fillStyle = `rgba(180,140,90,${0.25 + 0.4 * fade})`;
    ctx.fillRect(x - 2, y - 2, 4, 4);
  } else if (e.kind === "ride") {
    ctx.fillStyle = `rgba(243,233,214,${0.15 + 0.3 * fade})`;
    ctx.fillRect(x - 1, laneTop + laneH - 3, 2, 3 + e.vel * 4);
  } else if (e.kind === "kick") {
    ctx.fillStyle = `rgba(224,169,74,${0.3 + 0.4 * fade})`;
    ctx.fillRect(x - 2, laneTop + laneH - 8, 4, 8);
  }
}

function drawMeters(
  ctx: CanvasRenderingContext2D,
  w: number,
  h: number,
  energies: Record<string, number>,
) {
  const items: [string, number, string][] = [
    ["BASS", energies.bass, AMBER],
    ["PIANO", energies.piano, "#c89b5a"],
    ["DRUMS", energies.drums, WARM_WHITE],
    ["MELODY", energies.melody, AMBER_HI],
  ];
  const y = h - 26;
  const bw = 74;
  const gap = 14;
  const startX = (w - (bw * items.length + gap * (items.length - 1))) / 2;
  ctx.textAlign = "left";
  items.forEach(([label, v, color], i) => {
    const x = startX + i * (bw + gap);
    ctx.fillStyle = "rgba(243,233,214,0.55)";
    ctx.font = "500 10px ui-monospace, monospace";
    ctx.fillText(label, x, y - 6);
    ctx.fillStyle = "rgba(255,255,255,0.08)";
    ctx.fillRect(x, y, bw, 6);
    ctx.fillStyle = color;
    ctx.fillRect(x, y, bw * Math.min(1, v), 6);
  });
}

function roundRect(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  r: number,
) {
  const rr = Math.min(r, w / 2, h / 2);
  ctx.beginPath();
  ctx.moveTo(x + rr, y);
  ctx.arcTo(x + w, y, x + w, y + h, rr);
  ctx.arcTo(x + w, y + h, x, y + h, rr);
  ctx.arcTo(x, y + h, x, y, rr);
  ctx.arcTo(x, y, x + w, y, rr);
  ctx.closePath();
}

// energy = decaying sum of recent hits per instrument
function computeEnergies(vis: readonly VisEvent[], now: number) {
  const acc: Record<string, number> = { bass: 0, piano: 0, drums: 0, melody: 0 };
  for (const e of vis) {
    const age = now - e.t;
    if (age < 0 || age > 1.5) continue;
    const w = Math.exp(-age / 0.28) * e.vel;
    if (e.kind === "bass") acc.bass += w;
    else if (e.kind === "piano") acc.piano += w * 0.5;
    else if (e.kind === "ride" || e.kind === "kick" || e.kind === "swish") acc.drums += w * 0.5;
    else if (e.kind === "melody" || e.kind === "user") acc.melody += w;
  }
  return acc;
}

// ── component ────────────────────────────────────────────────────────────────

export default function SidemanPage() {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const engineRef = useRef<JazzEngine | null>(null);
  const ctxRef = useRef<AudioContext | null>(null);
  const rafRef = useRef<number>(0);
  const heldRef = useRef<Set<string>>(new Set());

  const [started, setStarted] = useState(false);
  const [midiOn, setMidiOn] = useState(false);
  const [bpm, setBpm] = useState(116);
  const [keyLabel, setKeyLabel] = useState("C major");
  const [tempoLock, setTempoLock] = useState(false);
  const [keyLock, setKeyLock] = useState(false);
  const [volume, setVolume] = useState(0.8);
  const [muted, setMuted] = useState(false);
  const [legend, setLegend] = useState<{ low: string[]; high: string[] }>({
    low: [],
    high: [],
  });

  // render loop
  const renderLoop = useCallback(() => {
    const canvas = canvasRef.current;
    const engine = engineRef.current;
    if (canvas && engine) {
      const dpr = Math.min(2, window.devicePixelRatio || 1);
      const cw = canvas.clientWidth;
      const ch = canvas.clientHeight;
      if (canvas.width !== cw * dpr || canvas.height !== ch * dpr) {
        canvas.width = cw * dpr;
        canvas.height = ch * dpr;
      }
      const ctx = canvas.getContext("2d");
      if (ctx) {
        ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
        const now = engine.now();
        const snap = engine.snapshot(now);
        const energies = computeEnergies(engine.getVis(), now);
        const total = Math.min(
          1,
          (energies.bass + energies.piano + energies.drums + energies.melody) / 3,
        );
        drawBackground(ctx, cw, ch, total);
        drawAnticipation(ctx, cw, snap);
        drawLane(ctx, cw, ch, engine, snap, now);
        drawMeters(ctx, cw, ch, energies);
      }
    }
    rafRef.current = requestAnimationFrame(renderLoop);
  }, []);

  // low-frequency sync of engine state → React labels
  useEffect(() => {
    if (!started) return;
    const id = setInterval(() => {
      const engine = engineRef.current;
      if (!engine) return;
      const snap = engine.snapshot(engine.now());
      setBpm(Math.round(snap.bpm));
      setKeyLabel(snap.keyLabel);
      setLegend(engine.legend());
    }, 250);
    return () => clearInterval(id);
  }, [started]);

  const handleStart = useCallback(async () => {
    if (started) return;
    const Ctx =
      window.AudioContext ||
      (window as unknown as { webkitAudioContext: typeof AudioContext })
        .webkitAudioContext;
    const ctx = new Ctx();
    await ctx.resume();
    const engine = new JazzEngine(ctx);
    engine.setVolume(volume);
    engine.setMuted(muted);
    engine.start();
    ctxRef.current = ctx;
    engineRef.current = engine;
    setLegend(engine.legend());
    setStarted(true);
    rafRef.current = requestAnimationFrame(renderLoop);

    // Web MIDI — degrade silently if unavailable
    const nav = navigator as unknown as {
      requestMIDIAccess?: () => Promise<MidiAccessLike>;
    };
    if (nav.requestMIDIAccess) {
      try {
        const access = await nav.requestMIDIAccess();
        setMidiOn(true);
        for (const input of access.inputs.values()) {
          input.onmidimessage = (e) => {
            const [status, note, vel] = e.data;
            if ((status & 0xf0) === 0x90 && vel > 0) {
              engineRef.current?.playUserNote(note);
            }
          };
        }
      } catch {
        setMidiOn(false);
      }
    }
  }, [started, volume, muted, renderLoop]);

  // QWERTY input
  useEffect(() => {
    const onDown = (e: KeyboardEvent) => {
      const engine = engineRef.current;
      if (!engine || !started) return;
      const k = e.key.toLowerCase();
      if (heldRef.current.has(k)) return;
      let midi = -1;
      const li = LOW_KEYS.indexOf(k);
      const hi = HIGH_KEYS.indexOf(k);
      if (li >= 0) midi = engine.noteForKey("low", li);
      else if (hi >= 0) midi = engine.noteForKey("high", hi);
      if (midi >= 0) {
        e.preventDefault();
        heldRef.current.add(k);
        engine.playUserNote(midi);
      }
    };
    const onUp = (e: KeyboardEvent) => {
      heldRef.current.delete(e.key.toLowerCase());
    };
    window.addEventListener("keydown", onDown);
    window.addEventListener("keyup", onUp);
    return () => {
      window.removeEventListener("keydown", onDown);
      window.removeEventListener("keyup", onUp);
    };
  }, [started]);

  // cleanup on unmount
  useEffect(() => {
    return () => {
      cancelAnimationFrame(rafRef.current);
      engineRef.current?.dispose();
      void ctxRef.current?.close();
    };
  }, []);

  const toggleTempoLock = () => {
    const v = !tempoLock;
    setTempoLock(v);
    engineRef.current?.setTempoLocked(v);
  };
  const toggleKeyLock = () => {
    const v = !keyLock;
    setKeyLock(v);
    engineRef.current?.setKeyLocked(v);
  };
  const onVolume = (v: number) => {
    setVolume(v);
    engineRef.current?.setVolume(v);
  };
  const toggleMute = () => {
    const v = !muted;
    setMuted(v);
    engineRef.current?.setMuted(v);
  };

  const btn =
    "min-h-[44px] rounded-lg px-4 py-2.5 font-mono text-base transition-colors";

  return (
    <main className="min-h-screen bg-[#0a0705] text-white">
      <div className="mx-auto max-w-5xl px-4 py-8">
        <header className="mb-5">
          <h1 className="text-2xl font-semibold tracking-tight text-white">
            1812 · Sideman
          </h1>
          <p className="mt-1 text-base text-white/75">
            A generative jazz trio that follows your tempo and key — and shows
            you the chord it&apos;s about to play a beat early, so you can play{" "}
            <span className="text-amber-300/95">into</span> the change.
          </p>
        </header>

        <div className="relative overflow-hidden rounded-2xl border border-amber-900/40 bg-black">
          <canvas
            ref={canvasRef}
            className="block h-[460px] w-full"
            aria-label="Jazz trio anticipation display"
          />
          {!started && (
            <div className="absolute inset-0 flex flex-col items-center justify-center gap-4 bg-black/70">
              <p className="max-w-md px-6 text-center text-base text-white/80">
                Press Start — the trio grooves immediately. Then play a melody on
                your keyboard rows below and watch it follow you.
              </p>
              <button
                onClick={handleStart}
                className="min-h-[44px] rounded-xl bg-amber-500 px-8 py-3 text-lg font-semibold text-black transition-colors hover:bg-amber-400"
              >
                ▶ Start the trio
              </button>
            </div>
          )}
        </div>

        {/* controls */}
        <div className="mt-4 flex flex-wrap items-center gap-3">
          {started && (
            <span className="rounded-lg border border-amber-900/50 bg-amber-950/30 px-4 py-2.5 font-mono text-base text-amber-200/95">
              ♩ {bpm} BPM
            </span>
          )}
          {started && (
            <button
              onClick={toggleTempoLock}
              className={`${btn} border ${
                tempoLock
                  ? "border-amber-400 bg-amber-500/20 text-amber-200"
                  : "border-white/15 text-white/75 hover:text-white"
              }`}
            >
              {tempoLock ? "🔒 tempo" : "🔓 tempo"}
            </button>
          )}
          {started && (
            <span className="rounded-lg border border-amber-900/50 bg-amber-950/30 px-4 py-2.5 font-mono text-base text-amber-200/95">
              key: {keyLabel}
            </span>
          )}
          {started && (
            <button
              onClick={toggleKeyLock}
              className={`${btn} border ${
                keyLock
                  ? "border-amber-400 bg-amber-500/20 text-amber-200"
                  : "border-white/15 text-white/75 hover:text-white"
              }`}
            >
              {keyLock ? "🔒 key" : "🔓 key"}
            </button>
          )}
          {started && (
            <button
              onClick={toggleMute}
              className={`${btn} border ${
                muted
                  ? "border-rose-400/60 bg-rose-500/15 text-rose-300"
                  : "border-white/15 text-white/75 hover:text-white"
              }`}
            >
              {muted ? "muted" : "mute"}
            </button>
          )}
          {started && (
            <label className="flex items-center gap-2 rounded-lg border border-white/15 px-4 py-2.5 text-base text-white/75">
              vol
              <input
                type="range"
                min={0}
                max={1}
                step={0.01}
                value={volume}
                onChange={(e) => onVolume(parseFloat(e.target.value))}
                className="w-28 accent-amber-400"
              />
            </label>
          )}
          {started && (
            <span className="font-mono text-base text-white/75">
              MIDI: {midiOn ? "connected" : "QWERTY only"}
            </span>
          )}
        </div>

        {/* key legend */}
        <div className="mt-5 rounded-xl border border-white/10 bg-white/[0.03] p-4">
          <p className="mb-3 text-base text-white/75">
            Your keyboard is the melody instrument (quantized to the current
            key, so it always fits):
          </p>
          <KeyRow keys={HIGH_KEYS} notes={legend.high} label="upper octave" />
          <div className="h-2" />
          <KeyRow keys={LOW_KEYS} notes={legend.low} label="lower octave" />
        </div>

        {/* design notes */}
        <details className="mt-4 rounded-xl border border-white/10 bg-white/[0.03] p-4">
          <summary className="cursor-pointer text-base font-medium text-amber-300/95">
            Read the design notes
          </summary>
          <div className="mt-3 space-y-3 text-base text-white/75">
            <p>
              <span className="text-white/90">The one question:</span> what if
              your rhythm section could read your playing a beat ahead — showing
              you the next chord before it lands, so you play into the change
              instead of chasing it?
            </p>
            <p>
              The trio synthesizes a walking bass (chord tones + chromatic
              approach), rootless left-hand comping voicings (Bill Evans / Bud
              Powell), and a brush-drum swing groove, all on a look-ahead
              scheduler. It infers your tempo from note-onset spacing and biases
              the key from your pitch-class histogram (lock either if it feels
              jumpy).
            </p>
            <p>
              The anticipation display is borrowed from{" "}
              <span className="text-white/90">
                ReaLJam (arXiv:2502.21267, 2025)
              </span>
              , whose key idea is that the agent commits to and shows its
              upcoming chords ahead of time. Here the accompaniment engine is{" "}
              <span className="text-amber-300/95">rule-based, not ML</span> — the
              anticipation idea implemented in a browser with Web Audio +
              Canvas2D.
            </p>
            <p className="font-mono text-sm text-white/60">
              input: keyboard-played (QWERTY) + Web MIDI · output: Canvas2D ·
              technique: reactive/anticipatory generative accompaniment · vibe:
              jazz
            </p>
          </div>
        </details>
      </div>

      <PrototypeNav slugs={["1812-sideman"]} />
    </main>
  );
}

function KeyRow({
  keys,
  notes,
  label,
}: {
  keys: string[];
  notes: string[];
  label: string;
}) {
  return (
    <div className="flex flex-wrap items-center gap-1.5">
      <span className="mr-2 w-28 shrink-0 font-mono text-sm text-white/60">
        {label}
      </span>
      {keys.map((k, i) => (
        <span
          key={k}
          className="flex min-w-[42px] flex-col items-center rounded-md border border-amber-900/40 bg-amber-950/20 px-2 py-1"
        >
          <span className="font-mono text-base uppercase text-white/90">
            {k === " " ? "␣" : k}
          </span>
          <span className="font-mono text-sm text-amber-300/90">
            {notes[i] ?? "·"}
          </span>
        </span>
      ))}
    </div>
  );
}
