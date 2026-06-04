"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import {
  HarmonographSynth,
  noteName,
  ratioLabel,
  snapToJustRatio,
  midiToFreq,
} from "./audio-engine";
import {
  buildPendulums,
  seedPendulums,
  sampleCurve,
  sampleCompositeUpTo,
  inkIntensity,
  pitchClassToColor,
  makeRenderer,
  type GLRenderer,
  type NoteInput,
} from "./harmonograph-gl";

// QWERTY → semitone offset from the current octave base (C).
const KEY_MAP: Record<string, number> = {
  a: 0,
  w: 1,
  s: 2,
  e: 3,
  d: 4,
  f: 5,
  t: 6,
  g: 7,
  y: 8,
  h: 9,
  u: 10,
  j: 11,
  k: 12,
  o: 13,
  l: 14,
  p: 15,
  ";": 16,
};

const CURVE_POINTS = 3000;
const T_MAX = 40 * Math.PI;

// Simple chord-name guess from pitch classes relative to the lowest note.
function guessChord(midis: number[]): string {
  if (midis.length === 0) return "—";
  if (midis.length === 1) return noteName(midis[0]);
  const sorted = [...midis].sort((a, b) => a - b);
  const root = sorted[0];
  const intervals = new Set(sorted.map((m) => ((m - root) % 12 + 12) % 12));
  const has = (n: number) => intervals.has(n);
  const rootName = noteName(root).replace(/\d+$/, "");
  if (has(4) && has(7)) return `${rootName} major`;
  if (has(3) && has(7)) return `${rootName} minor`;
  if (has(4) && has(8)) return `${rootName} aug`;
  if (has(3) && has(6)) return `${rootName} dim`;
  if (has(5) && has(7)) return `${rootName} sus4`;
  if (has(4) && has(7) && has(10)) return `${rootName}7`;
  if (has(7)) return `${rootName} (5th)`;
  return `${rootName} cluster`;
}

// Two-octave on-screen keyboard layout (white + black keys), base C4 = 60.
const WHITE_OFFSETS = [0, 2, 4, 5, 7, 9, 11, 12, 14, 16, 17, 19, 21, 23];
const BLACK_SPEC: Array<{ offset: number; afterWhite: number }> = [
  { offset: 1, afterWhite: 0 },
  { offset: 3, afterWhite: 1 },
  { offset: 6, afterWhite: 3 },
  { offset: 8, afterWhite: 4 },
  { offset: 10, afterWhite: 5 },
  { offset: 13, afterWhite: 7 },
  { offset: 15, afterWhite: 8 },
  { offset: 18, afterWhite: 10 },
  { offset: 20, afterWhite: 11 },
  { offset: 22, afterWhite: 12 },
];

