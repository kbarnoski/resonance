"use client";

import { useEffect, useRef, useState } from "react";
import { PrototypeNav } from "../_shared/prototype-nav";

/* ------------------------------------------------------------------ *
 * 1682 · cadence-forge
 * Play equal-tempered functional harmony that modulates and BITES,
 * and watch a real tonal-tension curve rise and resolve as you do.
 * Pure Web Audio (12-TET) + Canvas2D. Deterministic ghost self-demo.
 * ------------------------------------------------------------------ */

/* ---------- theory tables ---------------------------------------- */

type Mode = "major" | "minor";
type Key = { tonic: number; mode: Mode };
type Chord = {
  pcs: number[];
  rootPc: number;
  bassPc: number;
  label: string;
  hier: number;
};
type Voicing = number[]; // [bass, tenor, alto, soprano]
type Components = {
  diss: number;
  hier: number;
  tonal: number;
  vl: number;
  total: number;
};
type Kind = "peak" | "dip" | "mid";
type Sample = { v: number; label?: string; kind?: Kind };

const NOTE_NAMES = [
  "C",
  "C♯",
  "D",
  "E♭",
  "E",
  "F",
  "F♯",
  "G",
  "A♭",
  "A",
  "B♭",
  "B",
];
const KEY_LETTERS = ["A", "S", "D", "F", "G", "H", "J"];
const MAJOR_NUMERALS = ["I", "ii", "iii", "IV", "V", "vi", "vii°"];
const MINOR_NUMERALS = ["i", "ii°", "III", "iv", "V", "VI", "vii°"];
// pitch-class offsets from tonic for each diatonic triad
const MAJOR_OFFSETS = [
  [0, 4, 7],
  [2, 5, 9],
  [4, 7, 11],
  [5, 9, 0],
  [7, 11, 2],
  [9, 0, 4],
  [11, 2, 5],
];
const MINOR_OFFSETS = [
  [0, 3, 7],
  [2, 5, 8],
  [3, 7, 10],
  [5, 8, 0],
  [7, 11, 2], // V uses raised leading-tone (harmonic minor)
  [8, 0, 3],
  [11, 2, 5], // vii° uses raised leading-tone
];
// hierarchical tension per diatonic degree (distance of function from tonic)
const HIER_DEGREE = [0.0, 0.42, 0.3, 0.45, 0.62, 0.28, 0.7];

const BASE_KEY: Key = { tonic: 0, mode: "major" }; // C major

/* related-key cycle used by both mouse + keyboard + ghost modulations */
const MOD_CYCLE: ((b: Key) => Key)[] = [
  (b) => ({ tonic: (b.tonic + 7) % 12, mode: b.mode }), // dominant
  (b) => ({ tonic: (b.tonic + 9) % 12, mode: "minor" }), // relative minor
  (b) => ({ tonic: (b.tonic + 5) % 12, mode: b.mode }), // subdominant
  (b) => ({ tonic: b.tonic, mode: b.mode }), // home
];

/* ---------- pure helpers ----------------------------------------- */

function clamp(x: number, lo: number, hi: number) {
  return x < lo ? lo : x > hi ? hi : x;
}
function clamp01(x: number) {
  return clamp(x, 0, 1);
}
function pc(n: number) {
  return ((n % 12) + 12) % 12;
}
function noteName(n: number) {
  return NOTE_NAMES[pc(n)];
}
function keyName(k: Key) {
  return `${noteName(k.tonic)} ${k.mode}`;
}
function midiToFreq(m: number) {
  return 440 * Math.pow(2, (m - 69) / 12);
}
function intervalClass(a: number, b: number) {
  const d = pc(a - b);
  return Math.min(d, 12 - d);
}
function chromaVec(pcs: number[]) {
  const v = new Array(12).fill(0);
  pcs.forEach((p) => (v[pc(p)] = 1));
  return v;
}

// mean interval-class dissonance of the chord's pitch classes
const IC_DISS = [0, 1.0, 0.5, 0.15, 0.1, 0.2, 0.95];
function chordDissonance(pcs: number[]) {
  let sum = 0;
  let n = 0;
  for (let i = 0; i < pcs.length; i++) {
    for (let j = i + 1; j < pcs.length; j++) {
      sum += IC_DISS[intervalClass(pcs[i], pcs[j])];
      n++;
    }
  }
  return clamp01(n ? sum / n / 0.55 : 0);
}

