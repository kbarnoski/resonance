"use client";

// ─────────────────────────────────────────────────────────────────────────────
// 2010 — Boundless Void
//
// "What if the Ganzfeld / oceanic-boundlessness experience were delivered almost
//  ENTIRELY through spatialized sound — the screen nearly black — so the
//  dissolution of self happens in your ears, not your eyes?"
//
// A deliberate test of the lab's screen bias. ~90% of this piece is audio: a
// soft brown-noise Ganzfeld bed plus several HRTF-spatialized drone voices that
// slowly orbit the listener while their harmonic content GLIDES over minutes.
// The only image is a single warm radial glow that breathes — plain CSS on a
// DOM element. No canvas, no WebGL.
// ─────────────────────────────────────────────────────────────────────────────

import { useCallback, useEffect, useRef, useState } from "react";
import { SafeFlicker } from "../_shared/psych/safeFlicker";

// ── Harmonic model ───────────────────────────────────────────────────────────
// NOT a fixed just-intonation partial stack. We keep a small consonant modal set
// expressed as SEMITONE degrees, then (a) rotate which degree each voice targets
// over tens of seconds and (b) drift a continuous global transpose sinusoidally
// over minutes. Every oscillator chases its target through a long portamento, so
// the "scale" audibly morphs across the piece rather than sitting on pure ratios.
const MODE_DEGREES = [0, 3, 5, 7, 10, 12, 15] as const; // warm minor-pentatonic-ish
const VOICE_COUNT = 4;

type MotionWord = "gathering" | "drifting" | "dispersing";

interface Snapshot {
  elapsed: number; // seconds since Enter
  breath: number; // 0..1 slow envelope
  motion: MotionWord;
  audible: number; // voices currently above the hearing floor
}

interface Voice {
  osc: OscillatorNode;
  osc2: OscillatorNode;
  gain: GainNode;
  lp: BiquadFilterNode;
  panner: PannerNode;
  baseAzimuth: number; // rad
  azSpeed: number; // rad/sec (orbit)
  radius: number; // metres from listener
  radiusPhase: number;
  elevation: number;
  octave: number; // partial octave offset
  degreeSeed: number;
  densPhase: number; // slow fade LFO phase
  densRate: number;
}

// Set a PannerNode position, preferring the AudioParam API, falling back to the
// deprecated setPosition() on older engines.
function applyPannerPosition(
  p: PannerNode,
  when: number,
  x: number,
  y: number,
  z: number,
): void {
  if (p.positionX) {
    p.positionX.setTargetAtTime(x, when, 0.08);
    p.positionY.setTargetAtTime(y, when, 0.08);
    p.positionZ.setTargetAtTime(z, when, 0.08);
  } else {
    p.setPosition(x, y, z);
  }
}

// Build a soft brown-noise buffer (integrated white noise) for the Ganzfeld bed.
function buildBrownNoise(ctx: AudioContext): AudioBuffer {
  const len = Math.floor(ctx.sampleRate * 4);
  const buf = ctx.createBuffer(1, len, ctx.sampleRate);
  const data = buf.getChannelData(0);
  let last = 0;
  for (let i = 0; i < len; i++) {
    const white = Math.random() * 2 - 1;
    last = (last + 0.02 * white) / 1.02;
    data[i] = last * 3.2;
  }
  return buf;
}

// ── Audio engine ─────────────────────────────────────────────────────────────
// A plain (non-hook) class that owns the whole Web Audio graph. The React
// component drives it with update(elapsed, breath) each animation frame and is
// responsible for a rigorous teardown.
class VoidEngine {
  private ctx: AudioContext;
  private master: GainNode;
  private comp: DynamicsCompressorNode;
  private bedGain: GainNode;
  private bedSrc: AudioBufferSourceNode | null = null;
  private voices: Voice[] = [];
  private lastAudible = VOICE_COUNT;
  private lastMotion: MotionWord = "drifting";

  // Optional microphone breath.
  private micStream: MediaStream | null = null;
  private micAnalyser: AnalyserNode | null = null;
  private micBuf: Float32Array<ArrayBuffer> | null = null;
  private micSmoothed = 0.5;

