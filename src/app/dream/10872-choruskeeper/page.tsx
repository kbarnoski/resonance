"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { PrototypeNav } from "../_shared/prototype-nav";
import { createSafeMaster, type SafeMaster } from "../_shared/visionary/safeMaster";
import {
  addApproach,
  bankMotif,
  BARS_PER_CHORUS,
  bebopScale,
  BEATS_PER_BAR,
  type Chord,
  contourPoints,
  type DevOp,
  getChord,
  guideTones,
  mulberry32,
  type Motif,
  type NoteEv,
  renderMotif,
  rootlessVoicing,
  sectionLabel,
  STEPS_PER_BAR,
  walkingBass,
} from "./engine";

// ── Midnight blue-note palette (canvas ART layer only — never on UI chrome) ──
const GROUND = "#0a1024"; // deep indigo/navy ground
const PANEL = "#0e1732";
const PANEL_HI = "#13224a";
const GRID = "#233763";
const A_BAND = "#141f42";
const B_BAND = "#1a2c5e";
const COOL = "#5fb2ff"; // cool-blue accent — YOU + playhead
const COOL_DIM = "#2f5c8f";
const GOLD = "#e8b24a"; // gold accent — the GHOST + active motif
const GOLD_DIM = "#7a5f28";
const INK = "#dce6ff"; // bright canvas text
const INK_MUTE = "#8fa2cf"; // muted canvas text

// ── Timing ──────────────────────────────────────────────────────────────────
const BPM = 150;
const SEC_PER_BEAT = 60 / BPM;
const SWING = 0.62; // where the off-beat eighth falls within the beat
const TOTAL_CHORUSES = 3;
const TOTAL_BARS = BARS_PER_CHORUS * TOTAL_CHORUSES; // 96
const TOTAL_BEATS = TOTAL_BARS * BEATS_PER_BAR; // 384
const TOTAL_STEPS = TOTAL_BARS * STEPS_PER_BAR; // 768
const LOOKAHEAD = 0.13; // seconds scheduled ahead
const TICK_MS = 25;
const DEMO_SECONDS = 11; // whole 3-chorus arc previewed, muted, in ~11s
const LIB_CAP = 6;

// ── Keyboard → F-major scale row ─────────────────────────────────────────────
const MELODY_KEYS = ["a", "s", "d", "f", "g", "h", "j", "k", "l"];
// F major degrees as semitone offsets from F, spanning ~an octave and a bit.
const FMAJ_OFFSETS = [0, 2, 4, 5, 7, 9, 11, 12, 14]; // F G A Bb C D E F G
const F_BASE = 65; // F4

const gridBeat = (step: number) =>
  Math.floor(step / 2) + (step % 2 ? SWING : 0);

interface TrailDot {
  beat: number; // absolute beat when it sounds
  midi: number;
  src: "you" | "ghost";
}

interface AudioRefs {
  ctx: AudioContext;
  master: SafeMaster;
}

