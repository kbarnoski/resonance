"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { PrototypeNav } from "../_shared/prototype-nav";
import { README } from "./readme-text";

// ── Musical model ───────────────────────────────────────────────────────────
const BPM = 96;
const BPS = BPM / 60;
const MIDI_LOW = 53; // F3  (bottom of the visible weft)
const MIDI_HIGH = 86; // D6 (top)
const MAX_THREADS = 420;
const GHOST_IDLE_MS = 6000;
const MASTER_GAIN = 0.16; // ≤ 0.17

// QWERTY → MIDI. White keys climb a two-octave C-major scale; the upper row
// holds the accidentals. (~2 octaves, C4→F5.)
const KEY_TO_MIDI: Record<string, number> = {
  a: 60, s: 62, d: 64, f: 65, g: 67, h: 69, j: 71, k: 72, l: 74, ";": 76, "'": 77,
  w: 61, e: 63, t: 66, y: 68, u: 70, o: 73, p: 75,
};

// Seeded canon subject for the ghost weaver. `t` is a fraction of the loop, so
// it works at any loop length. Deterministic — no wall-clock, no Math.random.
const GHOST_PHRASE: { t: number; midi: number }[] = [
  { t: 0.0, midi: 60 }, { t: 0.09, midi: 64 }, { t: 0.18, midi: 67 },
  { t: 0.27, midi: 72 }, { t: 0.36, midi: 71 }, { t: 0.45, midi: 67 },
  { t: 0.54, midi: 69 }, { t: 0.63, midi: 65 }, { t: 0.72, midi: 64 },
  { t: 0.81, midi: 62 }, { t: 0.9, midi: 60 }, { t: 0.955, midi: 59 },
];

const LOOP_OPTIONS = [4, 8, 16];

// ── Types ───────────────────────────────────────────────────────────────────
type Thread = {
  phaseBeat: number; // where in the loop it was struck
  midi: number;
  dur: number; // ring duration (s)
  strength: number; // over-dye count → thickness / depth
  firedLoop: number; // last loopIndex this thread sounded on
  glow: number; // frame when it last sounded (visual flash)
  justBorn: boolean; // skip crossing-trigger on its birth frame
  ghost: boolean;
};

// ── Deterministic RNG (texture only) ────────────────────────────────────────
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

function midiToFreq(midi: number): number {
  return 440 * Math.pow(2, (midi - 69) / 12);
}

function ringFor(midi: number): number {
  return Math.max(0.5, 1.7 - (midi - MIDI_LOW) / 42);
}

// ── Audio: a warm plucked/struck voice ──────────────────────────────────────
type Audio = { ctx: AudioContext; master: GainNode };

function makeAudio(): Audio {
  const ctx = new AudioContext();
  const comp = ctx.createDynamicsCompressor();
  comp.threshold.value = -18;
  comp.ratio.value = 3.5;
  comp.attack.value = 0.003;
  comp.release.value = 0.25;
  const master = ctx.createGain();
  master.gain.value = 0.0001;
  master.connect(comp).connect(ctx.destination);
  return { ctx, master };
}

function playVoice(audio: Audio, midi: number, vel: number, ghost: boolean) {
  const { ctx, master } = audio;
  if (ctx.state === "closed") return;
  const now = ctx.currentTime;
  const freq = midiToFreq(midi);
  const dur = ringFor(midi);
  const peak = (ghost ? 0.32 : 0.5) * vel;

  const osc = ctx.createOscillator();
  osc.type = "triangle";
  osc.frequency.value = freq;
  const oct = ctx.createOscillator();
  oct.type = "sine";
  oct.frequency.value = freq * 2;
  const octGain = ctx.createGain();
  octGain.gain.value = 0.18;

  const filter = ctx.createBiquadFilter();
  filter.type = "lowpass";
  filter.Q.value = 0.7;
  filter.frequency.setValueAtTime(Math.min(9000, freq * 6 + 1200), now);
  filter.frequency.exponentialRampToValueAtTime(Math.max(400, freq * 1.2), now + dur);

  const env = ctx.createGain();
  env.gain.setValueAtTime(0.0001, now);
  env.gain.linearRampToValueAtTime(peak, now + 0.006);
  env.gain.exponentialRampToValueAtTime(0.0001, now + dur);

  osc.connect(env);
  oct.connect(octGain).connect(env);
  env.connect(filter).connect(master);

  osc.start(now);
  oct.start(now);
  osc.stop(now + dur + 0.05);
  oct.stop(now + dur + 0.05);
}

