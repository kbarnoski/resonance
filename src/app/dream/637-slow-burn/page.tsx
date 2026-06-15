"use client";

import { useCallback, useEffect, useRef, useState } from "react";

// ════════════════════════════════════════════════════════════════════════════
//  637 · SLOW BURN
//  Making the invisible "pocket" of a groove VISIBLE.
//  A tender, after-hours neo-soul vamp whose laid-back snare and pushed hats
//  you can SEE landing off the grid — and FEEL start to breathe as you loosen
//  the feel.
//
//  Subsystems:
//   1. Look-ahead microtiming scheduler (setInterval poll + audioCtx.currentTime)
//   2. From-scratch multi-voice synthesis (kick/snare/hat/bass/FM-Rhodes)
//   3. Reharmonization state machine (the vamp drifts over minutes)
//   4. SVG grid-vs-actual onset renderer (the centerpiece)
// ════════════════════════════════════════════════════════════════════════════

const BPM = 72;
const SECONDS_PER_BEAT = 60 / BPM;
const STEPS_PER_BAR = 16; // 16th notes
const STEP_DUR = SECONDS_PER_BEAT / 4; // duration of one 16th
const LOOKAHEAD_MS = 25; // scheduler poll interval
const SCHEDULE_AHEAD = 0.12; // schedule notes this far ahead (s)

// ── per-voice base microtiming offsets (seconds, at FEEL = 1.0) ──────────────
//   kick dead-on, snare laid-back/late, hats pushed/early, bass a touch behind
const VOICE_OFFSET = {
  kick: 0.0,
  snare: 0.032, // +32ms late — "laid back"
  hat: -0.011, // -11ms early — "pushed"
  bass: 0.018, // +18ms behind
  rhodes: 0.0,
} as const;

type VoiceName = keyof typeof VOICE_OFFSET;

const VOICE_COLOR: Record<VoiceName, string> = {
  kick: "#f0a8c0", // rose
  snare: "#c4b5fd", // violet
  hat: "#6ee7b7", // emerald
  bass: "#fcd34d", // amber
  rhodes: "#93c5fd", // blue (not plotted, but for legend completeness)
};

// ── step patterns (1 = hit) over a 16-step bar ──────────────────────────────
//   index:  0 . . . 4 . . . 8 . . . 12 . . .
const PATTERN: Record<Exclude<VoiceName, "rhodes">, number[]> = {
  kick: [1, 0, 0, 0, 0, 0, 1, 0, 0, 0, 1, 0, 0, 0, 0, 0],
  snare: [0, 0, 0, 0, 1, 0, 0, 0, 0, 0, 0, 0, 1, 0, 0, 0],
  hat: [1, 0, 1, 0, 1, 0, 1, 0, 1, 0, 1, 0, 1, 0, 1, 1],
  bass: [1, 0, 0, 1, 0, 0, 1, 0, 0, 1, 0, 0, 1, 0, 1, 0],
};

// ── reharmonization: smoky after-hours progression, one chord per bar ────────
//   Fm9 → Bbm9 → Eb13 → Abmaj9   (frequencies in Hz)
interface Chord {
  name: string;
  // root used to derive the gliding sub-bass target (Hz)
  bassHz: number;
  // Rhodes voicing (Hz) — built leaner / extended (9 / 11 / 13)
  voicing: number[];
}

function hz(midi: number): number {
  return 440 * Math.pow(2, (midi - 69) / 12);
}

// MIDI helper voicings (lean, extended, after-hours)
const PROG_BASE: Chord[] = [
  // Fm9 : F Ab C Eb G  → voice upper structure
  { name: "Fm9", bassHz: hz(41), voicing: [hz(60), hz(63), hz(67), hz(70), hz(74)] },
  // Bbm9 : Bb Db F Ab C
  { name: "Bbm9", bassHz: hz(46), voicing: [hz(58), hz(61), hz(65), hz(68), hz(72)] },
  // Eb13 : Eb G Db F C
  { name: "Eb13", bassHz: hz(39), voicing: [hz(58), hz(62), hz(67), hz(69), hz(73)] },
  // Abmaj9 : Ab C Eb G Bb
  { name: "Abmaj9", bassHz: hz(44), voicing: [hz(60), hz(64), hz(67), hz(71), hz(74)] },
];

// ── a scheduled hit, captured for the SVG plot ───────────────────────────────
interface PlottedHit {
  voice: VoiceName;
  step: number; // 0..15 grid position
  gridTime: number; // ideal onset (s, ctx time)
  actualTime: number; // actual onset (s, ctx time)
  velocity: number; // 0..1
  bar: number;
}