function tonicTriadPcs(k: Key) {
  const off = k.mode === "major" ? [0, 4, 7] : [0, 3, 7];
  return off.map((o) => pc(k.tonic + o));
}
// chroma-vector cosine distance from the current key's tonic triad
function tonalDistance(pcs: number[], k: Key) {
  const a = chromaVec(pcs);
  const b = chromaVec(tonicTriadPcs(k));
  let dot = 0;
  let na = 0;
  let nb = 0;
  for (let i = 0; i < 12; i++) {
    dot += a[i] * b[i];
    na += a[i] * a[i];
    nb += b[i] * b[i];
  }
  const cos = na && nb ? dot / (Math.sqrt(na) * Math.sqrt(nb)) : 0;
  return clamp01(1 - cos);
}

// weighted scalar tension after the TIV model (Entropy 2020)
// weights: dissonance .402 · hierarchical .246 · tonal-distance .202 · voice-leading .193
function computeTension(chord: Chord, k: Key, motion: number): Components {
  const diss = chordDissonance(chord.pcs);
  const hier = chord.hier;
  const tonal = tonalDistance(chord.pcs, k);
  const vl = clamp01(motion / 24);
  const total = clamp01(
    (0.402 * diss + 0.246 * hier + 0.202 * tonal + 0.193 * vl) / 1.043,
  );
  return { diss, hier, tonal, vl, total };
}

/* ---------- chord builders --------------------------------------- */

function diatonicNumerals(k: Key) {
  return k.mode === "major" ? MAJOR_NUMERALS : MINOR_NUMERALS;
}
function diatonicTriad(k: Key, degree: number): Chord {
  const off = k.mode === "major" ? MAJOR_OFFSETS : MINOR_OFFSETS;
  const pcs = off[degree].map((o) => pc(k.tonic + o));
  return {
    pcs,
    rootPc: pcs[0],
    bassPc: pcs[0],
    label: diatonicNumerals(k)[degree],
    hier: HIER_DEGREE[degree],
  };
}
function dominant7(k: Key): Chord {
  const root = pc(k.tonic + 7);
  const pcs = [0, 4, 7, 10].map((o) => pc(root + o));
  return { pcs, rootPc: root, bassPc: root, label: "V7", hier: 0.78 };
}
function vii07(k: Key): Chord {
  const root = pc(k.tonic + 11); // leading tone
  const pcs = [0, 3, 6, 9].map((o) => pc(root + o)); // fully diminished
  return { pcs, rootPc: root, bassPc: root, label: "vii°7", hier: 1.0 };
}
// applied / secondary dominant: V7 that tonicizes the given degree
function appliedDominant(k: Key, degree: number): Chord {
  const target = diatonicTriad(k, degree);
  const root = pc(target.rootPc + 7);
  const pcs = [0, 4, 7, 10].map((o) => pc(root + o));
  const name = diatonicNumerals(k)[degree].replace("°", "");
  return { pcs, rootPc: root, bassPc: root, label: `V7/${name}`, hier: 0.85 };
}
function pivotChord(from: Key): Chord {
  const pcs = tonicTriadPcs(from);
  return { pcs, rootPc: pcs[0], bassPc: pcs[0], label: "pivot", hier: 0.4 };
}

/* ---------- voice leading (SATB) --------------------------------- */

const BASS_CENTER = 45;
const UPPER_CENTERS = [55, 62, 69]; // tenor / alto / soprano

function nearestMidiToRef(p: number, ref: number) {
  const d = pc(p - ref);
  const up = ref + d;
  return d <= 6 ? up : up - 12;
}
function windowMidi(m: number, lo: number, hi: number) {
  let x = m;
  while (x < lo) x += 12;
  while (x > hi) x -= 12;
  return x;
}