  constructor(ctx: AudioContext) {
    this.ctx = ctx;

    // master chain: master gain → gentle compressor → destination.
    this.master = ctx.createGain();
    this.master.gain.value = 0.0001; // ramp in on start()

    this.comp = ctx.createDynamicsCompressor();
    this.comp.threshold.value = -18;
    this.comp.knee.value = 24;
    this.comp.ratio.value = 3;
    this.comp.attack.value = 0.05;
    this.comp.release.value = 0.4;

    this.master.connect(this.comp);
    this.comp.connect(ctx.destination);

    // Ganzfeld bed: looping brown noise → lowpass → highpass → quiet gain.
    const bed = ctx.createBufferSource();
    bed.buffer = buildBrownNoise(ctx);
    bed.loop = true;
    const bedLp = ctx.createBiquadFilter();
    bedLp.type = "lowpass";
    bedLp.frequency.value = 900;
    bedLp.Q.value = 0.2;
    const bedHp = ctx.createBiquadFilter();
    bedHp.type = "highpass";
    bedHp.frequency.value = 40;
    this.bedGain = ctx.createGain();
    this.bedGain.gain.value = 0.12;
    bed.connect(bedLp);
    bedLp.connect(bedHp);
    bedHp.connect(this.bedGain);
    this.bedGain.connect(this.master);
    bed.start();
    this.bedSrc = bed;

    // Spatial drone voices.
    for (let i = 0; i < VOICE_COUNT; i++) {
      this.voices.push(this.buildVoice(i));
    }
  }

  private buildVoice(i: number): Voice {
    const ctx = this.ctx;
    const osc = ctx.createOscillator();
    osc.type = "sine";
    const osc2 = ctx.createOscillator();
    osc2.type = "sine";

    const lp = ctx.createBiquadFilter();
    lp.type = "lowpass";
    lp.frequency.value = 1400;
    lp.Q.value = 0.3;

    const gain = ctx.createGain();
    gain.gain.value = 0.0001;

    const panner = ctx.createPanner();
    panner.panningModel = "HRTF";
    panner.distanceModel = "inverse";
    panner.refDistance = 1;
    panner.maxDistance = 40;
    panner.rolloffFactor = 0.7;
    panner.coneInnerAngle = 360;

    osc.connect(gain);
    osc2.connect(gain);
    gain.connect(lp);
    lp.connect(panner);
    panner.connect(this.master);

    osc.start();
    osc2.start();

    const baseAzimuth = (i / VOICE_COUNT) * Math.PI * 2;
    return {
      osc,
      osc2,
      gain,
      lp,
      panner,
      baseAzimuth,
      azSpeed: (i % 2 === 0 ? 1 : -1) * (0.012 + i * 0.006), // slow, alternating
      radius: 3.2 + i * 0.9,
      radiusPhase: i * 1.3,
      elevation: i % 2 === 0 ? 0.6 : -0.5,
      octave: [0, 1, 1, 2][i] ?? 1,
      degreeSeed: i * 0.37,
      densPhase: i * 1.9,
      densRate: 0.018 + i * 0.007, // each voice fades in/out on its own clock
    };
  }

  // Ramp the master in gently — never a sudden blast.
  start(): void {
    const now = this.ctx.currentTime;
    this.master.gain.cancelScheduledValues(now);
    this.master.gain.setValueAtTime(0.0001, now);
    this.master.gain.exponentialRampToValueAtTime(0.5, now + 6);
  }

