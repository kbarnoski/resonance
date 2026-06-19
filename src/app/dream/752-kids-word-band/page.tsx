"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import {
  getSpeechRecognition,
  type SpeechRecognitionEvent,
  type SpeechRecognitionType,
} from "@/lib/browser/speech-recognition";

// ─── Pentatonic scale: C4 D4 E4 G4 A4 C5 D5 E5 (8 bars) ─────────────────────
// C-major pentatonic, two octaves, kid-friendly bright register
const BAR_MIDI = [60, 62, 64, 67, 69, 72, 74, 76];
const BAR_COLORS = [
  "#ef4444", // C4  — red
  "#f97316", // D4  — orange
  "#eab308", // E4  — yellow
  "#22c55e", // G4  — green
  "#06b6d4", // A4  — cyan
  "#3b82f6", // C5  — blue
  "#8b5cf6", // D5  — violet
  "#ec4899", // E5  — pink
];
const BAR_NAMES = ["C4","D4","E4","G4","A4","C5","D5","E5"];
const N_BARS = 8;

// ─── Letter → bar index mapping (stable, phonetic-ish) ───────────────────────
// Vowels spread across scale; consonants fill remaining degrees
// Every letter maps to 0-7; pentatonic means nothing sounds "wrong"
const LETTER_TO_BAR: Record<string, number> = {
  a:0, e:2, i:4, o:6, u:3,          // vowels → key spread
  b:1, c:2, d:3, f:4, g:5,
  h:1, j:2, k:3, l:4, m:5,
  n:6, p:7, q:0, r:1, s:2,
  t:3, v:4, w:5, x:6, y:7, z:0,
};

function letterToBar(ch: string): number {
  return LETTER_TO_BAR[ch.toLowerCase()] ?? (ch.charCodeAt(0) % N_BARS);
}

function midiToHz(midi: number): number {
  return 440 * Math.pow(2, (midi - 69) / 12);
}

// ─── Audio: mallet-ish marimba timbre ────────────────────────────────────────
function playMalletNote(
  actx: AudioContext,
  dest: AudioNode,
  midi: number,
  when: number,
  dur: number   // note duration in seconds (shorter = staccato)
): void {
  const hz = midiToHz(midi);
  const t = when;

  // Fundamental: triangle (warm)
  const osc1 = actx.createOscillator();
  osc1.type = "triangle";
  osc1.frequency.value = hz;

  // Soft upper partial at 2× (marimba character)
  const osc2 = actx.createOscillator();
  osc2.type = "sine";
  osc2.frequency.value = hz * 2.01; // slight detune for warmth

  // 4× partial very soft (harmonic shimmer)
  const osc3 = actx.createOscillator();
  osc3.type = "sine";
  osc3.frequency.value = hz * 4.02;

  const g1 = actx.createGain();
  const g2 = actx.createGain();
  const g3 = actx.createGain();
  const env = actx.createGain();

  g2.gain.value = 0.25;
  g3.gain.value = 0.05;

  // Percussive envelope: quick attack, exponential decay
  env.gain.setValueAtTime(0, t);
  env.gain.linearRampToValueAtTime(0.9, t + 0.012);
  env.gain.exponentialRampToValueAtTime(0.001, t + Math.max(dur, 0.18));

  osc1.connect(g1); g1.connect(env);
  osc2.connect(g2); g2.connect(env);
  osc3.connect(g3); g3.connect(env);
  env.connect(dest);

  const stop = t + Math.max(dur, 0.2);
  osc1.start(t); osc1.stop(stop);
  osc2.start(t); osc2.stop(stop);
  osc3.start(t); osc3.stop(stop);
}

// ─── Ambient pad: C3 + G3 sine drone ─────────────────────────────────────────
function startAmbientPad(actx: AudioContext, dest: AudioNode): OscillatorNode[] {
  return [48, 55].map((midi) => {
    const osc = actx.createOscillator();
    osc.type = "sine";
    osc.frequency.value = midiToHz(midi);
    const g = actx.createGain();
    g.gain.value = 0;
    osc.connect(g); g.connect(dest);
    osc.start();
    g.gain.setTargetAtTime(0.018, actx.currentTime, 2.0);
    return osc;
  });
}

// ─── Word → riff mapping ──────────────────────────────────────────────────────
// Each character of the word (ignoring non-alpha) maps to a bar index and note
interface NoteEvent {
  barIdx: number;
  midi: number;
  color: string;
  letter: string;
}