// realize a chord into 4 voices, keeping common tones and minimizing motion
function realizeVoicing(chord: Chord, prev: Voicing | null): Voicing {
  const bass = clamp(nearestMidiToRef(chord.bassPc, BASS_CENTER), 38, 55);
  const prevUpper = prev ? prev.slice(1) : null;
  const refs = prevUpper ?? UPPER_CENTERS;
  const lo = Math.max(bass + 2, 48);
  const hi = 82;

  let best: number[] | null = null;
  let bestScore = -Infinity;
  const p = chord.pcs;
  for (const a of p) {
    for (const b of p) {
      for (const c of p) {
        const cand = [a, b, c]
          .map((x, i) => windowMidi(nearestMidiToRef(x, refs[i]), lo, hi))
          .sort((x, y) => x - y);
        const covered = new Set(
          [bass, ...cand].map((m) => pc(m)),
        ).size;
        let motion = 0;
        if (prevUpper) {
          const ps = [...prevUpper].sort((x, y) => x - y);
          motion =
            Math.abs(cand[0] - ps[0]) +
            Math.abs(cand[1] - ps[1]) +
            Math.abs(cand[2] - ps[2]);
        }
        const score = covered * 100 - motion;
        if (score > bestScore) {
          bestScore = score;
          best = cand;
        }
      }
    }
  }
  return [bass, ...(best ?? UPPER_CENTERS)];
}

function voicingMotion(a: Voicing, b: Voicing) {
  let m = 0;
  for (let i = 0; i < 4; i++) m += Math.abs(a[i] - b[i]);
  return m;
}

/* ---------- audio ------------------------------------------------ */

type AudioNodes = {
  ctx: AudioContext;
  master: GainNode;
  comp: DynamicsCompressorNode;
};
type ActiveVoice = { oscs: OscillatorNode[]; gain: GainNode };

const DETUNE = [-5, -3, 3, 5]; // fixed per-voice detune (deterministic)

function buildAudio(): AudioNodes | null {
  const Ctx =
    typeof window !== "undefined"
      ? window.AudioContext ||
        (window as unknown as { webkitAudioContext?: typeof AudioContext })
          .webkitAudioContext
      : undefined;
  if (!Ctx) return null;
  const ctx = new Ctx();
  const master = ctx.createGain();
  master.gain.value = 0.12; // master gain ≤ 0.14
  const lp = ctx.createBiquadFilter();
  lp.type = "lowpass";
  lp.frequency.value = 3200;
  const comp = ctx.createDynamicsCompressor();
  master.connect(lp);
  lp.connect(comp);
  comp.connect(ctx.destination);
  return { ctx, master, comp };
}

/* ---------- component -------------------------------------------- */

