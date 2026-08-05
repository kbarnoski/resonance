"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { PrototypeNav } from "../_shared/prototype-nav";
import { VIOLET, INDIGO, MAGENTA } from "../_shared/palette";
import {
  applyConduct,
  createField,
  midiToFreq,
  mulberry32,
  PROGRESSION,
  HOME_ROOT_MIDI,
  DORIAN_STEPS,
  snapToDorian,
  stepField,
  SEED,
  type FieldReadout,
  type FieldState,
} from "./engine";

// ─────────────────────────────────────────────────────────────────────────────
// Tidefield — a LIVING TIDE. A 7+ minute generative piece driven by a network
// of slow coupled phase oscillators (Kuramoto). The synchronization order
// parameter r conducts the whole thing: sections emerge from sync↔desync, the
// field never exactly repeats, and it always returns HOME (D Dorian). You
// conduct with your breath (or tilt / slider) — the tide reabsorbs your energy
// over ~30 s. See engine.ts for the dynamics; this file is audio + canvas + UI.
//
// Alive-on-load: the field evolves and the canvas drifts from mount, silently,
// before any click. Audio starts on the first gesture (autoplay policy).
// Everything deterministic (mulberry32, no Math.random/Date.now). Full teardown.
// ─────────────────────────────────────────────────────────────────────────────

type ConductMode = "tilt" | "mic" | "slider";

interface AudioRig {
  ctx: AudioContext;
  master: GainNode;
  padGain: GainNode;
  padFilter: BiquadFilterNode;
  padVoices: OscillatorNode[];
  subOsc: OscillatorNode;
  subGain: GainNode;
  droneOsc: OscillatorNode;
  droneGain: GainNode;
  bellBus: GainNode;
  reverb: ConvolverNode;
  chorusLFO: OscillatorNode;
}

interface MicRig {
  stream: MediaStream;
  analyser: AnalyserNode;
  buf: Float32Array;
}

// Runtime PRNG for on-the-fly choices (pitch, pan). Seeded — never Math.random.
function makeRng() {
  return mulberry32(SEED ^ 0x51f);
}

// Build a procedural reverb impulse (noise × exponential decay) — no fetch.
function buildImpulse(ctx: AudioContext, rng: () => number): AudioBuffer {
  const seconds = 3.4;
  const rate = ctx.sampleRate;
  const len = Math.floor(rate * seconds);
  const buf = ctx.createBuffer(2, len, rate);
  for (let ch = 0; ch < 2; ch++) {
    const data = buf.getChannelData(ch);
    for (let i = 0; i < len; i++) {
      const decay = Math.pow(1 - i / len, 2.6);
      data[i] = (rng() * 2 - 1) * decay;
    }
  }
  return buf;
}

