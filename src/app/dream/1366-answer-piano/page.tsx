"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { startDroneBank, type DroneBank } from "../_shared/psych/droneBank";
import { createVoidReverb, type VoidReverb } from "../_shared/psych/convolutionVoid";
import { prefersReducedMotion } from "../_shared/psych/safeFlicker";

// ════════════════════════════════════════════════════════════════════════════
// Answer Piano (1366) — a responsive-partner instrument.
//
// You play a short phrase (sing/play into the mic, OR tap the keys). The system
// LISTENS, waits for the phrase to end (a breath of silence), then ANSWERS with
// a complementary phrase in the same key — inverted, sequenced, or resolved —
// as a distinct partner voice. Turn-taking, like two musicians trading fours.
//
// Not a sequencer, not a drone, not playback of your recording — a conversation.
// The mic is a CONTROLLER: we detect your pitches and RE-SYNTHESIZE them; the
// raw audio is never recorded or played back.
//
// Named reference (see README): Dan Tepfer's *Natural Machines* — a Disklavier
// that improvises WITH the player from rules keyed to what they play — and the
// score-following / MIR lineage (Roger Dannenberg). We borrow the framing only.
//
// Subsystems: (1) real-time autocorrelation pitch + onset detection on the mic,
// (2) phrase segmentation + short-term memory, (3) a generative in-key responder
// that transforms the captured phrase and schedules a second synth voice,
// (4) a dual-voice SVG braid visualization.
// ════════════════════════════════════════════════════════════════════════════

// ── Key: D major pentatonic (warm, always-consonant). ───────────────────────
// A note is an integer scale-index: 0 = D3 (tonic). Each +1 step is the next
// pentatonic note up. Transforms in index-space always land in-key, so an
// answer can never sound wrong.
const ROOT_MIDI = 50; // D3
const PENTA = [0, 2, 4, 7, 9]; // D E F# A B (semitone offsets)

function degToMidi(idx: number): number {
  const oct = Math.floor(idx / 5);
  const deg = ((idx % 5) + 5) % 5;
  return ROOT_MIDI + oct * 12 + PENTA[deg];
}

function midiToFreq(m: number): number {
  return 440 * Math.pow(2, (m - 69) / 12);
}

function freqToMidi(f: number): number {
  return 69 + 12 * Math.log2(f / 440);
}

function midiToNearestDeg(midi: number): number {
  let best = 0;
  let bestErr = Infinity;
  for (let idx = -7; idx <= 20; idx++) {
    const err = Math.abs(degToMidi(idx) - midi);
    if (err < bestErr) {
      bestErr = err;
      best = idx;
    }
  }
  return best;
}

const NOTE_NAMES = ["D", "E", "F♯", "A", "B"];
function degName(idx: number): string {
  const deg = ((idx % 5) + 5) % 5;
  return NOTE_NAMES[deg];
}

// ── The responder: transform a captured phrase into a complementary answer. ──
const clampIdx = (v: number) => Math.max(-5, Math.min(17, Math.round(v)));
const nearestTonic = (idx: number) => clampIdx(Math.round(idx / 5) * 5);
const nearestDominant = (idx: number) =>
  clampIdx(Math.round((idx - 3) / 5) * 5 + 3);

function makeAnswer(degs: number[]): number[] {
  if (degs.length === 0) return [0];
  const first = degs[0];
  const last = degs[degs.length - 1];
  const contour = last - first;
  let out: number[];

  if (degs.length === 1) {
    // A single note → rise a fifth, step down, resolve to the tonic.
    out = [clampIdx(first + 3), clampIdx(first + 2), nearestTonic(first)];
  } else if (contour >= 1) {
    // A rising "question" → a falling, inverted answer that resolves home.
    out = degs.map((d) => clampIdx(first - (d - first)));
    out[out.length - 1] = nearestTonic(out[out.length - 1]);
  } else if (contour <= -1) {
    // A falling line → an ascending sequence up a fifth, left open on the
    // dominant (A) — warm and unresolved, inviting the next turn.
    out = degs.map((d) => clampIdx(d + 3));
    out[out.length - 1] = nearestDominant(out[out.length - 1]);
  } else {
    // A flat phrase → a gentle echo lifted a third, resolving to the tonic.
    out = degs.map((d) => clampIdx(d + 2));
    out[out.length - 1] = nearestTonic(out[out.length - 1]);
  }
  return out;
}

