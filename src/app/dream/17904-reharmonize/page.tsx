"use client";

// ─────────────────────────────────────────────────────────────────────────────
// 17904 · Reharmonize — play chords on Karel's OWN recorded piano, re-voicing one
// of his real takes into a live choir of itself.
//
//   ONE QUESTION
//   What if you could play chords on your OWN recorded piano — re-harmonizing one
//   of Karel's real takes into a live choir of itself?
//
//   THE VERB: harmonize. A touch / QWERTY / Web-MIDI keyboard lets the visitor
//   play notes and chords. Each held key spawns a TRANSPOSED, SUSTAINED copy of
//   Karel's own decoded recording — playbackRate = 2^(semis/12) — so a C-E-G
//   triad stacks three pitch-shifted versions of HIS take into a live choir of
//   itself. This is a harmonizer / re-voicing engine (transpose + stack), NOT
//   grain-scrubbing: each voice loops a musical WINDOW (~5s) of the take, so it
//   reads as a sustained reed/choir, never a granular smear.
//
//   AUDIO   His REAL recorded catalog is the only sound source (Rule: never a
//           synth / oscillator / noise generator). On Begin the take is decoded
//           once; a soft looping BED voice (rate 1.0, low gain) always plays so
//           the screen is alive before a key is touched. Each key = a new looping
//           AudioBufferSourceNode of the SAME buffer, transposed. Everything runs
//           through the shared ear-safety master (never ctx.destination). A
//           synthetic-IR convolution reverb sits in as an EFFECT (an IR is not a
//           "source"). Polyphony capped at 8, oldest stolen.
//
//   INPUT   PRIMARY: an on-screen scale keyboard playable by touch/click AND
//           QWERTY (z x c v b n m a s d g h j k l → scale degrees; f/i are left
//           free for the fullscreen/info HUD). ENHANCE: Web MIDI — a plugged-in
//           keyboard auto-connects (noteon/noteoff + velocity). Absence is fine.
//
//   VISUAL  Canvas2D, WARM ONLY (amber / gold / candle on near-black — a hard
//           no-violet cycle). Each sounding voice is a warm beam: x by pitch-
//           class, height by pitch, brightness by its live gain; a slow breathing
//           glow driven by the safe-master analyser keeps the idle bed alive.
//
//   REFERENCES (see README): Antares Harmony Engine (real-time multi-voice
//   harmonizer) and Web Harmonium (browser recording-as-instrument via real-time
//   transposition + reed stacking), deepened onto Karel's own recorded piano;
//   and arXiv 2604.23583 (2026, "Two Years of Performance with Intelligent
//   Musical Instruments") for the instrument-as-relationship framing.
// ─────────────────────────────────────────────────────────────────────────────

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  COLLECTIONS,
  WELCOME_HOME_TRACKS,
  loadRealTrackBuffer,
} from "../_shared/welcomeHome";
import { createSafeMaster, type SafeMaster } from "../_shared/visionary/safeMaster";
import { useImmersive, ImmersiveHud } from "../_shared/immersive";
import { PrototypeNav } from "../_shared/prototype-nav";

// ── minimal local Web MIDI types (do NOT rely on @types/webmidi) ─────────────
interface MidiMessageEvent {
  data: Uint8Array;
}
interface MidiInputLike {
  name?: string | null;
  onmidimessage: ((e: MidiMessageEvent) => void) | null;
}
interface MidiInputsMap {
  forEach(cb: (i: MidiInputLike) => void): void;
}
interface MidiAccessLike {
  inputs: MidiInputsMap;
  onstatechange: ((e: unknown) => void) | null;
}
type RequestMidi = (opts?: { sysex?: boolean }) => Promise<MidiAccessLike>;

// ── musical setup ────────────────────────────────────────────────────────────
const ROOT_MIDI = 60; // key at offset 0 plays the take at its original pitch
const MIDI_ROOT = 60; // incoming MIDI notes measured against middle C
const MAX_VOICES = 8;
const RANGE = 12; // keep transposition within ±12 semitones

// f / i are reserved by the fullscreen/info HUD, so they're left out here.
const KEY_LETTERS = [
  "z", "x", "c", "v", "b", "n", "m",
  "a", "s", "d", "g", "h", "j", "k", "l",
];

