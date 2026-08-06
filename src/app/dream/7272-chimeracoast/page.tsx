"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { PrototypeNav } from "../_shared/prototype-nav";
import { VIOLET, INDIGO, MAGENTA } from "../_shared/palette";
import {
  applyConduct,
  createRing,
  midiToFreq,
  mulberry32,
  stepRing,
  snapToDorian,
  PROGRESSION,
  HOME_ROOT_MIDI,
  DORIAN_STEPS,
  CHORD_NAMES,
  N,
  SEED,
  type RingReadout,
  type RingState,
} from "./engine";

// ─────────────────────────────────────────────────────────────────────────────
// Chimeracoast — a living generative tide on a RING of nonlocally-coupled phase
// oscillators (Kuramoto–Battogtokh / Abrams–Strogatz chimera). One ARC of the
// coast spontaneously locks into a coherent, in-tune wave while the rest stays
// choppy — a travelling CHIMERA. The coherent arc's position sweeps the choir
// across the stereo field before the whole coast comes home (D Dorian, Dm).
//
// Alive-on-load: the ring evolves and the canvas drifts from mount, silently,
// before any click. Audio starts on the first gesture (autoplay policy). Conduct
// with device tilt (a breath that disperses the arc) → an on-screen slider →
// a seeded auto-conduct that always keeps it breathing. NO microphone.
//
// Everything deterministic (mulberry32(0x7272), no Math.random/Date.now). See
// engine.ts for the ring dynamics; this file is audio + canvas + UI + teardown.
// ─────────────────────────────────────────────────────────────────────────────

type ConductMode = "tilt" | "slider" | "auto";

interface AudioRig {
  ctx: AudioContext;
  master: GainNode;
  limiter: DynamicsCompressorNode;
  out: GainNode;
  reverb: ConvolverNode;
  // Coherent-arc choir: detuned voices → filter → panner (follows arc centre).
  choirVoices: OscillatorNode[];
  choirFilter: BiquadFilterNode;
  choirPan: StereoPannerNode;
  choirGain: GainNode;
  // Incoherent haze: beating detuned pair spread wide.
  hazeVoices: OscillatorNode[];
  hazeFilter: BiquadFilterNode;
  hazeGain: GainNode;
  // Shared low end.
  subOsc: OscillatorNode;
  subGain: GainNode;
  droneOsc: OscillatorNode;
  droneGain: GainNode;
  // FM bell bus.
  bellBus: GainNode;
}

// Runtime PRNG for on-the-fly choices (bell pitch) + auto-conduct. Seeded.
function makeRng() {
  return mulberry32(SEED ^ 0x51f);
}

// Build a procedural reverb impulse (noise × exponential decay) — no fetch.
function buildImpulse(ctx: AudioContext, rng: () => number): AudioBuffer {
  const seconds = 3.8;
  const rate = ctx.sampleRate;
  const len = Math.floor(rate * seconds);
  const buf = ctx.createBuffer(2, len, rate);
  for (let ch = 0; ch < 2; ch++) {
    const data = buf.getChannelData(ch);
    for (let i = 0; i < len; i++) {
      const decay = Math.pow(1 - i / len, 2.8);
      data[i] = (rng() * 2 - 1) * decay;
    }
  }
  return buf;
}