export default function CadenceForge() {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const apiRef = useRef<{
    playDegree: (i: number) => void;
    playV7: () => void;
    playVii07: () => void;
    playApplied: (i: number) => void;
    modulate: () => void;
    deceptive: () => void;
    unlock: () => void;
  } | null>(null);

  const [keyLabel, setKeyLabel] = useState(keyName(BASE_KEY));
  const [numerals, setNumerals] = useState(diatonicNumerals(BASE_KEY));
  const [chordLabel, setChordLabel] = useState("—");
  const [activeDegree, setActiveDegree] = useState<number | null>(null);
  const [comps, setComps] = useState<Components>({
    diss: 0,
    hier: 0,
    tonal: 0,
    vl: 0,
    total: 0,
  });
  const [audioState, setAudioState] = useState<
    "unsupported" | "idle" | "ready"
  >("idle");
  const [notesOpen, setNotesOpen] = useState(false);

  useEffect(() => {
    const Ctx =
      typeof window !== "undefined"
        ? window.AudioContext ||
          (window as unknown as { webkitAudioContext?: typeof AudioContext })
            .webkitAudioContext
        : undefined;
    if (!Ctx) setAudioState("unsupported");

    /* --- engine state (all in a mutable object, never React state) --- */
    const RIBBON_N = 240;
    const engine = {
      key: { ...BASE_KEY } as Key,
      prev: null as Voicing | null,
      ribbon: Array.from({ length: RIBBON_N }, () => ({ v: 0 }) as Sample),
      frame: 0,
      ghostIndex: 0,
      lastUserFrame: -9999,
      disp: 0,
      target: 0,
      modIndex: 0,
      pending: [] as { chord: Chord; atFrame: number }[],
      pendingLabel: undefined as
        | { label: string; kind: Kind }
        | undefined,
      voices: [] as ActiveVoice[],
    };
    let audio: AudioNodes | null = null;

    /* --- audio trigger --- */
    function triggerAudio(midis: number[]) {
      if (!audio) return;
      const { ctx, master } = audio;
      const now = ctx.currentTime;
      // release the previous chord
      for (const v of engine.voices) {
        v.gain.gain.cancelScheduledValues(now);
        v.gain.gain.setValueAtTime(v.gain.gain.value, now);
        v.gain.gain.linearRampToValueAtTime(0.0001, now + 0.28);
        v.oscs.forEach((o) => o.stop(now + 0.32));
      }
      engine.voices = [];
      midis.forEach((m, idx) => {
        const freq = midiToFreq(m);
        const g = ctx.createGain();
        const peak = idx === 0 ? 0.5 : 0.42; // bass a touch stronger
        g.gain.setValueAtTime(0.0001, now);
        g.gain.linearRampToValueAtTime(peak, now + 0.02); // attack
        g.gain.linearRampToValueAtTime(peak * 0.7, now + 0.2); // decay→sustain
        g.connect(master);
        const saw = ctx.createOscillator();
        saw.type = "sawtooth";
        saw.frequency.value = freq;
        saw.detune.value = DETUNE[idx % 4];
        const sawGain = ctx.createGain();
        sawGain.gain.value = 0.55;
        saw.connect(sawGain);
        sawGain.connect(g);
        const sine = ctx.createOscillator();
        sine.type = "sine";
        sine.frequency.value = freq;
        const sineGain = ctx.createGain();
        sineGain.gain.value = 0.45;
        sine.connect(sineGain);
        sineGain.connect(g);
        saw.start(now);
        sine.start(now);
        engine.voices.push({ oscs: [saw, sine], gain: g });
      });
    }

    /* --- the shared realize→voice→tension→render path --- */
    function playChord(chord: Chord, fromUser: boolean) {
      const voicing = realizeVoicing(chord, engine.prev);
      const motion = engine.prev ? voicingMotion(voicing, engine.prev) : 0;
      const c = computeTension(chord, engine.key, motion);
      engine.prev = voicing;
      engine.target = c.total;
      const kind: Kind =
        c.total > 0.58 ? "peak" : c.total < 0.24 ? "dip" : "mid";
      engine.pendingLabel = { label: chord.label, kind };
      triggerAudio(voicing);
      setChordLabel(chord.label);
      setComps(c);
      if (fromUser) engine.lastUserFrame = engine.frame;
    }

    function enqueue(chord: Chord, delay: number) {
      engine.pending.push({ chord, atFrame: engine.frame + delay });
    }

    /* --- high-level moves --- */
    function playDegree(i: number, fromUser = true) {
      setActiveDegree(i);
      playChord(diatonicTriad(engine.key, i), fromUser);
    }
    function playV7(fromUser = true) {
      setActiveDegree(null);
      playChord(dominant7(engine.key), fromUser);
    }
    function playVii07(fromUser = true) {
      setActiveDegree(null);
      playChord(vii07(engine.key), fromUser);
    }
    function playApplied(i: number, fromUser = true) {
      setActiveDegree(null);
      playChord(appliedDominant(engine.key, i), fromUser);
    }
    function deceptive(fromUser = true) {
      setActiveDegree(null);
      playChord(dominant7(engine.key), fromUser); // V7 …
      enqueue(diatonicTriad(engine.key, 5), 56); // … resolves to vi (not I)
    }
    function modulate(fromUser = true) {
      const from = engine.key;
      const next = MOD_CYCLE[engine.modIndex](BASE_KEY);
      engine.modIndex = (engine.modIndex + 1) % MOD_CYCLE.length;
      engine.key = next;
      setKeyLabel(keyName(next));
      setNumerals(diatonicNumerals(next));
      setActiveDegree(null);
      playChord(pivotChord(from), fromUser); // pivot (common chord)
      enqueue(dominant7(next), 56); // new V7 …
      enqueue(diatonicTriad(next, 0), 112); // … resolves to new I
    }

    function unlock() {
      if (audioState === "unsupported") return;
      if (!audio) {
        audio = buildAudio();
        if (!audio) {
          setAudioState("unsupported");
          return;
        }
      }
      void audio.ctx.resume().then(() => setAudioState("ready"));
    }

    apiRef.current = {
      playDegree: (i) => playDegree(i, true),
      playV7: () => playV7(true),
      playVii07: () => playVii07(true),
      playApplied: (i) => playApplied(i, true),
      modulate: () => modulate(true),
      deceptive: () => deceptive(true),
      unlock,
    };

    /* --- deterministic ghost self-demo (frame-driven, no audio clock) --- */
    const ghost: (() => void)[] = [
      () => playDegree(0, false), // I
      () => playDegree(5, false), // vi
      () => playDegree(3, false), // IV
      () => playApplied(4, false), // V7/V (applied dominant, bites)
      () => playV7(false), // V7
      () => playDegree(0, false), // I
      () => modulate(false), // pivot → new key (V7 → I)
      () => playDegree(0, false), // I (new key)
      () => deceptive(false), // V7 → vi (deceptive cadence)
      () => playDegree(0, false), // I
    ];
    const STEP = 84; // frames between ghost chords (~1.4s @60fps)
    const IDLE = 240; // frames of user silence before ghost resumes

    /* --- canvas draw --- */
    function drawRibbon() {
      const canvas = canvasRef.current;
      if (!canvas) return;
      const ctx2d = canvas.getContext("2d");
      if (!ctx2d) return;
      const dpr =
        typeof window !== "undefined" ? window.devicePixelRatio || 1 : 1;
      const cw = canvas.clientWidth || 640;
      const ch = canvas.clientHeight || 220;
      if (canvas.width !== Math.round(cw * dpr)) canvas.width = cw * dpr;
      if (canvas.height !== Math.round(ch * dpr)) canvas.height = ch * dpr;
      ctx2d.setTransform(dpr, 0, 0, dpr, 0, 0);

      // art surface
      ctx2d.fillStyle = "#0b0b12";
      ctx2d.fillRect(0, 0, cw, ch);

      const padT = 26;
      const padB = 22;
      const h = ch - padT - padB;
      const N = engine.ribbon.length;
      const yOf = (v: number) => padT + (1 - v) * h;
      const xOf = (i: number) => (i / (N - 1)) * cw;

      // grid
      ctx2d.strokeStyle = "rgba(148,130,220,0.08)";
      ctx2d.lineWidth = 1;
      for (let g = 0; g <= 4; g++) {
        const y = padT + (g / 4) * h;
        ctx2d.beginPath();
        ctx2d.moveTo(0, y);
        ctx2d.lineTo(cw, y);
        ctx2d.stroke();
      }

      // fill under curve
      const grad = ctx2d.createLinearGradient(0, padT, 0, padT + h);
      grad.addColorStop(0, "rgba(167,139,250,0.42)");
      grad.addColorStop(1, "rgba(124,58,237,0.02)");
      ctx2d.beginPath();
      ctx2d.moveTo(0, padT + h);
      for (let i = 0; i < N; i++) ctx2d.lineTo(xOf(i), yOf(engine.ribbon[i].v));
      ctx2d.lineTo(cw, padT + h);
      ctx2d.closePath();
      ctx2d.fillStyle = grad;
      ctx2d.fill();

      // curve
      ctx2d.beginPath();
      for (let i = 0; i < N; i++) {
        const x = xOf(i);
        const y = yOf(engine.ribbon[i].v);
        if (i === 0) ctx2d.moveTo(x, y);
        else ctx2d.lineTo(x, y);
      }
      ctx2d.strokeStyle = "#a78bfa";
      ctx2d.lineWidth = 2;
      ctx2d.shadowColor = "rgba(167,139,250,0.6)";
      ctx2d.shadowBlur = 8;
      ctx2d.stroke();
      ctx2d.shadowBlur = 0;

      // event markers + peak/dip labels
      ctx2d.font =
        "600 11px ui-monospace, SFMono-Regular, Menlo, monospace";
      for (let i = 0; i < N; i++) {
        const s = engine.ribbon[i];
        if (!s.label) continue;
        const x = xOf(i);
        const y = yOf(s.v);
        const peak = s.kind === "peak";
        const dip = s.kind === "dip";
        ctx2d.fillStyle = peak
          ? "#c4b5fd"
          : dip
            ? "#8b8ba0"
            : "#a78bfa";
        ctx2d.beginPath();
        ctx2d.arc(x, y, 3, 0, Math.PI * 2);
        ctx2d.fill();
        const tag = peak ? "▲ " : dip ? "▽ " : "";
        const text = tag + s.label;
        ctx2d.textAlign = x > cw - 60 ? "right" : "center";
        const ty = peak ? y - 9 : dip ? y + 18 : y - 9;
        ctx2d.fillText(text, x, ty);
      }
      ctx2d.textAlign = "left";

      // playhead
      const hx = xOf(N - 1);
      const hy = yOf(engine.ribbon[N - 1].v);
      ctx2d.strokeStyle = "rgba(196,181,253,0.35)";
      ctx2d.beginPath();
      ctx2d.moveTo(hx, padT);
      ctx2d.lineTo(hx, padT + h);
      ctx2d.stroke();
      ctx2d.fillStyle = "#ddd6fe";
      ctx2d.beginPath();
      ctx2d.arc(hx, hy, 4, 0, Math.PI * 2);
      ctx2d.fill();

      // readout
      ctx2d.fillStyle = "#8b8ba0";
      ctx2d.font =
        "10px ui-monospace, SFMono-Regular, Menlo, monospace";
      ctx2d.fillText("TONAL TENSION", 10, 15);
      ctx2d.fillStyle = "#e5e5f0";
      ctx2d.font =
        "600 13px ui-monospace, SFMono-Regular, Menlo, monospace";
      ctx2d.textAlign = "right";
      ctx2d.fillText(
        `${chordLabelForCanvas()}  ·  ${Math.round(engine.disp * 100)}%`,
        cw - 10,
        15,
      );
      ctx2d.textAlign = "left";
    }

    // read the last labelled sample for the canvas readout
    function chordLabelForCanvas() {
      for (let i = engine.ribbon.length - 1; i >= 0; i--) {
        if (engine.ribbon[i].label) return engine.ribbon[i].label as string;
      }
      return "—";
    }

    /* --- main loop (frame-counter driven → deterministic) --- */
    let raf = 0;
    function loop() {
      engine.frame++;

      // process scheduled follow-up chords
      if (engine.pending.length) {
        const due = engine.pending.filter((p) => p.atFrame <= engine.frame);
        engine.pending = engine.pending.filter(
          (p) => p.atFrame > engine.frame,
        );
        for (const d of due) playChord(d.chord, false);
      }

      // ghost advances only when the visitor is idle
      if (
        engine.frame - engine.lastUserFrame > IDLE &&
        engine.frame % STEP === 0
      ) {
        ghost[engine.ghostIndex]();
        engine.ghostIndex = (engine.ghostIndex + 1) % ghost.length;
      }

      // ease displayed tension toward target, scroll the ribbon
      engine.disp += (engine.target - engine.disp) * 0.12;
      const sample: Sample = { v: engine.disp };
      if (engine.pendingLabel) {
        sample.label = engine.pendingLabel.label;
        sample.kind = engine.pendingLabel.kind;
        engine.pendingLabel = undefined;
      }
      engine.ribbon.push(sample);
      if (engine.ribbon.length > RIBBON_N) engine.ribbon.shift();

      drawRibbon();
      raf = requestAnimationFrame(loop);
    }
    raf = requestAnimationFrame(loop);

    /* --- keyboard --- */
    function onKey(e: KeyboardEvent) {
      if (e.repeat) return;
      const k = e.key.toLowerCase();
      const deg = KEY_LETTERS.map((l) => l.toLowerCase()).indexOf(k);
      let handled = true;
      unlock();
      if (deg >= 0) {
        if (e.shiftKey) playApplied(deg, true);
        else playDegree(deg, true);
      } else if (k === "k") playV7(true);
      else if (k === "l") playVii07(true);
      else if (k === "m" || k === " ") modulate(true);
      else if (k === "n") deceptive(true);
      else handled = false;
      if (handled) e.preventDefault();
    }
    function onPointer() {
      unlock();
    }
    window.addEventListener("keydown", onKey);
    window.addEventListener("pointerdown", onPointer);

    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener("keydown", onKey);
      window.removeEventListener("pointerdown", onPointer);
      apiRef.current = null;
      if (audio) {
        try {
          audio.ctx.close();
        } catch {
          /* ignore */
        }
      }
    };
    // engine + handlers live entirely on refs; run once on mount.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  /* ---------- UI ------------------------------------------------ */

  const meta =
    "font-mono text-xs uppercase tracking-[0.18em] text-muted-foreground";
  const secBtn =
    "min-h-[44px] rounded-md border border-border bg-background/60 px-4 text-sm text-muted-foreground transition-colors hover:bg-accent hover:text-foreground";

  const compBar = (label: string, v: number, weight: string) => (
    <div className="flex items-center gap-2">
      <span className="w-24 font-mono text-xs text-muted-foreground">
        {label}
      </span>
      <div className="h-2 flex-1 overflow-hidden rounded-full bg-accent">
        <div
          className="h-full rounded-full bg-primary"
          style={{ width: `${Math.round(clamp01(v) * 100)}%` }}
        />
      </div>
      <span className="w-14 text-right font-mono text-[10px] text-muted-foreground">
        {weight}
      </span>
    </div>
  );

  return (
    <div className="min-h-screen bg-background px-5 pb-24 pt-8 text-foreground">
      <PrototypeNav slugs={["1682-cadence-forge"]} />

      <div className="mx-auto max-w-3xl">
        <p className={meta}>Dream lab · 1682</p>
        <h1 className="mt-2 text-2xl font-semibold tracking-tight sm:text-3xl">
          cadence forge
        </h1>
        <p className="mt-3 max-w-2xl text-base leading-relaxed text-muted-foreground">
          Play equal-tempered functional harmony that actually modulates and
          bites — real 4-voice voice-leading, applied dominants, diminished
          sevenths, deceptive cadences — and watch a live tonal-tension ribbon
          rise and resolve as you do.
        </p>

        {/* key + numerals */}
        <div className="mt-6 flex flex-wrap items-center gap-3">
          <span className={meta}>Key</span>
          <span className="rounded-md bg-primary/20 px-3 py-1 font-mono text-sm font-medium text-foreground">
            {keyLabel}
          </span>
          <span className={meta}>Playing</span>
          <span className="font-mono text-sm text-foreground">
            {chordLabel}
          </span>
        </div>

        <div className="mt-4 grid grid-cols-7 gap-2">
          {numerals.map((n, i) => (
            <button
              key={i}
              onClick={() => apiRef.current?.playDegree(i)}
              className={`flex min-h-[56px] flex-col items-center justify-center rounded-md border transition-colors ${
                activeDegree === i
                  ? "border-primary bg-primary/20 text-foreground"
                  : "border-border bg-background/60 text-muted-foreground hover:bg-accent hover:text-foreground"
              }`}
            >
              <span className="text-sm font-medium">{n}</span>
              <span className="mt-0.5 font-mono text-[10px] uppercase tracking-widest text-muted-foreground">
                {KEY_LETTERS[i]}
              </span>
            </button>
          ))}
        </div>

        {/* extended moves */}
        <div className="mt-3 flex flex-wrap gap-2">
          <button className={secBtn} onClick={() => apiRef.current?.playV7()}>
            V7 · K
          </button>
          <button className={secBtn} onClick={() => apiRef.current?.playVii07()}>
            vii°7 · L
          </button>
          <button
            className={secBtn}
            onClick={() => apiRef.current?.playApplied(4)}
          >
            V7/V · Shift+G
          </button>
          <button className={secBtn} onClick={() => apiRef.current?.modulate()}>
            Modulate · M
          </button>
          <button className={secBtn} onClick={() => apiRef.current?.deceptive()}>
            Deceptive · N
          </button>
        </div>

        {/* ribbon */}
        <div className="mt-6 overflow-hidden rounded-lg border border-border">
          <canvas
            ref={canvasRef}
            className="block h-[220px] w-full"
            aria-label="Live tonal-tension ribbon"
          />
        </div>

        {/* tension components */}
        <div className="mt-5 rounded-lg border border-border bg-background/40 p-4">
          <div className="flex items-center justify-between">
            <span className={meta}>Tension breakdown (TIV weights)</span>
            <span className="font-mono text-sm font-semibold text-primary">
              {Math.round(comps.total * 100)}%
            </span>
          </div>
          <div className="mt-3 space-y-2">
            {compBar("dissonance", comps.diss, "×0.402")}
            {compBar("hierarchical", comps.hier, "×0.246")}
            {compBar("tonal dist.", comps.tonal, "×0.202")}
            {compBar("voice-lead", comps.vl, "×0.193")}
          </div>
        </div>

        {/* audio status + notes */}
        <div className="mt-5 flex flex-wrap items-center gap-3">
          {audioState === "unsupported" ? (
            <span className="text-sm text-destructive">
              Web Audio is unavailable — the tension ribbon still plays
              silently.
            </span>
          ) : audioState === "idle" ? (
            <button
              className="min-h-[44px] rounded-md bg-primary px-6 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90"
              onClick={() => apiRef.current?.unlock()}
            >
              Start audio
            </button>
          ) : (
            <span className="text-sm text-muted-foreground">
              Audio live · play A S D F G H J, hold Shift for applied
              dominants.
            </span>
          )}
          <button className={secBtn} onClick={() => setNotesOpen(true)}>
            Read the design notes
          </button>
        </div>

        <p className="mt-4 text-sm leading-relaxed text-muted-foreground">
          Home row <span className="font-mono">A S D F G H J</span> plays the
          seven diatonic triads. Hold <span className="font-mono">Shift</span>{" "}
          for an applied dominant that tonicizes that degree.{" "}
          <span className="font-mono">K</span> = V7,{" "}
          <span className="font-mono">L</span> = vii°7,{" "}
          <span className="font-mono">M</span> pivots to a related key,{" "}
          <span className="font-mono">N</span> plays a deceptive cadence. Idle
          and a deterministic ghost keeps forging cadences on its own.
        </p>
      </div>

      {/* design-notes overlay */}
      {notesOpen && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4 backdrop-blur-sm"
          onClick={() => setNotesOpen(false)}
        >
          <div
            className="max-w-lg rounded-lg border border-border bg-background p-6 shadow-lg"
            onClick={(e) => e.stopPropagation()}
          >
            <p className={meta}>Design notes · 1682-cadence-forge</p>
            <h2 className="mt-2 text-xl font-semibold tracking-tight">
              A played harmony instrument
            </h2>
            <div className="mt-3 space-y-3 text-sm leading-relaxed text-muted-foreground">
              <p>
                The opposite of a consonant just-intonation drone: 12-TET
                (A4=440) functional harmony you perform. Every numeral is
                realized with real SATB voice-leading — common tones held,
                upper voices moved by the smallest interval — not stacked
                root-position triads.
              </p>
              <p>
                Tension is a weighted scalar after the TIV tonal-tension model
                (Navarro-Cáceres & Bernardes, Entropy 2020): dissonance 0.402,
                hierarchical tension 0.246, tonal distance 0.202, voice-leading
                0.193. Dissonance = mean interval-class dissonance; hierarchical
                = the chord function&rsquo;s distance from tonic; tonal distance
                = chroma-vector cosine distance from the key&rsquo;s tonic
                triad; voice-leading = total semitone motion from the previous
                voicing. Hierarchy weights follow Lerdahl, Tonal Pitch Space
                (2001).
              </p>
              <p>
                A deterministic ghost self-plays{" "}
                <span className="font-mono">
                  I – vi – IV – V7/V – V7 – I
                </span>{" "}
                then modulates and drops a deceptive cadence, driving the exact
                realize→voice→tension→render path. No randomness, no wall
                clock: the visual runs on a frame counter, decoupled from the
                audio clock, so the ribbon never freezes even before audio is
                unlocked.
              </p>
            </div>
            <button
              className={`mt-5 ${secBtn}`}
              onClick={() => setNotesOpen(false)}
            >
              Close
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