interface ScaleDef {
  id: string;
  label: string;
  pcs: number[];
}
const SCALES: ScaleDef[] = [
  { id: "major", label: "Major", pcs: [0, 2, 4, 5, 7, 9, 11] },
  { id: "minor", label: "Minor", pcs: [0, 2, 3, 5, 7, 8, 10] },
  { id: "penta", label: "Pentatonic", pcs: [0, 3, 5, 7, 10] },
];

interface KeyDef {
  index: number;
  semis: number; // relative to root (0 = original pitch)
  pc: number; // pitch-class 0..11 for colour + x position
  letter: string;
}

// Build up to 15 scale keys spanning about ±1 octave, clamped to ±RANGE.
function makeKeys(pcs: number[]): KeyDef[] {
  const raw: number[] = [];
  for (let oct = -1; oct <= 1; oct++) {
    for (const pc of pcs) {
      const o = oct * 12 + pc;
      if (o >= -RANGE && o <= RANGE) raw.push(o);
    }
  }
  const uniq = [...new Set(raw)].sort((a, b) => a - b);
  const MAXK = KEY_LETTERS.length;
  const windowed =
    uniq.length <= MAXK
      ? uniq
      : uniq.slice(
          Math.floor((uniq.length - MAXK) / 2),
          Math.floor((uniq.length - MAXK) / 2) + MAXK,
        );
  return windowed.map((semis, index) => ({
    index,
    semis,
    pc: (((ROOT_MIDI + semis) % 12) + 12) % 12,
    letter: KEY_LETTERS[index] ?? "",
  }));
}

// Warm-only colour from pitch-class: hue 22–52 (deep orange → gold). No violet.
function warm(pc: number, light: number, alpha: number): string {
  const hue = 22 + (pc / 11) * 30;
  return `hsla(${hue}, 82%, ${light}%, ${alpha})`;
}

const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v));

// A live sounding voice = one transposed copy of the take.
interface Voice {
  key: string;
  semis: number;
  pc: number;
  src: AudioBufferSourceNode;
  gain: GainNode;
  target: number;
  stopTimer: number | null;
}