export default function ChimeracoastPage() {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  // ── Engine + runtime refs (kept out of React so rAF never re-renders) ──────
  const ringRef = useRef<RingState>(createRing());
  const readoutRef = useRef<RingReadout | null>(null);
  const rngRef = useRef<() => number>(makeRng());
  const rafRef = useRef<number>(0);
  const lastTsRef = useRef<number>(0);

  const audioRef = useRef<AudioRig | null>(null);
  const chordIndexRef = useRef<number>(-1);
  const bellCooldownRef = useRef<number>(0);
  const reducedRef = useRef<boolean>(false);

  // Conduct input.
  const sliderRef = useRef<number>(0);
  const tiltLevelRef = useRef<number>(0);
  const lastTiltTsRef = useRef<number>(0);

  // ── React UI state (throttled) ─────────────────────────────────────────────
  const [audioOn, setAudioOn] = useState(false);
  const [noCanvas, setNoCanvas] = useState(false);
  const [showNotes, setShowNotes] = useState(false);
  const [tiltOn, setTiltOn] = useState(false);
  const [tiltError, setTiltError] = useState<string | null>(null);
  const [slider, setSlider] = useState(0);
  const [ui, setUi] = useState({
    arcPan: 0,
    arcCoherence: 0,
    chimeraMetric: 0,
    globalOrder: 0,
    tension: 0,
    minutes: 0,
    section: "Choppy coast",
    chord: "Dm",
    mode: "auto" as ConductMode,
  });

  // ── Device tilt (primary conduct verb — a breath that disperses the arc) ────
  const onOrient = useCallback((e: DeviceOrientationEvent) => {
    const beta = e.beta ?? 0; // front-back tilt
    const gamma = e.gamma ?? 0; // left-right tilt
    const mag = Math.min(1, (Math.abs(beta) + Math.abs(gamma)) / 90);
    tiltLevelRef.current = mag;
    lastTiltTsRef.current = performance.now();
  }, []);

  const enableTilt = useCallback(async () => {
    interface OrientCtor {
      requestPermission?: () => Promise<"granted" | "denied">;
    }
    const Ctor =
      typeof DeviceOrientationEvent !== "undefined"
        ? (DeviceOrientationEvent as unknown as OrientCtor)
        : null;
    try {
      if (Ctor && typeof Ctor.requestPermission === "function") {
        const res = await Ctor.requestPermission();
        if (res !== "granted") {
          setTiltError("Tilt permission denied — use the slider below.");
          return;
        }
      }
      if (typeof window === "undefined" || !("DeviceOrientationEvent" in window)) {
        setTiltError("This device has no orientation sensor — use the slider.");
        return;
      }
      window.addEventListener("deviceorientation", onOrient);
      setTiltOn(true);
      setTiltError(null);
    } catch {
      setTiltError("Could not start tilt — use the slider below.");
    }
  }, [onOrient]);

  // ── Start audio (first gesture) ────────────────────────────────────────────
  const beginCoast = useCallback(async () => {
    if (audioRef.current) {
      await audioRef.current.ctx.resume();
      return;
    }
    const Ctor: typeof AudioContext =
      window.AudioContext ||
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (window as unknown as any).webkitAudioContext;
    const ctx = new Ctor();
    await ctx.resume();
    const rng = rngRef.current;

    // Final chain: master mix → limiter → out (caps overall level ~0.25).
    const out = ctx.createGain();
    out.gain.value = 0.25; // hard ceiling on output level
    const limiter = ctx.createDynamicsCompressor();
    limiter.threshold.value = -14;
    limiter.knee.value = 6;
    limiter.ratio.value = 14;
    limiter.attack.value = 0.004;
    limiter.release.value = 0.25;
    limiter.connect(out).connect(ctx.destination);

    const master = ctx.createGain();
    master.gain.value = 0;
    master.connect(limiter);
    // Slow fade-in so the coast arrives, never clicks.
    master.gain.setValueAtTime(0, ctx.currentTime);
    master.gain.linearRampToValueAtTime(0.95, ctx.currentTime + 4);

    // Reverb (procedural impulse) with a wet send.
    const reverb = ctx.createConvolver();
    reverb.buffer = buildImpulse(ctx, rng);
    const wet = ctx.createGain();
    wet.gain.value = 0.6;
    reverb.connect(wet).connect(master);

    // ── COHERENT-ARC CHOIR: 4 voices → lowpass → panner (arc centre) → mix ────
    const choirFilter = ctx.createBiquadFilter();
    choirFilter.type = "lowpass";
    choirFilter.frequency.value = 800;
    choirFilter.Q.value = 0.6;
    const choirPan = ctx.createStereoPanner();
    choirPan.pan.value = 0;
    const choirGain = ctx.createGain();
    choirGain.gain.value = 0.0;
    const choirVoices: OscillatorNode[] = [];
    for (let i = 0; i < 4; i++) {
      const o = ctx.createOscillator();
      o.type = i === 3 ? "triangle" : "sawtooth";
      o.frequency.value = 220;
      o.detune.value = 0;
      o.connect(choirFilter);
      o.start();
      choirVoices.push(o);
    }
    choirFilter.connect(choirPan).connect(choirGain);
    choirGain.connect(master); // dry
    choirGain.connect(reverb); // wet

    // ── INCOHERENT HAZE: beating detuned pair, spread wide, quiet + dark ───────
    const hazeFilter = ctx.createBiquadFilter();
    hazeFilter.type = "lowpass";
    hazeFilter.frequency.value = 520;
    hazeFilter.Q.value = 0.4;
    const hazeGain = ctx.createGain();
    hazeGain.gain.value = 0.0;
    const hazeVoices: OscillatorNode[] = [];
    const hazePans = [-0.85, 0.85, -0.5, 0.5];
    for (let i = 0; i < 4; i++) {
      const o = ctx.createOscillator();
      o.type = "sawtooth";
      o.frequency.value = 220;
      o.detune.value = (i - 1.5) * 12;
      const p = ctx.createStereoPanner();
      p.pan.value = hazePans[i];
      o.connect(hazeFilter);
      hazeFilter.connect(p).connect(hazeGain);
      o.start();
      hazeVoices.push(o);
    }
    hazeGain.connect(master);
    hazeGain.connect(reverb);

    // ── SUB voice ──
    const subOsc = ctx.createOscillator();
    subOsc.type = "sine";
    subOsc.frequency.value = midiToFreq(HOME_ROOT_MIDI - 12);
    const subGain = ctx.createGain();
    subGain.gain.value = 0.16;
    subOsc.connect(subGain).connect(master);
    subOsc.start();

    // ── Low DRONE (constant D bed) ──
    const droneOsc = ctx.createOscillator();
    droneOsc.type = "sine";
    droneOsc.frequency.value = midiToFreq(HOME_ROOT_MIDI - 24);
    const droneGain = ctx.createGain();
    droneGain.gain.value = 0.08;
    droneOsc.connect(droneGain).connect(master);
    droneOsc.connect(droneGain).connect(reverb);
    droneOsc.start();

    // ── BELL bus (FM plucks, mostly to reverb) ──
    const bellBus = ctx.createGain();
    bellBus.gain.value = 0.5;
    bellBus.connect(master);
    bellBus.connect(reverb);

    audioRef.current = {
      ctx,
      master,
      limiter,
      out,
      reverb,
      choirVoices,
      choirFilter,
      choirPan,
      choirGain,
      hazeVoices,
      hazeFilter,
      hazeGain,
      subOsc,
      subGain,
      droneOsc,
      droneGain,
      bellBus,
    };
    setAudioOn(true);
  }, []);

  // Fire a short FM pluck (bell) — agogic duration passed in by the caller.
  const firePluck = useCallback(
    (freq: number, when: number, dur: number, level: number, pan: number) => {
      const rig = audioRef.current;
      if (!rig) return;
      const { ctx, bellBus } = rig;
      const car = ctx.createOscillator();
      const mod = ctx.createOscillator();
      const modGain = ctx.createGain();
      const amp = ctx.createGain();
      const panner = ctx.createStereoPanner();
      car.type = "sine";
      mod.type = "sine";
      car.frequency.value = freq;
      mod.frequency.value = freq * 2.005;
      modGain.gain.setValueAtTime(freq * 1.3, when);
      modGain.gain.exponentialRampToValueAtTime(freq * 0.2, when + dur);
      mod.connect(modGain).connect(car.frequency);
      amp.gain.setValueAtTime(0.0001, when);
      amp.gain.exponentialRampToValueAtTime(level, when + 0.008);
      amp.gain.exponentialRampToValueAtTime(0.0001, when + dur);
      panner.pan.value = pan;
      car.connect(amp).connect(panner).connect(bellBus);
      car.start(when);
      mod.start(when);
      const end = when + dur + 0.05;
      car.stop(end);
      mod.stop(end);
      car.onended = () => {
        try {
          car.disconnect();
          mod.disconnect();
          modGain.disconnect();
          amp.disconnect();
          panner.disconnect();
        } catch {
          /* already gone */
        }
      };
    },
    []
  );

  // ── Apply the current readout to the audio graph ───────────────────────────
  const applyAudio = useCallback(
    (r: RingReadout, dtSec: number) => {
      const rig = audioRef.current;
      if (!rig) return;
      const { ctx } = rig;
      const now = ctx.currentTime;

      // COHERENT ARC = choir. Pan follows the arc centre (sweeps the field).
      // Louder + brighter + more in-tune as the arc coherence rises.
      rig.choirPan.pan.setTargetAtTime(r.arcCenterPan, now, 0.18);
      const choirLevel = 0.03 + r.arcCoherence * r.arcWidth * 0.5;
      rig.choirGain.gain.setTargetAtTime(choirLevel, now, 0.35);
      const cutoff = 380 + r.brightness * 3200;
      rig.choirFilter.frequency.setTargetAtTime(cutoff, now, 0.4);
      // Detune tightens toward 0 as the arc locks in tune; loose when choppy.
      const spread = (1 - r.arcCoherence) * 16;
      const detunes = [-spread, spread * 0.6, -spread * 0.3, spread];
      for (let i = 0; i < rig.choirVoices.length; i++) {
        rig.choirVoices[i].detune.setTargetAtTime(detunes[i], now, 0.3);
      }

      // INCOHERENT REGION = haze. Level from choppiness; more beating when worse.
      const hazeLevel = 0.02 + r.incoherence * (1 - r.arcWidth) * 0.14;
      rig.hazeGain.gain.setTargetAtTime(hazeLevel, now, 0.5);
      rig.hazeFilter.frequency.setTargetAtTime(
        420 + r.incoherence * 500,
        now,
        0.6
      );
      for (let i = 0; i < rig.hazeVoices.length; i++) {
        rig.hazeVoices[i].detune.setTargetAtTime(
          (i - 1.5) * (6 + r.incoherence * 34),
          now,
          0.5
        );
      }

      // Chord change → ramp choir + haze + sub to the new chord tones.
      if (r.chordIndex !== chordIndexRef.current) {
        chordIndexRef.current = r.chordIndex;
        const chord = PROGRESSION[r.chordIndex];
        for (let i = 0; i < rig.choirVoices.length; i++) {
          const midi = HOME_ROOT_MIDI + chord[i % chord.length] + (i === 3 ? 12 : 0);
          rig.choirVoices[i].frequency.setTargetAtTime(midiToFreq(midi), now, 0.9);
        }
        const rootMidi = HOME_ROOT_MIDI + chord[0];
        for (let i = 0; i < rig.hazeVoices.length; i++) {
          rig.hazeVoices[i].frequency.setTargetAtTime(
            midiToFreq(rootMidi),
            now,
            1.1
          );
        }
        rig.subOsc.frequency.setTargetAtTime(
          midiToFreq(rootMidi - 12),
          now,
          1.2
        );
      }

      // ── FM bells on local-order threshold CROSSINGS (agogic): a crossing HOLDS
      // the next event (marks it by duration). Panned to the arc centre. ────────
      bellCooldownRef.current -= dtSec;
      if (r.localCrossing && bellCooldownRef.current <= 0) {
        bellCooldownRef.current = 0.16; // guard against machine-gun crossings
        const rng = rngRef.current;
        const chord = PROGRESSION[r.chordIndex];
        let midi =
          HOME_ROOT_MIDI + chord[Math.floor(rng() * chord.length)] + 12;
        if (rng() < 0.4) {
          midi =
            HOME_ROOT_MIDI +
            DORIAN_STEPS[Math.floor(rng() * DORIAN_STEPS.length)] +
            12;
        }
        if (rng() < 0.35) midi += 12; // sparkle an octave up
        midi = snapToDorian(midi);
        // Agogic accent: hold (lengthen) the note when a threshold was crossed.
        const holdMul = 1 + r.accent * 1.8;
        const dur = (0.8 + r.brightness * 1.6) * holdMul;
        const level = (0.05 + r.arcCoherence * 0.12) * (1 + r.accent * 0.5);
        firePluck(midiToFreq(midi), now + 0.02, dur, level, r.arcCenterPan);
      }
    },
    [firePluck]
  );

  // ── Read active conduct source (ladder: tilt → slider → seeded auto) ───────
  const readConduct = useCallback(
    (tsMs: number, ringT: number): { mode: ConductMode; level: number } => {
      if (tiltOn && tsMs - lastTiltTsRef.current < 1500) {
        return { mode: "tilt", level: tiltLevelRef.current };
      }
      if (sliderRef.current > 0.001) {
        return { mode: "slider", level: sliderRef.current };
      }
      // Seeded auto-conduct: gentle deterministic breaths keyed to the ring's own
      // clock so it always breathes with zero input (no Math.random/Date.now).
      const t = ringT;
      const auto =
        0.11 *
        Math.max(
          0,
          Math.sin(t * 0.055) * 0.6 +
            Math.sin(t * 0.019 + 1.7) * 0.4 -
            0.35
        );
      return { mode: "auto", level: auto };
    },
    [tiltOn]
  );

  // ── Draw one frame: the RING literally (coherent arc = bright smooth band) ──
  const drawFrame = useCallback(
    (ctx: CanvasRenderingContext2D, W: number, H: number, r: RingReadout) => {
      const reduced = reducedRef.current;
      const cx = W * 0.5;
      const cy = H * 0.46;
      const R = Math.min(W, H) * 0.3;

      // Background: violet radial, luminance drifts SLOWLY with global order.
      const lum = 0.2 + r.globalOrder * 0.35;
      const bg = ctx.createRadialGradient(cx, cy, 0, cx, cy, Math.max(W, H) * 0.7);
      bg.addColorStop(0, mix(VIOLET[900], INDIGO, lum * 0.4));
      bg.addColorStop(0.6, VIOLET[950]);
      bg.addColorStop(1, "#050308");
      ctx.fillStyle = bg;
      ctx.fillRect(0, 0, W, H);

      // Faint guide circle for the coast ring.
      ctx.strokeStyle = rgba(VIOLET[700], 0.35);
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.arc(cx, cy, R, 0, Math.PI * 2);
      ctx.stroke();

      const local = r.localOrder;
      const phases = r.phases;
      const drift = reduced ? 0 : r.t * 0.25;

      // ── The coast as a phase wave on the ring. Radius is modulated by each
      // oscillator's phase; where neighbours align (the coherent arc) the wave
      // reads as a SMOOTH bright band, where they scatter it reads as CHOPPY. ──
      // Points around the ring (start at top).
      const pts: Array<{ x: number; y: number; l: number; ph: number }> = [];
      for (let i = 0; i <= N; i++) {
        const idx = i % N;
        const a = (Math.PI * 2 * idx) / N - Math.PI / 2;
        const wave = Math.sin(phases[idx] + drift) * (R * 0.14);
        const rr = R + wave;
        pts.push({
          x: cx + Math.cos(a) * rr,
          y: cy + Math.sin(a) * rr,
          l: local[idx],
          ph: phases[idx],
        });
      }

      // Filled band between guide circle and the phase wave, coloured by phase,
      // opacity by local order (coherent arc glows; choppy sea stays dim).
      for (let i = 0; i < N; i++) {
        const p0 = pts[i];
        const p1 = pts[i + 1];
        const a0 = (Math.PI * 2 * i) / N - Math.PI / 2;
        const a1 = (Math.PI * 2 * (i + 1)) / N - Math.PI / 2;
        const ix0 = cx + Math.cos(a0) * R;
        const iy0 = cy + Math.sin(a0) * R;
        const ix1 = cx + Math.cos(a1) * R;
        const iy1 = cy + Math.sin(a1) * R;
        ctx.beginPath();
        ctx.moveTo(ix0, iy0);
        ctx.lineTo(p0.x, p0.y);
        ctx.lineTo(p1.x, p1.y);
        ctx.lineTo(ix1, iy1);
        ctx.closePath();
        const col = phaseColor(p0.ph);
        ctx.fillStyle = rgba(col, 0.08 + p0.l * 0.5);
        ctx.fill();
      }

      // The phase-wave stroke itself — bright and continuous over the coherent
      // arc, faint and jagged over the incoherent sea.
      ctx.lineJoin = "round";
      for (let i = 0; i < N; i++) {
        const p0 = pts[i];
        const p1 = pts[i + 1];
        ctx.strokeStyle = rgba(mix(VIOLET[200], MAGENTA, 1 - p0.l), 0.15 + p0.l * 0.75);
        ctx.lineWidth = 1 + p0.l * 3;
        ctx.beginPath();
        ctx.moveTo(p0.x, p0.y);
        ctx.lineTo(p1.x, p1.y);
        ctx.stroke();
      }

      // Oscillator nodes — a bright knot along the coherent arc, dim specks in
      // the choppy sea.
      for (let i = 0; i < N; i++) {
        const p = pts[i];
        const rad = 2 + p.l * 5;
        const g = ctx.createRadialGradient(p.x, p.y, 0, p.x, p.y, rad * 3);
        const col = mix(VIOLET[300], VIOLET[100], p.l);
        g.addColorStop(0, rgba(col, 0.25 + p.l * 0.65));
        g.addColorStop(1, rgba(col, 0));
        ctx.fillStyle = g;
        ctx.fillRect(p.x - rad * 3, p.y - rad * 3, rad * 6, rad * 6);
      }

      // ── The coherent ARC highlight + its sweeping centre (drives the pan). ──
      if (r.arcWidth > 0.02) {
        const span = Math.PI * 2 * r.arcWidth;
        const c = r.arcCenterAngle - Math.PI / 2;
        ctx.strokeStyle = rgba(VIOLET[100], 0.25 + r.arcCoherence * 0.5);
        ctx.lineWidth = 2.5;
        ctx.beginPath();
        ctx.arc(cx, cy, R * 1.16, c - span / 2, c + span / 2);
        ctx.stroke();
      }
      // Sweep marker: a ray to the arc centre; its horizontal position mirrors
      // the stereo pan.
      {
        const c = r.arcCenterAngle - Math.PI / 2;
        const mx = cx + Math.cos(c) * R * 1.28;
        const my = cy + Math.sin(c) * R * 1.28;
        const g = ctx.createRadialGradient(mx, my, 0, mx, my, 22);
        g.addColorStop(0, rgba(VIOLET[100], 0.5 + r.arcCoherence * 0.4));
        g.addColorStop(1, rgba(VIOLET[100], 0));
        ctx.fillStyle = g;
        ctx.fillRect(mx - 22, my - 22, 44, 44);
      }

      // ── Unrolled coastline strip along the bottom: local order as a height
      // profile (tall smooth band = coherent arc; jagged = choppy sea). ────────
      const stripY = H - Math.min(H * 0.16, 120);
      const stripH = Math.min(H * 0.13, 96);
      const stripW = W * 0.86;
      const stripX = (W - stripW) / 2;
      ctx.strokeStyle = rgba(VIOLET[700], 0.3);
      ctx.lineWidth = 1;
      ctx.strokeRect(stripX, stripY, stripW, stripH);
      for (let i = 0; i < N; i++) {
        const bw = stripW / N;
        const x = stripX + i * bw;
        const h = local[i] * stripH;
        ctx.fillStyle = rgba(phaseColor(phases[i]), 0.35 + local[i] * 0.55);
        ctx.fillRect(x + 0.5, stripY + (stripH - h), bw - 1, h);
      }

      // Rising shimmer from the incoherent haze (skipped under reduced motion).
      if (!reduced) {
        const n = 34;
        for (let i = 0; i < n; i++) {
          const seed = i * 12.9898;
          const px = (Math.sin(seed) * 0.5 + 0.5) * W;
          const speed = 6 + (Math.sin(seed * 1.7) * 0.5 + 0.5) * 18;
          const py = H - ((r.t * speed + i * 37) % (H * 0.9));
          const tw = 0.3 + 0.7 * (0.5 + 0.5 * Math.sin(r.t * 1.1 + seed));
          ctx.fillStyle = rgba(VIOLET[200], (0.04 + r.incoherence * 0.1) * tw);
          const s = 1.2 + tw * 1.6;
          ctx.fillRect(px, py, s, s);
        }
      }
    },
    []
  );

  // ── Main loop: ring step + audio + draw, throttled UI push ─────────────────
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) {
      setNoCanvas(true);
      return;
    }
    if (typeof window !== "undefined" && window.matchMedia) {
      reducedRef.current = window.matchMedia(
        "(prefers-reduced-motion: reduce)"
      ).matches;
    }

    let disposed = false;
    let uiThrottle = 0;

    const resize = () => {
      const dpr = Math.min(2, window.devicePixelRatio || 1);
      const rect = canvas.getBoundingClientRect();
      canvas.width = Math.max(1, Math.floor(rect.width * dpr));
      canvas.height = Math.max(1, Math.floor(rect.height * dpr));
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    };
    resize();
    window.addEventListener("resize", resize);

    const frame = (ts: number) => {
      if (disposed) return;
      rafRef.current = requestAnimationFrame(frame);
      const last = lastTsRef.current || ts;
      let dt = (ts - last) / 1000;
      lastTsRef.current = ts;
      if (dt > 0.1) dt = 0.1; // guard against tab-away jumps
      if (dt <= 0) dt = 1 / 60;

      // Conduct: read active source, inject energy (ring reabsorbs over ~26 s).
      const { mode, level } = readConduct(ts, ringRef.current.t);
      if (level > 0) applyConduct(ringRef.current, level * dt * 0.6);

      // Step the nonlocal-ring chimera (always alive, even before audio).
      const r = stepRing(ringRef.current, dt);
      readoutRef.current = r;

      if (audioRef.current) applyAudio(r, dt);

      const rect = canvas.getBoundingClientRect();
      drawFrame(ctx, rect.width, rect.height, r);

      uiThrottle += dt;
      if (uiThrottle >= 0.2) {
        uiThrottle = 0;
        setUi({
          arcPan: r.arcCenterPan,
          arcCoherence: r.arcCoherence,
          chimeraMetric: r.chimeraMetric,
          globalOrder: r.globalOrder,
          tension: r.tension,
          minutes: r.t / 60,
          section: r.section,
          chord: CHORD_NAMES[r.chordIndex] ?? "Dm",
          mode,
        });
      }
    };
    rafRef.current = requestAnimationFrame(frame);

    return () => {
      disposed = true;
      cancelAnimationFrame(rafRef.current);
      window.removeEventListener("resize", resize);
    };
  }, [applyAudio, drawFrame, readConduct]);

  // ── Full teardown on unmount ───────────────────────────────────────────────
  useEffect(() => {
    const onOrientRef = onOrient;
    return () => {
      cancelAnimationFrame(rafRef.current);
      window.removeEventListener("deviceorientation", onOrientRef);
      const rig = audioRef.current;
      if (rig) {
        try {
          rig.choirVoices.forEach((o) => o.stop());
          rig.hazeVoices.forEach((o) => o.stop());
          rig.subOsc.stop();
          rig.droneOsc.stop();
          rig.master.disconnect();
          rig.out.disconnect();
        } catch {
          /* nodes already stopped */
        }
        void rig.ctx.close();
        audioRef.current = null;
      }
    };
  }, [onOrient]);

  const fmt = (x: number) => x.toFixed(2);
  const panLabel =
    ui.arcPan < -0.25 ? "L" : ui.arcPan > 0.25 ? "R" : "C";

  return (
    <main className="relative min-h-[100dvh] w-full overflow-hidden bg-background text-foreground">
      <canvas
        ref={canvasRef}
        className="absolute inset-0 h-full w-full"
        aria-hidden
      />

      {noCanvas && (
        <div className="absolute inset-0 z-20 flex items-center justify-center p-6">
          <p className="max-w-md text-center text-base text-destructive">
            This browser could not provide a 2D canvas, so the coast cannot be
            drawn. Try a current version of Safari, Chrome, or Firefox.
          </p>
        </div>
      )}

      {/* ── Hero / chrome ─────────────────────────────────────────────────── */}
      <div className="pointer-events-none absolute inset-0 z-10 flex flex-col justify-between p-5 sm:p-8">
        <header className="pointer-events-auto max-w-xl">
          <p className="font-mono text-xs uppercase tracking-[0.18em] text-muted-foreground">
            Chimeracoast · 7272
          </p>
          <h1 className="mt-2 text-2xl font-semibold tracking-tight sm:text-3xl">
            A travelling chimera on a coast of oscillators
          </h1>
          <p className="mt-2 max-w-md text-base text-muted-foreground">
            A ring of nonlocally-coupled phase oscillators splits on its own: one
            arc of the coast locks into a coherent, in-tune wave while the rest
            stays choppy — and that bright arc drifts around the ring, sweeping
            the choir across the stereo field before the whole coast comes home.
          </p>

          <div className="mt-4 flex flex-wrap items-center gap-2">
            {!audioOn ? (
              <button
                type="button"
                onClick={beginCoast}
                className="min-h-[44px] rounded-md bg-primary px-6 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90"
              >
                Begin
              </button>
            ) : (
              <span className="font-mono text-xs uppercase tracking-[0.18em] text-primary">
                sounding
              </span>
            )}
            <button
              type="button"
              onClick={() => setShowNotes(true)}
              className="min-h-[44px] rounded-md border border-border bg-background/60 px-4 text-sm text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
            >
              Read the design notes
            </button>
          </div>
          {!audioOn && (
            <p className="mt-2 text-sm text-muted-foreground">
              The coast is already alive and drifting. Audio starts on your first
              click (browser autoplay policy).
            </p>
          )}
        </header>

        {/* Conduct + live readout */}
        <footer className="pointer-events-auto flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
          <div className="max-w-sm">
            <p className="font-mono text-xs uppercase tracking-[0.18em] text-muted-foreground">
              Conduct ·{" "}
              <span className="text-primary">
                {ui.mode === "tilt"
                  ? "tilt (breath)"
                  : ui.mode === "slider"
                  ? "slider"
                  : "auto"}
              </span>
            </p>
            <div className="mt-2 flex flex-wrap items-center gap-2">
              <button
                type="button"
                onClick={enableTilt}
                disabled={tiltOn}
                className="min-h-[44px] rounded-md border border-border bg-background/60 px-4 text-sm text-muted-foreground transition-colors hover:bg-accent hover:text-foreground disabled:opacity-40"
              >
                {tiltOn ? "Tilt on" : "Enable tilt"}
              </button>
            </div>
            <label className="mt-3 block">
              <span className="font-mono text-xs uppercase tracking-[0.18em] text-muted-foreground">
                Stir the coast
              </span>
              <input
                type="range"
                min={0}
                max={1}
                step={0.01}
                value={slider}
                onChange={(e) => {
                  const v = Number(e.target.value);
                  setSlider(v);
                  sliderRef.current = v;
                }}
                className="mt-1 w-full accent-primary"
              />
            </label>
            {tiltError && (
              <p className="mt-1 text-sm text-destructive">{tiltError}</p>
            )}
          </div>

          <dl className="grid grid-cols-3 gap-x-5 gap-y-2 text-sm sm:text-right">
            <Readout label="arc pan" value={`${panLabel} ${fmt(ui.arcPan)}`} />
            <Readout label="arc coherence" value={fmt(ui.arcCoherence)} />
            <Readout label="chimera" value={fmt(ui.chimeraMetric)} />
            <Readout label="section" value={ui.section} />
            <Readout label="tension" value={fmt(ui.tension)} />
            <Readout
              label="elapsed"
              value={`${Math.floor(ui.minutes)}:${String(
                Math.floor((ui.minutes % 1) * 60)
              ).padStart(2, "0")}`}
            />
          </dl>
        </footer>
      </div>

      {/* ── Design notes dialog ───────────────────────────────────────────── */}
      {showNotes && (
        <div
          className="absolute inset-0 z-30 flex items-center justify-center bg-black/50 p-6 backdrop-blur-sm"
          onClick={() => setShowNotes(false)}
        >
          <div
            className="max-h-[80dvh] max-w-lg overflow-y-auto rounded-lg border border-border bg-background p-6 shadow-lg"
            onClick={(e) => e.stopPropagation()}
          >
            <h2 className="text-xl font-semibold tracking-tight text-foreground">
              Design notes
            </h2>
            <div className="mt-3 space-y-3 text-sm leading-relaxed text-muted-foreground">
              <p>
                {N} identical phase oscillators sit on a{" "}
                <span className="text-foreground">ring</span> — a coastline. Each
                couples to the whole ring through a distance-dependent cosine
                kernel (strong locally, weak far away) with a{" "}
                <span className="text-foreground">phase lag near π/2</span>. In
                that regime the ring spontaneously splits into a{" "}
                <span className="text-primary">chimera</span>: a contiguous arc
                where phases align (high local order) coexisting with a choppy,
                incoherent remainder — exactly the Kuramoto–Battogtokh (2002) and
                Abrams–Strogatz (2004/2006) chimera state. The coherent arc slowly{" "}
                <span className="text-foreground">drifts</span> around the ring.
              </p>
              <p>
                The music is the geometry. The coherent arc is a bright, in-tune
                choir whose{" "}
                <span className="text-primary">stereo pan follows the arc&rsquo;s
                centre</span>{" "}
                as it travels; it tightens in tune and brightens as its local
                order rises. The incoherent coast is a quieter, detuned, beating
                haze spread across the field. A shared sub and drone hold D; FM
                bells ring on local-order threshold crossings, and — following the{" "}
                <span className="text-foreground">
                  Agogic timing framework (arXiv 2608.03999, 2026)
                </span>{" "}
                — a crossing <span className="text-primary">holds</span> the next
                bell (an accent by duration, not loudness).
              </p>
              <p>
                Over ~7 minutes a slow tide of the phase lag makes chimera
                episodes wax and wane; a late homecoming ramp collapses the lag to
                zero and adds a home pull, so the whole coast synchronizes into one
                wave in <span className="text-foreground">D Dorian</span>, resolved
                on Dm with low tension.
              </p>
              <p>
                Conduct with <span className="text-foreground">device tilt</span> —
                a breath that transiently disperses the coherent arc, which then
                reabsorbs — or the on-screen slider on desktop. A seeded
                auto-conduct always runs, so it lives and sounds with zero input.
                No microphone this cycle.
              </p>
              <p className="text-foreground">
                Safety: slow luminance drift only — no flicker. Deterministic
                (seeded PRNG); alive on load before any interaction; honours
                reduced-motion.
              </p>
            </div>
            <button
              type="button"
              onClick={() => setShowNotes(false)}
              className="mt-5 min-h-[44px] rounded-md bg-primary px-6 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90"
            >
              Close
            </button>
          </div>
        </div>
      )}

      <PrototypeNav slugs={["7272-chimeracoast"]} />
    </main>
  );
}