// ── Autocorrelation pitch detection over a time-domain buffer. ──────────────
function detectPitch(buf: Float32Array, sampleRate: number): number {
  const size = buf.length;
  let rms = 0;
  for (let i = 0; i < size; i++) rms += buf[i] * buf[i];
  rms = Math.sqrt(rms / size);
  if (rms < 0.014) return -1; // too quiet — treat as silence

  const minLag = Math.floor(sampleRate / 1000); // ~1000 Hz ceiling
  const maxLag = Math.min(size - 1, Math.floor(sampleRate / 70)); // ~70 Hz floor
  const window = size - maxLag;

  let energy0 = 0;
  for (let i = 0; i < window; i++) energy0 += buf[i] * buf[i];
  if (energy0 <= 0) return -1;

  let bestLag = -1;
  let bestCorr = 0;
  for (let lag = minLag; lag <= maxLag; lag++) {
    let corr = 0;
    for (let i = 0; i < window; i++) corr += buf[i] * buf[i + lag];
    if (corr > bestCorr) {
      bestCorr = corr;
      bestLag = lag;
    }
  }
  if (bestLag < 0) return -1;
  const clarity = bestCorr / energy0;
  if (clarity < 0.5) return -1; // not periodic enough
  return sampleRate / bestLag;
}

// ── SVG geometry. ────────────────────────────────────────────────────────────
const VIEW_W = 1000;
const VIEW_H = 440;
const PAD_X = 60;
const PAD_Y = 40;
const MIDI_LO = 45;
const MIDI_HI = 90;
const WINDOW = 18; // events shown

function pitchToY(midi: number): number {
  const t = (midi - MIDI_LO) / (MIDI_HI - MIDI_LO);
  return PAD_Y + (1 - Math.max(0, Math.min(1, t))) * (VIEW_H - 2 * PAD_Y);
}

function makeSmoothPath(pts: Array<{ x: number; y: number }>): string {
  if (pts.length === 0) return "";
  if (pts.length === 1) return `M ${pts[0].x} ${pts[0].y}`;
  let d = `M ${pts[0].x} ${pts[0].y}`;
  for (let i = 0; i < pts.length - 1; i++) {
    const p0 = pts[i === 0 ? 0 : i - 1];
    const p1 = pts[i];
    const p2 = pts[i + 1];
    const p3 = pts[i + 2 < pts.length ? i + 2 : i + 1];
    const c1x = p1.x + (p2.x - p0.x) / 6;
    const c1y = p1.y + (p2.y - p0.y) / 6;
    const c2x = p2.x - (p3.x - p1.x) / 6;
    const c2y = p2.y - (p3.y - p1.y) / 6;
    d += ` C ${c1x.toFixed(1)} ${c1y.toFixed(1)}, ${c2x.toFixed(1)} ${c2y.toFixed(1)}, ${p2.x} ${p2.y}`;
  }
  return d;
}

type Voice = "user" | "partner";
interface NoteEvent {
  id: number;
  voice: Voice;
  midi: number;
}

// Keyboard: index 0..9 = D3 E3 F#3 A3 B3 D4 E4 F#4 A4 B4.
const KEY_DEGS = [0, 1, 2, 3, 4, 5, 6, 7, 8, 9];
const QWERTY = ["a", "s", "d", "f", "g", "h", "j", "k", "l", ";"];

const PHRASE_GAP = 900; // ms of silence that ends a phrase
const BREATH = 420; // ms pause before the partner answers
const IDLE_DELAY = 4200; // ms before the auto-demo runs itself
const MAX_KEEP = 60;

