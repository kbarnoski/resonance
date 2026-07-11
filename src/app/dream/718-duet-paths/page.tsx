"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import {
  fetchPianoBuffer,
  renderFallbackBuffer,
  buildGrainCorpus,
  selectGrain,
  type AudioSourceKind,
  type Grain,
} from "./audio";
import { drawRiver, type RiverNote } from "./renderer";

// ─── Musical constants ───────────────────────────────────────────────────────
// Default key: D Dorian (D E F G A B C) — consonant, modal, jazzy.
const D_DORIAN = [62, 64, 65, 67, 69, 71, 72]; // one octave up from D4
const PHRASE_SILENCE_MS = 750; // silence after >=2 notes -> phrase ends
const IDLE_DEMO_MS = 6000; // no input -> auto demo
const MAX_GRAIN_VOICES = 6; // concurrent shadow grains cap

// computer-keyboard -> scale-degree map (a s d f g h j k l = diatonic run)
const KEY_DEGREE: Record<string, number> = {
  a: 0, s: 1, d: 2, f: 3, g: 4, h: 5, j: 6, k: 7, l: 8,
};
// in-between / passing keys (chromatic-ish color)
const KEY_PASSING: Record<string, number> = {
  w: 0, e: 1, t: 3, y: 4, u: 5, o: 7,
};

type Phase = "intro" | "loading" | "playing";

interface ActiveSource {
  node: AudioBufferSourceNode | OscillatorNode;
  gain: GainNode;
}