export default function TidefieldPage() {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  // ── Engine + runtime refs (kept out of React so rAF never re-renders) ──────
  const fieldRef = useRef<FieldState>(createField());
  const readoutRef = useRef<FieldReadout | null>(null);
  const rngRef = useRef<() => number>(makeRng());
  const rafRef = useRef<number>(0);
  const lastTsRef = useRef<number>(0);

  // Audio + mic rigs.
  const audioRef = useRef<AudioRig | null>(null);
  const micRef = useRef<MicRig | null>(null);
  const bellAccumRef = useRef<number>(0);
  const chordIndexRef = useRef<number>(-1);

  // Conduct input.
  const sliderRef = useRef<number>(0);
  const tiltLevelRef = useRef<number>(0);
  const lastTiltTsRef = useRef<number>(0);
  const micLevelRef = useRef<number>(0);
  const micFloorRef = useRef<number>(0.004);

  // ── React UI state (throttled) ─────────────────────────────────────────────
  const [audioOn, setAudioOn] = useState(false);
  const [noCanvas, setNoCanvas] = useState(false);
  const [showNotes, setShowNotes] = useState(false);
  const [tiltOn, setTiltOn] = useState(false);
  const [micOn, setMicOn] = useState(false);
  const [micError, setMicError] = useState<string | null>(null);
  const [slider, setSlider] = useState(0);
  const [ui, setUi] = useState({
    order: 0,
    tension: 0,
    tide: 0,
    minutes: 0,
    section: "Dispersal",
    chord: "Dm",
    mode: "slider" as ConductMode,
    energy: 0,
  });

  const CHORD_NAMES = ["G", "Am", "Dm", "Em", "F"];

  // ── Device tilt ────────────────────────────────────────────────────────────
  const onOrient = useCallback((e: DeviceOrientationEvent) => {
    const beta = e.beta ?? 0; // front-back tilt
    const gamma = e.gamma ?? 0; // left-right tilt
    // Deviation from flat, normalized. Flat phone = calm; tilted = energy.
    const mag = Math.min(1, (Math.abs(beta) + Math.abs(gamma)) / 90);
    tiltLevelRef.current = mag;
    lastTiltTsRef.current = performance.now();
  }, []);

  const enableTilt = useCallback(async () => {
    interface OrientCtor {
      requestPermission?: () => Promise<"granted" | "denied">;
    }
    const Ctor = (
      typeof DeviceOrientationEvent !== "undefined"
        ? (DeviceOrientationEvent as unknown as OrientCtor)
        : null
    );
    try {
      if (Ctor && typeof Ctor.requestPermission === "function") {
        const res = await Ctor.requestPermission();
        if (res !== "granted") return;
      }
      window.addEventListener("deviceorientation", onOrient);
      setTiltOn(true);
    } catch {
      // Permission gate rejected — stay on the next rung of the ladder.
    }
  }, [onOrient]);

  // ── Microphone "breath" ────────────────────────────────────────────────────
  const enableMic = useCallback(async () => {
    if (!audioRef.current) return; // needs the audio context (Begin the tide first)
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          echoCancellation: false,
          noiseSuppression: false,
          autoGainControl: false,
        },
      });
      const ctx = audioRef.current.ctx;
      const src = ctx.createMediaStreamSource(stream);
      const analyser = ctx.createAnalyser();
      analyser.fftSize = 1024;
      src.connect(analyser); // NOT to destination — no feedback
      const buf = new Float32Array(
        new ArrayBuffer(analyser.fftSize * 4)
      );
      micRef.current = { stream, analyser, buf };
      setMicOn(true);
      setMicError(null);
    } catch (e) {
      setMicError(
        e instanceof Error ? e.message : "Microphone unavailable."
      );
    }
  }, []);

  // ── Start audio (first gesture) ────────────────────────────────────────────
  const beginTide = useCallback(async () => {
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

    const master = ctx.createGain();
    master.gain.value = 0;
    master.connect(ctx.destination);
    // Slow fade-in so the tide arrives, never clicks.
    master.gain.setValueAtTime(0, ctx.currentTime);
    master.gain.linearRampToValueAtTime(0.9, ctx.currentTime + 4);

    // Reverb (procedural impulse) with a dry/wet split.
    const reverb = ctx.createConvolver();
    reverb.buffer = buildImpulse(ctx, rng);
    const wet = ctx.createGain();
    wet.gain.value = 0.55;
    reverb.connect(wet).connect(master);

    // ── PAD: 3 detuned voices → lowpass → chorus (LFO delay) → dry + reverb ──
    const padGain = ctx.createGain();
    padGain.gain.value = 0.16;
    const padFilter = ctx.createBiquadFilter();
    padFilter.type = "lowpass";
    padFilter.frequency.value = 700;
    padFilter.Q.value = 0.7;
    const chorusDelay = ctx.createDelay();
    chorusDelay.delayTime.value = 0.026;
    const chorusLFO = ctx.createOscillator();
    const chorusLFOGain = ctx.createGain();
    chorusLFOGain.gain.value = 0.006;
    chorusLFO.frequency.value = 0.13;
    chorusLFO.connect(chorusLFOGain).connect(chorusDelay.delayTime);
    chorusLFO.start();

    const padVoices: OscillatorNode[] = [];
    const detunes = [-6, 5, 0];
    for (let i = 0; i < 3; i++) {
      const o = ctx.createOscillator();
      o.type = i === 2 ? "triangle" : "sawtooth";
      o.frequency.value = 220;
      o.detune.value = detunes[i];
      o.connect(padFilter);
      o.start();
      padVoices.push(o);
    }
    padFilter.connect(padGain);
    padGain.connect(master); // dry
    padGain.connect(chorusDelay);
    chorusDelay.connect(master);
    padGain.connect(reverb); // wet

    // ── SUB voice ──
    const subOsc = ctx.createOscillator();
    subOsc.type = "sine";
    subOsc.frequency.value = 55;
    const subGain = ctx.createGain();
    subGain.gain.value = 0.12;
    subOsc.connect(subGain).connect(master);
    subOsc.start();

    // ── Low DRONE (constant D, very quiet bed) ──
    const droneOsc = ctx.createOscillator();
    droneOsc.type = "sine";
    droneOsc.frequency.value = midiToFreq(HOME_ROOT_MIDI - 12);
    const droneGain = ctx.createGain();
    droneGain.gain.value = 0.05;
    droneOsc.connect(droneGain).connect(reverb);
    droneOsc.connect(droneGain).connect(master);
    droneOsc.start();

    // ── BELL bus (plucks routed mostly to reverb) ──
    const bellBus = ctx.createGain();
    bellBus.gain.value = 0.5;
    bellBus.connect(master);
    bellBus.connect(reverb);

    audioRef.current = {
      ctx,
      master,
      padGain,
      padFilter,
      padVoices,
      subOsc,
      subGain,
      droneOsc,
      droneGain,
      bellBus,
      reverb,
      chorusLFO,
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
      mod.frequency.value = freq * 2.01;
      modGain.gain.setValueAtTime(freq * 1.4, when);
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
    (r: FieldReadout, dtSec: number) => {
      const rig = audioRef.current;
      if (!rig) return;
      const { ctx } = rig;
      const now = ctx.currentTime;

      // Pad filter opens with brightness; pad gain swells with tide level.
      const cutoff = 320 + r.brightness * 2600;
      rig.padFilter.frequency.setTargetAtTime(cutoff, now, 0.4);
      rig.padGain.gain.setTargetAtTime(0.08 + r.tideLevel * 0.16, now, 0.5);

      // Chord change → ramp the 3 pad voices + sub to the new chord tones.
      if (r.chordIndex !== chordIndexRef.current) {
        chordIndexRef.current = r.chordIndex;
        const chord = PROGRESSION[r.chordIndex];
        for (let i = 0; i < rig.padVoices.length; i++) {
          const midi = HOME_ROOT_MIDI + chord[i % chord.length];
          rig.padVoices[i].frequency.setTargetAtTime(
            midiToFreq(midi),
            now,
            0.9
          );
        }
        const rootMidi = HOME_ROOT_MIDI + chord[0] - 12;
        rig.subOsc.frequency.setTargetAtTime(midiToFreq(rootMidi), now, 1.2);
      }

      // ── Bell scheduling. Rate from density; each event's TIMING is bent by
      // agogic rubato (a voice speeding through its cycle leans early), and a
      // sync-transition ACCENT LENGTHENS the note (marks it by duration).
      const rate = 0.25 + r.density * 1.6; // events / sec
      bellAccumRef.current += rate * dtSec;
      if (bellAccumRef.current >= 1) {
        bellAccumRef.current -= 1;
        const rng = rngRef.current;
        const chord = PROGRESSION[r.chordIndex];
        // Pick a Dorian tone: mostly chord tones, sometimes a passing scale tone.
        let midi: number;
        if (rng() < 0.7) {
          midi = HOME_ROOT_MIDI + chord[Math.floor(rng() * chord.length)] + 12;
        } else {
          midi =
            HOME_ROOT_MIDI +
            DORIAN_STEPS[Math.floor(rng() * DORIAN_STEPS.length)] +
            12;
        }
        if (rng() < 0.35) midi += 12; // sparkle an octave up
        midi = snapToDorian(midi);

        // Rubato: mean lead/lag from the phase velocities of the voices.
        let leadLag = 0;
        for (let i = 0; i < r.rubato.length; i++) leadLag += r.rubato[i];
        leadLag /= r.rubato.length; // + = early, − = late
        const base = 0.05; // small scheduling head-room
        const when = now + Math.max(0.005, base * (1 - leadLag));

        // Agogic accent: hold (lengthen) the note when a sync threshold crossed.
        const holdMul = 1 + r.accent * 1.6;
        const dur = (0.9 + r.brightness * 1.8) * holdMul;
        const level = (0.06 + r.tideLevel * 0.14) * (1 + r.accent * 0.5);
        const pan = (rng() * 2 - 1) * 0.6;
        firePluck(midiToFreq(midi), when, dur, level, pan);
      }
    },
    [firePluck]
  );

  // ── Read active conduct source (degrade ladder: tilt → mic → slider) ───────
  const readConduct = useCallback((tsMs: number): { mode: ConductMode; level: number } => {
    // Tilt is active only while events keep arriving.
    if (tiltOn && tsMs - lastTiltTsRef.current < 1500) {
      return { mode: "tilt", level: tiltLevelRef.current };
    }
    const mic = micRef.current;
    if (mic) {
      mic.analyser.getFloatTimeDomainData(
        mic.buf as unknown as Float32Array<ArrayBuffer>
      );
      let sum = 0;
      for (let i = 0; i < mic.buf.length; i++) sum += mic.buf[i] * mic.buf[i];
      const rms = Math.sqrt(sum / mic.buf.length);
      // Adaptive noise floor so a quiet room maps to ~0 and a breath rises.
      micFloorRef.current = Math.min(micFloorRef.current, rms) * 0.999 + rms * 0.001;
      const breath = Math.min(1, Math.max(0, (rms - micFloorRef.current) * 9));
      micLevelRef.current = breath;
      return { mode: "mic", level: breath };
    }
    return { mode: "slider", level: sliderRef.current };
  }, [tiltOn]);

  // ── Draw one frame of the ocean ────────────────────────────────────────────
  const drawFrame = useCallback(
    (ctx: CanvasRenderingContext2D, W: number, H: number, r: FieldReadout) => {
      const bright = r.brightness;
      const tide = r.tideLevel;
      // Horizon rises with the tide (water fills more of the frame at crest).
      const horizonY = H * (0.62 - tide * 0.16);

      // Sky: violet gradient, luminance drifts SLOWLY with brightness (no flicker).
      const sky = ctx.createLinearGradient(0, 0, 0, horizonY);
      sky.addColorStop(0, VIOLET[950]);
      sky.addColorStop(0.55, mix(VIOLET[900], INDIGO, bright * 0.4));
      sky.addColorStop(1, mix(VIOLET[800], MAGENTA, 0.25 + bright * 0.4));
      ctx.fillStyle = sky;
      ctx.fillRect(0, 0, W, horizonY);

      // A soft "moon" — its glow strengthens with sync (order parameter).
      const moonX = W * 0.5;
      const moonY = horizonY - H * 0.14;
      const glow = ctx.createRadialGradient(
        moonX,
        moonY,
        0,
        moonX,
        moonY,
        H * (0.12 + r.order * 0.16)
      );
      const moonCol = mix(VIOLET[300], VIOLET[100], r.order);
      glow.addColorStop(0, rgba(moonCol, 0.25 + r.order * 0.5));
      glow.addColorStop(1, rgba(moonCol, 0));
      ctx.fillStyle = glow;
      ctx.fillRect(0, 0, W, horizonY + H * 0.2);

      // Water base.
      const water = ctx.createLinearGradient(0, horizonY, 0, H);
      water.addColorStop(0, mix(VIOLET[900], INDIGO, 0.3 + bright * 0.3));
      water.addColorStop(1, VIOLET[950]);
      ctx.fillStyle = water;
      ctx.fillRect(0, horizonY, W, H - horizonY);

      // Moon glimmer column on the water — shimmering reflection.
      const colGrad = ctx.createLinearGradient(0, horizonY, 0, H);
      colGrad.addColorStop(0, rgba(moonCol, 0.14 + r.order * 0.22));
      colGrad.addColorStop(1, rgba(moonCol, 0));
      ctx.fillStyle = colGrad;
      const colW = W * (0.05 + 0.03 * r.order);
      for (let y = horizonY; y < H; y += 6) {
        const t = (y - horizonY) / (H - horizonY);
        const wob = Math.sin(y * 0.08 + r.phases[1] * 3 + r.t * 0.6) * (8 + t * 30);
        ctx.fillRect(moonX - colW + wob, y, colW * 2, 5);
      }

      // Layered tide bands — slow sine waves drifting with oscillator phases.
      const bandColors = [VIOLET[400], INDIGO, VIOLET[300], MAGENTA];
      for (let b = 0; b < 4; b++) {
        const yBase = horizonY + ((H - horizonY) * (b + 0.5)) / 4;
        const ph = r.phases[b % r.phases.length];
        const amp = 6 + (1 - b / 5) * 22 * (0.5 + tide);
        const wl = 130 + b * 60;
        ctx.beginPath();
        ctx.moveTo(0, yBase);
        for (let x = 0; x <= W; x += 8) {
          const y =
            yBase +
            Math.sin(x / wl + ph + r.t * 0.25) * amp +
            Math.sin(x / (wl * 0.4) + ph * 1.7) * amp * 0.3;
          ctx.lineTo(x, y);
        }
        ctx.lineTo(W, H);
        ctx.lineTo(0, H);
        ctx.closePath();
        ctx.fillStyle = rgba(bandColors[b], 0.06 + r.density * 0.05);
        ctx.fill();
      }

      // Oscillator phase points: drift on a shallow arc near the horizon.
      // When synced they converge into a bright knot; dispersed, they scatter.
      const cx = W * 0.5;
      const cy = horizonY - 8;
      const R = W * 0.33;
      const pts: Array<[number, number]> = [];
      for (let i = 0; i < r.phases.length; i++) {
        const a = r.phases[i];
        const x = cx + Math.cos(a) * R;
        const y = cy + Math.sin(a) * (H * 0.05);
        pts.push([x, y]);
      }
      // Faint connecting web (tighter when synced).
      ctx.strokeStyle = rgba(VIOLET[300], 0.04 + r.order * 0.12);
      ctx.lineWidth = 1;
      ctx.beginPath();
      for (let i = 0; i < pts.length; i++) {
        for (let j = i + 1; j < pts.length; j++) {
          ctx.moveTo(pts[i][0], pts[i][1]);
          ctx.lineTo(pts[j][0], pts[j][1]);
        }
      }
      ctx.stroke();
      for (let i = 0; i < pts.length; i++) {
        const [x, y] = pts[i];
        const g = ctx.createRadialGradient(x, y, 0, x, y, 14 + r.order * 10);
        const c = mix(VIOLET[200], MAGENTA, i / pts.length);
        g.addColorStop(0, rgba(c, 0.7));
        g.addColorStop(1, rgba(c, 0));
        ctx.fillStyle = g;
        ctx.fillRect(x - 26, y - 26, 52, 52);
      }

      // Sparse rising shimmer particles (seeded, deterministic drift).
      const n = 46;
      for (let i = 0; i < n; i++) {
        const seed = i * 12.9898;
        const px = (Math.sin(seed) * 0.5 + 0.5) * W;
        const speed = 8 + (Math.sin(seed * 1.7) * 0.5 + 0.5) * 22;
        const py =
          H -
          ((r.t * speed + i * 37) % (H - horizonY));
        const tw = 0.3 + 0.7 * (0.5 + 0.5 * Math.sin(r.t * 1.3 + seed));
        ctx.fillStyle = rgba(VIOLET[200], (0.05 + r.density * 0.12) * tw);
        const s = 1.4 + tw * 1.6;
        ctx.fillRect(px, py, s, s);
      }
    },
    []
  );

  // ── Main loop: field steps + audio + draw, throttled UI push ───────────────
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) {
      setNoCanvas(true);
      return;
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

      // Conduct: read active source, inject energy (field reabsorbs over ~30 s).
      const { mode, level } = readConduct(ts);
      if (level > 0) applyConduct(fieldRef.current, level * dt * 0.5);

      // Step the coupled-oscillator field (always alive, even before audio).
      const r = stepField(fieldRef.current, dt);
      readoutRef.current = r;

      if (audioRef.current) applyAudio(r, dt);

      const rect = canvas.getBoundingClientRect();
      drawFrame(ctx, rect.width, rect.height, r);

      // Push a UI snapshot ~5×/sec.
      uiThrottle += dt;
      if (uiThrottle >= 0.2) {
        uiThrottle = 0;
        setUi({
          order: r.order,
          tension: r.tension,
          tide: r.tideLevel,
          minutes: r.t / 60,
          section: r.section,
          chord: CHORD_NAMES[r.chordIndex] ?? "Dm",
          mode,
          energy: r.energy,
        });
      }
    };
    rafRef.current = requestAnimationFrame(frame);

    return () => {
      disposed = true;
      cancelAnimationFrame(rafRef.current);
      window.removeEventListener("resize", resize);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [applyAudio, drawFrame, readConduct]);

  // ── Full teardown on unmount ───────────────────────────────────────────────
  useEffect(() => {
    const onOrientRef = onOrient;
    return () => {
      cancelAnimationFrame(rafRef.current);
      window.removeEventListener("deviceorientation", onOrientRef);
      const mic = micRef.current;
      if (mic) {
        mic.stream.getTracks().forEach((t) => t.stop());
        micRef.current = null;
      }
      const rig = audioRef.current;
      if (rig) {
        try {
          rig.padVoices.forEach((o) => o.stop());
          rig.subOsc.stop();
          rig.droneOsc.stop();
          rig.chorusLFO.stop();
          rig.master.disconnect();
        } catch {
          /* nodes already stopped */
        }
        void rig.ctx.close();
        audioRef.current = null;
      }
    };
  }, [onOrient]);

  const fmt = (x: number) => x.toFixed(2);

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
            This browser could not provide a 2D canvas, so the tide cannot be
            drawn. Try a current version of Safari, Chrome, or Firefox.
          </p>
        </div>
      )}

      {/* ── Hero / chrome ─────────────────────────────────────────────────── */}
      <div className="pointer-events-none absolute inset-0 z-10 flex flex-col justify-between p-5 sm:p-8">
        <header className="pointer-events-auto max-w-xl">
          <p className="font-mono text-xs uppercase tracking-[0.18em] text-muted-foreground">
            Tidefield · 7192
          </p>
          <h1 className="mt-2 text-2xl font-semibold tracking-tight sm:text-3xl">
            A living tide
          </h1>
          <p className="mt-2 max-w-md text-base text-muted-foreground">
            A 7-minute generative piece steered by a network of slowly coupled
            phase oscillators — it never repeats, breathes with expressive
            micro-timing, and always returns home. Conduct it with your breath;
            the tide reabsorbs your energy over half a minute.
          </p>

          <div className="mt-4 flex flex-wrap items-center gap-2">
            {!audioOn ? (
              <button
                type="button"
                onClick={beginTide}
                className="min-h-[44px] rounded-md bg-primary px-6 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90"
              >
                Begin the tide
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
              Design notes
            </button>
          </div>
          {!audioOn && (
            <p className="mt-2 text-sm text-muted-foreground">
              The field and canvas are already alive. Audio starts on your first
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
                  ? "tilt"
                  : ui.mode === "mic"
                  ? "breath (mic)"
                  : "slider"}
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
              <button
                type="button"
                onClick={enableMic}
                disabled={micOn || !audioOn}
                className="min-h-[44px] rounded-md border border-border bg-background/60 px-4 text-sm text-muted-foreground transition-colors hover:bg-accent hover:text-foreground disabled:opacity-40"
              >
                {micOn ? "Breath on" : "Enable breath"}
              </button>
            </div>
            <label className="mt-3 block">
              <span className="font-mono text-xs uppercase tracking-[0.18em] text-muted-foreground">
                Energy
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
            {micError && (
              <p className="mt-1 text-sm text-destructive">{micError}</p>
            )}
          </div>

          <dl className="grid grid-cols-3 gap-x-5 gap-y-2 text-sm sm:text-right">
            <Readout label="sync r" value={fmt(ui.order)} />
            <Readout label="section" value={ui.section} />
            <Readout label="mode" value={`D Dorian · ${ui.chord}`} />
            <Readout label="tide" value={fmt(ui.tide)} />
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
                The long form comes from a network of ~6 slow{" "}
                <span className="text-foreground">coupled phase oscillators</span>{" "}
                (a Kuramoto model). Each has its own natural period (tens of
                seconds to a minute) and a coupling term pulling the phases
                together. The collective{" "}
                <span className="text-primary">synchronization order parameter</span>{" "}
                r conducts everything: high r = crest, low r = calm. Sections
                emerge from sync↔desync transitions of a continuous system, so
                the piece never exactly repeats yet has clear arcs.
              </p>
              <p>
                Coupling and a{" "}
                <span className="text-foreground">home pull</span> strengthen over
                the arc, so the field resolves toward sync-at-home (D Dorian, low
                tension) by the end — a homecoming, not a loop.
              </p>
              <p>
                Timing is a first-class primitive, following{" "}
                <span className="text-foreground">
                  &ldquo;Agogic: Performance-Timed Music Tokens&rdquo; (arXiv
                  2608.03999, Aug 2026)
                </span>
                . Rubato is derived from each voice&rsquo;s instantaneous phase
                velocity — speed through the cycle and events lean early, slow and
                they lag. A sync-transition event is marked by{" "}
                <span className="text-primary">lengthening</span> the note (an
                agogic accent) rather than making it louder. Expressive rubato
                already exists in the lab; the contribution here is applying the
                Agogic framing to a coupled-oscillator long-form engine.
              </p>
              <p>
                You conduct with device tilt → microphone breath → an on-screen
                slider (it degrades down that ladder). Your energy perturbs the
                oscillators; the field reabsorbs it toward home over ~30 s.
              </p>
              <p className="text-foreground">
                Safety: slow luminance drift only — no flicker. Deterministic
                (seeded PRNG); alive on load before any interaction.
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

      <PrototypeNav slugs={["7192-tidefield"]} />
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

// ── Small color helpers (raw hex is fine INSIDE canvas art) ─────────────────
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