// Seed phrases the auto-demo plays to itself (scale indices).
const SEEDS: number[][] = [
  [5, 7, 9, 7],
  [7, 6, 5, 3],
  [5, 6, 7, 9, 10],
  [8, 7, 5, 6],
];

const USER_HUE = "#f6b26b"; // warm amber
const PARTNER_HUE = "#a78bfa"; // cool violet

export default function AnswerPiano() {
  const [started, setStarted] = useState(false);
  const [status, setStatus] = useState<"idle" | "listening" | "answering">("idle");
  const [micState, setMicState] = useState<"off" | "on" | "denied">("off");
  const [showNotes, setShowNotes] = useState(false);
  const [events, setEvents] = useState<NoteEvent[]>([]);
  const [activeIds, setActiveIds] = useState<Set<number>>(new Set());
  const [reduced, setReduced] = useState(false);

  // Audio graph
  const ctxRef = useRef<AudioContext | null>(null);
  const busRef = useRef<AudioNode | null>(null); // voices connect here (reverb input)
  const masterRef = useRef<GainNode | null>(null);
  const droneRef = useRef<DroneBank | null>(null);
  const reverbRef = useRef<VoidReverb | null>(null);

  // Mic
  const micStreamRef = useRef<MediaStream | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const timeBufRef = useRef<Float32Array | null>(null);
  const rafRef = useRef<number | null>(null);

  // Phrase / turn-taking state (refs so the audio loop never re-renders)
  const phaseRef = useRef<"idle" | "user" | "partner">("idle");
  const capturedRef = useRef<number[]>([]);
  const lastRegDegRef = useRef<number | null>(null);
  const lastRegAtRef = useRef(0);
  const wasVoicedRef = useRef(false);
  const lastTouchRef = useRef(0);
  const interactedRef = useRef(false);
  const demoCountRef = useRef(0);

  // Timers
  const finalizeTimerRef = useRef<number | null>(null);
  const idleTimerRef = useRef<number | null>(null);
  const timersRef = useRef<Set<number>>(new Set());
  const idCounterRef = useRef(0);
  const eventsRef = useRef<NoteEvent[]>([]);

  useEffect(() => {
    setReduced(prefersReducedMotion());
  }, []);

  const track = useCallback((fn: () => void, ms: number): number => {
    const id = window.setTimeout(() => {
      timersRef.current.delete(id);
      fn();
    }, ms);
    timersRef.current.add(id);
    return id;
  }, []);

  const addEvent = useCallback((voice: Voice, midi: number, hold: number) => {
    const id = idCounterRef.current++;
    const next = [...eventsRef.current, { id, voice, midi }].slice(-MAX_KEEP);
    eventsRef.current = next;
    setEvents(next);
    setActiveIds((prev) => {
      const s = new Set(prev);
      s.add(id);
      return s;
    });
    track(() => {
      setActiveIds((prev) => {
        const s = new Set(prev);
        s.delete(id);
        return s;
      });
    }, hold);
  }, [track]);

  // ── Synthesis: two distinct voices. ────────────────────────────────────────
  const playNote = useCallback((midi: number, when: number, dur: number, voice: Voice) => {
    const ctx = ctxRef.current;
    const bus = busRef.current;
    if (!ctx || !bus) return;
    const freq = midiToFreq(midi);
    const g = ctx.createGain();

    if (voice === "user") {
      // Soft triangle with a gentle attack — the human voice.
      const osc = ctx.createOscillator();
      osc.type = "triangle";
      osc.frequency.value = freq;
      const lp = ctx.createBiquadFilter();
      lp.type = "lowpass";
      lp.frequency.value = 2200;
      lp.Q.value = 0.6;
      const peak = 0.16;
      g.gain.setValueAtTime(0.0001, when);
      g.gain.exponentialRampToValueAtTime(peak, when + 0.025);
      g.gain.exponentialRampToValueAtTime(0.0001, when + dur + 0.5);
      osc.connect(lp);
      lp.connect(g);
      g.connect(bus);
      osc.start(when);
      osc.stop(when + dur + 0.55);
    } else {
      // A warmer FM pad — the partner.
      const carrier = ctx.createOscillator();
      carrier.type = "sine";
      carrier.frequency.value = freq;
      const mod = ctx.createOscillator();
      mod.type = "sine";
      mod.frequency.value = freq * 1.5;
      const modGain = ctx.createGain();
      modGain.gain.value = freq * 0.55;
      mod.connect(modGain);
      modGain.connect(carrier.frequency);
      const lp = ctx.createBiquadFilter();
      lp.type = "lowpass";
      lp.frequency.value = 1500;
      lp.Q.value = 0.7;
      const peak = 0.14;
      g.gain.setValueAtTime(0.0001, when);
      g.gain.exponentialRampToValueAtTime(peak, when + 0.09);
      g.gain.exponentialRampToValueAtTime(0.0001, when + dur + 1.1);
      carrier.connect(lp);
      lp.connect(g);
      g.connect(bus);
      carrier.start(when);
      mod.start(when);
      carrier.stop(when + dur + 1.2);
      mod.stop(when + dur + 1.2);
    }
  }, []);

  // Schedule a whole phrase (audio + viz nodes). Returns total ms.
  const runPhrase = useCallback(
    (degs: number[], durs: number[], voice: Voice, startDelayMs: number): number => {
      const ctx = ctxRef.current;
      if (!ctx) return 0;
      const now = ctx.currentTime;
      let t = now + startDelayMs / 1000 + 0.03;
      let wallMs = startDelayMs + 30;
      for (let i = 0; i < degs.length; i++) {
        const midi = degToMidi(degs[i]);
        const dur = durs[i];
        playNote(midi, t, dur, voice);
        const holdMs = Math.max(260, dur * 1000);
        track(() => addEvent(voice, midi, holdMs), wallMs);
        const step = dur * 1000 * 0.92;
        t += step / 1000;
        wallMs += step;
      }
      return wallMs;
    },
    [playNote, track, addEvent],
  );

  // ── Turn-taking. ────────────────────────────────────────────────────────────
  const scheduleIdle = useCallback(() => {
    if (idleTimerRef.current !== null) {
      clearTimeout(idleTimerRef.current);
      timersRef.current.delete(idleTimerRef.current);
    }
    idleTimerRef.current = track(() => {
      idleTimerRef.current = null;
      runAutoDemo();
    }, IDLE_DELAY);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [track]);

  const finalizeAndRespond = useCallback(() => {
    if (finalizeTimerRef.current !== null) {
      clearTimeout(finalizeTimerRef.current);
      timersRef.current.delete(finalizeTimerRef.current);
      finalizeTimerRef.current = null;
    }
    const captured = capturedRef.current;
    if (captured.length === 0 || phaseRef.current !== "user") return;
    phaseRef.current = "partner";
    setStatus("answering");

    const answer = makeAnswer(captured);
    const durs = answer.map((_, i) =>
      i === answer.length - 1 ? 0.95 : 0.42,
    );
    const total = runPhrase(answer, durs, "partner", BREATH);

    capturedRef.current = [];
    lastRegDegRef.current = null;
    track(() => {
      phaseRef.current = "idle";
      setStatus("idle");
      scheduleIdle();
    }, total + 500);
  }, [runPhrase, track, scheduleIdle]);

  // Reset the silence timer that ends a phrase.
  const touchPhrase = useCallback(() => {
    if (finalizeTimerRef.current !== null) {
      clearTimeout(finalizeTimerRef.current);
      timersRef.current.delete(finalizeTimerRef.current);
    }
    finalizeTimerRef.current = track(() => {
      finalizeTimerRef.current = null;
      finalizeAndRespond();
    }, PHRASE_GAP);
  }, [track, finalizeAndRespond]);

  // Register one note into the current phrase (from mic or keyboard).
  const captureNote = useCallback(
    (deg: number, fromUser: boolean) => {
      if (phaseRef.current === "partner") return; // partner is speaking; wait
      if (fromUser && !interactedRef.current) {
        interactedRef.current = true;
        if (idleTimerRef.current !== null) {
          clearTimeout(idleTimerRef.current);
          timersRef.current.delete(idleTimerRef.current);
          idleTimerRef.current = null;
        }
      }
      phaseRef.current = "user";
      setStatus("listening");
      capturedRef.current = [...capturedRef.current, deg];
      const ctx = ctxRef.current;
      if (ctx) playNote(degToMidi(deg), ctx.currentTime + 0.01, 0.34, "user");
      addEvent("user", degToMidi(deg), 340);
      touchPhrase();
    },
    [playNote, addEvent, touchPhrase],
  );

  const runAutoDemo = useCallback(() => {
    if (interactedRef.current) return;
    if (phaseRef.current !== "idle") {
      scheduleIdle();
      return;
    }
    phaseRef.current = "user";
    setStatus("listening");
    const seed = SEEDS[demoCountRef.current % SEEDS.length];
    demoCountRef.current++;
    capturedRef.current = [...seed];
    const durs = seed.map(() => 0.4);
    runPhrase(seed, durs, "user", 0);
    // After the seed finishes playing, let the partner answer.
    const seedTotal = seed.length * 0.4 * 1000 * 0.92;
    track(() => finalizeAndRespond(), seedTotal + 350);
  }, [runPhrase, track, finalizeAndRespond, scheduleIdle]);

  // ── Mic loop: pitch + onset detection. ──────────────────────────────────────
  const runMicLoop = useCallback(() => {
    const analyser = analyserRef.current;
    const ctx = ctxRef.current;
    const buf = timeBufRef.current;
    if (!analyser || !ctx || !buf) return;

    analyser.getFloatTimeDomainData(buf as unknown as Float32Array<ArrayBuffer>);
    const freq = detectPitch(buf, ctx.sampleRate);
    const voiced = freq > 0;
    const now = performance.now();

    if (voiced && phaseRef.current !== "partner") {
      const deg = midiToNearestDeg(freqToMidi(freq));
      const isNew = lastRegDegRef.current !== deg || !wasVoicedRef.current;
      if (isNew && now - lastRegAtRef.current > 130) {
        lastRegDegRef.current = deg;
        lastRegAtRef.current = now;
        captureNote(deg, true);
      } else if (phaseRef.current === "user" && now - lastTouchRef.current > 120) {
        lastTouchRef.current = now;
        touchPhrase(); // sustained note keeps the phrase alive
      }
    }
    wasVoicedRef.current = voiced;
    rafRef.current = requestAnimationFrame(runMicLoop);
  }, [captureNote, touchPhrase]);

  // ── Begin: gesture-gated audio + optional mic. ──────────────────────────────
  const begin = useCallback(async () => {
    if (started) return;
    setStarted(true);
    const Ctx: typeof AudioContext =
      window.AudioContext ||
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (window as any).webkitAudioContext;
    const ctx = new Ctx();
    ctxRef.current = ctx;

    const master = ctx.createGain();
    master.gain.setValueAtTime(0.0001, ctx.currentTime);
    master.gain.exponentialRampToValueAtTime(0.2, ctx.currentTime + 1.5);
    masterRef.current = master;

    const limiter = ctx.createDynamicsCompressor();
    limiter.threshold.value = -6;
    limiter.knee.value = 24;
    limiter.ratio.value = 12;
    limiter.attack.value = 0.004;
    limiter.release.value = 0.25;
    master.connect(limiter);
    limiter.connect(ctx.destination);

    const reverb = createVoidReverb(ctx, { seconds: 4.5, decay: 2.6, wet: 0.34 });
    reverb.output.connect(master);
    reverbRef.current = reverb;
    busRef.current = reverb.input;

    const drone = startDroneBank(ctx, master, {
      root: 73.42, // D2
      ratios: [1, 3 / 2, 2, 3],
      cutoffLow: 180,
      cutoffHigh: 900,
      peakGain: 0.09,
    });
    drone.setDrive(0.3);
    droneRef.current = drone;

    if (ctx.state === "suspended") await ctx.resume();

    // Try the mic (best-effort). Keyboard always works regardless.
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          echoCancellation: false,
          noiseSuppression: false,
          autoGainControl: false,
        },
      });
      micStreamRef.current = stream;
      const source = ctx.createMediaStreamSource(stream);
      const analyser = ctx.createAnalyser();
      analyser.fftSize = 2048;
      source.connect(analyser); // NOT to destination — no feedback
      analyserRef.current = analyser;
      timeBufRef.current = new Float32Array(new ArrayBuffer(analyser.fftSize * 4));
      setMicState("on");
      rafRef.current = requestAnimationFrame(runMicLoop);
    } catch {
      setMicState("denied");
    }

    scheduleIdle();
  }, [started, runMicLoop, scheduleIdle]);

  // ── Keyboard (QWERTY) binding. ──────────────────────────────────────────────
  useEffect(() => {
    if (!started) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.repeat || e.metaKey || e.ctrlKey || e.altKey) return;
      const k = e.key.toLowerCase();
      const i = QWERTY.indexOf(k);
      if (i >= 0) {
        e.preventDefault();
        captureNote(KEY_DEGS[i], true);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [started, captureNote]);

  // ── Full teardown on unmount. ───────────────────────────────────────────────
  useEffect(() => {
    const timers = timersRef.current;
    return () => {
      if (rafRef.current !== null) cancelAnimationFrame(rafRef.current);
      timers.forEach((id) => clearTimeout(id));
      timers.clear();
      if (finalizeTimerRef.current !== null) clearTimeout(finalizeTimerRef.current);
      if (idleTimerRef.current !== null) clearTimeout(idleTimerRef.current);
      micStreamRef.current?.getTracks().forEach((t) => t.stop());
      try {
        droneRef.current?.stop();
      } catch {
        /* closing */
      }
      const ctx = ctxRef.current;
      if (ctx && ctx.state !== "closed") void ctx.close();
    };
  }, []);

  // ── Render helpers. ─────────────────────────────────────────────────────────
  const visible = events.slice(-WINDOW);
  const span = Math.max(WINDOW - 1, visible.length - 1, 1);
  const positioned = visible.map((ev, i) => ({
    ...ev,
    x: PAD_X + (i / span) * (VIEW_W - 2 * PAD_X),
    y: pitchToY(ev.midi),
  }));
  const userPts = positioned.filter((p) => p.voice === "user");
  const partnerPts = positioned.filter((p) => p.voice === "partner");
  const threadPts = positioned.map((p) => ({ x: p.x, y: p.y }));

  const statusLabel =
    status === "listening"
      ? "listening…"
      : status === "answering"
        ? "answering…"
        : "your turn";

  return (
    <main className="relative min-h-screen w-full overflow-hidden bg-[#0a0a12] text-white">
      <style>{`
        @keyframes answerHalo {
          0% { opacity: 0.18; }
          100% { opacity: 0.5; }
        }
      `}</style>

      {/* Header */}
      <div className="pointer-events-none absolute left-0 top-0 z-20 w-full px-6 pt-6 sm:px-10">
        <h1 className="text-xl font-semibold tracking-tight text-white sm:text-2xl">
          Answer Piano
        </h1>
        <p className="mt-1 max-w-xl text-base text-white/75">
          Play a short phrase — sing or tap — and a patient partner answers you
          in the same key.
        </p>
      </div>

      {/* Design-notes toggle */}
      <button
        onClick={() => setShowNotes((v) => !v)}
        className="absolute right-4 top-6 z-30 rounded-full border border-white/15 bg-white/[0.04] px-4 py-2.5 font-mono text-sm text-white/75 transition-colors hover:bg-white/[0.1] hover:text-white"
      >
        {showNotes ? "close notes" : "read the design notes"}
      </button>

      {/* The braid */}
      <div className="absolute inset-0 flex items-center justify-center px-4">
        <svg
          viewBox={`0 0 ${VIEW_W} ${VIEW_H}`}
          className="h-auto w-full max-w-5xl"
          preserveAspectRatio="xMidYMid meet"
          aria-label="Two intertwining voice ribbons: your phrase and the partner's answer"
        >
          <defs>
            <filter id="softGlow" x="-30%" y="-30%" width="160%" height="160%">
              <feGaussianBlur stdDeviation="3" result="b" />
              <feMerge>
                <feMergeNode in="b" />
                <feMergeNode in="SourceGraphic" />
              </feMerge>
            </filter>
          </defs>

          {/* tonic guide lines (D across octaves) */}
          {[50, 62, 74, 86].map((m) => (
            <line
              key={m}
              x1={PAD_X}
              x2={VIEW_W - PAD_X}
              y1={pitchToY(m)}
              y2={pitchToY(m)}
              stroke="#ffffff"
              strokeOpacity={0.05}
              strokeDasharray="2 8"
            />
          ))}

          {/* "now" line */}
          <line
            x1={VIEW_W - PAD_X}
            x2={VIEW_W - PAD_X}
            y1={PAD_Y}
            y2={VIEW_H - PAD_Y}
            stroke="#ffffff"
            strokeOpacity={0.08}
          />

          {/* faint conversation thread (the braid) */}
          <path
            d={makeSmoothPath(threadPts)}
            fill="none"
            stroke="#ffffff"
            strokeOpacity={0.12}
            strokeWidth={1.5}
          />

          {/* voice ribbons */}
          <path
            d={makeSmoothPath(userPts)}
            fill="none"
            stroke={USER_HUE}
            strokeOpacity={0.85}
            strokeWidth={2.5}
            strokeLinecap="round"
            filter="url(#softGlow)"
          />
          <path
            d={makeSmoothPath(partnerPts)}
            fill="none"
            stroke={PARTNER_HUE}
            strokeOpacity={0.85}
            strokeWidth={2.5}
            strokeLinecap="round"
            filter="url(#softGlow)"
          />

          {/* nodes */}
          {positioned.map((p) => {
            const hue = p.voice === "user" ? USER_HUE : PARTNER_HUE;
            const active = activeIds.has(p.id);
            return (
              <g key={p.id}>
                {active && (
                  <circle
                    cx={p.x}
                    cy={p.y}
                    r={13}
                    fill={hue}
                    style={
                      reduced
                        ? { opacity: 0.35 }
                        : {
                            animation: "answerHalo 2.4s ease-in-out infinite alternate",
                          }
                    }
                  />
                )}
                <circle
                  cx={p.x}
                  cy={p.y}
                  r={active ? 6 : 4.5}
                  fill={hue}
                  filter="url(#softGlow)"
                />
              </g>
            );
          })}
        </svg>
      </div>

      {/* Bottom controls */}
      <div className="absolute inset-x-0 bottom-0 z-20 flex flex-col items-center gap-4 px-4 pb-8">
        {/* status + legend */}
        {started && (
          <div className="flex flex-wrap items-center justify-center gap-x-5 gap-y-2 font-mono text-sm">
            <span className="flex items-center gap-2 text-white/80">
              <span
                className="inline-block h-3 w-3 rounded-full"
                style={{ background: USER_HUE }}
              />
              you
            </span>
            <span className="flex items-center gap-2 text-white/80">
              <span
                className="inline-block h-3 w-3 rounded-full"
                style={{ background: PARTNER_HUE }}
              />
              partner
            </span>
            <span
              className={
                status === "answering"
                  ? "text-[#c4b5fd]"
                  : status === "listening"
                    ? "text-[#f6b26b]"
                    : "text-white/55"
              }
            >
              {statusLabel}
            </span>
          </div>
        )}

        {/* mic notice */}
        {started && micState === "denied" && (
          <p className="max-w-md text-center text-base text-rose-300">
            No microphone — that&apos;s fine. Tap the keys below (or press the
            <span className="font-mono"> A–L </span> keys) to play your phrase.
          </p>
        )}
        {started && micState === "on" && (
          <p className="text-center text-sm text-white/55">
            Sing or play a short phrase — or tap the keys. Pause, and it answers.
          </p>
        )}

        {/* keyboard */}
        {started && (
          <div className="flex w-full max-w-3xl flex-wrap justify-center gap-1.5 sm:gap-2">
            {KEY_DEGS.map((deg, i) => (
              <button
                key={deg}
                onPointerDown={(e) => {
                  e.preventDefault();
                  captureNote(deg, true);
                }}
                className="flex min-h-[56px] min-w-[44px] flex-1 flex-col items-center justify-center rounded-lg border border-white/10 bg-white/[0.05] px-2 py-2.5 transition-colors hover:bg-white/[0.12] active:bg-[#f6b26b]/25"
              >
                <span className="text-base font-medium text-white/90">
                  {degName(deg)}
                </span>
                <span className="font-mono text-xs text-white/60">
                  {QWERTY[i]}
                </span>
              </button>
            ))}
          </div>
        )}
      </div>

      {/* Begin overlay */}
      {!started && (
        <div className="absolute inset-0 z-40 flex flex-col items-center justify-center gap-6 bg-[#0a0a12]/80 px-6 text-center backdrop-blur-sm">
          <p className="max-w-lg text-base text-white/80 sm:text-lg">
            An improvising duet partner. You play a phrase; it listens, waits for
            you to finish, then replies with a complementary line in your key —
            not a recording you sculpt, a conversation.
          </p>
          <button
            onClick={begin}
            className="rounded-full bg-white px-8 py-3.5 text-base font-semibold text-[#0a0a12] transition-transform hover:scale-[1.03]"
          >
            Begin
          </button>
          <p className="font-mono text-sm text-white/55">
            Uses your mic if allowed — analysis only, nothing is recorded.
          </p>
        </div>
      )}

      {/* Design notes overlay */}
      {showNotes && (
        <div className="absolute inset-0 z-40 flex items-start justify-center overflow-y-auto bg-[#0a0a12]/92 px-6 py-16 backdrop-blur-md">
          <div className="max-w-2xl space-y-4 text-base leading-relaxed text-white/80">
            <h2 className="text-xl font-semibold text-white">Design notes</h2>
            <p>
              <span className="text-white/95">The loop.</span> You play a short
              phrase — sing/play into the mic, or tap the on-screen keys. The
              system detects your notes in real time (autocorrelation pitch
              detection, snapped to the nearest note of D major pentatonic),
              remembers the phrase, and waits for a breath of silence. Then a
              second voice answers.
            </p>
            <p>
              <span className="text-white/95">The answer.</span> A rising
              &ldquo;question&rdquo; is met with a falling, inverted line that
              resolves to the tonic. A falling phrase is answered by an ascending
              sequence left open on the dominant. Everything lives in one warm
              pentatonic key, so a reply is always consonant.
            </p>
            <p>
              <span className="text-white/95">The mic is a controller.</span> We
              never play your recording back — we re-synthesize the pitches we
              detect as a soft triangle voice; the partner is a warmer FM pad. A
              quiet drone bed sits underneath. Nothing is recorded or sent
              anywhere.
            </p>
            <p>
              <span className="text-white/95">Reference.</span> Dan Tepfer&apos;s{" "}
              <em>Natural Machines</em> — a Yamaha Disklavier that improvises{" "}
              <em>with</em> him from algorithmic rules keyed to what he plays —
              and the score-following / Music-Information-Retrieval lineage
              (Roger Dannenberg). We borrow the responsive-partner framing, not
              any code.
            </p>
            <p className="text-white/60">
              After ~4 seconds of quiet the instrument plays a seed phrase to
              itself and answers it, so there is always something to see and
              hear.
            </p>
            <button
              onClick={() => setShowNotes(false)}
              className="mt-2 rounded-full border border-white/20 px-5 py-2.5 text-sm text-white/80 hover:bg-white/10"
            >
              close
            </button>
          </div>
        </div>
      )}
    </main>
  );
}
