"use client";

// ─────────────────────────────────────────────────────────────────────────────
// 14192-notemirror · "Re-perform your own recording, note for note."
//
//   Karel's real recording plays underneath as a soft bed. He plays a MIDI
//   keyboard (or the computer keys) OVER it — and every key he presses sounds his
//   ACTUAL recorded piano note nearest that pitch, sliced live out of the take at
//   the onset/duration the analysis reports, tuned to land exactly in pitch. He
//   is literally rearranging his own real struck notes in a new order, in his own
//   sound. No synth, no oscillator, anywhere.
//
//   The stage is a Canvas-2D color organ after Scriabin's clavier à lumières:
//   each of the 12 pitch classes owns a distinct hue spread around the whole
//   color wheel (circle-of-fifths order, C = red), so a chord blooms as several
//   colors at once — deliberately full-spectrum, not a monochrome wash.
// ─────────────────────────────────────────────────────────────────────────────

import { useCallback, useEffect, useRef, useState } from "react";
import { PrototypeNav } from "../_shared/prototype-nav";
import { COLLECTIONS, WELCOME_HOME_TRACKS, loadRealTrackBuffer } from "../_shared/welcomeHome";
import { loadTrackAnalysis, chordRoot, type TrackChord } from "../_shared/trackAnalysis";
import { createSafeMaster, type SafeMaster } from "../_shared/visionary/safeMaster";
import { buildSliceIndex, countSlices, makeSampler, type Sampler } from "./sampler";

// ── Scriabin color organ: pitch class → hue (canvas ART only) ────────────────
// Circle-of-fifths ordering anchored C = red, spread across the WHOLE wheel so
// neighbouring keys sit near each other in color and a chord reads multicolored.
const PC_NAMES = ["C", "C#", "D", "D#", "E", "F", "F#", "G", "G#", "A", "A#", "B"];
function pcHue(pc: number): number {
  return (((pc * 7) % 12) * 30 + 360) % 360;
}

// ── QWERTY fallback: two rows → a chromatic run of ~17 keys ──────────────────
const KEY_OFFSET: Record<string, number> = {
  a: 0, w: 1, s: 2, e: 3, d: 4, f: 5, t: 6, g: 7, y: 8, h: 9, u: 10, j: 11,
  k: 12, o: 13, l: 14, p: 15, ";": 16,
};
const WHITE_KEYS = ["a", "s", "d", "f", "g", "h", "j", "k", "l", ";"];
const BLACK_KEYS = ["w", "e", "t", "y", "u", "o", "p"];