// ── Render ──────────────────────────────────────────────────────────────────
function drawLoom(
  c: CanvasRenderingContext2D,
  W: number,
  H: number,
  threads: Thread[],
  loopBeats: number,
  loopPos: number,
  frame: number,
  texture: HTMLCanvasElement | null,
) {
  // Warm linen ground.
  const bg = c.createLinearGradient(0, 0, 0, H);
  bg.addColorStop(0, "#241e16");
  bg.addColorStop(1, "#15110c");
  c.fillStyle = bg;
  c.fillRect(0, 0, W, H);
  if (texture) {
    c.globalAlpha = 0.5;
    c.drawImage(texture, 0, 0, W, H);
    c.globalAlpha = 1;
  }

  const marginY = H * 0.06;
  const yFor = (midi: number) =>
    marginY + (1 - (midi - MIDI_LOW) / (MIDI_HIGH - MIDI_LOW)) * (H - 2 * marginY);

  const xHead = W * 0.6;
  const pxPerBeat = W / loopBeats;
  const loopWidthPx = W;

  // Warp threads: faint undyed fibre lines along each scale pitch (horizontal).
  c.lineWidth = 1;
  for (let m = 60; m <= 84; m += 2) {
    const y = yFor(m);
    c.strokeStyle = m % 12 === 0 ? "rgba(140,120,88,0.16)" : "rgba(120,104,76,0.08)";
    c.beginPath();
    c.moveTo(0, y);
    c.lineTo(W, y);
    c.stroke();
  }

  // Weft grid: scrolling vertical beat lines.
  c.strokeStyle = "rgba(110,96,70,0.10)";
  for (let b = 0; b <= loopBeats; b++) {
    const x = xHead + ((b - loopPos) * pxPerBeat);
    for (let k = -1; k <= 1; k++) {
      const xk = x + k * loopWidthPx;
      if (xk < -2 || xk > W + 2) continue;
      c.beginPath();
      c.moveTo(xk, marginY * 0.5);
      c.lineTo(xk, H - marginY * 0.5);
      c.stroke();
    }
  }

  // Threads — durable indigo weft, over-dyed where reinforced.
  for (const th of threads) {
    const y = yFor(th.midi);
    const len = Math.max(10, th.dur * pxPerBeat * BPS * 0.6);
    const thick = Math.min(9, 2.5 + th.strength * 1.1);
    const rel = th.phaseBeat - loopPos;
    const flash = Math.max(0, 1 - (frame - th.glow) / 22);

    for (let k = -1; k <= 0; k++) {
      const x = xHead + rel * pxPerBeat + k * loopWidthPx;
      if (x + len < -20 || x > W + 20) continue;
      // deep indigo, deeper with over-dye
      const depth = Math.min(1, 0.35 + th.strength * 0.16);
      const r = Math.round(46 + (1 - depth) * 40);
      const g = Math.round(70 + (1 - depth) * 34);
      const b = Math.round(150 - depth * 30);
      c.strokeStyle = th.ghost && th.strength <= 1
        ? "rgba(96,120,168,0.72)"
        : `rgba(${r},${g},${b},0.9)`;
      c.lineWidth = thick;
      c.lineCap = "round";
      c.beginPath();
      c.moveTo(x, y);
      c.lineTo(x + len, y);
      c.stroke();

      // over/under woven highlight
      c.strokeStyle = "rgba(228,214,176,0.14)";
      c.lineWidth = 1;
      c.beginPath();
      c.moveTo(x, y - thick * 0.28);
      c.lineTo(x + len, y - thick * 0.28);
      c.stroke();

      if (flash > 0) {
        c.save();
        c.shadowBlur = 18 * flash;
        c.shadowColor = "rgba(242,200,121,0.9)";
        c.strokeStyle = `rgba(244,214,150,${0.85 * flash})`;
        c.lineWidth = thick + 1.5;
        c.beginPath();
        c.moveTo(x, y);
        c.lineTo(x + Math.min(len, 16), y);
        c.stroke();
        c.restore();
      }
    }
  }

  // Read-head / shuttle — the "now" tracker bar (warm gold).
  c.save();
  c.shadowBlur = 16;
  c.shadowColor = "rgba(242,200,121,0.55)";
  c.strokeStyle = "rgba(242,200,121,0.9)";
  c.lineWidth = 2;
  c.beginPath();
  c.moveTo(xHead, marginY * 0.4);
  c.lineTo(xHead, H - marginY * 0.4);
  c.stroke();
  c.restore();
  c.fillStyle = "rgba(242,200,121,0.95)";
  c.beginPath();
  c.moveTo(xHead - 7, marginY * 0.4);
  c.lineTo(xHead + 7, marginY * 0.4);
  c.lineTo(xHead, marginY * 0.4 + 10);
  c.closePath();
  c.fill();
}