function wordToRiff(word: string): NoteEvent[] {
  return word
    .toLowerCase()
    .split("")
    .filter((c) => /[a-z]/.test(c))
    .map((c) => {
      const barIdx = letterToBar(c);
      return { barIdx, midi: BAR_MIDI[barIdx], color: BAR_COLORS[barIdx], letter: c };
    });
}

// ─── Loop data structure ──────────────────────────────────────────────────────
interface WordLoop {
  id: number;
  word: string;
  notes: NoteEvent[];
  bpm: number;           // loop tempo
  stepDur: number;       // seconds per note
  startBeat: number;     // actx beat when loop started
  nextSchedTime: number; // next beat time to schedule (avoids double-scheduling)
}

// ─── Bouncing letter state ────────────────────────────────────────────────────
interface BounceLetter {
  id: number;
  ch: string;
  color: string;
  x: number;            // % of width
  y: number;            // % (0=top)
  vy: number;           // velocity downward (% per frame)
  bouncePhase: number;  // used for spring animation
  lit: boolean;
  opacity: number;
  scale: number;
}

// ─── Demo words ───────────────────────────────────────────────────────────────
const DEMO_WORDS = ["banana", "sunshine", "hello", "rainbow", "happy", "music", "butterfly", "orange"];

let _loopIdCounter = 0;
function nextLoopId() { return ++_loopIdCounter; }
let _letterIdCounter = 0;
function nextLetterId() { return ++_letterIdCounter; }

// ─── Look-ahead scheduler constants ──────────────────────────────────────────
const SCHED_INTERVAL_MS = 25;
const SCHED_AHEAD_S = 0.12;