  // Called every animation frame. elapsed = seconds since start, breath ∈ [0,1].
  update(elapsed: number, breath: number): void {
    const ctx = this.ctx;
    const now = ctx.currentTime;
    const t = elapsed;

    // Global harmonic drift. The low root wanders ±~1 semitone over ~2 min and
    // the whole modal set is transposed by a continuous multi-sine over minutes,
    // so the scale keeps moving without ever locking to a fixed ratio stack.
    const rootHz = 55 * Math.pow(2, Math.sin(t / 120) / 12);
    const transpose =
      2.0 * Math.sin(t / 95) + 1.4 * Math.sin(t / 47 + 1) + 0.6 * Math.sin(t / 23);

    // Breath opens the bed slightly and lifts the timbre.
    this.bedGain.gain.setTargetAtTime(0.09 + 0.06 * breath, now, 0.6);

    let audible = 0;
    for (let i = 0; i < this.voices.length; i++) {
      const v = this.voices[i];

      // Rotating scale degree (glided). The step index advances on a per-voice
      // clock; setTargetAtTime turns each hop into a long portamento.
      const stepPeriod = 26 + i * 13;
      const stepIdx = Math.floor(t / stepPeriod + v.degreeSeed);
      const degree =
        MODE_DEGREES[
          (((stepIdx * (i + 2)) % MODE_DEGREES.length) + MODE_DEGREES.length) %
            MODE_DEGREES.length
        ];
      const midiish = degree + v.octave * 12 + transpose;
      const target = rootHz * Math.pow(2, midiish / 12);
      const tau = 7 + i * 1.5; // seconds — audibly gliding
      v.osc.frequency.setTargetAtTime(target, now, tau);
      v.osc2.frequency.setTargetAtTime(target * 1.004, now, tau); // slow beating

      // Timbre follows breath a touch.
      v.lp.frequency.setTargetAtTime(1100 + 900 * breath, now, 0.8);

      // Density: each voice fades in and out on its own slow LFO, so minute 5
      // is arranged differently from minute 1.
      const dens = 0.5 + 0.5 * Math.sin(t * v.densRate + v.densPhase);
      const amp = 0.03 + 0.09 * dens * (0.7 + 0.3 * breath);
      v.gain.gain.setTargetAtTime(amp, now, 1.2);
      if (dens > 0.35) audible++;

      // Spatial orbit. Azimuth advances continuously; radius breathes with the
      // envelope so the void feels alive and enveloping.
      const az = v.baseAzimuth + t * v.azSpeed;
      const radius =
        v.radius + Math.sin(t * 0.05 + v.radiusPhase) * (1.0 + 0.8 * breath);
      const el = v.elevation + Math.sin(t * 0.03 + i) * 0.5;
      const x = Math.cos(az) * radius;
      const z = Math.sin(az) * radius;
      applyPannerPosition(v.panner, now, x, el, z);
    }

    this.lastAudible = Math.max(1, audible);
  }

  setMotion(m: MotionWord): void {
    this.lastMotion = m;
  }

  snapshotExtras(): { audible: number; motion: MotionWord } {
    return { audible: this.lastAudible, motion: this.lastMotion };
  }

  // ── Optional microphone breath (degrades gracefully) ──────────────────────
  async enableMic(): Promise<boolean> {
    if (this.micAnalyser) return true;
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          echoCancellation: false,
          noiseSuppression: false,
          autoGainControl: false,
        },
      });
      this.micStream = stream;
      const src = this.ctx.createMediaStreamSource(stream);
      const analyser = this.ctx.createAnalyser();
      analyser.fftSize = 1024;
      // Not connected to destination — analysis only, no feedback.
      src.connect(analyser);
      this.micAnalyser = analyser;
      this.micBuf = new Float32Array(new ArrayBuffer(analyser.fftSize * 4));
      return true;
    } catch {
      this.disableMic();
      return false;
    }
  }

  disableMic(): void {
    this.micStream?.getTracks().forEach((tr) => tr.stop());
    this.micStream = null;
    this.micAnalyser = null;
    this.micBuf = null;
  }

  // Returns a smoothed breath envelope from mic RMS, or null if mic is off.
  micBreath(): number | null {
    const a = this.micAnalyser;
    const buf = this.micBuf;
    if (!a || !buf) return null;
    a.getFloatTimeDomainData(buf);
    let sum = 0;
    for (let i = 0; i < buf.length; i++) sum += buf[i] * buf[i];
    const rms = Math.sqrt(sum / buf.length);
    // Map a quiet room's breath (~0.005–0.08 RMS) into 0..1, then smooth hard.
    const level = Math.max(0, Math.min(1, (rms - 0.004) / 0.09));
    this.micSmoothed = this.micSmoothed * 0.94 + level * 0.06;
    return this.micSmoothed;
  }

  // Rigorous teardown: fade out, then disconnect every node and stop sources.
  stop(): void {
    const ctx = this.ctx;
    const now = ctx.currentTime;
    try {
      this.master.gain.cancelScheduledValues(now);
      this.master.gain.setValueAtTime(this.master.gain.value, now);
      this.master.gain.exponentialRampToValueAtTime(0.0001, now + 0.6);
    } catch {
      /* context may already be closing */
    }

    this.disableMic();

    window.setTimeout(() => {
      for (const v of this.voices) {
        try {
          v.osc.stop();
          v.osc2.stop();
        } catch {
          /* already stopped */
        }
        v.osc.disconnect();
        v.osc2.disconnect();
        v.gain.disconnect();
        v.lp.disconnect();
        v.panner.disconnect();
      }
      this.voices = [];
      try {
        this.bedSrc?.stop();
      } catch {
        /* already stopped */
      }
      this.bedSrc?.disconnect();
      this.bedGain.disconnect();
      this.master.disconnect();
      this.comp.disconnect();
    }, 700);
  }
}