export default function DuetPathsPage() {
  const [phase, setPhase] = useState<Phase>("intro");
  const [source, setSource] = useState<AudioSourceKind | null>(null);
  const [midiName, setMidiName] = useState<string | null>(null);
  const [midiSupported, setMidiSupported] = useState<boolean>(true);
  const [grainCount, setGrainCount] = useState(0);
  const [showNotes, setShowNotes] = useState(false);
  const [shadowSpeaking, setShadowSpeaking] = useState(false);

  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  // audio graph
  const ctxRef = useRef<AudioContext | null>(null);
  const masterRef = useRef<GainNode | null>(null);
  const humanBusRef = useRef<GainNode | null>(null); // panned left
  const shadowBusRef = useRef<GainNode | null>(null); // panned right
  const padGainRef = useRef<GainNode | null>(null);

  // corpus
  const bufferRef = useRef<AudioBuffer | null>(null);
  const corpusRef = useRef<Grain[]>([]);
  const sourceKindRef = useRef<AudioSourceKind>("fallback");

  // render notes
  const notesRef = useRef<RiverNote[]>([]);
  const rafRef = useRef<number>(0);
  const boundRef = useRef(0);

  // phrase / turn-taking state
  const heldRef = useRef<Map<number, RiverNote>>(new Map());
  const phraseRef = useRef<number[]>([]); // midi notes in current human phrase
  const phraseVelRef = useRef<number[]>([]);
  const phraseTimesRef = useRef<number[]>([]);
  const silenceTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const idleTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const activeGrainsRef = useRef<ActiveSource[]>([]);
  const lastInputRef = useRef(0);
  const demoTimersRef = useRef<ReturnType<typeof setTimeout>[]>([]);
  const shadowTimersRef = useRef<ReturnType<typeof setTimeout>[]>([]);
  const speakingRef = useRef(false);

  // MIDI
  const midiAccessRef = useRef<MIDIAccess | null>(null);

  // ─── Helpers ───────────────────────────────────────────────────────────────

  const midiToHz = (m: number) => 440 * Math.pow(2, (m - 69) / 12);

  /** Snap a midi value to the nearest D-Dorian scale tone across octaves. */
  const snapToScale = useCallback((m: number): number => {
    const pcs = D_DORIAN.map((n) => n % 12);
    let best = m;
    let bestD = Infinity;
    for (let oct = -2; oct <= 2; oct++) {
      for (const pc of pcs) {
        const cand = pc + 12 * (Math.floor(m / 12) + oct);
        const d = Math.abs(cand - m);
        if (d < bestD) {
          bestD = d;
          best = cand;
        }
      }
    }
    return best;
  }, []);

  // ─── Human voice (warm FM e-piano, panned left) ──────────────────────────────

  const playHuman = useCallback((midi: number, vel: number) => {
    const ctx = ctxRef.current;
    const bus = humanBusRef.current;
    if (!ctx || !bus) return;
    const now = ctx.currentTime;
    const hz = midiToHz(midi);

    // simple 2-op FM
    const carrier = ctx.createOscillator();
    carrier.type = "sine";
    carrier.frequency.value = hz;
    const mod = ctx.createOscillator();
    mod.type = "sine";
    mod.frequency.value = hz * 2.01;
    const modGain = ctx.createGain();
    modGain.gain.value = hz * 1.4 * (0.4 + vel * 0.6);
    mod.connect(modGain);
    modGain.connect(carrier.frequency);

    const g = ctx.createGain();
    const peak = 0.22 * (0.4 + vel * 0.6);
    g.gain.setValueAtTime(0.0001, now);
    g.gain.exponentialRampToValueAtTime(peak, now + 0.008);
    g.gain.exponentialRampToValueAtTime(0.0008, now + 1.4);

    carrier.connect(g);
    g.connect(bus);
    carrier.start(now);
    mod.start(now);
    carrier.stop(now + 1.6);
    mod.stop(now + 1.6);
  }, []);

  // ─── Shadow voice: concatenative grain (or synth fallback) ───────────────────

  const playGrain = useCallback((midi: number, vel: number, at: number) => {
    const ctx = ctxRef.current;
    const bus = shadowBusRef.current;
    if (!ctx || !bus) return;

    // Cap concurrent voices.
    if (activeGrainsRef.current.length >= MAX_GRAIN_VOICES) {
      const oldest = activeGrainsRef.current.shift();
      try { oldest?.node.stop(at + 0.02); } catch { /* already stopped */ }
    }

    const corpus = corpusRef.current;
    const buffer = bufferRef.current;

    if (buffer && corpus.length > 0) {
      // CONCATENATIVE: retrieve closest-pitch grain from Karel's recording.
      const grain = selectGrain(corpus, midi) as Grain;
      const src = ctx.createBufferSource();
      src.buffer = buffer;
      // fine-tune pitch with playbackRate nudge
      const ratio = midiToHz(midi) / grain.hz;
      src.playbackRate.value = Math.max(0.5, Math.min(2.0, ratio));

      const g = ctx.createGain();
      const peak = 0.16 * (0.5 + vel * 0.5);
      const dur = grain.duration;
      g.gain.setValueAtTime(0.0001, at);
      g.gain.linearRampToValueAtTime(peak, at + 0.02);
      g.gain.setValueAtTime(peak, at + dur * 0.6);
      g.gain.exponentialRampToValueAtTime(0.0008, at + dur);

      src.connect(g);
      g.connect(bus);
      src.start(at, grain.offset, dur + 0.05);
      src.stop(at + dur + 0.1);
      const entry: ActiveSource = { node: src, gain: g };
      activeGrainsRef.current.push(entry);
      src.onended = () => {
        activeGrainsRef.current = activeGrainsRef.current.filter((e) => e !== entry);
      };
    } else {
      // FALLBACK: soft synthesized piano-ish voice.
      const hz = midiToHz(midi);
      const osc = ctx.createOscillator();
      osc.type = "triangle";
      osc.frequency.value = hz;
      const osc2 = ctx.createOscillator();
      osc2.type = "sine";
      osc2.frequency.value = hz * 2;
      const o2g = ctx.createGain();
      o2g.gain.value = 0.3;
      osc2.connect(o2g);

      const g = ctx.createGain();
      const peak = 0.13 * (0.5 + vel * 0.5);
      g.gain.setValueAtTime(0.0001, at);
      g.gain.exponentialRampToValueAtTime(peak, at + 0.01);
      g.gain.exponentialRampToValueAtTime(0.0008, at + 0.5);
      osc.connect(g);
      o2g.connect(g);
      g.connect(bus);
      osc.start(at);
      osc2.start(at);
      osc.stop(at + 0.55);
      osc2.stop(at + 0.55);
      const entry: ActiveSource = { node: osc, gain: g };
      activeGrainsRef.current.push(entry);
      osc.onended = () => {
        activeGrainsRef.current = activeGrainsRef.current.filter((e) => e !== entry);
      };
    }
  }, []);

  /** Yield the floor: fade/stop any scheduled shadow grains. */
  const stopShadow = useCallback(() => {
    const ctx = ctxRef.current;
    shadowTimersRef.current.forEach((t) => clearTimeout(t));
    shadowTimersRef.current = [];
    if (ctx) {
      const now = ctx.currentTime;
      for (const e of activeGrainsRef.current) {
        try {
          e.gain.gain.cancelScheduledValues(now);
          e.gain.gain.setValueAtTime(e.gain.gain.value, now);
          e.gain.gain.linearRampToValueAtTime(0.0001, now + 0.06);
          e.node.stop(now + 0.08);
        } catch { /* already stopped */ }
      }
    }
    activeGrainsRef.current = [];
    speakingRef.current = false;
    setShadowSpeaking(false);
  }, []);

  // ─── The concatenative ANSWER ────────────────────────────────────────────────
  // Derive an answering line from the human phrase's register/density/contour —
  // a complementary reply, NOT an echo. Then realize each note as a grain.
  const answerPhrase = useCallback(() => {
    const ctx = ctxRef.current;
    if (!ctx) return;
    const phrase = phraseRef.current;
    const times = phraseTimesRef.current;
    if (phrase.length < 2) return;

    // Analyze the human phrase.
    const avgMidi = phrase.reduce((a, b) => a + b, 0) / phrase.length;
    const lastMidi = phrase[phrase.length - 1];
    const span = times[times.length - 1] - times[0];
    const density = Math.max(0.12, Math.min(0.5, span / Math.max(1, phrase.length - 1)));
    // contour direction of human's last gesture
    const rising = phrase[phrase.length - 1] >= phrase[0];

    // Build a complementary answer: opposite register pull + opposite contour,
    // landing on a consonant tone. Length echoes the human's note count (~4).
    const answerLen = Math.max(3, Math.min(6, phrase.length));
    // complementary register: if they played high, answer lower & vice versa.
    const center = avgMidi > 70 ? avgMidi - 9 : avgMidi + 7;
    const answer: number[] = [];
    for (let i = 0; i < answerLen; i++) {
      const t = i / (answerLen - 1);
      // opposite contour, gentle arc, resolving toward the tonic D
      const arc = rising ? -Math.sin(t * Math.PI) : Math.sin(t * Math.PI);
      let m = center + arc * 7 + (Math.random() - 0.5) * 3;
      // resolve final note toward a strong scale tone near the human's last note
      if (i === answerLen - 1) m = snapToScale(lastMidi > avgMidi ? center - 5 : center + 4);
      answer.push(snapToScale(m));
    }

    // Schedule the grains, matching the human's density. Start in the gap.
    speakingRef.current = true;
    setShadowSpeaking(true);
    const startAt = ctx.currentTime + 0.12;
    answer.forEach((m, i) => {
      const at = startAt + i * density;
      const delayMs = (at - ctx.currentTime) * 1000;
      const vel = 0.5 + Math.random() * 0.3;
      const tm = setTimeout(() => {
        if (!speakingRef.current) return;
        playGrain(m, vel, ctxRef.current!.currentTime + 0.02);
        // mirror into the river as a shadow note
        notesRef.current.push({
          midi: m,
          startT: ctxRef.current!.currentTime + 0.02,
          durT: 0.28,
          voice: "shadow",
          vel,
          live: false,
        });
      }, Math.max(0, delayMs));
      shadowTimersRef.current.push(tm);
    });
    // clear "speaking" after the answer completes
    const endMs = answerLen * density * 1000 + 400;
    const endT = setTimeout(() => {
      speakingRef.current = false;
      setShadowSpeaking(false);
    }, endMs);
    shadowTimersRef.current.push(endT);

    boundRef.current = 1;
  }, [playGrain, snapToScale]);

  // ─── Phrase lifecycle ────────────────────────────────────────────────────────

  const onPhraseSilence = useCallback(() => {
    answerPhrase();
    phraseRef.current = [];
    phraseVelRef.current = [];
    phraseTimesRef.current = [];
  }, [answerPhrase]);

  /** Register a human note-on: play it, feed the phrase, manage turn-taking. */
  const noteOn = useCallback((midi: number, vel: number) => {
    const ctx = ctxRef.current;
    if (!ctx) return;
    lastInputRef.current = performance.now();

    // Human takes the floor: cancel demo + duck shadow if it's answering.
    demoTimersRef.current.forEach((t) => clearTimeout(t));
    demoTimersRef.current = [];
    if (speakingRef.current) stopShadow();

    playHuman(midi, vel);

    const note: RiverNote = {
      midi,
      startT: ctx.currentTime,
      durT: 0.2,
      voice: "human",
      vel,
      live: true,
    };
    heldRef.current.set(midi, note);
    notesRef.current.push(note);

    phraseRef.current.push(midi);
    phraseVelRef.current.push(vel);
    phraseTimesRef.current.push(ctx.currentTime);

    if (silenceTimerRef.current) clearTimeout(silenceTimerRef.current);
    silenceTimerRef.current = setTimeout(onPhraseSilence, PHRASE_SILENCE_MS);

    if (idleTimerRef.current) clearTimeout(idleTimerRef.current);
    idleTimerRef.current = setTimeout(() => runDemo(), IDLE_DEMO_MS);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [playHuman, stopShadow, onPhraseSilence]);

  const noteOff = useCallback((midi: number) => {
    const ctx = ctxRef.current;
    const note = heldRef.current.get(midi);
    if (note && ctx) {
      note.durT = Math.max(0.15, ctx.currentTime - note.startT);
      note.live = false;
      heldRef.current.delete(midi);
    }
  }, []);

  // ─── Idle auto-demo ──────────────────────────────────────────────────────────
  // Synthesize a short human-ish phrase (heard + drawn), then let the grain
  // shadow answer. Loops while idle. Real input cancels it.
  const runDemo = useCallback(() => {
    const ctx = ctxRef.current;
    if (!ctx) return;
    if (performance.now() - lastInputRef.current < IDLE_DEMO_MS - 200) {
      // recent input; reschedule instead
      idleTimerRef.current = setTimeout(() => runDemo(), IDLE_DEMO_MS);
      return;
    }
    demoTimersRef.current.forEach((t) => clearTimeout(t));
    demoTimersRef.current = [];

    // Pick a small motif in D Dorian.
    const start = D_DORIAN[Math.floor(Math.random() * 3)];
    const steps = [0, 2, 3, 1];
    const motif = steps.map((s) => snapToScale(start + s * 2));
    const noteGap = 0.34;

    // play motif as "human" (left), feeding the phrase machinery so the shadow
    // answers naturally.
    phraseRef.current = [];
    phraseVelRef.current = [];
    phraseTimesRef.current = [];

    motif.forEach((m, i) => {
      const tm = setTimeout(() => {
        const ctx2 = ctxRef.current;
        if (!ctx2) return;
        const vel = 0.5 + Math.random() * 0.25;
        playHuman(m, vel);
        notesRef.current.push({
          midi: m,
          startT: ctx2.currentTime,
          durT: noteGap * 0.8,
          voice: "human",
          vel,
          live: false,
        });
        phraseRef.current.push(m);
        phraseVelRef.current.push(vel);
        phraseTimesRef.current.push(ctx2.currentTime);
      }, i * noteGap * 1000);
      demoTimersRef.current.push(tm);
    });

    // after the motif, let the shadow answer, then loop.
    const answerAt = motif.length * noteGap * 1000 + 250;
    const at = setTimeout(() => {
      answerPhrase();
      phraseRef.current = [];
      phraseTimesRef.current = [];
      phraseVelRef.current = [];
    }, answerAt);
    demoTimersRef.current.push(at);

    const loopAt = setTimeout(() => runDemo(), answerAt + 2600);
    demoTimersRef.current.push(loopAt);
  }, [playHuman, answerPhrase, snapToScale]);

  // ─── Input: Web MIDI ─────────────────────────────────────────────────────────

  const onMidiMessage = useCallback((e: MIDIMessageEvent) => {
    const data = e.data;
    if (!data) return;
    const status = data[0] & 0xf0;
    const d1 = data[1];
    const d2 = data[2];
    if (status === 0x90 && d2 > 0) noteOn(d1, d2 / 127);
    else if (status === 0x80 || (status === 0x90 && d2 === 0)) noteOff(d1);
  }, [noteOn, noteOff]);

  const wireMidi = useCallback((access: MIDIAccess) => {
    let name: string | null = null;
    access.inputs.forEach((input) => {
      input.onmidimessage = onMidiMessage;
      if (!name) name = input.name ?? "MIDI device";
    });
    setMidiName(name);
  }, [onMidiMessage]);

  // ─── Begin: create + resume AudioContext inside the gesture ───────────────────

  const begin = useCallback(async () => {
    setPhase("loading");

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const Ctor: typeof AudioContext = window.AudioContext || (window as any).webkitAudioContext;
    const ctx = new Ctor();
    await ctx.resume();
    ctxRef.current = ctx;

    // Master chain -> limiter -> destination.
    const master = ctx.createGain();
    master.gain.value = 0.5;
    const limiter = ctx.createDynamicsCompressor();
    limiter.threshold.value = -3;
    limiter.knee.value = 0;
    limiter.ratio.value = 20;
    limiter.attack.value = 0.003;
    limiter.release.value = 0.25;
    master.connect(limiter);
    limiter.connect(ctx.destination);
    masterRef.current = master;

    // Human bus (panned left).
    const humanPan = ctx.createStereoPanner();
    humanPan.pan.value = -0.55;
    const humanBus = ctx.createGain();
    humanBus.gain.value = 1;
    humanBus.connect(humanPan);
    humanPan.connect(master);
    humanBusRef.current = humanBus;

    // Shadow bus (panned right).
    const shadowPan = ctx.createStereoPanner();
    shadowPan.pan.value = 0.55;
    const shadowBus = ctx.createGain();
    shadowBus.gain.value = 1;
    shadowBus.connect(shadowPan);
    shadowPan.connect(master);
    shadowBusRef.current = shadowBus;

    // Soft sustained binding pad (centered, very low).
    const pad = ctx.createGain();
    pad.gain.value = 0.0;
    pad.connect(master);
    padGainRef.current = pad;
    [62 - 12, 69 - 12].forEach((m) => {
      const o = ctx.createOscillator();
      o.type = "sine";
      o.frequency.value = midiToHz(m);
      const og = ctx.createGain();
      og.gain.value = 0.5;
      o.connect(og);
      og.connect(pad);
      o.start();
    });
    pad.gain.linearRampToValueAtTime(0.025, ctx.currentTime + 3);

    // Load corpus: try Karel's recording, else fallback.
    let buffer = await fetchPianoBuffer(ctx);
    let kind: AudioSourceKind = "piano";
    if (!buffer) {
      buffer = await renderFallbackBuffer(ctx.sampleRate);
      kind = "fallback";
    }
    bufferRef.current = buffer;
    sourceKindRef.current = kind;
    const corpus = buildGrainCorpus(buffer);
    corpusRef.current = corpus;
    setGrainCount(corpus.length);
    setSource(kind);

    // Try Web MIDI.
    try {
      if (navigator.requestMIDIAccess) {
        const access = await navigator.requestMIDIAccess();
        midiAccessRef.current = access;
        wireMidi(access);
        access.onstatechange = () => wireMidi(access);
      } else {
        setMidiSupported(false);
      }
    } catch {
      setMidiSupported(false);
    }

    setPhase("playing");
    lastInputRef.current = performance.now();

    // Kick the render loop.
    const loop = () => {
      const c = canvasRef.current;
      const ctx2d = c?.getContext("2d");
      const actx = ctxRef.current;
      if (c && ctx2d && actx) {
        boundRef.current *= 0.97; // decay glow
        drawRiver(ctx2d, notesRef.current, actx.currentTime, c.width, c.height, boundRef.current);
        // prune old notes
        const cutoff = actx.currentTime - 8;
        if (notesRef.current.length > 400) {
          notesRef.current = notesRef.current.filter((n) => n.startT + n.durT > cutoff);
        }
      }
      rafRef.current = requestAnimationFrame(loop);
    };
    rafRef.current = requestAnimationFrame(loop);

    // Start idle demo immediately on load (alive without interaction).
    idleTimerRef.current = setTimeout(() => runDemo(), 900);
  }, [wireMidi, runDemo]);

  // ─── Canvas sizing ───────────────────────────────────────────────────────────
  useEffect(() => {
    const resize = () => {
      const c = canvasRef.current;
      if (!c) return;
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      const rect = c.getBoundingClientRect();
      c.width = Math.floor(rect.width * dpr);
      c.height = Math.floor(rect.height * dpr);
    };
    resize();
    window.addEventListener("resize", resize);
    return () => window.removeEventListener("resize", resize);
  }, [phase]);

  // ─── Computer keyboard ───────────────────────────────────────────────────────
  const octaveRef = useRef(0);
  useEffect(() => {
    if (phase !== "playing") return;
    const downKeys = new Set<string>();

    const keyToMidi = (k: string): number | null => {
      if (k in KEY_DEGREE) {
        const deg = KEY_DEGREE[k];
        const oct = Math.floor(deg / 7);
        const idx = ((deg % 7) + 7) % 7;
        return D_DORIAN[idx] + 12 * oct + 12 * octaveRef.current;
      }
      if (k in KEY_PASSING) {
        return D_DORIAN[KEY_PASSING[k]] + 1 + 12 * octaveRef.current;
      }
      return null;
    };

    const onDown = (e: KeyboardEvent) => {
      if (e.repeat) return;
      const k = e.key.toLowerCase();
      if (k === "z") { octaveRef.current = Math.max(-2, octaveRef.current - 1); return; }
      if (k === "x") { octaveRef.current = Math.min(2, octaveRef.current + 1); return; }
      const m = keyToMidi(k);
      if (m == null) return;
      if (downKeys.has(k)) return;
      downKeys.add(k);
      e.preventDefault();
      noteOn(m, 0.7);
    };
    const onUp = (e: KeyboardEvent) => {
      const k = e.key.toLowerCase();
      const m = keyToMidi(k);
      downKeys.delete(k);
      if (m != null) noteOff(m);
    };
    window.addEventListener("keydown", onDown);
    window.addEventListener("keyup", onUp);
    return () => {
      window.removeEventListener("keydown", onDown);
      window.removeEventListener("keyup", onUp);
    };
  }, [phase, noteOn, noteOff]);

  // ─── Teardown ────────────────────────────────────────────────────────────────
  useEffect(() => {
    return () => {
      cancelAnimationFrame(rafRef.current);
      [silenceTimerRef, idleTimerRef].forEach((r) => {
        if (r.current) clearTimeout(r.current);
      });
      demoTimersRef.current.forEach((t) => clearTimeout(t));
      shadowTimersRef.current.forEach((t) => clearTimeout(t));
      activeGrainsRef.current.forEach((e) => { try { e.node.stop(); } catch { /* ok */ } });
      const access = midiAccessRef.current;
      if (access) {
        access.inputs.forEach((i) => { i.onmidimessage = null; });
        access.onstatechange = null;
      }
      const ctx = ctxRef.current;
      if (ctx && ctx.state !== "closed") ctx.close().catch(() => {});
    };
  }, []);

  // ─── On-screen mini keyboard ─────────────────────────────────────────────────
  const KEYS = D_DORIAN.concat([74, 76]); // D E F G A B C + D E (next oct)
  const KEY_LABELS = ["D", "E", "F", "G", "A", "B", "C", "D", "E"];

  // ─── Render ──────────────────────────────────────────────────────────────────
  return (
    <main className="relative min-h-screen w-full overflow-hidden bg-[#06060c] text-foreground">
      <canvas
        ref={canvasRef}
        className="absolute inset-0 h-full w-full"
        style={{ touchAction: "none" }}
      />

      {/* Header */}
      <div className="pointer-events-none absolute inset-x-0 top-0 z-10 p-5 sm:p-8">
        <h1 className="font-semibold text-2xl text-foreground sm:text-3xl">
          Duet with the Paths
        </h1>
        <p className="mt-2 max-w-xl text-base text-foreground">
          Trade fours with a shadow that answers using grains pulled from
          Karel&apos;s real solo-piano recording.
        </p>
      </div>

      {/* Design notes link */}
      <Link
        href="#notes"
        onClick={(e) => { e.preventDefault(); setShowNotes((s) => !s); }}
        className="pointer-events-auto absolute right-4 top-4 z-20 rounded-full border border-border bg-black/50 px-4 py-2.5 text-sm text-violet-300 backdrop-blur hover:bg-accent"
      >
        Read the design notes
      </Link>

      {/* Intro / Begin */}
      {phase !== "playing" && (
        <div className="absolute inset-0 z-30 flex items-center justify-center bg-black/55 backdrop-blur-sm">
          <div className="mx-4 max-w-md rounded-2xl border border-border bg-[#0c0c16]/90 p-7 text-center">
            <p className="text-base text-foreground">
              Play a short phrase, then pause. The shadow answers with grains of
              Karel&apos;s own piano — a concatenative reply, not an echo.
            </p>
            <button
              onClick={begin}
              disabled={phase === "loading"}
              className="mt-6 w-full rounded-xl bg-violet-500/90 px-4 py-3 text-base font-medium text-foreground hover:bg-violet-400 disabled:opacity-60"
            >
              {phase === "loading" ? "Loading his piano…" : "Begin"}
            </button>
            <p className="mt-4 text-sm text-muted-foreground">
              Use a MIDI keyboard, your computer keys (a s d f g h j k l), or tap
              the keys below.
            </p>
          </div>
        </div>
      )}

      {/* Status badges */}
      {phase === "playing" && (
        <div className="pointer-events-none absolute left-5 top-28 z-10 flex flex-col gap-2 text-sm sm:left-8">
          {source === "piano" && (
            <span className="w-fit rounded-full bg-violet-500/15 px-3 py-1.5 font-mono text-violet-300/95">
              Karel&apos;s piano 🎹 · {grainCount} grains
            </span>
          )}
          {source === "fallback" && (
            <span className="w-fit rounded-full bg-violet-500/15 px-3 py-1.5 font-mono text-violet-300/95">
              synth fallback · {grainCount} grains (offline)
            </span>
          )}
          {midiName ? (
            <span className="w-fit rounded-full bg-violet-500/15 px-3 py-1.5 font-mono text-violet-300/95">
              MIDI: {midiName}
            </span>
          ) : (
            <span className="w-fit rounded-full bg-violet-500/15 px-3 py-1.5 font-mono text-violet-300/95">
              {midiSupported ? "No MIDI device — use your keyboard or tap the keys" : "No Web MIDI — use your keyboard or tap the keys"}
            </span>
          )}
          {shadowSpeaking && (
            <span className="w-fit rounded-full bg-violet-500/15 px-3 py-1.5 font-mono text-violet-300">
              shadow answering…
            </span>
          )}
        </div>
      )}

      {/* On-screen mini keyboard */}
      {phase === "playing" && (
        <div className="absolute inset-x-0 bottom-16 z-10 flex justify-center px-4">
          <div className="flex gap-1.5 rounded-2xl border border-border bg-black/50 p-2 backdrop-blur">
            {KEYS.map((m, i) => (
              <button
                key={i}
                onPointerDown={(e) => { e.preventDefault(); noteOn(m, 0.7); }}
                onPointerUp={() => noteOff(m)}
                onPointerLeave={() => noteOff(m)}
                className="flex h-16 min-w-[44px] items-end justify-center rounded-lg border border-border bg-gradient-to-b from-violet-200/10 to-violet-300/10 px-2 pb-2 text-sm text-muted-foreground hover:from-violet-200/25 hover:to-violet-300/25 active:from-violet-200/40"
              >
                {KEY_LABELS[i]}
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Design notes panel */}
      {showNotes && (
        <div className="absolute inset-0 z-40 flex items-center justify-center bg-black/70 p-4 backdrop-blur" onClick={() => setShowNotes(false)}>
          <div className="max-h-[80vh] max-w-lg overflow-y-auto rounded-2xl border border-border bg-[#0c0c16] p-6 text-sm leading-relaxed text-foreground" onClick={(e) => e.stopPropagation()}>
            <h2 className="font-semibold text-xl text-foreground">Design notes</h2>
            <p className="mt-3">
              This is the <span className="text-violet-300">concatenative</span> duet
              partner. On load it fetches Karel&apos;s recording, slices it into a
              corpus of ~240ms grains, and tags each with a rough pitch
              (autocorrelation), loudness, and brightness.
            </p>
            <p className="mt-3">
              When your phrase ends (~750ms of silence after 2+ notes), it builds
              an <em>answering line</em> — complementary register and contour,
              landing consonant in D&nbsp;Dorian — then realizes each note by
              <span className="text-violet-300/95"> retrieving the closest-pitch grain</span> from
              his piano and nudging <code>playbackRate</code> to fine-tune. So the
              reply is made of his real sound, not a synth approximation.
            </p>
            <p className="mt-3 text-muted-foreground">
              References: MACataRT (arXiv:2502.00023, Feb 2025, concatenative
              co-improvisation) and Diemo Schwarz&apos;s CataRT.
            </p>
            <p className="mt-3 text-violet-300/95">
              Offline / no network: it falls back to a synthesized piano corpus so
              the piece stays fully alive (amber badge). Provenance is always shown.
            </p>
            <button onClick={() => setShowNotes(false)} className="mt-5 rounded-lg bg-muted px-4 py-2.5 text-foreground hover:bg-accent">
              Close
            </button>
          </div>
        </div>
      )}
    </main>
  );
}