// ─── Main component ───────────────────────────────────────────────────────────
export default function KidsWordBandPage() {
  const [started, setStarted] = useState(false);
  const [srAvail, setSrAvail] = useState<boolean | null>(null);
  const [micDenied, setMicDenied] = useState(false);
  const [listening, setListening] = useState(false);
  const [showNotes, setShowNotes] = useState(false);

  // Xylophone bar flash state (0 = off, 1 = fully lit, decays)
  const [barFlash, setBarFlash] = useState<number[]>(Array(N_BARS).fill(0));
  // Bouncing letters in SVG
  const [letters, setLetters] = useState<BounceLetter[]>([]);
  // Loop word tags shown
  const [loopWords, setLoopWords] = useState<string[]>([]);
  // Playhead beat position (0–1 within loop)
  const [playheadPos, setPlayheadPos] = useState(0);

  // Typed/tap input
  const [tapWord, setTapWord] = useState("");
  const [activeTapLetters, setActiveTapLetters] = useState<Set<string>>(new Set());

  // ── Refs ──
  const actxRef = useRef<AudioContext | null>(null);
  const masterGainRef = useRef<GainNode | null>(null);
  const destNodeRef = useRef<AudioNode | null>(null);
  const padOscsRef = useRef<OscillatorNode[]>([]);
  const srRef = useRef<InstanceType<SpeechRecognitionType> | null>(null);
  const srClassRef = useRef<SpeechRecognitionType | null>(null);
  const loopsRef = useRef<WordLoop[]>([]);
  const schedTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const rafRef = useRef<number>(0);
  const lettersRef = useRef<BounceLetter[]>([]);
  const barFlashRef = useRef<number[]>(Array(N_BARS).fill(0));
  const startedRef = useRef(false);
  const lastInputTimeRef = useRef<number>(0);
  const demoTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const demoIdxRef = useRef(0);
  const demoActiveRef = useRef(false);
  const tapWordRef = useRef("");

  // Keep tapWord ref in sync
  useEffect(() => { tapWordRef.current = tapWord; }, [tapWord]);

  // ── Flash a bar ──
  const flashBar = useCallback((barIdx: number) => {
    barFlashRef.current = barFlashRef.current.map((v, i) => i === barIdx ? 1 : v);
  }, []);

  // ── Spawn bouncing letters for a word ──
  const spawnLetters = useCallback((events: NoteEvent[], startX: number) => {
    const newLetters: BounceLetter[] = events.map((ev, i) => ({
      id: nextLetterId(),
      ch: ev.letter.toUpperCase(),
      color: ev.color,
      x: startX + (i / Math.max(events.length - 1, 1)) * 60,
      y: 10 + Math.random() * 20,
      vy: 1.5 + Math.random() * 1.5,
      bouncePhase: 0,
      lit: false,
      opacity: 1,
      scale: 1 + Math.random() * 0.5,
    }));
    lettersRef.current = [...lettersRef.current, ...newLetters].slice(-48);
    setLetters([...lettersRef.current]);
    return newLetters.map((l) => l.id);
  }, []);

  // ── Schedule a word into a loop ──
  const scheduleWord = useCallback((word: string) => {
    const actx = actxRef.current;
    const dest = destNodeRef.current;
    if (!actx || !dest) return;

    const notes = wordToRiff(word);
    if (notes.length === 0) return;

    const bpm = 96;
    const stepDur = 60 / bpm * 0.5; // eighth notes at 96 bpm ≈ 0.3125 s/note
    const loopDur = notes.length * stepDur;

    const startBeat = actx.currentTime + 0.05;

    // Play first pass immediately (on-demand), schedule each note precisely
    for (let i = 0; i < notes.length; i++) {
      const noteTime = startBeat + i * stepDur;
      playMalletNote(actx, dest, notes[i].midi, noteTime, stepDur * 0.8);
      flashBar(notes[i].barIdx);
    }

    const loop: WordLoop = {
      id: nextLoopId(),
      word,
      notes,
      bpm,
      stepDur,
      startBeat,
      nextSchedTime: startBeat + loopDur, // first repeat starts after the first pass
    };

    // Cap at 4 loops
    const newLoops = [...loopsRef.current, loop].slice(-4);
    loopsRef.current = newLoops;
    setLoopWords(newLoops.map((l) => l.word));

    // Spawn bouncy letters immediately
    const startX = 5 + Math.random() * 30;
    spawnLetters(notes, startX);
  }, [flashBar, spawnLetters]);

  // ── Look-ahead scheduler (Chris Wilson pattern) ──
  // Pumps every SCHED_INTERVAL_MS; schedules notes SCHED_AHEAD_S in advance.
  // Each loop tracks its own `nextSchedTime` to avoid double-scheduling.
  const runScheduler = useCallback(() => {
    const actx = actxRef.current;
    const dest = destNodeRef.current;
    if (!actx || !dest) return;

    const now = actx.currentTime;
    const ahead = now + SCHED_AHEAD_S;

    for (const loop of loopsRef.current) {
      const loopDur = loop.notes.length * loop.stepDur;

      // Advance nextSchedTime in loop-length increments until it's past now
      while (loop.nextSchedTime + loopDur <= now) {
        loop.nextSchedTime += loopDur;
      }

      // Schedule any loop passes that start within the lookahead window
      while (loop.nextSchedTime <= ahead) {
        const passStart = loop.nextSchedTime;
        for (let i = 0; i < loop.notes.length; i++) {
          const noteTime = passStart + i * loop.stepDur;
          if (noteTime > ahead) break;
          playMalletNote(actx, dest, loop.notes[i].midi, noteTime, loop.stepDur * 0.75);
          flashBar(loop.notes[i].barIdx);
        }
        loop.nextSchedTime += loopDur;
      }
    }

    // Update playhead position based on first loop
    const first = loopsRef.current[0];
    if (first) {
      const loopDur = first.notes.length * first.stepDur;
      const elapsed = (now - first.startBeat) % loopDur;
      setPlayheadPos(loopDur > 0 ? elapsed / loopDur : 0);
    }
  }, [flashBar]);

  // ── Animation frame: decay bar flashes + bounce letters ──
  const startAnimLoop = useCallback(() => {
    let prevTime = performance.now();

    function frame(now: number) {
      const dt = Math.min((now - prevTime) / 1000, 0.05);
      prevTime = now;

      // Decay bar flashes
      const newFlash = barFlashRef.current.map((v) => Math.max(0, v - dt * 5));
      barFlashRef.current = newFlash;
      setBarFlash([...newFlash]);

      // Animate letters: bounce physics
      let changed = false;
      const updated = lettersRef.current.map((l) => {
        if (l.opacity <= 0) return l;
        let { y, vy, opacity, scale } = l;
        vy += dt * 120; // gravity (% per s²)
        y += vy * dt;
        if (y > 70) {
          y = 70;
          vy = -vy * 0.55;
          scale = 1.3;
        } else {
          scale = Math.max(1, scale - dt * 3);
        }
        opacity = y > 75 ? Math.max(0, opacity - dt * 0.8) : opacity;
        changed = true;
        return { ...l, y, vy, opacity, scale };
      }).filter((l) => l.opacity > 0.01);

      if (changed) {
        lettersRef.current = updated;
        setLetters([...updated]);
      }

      rafRef.current = requestAnimationFrame(frame);
    }

    rafRef.current = requestAnimationFrame(frame);
  }, []);

  // ── Auto-demo ──
  const scheduleDemoNext = useCallback(() => {
    if (!demoActiveRef.current) return;
    demoTimerRef.current = setTimeout(() => {
      if (!demoActiveRef.current) return;
      const word = DEMO_WORDS[demoIdxRef.current % DEMO_WORDS.length];
      demoIdxRef.current++;
      scheduleWord(word);
      scheduleDemoNext();
    }, 2500);
  }, [scheduleWord]);

  const startDemo = useCallback(() => {
    if (demoActiveRef.current) return;
    demoActiveRef.current = true;
    // Slight delay before first auto word
    demoTimerRef.current = setTimeout(() => {
      if (!demoActiveRef.current) return;
      scheduleDemoNext();
    }, 3000);
  }, [scheduleDemoNext]);

  const stopDemo = useCallback(() => {
    demoActiveRef.current = false;
    if (demoTimerRef.current) {
      clearTimeout(demoTimerRef.current);
      demoTimerRef.current = null;
    }
  }, []);

  // ── Handle a recognized/submitted word ──
  const handleWord = useCallback((raw: string) => {
    const words = raw.trim().toLowerCase().split(/\s+/).filter(Boolean);
    for (const w of words) {
      if (w.length < 2) continue;
      lastInputTimeRef.current = Date.now();
      stopDemo();
      scheduleWord(w);
      // Resume demo after 5s silence
      setTimeout(() => {
        if (Date.now() - lastInputTimeRef.current >= 4900) {
          startDemo();
        }
      }, 5000);
    }
  }, [scheduleWord, stopDemo, startDemo]);

  // ── Speech recognition ──
  const startSR = useCallback(() => {
    const SR = srClassRef.current;
    if (!SR) return;
    try {
      const sr = new SR();
      sr.continuous = true;
      sr.interimResults = false;
      sr.lang = "en-US";

      sr.onresult = (ev: SpeechRecognitionEvent) => {
        for (let i = ev.resultIndex; i < ev.results.length; i++) {
          const res = ev.results[i];
          if (res.isFinal) {
            handleWord(res[0].transcript);
          }
        }
      };

      sr.onerror = (ev: Event) => {
        const errEv = ev as Event & { error?: string };
        if (errEv.error === "not-allowed") setMicDenied(true);
        if (errEv.error === "not-allowed" || errEv.error === "service-not-allowed") {
          setListening(false);
        }
      };

      sr.onend = () => {
        if (startedRef.current && !micDenied) {
          try { sr.start(); } catch { /* ignore */ }
        }
      };

      sr.start();
      srRef.current = sr;
      setListening(true);
    } catch {
      setListening(false);
    }
  }, [handleWord, micDenied]);

  // ── Tap keyboard submit ──
  const handleTapSubmit = useCallback(() => {
    const w = tapWordRef.current.trim();
    if (w.length >= 2) {
      handleWord(w);
      setTapWord("");
      setActiveTapLetters(new Set());
    }
  }, [handleWord]);

  // ── Big Start button ──
  const handleStart = useCallback(() => {
    if (startedRef.current) return;
    startedRef.current = true;
    setStarted(true);

    // Create audio context inside gesture
    const actx = new AudioContext();
    actxRef.current = actx;

    // Build audio chain: voices → masterGain → lowpass → compressor → destination
    const masterGain = actx.createGain();
    masterGain.gain.value = 0.28; // ≤ 0.3
    masterGainRef.current = masterGain;

    const lowpass = actx.createBiquadFilter();
    lowpass.type = "lowpass";
    lowpass.frequency.value = 7000; // ≤ 7500 Hz

    const comp = actx.createDynamicsCompressor();
    comp.threshold.value = -10;
    comp.knee.value = 3;
    comp.ratio.value = 20;
    comp.attack.value = 0.003;
    comp.release.value = 0.1;

    masterGain.connect(lowpass);
    lowpass.connect(comp);
    comp.connect(actx.destination);

    destNodeRef.current = masterGain; // voices connect to masterGain

    // Ambient pad
    padOscsRef.current = startAmbientPad(actx, masterGain);

    // Check speech recognition availability
    const SR = getSpeechRecognition();
    srClassRef.current = SR;
    setSrAvail(SR !== null);

    if (SR) {
      startSR();
    }

    // Start look-ahead scheduler
    schedTimerRef.current = setInterval(runScheduler, SCHED_INTERVAL_MS);

    // Start animation loop
    startAnimLoop();

    // Start auto-demo
    startDemo();
  }, [startSR, runScheduler, startAnimLoop, startDemo]);

  // ── Cleanup on unmount ──
  useEffect(() => {
    return () => {
      startedRef.current = false;
      cancelAnimationFrame(rafRef.current);
      if (schedTimerRef.current) clearInterval(schedTimerRef.current);
      if (demoTimerRef.current) clearTimeout(demoTimerRef.current);
      if (srRef.current) { try { srRef.current.stop(); } catch { /* ignore */ } }
      padOscsRef.current.forEach((o) => { try { o.stop(); } catch { /* ignore */ } });
      if (actxRef.current) actxRef.current.close().catch(() => {});
    };
  }, []);

  // ── SVG xylophone bar layout ──
  // leftmost = lowest (C4), rightmost = highest (E5)
  // bigger (longer) bar = lower pitch
  const BAR_HEIGHTS = BAR_MIDI.map((_, i) => {
    // longest bar = 80%, shortest = 42% — bars get shorter as pitch goes up
    return 80 - (i / (N_BARS - 1)) * 38;
  });

  // ── Tap letter row ──
  const TAP_LETTERS = "ABCDEFGHIJKLMNOPQRSTUVWXYZ".split("");

  return (
    <div className="min-h-screen bg-gradient-to-b from-sky-300 via-cyan-200 to-yellow-100 flex flex-col items-center px-3 py-4 overflow-hidden">

      {/* ── Header ── */}
      <div className="w-full max-w-2xl text-center mb-3">
        <h1 className="text-3xl font-black text-white drop-shadow-md tracking-tight leading-tight">
          Word Band 🎵
        </h1>
        <p className="text-base text-white/90 mt-1 font-semibold">
          Say a word — hear it turn into music!
        </p>
      </div>

      {/* ── Start screen ── */}
      {!started && (
        <div className="flex flex-col items-center gap-5 mt-8">
          <button
            onClick={handleStart}
            className="bg-yellow-400 hover:bg-yellow-300 active:scale-95 text-yellow-900 font-black text-2xl rounded-full px-10 py-5 shadow-lg shadow-yellow-600/40 transition-all duration-150 min-h-[80px]"
          >
            ▶ START
          </button>
          <p className="text-white/80 text-base text-center max-w-xs">
            Say any word out loud and watch the rainbow xylophone come alive!
          </p>
        </div>
      )}

      {/* ── Main experience ── */}
      {started && (
        <div className="w-full max-w-2xl flex flex-col gap-3">

          {/* ── Status bar ── */}
          <div className="flex items-center justify-between px-2">
            <div className="flex items-center gap-2">
              {srAvail === null && (
                <span className="text-white/70 text-sm">Setting up…</span>
              )}
              {srAvail && !micDenied && (
                <span className={`text-sm font-bold flex items-center gap-1 ${listening ? "text-green-600" : "text-white/70"}`}>
                  <span className={`w-2.5 h-2.5 rounded-full ${listening ? "bg-green-500 animate-pulse" : "bg-white/40"}`} />
                  {listening ? "Listening…" : "Mic off"}
                </span>
              )}
              {(srAvail === false || micDenied) && (
                <span className="text-rose-300 text-sm font-semibold">
                  {micDenied ? "Mic blocked — tap letters to play!" : "Tap the letters to play!"}
                </span>
              )}
            </div>
            {loopWords.length > 0 && (
              <div className="flex gap-1 flex-wrap justify-end">
                {loopWords.map((w, i) => (
                  <span
                    key={i}
                    className="text-xs font-bold px-2 py-0.5 rounded-full text-white"
                    style={{ backgroundColor: BAR_COLORS[i % N_BARS] }}
                  >
                    {w}
                  </span>
                ))}
              </div>
            )}
          </div>

          {/* ── SVG stage: xylophone + bouncing letters ── */}
          <div className="w-full rounded-3xl overflow-hidden shadow-xl bg-white/30 backdrop-blur-sm border-2 border-white/50">
            <svg
              viewBox="0 0 600 340"
              className="w-full"
              aria-hidden="true"
            >
              {/* Sky background gradient */}
              <defs>
                <linearGradient id="skyGrad" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="#e0f2fe" />
                  <stop offset="100%" stopColor="#fef9c3" />
                </linearGradient>
                <filter id="glow">
                  <feGaussianBlur stdDeviation="4" result="blur" />
                  <feMerge>
                    <feMergeNode in="blur" />
                    <feMergeNode in="SourceGraphic" />
                  </feMerge>
                </filter>
              </defs>
              <rect x="0" y="0" width="600" height="340" fill="url(#skyGrad)" />

              {/* Bouncing letters */}
              {letters.map((l) => (
                <text
                  key={l.id}
                  x={`${l.x}%`}
                  y={`${l.y}%`}
                  textAnchor="middle"
                  fontSize={Math.round(28 * l.scale)}
                  fontWeight="900"
                  fontFamily="system-ui, sans-serif"
                  fill={l.color}
                  opacity={l.opacity}
                  filter={l.lit ? "url(#glow)" : undefined}
                  style={{ userSelect: "none" }}
                >
                  {l.ch}
                </text>
              ))}

              {/* Playhead sparkle — a small bright dot tracking loop position */}
              {loopsRef.current.length > 0 && (
                <circle
                  cx={playheadPos * 560 + 20}
                  cy={260}
                  r={6}
                  fill="white"
                  opacity={0.85}
                  filter="url(#glow)"
                />
              )}

              {/* ── Xylophone bars ── */}
              {BAR_HEIGHTS.map((heightPct, i) => {
                const barW = 560 / N_BARS - 6;
                const x = 20 + i * (560 / N_BARS) + 3;
                const maxH = 120;
                const barH = (heightPct / 100) * maxH;
                const y = 285 - barH; // bars hang from bottom
                const flash = barFlash[i];
                const lit = flash > 0.1;

                return (
                  <g key={i}>
                    {/* Shadow */}
                    <rect
                      x={x + 3}
                      y={y + 4}
                      width={barW}
                      height={barH}
                      rx={barW * 0.35}
                      ry={barW * 0.35}
                      fill="rgba(0,0,0,0.15)"
                    />
                    {/* Bar */}
                    <rect
                      x={x}
                      y={y}
                      width={barW}
                      height={barH}
                      rx={barW * 0.35}
                      ry={barW * 0.35}
                      fill={BAR_COLORS[i]}
                      opacity={0.6 + flash * 0.4}
                      style={{
                        filter: lit ? `drop-shadow(0 0 ${Math.round(flash * 12)}px ${BAR_COLORS[i]})` : undefined,
                        transform: lit ? `translateY(${-(flash * 6)}px)` : undefined,
                        transformOrigin: `${x + barW / 2}px ${y + barH}px`,
                        transition: "opacity 0.05s",
                      }}
                    />
                    {/* Highlight shimmer */}
                    <rect
                      x={x + barW * 0.2}
                      y={y + 4}
                      width={barW * 0.35}
                      height={barH * 0.4}
                      rx={barW * 0.15}
                      fill="rgba(255,255,255,0.45)"
                    />
                    {/* Note name label */}
                    <text
                      x={x + barW / 2}
                      y={292}
                      textAnchor="middle"
                      fontSize="9"
                      fontWeight="700"
                      fill={BAR_COLORS[i]}
                      fontFamily="system-ui, sans-serif"
                    >
                      {BAR_NAMES[i]}
                    </text>
                  </g>
                );
              })}

              {/* Xylophone frame base */}
              <rect x="16" y="283" width="568" height="6" rx="3" fill="#92400e" opacity="0.6" />
            </svg>
          </div>

          {/* ── Tap keyboard fallback ── */}
          <div className="w-full bg-white/40 backdrop-blur-sm rounded-2xl p-3 border border-white/50">
            <p className="text-sm font-bold text-sky-800 mb-2 text-center">
              {srAvail ? "Or tap letters:" : "Tap letters to make music:"}
            </p>
            {/* Current word preview */}
            <div className="flex flex-wrap gap-1.5 justify-center min-h-[2.5rem] mb-2">
              {tapWord.split("").map((c, i) => {
                const barIdx = letterToBar(c);
                return (
                  <span
                    key={i}
                    className="inline-flex items-center justify-center w-8 h-8 rounded-lg text-white font-black text-sm shadow-md"
                    style={{ backgroundColor: BAR_COLORS[barIdx] }}
                  >
                    {c.toUpperCase()}
                  </span>
                );
              })}
              {tapWord.length === 0 && (
                <span className="text-sky-600/60 text-sm self-center">tap letters below…</span>
              )}
            </div>
            {/* Letter grid */}
            <div className="flex flex-wrap gap-1 justify-center mb-2">
              {TAP_LETTERS.map((l) => {
                const barIdx = letterToBar(l);
                const active = activeTapLetters.has(l);
                return (
                  <button
                    key={l}
                    onPointerDown={() => {
                      setTapWord((w) => w + l.toLowerCase());
                      setActiveTapLetters((s) => new Set([...s, l]));
                      setTimeout(() => setActiveTapLetters((s) => {
                        const n = new Set(s); n.delete(l); return n;
                      }), 200);
                    }}
                    className="w-9 h-9 rounded-lg text-white font-black text-sm transition-all duration-75 active:scale-90 touch-none select-none"
                    style={{
                      backgroundColor: BAR_COLORS[barIdx],
                      opacity: active ? 1 : 0.8,
                      transform: active ? "scale(1.1)" : undefined,
                    }}
                  >
                    {l}
                  </button>
                );
              })}
            </div>
            {/* Action buttons */}
            <div className="flex gap-2 justify-center">
              <button
                onPointerDown={handleTapSubmit}
                disabled={tapWord.length < 2}
                className="bg-yellow-400 hover:bg-yellow-300 disabled:opacity-40 text-yellow-900 font-black text-base rounded-xl px-5 py-2.5 shadow-md transition-all active:scale-95 min-h-[44px]"
              >
                PLAY! ▶
              </button>
              <button
                onPointerDown={() => { setTapWord((w) => w.slice(0, -1)); }}
                disabled={tapWord.length === 0}
                className="bg-rose-300 hover:bg-rose-200 disabled:opacity-40 text-white font-bold text-base rounded-xl px-4 py-2.5 shadow-md transition-all active:scale-95 min-h-[44px]"
              >
                ⌫
              </button>
              <button
                onPointerDown={() => { setTapWord(""); setActiveTapLetters(new Set()); }}
                disabled={tapWord.length === 0}
                className="bg-white/60 hover:bg-white/80 disabled:opacity-40 text-sky-700 font-bold text-base rounded-xl px-4 py-2.5 shadow-md transition-all active:scale-95 min-h-[44px]"
              >
                Clear
              </button>
            </div>
          </div>

          {/* ── Design notes toggle ── */}
          <div className="text-center">
            <button
              onClick={() => setShowNotes((v) => !v)}
              className="text-sky-700/80 text-sm underline underline-offset-2"
            >
              {showNotes ? "Hide design notes" : "Read the design notes"}
            </button>
            {showNotes && (
              <div className="mt-2 bg-white/60 rounded-2xl p-4 text-left text-sm text-sky-900 space-y-2">
                <p><strong>Letter → Note mapping:</strong> Vowels (a e i o u) anchor the pentatonic scale degrees. Each consonant maps to a stable bar index — nothing can sound wrong because every note is in C-major pentatonic (C4 D4 E4 G4 A4 C5 D5 E5).</p>
                <p><strong>Scheduling:</strong> A 25ms look-ahead scheduler (Chris Wilson pattern) pumps notes 120ms ahead for tight, glitch-free timing even on iOS Safari.</p>
                <p><strong>Timbre:</strong> Triangle fundamental + soft 2× and 4× sine partials, percussive envelope — warm mallet / marimba feel. All voices → masterGain (0.28) → lowpass (7000 Hz) → DynamicsCompressor (−10 dB, 20:1) → output.</p>
                <p><strong>SVG/DOM only:</strong> No canvas, no WebGL/WebGPU. The xylophone, bouncing letters, and playhead sparkle are all SVG elements. The deliberate point: the idea carries with zero GPU renderer.</p>
                <p><strong>Auto-demo:</strong> After 3s of silence, a ghost voice cycles through happy words (banana, sunshine, hello, rainbow…) every 2.5s so you see + hear the prototype hands-off. Cancels on real input; resumes after 5s silence.</p>
                <p><strong>Fallback:</strong> If speech is unavailable or denied, tap the letter grid to spell a word and press PLAY. Fully musical with zero microphone.</p>
              </div>
            )}
          </div>

        </div>
      )}
    </div>
  );
}