export default function Page() {
  const [booted, setBooted] = useState(false);
  const [ended, setEnded] = useState(false);
  const [reduced, setReduced] = useState(false);
  const [density, setDensity] = useState(1); // 0..3
  const [register, setRegister] = useState(0); // -2..2
  const [ghostLead, setGhostLead] = useState(false);
  const [libCount, setLibCount] = useState(0);

  // ── mutable engine state (refs so the loop never restarts) ──
  const audioRef = useRef<AudioRefs | null>(null);
  const rafRef = useRef<number | null>(null);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  const rngRef = useRef<() => number>(mulberry32(0x10872));
  const libRef = useRef<Motif[]>([]);
  const motifIdRef = useRef(1);
  const activeMotifRef = useRef<number | null>(null);
  const activeOpRef = useRef<DevOp>("state");
  const roleRef = useRef<"you" | "ghost">("you");
  const trailRef = useRef<TrailDot[]>([]);

  // form-clock: live uses audio time, demo uses a fast wall-clock
  const modeRef = useRef<"demo" | "live">("demo");
  const startTimeRef = useRef(0); // audio time at step 0
  const demoBeatRef = useRef(0);
  const lastPlannedBarRef = useRef(-1);
  const stepAbsRef = useRef(0);
  const nextStepTimeRef = useRef(0);
  const finishedRef = useRef(false);

  // per-bar planned melodic events (absBar → events)
  const barEventsRef = useRef<Map<number, NoteEv[]>>(new Map());

  // live human-input phrase buffer (for banking what YOU play)
  const phraseRef = useRef<{
    midis: number[];
    durs: number[];
    lastT: number;
    chord: Chord | null;
    startBeat: number;
  }>({ midis: [], durs: [], lastT: 0, chord: null, startBeat: 0 });
  const lastHumanRef = useRef(-9999);

  // live macro mirrors (read inside the audio loop without re-subscribing)
  const densityRef = useRef(density);
  const registerRef = useRef(register);
  const ghostLeadRef = useRef(ghostLead);
  const reducedRef = useRef(reduced);
  useEffect(() => void (densityRef.current = density), [density]);
  useEffect(() => void (registerRef.current = register), [register]);
  useEffect(() => void (ghostLeadRef.current = ghostLead), [ghostLead]);
  useEffect(() => void (reducedRef.current = reduced), [reduced]);

  const centerMidi = useCallback(() => 72 + registerRef.current * 4, []);

  // ── library helpers ────────────────────────────────────────────────────────
  const pushMotif = useCallback((m: Motif) => {
    const lib = libRef.current.slice();
    lib.push(m);
    while (lib.length > LIB_CAP) lib.shift();
    libRef.current = lib;
    setLibCount(lib.length);
  }, []);

  // ── build a short bebop fragment over a chord (the sparse "you" phrases) ──
  const makeFragment = useCallback(
    (chord: Chord, rng: () => number, dense: boolean): NoteEv[] => {
      const scale = bebopScale(chord.quality);
      const L = scale.length;
      const n = dense ? 4 + Math.floor(rng() * 3) : 3 + Math.floor(rng() * 2);
      let base = chord.root;
      const c = centerMidi();
      while (base < c - 6) base += 12;
      while (base > c + 6) base -= 12;
      let idx = [0, 2, 4, 6][Math.floor(rng() * 4)]; // start on a chord tone
      let oct = 0;
      let step = dense ? 0 : 2;
      const evs: NoteEv[] = [];
      for (let i = 0; i < n; i++) {
        const midi = base + oct * 12 + scale[((idx % L) + L) % L];
        const dur = i === n - 1 ? 2 : rng() < 0.78 ? 1 : 2;
        if (step + dur > STEPS_PER_BAR) break;
        evs.push({ step, midi, dur, src: "you" });
        step += dur;
        const mv = rng() < 0.5 ? 1 : -1;
        const skip = rng() < 0.25 ? 2 : 1;
        idx += mv * skip;
        if (idx < 0) {
          idx += L;
          oct -= 1;
        } else if (idx >= L) {
          idx -= L;
          oct += 1;
        }
      }
      return evs;
    },
    [centerMidi],
  );

  const opForBar = useCallback((bar: number): DevOp => {
    if (bar < 8) return bar % 2 ? "sequence" : "transpose";
    if (bar < 16) return bar % 3 === 0 ? "invert" : "sequence";
    if (bar < 24) return bar % 2 ? "invert" : "augment"; // bridge: transform
    return bar % 2 ? "augment" : "invert";
  }, []);

  // ── plan one bar of melodic content (shared by demo + live) ────────────────
  // Updates library / active-motif refs and pushes trail dots; returns the
  // bar's note events (used by the live scheduler to make sound).
  const planBar = useCallback(
    (chorus: number, bar: number): NoteEv[] => {
      const rng = rngRef.current;
      const chord = getChord(chorus, bar, TOTAL_CHORUSES);
      const next = getChord(
        bar === 31 ? chorus + 1 : chorus,
        (bar + 1) % BARS_PER_CHORUS,
        TOTAL_CHORUSES,
      );
      const live = modeRef.current === "live";
      const humanIdle = live
        ? performance.now() - lastHumanRef.current > 1600
        : true;
      const lead = ghostLeadRef.current;
      const c = centerMidi();
      let evs: NoteEv[] = [];

      if (chorus === 0) {
        // CHORUS 1 — STATE THE IDEA: sparse fragments, each banked.
        const play = bar % 3 === 0 || bar % 8 === 5;
        if (play && humanIdle) {
          if (lead && libRef.current.length) {
            roleRef.current = "ghost";
            const m = libRef.current[bar % libRef.current.length];
            const op = opForBar(bar);
            activeMotifRef.current = m.id;
            activeOpRef.current = op;
            evs = addApproach(renderMotif(m, chord, c, op, 0), next, c);
          } else {
            roleRef.current = "you";
            activeOpRef.current = "state";
            const frag = makeFragment(chord, rng, false);
            evs = frag;
            if (frag.length >= 3) {
              const m = bankMotif(
                motifIdRef.current++,
                frag.map((e) => e.midi),
                frag.map((e) => e.dur),
                chord,
                chorus,
              );
              pushMotif(m);
              activeMotifRef.current = m.id;
            }
          }
        } else {
          roleRef.current = "you";
        }
        // ghost drops a tiny answer at phrase-ends
        if (!play && rng() < 0.4 && libRef.current.length) {
          const [t3, t7] = guideTones(chord);
          let g = t7;
          while (g < c - 6) g += 12;
          while (g > c + 6) g -= 12;
          evs.push({ step: 5, midi: g, dur: 1, src: "ghost" });
          evs.push({ step: 6, midi: nearestOf(g - 1, [t3, t7]), dur: 2, src: "ghost" });
        }
      } else if (chorus === 1) {
        // CHORUS 2 — DEVELOPMENT: the ghost grows YOUR banked motifs.
        roleRef.current = "ghost";
        if (libRef.current.length) {
          const m = libRef.current[bar % libRef.current.length];
          const op = opForBar(bar);
          activeMotifRef.current = m.id;
          activeOpRef.current = op;
          evs = addApproach(renderMotif(m, chord, c, op, 0), next, c);
        }
        // still bank if a live human keeps feeding
        if (!humanIdle) roleRef.current = "you";
      } else {
        // CHORUS 3 — TRADING & OUT: 4-bar trades, climbing density, then cadence.
        if (chorus === TOTAL_CHORUSES - 1 && bar === 31) {
          // FINAL CADENCE — land on the tonic; the changes resolve to Fmaj7.
          roleRef.current = "you";
          activeOpRef.current = "state";
          activeMotifRef.current = null;
          const c2 = centerMidi();
          let f = 5; // F pc
          while (f < c2 - 6) f += 12;
          while (f > c2 + 6) f -= 12;
          evs = [
            { step: 0, midi: f + 4, dur: 2, src: "you" }, // A (3rd)
            { step: 2, midi: f + 2, dur: 2, src: "you" }, // G
            { step: 4, midi: f, dur: 4, src: "you" }, // F — resolved
          ];
        } else {
          const seg = Math.floor(bar / 4) % 2; // 0 = you, 1 = ghost
          const dens = 1 + Math.floor(bar / 8); // climbs across the chorus
          const wantGhost = lead ? true : seg === 1;
          if (!wantGhost) {
            roleRef.current = "you";
            activeOpRef.current = "state";
            if (humanIdle) {
              const frag = makeFragment(chord, rng, dens >= 2);
              evs = frag;
              if (frag.length >= 3) {
                const m = bankMotif(
                  motifIdRef.current++,
                  frag.map((e) => e.midi),
                  frag.map((e) => e.dur),
                  chord,
                  chorus,
                );
                pushMotif(m);
                activeMotifRef.current = m.id;
              }
            }
          } else {
            roleRef.current = "ghost";
            if (libRef.current.length) {
              const m = libRef.current[bar % libRef.current.length];
              const op = opForBar(bar);
              activeMotifRef.current = m.id;
              activeOpRef.current = op;
              evs = addApproach(renderMotif(m, chord, c, op, 0), next, c);
              if (dens >= 2 && libRef.current.length > 1) {
                const m2 = libRef.current[(bar + 1) % libRef.current.length];
                const ev2 = renderMotif(m2, chord, c - 5, "transpose", 4, false);
                for (const e of ev2) if (e.step < STEPS_PER_BAR) evs.push(e);
              }
            }
          }
        }
      }

      // register trail dots for BOTH demo + live so the arc is always visible
      for (const e of evs) {
        trailRef.current.push({
          beat: bar * BEATS_PER_BAR + e.step / 2,
          midi: e.midi,
          src: e.src,
        });
      }
      if (trailRef.current.length > 200) {
        trailRef.current.splice(0, trailRef.current.length - 200);
      }
      return evs;
    },
    [centerMidi, makeFragment, opForBar, pushMotif],
  );

  // ── reset all engine state to the top of chorus 1 ──────────────────────────
  const resetForm = useCallback(() => {
    rngRef.current = mulberry32(0x10872);
    libRef.current = [];
    motifIdRef.current = 1;
    activeMotifRef.current = null;
    activeOpRef.current = "state";
    roleRef.current = "you";
    trailRef.current = [];
    demoBeatRef.current = 0;
    lastPlannedBarRef.current = -1;
    stepAbsRef.current = 0;
    finishedRef.current = false;
    barEventsRef.current = new Map();
    phraseRef.current = {
      midis: [],
      durs: [],
      lastT: 0,
      chord: null,
      startBeat: 0,
    };
    setLibCount(0);
    setEnded(false);
  }, []);

  // ── synth voices (all route to the safe master) ────────────────────────────
  const playVoice = useCallback(
    (midi: number, when: number, durBeats: number, src: "you" | "ghost") => {
      const a = audioRef.current;
      if (!a || a.ctx.state === "closed") return;
      const { ctx, master } = a;
      const freq = 440 * Math.pow(2, (midi - 69) / 12);
      const dur = Math.max(0.12, durBeats * SEC_PER_BEAT * 0.9);
      const osc = ctx.createOscillator();
      const g = ctx.createGain();
      const pan = ctx.createStereoPanner();
      const lp = ctx.createBiquadFilter();
      lp.type = "lowpass";
      if (src === "you") {
        osc.type = "triangle";
        pan.pan.value = -0.22;
        lp.frequency.value = 2600;
      } else {
        osc.type = "sawtooth";
        pan.pan.value = 0.26;
        lp.frequency.value = 1900;
      }
      osc.frequency.value = freq;
      const peak = src === "you" ? 0.26 : 0.2;
      g.gain.setValueAtTime(0.0001, when);
      g.gain.exponentialRampToValueAtTime(peak, when + 0.012);
      g.gain.exponentialRampToValueAtTime(0.0001, when + dur + 0.12);
      // gentle vibrato on the ghost for a reedy grain
      if (src === "ghost" && !reducedRef.current) {
        const lfo = ctx.createOscillator();
        const lg = ctx.createGain();
        lfo.frequency.value = 5.2;
        lg.gain.value = freq * 0.006;
        lfo.connect(lg).connect(osc.frequency);
        lfo.start(when);
        lfo.stop(when + dur + 0.14);
      }
      osc.connect(lp).connect(g).connect(pan).connect(master.input);
      osc.start(when);
      osc.stop(when + dur + 0.16);
    },
    [],
  );

  const playBass = useCallback((midi: number, when: number) => {
    const a = audioRef.current;
    if (!a || a.ctx.state === "closed") return;
    const { ctx, master } = a;
    const freq = 440 * Math.pow(2, (midi - 69) / 12);
    const osc = ctx.createOscillator();
    osc.type = "triangle";
    osc.frequency.value = freq;
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, when);
    g.gain.exponentialRampToValueAtTime(0.34, when + 0.014);
    g.gain.exponentialRampToValueAtTime(0.0001, when + SEC_PER_BEAT * 0.95);
    const lp = ctx.createBiquadFilter();
    lp.type = "lowpass";
    lp.frequency.value = 700;
    osc.connect(lp).connect(g).connect(master.input);
    osc.start(when);
    osc.stop(when + SEC_PER_BEAT * 1.1);
  }, []);

  const playComp = useCallback((voicing: number[], when: number) => {
    const a = audioRef.current;
    if (!a || a.ctx.state === "closed") return;
    const { ctx, master } = a;
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, when);
    g.gain.exponentialRampToValueAtTime(0.12, when + 0.02);
    g.gain.exponentialRampToValueAtTime(0.0001, when + 0.5);
    const lp = ctx.createBiquadFilter();
    lp.type = "lowpass";
    lp.frequency.value = 2200;
    g.connect(lp).connect(master.input);
    for (const midi of voicing) {
      const osc = ctx.createOscillator();
      osc.type = "sine";
      osc.frequency.value = 440 * Math.pow(2, (midi - 69) / 12);
      osc.connect(g);
      osc.start(when);
      osc.stop(when + 0.6);
    }
  }, []);

  const playCymbal = useCallback((when: number, accent: boolean, hat: boolean) => {
    const a = audioRef.current;
    if (!a || a.ctx.state === "closed") return;
    const { ctx, master } = a;
    const dur = hat ? 0.05 : 0.14;
    const n = Math.floor(ctx.sampleRate * dur);
    const buf = ctx.createBuffer(1, n, ctx.sampleRate);
    const d = buf.getChannelData(0);
    for (let i = 0; i < n; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / n);
    const src = ctx.createBufferSource();
    src.buffer = buf;
    const hp = ctx.createBiquadFilter();
    hp.type = "highpass";
    hp.frequency.value = hat ? 8000 : 6000;
    const g = ctx.createGain();
    const peak = hat ? 0.05 : accent ? 0.09 : 0.055;
    g.gain.setValueAtTime(peak, when);
    g.gain.exponentialRampToValueAtTime(0.0001, when + dur);
    src.connect(hp).connect(g).connect(master.input);
    src.start(when);
    src.stop(when + dur + 0.02);
  }, []);

  // finalise the live human phrase into a banked motif
  const finalizePhrase = useCallback(() => {
    const p = phraseRef.current;
    if (modeRef.current !== "live") return;
    if (p.midis.length < 3 || !p.chord) return;
    if (performance.now() - p.lastT < 650) return; // still playing
    const durs = p.durs.slice();
    durs[durs.length - 1] = 2;
    const chorus = Math.floor(
      (p.startBeat / BEATS_PER_BAR / BARS_PER_CHORUS) % TOTAL_CHORUSES,
    );
    const m = bankMotif(motifIdRef.current++, p.midis.slice(), durs, p.chord, chorus);
    pushMotif(m);
    activeMotifRef.current = m.id;
    phraseRef.current = {
      midis: [],
      durs: [],
      lastT: 0,
      chord: null,
      startBeat: 0,
    };
  }, [pushMotif]);

  // ── the look-ahead scheduler (Chris Wilson's two-clock model) ──────────────
  const scheduleStep = useCallback(
    (s: number, when: number) => {
      const bar = Math.floor(s / STEPS_PER_BAR);
      const stepIn = s % STEPS_PER_BAR;
      const chorus = Math.floor(bar / BARS_PER_CHORUS);
      const barIn = bar % BARS_PER_CHORUS;
      const chord = getChord(chorus, barIn, TOTAL_CHORUSES);
      const next = getChord(
        barIn === 31 ? chorus + 1 : chorus,
        (barIn + 1) % BARS_PER_CHORUS,
        TOTAL_CHORUSES,
      );

      if (stepIn === 0) {
        // finalise any dangling human phrase from the previous bar
        finalizePhrase();
        barEventsRef.current.set(bar, planBar(chorus, barIn));
      }

      // rhythm section — never stops
      const isFinalBar = chorus === TOTAL_CHORUSES - 1 && barIn === 31;
      const ride = [0, 2, 3, 4, 6, 7].includes(stepIn);
      if (ride && !(isFinalBar && stepIn > 2))
        playCymbal(when, stepIn === 2 || stepIn === 6, false);
      if ((stepIn === 2 || stepIn === 6) && !(isFinalBar && stepIn > 2))
        playCymbal(when, false, true);
      if (stepIn % 2 === 0 && !(isFinalBar && stepIn > 0))
        playBass(walkingBass(chord, next, stepIn / 2, rngRef.current), when);

      const dens = densityRef.current;
      const compSteps = [3, 6];
      if (dens >= 2) compSteps.push(1);
      if (dens >= 3) compSteps.push(7);
      if (compSteps.includes(stepIn) && !(isFinalBar && stepIn > 0))
        playComp(rootlessVoicing(chord), when);
      if (isFinalBar && stepIn === 0) playComp(rootlessVoicing(chord), when);

      // melodic events for this bar/step
      const evs = barEventsRef.current.get(bar);
      if (evs) {
        for (const e of evs) {
          // e.dur is in eighth-notes → convert to beats for the envelope
          if (e.step === stepIn) playVoice(e.midi, when, e.dur * 0.5, e.src);
        }
      }
    },
    [finalizePhrase, planBar, playBass, playComp, playCymbal, playVoice],
  );

  const runScheduler = useCallback(() => {
    const a = audioRef.current;
    if (!a || finishedRef.current) return;
    const { ctx } = a;
    while (nextStepTimeRef.current < ctx.currentTime + LOOKAHEAD) {
      const s = stepAbsRef.current;
      if (s >= TOTAL_STEPS) {
        finishedRef.current = true;
        setEnded(true);
        break;
      }
      scheduleStep(s, nextStepTimeRef.current);
      stepAbsRef.current = s + 1;
      nextStepTimeRef.current =
        startTimeRef.current + gridBeat(stepAbsRef.current) * SEC_PER_BEAT;
    }
  }, [scheduleStep]);

  // ── current absolute beat (drives the visuals in both modes) ───────────────
  const currentBeat = useCallback((): number => {
    if (modeRef.current === "live" && audioRef.current) {
      const t = audioRef.current.ctx.currentTime - startTimeRef.current;
      return Math.max(0, Math.min(TOTAL_BEATS, t / SEC_PER_BEAT));
    }
    return demoBeatRef.current;
  }, []);

  // ── the visual loop (always running) ───────────────────────────────────────
  const draw = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    const W = canvas.clientWidth;
    const H = canvas.clientHeight;
    if (canvas.width !== Math.floor(W * dpr)) canvas.width = Math.floor(W * dpr);
    if (canvas.height !== Math.floor(H * dpr))
      canvas.height = Math.floor(H * dpr);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

    const beat = currentBeat();
    const absBar = beat / BEATS_PER_BAR;
    const chorus = Math.min(
      TOTAL_CHORUSES - 1,
      Math.floor(absBar / BARS_PER_CHORUS),
    );
    const barInFloat = absBar - chorus * BARS_PER_CHORUS;
    const now = performance.now() / 1000;
    const pulse = reducedRef.current ? 0 : 0.5 + 0.5 * Math.sin(now * 3);

    ctx.clearRect(0, 0, W, H);
    ctx.fillStyle = GROUND;
    ctx.fillRect(0, 0, W, H);

    // ── header ──
    ctx.textBaseline = "alphabetic";
    ctx.fillStyle = INK_MUTE;
    ctx.font = "600 12px ui-monospace, monospace";
    ctx.fillText("CHORUSKEEPER · AABA · F MAJOR", 18, 26);

    // chorus counter (big)
    ctx.fillStyle = INK;
    ctx.font = "700 22px ui-sans-serif, system-ui, sans-serif";
    ctx.textAlign = "center";
    ctx.fillText(`CHORUS ${chorus + 1} / ${TOTAL_CHORUSES}`, W / 2, 27);
    ctx.textAlign = "left";

    // role badge
    const role = roleRef.current;
    const roleCol = role === "you" ? COOL : GOLD;
    ctx.textAlign = "right";
    ctx.font = "700 13px ui-monospace, monospace";
    const phaseName =
      chorus === 0 ? "STATE" : chorus === 1 ? "DEVELOP" : "TRADE";
    ctx.fillStyle = INK_MUTE;
    ctx.fillText(phaseName, W - 90, 26);
    ctx.fillStyle = roleCol;
    ctx.fillText(role === "you" ? "▍ YOU" : "▍ GHOST", W - 18, 26);
    ctx.textAlign = "left";

    // ── FORM MAP strip ──
    const mx = 18;
    const stripY = 46;
    const stripH = 92;
    const stripW = W - mx * 2;
    const cellW = stripW / BARS_PER_CHORUS;

    // section bands + labels
    for (let b = 0; b < BARS_PER_CHORUS; b++) {
      const sec = sectionLabel(b);
      ctx.fillStyle = sec === "B" ? B_BAND : A_BAND;
      ctx.fillRect(mx + b * cellW, stripY, cellW - 1, stripH);
    }
    // section group labels (A A B A above the four 8-bar blocks)
    ctx.fillStyle = INK_MUTE;
    ctx.font = "700 12px ui-monospace, monospace";
    ctx.textAlign = "center";
    ["A", "A", "B", "A"].forEach((lab, i) => {
      ctx.fillText(lab, mx + (i * 8 + 4) * cellW, stripY - 6);
    });

    // chord glyph per bar
    ctx.font = "600 9px ui-monospace, monospace";
    for (let b = 0; b < BARS_PER_CHORUS; b++) {
      const ch = getChord(chorus, b, TOTAL_CHORUSES);
      const q = ch.quality === "maj7" ? "△" : ch.quality === "m7" ? "−7" : "7";
      const name = ROOT_NAMES[ch.root] + q;
      ctx.fillStyle = b === Math.floor(barInFloat) ? INK : INK_MUTE;
      ctx.fillText(name, mx + b * cellW + cellW / 2, stripY + 15);
      // faint bar grid ticks every 4
      if (b % 4 === 0) {
        ctx.strokeStyle = GRID;
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.moveTo(mx + b * cellW, stripY);
        ctx.lineTo(mx + b * cellW, stripY + stripH);
        ctx.stroke();
      }
    }
    ctx.textAlign = "left";

    // trail dots (recent notes) inside the strip — the living activity lane
    const laneTop = stripY + 24;
    const laneBot = stripY + stripH - 8;
    for (const dot of trailRef.current) {
      const age = beat - dot.beat;
      if (age < 0 || age > 2.2) continue;
      const dChorus = Math.floor(dot.beat / BEATS_PER_BAR / BARS_PER_CHORUS);
      if (dChorus !== chorus) continue;
      const dBarIn = dot.beat / BEATS_PER_BAR - chorus * BARS_PER_CHORUS;
      const x = mx + dBarIn * cellW;
      const pitchN = Math.max(0, Math.min(1, (dot.midi - 58) / 32));
      const y = laneBot - pitchN * (laneBot - laneTop);
      const alpha = Math.max(0, 1 - age / 2.2);
      ctx.globalAlpha = alpha;
      ctx.fillStyle = dot.src === "you" ? COOL : GOLD;
      ctx.beginPath();
      ctx.arc(x, y, dot.src === "you" ? 2.6 : 3, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.globalAlpha = 1;

    // playhead
    const phx = mx + barInFloat * cellW;
    ctx.strokeStyle = COOL;
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(phx, stripY - 2);
    ctx.lineTo(phx, stripY + stripH + 2);
    ctx.stroke();
    ctx.fillStyle = COOL;
    ctx.beginPath();
    ctx.moveTo(phx, stripY - 2);
    ctx.lineTo(phx - 4, stripY - 9);
    ctx.lineTo(phx + 4, stripY - 9);
    ctx.closePath();
    ctx.fill();

    // ── MOTIF LIBRARY panel ──
    const panY = stripY + stripH + 20;
    const panH = H - panY - 14;
    ctx.fillStyle = PANEL;
    roundRect(ctx, mx, panY, stripW, panH, 8);
    ctx.fill();
    ctx.fillStyle = INK_MUTE;
    ctx.font = "700 11px ui-monospace, monospace";
    ctx.fillText("MOTIF LIBRARY", mx + 12, panY + 18);
    ctx.textAlign = "right";
    ctx.fillStyle = INK_MUTE;
    ctx.font = "600 10px ui-monospace, monospace";
    const opLabel = activeOpRef.current.toUpperCase();
    if (chorus >= 1 && activeMotifRef.current != null) {
      ctx.fillStyle = GOLD;
      ctx.fillText(`DEVELOPING · ${opLabel}`, mx + stripW - 12, panY + 18);
    } else {
      ctx.fillText("BANKING YOUR IDEAS", mx + stripW - 12, panY + 18);
    }
    ctx.textAlign = "left";

    const lib = libRef.current;
    const slotW = (stripW - 24) / LIB_CAP;
    const gy = panY + 30;
    const gh = panH - 42;
    for (let i = 0; i < LIB_CAP; i++) {
      const gx = mx + 12 + i * slotW;
      const m = lib[i];
      const active = m && m.id === activeMotifRef.current;
      ctx.fillStyle = PANEL_HI;
      roundRect(ctx, gx + 3, gy, slotW - 8, gh, 6);
      ctx.fill();
      if (active) {
        ctx.strokeStyle = GOLD;
        ctx.lineWidth = 1.5;
        ctx.globalAlpha = 0.5 + 0.5 * pulse;
        roundRect(ctx, gx + 3, gy, slotW - 8, gh, 6);
        ctx.stroke();
        ctx.globalAlpha = 1;
      } else {
        ctx.strokeStyle = GRID;
        ctx.lineWidth = 1;
        roundRect(ctx, gx + 3, gy, slotW - 8, gh, 6);
        ctx.stroke();
      }
      if (m) {
        // contour glyph
        const pts = contourPoints(m);
        const gpx = gx + 12;
        const gpw = slotW - 26;
        const gpy = gy + 12;
        const gph = gh - 30;
        const bornCol = m.bornChorus === 0 ? COOL : COOL_DIM;
        ctx.strokeStyle = active ? GOLD : bornCol;
        ctx.lineWidth = active ? 2 : 1.5;
        ctx.beginPath();
        pts.forEach((p, j) => {
          const x = gpx + (pts.length === 1 ? 0.5 : j / (pts.length - 1)) * gpw;
          const y = gpy + (1 - p) * gph;
          if (j === 0) ctx.moveTo(x, y);
          else ctx.lineTo(x, y);
        });
        ctx.stroke();
        // note dots
        ctx.fillStyle = active ? GOLD : bornCol;
        pts.forEach((p, j) => {
          const x = gpx + (pts.length === 1 ? 0.5 : j / (pts.length - 1)) * gpw;
          const y = gpy + (1 - p) * gph;
          ctx.beginPath();
          ctx.arc(x, y, 1.8, 0, Math.PI * 2);
          ctx.fill();
        });
        ctx.fillStyle = active ? GOLD : INK_MUTE;
        ctx.font = "600 9px ui-monospace, monospace";
        ctx.textAlign = "center";
        ctx.fillText(`M${m.id}`, gx + 3 + (slotW - 8) / 2, gy + gh - 6);
        ctx.textAlign = "left";
      } else {
        ctx.fillStyle = GOLD_DIM;
        ctx.font = "600 9px ui-monospace, monospace";
        ctx.textAlign = "center";
        ctx.fillText("—", gx + 3 + (slotW - 8) / 2, gy + gh / 2);
        ctx.textAlign = "left";
      }
    }

    // ended banner
    if (finishedRef.current) {
      ctx.fillStyle = "rgba(10,16,36,0.72)";
      ctx.fillRect(0, 0, W, H);
      ctx.fillStyle = GOLD;
      ctx.font = "700 20px ui-sans-serif, system-ui, sans-serif";
      ctx.textAlign = "center";
      ctx.fillText("resolved on Fmaj7 — the tune is over.", W / 2, H / 2);
      ctx.textAlign = "left";
    }

    rafRef.current = requestAnimationFrame(draw);
  }, [currentBeat]);

  // ── demo clock: advance the muted preview + plan bars as it crosses them ───
  const stepDemo = useCallback(() => {
    if (modeRef.current !== "demo") return;
    const inc = (TOTAL_BEATS / DEMO_SECONDS) * (TICK_MS / 1000);
    demoBeatRef.current += inc;
    if (demoBeatRef.current >= TOTAL_BEATS) {
      // loop the preview so it keeps demonstrating until audio is booted
      resetForm();
      return;
    }
    const curBar = Math.floor(demoBeatRef.current / BEATS_PER_BAR);
    while (lastPlannedBarRef.current < curBar) {
      const b = lastPlannedBarRef.current + 1;
      const chorus = Math.floor(b / BARS_PER_CHORUS);
      const barIn = b % BARS_PER_CHORUS;
      planBar(chorus, barIn);
      lastPlannedBarRef.current = b;
    }
  }, [planBar, resetForm]);

  // ── boot audio on first gesture ────────────────────────────────────────────
  const boot = useCallback(() => {
    if (audioRef.current) return;
    const Ctor =
      window.AudioContext ||
      (window as unknown as { webkitAudioContext?: typeof AudioContext })
        .webkitAudioContext;
    if (!Ctor) return; // no Web Audio → demo keeps running visually
    const ctx = new Ctor();
    if (ctx.state === "suspended") void ctx.resume();
    const master = createSafeMaster(ctx, { gain: 0.55 });
    audioRef.current = { ctx, master };
    resetForm();
    modeRef.current = "live";
    startTimeRef.current = ctx.currentTime + 0.12;
    stepAbsRef.current = 0;
    nextStepTimeRef.current = startTimeRef.current;
    finishedRef.current = false;
    if (timerRef.current) clearInterval(timerRef.current);
    timerRef.current = setInterval(() => {
      if (modeRef.current === "live") runScheduler();
      else stepDemo();
    }, TICK_MS);
    setBooted(true);
  }, [resetForm, runScheduler, stepDemo]);

  const restart = useCallback(() => {
    const a = audioRef.current;
    if (!a) return;
    resetForm();
    startTimeRef.current = a.ctx.currentTime + 0.12;
    stepAbsRef.current = 0;
    nextStepTimeRef.current = startTimeRef.current;
    finishedRef.current = false;
  }, [resetForm]);

  // ── play a scale note from the keyboard / pads (live) ──────────────────────
  const playScaleNote = useCallback(
    (idx: number) => {
      boot();
      const a = audioRef.current;
      if (!a || modeRef.current !== "live") return;
      const midi = F_BASE + FMAJ_OFFSETS[idx] + registerRef.current * 4 - 4;
      const now = performance.now();
      lastHumanRef.current = now;
      const when = a.ctx.currentTime + 0.02;
      playVoice(midi, when, 0.9, "you");
      // record into the phrase buffer (for banking what YOU play)
      const beat = currentBeat();
      const bar = Math.floor(beat / BEATS_PER_BAR);
      const chorus = Math.floor(bar / BARS_PER_CHORUS);
      const barIn = bar % BARS_PER_CHORUS;
      const chord = getChord(chorus, barIn, TOTAL_CHORUSES);
      const p = phraseRef.current;
      if (p.midis.length === 0) {
        p.chord = chord;
        p.startBeat = beat;
      }
      if (p.lastT > 0) {
        const dt = (now - p.lastT) / 1000 / SEC_PER_BEAT;
        const d = Math.max(1, Math.min(4, Math.round(dt * 2)));
        if (p.durs.length > 0) p.durs[p.durs.length - 1] = d;
      }
      p.midis.push(midi);
      p.durs.push(2);
      p.lastT = now;
      trailRef.current.push({ beat, midi, src: "you" });
    },
    [boot, currentBeat, playVoice],
  );

  // ── mount: prefers-reduced-motion, start the RAF + demo interval ───────────
  useEffect(() => {
    const mq = window.matchMedia("(prefers-reduced-motion: reduce)");
    setReduced(mq.matches);
    const onMq = () => setReduced(mq.matches);
    mq.addEventListener("change", onMq);

    resetForm();
    modeRef.current = "demo";
    rafRef.current = requestAnimationFrame(draw);
    timerRef.current = setInterval(() => {
      if (modeRef.current === "live") runScheduler();
      else stepDemo();
    }, TICK_MS);

    const onKey = (e: KeyboardEvent) => {
      if (e.repeat) return;
      const k = e.key.toLowerCase();
      const mi = MELODY_KEYS.indexOf(k);
      if (mi >= 0) {
        e.preventDefault();
        playScaleNote(mi);
        return;
      }
      if (k === "z") {
        boot();
        setDensity((d) => Math.max(0, d - 1));
      } else if (k === "x") {
        boot();
        setDensity((d) => Math.min(3, d + 1));
      } else if (k === "c") {
        boot();
        setRegister((r) => Math.max(-2, r - 1));
      } else if (k === "v") {
        boot();
        setRegister((r) => Math.min(2, r + 1));
      } else if (k === " ") {
        e.preventDefault();
        boot();
        setGhostLead((g) => !g);
      }
    };
    window.addEventListener("keydown", onKey);

    return () => {
      mq.removeEventListener("change", onMq);
      window.removeEventListener("keydown", onKey);
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
      if (timerRef.current) clearInterval(timerRef.current);
      finishedRef.current = true;
      const a = audioRef.current;
      if (a) {
        a.master.disconnect();
        if (a.ctx.state !== "closed") void a.ctx.close();
      }
      audioRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ── UI ─────────────────────────────────────────────────────────────────────
  const btnBase =
    "min-h-[44px] min-w-[44px] rounded-md px-4 text-sm font-medium transition-colors";
  const macroBtn = `${btnBase} bg-secondary text-secondary-foreground hover:bg-secondary/80`;

  return (
    <main className="mx-auto flex min-h-screen max-w-5xl flex-col gap-6 px-4 py-8 pb-28">
      <header className="flex flex-col gap-1">
        <h1 className="text-xl font-semibold tracking-tight text-foreground">
          Choruskeeper
        </h1>
        <p className="max-w-2xl text-base text-muted-foreground">
          A bebop duet with long-form memory. Play sparse fragments in chorus 1
          — the ghost banks every phrase, then develops your motifs across a
          32-bar AABA arc so chorus 3 is genuinely built from what you played in
          chorus 1.
        </p>
      </header>

      <div className="overflow-hidden rounded-lg border border-border">
        <canvas
          ref={canvasRef}
          className="block h-[360px] w-full"
          aria-label="Form map: a 32-bar AABA strip with a sweeping playhead, chorus counter, and a motif library panel."
        />
      </div>

      {!booted && (
        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={boot}
            className="min-h-[44px] rounded-md bg-primary px-6 text-sm font-medium text-primary-foreground hover:bg-primary/90"
          >
            Begin — boot audio
          </button>
          <span className="text-sm text-muted-foreground">
            (a muted preview is already demonstrating the arc)
          </span>
        </div>
      )}

      <div className="flex flex-col gap-4">
        <div className="flex flex-wrap items-center gap-2">
          <span className="font-mono text-xs uppercase tracking-[0.18em] text-muted-foreground">
            Conduct
          </span>
          <button
            type="button"
            onClick={() => {
              boot();
              setDensity((d) => Math.max(0, d - 1));
            }}
            className={macroBtn}
          >
            Density − <span className="opacity-60">(z)</span>
          </button>
          <button
            type="button"
            onClick={() => {
              boot();
              setDensity((d) => Math.min(3, d + 1));
            }}
            className={macroBtn}
          >
            Density + <span className="opacity-60">(x)</span>
          </button>
          <button
            type="button"
            onClick={() => {
              boot();
              setRegister((r) => Math.max(-2, r - 1));
            }}
            className={macroBtn}
          >
            Register − <span className="opacity-60">(c)</span>
          </button>
          <button
            type="button"
            onClick={() => {
              boot();
              setRegister((r) => Math.min(2, r + 1));
            }}
            className={macroBtn}
          >
            Register + <span className="opacity-60">(v)</span>
          </button>
          <button
            type="button"
            onClick={() => {
              boot();
              setGhostLead((g) => !g);
            }}
            className={`${btnBase} ${
              ghostLead
                ? "bg-primary text-primary-foreground hover:bg-primary/90"
                : "bg-secondary text-secondary-foreground hover:bg-secondary/80"
            }`}
            aria-pressed={ghostLead}
          >
            {ghostLead ? "Ghost has it" : "You have it"}{" "}
            <span className="opacity-60">(space)</span>
          </button>
          {booted && (
            <button type="button" onClick={restart} className={macroBtn}>
              Restart tune
            </button>
          )}
        </div>

        <div className="flex flex-col gap-2">
          <span className="font-mono text-xs uppercase tracking-[0.18em] text-muted-foreground">
            Play — F major (keys a s d f g h j k l)
          </span>
          <div className="flex flex-wrap gap-2">
            {MELODY_KEYS.map((k, i) => (
              <button
                key={k}
                type="button"
                onPointerDown={(e) => {
                  e.preventDefault();
                  playScaleNote(i);
                }}
                className="flex min-h-[44px] min-w-[44px] items-center justify-center rounded-md bg-secondary text-sm font-medium text-secondary-foreground hover:bg-secondary/80"
              >
                {k}
              </button>
            ))}
          </div>
        </div>

        <dl className="flex flex-wrap gap-x-8 gap-y-1 text-sm text-muted-foreground">
          <div className="flex gap-2">
            <dt className="font-mono text-xs uppercase tracking-[0.18em]">
              Density
            </dt>
            <dd className="text-foreground">{density}/3</dd>
          </div>
          <div className="flex gap-2">
            <dt className="font-mono text-xs uppercase tracking-[0.18em]">
              Register
            </dt>
            <dd className="text-foreground">
              {register > 0 ? `+${register}` : register}
            </dd>
          </div>
          <div className="flex gap-2">
            <dt className="font-mono text-xs uppercase tracking-[0.18em]">
              Banked motifs
            </dt>
            <dd className="text-foreground">{libCount}</dd>
          </div>
          {ended && (
            <div className="flex gap-2">
              <dt className="font-mono text-xs uppercase tracking-[0.18em]">
                Form
              </dt>
              <dd className="text-foreground">resolved · Fmaj7</dd>
            </div>
          )}
        </dl>
      </div>

      <PrototypeNav slugs={["10872-choruskeeper"]} />
    </main>
  );
}

// ── small drawing / theory helpers (never `use`-prefixed) ──────────────────
const ROOT_NAMES = [
  "C",
  "Db",
  "D",
  "Eb",
  "E",
  "F",
  "Gb",
  "G",
  "Ab",
  "A",
  "Bb",
  "B",
];

function nearestOf(midi: number, pcs: number[]): number {
  let best = midi;
  let bestD = 99;
  for (const pc of pcs) {
    const base = midi - (((midi % 12) - pc + 12) % 12);
    for (const cand of [base, base + 12, base - 12]) {
      const d = Math.abs(cand - midi);
      if (d < bestD) {
        bestD = d;
        best = cand;
      }
    }
  }
  return best;
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