interface AudioRefs {
  ctx: AudioContext;
  master: GainNode;
  haze: BiquadFilterNode;
}

export default function SlowBurnPage() {
  const [running, setRunning] = useState(false);
  const [feel, setFeel] = useState(0.0); // 0 robotic → 1 pocket → 1.8 too loose
  const [chordName, setChordName] = useState(PROG_BASE[0].name);
  const [barCount, setBarCount] = useState(0);
  const [audioReady, setAudioReady] = useState(true);
  const [muted, setMuted] = useState<Record<VoiceName, boolean>>({
    kick: false,
    snare: false,
    hat: false,
    bass: false,
    rhodes: false,
  });
  const [autoDemo, setAutoDemo] = useState(true);
  const [notice, setNotice] = useState<string | null>(null);
  const [showNotes, setShowNotes] = useState(false);

  // ── mutable engine state (refs so the scheduler effect never re-binds) ─────
  const audioRef = useRef<AudioRefs | null>(null);
  const timerRef = useRef<number | null>(null);
  const nextStepRef = useRef(0); // global step index
  const nextNoteTimeRef = useRef(0); // ctx time of next step
  const feelRef = useRef(feel);
  const mutedRef = useRef(muted);
  const runningRef = useRef(false);

  // hits for the current + previous bar, for the SVG plot
  const [hits, setHits] = useState<PlottedHit[]>([]);
  const hitsBufferRef = useRef<PlottedHit[]>([]);

  useEffect(() => {
    feelRef.current = feel;
  }, [feel]);
  useEffect(() => {
    mutedRef.current = muted;
  }, [muted]);

  // ═══════════════════════════════════════════════════════════════════════════
  //  SYNTH VOICES (from scratch)
  // ═══════════════════════════════════════════════════════════════════════════

  const makeNoiseBuffer = useCallback((ctx: AudioContext, secs: number): AudioBuffer => {
    const len = Math.floor(ctx.sampleRate * secs);
    const buf = ctx.createBuffer(1, len, ctx.sampleRate);
    const d = buf.getChannelData(0);
    for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
    return buf;
  }, []);

  const noiseBufRef = useRef<AudioBuffer | null>(null);

  // soft sine kick
  const playKick = useCallback((ctx: AudioContext, dest: AudioNode, t: number, vel: number) => {
    const o = ctx.createOscillator();
    const g = ctx.createGain();
    o.type = "sine";
    o.frequency.setValueAtTime(120, t);
    o.frequency.exponentialRampToValueAtTime(46, t + 0.12);
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(0.9 * vel, t + 0.006);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 0.42);
    o.connect(g).connect(dest);
    o.start(t);
    o.stop(t + 0.45);
  }, []);

  // brushed bandpass-noise snare
  const playSnare = useCallback(
    (ctx: AudioContext, dest: AudioNode, t: number, vel: number) => {
      const src = ctx.createBufferSource();
      src.buffer = noiseBufRef.current;
      const bp = ctx.createBiquadFilter();
      bp.type = "bandpass";
      bp.frequency.value = 1750;
      bp.Q.value = 0.7;
      const g = ctx.createGain();
      g.gain.setValueAtTime(0.0001, t);
      g.gain.exponentialRampToValueAtTime(0.5 * vel, t + 0.004);
      g.gain.exponentialRampToValueAtTime(0.0001, t + 0.18); // brushed = longer tail
      // a soft body tone underneath
      const o = ctx.createOscillator();
      o.type = "triangle";
      o.frequency.value = 190;
      const og = ctx.createGain();
      og.gain.setValueAtTime(0.0001, t);
      og.gain.exponentialRampToValueAtTime(0.18 * vel, t + 0.004);
      og.gain.exponentialRampToValueAtTime(0.0001, t + 0.1);
      src.connect(bp).connect(g).connect(dest);
      o.connect(og).connect(dest);
      src.start(t);
      src.stop(t + 0.2);
      o.start(t);
      o.stop(t + 0.12);
    },
    [],
  );

  // lazy filtered-noise hat
  const playHat = useCallback((ctx: AudioContext, dest: AudioNode, t: number, vel: number) => {
    const src = ctx.createBufferSource();
    src.buffer = noiseBufRef.current;
    const hp = ctx.createBiquadFilter();
    hp.type = "highpass";
    hp.frequency.value = 7200;
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(0.22 * vel, t + 0.002);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 0.06);
    src.connect(hp).connect(g).connect(dest);
    src.start(t);
    src.stop(t + 0.08);
  }, []);

  // gliding sine sub-bass
  const lastBassHzRef = useRef(hz(41));
  const playBass = useCallback(
    (ctx: AudioContext, dest: AudioNode, t: number, vel: number, target: number) => {
      const o = ctx.createOscillator();
      const g = ctx.createGain();
      o.type = "sine";
      o.frequency.setValueAtTime(lastBassHzRef.current, t);
      o.frequency.exponentialRampToValueAtTime(target, t + 0.09); // glide
      lastBassHzRef.current = target;
      g.gain.setValueAtTime(0.0001, t);
      g.gain.exponentialRampToValueAtTime(0.7 * vel, t + 0.02);
      g.gain.exponentialRampToValueAtTime(0.0001, t + 0.34);
      o.connect(g).connect(dest);
      o.start(t);
      o.stop(t + 0.38);
    },
    [],
  );

  // FM Rhodes (sine carrier + 1:1 sine modulator, decaying tine envelope)
  const playRhodesNote = useCallback(
    (ctx: AudioContext, dest: AudioNode, t: number, freq: number, vel: number, dur: number) => {
      const carrier = ctx.createOscillator();
      const mod = ctx.createOscillator();
      const modGain = ctx.createGain();
      const amp = ctx.createGain();
      carrier.type = "sine";
      mod.type = "sine";
      carrier.frequency.value = freq;
      mod.frequency.value = freq; // 1:1 ratio → bell/tine character
      // tine: index decays fast → percussive attack, mellow sustain
      modGain.gain.setValueAtTime(freq * 2.2, t);
      modGain.gain.exponentialRampToValueAtTime(freq * 0.4, t + 0.6);
      mod.connect(modGain).connect(carrier.frequency);
      amp.gain.setValueAtTime(0.0001, t);
      amp.gain.exponentialRampToValueAtTime(0.16 * vel, t + 0.01);
      amp.gain.exponentialRampToValueAtTime(0.0001, t + dur);
      carrier.connect(amp).connect(dest);
      carrier.start(t);
      mod.start(t);
      carrier.stop(t + dur + 0.05);
      mod.stop(t + dur + 0.05);
    },
    [],
  );

  // vinyl crackle — low-rate random pops, started once and left running
  const crackleRef = useRef<{ src: AudioBufferSourceNode; gain: GainNode } | null>(null);
  const startCrackle = useCallback((ctx: AudioContext, dest: AudioNode) => {
    const secs = 4;
    const len = Math.floor(ctx.sampleRate * secs);
    const buf = ctx.createBuffer(1, len, ctx.sampleRate);
    const d = buf.getChannelData(0);
    for (let i = 0; i < len; i++) {
      // sparse crackle
      d[i] = Math.random() < 0.0009 ? (Math.random() * 2 - 1) * 0.6 : 0;
      // gentle surface hiss
      d[i] += (Math.random() * 2 - 1) * 0.012;
    }
    const src = ctx.createBufferSource();
    src.buffer = buf;
    src.loop = true;
    const g = ctx.createGain();
    g.gain.value = 0.5;
    const lp = ctx.createBiquadFilter();
    lp.type = "lowpass";
    lp.frequency.value = 5200;
    src.connect(lp).connect(g).connect(dest);
    src.start();
    crackleRef.current = { src, gain: g };
  }, []);

  // ═══════════════════════════════════════════════════════════════════════════
  //  REHARMONIZATION STATE MACHINE
  //  Drifts voicings / fills / walking-bass over the minutes so min 3 ≠ min 0.
  // ═══════════════════════════════════════════════════════════════════════════

  const getChordForBar = useCallback((bar: number): Chord => {
    const base = PROG_BASE[bar % PROG_BASE.length];
    const era = Math.floor(bar / PROG_BASE.length); // which lap through the vamp
    // detune the upper extensions a touch more as the vamp ages (sensual drift)
    const lean = Math.min(era * 0.6, 4);
    const voicing = base.voicing.map((f, i) => {
      // gradually substitute the top voice up a whole tone (add #11 / 13 color)
      if (i === base.voicing.length - 1 && era % 2 === 1) {
        return f * Math.pow(2, 2 / 12);
      }
      // microscopic detune fattens the Rhodes as it warms
      return f * (1 + (i - 2) * 0.0006 * lean);
    });
    return { ...base, voicing };
  }, []);

  // walking-bass embellishment: as bars age, add passing tones on weak steps
  const getBassTargetForStep = useCallback(
    (chord: Chord, step: number, era: number): number => {
      if (era >= 2 && (step === 9 || step === 14)) {
        // approach tone a semitone below the root
        return chord.bassHz * Math.pow(2, -1 / 12);
      }
      if (era >= 3 && step === 3) {
        return chord.bassHz * Math.pow(2, 7 / 12); // fifth, walking up
      }
      return chord.bassHz;
    },
    [],
  );

  // fills: later eras add ghost snares
  const shouldGhostSnare = useCallback((step: number, era: number): boolean => {
    if (era >= 1 && step === 7) return true;
    if (era >= 3 && step === 14) return true;
    return false;
  }, []);

  // ═══════════════════════════════════════════════════════════════════════════
  //  LOOK-AHEAD SCHEDULER
  // ═══════════════════════════════════════════════════════════════════════════

  const scheduleStep = useCallback(
    (globalStep: number, when: number) => {
      const a = audioRef.current;
      if (!a) return;
      const step = ((globalStep % STEPS_PER_BAR) + STEPS_PER_BAR) % STEPS_PER_BAR;
      const bar = Math.floor(globalStep / STEPS_PER_BAR);
      const era = Math.floor(bar / PROG_BASE.length);
      const chord = getChordForBar(bar);
      const f = feelRef.current;
      const m = mutedRef.current;
      const newHits: PlottedHit[] = [];

      const fire = (
        voice: VoiceName,
        vel: number,
        play: (t: number) => void,
        plot: boolean,
      ) => {
        if (m[voice]) return;
        // microtiming: base offset × feel lever, with a hair of human jitter
        const baseOff = VOICE_OFFSET[voice];
        const jitter = (Math.random() - 0.5) * 0.004 * Math.min(f, 1.4);
        const actual = when + baseOff * f + jitter;
        play(actual);
        if (plot) {
          newHits.push({
            voice,
            step,
            gridTime: when,
            actualTime: actual,
            velocity: vel,
            bar,
          });
        }
      };

      // ── KICK ──
      if (PATTERN.kick[step]) {
        const vel = step === 0 ? 1.0 : 0.82;
        fire("kick", vel, (t) => playKick(a.ctx, a.haze, t, vel), true);
      }
      // ── SNARE (+ ghost-snare fills from the state machine) ──
      if (PATTERN.snare[step]) {
        const vel = 0.92;
        fire("snare", vel, (t) => playSnare(a.ctx, a.haze, t, vel), true);
      } else if (shouldGhostSnare(step, era)) {
        const vel = 0.35;
        fire("snare", vel, (t) => playSnare(a.ctx, a.haze, t, vel), true);
      }
      // ── HAT ──
      if (PATTERN.hat[step]) {
        // off-beat hats a touch louder = the "push"
        const vel = step % 2 === 1 ? 0.85 : 0.6;
        fire("hat", vel, (t) => playHat(a.ctx, a.haze, t, vel), true);
      }
      // ── BASS (walking embellishments later) ──
      if (PATTERN.bass[step]) {
        const target = getBassTargetForStep(chord, step, era);
        const vel = step === 0 ? 0.95 : 0.7;
        fire("bass", vel, (t) => playBass(a.ctx, a.haze, t, vel, target), true);
      }
      // ── RHODES comping: hit chord on beats 1 and 3 of the bar (steps 0, 8) ──
      if (!m.rhodes && (step === 0 || step === 8)) {
        const off = VOICE_OFFSET.rhodes * f;
        const t = when + off + (Math.random() - 0.5) * 0.012; // hand-rolled spread
        chord.voicing.forEach((freq: number, i: number) => {
          // arpeggiate the voicing very slightly (rolled chord)
          const roll = i * 0.018 * (1 + f * 0.3);
          playRhodesNote(a.ctx, a.haze, t + roll, freq, 0.85 - i * 0.06, 1.8);
        });
      }

      // ── push hits to the plot buffer; flush per bar ──
      if (newHits.length) {
        hitsBufferRef.current.push(...newHits);
      }
      if (step === STEPS_PER_BAR - 1) {
        // end of bar: publish the buffered bar to the SVG, start a fresh buffer
        const published = hitsBufferRef.current;
        hitsBufferRef.current = [];
        // schedule the React state update near the bar boundary
        const delay = Math.max(0, (when - a.ctx.currentTime) * 1000);
        window.setTimeout(() => {
          setHits(published);
          setBarCount(bar + 1);
          setChordName(getChordForBar(bar + 1).name);
        }, delay);
      }
    },
    [
      getChordForBar,
      getBassTargetForStep,
      shouldGhostSnare,
      playKick,
      playSnare,
      playHat,
      playBass,
      playRhodesNote,
    ],
  );

  const schedulerTick = useCallback(() => {
    const a = audioRef.current;
    if (!a) return;
    while (nextNoteTimeRef.current < a.ctx.currentTime + SCHEDULE_AHEAD) {
      scheduleStep(nextStepRef.current, nextNoteTimeRef.current);
      nextNoteTimeRef.current += STEP_DUR;
      nextStepRef.current += 1;
    }
  }, [scheduleStep]);

  // ═══════════════════════════════════════════════════════════════════════════
  //  TRANSPORT
  // ═══════════════════════════════════════════════════════════════════════════

  const buildAudio = useCallback((): AudioRefs | null => {
    try {
      const Ctor =
        window.AudioContext ||
        (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      const ctx = new Ctor();
      // ── ear-safe master chain: master → lowpass haze → limiter → out ──
      const master = ctx.createGain();
      master.gain.value = 0.9;
      const haze = ctx.createBiquadFilter();
      haze.type = "lowpass";
      haze.frequency.value = 9000; // gentle after-hours haze
      haze.Q.value = 0.4;
      const limiter = ctx.createDynamicsCompressor();
      limiter.threshold.value = -10;
      limiter.knee.value = 0;
      limiter.ratio.value = 12;
      limiter.attack.value = 0.003;
      limiter.release.value = 0.25;
      // voices feed `haze`; haze → master → limiter → destination
      haze.connect(master).connect(limiter).connect(ctx.destination);
      return { ctx, master, haze };
    } catch {
      return null;
    }
  }, []);

  const start = useCallback(() => {
    if (runningRef.current) return;
    let a = audioRef.current;
    if (!a) {
      a = buildAudio();
      if (!a) {
        setAudioReady(false);
        setNotice("Audio could not start on this device. The visual still demonstrates the idea.");
        return;
      }
      audioRef.current = a;
      noiseBufRef.current = makeNoiseBuffer(a.ctx, 1.0);
      startCrackle(a.ctx, a.haze);
    }
    // iOS: resume inside the user gesture
    void a.ctx.resume();
    nextStepRef.current = 0;
    nextNoteTimeRef.current = a.ctx.currentTime + 0.08;
    hitsBufferRef.current = [];
    runningRef.current = true;
    setRunning(true);
    timerRef.current = window.setInterval(schedulerTick, LOOKAHEAD_MS);
  }, [buildAudio, makeNoiseBuffer, startCrackle, schedulerTick]);

  const stop = useCallback(() => {
    runningRef.current = false;
    setRunning(false);
    if (timerRef.current !== null) {
      window.clearInterval(timerRef.current);
      timerRef.current = null;
    }
    const a = audioRef.current;
    if (a) void a.ctx.suspend();
  }, []);

  const toggle = useCallback(() => {
    if (runningRef.current) stop();
    else start();
  }, [start, stop]);

  // ═══════════════════════════════════════════════════════════════════════════
  //  IDLE AUTO-DEMO — alive within ~2.5s; sweeps FEEL robotic → pocket
  // ═══════════════════════════════════════════════════════════════════════════

  useEffect(() => {
    const startTimer = window.setTimeout(() => {
      if (!runningRef.current) start();
    }, 1800);
    return () => window.clearTimeout(startTimer);
    // run once
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (!autoDemo) return;
    let raf = 0;
    let t0 = 0;
    const SWEEP_MS = 14000; // slow sweep
    const tick = (now: number) => {
      if (!t0) t0 = now;
      const phase = ((now - t0) % SWEEP_MS) / SWEEP_MS; // 0..1
      // ease robotic(0) → pocket(~1.1) → settle; gentle sine breathing
      const eased = 0.55 - 0.55 * Math.cos(phase * Math.PI * 2);
      const target = eased * 1.15; // peaks just past "in the pocket"
      setFeel((prev: number) => prev + (target - prev) * 0.06);
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [autoDemo]);

  // ═══════════════════════════════════════════════════════════════════════════
  //  KEYBOARD
  // ═══════════════════════════════════════════════════════════════════════════

  const adjustFeel = useCallback((delta: number) => {
    setAutoDemo(false);
    setFeel((f: number) => Math.max(0, Math.min(1.8, f + delta)));
  }, []);

  const toggleVoice = useCallback((v: VoiceName) => {
    setMuted((m: Record<VoiceName, boolean>) => ({ ...m, [v]: !m[v] }));
  }, []);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      switch (e.key) {
        case " ":
          e.preventDefault();
          toggle();
          break;
        case "ArrowLeft":
        case "[":
          e.preventDefault();
          adjustFeel(-0.1);
          break;
        case "ArrowRight":
        case "]":
          e.preventDefault();
          adjustFeel(0.1);
          break;
        case "1":
          toggleVoice("kick");
          break;
        case "2":
          toggleVoice("snare");
          break;
        case "3":
          toggleVoice("hat");
          break;
        case "4":
          toggleVoice("bass");
          break;
        case "5":
          toggleVoice("rhodes");
          break;
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [toggle, adjustFeel, toggleVoice]);

  // cleanup on unmount
  useEffect(() => {
    return () => {
      if (timerRef.current !== null) window.clearInterval(timerRef.current);
      const a = audioRef.current;
      if (a) void a.ctx.close();
    };
  }, []);

  const feelLabel =
    feel < 0.18 ? "robotic" : feel < 0.85 ? "tightening" : feel < 1.25 ? "in the pocket" : "too loose";

  return (
    <main className="relative min-h-screen overflow-hidden bg-[#0a0708] text-white/95">
      {/* smoky vignette backdrop */}
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0"
        style={{
          background:
            "radial-gradient(1200px 700px at 70% -10%, rgba(124,58,237,0.12), transparent 60%), radial-gradient(900px 600px at 10% 110%, rgba(244,63,94,0.10), transparent 55%)",
        }}
      />

      <div className="relative mx-auto flex max-w-5xl flex-col gap-6 px-5 py-8 sm:px-8">
        {/* ── header ── */}
        <header className="flex items-start justify-between gap-4">
          <div>
            <p className="font-mono text-xs uppercase tracking-[0.3em] text-violet-300">
              Resonance · dream 637
            </p>
            <h1 className="mt-2 font-serif text-3xl font-medium text-white/95 sm:text-4xl">
              Slow Burn
            </h1>
            <p className="mt-2 max-w-xl text-base text-white/75">
              An after-hours neo-soul vamp that makes the invisible pocket of a groove visible —
              watch the laid-back snare and pushed hats land off the grid, and hear the beat start to
              breathe as you loosen the feel.
            </p>
          </div>
          <button
            onClick={() => setShowNotes((s: boolean) => !s)}
            className="min-h-[44px] shrink-0 rounded-md border border-white/15 px-4 py-2.5 font-mono text-xs text-white/75 transition hover:border-white/30 hover:text-white/95"
          >
            {showNotes ? "Hide design notes" : "Read the design notes"}
          </button>
        </header>

        {showNotes && (
          <section className="rounded-xl border border-white/10 bg-white/[0.03] p-5 text-base text-white/75">
            <h2 className="mb-2 font-serif text-xl text-white/95">Design notes</h2>
            <p className="mb-3">
              Every groove has a <span className="text-violet-300">pocket</span> — the tiny, deliberate
              way each voice sits ahead of or behind the metronomic grid. It is the difference between
              a drum machine and a human at 2am. This prototype gives each voice its own timing lean
              (kick dead-on, snare laid back ~+32ms, hats pushed ~&minus;11ms, bass a touch behind) and
              a single <span className="text-rose-300">FEEL</span> lever that scales them all from
              quantized to deep in the pocket.
            </p>
            <p className="mb-3">
              The plot below renders that normally-invisible deviation: a hollow ring marks the grid
              time, a line stretches out to where the hit actually landed, and a glowing dot sits on
              the real onset. As FEEL rises, the dots pull away from the grid — microtiming made
              legible. A reharmonization state machine drifts the voicings, walking bass, and fills
              over the minutes, so the vamp at minute three is not the vamp at minute zero.
            </p>
            <p className="text-white/55">
              Refs: Datseris et al., &ldquo;Does it Swing?&rdquo; (Sci. Rep. 2019 / arXiv 1904.03442);
              Charnas, <em>Dilla Time</em> (2022); the &ldquo;expressive drum grid&rdquo; interface of
              arXiv 2605.10281 (2026). Full notes in this folder&rsquo;s README.md.
            </p>
          </section>
        )}

        {notice && (
          <p className="rounded-md border border-rose-400/30 bg-rose-500/10 px-4 py-3 text-base text-rose-300">
            {notice}
          </p>
        )}

        {/* ── primary action + transport readout ── */}
        <div className="flex flex-wrap items-center gap-4">
          <button
            onClick={toggle}
            disabled={!audioReady}
            className="min-h-[44px] rounded-lg bg-violet-500/90 px-4 py-2.5 font-mono text-base font-medium text-white/95 transition hover:bg-violet-400 disabled:opacity-40"
          >
            {running ? "Stop the vamp" : "Start the vamp"}
            <span className="ml-2 text-white/75">(Space)</span>
          </button>

          <div className="flex items-baseline gap-3 font-mono text-base">
            <span className="text-white/55">{BPM} BPM</span>
            <span className="text-white/55">·</span>
            <span className="text-amber-300">{chordName}</span>
            <span className="text-white/55">·</span>
            <span className="text-white/55">bar {barCount}</span>
          </div>
        </div>

        {/* ── FEEL lever ── */}
        <section className="rounded-xl border border-white/10 bg-white/[0.03] p-5">
          <div className="flex items-center justify-between">
            <label htmlFor="feel" className="font-mono text-base text-white/75">
              FEEL / looseness
            </label>
            <span className="font-mono text-base text-rose-300">
              {feel.toFixed(2)} · {feelLabel}
            </span>
          </div>
          <input
            id="feel"
            type="range"
            min={0}
            max={1.8}
            step={0.01}
            value={feel}
            onChange={(e) => {
              setAutoDemo(false);
              setFeel(parseFloat(e.target.value));
            }}
            className="mt-3 w-full accent-rose-400"
          />
          <div className="mt-2 flex justify-between font-mono text-xs text-white/55">
            <span>0 · quantized</span>
            <span>1.0 · in the pocket</span>
            <span>1.8 · too loose</span>
          </div>
          <p className="mt-3 text-base text-white/75">
            Move it with the slider or <span className="font-mono text-violet-300">← →</span> /{" "}
            <span className="font-mono text-violet-300">[ ]</span>. Every voice carries its own
            timing lean — this lever scales them all at once.
            {autoDemo && (
              <span className="ml-1 text-emerald-300">Auto-demo is sweeping; touch to take over.</span>
            )}
          </p>
        </section>

        {/* ── THE CENTERPIECE: grid-vs-actual onset plot ── */}
        <GridPlot hits={hits} feel={feel} muted={muted} />

        {/* ── voice toggles + legend ── */}
        <section className="flex flex-wrap items-center gap-2 font-mono text-sm">
          <span className="text-white/55">voices (1–5):</span>
          {(Object.keys(VOICE_OFFSET) as VoiceName[]).map((v, i) => (
            <button
              key={v}
              onClick={() => toggleVoice(v)}
              className="min-h-[44px] rounded-md border px-4 py-2.5 text-base transition"
              style={{
                borderColor: muted[v] ? "rgba(255,255,255,0.12)" : VOICE_COLOR[v],
                color: muted[v] ? "rgba(255,255,255,0.45)" : VOICE_COLOR[v],
                opacity: muted[v] ? 0.6 : 1,
              }}
            >
              {i + 1} · {v}
              <span className="ml-1 text-white/55">
                {VOICE_OFFSET[v] === 0
                  ? "on"
                  : VOICE_OFFSET[v] > 0
                    ? `+${Math.round(VOICE_OFFSET[v] * 1000)}ms`
                    : `${Math.round(VOICE_OFFSET[v] * 1000)}ms`}
              </span>
            </button>
          ))}
        </section>

        <footer className="mt-2 font-mono text-xs text-white/55">
          Grounded in <span className="text-white/75">Datseris et al., &ldquo;Does it Swing?&rdquo;
          (Sci. Rep. 2019)</span>, Charnas&rsquo; <span className="text-white/75">Dilla Time
          (2022)</span>, and the expressive drum grid of{" "}
          <span className="text-white/75">arXiv 2605.10281 (2026)</span>.
        </footer>
      </div>
    </main>
  );
}

// ════════════════════════════════════════════════════════════════════════════
//  SVG GRID-VS-ACTUAL ONSET PLOT  (the centerpiece)
//  Per hit: hollow anchor at the grid time → connecting line → glowing dot at
//  the actual onset. As FEEL grows, dots pull AWAY from the grid.
// ════════════════════════════════════════════════════════════════════════════

function GridPlot({
  hits,
  feel,
  muted,
}: {
  hits: PlottedHit[];
  feel: number;
  muted: Record<VoiceName, boolean>;
}) {
  const W = 920;
  const H = 320;
  const padL = 70;
  const padR = 24;
  const padT = 28;
  const padB = 28;
  const plotW = W - padL - padR;
  const plotH = H - padT - padB;

  // voices to lay out as horizontal lanes (rhodes is comped, not plotted)
  const lanes: VoiceName[] = ["kick", "snare", "hat", "bass"];
  const laneH = plotH / lanes.length;

  // map a grid step (0..15) to an x position
  const stepX = (step: number) => padL + (step / STEPS_PER_BAR) * plotW;
  // ms deviation → horizontal pixel offset for the actual onset
  // STEP_DUR (s) spans one 16th cell; let one cell width = visual scale
  const cellW = plotW / STEPS_PER_BAR;
  const devToPx = (devSec: number) => (devSec / STEP_DUR) * cellW;

  return (
    <section className="rounded-xl border border-white/10 bg-black/40 p-4">
      <div className="mb-2 flex items-center justify-between">
        <h2 className="font-mono text-base text-white/75">grid vs. actual — where the hits land</h2>
        <span className="font-mono text-xs text-white/55">
          hollow = grid · glow = actual onset · one bar
        </span>
      </div>
      <svg
        viewBox={`0 0 ${W} ${H}`}
        className="w-full"
        role="img"
        aria-label="Plot of drum hits against a 16th-note grid; glowing dots show where each hit actually lands relative to the grid lines."
      >
        <defs>
          <filter id="glow637" x="-60%" y="-60%" width="220%" height="220%">
            <feGaussianBlur stdDeviation="3.2" result="b" />
            <feMerge>
              <feMergeNode in="b" />
              <feMergeNode in="SourceGraphic" />
            </feMerge>
          </filter>
        </defs>

        {/* ── vertical 16th gridlines ── */}
        {Array.from({ length: STEPS_PER_BAR + 1 }).map((_, i) => {
          const x = stepX(i);
          const isBeat = i % 4 === 0;
          return (
            <line
              key={`g${i}`}
              x1={x}
              y1={padT}
              x2={x}
              y2={padT + plotH}
              stroke={isBeat ? "rgba(255,255,255,0.30)" : "rgba(255,255,255,0.10)"}
              strokeWidth={isBeat ? 1.3 : 0.7}
            />
          );
        })}
        {/* beat numbers */}
        {[0, 4, 8, 12].map((s, i) => (
          <text
            key={`bn${s}`}
            x={stepX(s) + 3}
            y={padT - 10}
            className="font-mono"
            fontSize="11"
            fill="rgba(255,255,255,0.55)"
          >
            {i + 1}
          </text>
        ))}

        {/* ── lane rows + labels ── */}
        {lanes.map((v, li) => {
          const yc = padT + laneH * li + laneH / 2;
          return (
            <g key={`lane${v}`}>
              <line
                x1={padL}
                y1={yc}
                x2={padL + plotW}
                y2={yc}
                stroke="rgba(255,255,255,0.06)"
                strokeWidth={1}
              />
              <text
                x={padL - 12}
                y={yc + 4}
                textAnchor="end"
                className="font-mono"
                fontSize="13"
                fill={muted[v] ? "rgba(255,255,255,0.30)" : VOICE_COLOR[v]}
              >
                {v}
              </text>
            </g>
          );
        })}

        {/* ── the hits ── */}
        {hits.map((h, idx) => {
          const li = lanes.indexOf(h.voice);
          if (li < 0) return null;
          const yc = padT + laneH * li + laneH / 2;
          const gx = stepX(h.step);
          const dev = h.actualTime - h.gridTime;
          const ax = gx + devToPx(dev);
          const r = 3 + h.velocity * 5;
          const color = VOICE_COLOR[h.voice];
          const dim = muted[h.voice];
          return (
            <g key={`h${idx}`} opacity={dim ? 0.25 : 1}>
              {/* hollow anchor at grid time */}
              <circle
                cx={gx}
                cy={yc}
                r={4}
                fill="none"
                stroke="rgba(255,255,255,0.45)"
                strokeWidth={1.1}
              />
              {/* connecting line grid → actual */}
              <line
                x1={gx}
                y1={yc}
                x2={ax}
                y2={yc}
                stroke={color}
                strokeWidth={1.4}
                opacity={0.7}
              />
              {/* glowing filled dot at actual onset */}
              <circle
                cx={ax}
                cy={yc}
                r={r}
                fill={color}
                filter="url(#glow637)"
                opacity={0.92}
              />
            </g>
          );
        })}

        {/* ── deviation scale hint at current feel ── */}
        <text
          x={padL}
          y={H - 6}
          className="font-mono"
          fontSize="11"
          fill="rgba(255,255,255,0.55)"
        >
          feel {feel.toFixed(2)} — dots pull off the grid as the pocket opens up
        </text>
      </svg>
    </section>
  );
}