// ── Component ───────────────────────────────────────────────────────────────
export default function CanonLoomPage() {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const audioRef = useRef<Audio | null>(null);
  const threadsRef = useRef<Thread[]>([]);
  const loopBeatsRef = useRef<number>(8);
  const startRef = useRef<number>(0);
  const prevPosRef = useRef<number>(0);
  const prevIdxRef = useRef<number>(0);
  const lastInputRef = useRef<number>(0);
  const ghostIdxRef = useRef<number>(0);
  const frameRef = useRef<number>(0);
  const textureRef = useRef<HTMLCanvasElement | null>(null);

  const [started, setStarted] = useState(false);
  const [inputMode, setInputMode] = useState<"midi" | "keyboard">("keyboard");
  const [midiName, setMidiName] = useState<string | null>(null);
  const [loopBeats, setLoopBeats] = useState(8);
  const [density, setDensity] = useState(0);
  const [ghosting, setGhosting] = useState(true);
  const [showNotes, setShowNotes] = useState(false);
  const [failed, setFailed] = useState<string | null>(null);

  // Weave a note into the loom at the current loop phase (and sound it live).
  const weave = useCallback((midi: number, ghost: boolean) => {
    const loopBeats = loopBeatsRef.current;
    const t = (performance.now() - startRef.current) / 1000 * BPS;
    const pos = ((t % loopBeats) + loopBeats) % loopBeats;
    const threads = threadsRef.current;
    // Over-dye a nearby existing thread rather than piling up duplicates.
    const near = threads.find(
      (th) => th.midi === midi && Math.abs(th.phaseBeat - pos) < loopBeats * 0.02,
    );
    if (near) {
      near.strength += 1;
      near.glow = frameRef.current;
    } else if (threads.length < MAX_THREADS) {
      threads.push({
        phaseBeat: pos,
        midi,
        dur: ringFor(midi),
        strength: 1,
        firedLoop: Math.floor(t / loopBeats),
        glow: frameRef.current,
        justBorn: true,
        ghost,
      });
    }
    if (audioRef.current) playVoice(audioRef.current, midi, ghost ? 0.85 : 1, ghost);
  }, []);

  // Start / resume audio inside a user gesture.
  const ensureAudio = useCallback(() => {
    if (!audioRef.current) {
      try {
        audioRef.current = makeAudio();
      } catch {
        setFailed("Web Audio is unavailable in this browser.");
        return;
      }
    }
    const { ctx, master } = audioRef.current;
    if (ctx.state === "suspended") ctx.resume().catch(() => {});
    master.gain.cancelScheduledValues(ctx.currentTime);
    master.gain.setValueAtTime(Math.max(0.0001, master.gain.value), ctx.currentTime);
    master.gain.linearRampToValueAtTime(MASTER_GAIN, ctx.currentTime + 0.3);
    setStarted(true);
  }, []);

  const onHuman = useCallback((midi: number) => {
    lastInputRef.current = performance.now();
    ensureAudio();
    weave(midi, false);
  }, [ensureAudio, weave]);

  const applyLoop = useCallback((next: number) => {
    const prev = loopBeatsRef.current;
    if (next === prev) return;
    const scale = next / prev;
    for (const th of threadsRef.current) th.phaseBeat = (th.phaseBeat * scale) % next;
    loopBeatsRef.current = next;
    setLoopBeats(next);
  }, []);

  const clearLoom = useCallback(() => {
    threadsRef.current = [];
    ghostIdxRef.current = 0;
    lastInputRef.current = performance.now();
    setDensity(0);
  }, []);

  // One-time seeded linen texture.
  useEffect(() => {
    const tex = document.createElement("canvas");
    tex.width = 256;
    tex.height = 256;
    const tc = tex.getContext("2d");
    if (tc) {
      const rnd = mulberry32(1932);
      const img = tc.createImageData(256, 256);
      for (let i = 0; i < img.data.length; i += 4) {
        const v = rnd();
        const shade = 150 + Math.floor(v * 60);
        img.data[i] = shade;
        img.data[i + 1] = shade * 0.86;
        img.data[i + 2] = shade * 0.62;
        img.data[i + 3] = Math.floor(v * 20);
      }
      tc.putImageData(img, 0, 0);
    }
    textureRef.current = tex;
  }, []);

  // Web MIDI (no gesture required). Degrade silently to the keyboard.
  useEffect(() => {
    let access: MIDIAccess | null = null;
    const onMsg = (e: MIDIMessageEvent) => {
      const data = e.data;
      if (!data || data.length < 3) return;
      const status = data[0] & 0xf0;
      const note = data[1];
      const vel = data[2];
      if (status === 0x90 && vel > 0) onHuman(note);
    };
    if (typeof navigator !== "undefined" && navigator.requestMIDIAccess) {
      navigator
        .requestMIDIAccess()
        .then((acc) => {
          access = acc;
          const wire = () => {
            let name: string | null = null;
            acc.inputs.forEach((inp) => {
              inp.onmidimessage = onMsg;
              if (!name) name = inp.name ?? "MIDI device";
            });
            if (name) {
              setInputMode("midi");
              setMidiName(name);
            } else {
              setInputMode("keyboard");
              setMidiName(null);
            }
          };
          wire();
          acc.onstatechange = wire;
        })
        .catch(() => {
          /* no MIDI permission → keyboard fallback, not an error */
        });
    }
    return () => {
      if (access) access.inputs.forEach((inp) => (inp.onmidimessage = null));
    };
  }, [onHuman]);

  // Computer-keyboard fallback.
  useEffect(() => {
    const held = new Set<string>();
    const down = (e: KeyboardEvent) => {
      if (e.repeat || e.metaKey || e.ctrlKey || e.altKey) return;
      const midi = KEY_TO_MIDI[e.key.toLowerCase()];
      if (midi === undefined || held.has(e.key)) return;
      held.add(e.key);
      e.preventDefault();
      onHuman(midi);
    };
    const up = (e: KeyboardEvent) => held.delete(e.key);
    window.addEventListener("keydown", down);
    window.addEventListener("keyup", up);
    return () => {
      window.removeEventListener("keydown", down);
      window.removeEventListener("keyup", up);
    };
  }, [onHuman]);

  // Transport + ghost + render loop. Runs from mount so the loom is never
  // static; audio only sounds once a gesture has resumed the context.
  useEffect(() => {
    startRef.current = performance.now();
    lastInputRef.current = performance.now();
    let raf = 0;

    const resize = () => {
      const cv = canvasRef.current;
      if (!cv) return;
      const dpr = Math.min(2, window.devicePixelRatio || 1);
      cv.width = Math.floor(cv.clientWidth * dpr);
      cv.height = Math.floor(cv.clientHeight * dpr);
    };
    resize();
    window.addEventListener("resize", resize);

    const tick = () => {
      raf = requestAnimationFrame(tick);
      frameRef.current += 1;
      const frame = frameRef.current;
      const loopBeats = loopBeatsRef.current;
      const now = performance.now();
      const beat = ((now - startRef.current) / 1000) * BPS;
      const loopIdx = Math.floor(beat / loopBeats);
      const pos = beat - loopIdx * loopBeats;
      const prevPos = prevPosRef.current;
      const prevIdx = prevIdxRef.current;
      const wrapped = loopIdx !== prevIdx;

      // Canon: sound each thread as it scrolls under the read-head.
      const threads = threadsRef.current;
      for (const th of threads) {
        if (th.justBorn) {
          th.justBorn = false;
          continue;
        }
        const np = th.phaseBeat;
        const fired = wrapped
          ? np > prevPos || np <= pos
          : prevPos < np && np <= pos;
        if (fired) {
          th.glow = frame;
          if (audioRef.current) {
            const vel = Math.min(1, 0.55 + th.strength * 0.12);
            playVoice(audioRef.current, th.midi, vel * (th.ghost ? 0.9 : 1), th.ghost);
          }
        }
      }

      // Ghost weaver: after idle, thread the seeded subject once, then let the
      // loom loop it. Yields the moment a human plays.
      const idle = now - lastInputRef.current > GHOST_IDLE_MS;
      if (idle && ghostIdxRef.current < GHOST_PHRASE.length) {
        const g = GHOST_PHRASE[ghostIdxRef.current];
        const gb = g.t * loopBeats;
        const crossed = wrapped ? gb > prevPos || gb <= pos : prevPos < gb && gb <= pos;
        if (crossed) {
          const t = (performance.now() - startRef.current) / 1000 * BPS;
          const gp = ((t % loopBeats) + loopBeats) % loopBeats;
          const th: Thread = {
            phaseBeat: gp,
            midi: g.midi,
            dur: ringFor(g.midi),
            strength: 1,
            firedLoop: loopIdx,
            glow: frame,
            justBorn: false,
            ghost: true,
          };
          if (threads.length < MAX_THREADS) threads.push(th);
          if (audioRef.current) playVoice(audioRef.current, g.midi, 0.85, true);
          ghostIdxRef.current += 1;
        }
      }

      prevPosRef.current = pos;
      prevIdxRef.current = loopIdx;

      const cv = canvasRef.current;
      const c = cv?.getContext("2d");
      if (cv && c) drawLoom(c, cv.width, cv.height, threads, loopBeats, pos, frame, textureRef.current);

      // Throttled UI state.
      if (frame % 12 === 0) {
        setDensity(threads.length);
        setGhosting(idle && ghostIdxRef.current < GHOST_PHRASE.length);
      }
    };
    raf = requestAnimationFrame(tick);

    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener("resize", resize);
    };
  }, []);

  // Full teardown on unmount: stop oscillators + close the context.
  useEffect(() => {
    return () => {
      const a = audioRef.current;
      audioRef.current = null;
      if (a && a.ctx.state !== "closed") a.ctx.close().catch(() => {});
    };
  }, []);

  const mono = "font-mono text-xs uppercase tracking-[0.18em] text-muted-foreground";

  return (
    <main className="relative h-dvh w-full overflow-hidden bg-background text-foreground">
      <canvas ref={canvasRef} className="absolute inset-0 h-full w-full" />

      {/* Header */}
      <div className="pointer-events-none absolute inset-x-0 top-0 z-10 flex flex-col gap-1 p-5 sm:p-7">
        <h1 className="text-2xl font-semibold tracking-tight text-foreground">Canon Loom</h1>
        <p className="max-w-xl text-base text-muted-foreground">
          Every note you play is woven permanently into a scrolling roll — and plays itself
          back as counterpoint, your past self accompanying your present one.
        </p>
      </div>

      {/* Design notes */}
      <button
        onClick={() => setShowNotes(true)}
        className="absolute right-5 top-5 z-20 min-h-[44px] rounded-md border border-border bg-background/60 px-4 text-sm text-muted-foreground transition-colors hover:bg-accent hover:text-foreground sm:right-7 sm:top-7"
      >
        Design notes
      </button>

      {/* Controls */}
      <div className="absolute inset-x-0 bottom-0 z-10 flex flex-wrap items-center gap-2 p-5 sm:p-7">
        {!started && (
          <button
            onClick={ensureAudio}
            className="min-h-[44px] rounded-md bg-primary px-6 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90"
          >
            Start
          </button>
        )}

        <div className="flex items-center gap-1 rounded-md border border-border bg-background/60 p-1">
          <span className={`px-2 ${mono}`}>Loop</span>
          {LOOP_OPTIONS.map((n) => (
            <button
              key={n}
              onClick={() => applyLoop(n)}
              className={`min-h-[36px] rounded px-3 text-sm transition-colors ${
                loopBeats === n
                  ? "bg-primary text-primary-foreground"
                  : "text-muted-foreground hover:bg-accent hover:text-foreground"
              }`}
            >
              {n}
            </button>
          ))}
        </div>

        <button
          onClick={clearLoom}
          className="min-h-[44px] rounded-md border border-border bg-background/60 px-4 text-sm text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
        >
          Clear the loom
        </button>

        <div className="ml-auto flex flex-col items-end gap-1 text-right">
          {failed ? (
            <span className="text-sm text-destructive">{failed}</span>
          ) : (
            <span className={mono}>
              Input · {inputMode === "midi" ? `MIDI: ${midiName ?? "device"}` : "Computer keyboard"}
            </span>
          )}
          <span className={mono}>
            {ghosting ? "Ghost weaver" : "You"} · {density} threads
          </span>
        </div>
      </div>

      {/* Design-notes modal */}
      {showNotes && (
        <div
          className="absolute inset-0 z-30 flex items-center justify-center bg-black/50 p-6 backdrop-blur-sm"
          onClick={() => setShowNotes(false)}
        >
          <div
            className="max-h-[80dvh] max-w-lg overflow-y-auto rounded-lg border border-border bg-background p-6 shadow-lg"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="mb-4 flex items-center justify-between">
              <h2 className="text-xl font-semibold tracking-tight text-foreground">Design notes</h2>
              <button
                onClick={() => setShowNotes(false)}
                className="min-h-[44px] rounded-md border border-border bg-background/60 px-4 text-sm text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
              >
                Close
              </button>
            </div>
            <div className="whitespace-pre-wrap text-sm leading-relaxed text-muted-foreground">
              {README}
            </div>
          </div>
        </div>
      )}

      <PrototypeNav slugs={["1932-canon-loom"]} />
    </main>
  );
}