function Readout({ label, value }: { label: string; value: string }) {
  return (
    <div className="sm:text-right">
      <dt className="font-mono text-xs uppercase tracking-[0.18em] text-muted-foreground">
        {label}
      </dt>
      <dd className="text-foreground">{value}</dd>
    </div>
  );
}

// ── Small color helpers (raw hex is fine INSIDE canvas art) ──────────────────
const RAMP = [VIOLET[900], INDIGO, VIOLET[500], MAGENTA, VIOLET[300], VIOLET[100]];
/** Map a phase angle (0..2π) onto the violet ramp — the coast's phase colour. */
function phaseColor(phase: number): string {
  const u = (((phase / (Math.PI * 2)) % 1) + 1) % 1;
  const f = u * (RAMP.length - 1);
  const i = Math.floor(f);
  const t = f - i;
  return mix(RAMP[i], RAMP[Math.min(RAMP.length - 1, i + 1)], t);
}
function hexToRgb(hex: string): [number, number, number] {
  const h = hex.replace("#", "");
  return [
    parseInt(h.slice(0, 2), 16),
    parseInt(h.slice(2, 4), 16),
    parseInt(h.slice(4, 6), 16),
  ];
}
function mix(a: string, b: string, t: number): string {
  const ca = hexToRgb(a);
  const cb = hexToRgb(b);
  const tt = t < 0 ? 0 : t > 1 ? 1 : t;
  const r = Math.round(ca[0] + (cb[0] - ca[0]) * tt);
  const g = Math.round(ca[1] + (cb[1] - ca[1]) * tt);
  const bl = Math.round(ca[2] + (cb[2] - ca[2]) * tt);
  return `rgb(${r},${g},${bl})`;
}
function rgba(col: string, alpha: number): string {
  const [r, g, b] = col.startsWith("#")
    ? hexToRgb(col)
    : (col
        .replace(/rgb\(|\)/g, "")
        .split(",")
        .map((x) => parseInt(x, 10)) as [number, number, number]);
  return `rgba(${r},${g},${b},${alpha})`;
}