export default function HarmonographPage() {
  const [started, setStarted] = useState(false);
  const [justIntonation, setJustIntonation] = useState(true);
  const [held, setHeld] = useState<NoteInput[]>([]);
  // notes whose key is up but kept alive by the sustain pedal — they keep
  // contributing to the drawn figure (accreting) until the pedal lifts.
  const [pedaledNotes, setPedaledNotes] = useState<NoteInput[]>([]);
  const [pedal, setPedal] = useState(false);
  // global pendulum damping 0..1 (mod-wheel CC1 / arrow keys / slider)
  const [damping, setDamping] = useState(0.25);
  const [octave, setOctave] = useState(4);
  const [midiStatus, setMidiStatus] = useState<
    | { kind: "unsupported" }
    | { kind: "none" }
    | { kind: "ready"; device: string }
    | { kind: "error"; message: string }
    | null
  >(null);
  const [glError, setGlError] = useState<string | null>(null);
  const [midiOutAvail, setMidiOutAvail] = useState(false);
  const [echoMidiOut, setEchoMidiOut] = useState(false);
  const [showNotes, setShowNotes] = useState(false);

  // refs that the audio + render loops read without re-subscribing
  const synthRef = useRef<HarmonographSynth | null>(null);
  const heldRef = useRef<NoteInput[]>([]);
  const pedaledRef = useRef<NoteInput[]>([]);
  const pedalRef = useRef(false);
  const dampingRef = useRef(damping);
  const jiRef = useRef(justIntonation);
  const echoRef = useRef(echoMidiOut);
  const midiOutRef = useRef<MIDIOutput | null>(null);
  const pressedKeys = useRef<Set<string>>(new Set());
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const captureRef = useRef<(() => void) | null>(null);
  const captureSvgRef = useRef<(() => void) | null>(null);
  const lastChordRef = useRef("idle");
  const lastCountRef = useRef(0);
  const octaveRef = useRef(octave);

  useEffect(() => {
    heldRef.current = held;
  }, [held]);
  useEffect(() => {
    pedaledRef.current = pedaledNotes;
  }, [pedaledNotes]);
  useEffect(() => {
    dampingRef.current = damping;
  }, [damping]);
  useEffect(() => {
    jiRef.current = justIntonation;
    octaveRef.current = octave;
  }, [justIntonation, octave]);
  useEffect(() => {
    echoRef.current = echoMidiOut;
  }, [echoMidiOut]);

  // ── note on/off (single path) ──────────────────────────────────────────────
  const lowestMidi = useCallback(() => {
    const cur = [...heldRef.current, ...pedaledRef.current];
    if (cur.length === 0) return 60;
    return cur.reduce((m, n) => Math.min(m, n.midi), Infinity);
  }, []);

  const sendMidiOut = useCallback((status: number, midi: number, vel: number) => {
    if (!echoRef.current) return;
    const out = midiOutRef.current;
    if (!out) return;
    try {
      out.send([status, midi, vel]);
    } catch {
      /* ignore */
    }
  }, []);

  const noteOn = useCallback(
    (midi: number, velocity: number) => {
      if (midi < 0 || midi > 127) return;
      // if this note was parked by the pedal, reclaim it as truly-held
      setPedaledNotes((prev) => {
        if (!prev.some((n) => n.midi === midi)) return prev;
        const next = prev.filter((n) => n.midi !== midi);
        pedaledRef.current = next;
        return next;
      });
      setHeld((prev) => {
        if (prev.some((n) => n.midi === midi)) return prev;
        const next = [...prev, { midi, velocity }];
        heldRef.current = next;
        const synth = synthRef.current;
        if (synth) {
          const all = [...next, ...pedaledRef.current];
          const low = all.reduce((m, n) => Math.min(m, n.midi), Infinity);
          synth.noteOn(midi, velocity, low);
          synth.retune(low);
        }
        return next;
      });
      sendMidiOut(0x90, midi, Math.round(velocity * 127));
    },
    [sendMidiOut]
  );

  const noteOff = useCallback(
    (midi: number) => {
      let parked: NoteInput | null = null;
      setHeld((prev) => {
        const found = prev.find((n) => n.midi === midi);
        if (!found) return prev;
        const next = prev.filter((n) => n.midi !== midi);
        heldRef.current = next;
        // while the pedal is down, the note keeps contributing to the figure
        if (pedalRef.current) parked = found;
        const synth = synthRef.current;
        if (synth) {
          // synth.noteOff parks the voice itself when the pedal is down
          synth.noteOff(midi);
        }
        return next;
      });
      if (parked) {
        setPedaledNotes((prev) => {
          if (prev.some((n) => n.midi === midi)) return prev;
          const next = [...prev, parked as NoteInput];
          pedaledRef.current = next;
          return next;
        });
      }
      // retune to whatever is still sounding (held + pedaled)
      const synth = synthRef.current;
      if (synth) {
        const all = [...heldRef.current, ...pedaledRef.current];
        if (all.length > 0) {
          const low = all.reduce((m, n) => Math.min(m, n.midi), Infinity);
          synth.retune(low);
        }
      }
      sendMidiOut(0x80, midi, 0);
    },
    [sendMidiOut]
  );

  // ── sustain pedal: hold / accrete released notes ────────────────────────────
  // When the pedal goes down we just flip a flag (synth keeps released voices
  // ringing, figure keeps drawing them). When it lifts, any note whose key is
  // already up is dropped from both the synth and the drawn figure.
  const applyPedal = useCallback((down: boolean) => {
    if (down === pedalRef.current) return;
    pedalRef.current = down;
    setPedal(down);
    const synth = synthRef.current;
    if (!down && synth) {
      // dropped = notes that were parked by the pedal (key already up)
      const dropped = synth.setPedal(false);
      if (dropped.length > 0) {
        setPedaledNotes((prev) => {
          const next = prev.filter((n) => !dropped.includes(n.midi));
          pedaledRef.current = next;
          return next;
        });
        const low = heldRef.current.reduce(
          (m, n) => Math.min(m, n.midi),
          Infinity
        );
        if (heldRef.current.length > 0) synth.retune(low);
      }
    } else if (synth) {
      synth.setPedal(true);
    }
  }, []);

  // global pendulum damping setter shared by CC1, arrow keys, slider
  const applyDamping = useCallback((v: number) => {
    const clamped = Math.max(0, Math.min(1, v));
    dampingRef.current = clamped;
    setDamping(clamped);
  }, []);

  // ── start audio (first gesture) ─────────────────────────────────────────────
  const startAudio = useCallback(async () => {
    if (synthRef.current) return;
    if (typeof window === "undefined") return;
    try {
      const Ctor =
        window.AudioContext ||
        (window as unknown as { webkitAudioContext: typeof AudioContext })
          .webkitAudioContext;
      const ctx = new Ctor();
      await ctx.resume();
      const synth = new HarmonographSynth(ctx);
      synth.setJustIntonation(jiRef.current);
      synthRef.current = synth;
      setStarted(true);
    } catch (e) {
      setGlError("Audio could not start: " + (e as Error).message);
    }
  }, []);

  // ── JI toggle retunes live voices ───────────────────────────────────────────
  useEffect(() => {
    const synth = synthRef.current;
    if (!synth) return;
    synth.setJustIntonation(justIntonation);
    synth.retune(lowestMidi());
  }, [justIntonation, lowestMidi]);

  // ── Web MIDI ────────────────────────────────────────────────────────────────
  useEffect(() => {
    if (typeof navigator === "undefined") return;
    if (typeof navigator.requestMIDIAccess !== "function") {
      setMidiStatus({ kind: "unsupported" });
      return;
    }
    let access: MIDIAccess | null = null;
    let cancelled = false;

    const handleMessage = (ev: MIDIMessageEvent) => {
      const data = ev.data;
      if (!data || data.length < 3) return;
      const status = data[0] & 0xf0;
      const d1 = data[1];
      const d2 = data[2];
      if (status === 0x90 && d2 > 0) {
        noteOn(d1, d2 / 127);
      } else if (status === 0x80 || (status === 0x90 && d2 === 0)) {
        noteOff(d1);
      } else if (status === 0xb0) {
        // control change
        if (d1 === 64) {
          // sustain pedal: ≥64 = down
          applyPedal(d2 >= 64);
        } else if (d1 === 1) {
          // mod-wheel → global pendulum damping
          applyDamping(d2 / 127);
        }
      }
    };

    const bind = (a: MIDIAccess) => {
      const names: string[] = [];
      a.inputs.forEach((input) => {
        input.onmidimessage = handleMessage;
        if (input.name) names.push(input.name);
      });
      const outs = Array.from(a.outputs.values());
      midiOutRef.current = outs[0] ?? null;
      setMidiOutAvail(outs.length > 0);
      if (names.length > 0) {
        setMidiStatus({ kind: "ready", device: names.join(", ") });
      } else {
        setMidiStatus({ kind: "none" });
      }
    };

    navigator
      .requestMIDIAccess({ sysex: false })
      .then((a) => {
        if (cancelled) return;
        access = a;
        bind(a);
        a.onstatechange = () => bind(a);
      })
      .catch((e: Error) => {
        if (!cancelled) setMidiStatus({ kind: "error", message: e.message });
      });

    return () => {
      cancelled = true;
      if (access) {
        access.inputs.forEach((input) => (input.onmidimessage = null));
        access.onstatechange = null;
      }
    };
  }, [noteOn, noteOff, applyPedal, applyDamping]);

  // ── QWERTY input ────────────────────────────────────────────────────────────
  useEffect(() => {
    if (typeof window === "undefined") return;

    const isTyping = () => {
      const el = document.activeElement;
      return (
        el instanceof HTMLInputElement ||
        el instanceof HTMLTextAreaElement ||
        (el instanceof HTMLElement && el.isContentEditable)
      );
    };

    const onKeyDown = (e: KeyboardEvent) => {
      if (isTyping() || e.metaKey || e.ctrlKey || e.altKey) return;
      // Space bar = sustain pedal (hold). Hardware-free fallback for CC64.
      if (e.key === " " || e.code === "Space") {
        e.preventDefault();
        if (!synthRef.current) startAudio();
        applyPedal(true);
        return;
      }
      // ↑ / ↓ sweep the global pendulum damping (hardware-free CC1 fallback)
      if (e.key === "ArrowUp") {
        e.preventDefault();
        applyDamping(dampingRef.current + 0.05);
        return;
      }
      if (e.key === "ArrowDown") {
        e.preventDefault();
        applyDamping(dampingRef.current - 0.05);
        return;
      }
      const k = e.key.toLowerCase();
      if (k === "z") {
        setOctave((o) => Math.max(1, o - 1));
        return;
      }
      if (k === "x") {
        setOctave((o) => Math.min(7, o + 1));
        return;
      }
      if (!(k in KEY_MAP)) return;
      e.preventDefault();
      if (pressedKeys.current.has(k)) return; // ignore auto-repeat
      pressedKeys.current.add(k);
      if (!synthRef.current) startAudio();
      const midi = octaveRef.current * 12 + 12 + KEY_MAP[k];
      noteOn(midi, 0.8);
    };

    const onKeyUp = (e: KeyboardEvent) => {
      if (e.key === " " || e.code === "Space") {
        applyPedal(false);
        return;
      }
      const k = e.key.toLowerCase();
      if (!(k in KEY_MAP)) return;
      if (!pressedKeys.current.has(k)) return;
      pressedKeys.current.delete(k);
      const midi = octaveRef.current * 12 + 12 + KEY_MAP[k];
      noteOff(midi);
    };

    window.addEventListener("keydown", onKeyDown);
    window.addEventListener("keyup", onKeyUp);
    return () => {
      window.removeEventListener("keydown", onKeyDown);
      window.removeEventListener("keyup", onKeyUp);
    };
  }, [noteOn, noteOff, startAudio, applyPedal, applyDamping]);

  // ── WebGL2 render loop ──────────────────────────────────────────────────────
  useEffect(() => {
    if (typeof window === "undefined") return;
    const canvas = canvasRef.current;
    if (!canvas) return;
    const gl = canvas.getContext("webgl2", {
      alpha: false,
      antialias: true,
      premultipliedAlpha: false,
      // keep the drawn frame readable for canvas.toBlob() PNG export
      preserveDrawingBuffer: true,
    });
    if (!gl) {
      setGlError("WebGL2 is unavailable in this browser.");
      return;
    }

    let renderer: GLRenderer;
    try {
      renderer = makeRenderer(gl, CURVE_POINTS);
    } catch (e) {
      setGlError("Renderer init failed: " + (e as Error).message);
      return;
    }

    const buf = new Float32Array(CURVE_POINTS * 2);
    // latest per-thread geometry, captured each frame for SVG export. Each entry
    // is a copy of the sampled (x,y) clip-space points + its pitch-class color.
    let lastThreads: Array<{
      points: Float32Array;
      count: number;
      color: [number, number, number];
    }> = [];
    let lastAspect = 1;
    let raf = 0;
    let rotate = 0;
    let cleared = false;
    const start = performance.now();

    const resize = () => {
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      const rect = canvas.getBoundingClientRect();
      renderer.resize(rect.width, rect.height, dpr);
      cleared = false;
    };
    resize();
    window.addEventListener("resize", resize);

    const frame = () => {
      const now = (performance.now() - start) / 1000;
      // held notes plus any notes parked by the sustain pedal (marked so the
      // geometry can decay them a little faster as the figure accretes).
      const heldNotes = heldRef.current;
      const pedaled = pedaledRef.current.map((n) => ({ ...n, pedaled: true }));
      const cur: NoteInput[] = [...heldNotes, ...pedaled];
      const ji = jiRef.current;
      const damp = dampingRef.current;

      if (!cleared) {
        renderer.clear();
        cleared = true;
      }
      // fade previous frame to leave a trail
      renderer.fade(cur.length > 0 ? 0.085 : 0.05);

      const aspect =
        gl.canvas.width / Math.max(1, gl.canvas.height);
      lastAspect = aspect;

      if (cur.length === 0) {
        // idle: a single dim violet Lissajous seed
        const pends = seedPendulums(now);
        rotate += 0.0015;
        const count = sampleCurve(buf, CURVE_POINTS, pends, rotate, T_MAX);
        renderer.drawCurve(buf, count, [0.42, 0.4, 0.7], aspect, 1);
        lastCountRef.current = count;
        lastThreads = [];
      } else {
        // POLYCHROME: each held note i draws the running composite of pendulums
        // 0..i in note i's circle-of-fifths hue, so a triad weaves from its
        // parts. buildPendulums sorts ascending, so index i matches the i-th
        // lowest of (held + pedaled) notes.
        const pends = buildPendulums(cur, ji, damp);
        const ink = inkIntensity(cur);
        rotate += 0.004 + cur.length * 0.0006;
        const sortedMidi = cur.map((n) => n.midi).sort((a, b) => a - b);
        const threads: typeof lastThreads = [];
        let totalCount = 0;
        for (let i = 0; i < pends.length; i++) {
          const color = pitchClassToColor(sortedMidi[i] ?? sortedMidi[0]);
          const count = sampleCompositeUpTo(
            buf,
            CURVE_POINTS,
            pends,
            i,
            rotate,
            T_MAX
          );
          renderer.drawCurve(buf, count, color, aspect, ink);
          totalCount = count;
          // copy points for SVG export (buf is reused next iteration)
          threads.push({
            points: buf.slice(0, count * 2),
            count,
            color,
          });
        }
        lastThreads = threads;
        lastCountRef.current = totalCount;
      }

      raf = window.requestAnimationFrame(frame);
    };
    raf = window.requestAnimationFrame(frame);

    // expose a snapshot capture closure for the PNG-export button. We use
    // preserveDrawingBuffer:true on the context so the readback is valid even
    // outside the rAF tick.
    captureRef.current = () => {
      const chord = lastChordRef.current
        .replace(/[^a-z0-9]+/gi, "-")
        .replace(/^-+|-+$/g, "")
        .toLowerCase();
      canvas.toBlob((blob) => {
        if (!blob) return;
        const url = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url;
        a.download = `harmonograph-${chord || "idle"}.png`;
        document.body.appendChild(a);
        a.click();
        a.remove();
        window.setTimeout(() => URL.revokeObjectURL(url), 1000);
      }, "image/png");
    };

    // SVG vector export: emit one <polyline> per colored thread from the EXACT
    // sampled clip-space points, mapping [-1,1] → a viewBox and applying the
    // same aspect correction the vertex shader does. A true printable vector
    // specimen (vs the PNG raster).
    captureSvgRef.current = () => {
      const threads = lastThreads;
      if (threads.length === 0) return;
      const W = 1000;
      const H = 1000;
      const aspect = lastAspect;
      // clip-space (x,y) in [-1,1] → SVG px, matching the shader's aspect fix
      const project = (x: number, y: number): [number, number] => {
        let px = x;
        let py = y;
        if (aspect > 1) px /= aspect;
        else py *= aspect;
        // clip y is up-positive; SVG y is down-positive → flip
        const sx = (px * 0.5 + 0.5) * W;
        const sy = (1 - (py * 0.5 + 0.5)) * H;
        return [sx, sy];
      };
      const toHex = (c: [number, number, number]) => {
        const h = (v: number) =>
          Math.round(Math.max(0, Math.min(1, v)) * 255)
            .toString(16)
            .padStart(2, "0");
        return `#${h(c[0])}${h(c[1])}${h(c[2])}`;
      };
      const lines: string[] = [];
      lines.push(
        `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">`
      );
      lines.push(`<rect width="${W}" height="${H}" fill="#06080d"/>`);
      for (const th of threads) {
        const coords: string[] = [];
        for (let i = 0; i < th.count; i++) {
          const [sx, sy] = project(th.points[i * 2], th.points[i * 2 + 1]);
          coords.push(`${sx.toFixed(2)},${sy.toFixed(2)}`);
        }
        lines.push(
          `<polyline fill="none" stroke="${toHex(
            th.color
          )}" stroke-width="1.4" stroke-opacity="0.85" stroke-linejoin="round" stroke-linecap="round" points="${coords.join(
            " "
          )}"/>`
        );
      }
      lines.push(`</svg>`);
      const chord = lastChordRef.current
        .replace(/[^a-z0-9]+/gi, "-")
        .replace(/^-+|-+$/g, "")
        .toLowerCase();
      const blob = new Blob([lines.join("\n")], {
        type: "image/svg+xml;charset=utf-8",
      });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `harmonograph-${chord || "idle"}.svg`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      window.setTimeout(() => URL.revokeObjectURL(url), 1000);
    };

    return () => {
      window.cancelAnimationFrame(raf);
      window.removeEventListener("resize", resize);
      captureRef.current = null;
      captureSvgRef.current = null;
      renderer.dispose();
    };
  }, []);

  // ── unmount: dispose synth ──────────────────────────────────────────────────
  useEffect(() => {
    return () => {
      const synth = synthRef.current;
      if (synth) {
        synth.dispose();
        void synth.ctx.close().catch(() => {});
        synthRef.current = null;
      }
    };
  }, []);

  // ── derived HUD values ──────────────────────────────────────────────────────
  const heldMidis = held.map((n) => n.midi);
  const pedaledMidis = pedaledNotes.map((n) => n.midi);
  const figureMidis = [...heldMidis, ...pedaledMidis];
  const sortedMidis = [...heldMidis].sort((a, b) => a - b);
  const figureChord = guessChord(figureMidis);
  lastChordRef.current = figureChord;
  const baseMidi = sortedMidis[0];
  const ratioSet =
    sortedMidis.length > 0
      ? sortedMidis
          .map((m) => {
            const raw = midiToFreq(m) / midiToFreq(baseMidi);
            if (justIntonation) return ratioLabel(snapToJustRatio(raw));
            return raw.toFixed(3);
          })
          .join(" : ")
      : "—";

  // legend: one swatch per drawn thread (full figure = held + pedaled, sorted
  // ascending — matches the polychrome render's per-note threads).
  const legendMidis = [...figureMidis].sort((a, b) => a - b);
  const rgbToCss = (c: [number, number, number]) =>
    `rgb(${Math.round(c[0] * 255)}, ${Math.round(c[1] * 255)}, ${Math.round(
      c[2] * 255
    )})`;

  // ── on-screen keyboard handlers ─────────────────────────────────────────────
  const screenBase = octave * 12 + 12;
  const onKeyDownScreen = (midi: number) => (e: React.PointerEvent) => {
    e.preventDefault();
    (e.target as HTMLElement).setPointerCapture?.(e.pointerId);
    if (!synthRef.current) startAudio();
    noteOn(midi, 0.85);
  };
  const onKeyUpScreen = (midi: number) => (e: React.PointerEvent) => {
    e.preventDefault();
    noteOff(midi);
  };

  return (
    <main className="min-h-screen w-full bg-[#06080d] text-white overflow-hidden relative">
      <Link
        href="/dream"
        className="fixed top-4 left-4 z-30 text-base text-white/75 hover:text-white px-4 py-2.5 rounded-lg bg-white/5 hover:bg-white/10 backdrop-blur transition-colors"
      >
        ← dream lab
      </Link>

      <button
        onClick={() => setShowNotes((s) => !s)}
        className="fixed top-4 right-4 z-30 text-base text-white/75 hover:text-white px-4 py-2.5 rounded-lg bg-white/5 hover:bg-white/10 backdrop-blur transition-colors"
      >
        Design notes
      </button>

      {/* GL canvas fills the screen */}
      <canvas
        ref={canvasRef}
        className="fixed inset-0 h-full w-full"
        style={{ touchAction: "none" }}
      />

      {glError && (
        <div className="fixed top-1/3 left-1/2 -translate-x-1/2 z-20 text-rose-300 text-base bg-black/60 px-5 py-3 rounded-lg max-w-md text-center">
          {glError} The keyboard and synth still work.
        </div>
      )}

      {/* Hero / controls overlay */}
      <div className="relative z-10 pointer-events-none flex flex-col min-h-screen">
        <header className="px-6 pt-20 max-w-2xl pointer-events-none">
          <h1 className="text-2xl md:text-3xl font-semibold text-white tracking-tight">
            Harmonograph — Spectrum
          </h1>
          <p className="mt-2 text-base text-white/75 max-w-xl">
            Play a chord — MIDI, computer keys, or the on-screen piano — and watch
            the harmony draw itself as a Victorian pendulum figure where{" "}
            <span className="text-violet-300">every note draws its own colored
            thread</span>: hues step by the circle of fifths, so a triad weaves
            from three kindred colors. Sculpt it live — the{" "}
            <span className="text-violet-300">sustain pedal</span> (Space / CC64)
            accretes layered chords, the{" "}
            <span className="text-violet-300">mod-wheel</span> (CC1 / ↑↓) sweeps
            pendulum damping from loose sprawl to tight spiral, harder strikes
            draw brighter ink. Export the figure as a PNG or a printable{" "}
            <span className="text-emerald-300/95">vector SVG specimen</span>.
          </p>

          {!started && (
            <button
              onClick={startAudio}
              className="mt-5 pointer-events-auto text-base font-medium px-6 py-3 rounded-xl bg-violet-500/30 hover:bg-violet-500/45 text-violet-100 border border-violet-400/40 transition-colors"
            >
              ▶ Start sound
            </button>
          )}

          {/* status line */}
          <div className="mt-4 text-base flex flex-wrap gap-x-4 gap-y-1">
            {midiStatus?.kind === "ready" && (
              <span className="text-emerald-300/95">
                MIDI: {midiStatus.device}
              </span>
            )}
            {midiStatus?.kind === "none" && (
              <span className="text-amber-300/95">
                MIDI ready — no device connected. Use the keyboard below.
              </span>
            )}
            {midiStatus?.kind === "unsupported" && (
              <span className="text-amber-300/95">
                Web MIDI unsupported here (e.g. Safari) — QWERTY + on-screen
                keyboard still work fully.
              </span>
            )}
            {midiStatus?.kind === "error" && (
              <span className="text-amber-300/95">
                MIDI blocked: {midiStatus.message}. Keyboard still works.
              </span>
            )}
          </div>
        </header>

        <div className="flex-1" />

        {/* HUD + toggles */}
        <section className="px-6 pb-3 pointer-events-auto">
          <div className="flex flex-wrap items-center gap-3 mb-3">
            <button
              onClick={() => setJustIntonation((j) => !j)}
              className={`text-base font-medium px-4 py-2.5 rounded-xl border transition-colors ${
                justIntonation
                  ? "bg-emerald-500/25 border-emerald-400/50 text-emerald-100"
                  : "bg-white/5 border-white/15 text-white/75 hover:bg-white/10"
              }`}
            >
              Pure tuning (Just Intonation): {justIntonation ? "ON" : "OFF"}
            </button>

            {midiOutAvail && (
              <button
                onClick={() => setEchoMidiOut((e) => !e)}
                className={`text-base px-4 py-2.5 rounded-xl border transition-colors ${
                  echoMidiOut
                    ? "bg-violet-500/25 border-violet-400/50 text-violet-100"
                    : "bg-white/5 border-white/15 text-white/75 hover:bg-white/10"
                }`}
              >
                Echo to MIDI out: {echoMidiOut ? "ON" : "OFF"}
              </button>
            )}

            <div className="flex items-center gap-2 text-base text-white/75">
              <button
                onClick={() => setOctave((o) => Math.max(1, o - 1))}
                className="px-4 py-2.5 rounded-xl bg-white/5 border border-white/15 hover:bg-white/10 min-w-[44px]"
              >
                −
              </button>
              <span className="tabular-nums">Octave {octave}</span>
              <button
                onClick={() => setOctave((o) => Math.min(7, o + 1))}
                className="px-4 py-2.5 rounded-xl bg-white/5 border border-white/15 hover:bg-white/10 min-w-[44px]"
              >
                +
              </button>
            </div>

            {/* sustain pedal — press-and-hold (or Space / CC64) */}
            <button
              onPointerDown={(e) => {
                e.preventDefault();
                if (!synthRef.current) startAudio();
                applyPedal(true);
              }}
              onPointerUp={() => applyPedal(false)}
              onPointerLeave={() => pedal && applyPedal(false)}
              onPointerCancel={() => applyPedal(false)}
              className={`text-base font-medium px-4 py-2.5 rounded-xl border transition-colors min-h-[44px] select-none ${
                pedal
                  ? "bg-violet-500/35 border-violet-400/60 text-violet-100"
                  : "bg-white/5 border-white/15 text-white/75 hover:bg-white/10"
              }`}
              style={{ touchAction: "none" }}
            >
              Sustain pedal: {pedal ? "DOWN" : "up"} (hold / Space / CC64)
            </button>

            {/* PNG snapshot export */}
            <button
              onClick={() => captureRef.current?.()}
              disabled={!!glError}
              className="text-base font-medium px-4 py-2.5 rounded-xl border border-violet-400/40 bg-violet-500/20 text-violet-200 hover:bg-violet-500/35 transition-colors min-h-[44px] disabled:opacity-40"
            >
              ⤓ Export PNG
            </button>

            {/* SVG vector export — one polyline per colored thread */}
            <button
              onClick={() => captureSvgRef.current?.()}
              disabled={!!glError || figureMidis.length === 0}
              className="text-base font-medium px-4 py-2.5 rounded-xl border border-emerald-400/40 bg-emerald-500/20 text-emerald-200 hover:bg-emerald-500/35 transition-colors min-h-[44px] disabled:opacity-40"
            >
              ⤓ Export SVG
            </button>
          </div>

          {/* damping (mod-wheel CC1 / ↑↓ / slider) */}
          <div className="flex flex-wrap items-center gap-3 mb-3">
            <label className="flex items-center gap-3 text-base text-white/75">
              <span className="text-white/75">Pendulum damping</span>
              <input
                type="range"
                min={0}
                max={1}
                step={0.01}
                value={damping}
                onChange={(e) => applyDamping(parseFloat(e.target.value))}
                className="w-44 accent-violet-400"
                aria-label="Pendulum damping"
              />
              <span className="font-mono text-base text-violet-300 tabular-nums w-14">
                {(damping * 100).toFixed(0)}%
              </span>
              <span className="text-base text-white/75">
                {damping < 0.33
                  ? "loose / sprawling"
                  : damping < 0.66
                  ? "balanced"
                  : "tight spiral"}
              </span>
            </label>
            <span className="text-base text-white/55">
              mod-wheel CC1 · ↑ / ↓ keys
            </span>
          </div>

          {/* readout */}
          <div className="font-mono text-base flex flex-wrap gap-x-6 gap-y-1 mb-3">
            <span className="text-white/75">
              held:{" "}
              <span className="text-white/95">
                {sortedMidis.length > 0
                  ? sortedMidis.map((m) => noteName(m)).join(" ")
                  : "—"}
              </span>
            </span>
            <span className="text-white/75">
              pedaled:{" "}
              <span className="text-violet-300">
                {pedaledMidis.length > 0
                  ? [...pedaledMidis]
                      .sort((a, b) => a - b)
                      .map((m) => noteName(m))
                      .join(" ")
                  : "—"}
              </span>
            </span>
            <span className="text-white/75">
              chord:{" "}
              <span className="text-violet-300">{figureChord}</span>
            </span>
            <span className="text-white/75">
              ratios:{" "}
              <span
                className={
                  justIntonation ? "text-emerald-300/95" : "text-amber-300/95"
                }
              >
                {ratioSet}
              </span>
            </span>
          </div>

          {/* color legend — swatch per thread, circle-of-fifths hue */}
          {legendMidis.length > 0 && (
            <div className="flex flex-wrap items-center gap-3 mb-1">
              <span className="text-base text-white/75">threads:</span>
              {legendMidis.map((m, i) => (
                <span
                  key={`${m}-${i}`}
                  className="inline-flex items-center gap-2 font-mono text-base text-white/95"
                >
                  <span
                    className="inline-block rounded-sm border border-white/25"
                    style={{
                      width: 16,
                      height: 16,
                      backgroundColor: rgbToCss(pitchClassToColor(m)),
                    }}
                    aria-hidden
                  />
                  {noteName(m)}
                </span>
              ))}
            </div>
          )}
        </section>

        {/* on-screen keyboard */}
        <section className="px-3 pb-4 pointer-events-auto select-none">
          <div className="relative mx-auto max-w-3xl h-40">
            {/* white keys */}
            <div className="absolute inset-0 flex gap-0.5">
              {WHITE_OFFSETS.map((off) => {
                const midi = screenBase + off;
                const isHeld = heldMidis.includes(midi);
                const isPedaled = pedaledMidis.includes(midi);
                return (
                  <button
                    key={off}
                    onPointerDown={onKeyDownScreen(midi)}
                    onPointerUp={onKeyUpScreen(midi)}
                    onPointerLeave={onKeyUpScreen(midi)}
                    onPointerCancel={onKeyUpScreen(midi)}
                    className={`flex-1 rounded-b-md border border-black/40 flex items-end justify-center pb-2 text-xs transition-colors ${
                      isHeld
                        ? "bg-violet-300 text-black"
                        : isPedaled
                        ? "bg-violet-300/40 text-black/70"
                        : "bg-white/90 text-black/60 hover:bg-white"
                    }`}
                    style={{ minWidth: 44, touchAction: "none" }}
                  >
                    {noteName(midi)}
                  </button>
                );
              })}
            </div>
            {/* black keys */}
            <div className="absolute inset-0 pointer-events-none">
              {BLACK_SPEC.map((b) => {
                const midi = screenBase + b.offset;
                const isHeld = heldMidis.includes(midi);
                const isPedaled = pedaledMidis.includes(midi);
                const leftPct =
                  ((b.afterWhite + 1) / WHITE_OFFSETS.length) * 100;
                return (
                  <button
                    key={b.offset}
                    onPointerDown={onKeyDownScreen(midi)}
                    onPointerUp={onKeyUpScreen(midi)}
                    onPointerLeave={onKeyUpScreen(midi)}
                    onPointerCancel={onKeyUpScreen(midi)}
                    className={`absolute top-0 h-24 rounded-b-md border border-black/60 pointer-events-auto transition-colors ${
                      isHeld
                        ? "bg-violet-400"
                        : isPedaled
                        ? "bg-violet-500/50"
                        : "bg-black hover:bg-zinc-800"
                    }`}
                    style={{
                      left: `calc(${leftPct}% - 14px)`,
                      width: 28,
                      minWidth: 28,
                      touchAction: "none",
                    }}
                  />
                );
              })}
            </div>
          </div>
          <p className="text-center text-base text-white/55 mt-2">
            QWERTY: a w s e d f t g y h u j k o l p ;  ·  z / x = octave  ·{" "}
            Space = sustain pedal  ·  ↑ / ↓ = damping
          </p>
        </section>
      </div>

      {/* Design notes panel */}
      {showNotes && (
        <div className="fixed inset-0 z-40 flex items-center justify-center bg-black/70 p-6">
          <div className="max-w-lg max-h-[80vh] overflow-y-auto bg-[#0c1018] border border-white/15 rounded-2xl p-6 text-base text-white/85 space-y-3">
            <div className="flex items-center justify-between">
              <h2 className="text-2xl font-semibold text-white">Design notes</h2>
              <button
                onClick={() => setShowNotes(false)}
                className="px-4 py-2.5 rounded-lg bg-white/10 hover:bg-white/20 text-base"
              >
                Close
              </button>
            </div>
            <p>
              A <strong>harmonograph</strong> (Hugh Blackburn pendulum apparatus,
              ~1840s) traces a curve from decaying pendulums. Here each held note
              is a pendulum whose frequency ratio is taken against the lowest
              note. Consonant chords yield small-integer ratios → a near-closed,
              clean figure; equal-temperament ratios are irrational → the line
              drifts and tangles. The shapes are kin to{" "}
              <strong>Lissajous figures</strong> (Jules Antoine Lissajous, 1857).
            </p>
            <p>
              Toggling <strong>Pure tuning</strong> snaps every ratio to the
              nearest just interval, for both the synth pitch and the drawn
              geometry — so the beating audibly settles as the figure visibly
              tidies, at the same instant.
            </p>
            <p>
              <strong>Cycle 2 — the expressive live instrument.</strong> Four
              performance layers now sculpt the figure as it draws:
            </p>
            <ul className="list-disc pl-5 space-y-2 text-white/85">
              <li>
                <strong>Sustain pedal</strong> (MIDI CC64, Space bar, or the
                on-screen pad): while down, released notes are not removed — they
                keep contributing their decaying pendulum so the figure{" "}
                <em>accretes</em> as you layer chords. The HUD shows held vs
                pedaled notes; release drops the parked ones, audio and figure
                together.
              </li>
              <li>
                <strong>Mod-wheel → damping</strong> (MIDI CC1, ↑ / ↓ keys, or the
                slider): scales every pendulum&apos;s decay. Low = long-lived,
                sprawling figure; high = fast inward spiral.
              </li>
              <li>
                <strong>Velocity → ink intensity</strong>: harder-struck chords
                draw a brighter, bolder curve, so dynamics are visible.
              </li>
              <li>
                <strong>PNG export</strong>: captures the current figure
                (preserveDrawingBuffer + <code>canvas.toBlob</code>) as a
                downloadable image named for the chord.
              </li>
            </ul>
            <p className="text-white/75">
              Input: Web MIDI / computer keyboard / on-screen piano. Output: a raw
              WebGL2 line-strip ink trail. Web MIDI exists elsewhere in this lab;
              the novel idea here is harmony-as-visible-geometry, sculpted in real
              time. See the folder README.md for full notes and future directions.
            </p>
          </div>
        </div>
      )}
    </main>
  );
}