// ── Component ────────────────────────────────────────────────────────────────
type Phase = "idle" | "running" | "error";
type BreathMode = "auto" | "mic";

export default function BoundlessVoidPage() {
  const ctxRef = useRef<AudioContext | null>(null);
  const engineRef = useRef<VoidEngine | null>(null);
  const rafRef = useRef<number>(0);
  const startedAtRef = useRef<number>(0);
  const glowRef = useRef<HTMLDivElement | null>(null);
  const flickerRef = useRef<SafeFlicker | null>(null);
  const breathModeRef = useRef<BreathMode>("auto");
  const prevBreathRef = useRef<number>(0.5);
  const reducedRef = useRef<boolean>(false);

  const [phase, setPhase] = useState<Phase>("idle");
  const [breathMode, setBreathMode] = useState<BreathMode>("auto");
  const [flickerOn, setFlickerOn] = useState(false);
  const [showNotes, setShowNotes] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [snap, setSnap] = useState<Snapshot>({
    elapsed: 0,
    breath: 0.5,
    motion: "drifting",
    audible: VOICE_COUNT,
  });

  // Keep refs in sync with toggles so the rAF loop reads current values.
  useEffect(() => {
    breathModeRef.current = breathMode;
  }, [breathMode]);

  useEffect(() => {
    if (!flickerRef.current) flickerRef.current = new SafeFlicker({ maxHz: 3, defaultHz: 0.8, floor: 0.6 });
    if (flickerOn) flickerRef.current.enable();
    else flickerRef.current.kill();
  }, [flickerOn]);

  const teardown = useCallback(() => {
    if (rafRef.current) cancelAnimationFrame(rafRef.current);
    rafRef.current = 0;
    engineRef.current?.stop();
    engineRef.current = null;
    const ctx = ctxRef.current;
    ctxRef.current = null;
    if (ctx && ctx.state !== "closed") {
      window.setTimeout(() => {
        ctx.close().catch(() => {
          /* already closed */
        });
      }, 900);
    }
  }, []);

  useEffect(() => teardown, [teardown]);

  const enter = useCallback(async () => {
    if (phase === "running") return;
    setErrorMsg(null);

    reducedRef.current =
      typeof window !== "undefined" &&
      typeof window.matchMedia === "function" &&
      window.matchMedia("(prefers-reduced-motion: reduce)").matches;

    let ctx: AudioContext;
    try {
      const Ctx: typeof AudioContext =
        window.AudioContext ||
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        (window as any).webkitAudioContext;
      ctx = new Ctx();
      if (ctx.state === "suspended") await ctx.resume();
    } catch {
      setPhase("error");
      setErrorMsg("Web Audio is unavailable on this device, so the void can't sound.");
      return;
    }
    ctxRef.current = ctx;

    const engine = new VoidEngine(ctx);
    engineRef.current = engine;
    engine.start();

    startedAtRef.current = performance.now();
    prevBreathRef.current = 0.5;

    let lastReadout = 0;
    const loop = () => {
      const engineNow = engineRef.current;
      if (!engineNow) return;
      const elapsed = (performance.now() - startedAtRef.current) / 1000;

      // Breath: mic if enabled and available, else an autonomous ~5.5/min cycle.
      let breath: number | null = null;
      if (breathModeRef.current === "mic") breath = engineNow.micBreath();
      if (breath == null) {
        breath = 0.5 + 0.5 * Math.sin((elapsed / 11) * Math.PI * 2);
      }

      engineNow.update(elapsed, breath);

      // Motion word from the breath derivative.
      const dB = breath - prevBreathRef.current;
      prevBreathRef.current = breath;
      let motion: MotionWord = "drifting";
      if (dB > 0.004) motion = "gathering";
      else if (dB < -0.004) motion = "dispersing";
      engineNow.setMotion(motion);

      // The one image: a warm radial glow that breathes. Plain CSS on a div.
      const glow = glowRef.current;
      if (glow) {
        const driftAmp = reducedRef.current ? 0.04 : 0.16;
        let lum = 0.14 + driftAmp * breath;
        const fl = flickerRef.current;
        if (fl && fl.enabled) lum *= fl.value(elapsed);
        const scale = reducedRef.current ? 1 : 1 + 0.06 * breath;
        glow.style.opacity = lum.toFixed(3);
        glow.style.transform = `translate(-50%, -50%) scale(${scale.toFixed(3)})`;
      }

      // Throttle the text readout to ~3 fps.
      if (elapsed - lastReadout > 0.33) {
        lastReadout = elapsed;
        const extras = engineNow.snapshotExtras();
        setSnap({ elapsed, breath, motion, audible: extras.audible });
      }

      rafRef.current = requestAnimationFrame(loop);
    };
    rafRef.current = requestAnimationFrame(loop);

    setPhase("running");
  }, [phase]);

  const toggleBreathMode = useCallback(async () => {
    const engine = engineRef.current;
    if (!engine) return;
    if (breathModeRef.current === "mic") {
      engine.disableMic();
      setBreathMode("auto");
      return;
    }
    const ok = await engine.enableMic();
    if (ok) {
      setBreathMode("mic");
    } else {
      setBreathMode("auto");
      setErrorMsg("Microphone unavailable — staying on the autonomous breath cycle.");
    }
  }, []);

  const minutes = (snap.elapsed / 60).toFixed(1);
  const readout =
    phase === "running"
      ? `${snap.audible} ${snap.audible === 1 ? "voice" : "voices"} · ${snap.motion} · ${minutes} min`
      : "silent · awaiting entry";

  return (
    <main className="relative flex min-h-[calc(100dvh-3rem)] w-full items-center justify-center overflow-hidden bg-[#050302] px-6 py-16 text-foreground">
      {/* The ONLY image: a single warm radial glow that breathes. CSS on a DOM
          element — no canvas, no WebGL. */}
      <div
        ref={glowRef}
        aria-hidden
        className="pointer-events-none absolute left-1/2 top-1/2 h-[120vmax] w-[120vmax] will-change-[opacity,transform]"
        style={{
          transform: "translate(-50%, -50%)",
          opacity: 0.1,
          background:
            "radial-gradient(circle at 50% 48%, rgba(255,214,170,0.9) 0%, rgba(214,96,54,0.55) 22%, rgba(120,34,20,0.28) 42%, rgba(20,8,5,0) 66%)",
        }}
      />

      {/* Everything below is chrome — semantic tokens only. */}
      <div className="relative z-10 flex w-full max-w-xl flex-col items-center text-center">
        <p className="font-mono text-xs uppercase tracking-[0.18em] text-muted-foreground">
          Boundless Void · audio-forward
        </p>

        <h1 className="mt-4 text-2xl font-semibold tracking-tight text-foreground sm:text-3xl">
          The void is in your ears
        </h1>

        <p className="mt-4 max-w-md text-base leading-relaxed text-muted-foreground">
          A near-dark oceanic-boundlessness study delivered almost entirely
          through spatialized sound — several drone voices orbit you in HRTF space
          while their harmony slowly glides. Best with headphones.
        </p>

        {phase !== "running" && (
          <div className="mt-8 flex flex-col items-center gap-3">
            <button
              type="button"
              onClick={enter}
              className="min-h-[44px] rounded-md bg-primary px-6 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90"
            >
              Enter the void
            </button>
            <p className="font-mono text-xs uppercase tracking-[0.18em] text-muted-foreground">
              best with headphones
            </p>
          </div>
        )}

        {phase === "running" && (
          <div className="mt-8 flex flex-col items-center gap-4">
            <p className="font-mono text-xs uppercase tracking-[0.18em] text-muted-foreground">
              {readout}
            </p>
            <div className="flex flex-wrap items-center justify-center gap-2">
              <button
                type="button"
                onClick={toggleBreathMode}
                className="min-h-[44px] rounded-md border border-border bg-background/60 px-4 text-sm text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
              >
                {breathMode === "mic" ? "breath · mic" : "breath · autonomous"}
              </button>
              <button
                type="button"
                onClick={() => setFlickerOn((f) => !f)}
                className="min-h-[44px] rounded-md border border-border bg-background/60 px-4 text-sm text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
              >
                {flickerOn ? "glow drift · on" : "glow drift · off"}
              </button>
            </div>
          </div>
        )}

        {errorMsg && (
          <p className="mt-4 text-sm text-destructive">{errorMsg}</p>
        )}
      </div>

      {/* Design notes affordance. */}
      <button
        type="button"
        onClick={() => setShowNotes(true)}
        className="absolute bottom-6 right-6 z-10 min-h-[44px] rounded-md border border-border bg-background/60 px-4 text-sm text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
      >
        Design notes
      </button>

      {showNotes && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-6 backdrop-blur-sm"
          onClick={() => setShowNotes(false)}
        >
          <div
            className="max-w-lg rounded-lg border border-border bg-background p-6 shadow-lg"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-start justify-between gap-4">
              <h2 className="text-2xl font-semibold tracking-tight text-foreground">
                Design notes
              </h2>
              <button
                type="button"
                onClick={() => setShowNotes(false)}
                className="min-h-[44px] rounded-md border border-border bg-background/60 px-4 text-sm text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
              >
                Close
              </button>
            </div>
            <div className="mt-4 space-y-3 text-sm leading-relaxed text-muted-foreground">
              <p>
                Most pieces in this lab are screen-first. This one deliberately
                tests that bias: the screen is near-black and ~90% of the work is
                done by sound. Dissolution of self happens in your ears, not your
                eyes.
              </p>
              <p>
                A Ganzfeld — homogeneous, unstructured sensory field — starves the
                perceptual system, and the mind fills the void: oceanic
                boundlessness, softened self-boundaries, ego-dissolution. Here the
                field is auditory: a soft brown-noise bed plus HRTF-spatialized
                drone voices that orbit you, so distance and azimuth become the
                &ldquo;space&rdquo; you float in.
              </p>
              <p>
                The harmony never settles on a fixed just-intonation stack. A small
                consonant modal set rotates per voice while a continuous transpose
                drifts over minutes, and every oscillator chases its target through
                a long portamento — so the scale audibly morphs across the piece.
              </p>
              <p>
                Your breath (autonomous ~5.5/min by default, or your mic if you
                allow it) gently modulates density, timbre and the orbit&apos;s
                pulse. Nothing is recorded. The glow drift is opt-in, soft, capped
                at 3 Hz, honors reduced-motion, and stops instantly.
              </p>
              <p className="text-muted-foreground/80">
                References: Wackermann, Pütz &amp; Allefeld, Ganzfeld imagery
                (Cortex 2002); thalamo-cortical decoupling under sensory
                homogeneity (Nature Sci Rep 2020, s41598-020-75019-3);
                &ldquo;Oceanic states of consciousness&rdquo; (Frontiers 2026);
                and arXiv:2507.09011 (2026).
              </p>
            </div>
          </div>
        </div>
      )}
    </main>
  );
}