export default function ReharmonizePage() {
  const { immersive, toggle } = useImmersive();

  const [status, setStatus] = useState<"idle" | "loading" | "playing" | "error">("idle");
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [trackId, setTrackId] = useState<string>(WELCOME_HOME_TRACKS[1].id); // "Bath"
  const [title, setTitle] = useState<string>(WELCOME_HOME_TRACKS[1].title);
  const [scaleId, setScaleId] = useState<string>("major");
  const [sustain, setSustain] = useState<boolean>(false);
  const [litKeys, setLitKeys] = useState<Set<number>>(new Set());
  const [voiceCount, setVoiceCount] = useState<number>(0);
  const [midiSupported, setMidiSupported] = useState<boolean>(true);
  const [midiName, setMidiName] = useState<string | null>(null);
  const [showNotes, setShowNotes] = useState<boolean>(false);

  const keys = useMemo(
    () => makeKeys(SCALES.find((s) => s.id === scaleId)?.pcs ?? SCALES[0].pcs),
    [scaleId],
  );

  // ── audio graph (refs — never render deps) ──
  const ctxRef = useRef<AudioContext | null>(null);
  const masterRef = useRef<SafeMaster | null>(null);
  const bufferRef = useRef<AudioBuffer | null>(null);
  const busRef = useRef<GainNode | null>(null); // all played voices land here
  const wetRef = useRef<GainNode | null>(null);
  const convolverRef = useRef<ConvolverNode | null>(null);
  const bedSrcRef = useRef<AudioBufferSourceNode | null>(null);
  const bedGainRef = useRef<GainNode | null>(null);
  const windowRef = useRef<{ start: number; end: number }>({ start: 0, end: 5 });

  const voicesRef = useRef<Map<string, Voice>>(new Map());
  const orderRef = useRef<string[]>([]);

  const rafRef = useRef<number | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  // live-read refs so the input handlers can stay stable
  const sustainRef = useRef<boolean>(sustain);
  const keysRef = useRef<KeyDef[]>(keys);
  const statusRef = useRef<typeof status>(status);
  const midiAccessRef = useRef<MidiAccessLike | null>(null);
  useEffect(() => void (sustainRef.current = sustain), [sustain]);
  useEffect(() => void (keysRef.current = keys), [keys]);
  useEffect(() => void (statusRef.current = status), [status]);

  const titleFor = useCallback((id: string) => {
    for (const c of COLLECTIONS) {
      const t = c.tracks.find((x) => x.id === id);
      if (t) return t.title;
    }
    return "Welcome Home";
  }, []);

  // reflect on-screen key highlight + voice count from the live voice map
  const syncDisplay = useCallback(() => {
    const lit = new Set<number>();
    for (const key of voicesRef.current.keys()) {
      if (key.startsWith("k")) lit.add(parseInt(key.slice(1), 10));
    }
    setLitKeys(lit);
    setVoiceCount(voicesRef.current.size);
  }, []);

  // ── release one voice: fade then stop ──
  const stopKey = useCallback((voiceKey: string) => {
    const ctx = ctxRef.current;
    const v = voicesRef.current.get(voiceKey);
    if (!ctx || !v) return;
    voicesRef.current.delete(voiceKey);
    orderRef.current = orderRef.current.filter((k) => k !== voiceKey);
    try {
      v.gain.gain.cancelScheduledValues(ctx.currentTime);
      v.gain.gain.setTargetAtTime(0, ctx.currentTime, 0.22);
    } catch {
      /* ctx closing */
    }
    if (v.stopTimer !== null) window.clearTimeout(v.stopTimer);
    v.stopTimer = window.setTimeout(() => {
      try {
        v.src.stop();
      } catch {
        /* already stopped */
      }
      try {
        v.src.disconnect();
        v.gain.disconnect();
      } catch {
        /* noop */
      }
    }, 950);
    syncDisplay();
  }, [syncDisplay]);

  // ── spawn a transposed, sustained copy of the take ──
  const spawnVoice = useCallback(
    (voiceKey: string, semis: number, pc: number, velocity: number) => {
      const ctx = ctxRef.current;
      const buffer = bufferRef.current;
      const bus = busRef.current;
      if (!ctx || !buffer || !bus) return;

      // sustain acts as a hold-toggle: a lit key pressed again lets it go.
      if (voicesRef.current.has(voiceKey)) {
        if (sustainRef.current) {
          stopKey(voiceKey);
          return;
        }
        stopKey(voiceKey); // retrigger otherwise
      }

      // steal the oldest voice if we're at the polyphony ceiling
      while (orderRef.current.length >= MAX_VOICES) {
        const oldest = orderRef.current[0];
        if (!oldest) break;
        stopKey(oldest);
      }

      const win = windowRef.current;
      const src = ctx.createBufferSource();
      src.buffer = buffer;
      src.loop = true;
      src.loopStart = win.start;
      src.loopEnd = win.end;
      src.playbackRate.value = Math.pow(2, clamp(semis, -RANGE, RANGE) / 12);

      const g = ctx.createGain();
      g.gain.value = 0.0001;
      src.connect(g);
      g.connect(bus);

      // start at a random point inside the loop window so stacked copies of the
      // SAME recording decorrelate into a choir instead of a flanged unison.
      const offset = win.start + Math.random() * Math.max(0.1, win.end - win.start);
      try {
        src.start(0, offset);
      } catch {
        return;
      }
      const target = 0.1 + clamp(velocity, 0, 1) * 0.2;
      g.gain.setTargetAtTime(target, ctx.currentTime, 0.11);

      voicesRef.current.set(voiceKey, {
        key: voiceKey,
        semis,
        pc,
        src,
        gain: g,
        target,
        stopTimer: null,
      });
      orderRef.current.push(voiceKey);
      syncDisplay();
    },
    [stopKey, syncDisplay],
  );

  // ── stop everything (voices + bed) ──
  const stopAll = useCallback(() => {
    for (const key of [...voicesRef.current.keys()]) stopKey(key);
    const bed = bedSrcRef.current;
    if (bed) {
      try {
        bed.stop();
        bed.disconnect();
      } catch {
        /* noop */
      }
      bedSrcRef.current = null;
    }
    setStatus((s) => (s === "error" ? s : "idle"));
    setVoiceCount(0);
    setLitKeys(new Set());
  }, [stopKey]);

  // ── make a synthetic-IR reverb (an effect, never a source) ──
  const makeReverb = useCallback((ctx: AudioContext): ConvolverNode => {
    const seconds = 2.6;
    const len = Math.floor(ctx.sampleRate * seconds);
    const ir = ctx.createBuffer(2, len, ctx.sampleRate);
    for (let ch = 0; ch < 2; ch++) {
      const data = ir.getChannelData(ch);
      for (let i = 0; i < len; i++) {
        const t = i / len;
        data[i] = (Math.random() * 2 - 1) * Math.pow(1 - t, 2.8);
      }
    }
    const conv = ctx.createConvolver();
    conv.buffer = ir;
    return conv;
  }, []);

  // ── Begin: decode the take, wire the bus + reverb, start the bed ──
  const begin = useCallback(async () => {
    if (statusRef.current === "loading") return;
    setStatus("loading");
    setErrorMsg(null);
    try {
      let ctx = ctxRef.current;
      if (!ctx || ctx.state === "closed") {
        ctx = new AudioContext();
        ctxRef.current = ctx;
      }
      if (ctx.state === "suspended") await ctx.resume();

      if (!masterRef.current) masterRef.current = createSafeMaster(ctx);
      const master = masterRef.current;

      // (re)build the played-voices bus + parallel reverb send
      for (const key of [...voicesRef.current.keys()]) stopKey(key);
      if (bedSrcRef.current) {
        try {
          bedSrcRef.current.stop();
          bedSrcRef.current.disconnect();
        } catch {
          /* noop */
        }
        bedSrcRef.current = null;
      }
      if (!busRef.current) {
        const bus = ctx.createGain();
        bus.gain.value = 1;
        const conv = makeReverb(ctx);
        const wet = ctx.createGain();
        wet.gain.value = 0.34;
        bus.connect(master.input); // dry
        bus.connect(conv);
        conv.connect(wet);
        wet.connect(master.input); // wet
        busRef.current = bus;
        convolverRef.current = conv;
        wetRef.current = wet;
      }

      const { buffer, title: loaded } = await loadRealTrackBuffer(ctx, trackId);
      bufferRef.current = buffer;
      setTitle(loaded);

      // choose a musical loop window (~5s) from the body of the take
      const dur = buffer.duration;
      const winLen = clamp(dur * 0.35, 4, 7);
      const start = clamp(dur * 0.25, 0, Math.max(0, dur - winLen - 0.1));
      windowRef.current = { start, end: start + winLen };

      // soft looping BED voice of the take — always sounding, rate 1.0, low gain
      const bedSrc = ctx.createBufferSource();
      bedSrc.buffer = buffer;
      bedSrc.loop = true;
      bedSrc.loopStart = start;
      bedSrc.loopEnd = start + winLen;
      const bedGain = ctx.createGain();
      bedGain.gain.value = 0.0001;
      bedSrc.connect(bedGain);
      bedGain.connect(busRef.current); // bed shares the reverb space too
      bedSrc.start(0, start);
      bedGain.gain.setTargetAtTime(0.16, ctx.currentTime, 0.8);
      bedSrcRef.current = bedSrc;
      bedGainRef.current = bedGain;

      setStatus("playing");
    } catch (e) {
      setErrorMsg(e instanceof Error ? e.message : "Could not load Karel's recording.");
      setStatus("error");
    }
  }, [trackId, makeReverb, stopKey]);

  // ── play/press one on-screen key (auto-begins if idle) ──
  const pressKey = useCallback(
    (index: number) => {
      const k = keysRef.current[index];
      if (!k) return;
      if (statusRef.current !== "playing") {
        void begin();
        return;
      }
      spawnVoice(`k${index}`, k.semis, k.pc, 0.85);
    },
    [begin, spawnVoice],
  );
  const releaseKey = useCallback(
    (index: number) => {
      if (sustainRef.current) return; // held until pressed again
      stopKey(`k${index}`);
    },
    [stopKey],
  );

  // ── QWERTY keyboard (stable listener via refs) ──
  useEffect(() => {
    const down = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement | null;
      if (t && (t.tagName === "INPUT" || t.tagName === "TEXTAREA" || t.tagName === "SELECT" || t.isContentEditable)) return;
      if (e.repeat) return;
      const idx = KEY_LETTERS.indexOf(e.key.toLowerCase());
      if (idx < 0) return;
      const k = keysRef.current[idx];
      if (!k) return;
      e.preventDefault();
      pressKey(idx);
    };
    const up = (e: KeyboardEvent) => {
      const idx = KEY_LETTERS.indexOf(e.key.toLowerCase());
      if (idx < 0) return;
      releaseKey(idx);
    };
    window.addEventListener("keydown", down);
    window.addEventListener("keyup", up);
    return () => {
      window.removeEventListener("keydown", down);
      window.removeEventListener("keyup", up);
    };
  }, [pressKey, releaseKey]);

  // ── Web MIDI (enhancement — absence is fine) ──
  useEffect(() => {
    let cancelled = false;
    const nav = navigator as unknown as { requestMIDIAccess?: RequestMidi };
    if (typeof nav.requestMIDIAccess !== "function") {
      setMidiSupported(false);
      return;
    }
    const onMessage = (e: MidiMessageEvent) => {
      const [statusByte, note, vel] = e.data;
      const cmd = statusByte & 0xf0;
      const pc = ((note % 12) + 12) % 12;
      const semis = clamp(note - MIDI_ROOT, -RANGE, RANGE);
      if (cmd === 0x90 && vel > 0) {
        if (statusRef.current !== "playing") {
          void begin();
          return;
        }
        spawnVoice(`m${note}`, semis, pc, vel / 127);
      } else if (cmd === 0x80 || (cmd === 0x90 && vel === 0)) {
        if (!sustainRef.current) stopKey(`m${note}`);
      }
    };
    const wire = (access: MidiAccessLike) => {
      let name: string | null = null;
      try {
        access.inputs.forEach((inp) => {
          inp.onmidimessage = onMessage;
          if (!name) name = inp.name ?? "MIDI keyboard";
        });
      } catch {
        /* ignore */
      }
      setMidiName(name);
    };
    nav
      .requestMIDIAccess()
      .then((access) => {
        if (cancelled) return;
        midiAccessRef.current = access;
        wire(access);
        access.onstatechange = () => wire(access);
      })
      .catch(() => {
        if (!cancelled) setMidiSupported(false);
      });
    return () => {
      cancelled = true;
      const a = midiAccessRef.current;
      if (a) a.onstatechange = null;
    };
  }, [begin, spawnVoice, stopKey]);

  // ── the canvas draw loop (always alive; reads analyser when playing) ──
  const drawFrame = useCallback((tMs: number) => {
    const canvas = canvasRef.current;
    if (!canvas) {
      rafRef.current = requestAnimationFrame(drawFrame);
      return;
    }
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    const cw = canvas.clientWidth || 1;
    const ch = canvas.clientHeight || 1;
    if (canvas.width !== Math.floor(cw * dpr) || canvas.height !== Math.floor(ch * dpr)) {
      canvas.width = Math.floor(cw * dpr);
      canvas.height = Math.floor(ch * dpr);
    }
    const g = canvas.getContext("2d");
    if (!g) {
      rafRef.current = requestAnimationFrame(drawFrame);
      return;
    }
    g.setTransform(dpr, 0, 0, dpr, 0, 0);
    const W = cw;
    const H = ch;
    const t = tMs / 1000;

    // energy from the safe-master analyser (0 when silent / not begun)
    let energy = 0;
    const analyser = masterRef.current?.analyser;
    if (analyser) {
      const time = new Uint8Array(analyser.fftSize);
      analyser.getByteTimeDomainData(time);
      let sum = 0;
      for (let i = 0; i < time.length; i++) {
        const d = (time[i] - 128) / 128;
        sum += d * d;
      }
      energy = Math.sqrt(sum / time.length);
    }

    // gentle motion trail (warm near-black), never a grain/noise overlay
    g.globalCompositeOperation = "source-over";
    g.fillStyle = "rgba(9, 6, 4, 0.30)";
    g.fillRect(0, 0, W, H);

    // slow breathing glow so the idle bed keeps the screen alive
    const breath = 0.5 + 0.5 * Math.sin(t * 0.5);
    const glowR = Math.max(W, H) * (0.35 + energy * 0.45 + breath * 0.08);
    const cxg = W / 2;
    const cyg = H * 0.55;
    const grd = g.createRadialGradient(cxg, cyg, 0, cxg, cyg, glowR);
    const glowA = 0.05 + energy * 0.22 + breath * 0.04;
    grd.addColorStop(0, `hsla(38, 85%, 58%, ${glowA})`);
    grd.addColorStop(0.5, `hsla(30, 80%, 40%, ${glowA * 0.4})`);
    grd.addColorStop(1, "hsla(24, 70%, 20%, 0)");
    g.globalCompositeOperation = "lighter";
    g.fillStyle = grd;
    g.fillRect(0, 0, W, H);

    // each sounding voice = a warm beam: x by pitch-class, height by pitch,
    // brightness by its live gain, with a bloom pulsing off the analyser.
    const colW = W / 12;
    for (const v of voicesRef.current.values()) {
      const bright = Math.min(1, v.gain.gain.value / (v.target || 0.2));
      if (bright < 0.02) continue;
      const x = (v.pc + 0.5) * colW;
      const heightFrac = 0.15 + ((v.semis + RANGE) / (RANGE * 2)) * 0.72;
      const topY = H * (1 - heightFrac);
      const w = colW * 0.6;
      const pulse = 0.8 + energy * 0.9 + 0.1 * Math.sin(t * 2 + v.pc);
      const light = 46 + bright * 22;

      // the beam
      const beam = g.createLinearGradient(0, topY, 0, H);
      beam.addColorStop(0, warm(v.pc, light + 8, 0.85 * bright));
      beam.addColorStop(0.5, warm(v.pc, light, 0.5 * bright));
      beam.addColorStop(1, warm(v.pc, light - 10, 0.04 * bright));
      g.fillStyle = beam;
      g.fillRect(x - w / 2, topY, w, H - topY);

      // bloom cap
      const bloomR = w * (1.4 + pulse * 0.9);
      const bloom = g.createRadialGradient(x, topY, 0, x, topY, bloomR);
      bloom.addColorStop(0, warm(v.pc, 66, 0.7 * bright * pulse));
      bloom.addColorStop(1, warm(v.pc, 50, 0));
      g.fillStyle = bloom;
      g.beginPath();
      g.arc(x, topY, bloomR, 0, Math.PI * 2);
      g.fill();
    }

    g.globalCompositeOperation = "source-over";
    rafRef.current = requestAnimationFrame(drawFrame);
  }, []);

  useEffect(() => {
    rafRef.current = requestAnimationFrame(drawFrame);
    return () => {
      if (rafRef.current !== null) cancelAnimationFrame(rafRef.current);
    };
  }, [drawFrame]);

  // ── unmount cleanup ──
  useEffect(() => {
    const voices = voicesRef.current;
    return () => {
      if (rafRef.current !== null) cancelAnimationFrame(rafRef.current);
      for (const v of voices.values()) {
        if (v.stopTimer !== null) window.clearTimeout(v.stopTimer);
        try {
          v.src.stop();
        } catch {
          /* noop */
        }
      }
      const bed = bedSrcRef.current;
      if (bed) {
        try {
          bed.stop();
        } catch {
          /* noop */
        }
      }
      masterRef.current?.disconnect();
      const a = midiAccessRef.current;
      if (a) a.onstatechange = null;
      const ctx = ctxRef.current;
      if (ctx && ctx.state !== "closed") void ctx.close();
    };
  }, []);

  const playing = status === "playing";
  const midiLine = midiName
    ? `on-screen keyboard · MIDI: ${midiName} connected`
    : midiSupported
      ? "on-screen keyboard · MIDI: none (tap the keys)"
      : "on-screen keyboard · MIDI: unavailable in this browser (tap the keys)";

  return (
    <main className="relative h-dvh w-full overflow-hidden bg-[#090604] text-foreground">
      <canvas ref={canvasRef} className="absolute inset-0 h-full w-full" />

      {/* title / description / notes — chrome, hidden while immersive */}
      {!immersive && (
        <div className="pointer-events-none absolute inset-x-0 top-0 z-20 flex items-start justify-between gap-4 p-4 sm:p-6">
          <div className="pointer-events-auto max-w-2xl rounded-lg border border-border/40 bg-background/50 p-4 backdrop-blur-sm">
            <p className="mb-1 font-mono text-xs uppercase tracking-[0.18em] text-muted-foreground">
              harmonizer · your chords on Karel&apos;s piano
            </p>
            <h1 className="text-xl font-semibold tracking-tight text-foreground">
              Reharmonize
            </h1>
            <p className="mt-2 text-base leading-relaxed text-muted-foreground">
              Play chords on Karel&apos;s own recorded take. Each key voices a
              transposed, sustained copy of his recording, so a triad stacks three
              pitch-shifted versions of the same piano into a live choir of itself.
            </p>
          </div>
          <button
            type="button"
            onClick={() => setShowNotes(true)}
            className="pointer-events-auto shrink-0 rounded-md border border-border bg-background/60 px-3 py-1.5 font-mono text-xs uppercase tracking-[0.16em] text-muted-foreground backdrop-blur-sm transition-colors hover:bg-accent hover:text-foreground"
          >
            Read the design notes
          </button>
        </div>
      )}

      {/* Begin overlay — audio needs a gesture; shown until the take is playing */}
      {!playing && (
        <div className="absolute inset-0 z-30 flex items-center justify-center p-4">
          <div className="w-full max-w-sm rounded-lg border border-border/50 bg-background/70 p-6 text-center backdrop-blur-md">
            <h2 className="text-xl font-semibold tracking-tight text-foreground">
              A choir of one recording
            </h2>
            <p className="mt-2 text-base leading-relaxed text-muted-foreground">
              Decode {title} once, then play it back as a keyboard — every key is a
              transposed copy of the same take.
            </p>
            <button
              type="button"
              onClick={() => void begin()}
              disabled={status === "loading"}
              className="mt-4 min-h-[44px] w-full rounded-md bg-primary px-6 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90 disabled:opacity-60"
            >
              {status === "loading" ? "Loading his take…" : "Begin"}
            </button>
            {status === "error" && errorMsg && (
              <p className="mt-3 text-sm text-destructive">
                Couldn&apos;t play his recording: {errorMsg}{" "}
                <button
                  type="button"
                  onClick={() => void begin()}
                  className="underline underline-offset-2 hover:text-foreground"
                >
                  retry
                </button>
              </p>
            )}
          </div>
        </div>
      )}

      {/* bottom cluster: transport (chrome) + status + keyboard, stacked so they
          never overlap. Only the keyboard + status show while immersive. */}
      <div className="pointer-events-none absolute inset-x-0 bottom-0 z-20 flex flex-col items-center gap-2 p-3 sm:p-4">
        {/* transport + options — chrome, hidden while immersive */}
        {!immersive && (
          <div className="pointer-events-auto flex flex-wrap items-center justify-center gap-2 rounded-full border border-border/40 bg-background/50 px-3 py-2 backdrop-blur-sm">
            <button
              type="button"
              onClick={() => (playing ? stopAll() : void begin())}
              className="min-h-[44px] rounded-md bg-primary px-5 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90"
            >
              {status === "loading" ? "Loading…" : playing ? "Stop" : "Begin"}
            </button>
            <button
              type="button"
              onClick={() => setSustain((s) => !s)}
              aria-pressed={sustain}
              className={
                sustain
                  ? "min-h-[44px] rounded-md bg-primary px-4 text-sm font-medium text-primary-foreground"
                  : "min-h-[44px] rounded-md border border-border bg-background/60 px-4 text-sm text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
              }
            >
              Sustain
            </button>
            <select
              aria-label="Scale"
              value={scaleId}
              onChange={(e) => setScaleId(e.target.value)}
              className="min-h-[44px] rounded-md border border-border bg-background px-3 text-sm text-foreground"
            >
              {SCALES.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.label}
                </option>
              ))}
            </select>
            <select
              aria-label="His recording"
              value={trackId}
              onChange={(e) => {
                const id = e.target.value;
                setTrackId(id);
                setTitle(titleFor(id));
                if (playing || status === "loading") {
                  stopAll();
                  bufferRef.current = null;
                }
              }}
              className="min-h-[44px] max-w-[42vw] rounded-md border border-border bg-background px-3 text-sm text-foreground"
            >
              {COLLECTIONS.map((c) => (
                <optgroup key={c.name} label={c.name}>
                  {c.tracks.map((tk) => (
                    <option key={tk.id} value={tk.id}>
                      {tk.title}
                    </option>
                  ))}
                </optgroup>
              ))}
            </select>
          </div>
        )}

        {/* status line — always visible (allowed in immersive) */}
        <p className="rounded-full border border-border/30 bg-background/40 px-3 py-1 text-center font-mono text-[11px] tracking-wide text-muted-foreground backdrop-blur-sm">
          {midiLine} · voices {voiceCount}/{MAX_VOICES}
          {playing ? ` · ${title}` : ""}
        </p>

        {/* the keyboard — PRIMARY input, always visible (finger-playable) */}
        <div className="pointer-events-auto flex w-full max-w-3xl gap-1 sm:gap-1.5">
          {keys.map((k) => {
            const lit = litKeys.has(k.index);
            return (
              <button
                key={k.index}
                type="button"
                aria-label={`Play scale degree ${k.index + 1} (key ${k.letter})`}
                onPointerDown={(e) => {
                  e.preventDefault();
                  (e.target as HTMLElement).setPointerCapture?.(e.pointerId);
                  pressKey(k.index);
                }}
                onPointerUp={() => releaseKey(k.index)}
                onPointerLeave={() => releaseKey(k.index)}
                onPointerCancel={() => releaseKey(k.index)}
                className="flex min-h-[72px] flex-1 select-none flex-col items-center justify-end rounded-md border pb-2 font-mono text-[10px] uppercase tracking-widest transition-colors"
                style={{
                  borderColor: lit ? warm(k.pc, 62, 0.9) : "rgba(120, 88, 40, 0.35)",
                  background: lit
                    ? `linear-gradient(to top, ${warm(k.pc, 55, 0.85)}, ${warm(k.pc, 40, 0.35)})`
                    : "rgba(24, 16, 9, 0.55)",
                  color: lit ? "#1a1206" : "hsl(38, 45%, 70%)",
                  boxShadow: lit ? `0 0 22px ${warm(k.pc, 55, 0.55)}` : "none",
                }}
              >
                {k.letter}
              </button>
            );
          })}
        </div>
      </div>

      {/* fullscreen + info HUD */}
      <ImmersiveHud
        immersive={immersive}
        onToggle={toggle}
        title="Reharmonize"
        description="Play chords on Karel's own recorded piano take. Each key voices a transposed, sustained copy of his recording, so a triad stacks three pitch-shifted versions of the same take into a live choir of itself — a harmonizer built entirely from his real audio."
        howTo={[
          "Tap Begin",
          "Play the on-screen keys — or plug in a MIDI keyboard",
          "Hold a chord to stack your recording into a choir of itself",
          "Press f for fullscreen, i for info",
        ]}
      />

      {/* prototype nav — below the fold, hidden while immersive */}
      {!immersive && (
        <PrototypeNav slugs={["15872-answerpiano", "707-two-track-weave", "703-harmonic-bloom"]} />
      )}

      {/* design-notes modal */}
      {showNotes && !immersive && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4 backdrop-blur-sm"
          onClick={() => setShowNotes(false)}
        >
          <div
            className="max-h-[80vh] max-w-lg overflow-y-auto rounded-lg border border-border bg-background p-6 shadow-lg"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="mb-3 flex items-center justify-between">
              <h2 className="text-xl font-semibold tracking-tight text-foreground">
                Reharmonize — design notes
              </h2>
              <button
                type="button"
                onClick={() => setShowNotes(false)}
                className="rounded-md border border-border bg-background/60 px-2 py-1 text-sm text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
              >
                Close
              </button>
            </div>
            <div className="space-y-3 text-sm leading-relaxed text-muted-foreground">
              <p>
                One question: what if you could play chords on your own recorded
                piano? On Begin, Karel&apos;s real take is decoded once. A soft
                looping bed voice of it always plays. Each key you hold spawns a new
                looping <span className="font-mono text-xs">AudioBufferSourceNode</span>{" "}
                of the same buffer, transposed by{" "}
                <span className="font-mono text-xs">playbackRate = 2^(semis/12)</span>,
                so a C-E-G triad stacks three pitch-shifted versions of his recording
                into a live choir of itself.
              </p>
              <p>
                This is a harmonizer — transpose + stack — not grain-scrubbing. Each
                voice loops a musical window (about five seconds) of the take from a
                randomized start point, so stacked copies decorrelate into a choir
                rather than a flanged unison. Velocity sets each voice&apos;s gain;
                note-off fades out; polyphony is capped at eight (oldest stolen); a
                sustain toggle turns the keys into a held pad. Everything runs into
                the shared ear-safety master through a synthetic-IR convolution
                reverb — his real audio is the only sound source.
              </p>
              <p>
                Play by touch or click, by QWERTY (z x c v b n m a s d g h j k l →
                scale degrees), or by a plugged-in MIDI keyboard (auto-connected via
                Web MIDI, velocity honored). The visuals are warm-only — each voice
                is an amber beam placed by pitch-class, sized by pitch, brightened by
                its live gain, over a breathing glow driven by the master analyser.
              </p>
              <p>
                References: the <strong>Antares Harmony Engine</strong> (real-time
                multi-voice harmonizer) and the <strong>Web Harmonium</strong>
                (browser recording-as-instrument via real-time transposition and reed
                stacking), here deepened onto Karel&apos;s own recorded piano; and
                arXiv 2604.23583 (2026, &ldquo;Two Years of Performance with
                Intelligent Musical Instruments&rdquo;) for the
                instrument-as-relationship framing.
              </p>
              <p>
                Fallback: if the decode fails, a destructive notice with a retry
                appears and the canvas keeps breathing. No MIDI device is ever
                required — the on-screen keyboard is the primary instrument.
              </p>
            </div>
          </div>
        </div>
      )}
    </main>
  );
}