const PITCH_CLASS: Record<string, number> = {
  C: 0, "C#": 1, DB: 1, D: 2, "D#": 3, EB: 3, E: 4, F: 5,
  "F#": 6, GB: 6, G: 7, "G#": 8, AB: 8, A: 9, "A#": 10, BB: 10, B: 11,
};
function keyTonicPc(sig: string | null): number {
  if (!sig) return 0;
  const m = sig.match(/^([A-Ga-g])([#b]?)/);
  if (!m) return 0;
  const k = (m[1].toUpperCase() + (m[2] === "b" ? "B" : m[2])).toUpperCase();
  return PITCH_CLASS[k] ?? 0;
}

// ── visual blooms ────────────────────────────────────────────────────────────
interface Bloom {
  pc: number;
  x: number; // 0..1
  y: number; // 0..1
  born: number; // performance.now()
  vel: number;
  life: number; // ms
}

const README_PROSE = [
  "Note Mirror answers one question: what if playing a keyboard let you re-perform your own recording, note for note?",
  "Karel's real take plays underneath as a soft bed. Every key you press — MIDI or computer keyboard — sounds his ACTUAL recorded piano note nearest that pitch, sliced live out of the decoded audio at the onset and duration his track's analysis reports, then tuned by a small playback-rate nudge so it lands exactly in pitch. There is no synth or oscillator: the voice you play IS his recording, cut apart and rearranged in real time.",
  "The color field is a Scriabin clavier-à-lumières color organ: each of the 12 pitch classes owns a distinct hue spread around the whole wheel (circle-of-fifths order, C = red), so a chord blooms as several colors at once — full-spectrum on purpose.",
  "When a track has no note-roll analysis, the instrument falls back to slicing a short region of the take and pitch-shifting it, so it always plays; the status line tells you which mode you're in. Note-off lets each recorded note ring a short natural decay before a gentle release.",
];

type Phase = "idle" | "loading" | "playing" | "error";

export default function NoteMirrorPage() {
  const [phase, setPhase] = useState<Phase>("idle");
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [selectedId, setSelectedId] = useState<string>(WELCOME_HOME_TRACKS[0].id);
  const [trackTitle, setTrackTitle] = useState<string>("");
  const [midiNotice, setMidiNotice] = useState<string>("Not started");
  const [usingReal, setUsingReal] = useState<boolean | null>(null);
  const [sliceCount, setSliceCount] = useState<number>(0);
  const [soloBed, setSoloBed] = useState<boolean>(false);
  const [showNotes, setShowNotes] = useState<boolean>(false);

  const ctxRef = useRef<AudioContext | null>(null);
  const safeRef = useRef<SafeMaster | null>(null);
  const samplerRef = useRef<Sampler | null>(null);
  const bedSrcRef = useRef<AudioBufferSourceNode | null>(null);
  const bedGainRef = useRef<GainNode | null>(null);
  const bedStartRef = useRef<number>(0);
  const bedDurRef = useRef<number>(0);
  const chordsRef = useRef<TrackChord[]>([]);
  const baseMidiRef = useRef<number>(60);

  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const bloomsRef = useRef<Bloom[]>([]);
  const heldRef = useRef<Set<number>>(new Set());
  const strikeCountRef = useRef<number>(0);
  const animRef = useRef<number>(0);
  const reducedRef = useRef<boolean>(false);

  const BED_LEVEL = 0.3;

  // ── strike / release (used by MIDI + keyboard + on-screen) ─────────────────
  const strike = useCallback((midi: number, vel: number) => {
    const s = samplerRef.current;
    if (!s || midi < 0 || midi > 127) return;
    s.noteOn(midi, vel);
    heldRef.current.add(midi);
    const pc = ((midi % 12) + 12) % 12;
    const n = strikeCountRef.current++;
    // deterministic layout: x by pitch class column (+ tiny per-strike drift),
    // y by octave (low = bottom). No Math.random anywhere.
    const octave = Math.max(0, Math.min(8, Math.floor(midi / 12) - 1));
    const drift = ((n * 47) % 100) / 100 - 0.5;
    const x = (pc + 0.5) / 12 + drift * 0.04;
    const y = 1 - (octave + 0.5) / 9 + drift * 0.03;
    bloomsRef.current.push({
      pc,
      x: Math.max(0.02, Math.min(0.98, x)),
      y: Math.max(0.05, Math.min(0.95, y)),
      born: performance.now(),
      vel: Math.max(0.1, Math.min(1, vel)),
      life: 1400 + vel * 1400,
    });
    if (bloomsRef.current.length > 96) bloomsRef.current.splice(0, bloomsRef.current.length - 96);
  }, []);

  const release = useCallback((midi: number) => {
    samplerRef.current?.noteOff(midi);
    heldRef.current.delete(midi);
  }, []);

  // ── start everything on the user gesture ───────────────────────────────────
  const start = useCallback(async () => {
    if (phase === "loading" || phase === "playing") return;
    setPhase("loading");
    setErrorMsg(null);
    try {
      const Ctor = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      const ctx = new Ctor();
      ctxRef.current = ctx;
      if (ctx.state === "suspended") await ctx.resume();

      const safe = createSafeMaster(ctx);
      safeRef.current = safe;

      const [{ buffer, title }, analysis] = await Promise.all([
        loadRealTrackBuffer(ctx, selectedId),
        loadTrackAnalysis(selectedId),
      ]);
      setTrackTitle(title);

      const index = analysis && analysis.notes.length ? buildSliceIndex(analysis.notes) : null;
      const realCount = index ? countSlices(index) : 0;
      chordsRef.current = analysis?.chords ?? [];
      baseMidiRef.current = 48 + keyTonicPc(analysis?.key_signature ?? null);

      const voiceBus = ctx.createGain();
      voiceBus.gain.value = 1;
      voiceBus.connect(safe.input);
      const sampler = makeSampler(ctx, buffer, voiceBus, index);
      samplerRef.current = sampler;
      setUsingReal(sampler.usingRealSlices);
      setSliceCount(realCount);

      // soft bed of his real take, looped
      const bedGain = ctx.createGain();
      bedGain.gain.value = soloBed ? 0.0001 : BED_LEVEL;
      bedGain.connect(safe.input);
      const bed = ctx.createBufferSource();
      bed.buffer = buffer;
      bed.loop = true;
      bed.connect(bedGain);
      bed.start();
      bedSrcRef.current = bed;
      bedGainRef.current = bedGain;
      bedStartRef.current = ctx.currentTime;
      bedDurRef.current = buffer.duration;

      setPhase("playing");
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : "Could not load the track.");
      setPhase("error");
    }
  }, [phase, selectedId, soloBed]);

  // teardown audio back to idle (also used when switching tracks)
  const stopAudio = useCallback(() => {
    samplerRef.current?.stopAll();
    samplerRef.current = null;
    try {
      bedSrcRef.current?.stop();
    } catch {
      /* already stopped */
    }
    bedSrcRef.current = null;
    bedGainRef.current = null;
    safeRef.current?.disconnect();
    safeRef.current = null;
    const ctx = ctxRef.current;
    ctxRef.current = null;
    if (ctx && ctx.state !== "closed") ctx.close().catch(() => {});
    bloomsRef.current = [];
    heldRef.current.clear();
    setPhase("idle");
  }, []);

  // ── solo (mute bed) toggle ─────────────────────────────────────────────────
  useEffect(() => {
    const ctx = ctxRef.current;
    const g = bedGainRef.current;
    if (!ctx || !g) return;
    g.gain.setTargetAtTime(soloBed ? 0.0001 : BED_LEVEL, ctx.currentTime, 0.08);
  }, [soloBed]);

  // ── Web MIDI ───────────────────────────────────────────────────────────────
  useEffect(() => {
    if (phase !== "playing") return;
    const attached: MIDIInput[] = [];
    let access: MIDIAccess | null = null;
    let cancelled = false;

    const onMessage = (e: MIDIMessageEvent) => {
      if (!e.data) return;
      const [status, note, vel] = e.data;
      const cmd = status & 0xf0;
      if (cmd === 0x90 && vel > 0) strike(note, vel / 127);
      else if (cmd === 0x80 || (cmd === 0x90 && vel === 0)) release(note);
    };

    const wire = (acc: MIDIAccess) => {
      let count = 0;
      let name = "";
      acc.inputs.forEach((input) => {
        count += 1;
        name = input.name ?? name;
        input.addEventListener("midimessage", onMessage as EventListener);
        attached.push(input);
      });
      if (count === 0) setMidiNotice("No MIDI device — use your computer keys (A–L row).");
      else setMidiNotice(`MIDI connected: ${name || `${count} device(s)`}`);
    };

    if (typeof navigator.requestMIDIAccess !== "function") {
      setMidiNotice("No Web MIDI in this browser — use your computer keys (A–L row).");
    } else {
      navigator
        .requestMIDIAccess()
        .then((acc) => {
          if (cancelled) return;
          access = acc;
          wire(acc);
          acc.onstatechange = () => {
            for (const i of attached) i.removeEventListener("midimessage", onMessage as EventListener);
            attached.length = 0;
            wire(acc);
          };
        })
        .catch(() => {
          setMidiNotice("MIDI access denied — use your computer keys (A–L row).");
        });
    }

    return () => {
      cancelled = true;
      for (const i of attached) i.removeEventListener("midimessage", onMessage as EventListener);
      if (access) access.onstatechange = null;
    };
  }, [phase, strike, release]);

  // ── computer-keyboard fallback ─────────────────────────────────────────────
  useEffect(() => {
    if (phase !== "playing") return;
    const down = new Set<string>();
    const onDown = (e: KeyboardEvent) => {
      if (e.repeat || e.metaKey || e.ctrlKey || e.altKey) return;
      const k = e.key.toLowerCase();
      if (!(k in KEY_OFFSET)) return;
      e.preventDefault();
      if (down.has(k)) return;
      down.add(k);
      strike(baseMidiRef.current + KEY_OFFSET[k], 0.8);
    };
    const onUp = (e: KeyboardEvent) => {
      const k = e.key.toLowerCase();
      if (!(k in KEY_OFFSET)) return;
      down.delete(k);
      release(baseMidiRef.current + KEY_OFFSET[k]);
    };
    window.addEventListener("keydown", onDown);
    window.addEventListener("keyup", onUp);
    return () => {
      window.removeEventListener("keydown", onDown);
      window.removeEventListener("keyup", onUp);
    };
  }, [phase, strike, release]);

  // ── canvas render loop ─────────────────────────────────────────────────────
  useEffect(() => {
    if (phase !== "playing") return;
    const canvas = canvasRef.current;
    if (!canvas) return;
    const g = canvas.getContext("2d");
    if (!g) {
      setMidiNotice("Canvas 2D unavailable in this browser.");
      return;
    }
    reducedRef.current = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

    let w = 0;
    let h = 0;
    const resize = () => {
      const dpr = Math.min(2, window.devicePixelRatio || 1);
      const rect = canvas.getBoundingClientRect();
      w = Math.max(1, Math.floor(rect.width));
      h = Math.max(1, Math.floor(rect.height));
      canvas.width = Math.floor(w * dpr);
      canvas.height = Math.floor(h * dpr);
      g.setTransform(dpr, 0, 0, dpr, 0, 0);
    };
    resize();
    window.addEventListener("resize", resize);

    const analyser = safeRef.current?.analyser ?? null;
    const levelBuf = analyser ? new Uint8Array(analyser.fftSize) : null;

    const bgChordHue = (): number | null => {
      const chords = chordsRef.current;
      const ctx = ctxRef.current;
      if (!chords.length || !ctx || bedDurRef.current <= 0) return null;
      const pos = (ctx.currentTime - bedStartRef.current) % bedDurRef.current;
      let root: number | null = null;
      for (const c of chords) {
        if (c.time <= pos) root = chordRoot(c.chord);
        else break;
      }
      return root == null ? null : pcHue(root);
    };

    const frame = () => {
      animRef.current = requestAnimationFrame(frame);
      const now = performance.now();

      let level = 0;
      if (analyser && levelBuf) {
        analyser.getByteTimeDomainData(levelBuf as Uint8Array<ArrayBuffer>);
        let sum = 0;
        for (let i = 0; i < levelBuf.length; i++) {
          const v = (levelBuf[i] - 128) / 128;
          sum += v * v;
        }
        level = Math.sqrt(sum / levelBuf.length);
      }

      // background wash: near-black, tinted subtly by the bed's current chord
      const hue = bgChordHue();
      g.globalCompositeOperation = "source-over";
      if (hue == null) {
        g.fillStyle = "rgb(7,7,10)";
      } else {
        g.fillStyle = `hsl(${hue}, 42%, ${5 + level * 7}%)`;
      }
      g.fillRect(0, 0, w, h);

      // faint 12 pitch-class column guides so the color map is always legible
      for (let pc = 0; pc < 12; pc++) {
        const cx = ((pc + 0.5) / 12) * w;
        g.fillStyle = `hsla(${pcHue(pc)}, 70%, 55%, 0.05)`;
        g.fillRect(cx - w / 48, 0, w / 24, h);
      }

      // held-note steady glow columns
      g.globalCompositeOperation = "lighter";
      for (const midi of heldRef.current) {
        const pc = ((midi % 12) + 12) % 12;
        const cx = ((pc + 0.5) / 12) * w;
        const grad = g.createLinearGradient(cx, 0, cx, h);
        grad.addColorStop(0, `hsla(${pcHue(pc)}, 85%, 60%, 0.06)`);
        grad.addColorStop(1, `hsla(${pcHue(pc)}, 85%, 55%, 0.14)`);
        g.fillStyle = grad;
        g.fillRect(cx - w / 30, 0, w / 15, h);
      }

      // blooms — each played note flowers in its pitch-class hue
      const kept: Bloom[] = [];
      for (const b of bloomsRef.current) {
        const age = (now - b.born) / b.life;
        if (age >= 1) continue;
        kept.push(b);
        const cx = b.x * w;
        const cy = b.y * h;
        const ease = reducedRef.current ? 0.6 : 1 - Math.pow(1 - age, 2);
        const maxR = (0.05 + b.vel * 0.18) * Math.min(w, h) * 1.6;
        const r = Math.max(2, maxR * (reducedRef.current ? 0.7 : ease));
        const alpha = (1 - age) * (0.5 + b.vel * 0.5);
        const hu = pcHue(b.pc);
        const grad = g.createRadialGradient(cx, cy, 0, cx, cy, r);
        grad.addColorStop(0, `hsla(${hu}, 95%, 68%, ${alpha})`);
        grad.addColorStop(0.4, `hsla(${hu}, 90%, 55%, ${alpha * 0.5})`);
        grad.addColorStop(1, `hsla(${hu}, 90%, 45%, 0)`);
        g.fillStyle = grad;
        g.beginPath();
        g.arc(cx, cy, r, 0, Math.PI * 2);
        g.fill();
        // bright core
        g.fillStyle = `hsla(${hu}, 100%, 82%, ${alpha * 0.9})`;
        g.beginPath();
        g.arc(cx, cy, Math.max(1.5, r * 0.08), 0, Math.PI * 2);
        g.fill();
      }
      bloomsRef.current = kept;
      g.globalCompositeOperation = "source-over";
    };

    animRef.current = requestAnimationFrame(frame);
    return () => {
      cancelAnimationFrame(animRef.current);
      window.removeEventListener("resize", resize);
    };
  }, [phase]);

  // ── unmount cleanup ────────────────────────────────────────────────────────
  useEffect(() => {
    return () => {
      samplerRef.current?.stopAll();
      try {
        bedSrcRef.current?.stop();
      } catch {
        /* already stopped */
      }
      safeRef.current?.disconnect();
      const ctx = ctxRef.current;
      if (ctx && ctx.state !== "closed") ctx.close().catch(() => {});
      cancelAnimationFrame(animRef.current);
    };
  }, []);

  const selectTrack = (id: string) => {
    if (id === selectedId) return;
    if (phase === "playing" || phase === "loading") stopAudio();
    setSelectedId(id);
    setUsingReal(null);
    setTrackTitle("");
  };

  // ── UI ─────────────────────────────────────────────────────────────────────
  const labelCls = "font-mono text-xs uppercase tracking-[0.18em] text-muted-foreground";

  return (
    <main className="min-h-screen bg-background text-foreground">
      <PrototypeNav slugs={["14192-notemirror", "14128-choirtabs", "13696-callback"]} />

      <div className="mx-auto max-w-5xl px-5 py-10">
        <header className="mb-8">
          <p className={labelCls}>Dream lab · analysis-driven note-slice sampler</p>
          <h1 className="mt-2 text-2xl font-semibold tracking-tight">Note Mirror</h1>
          <p className="mt-2 max-w-2xl text-base text-muted-foreground">
            Play a keyboard over Karel&apos;s own recording — every key sounds his actual recorded
            note nearest that pitch, sliced live from the take, so he re-performs his own notes in a
            new order. A Scriabin color organ blooms each pitch class in its own hue.
          </p>
        </header>

        {/* stage */}
        <div className="relative mb-5 overflow-hidden rounded-lg border border-border bg-black">
          <canvas
            ref={canvasRef}
            className="block h-[52vh] min-h-[320px] w-full"
            aria-label="Scriabin color organ — each played note blooms in its pitch-class hue"
          />
          {phase !== "playing" && (
            <div className="absolute inset-0 flex flex-col items-center justify-center gap-4 bg-black/60 p-6 text-center backdrop-blur-sm">
              {phase === "error" ? (
                <p className="max-w-md text-base text-destructive">{errorMsg}</p>
              ) : (
                <p className="max-w-md text-base text-muted-foreground">
                  Press Play to load {trackTitle ? `“${trackTitle}”` : "the track"}, start the soft
                  bed, and enable your MIDI keyboard (or the computer keys).
                </p>
              )}
              <button
                type="button"
                onClick={start}
                disabled={phase === "loading"}
                className="min-h-[44px] rounded-md bg-primary px-6 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90 disabled:opacity-60"
              >
                {phase === "loading" ? "Loading…" : phase === "error" ? "Try again" : "Play"}
              </button>
            </div>
          )}
          <button
            type="button"
            onClick={() => setShowNotes(true)}
            className="absolute right-3 top-3 rounded-md border border-border bg-background/60 px-3 py-1.5 text-xs text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
          >
            Read the design notes
          </button>
        </div>

        {/* status + controls */}
        <div className="mb-6 flex flex-wrap items-center gap-3">
          <span className={labelCls}>{midiNotice}</span>
          {usingReal !== null && (
            <span className={labelCls}>
              {usingReal
                ? `· using real note slices (${sliceCount})`
                : "· region fallback (no analysis)"}
            </span>
          )}
          {phase === "playing" && (
            <div className="ml-auto flex flex-wrap gap-2">
              <button
                type="button"
                onClick={() => setSoloBed((s) => !s)}
                className="min-h-[44px] rounded-md border border-border bg-background/60 px-4 text-sm text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
              >
                {soloBed ? "Bed muted — play solo" : "Solo (mute bed)"}
              </button>
              <button
                type="button"
                onClick={stopAudio}
                className="min-h-[44px] rounded-md border border-border bg-background/60 px-4 text-sm text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
              >
                Stop
              </button>
            </div>
          )}
        </div>

        {/* track selector */}
        <section className="mb-6">
          <p className={`${labelCls} mb-2`}>Track</p>
          <div className="space-y-3">
            {COLLECTIONS.map((col) => (
              <div key={col.name}>
                <p className="mb-1.5 text-xs text-muted-foreground">{col.name}</p>
                <div className="flex flex-wrap gap-2">
                  {col.tracks.map((t) => {
                    const active = t.id === selectedId;
                    return (
                      <button
                        key={t.id}
                        type="button"
                        onClick={() => selectTrack(t.id)}
                        className={
                          active
                            ? "min-h-[44px] rounded-md bg-primary px-4 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90"
                            : "min-h-[44px] rounded-md border border-border bg-background/60 px-4 text-sm text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
                        }
                      >
                        {t.title}
                      </button>
                    );
                  })}
                </div>
              </div>
            ))}
          </div>
        </section>

        {/* pitch-class legend */}
        <section className="mb-6">
          <p className={`${labelCls} mb-2`}>Pitch-class color (Scriabin color organ)</p>
          <div className="flex flex-wrap gap-2">
            {PC_NAMES.map((name, pc) => (
              <div key={name} className="flex items-center gap-1.5 rounded-md border border-border bg-background/60 px-2.5 py-1.5">
                <span
                  className="inline-block h-3.5 w-3.5 rounded-sm"
                  style={{ backgroundColor: `hsl(${pcHue(pc)}, 85%, 55%)` }}
                  aria-hidden
                />
                <span className="font-mono text-xs text-muted-foreground">{name}</span>
              </div>
            ))}
          </div>
        </section>

        {/* QWERTY map */}
        <section className="mb-10">
          <p className={`${labelCls} mb-2`}>Computer-keyboard map (white keys A–;, sharps on the number row)</p>
          <div className="flex flex-wrap gap-1.5">
            {WHITE_KEYS.map((k) => (
              <kbd key={k} className="rounded-md border border-border bg-background/60 px-2.5 py-1.5 font-mono text-xs text-muted-foreground">
                {k === ";" ? ";" : k.toUpperCase()}
              </kbd>
            ))}
            <span className="mx-1 self-center text-xs text-muted-foreground">·</span>
            {BLACK_KEYS.map((k) => (
              <kbd key={k} className="rounded-md border border-border bg-accent/40 px-2.5 py-1.5 font-mono text-xs text-muted-foreground">
                {k.toUpperCase()}
              </kbd>
            ))}
          </div>
          <p className="mt-2 text-sm text-muted-foreground">
            The map anchors to the take&apos;s key when its analysis provides one.
          </p>
        </section>
      </div>

      {/* design-notes modal */}
      {showNotes && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4 backdrop-blur-sm"
          onClick={() => setShowNotes(false)}
        >
          <div
            className="max-w-lg rounded-lg border border-border bg-background p-6 shadow-lg"
            onClick={(e) => e.stopPropagation()}
          >
            <h2 className="text-2xl font-semibold tracking-tight">Note Mirror — design notes</h2>
            <div className="mt-4 space-y-3">
              {README_PROSE.map((p, i) => (
                <p key={i} className="text-sm leading-relaxed text-muted-foreground">
                  {p}
                </p>
              ))}
            </div>
            <button
              type="button"
              onClick={() => setShowNotes(false)}
              className="mt-6 min-h-[44px] rounded-md border border-border bg-background/60 px-4 text-sm text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
            >
              Close
            </button>
          </div>
        </div>
      )}
    </main>
  );
}
