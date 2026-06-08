"use client";

/**
 * 417 — Kids Cradle Song
 * ──────────────────────
 * A near-black, audio-first lullaby companion.
 * The child rocks the tablet; a companion voice hums in time,
 * then gently leads the tempo down toward sleep.
 *
 * Technique: Kuramoto single phase-coupling (see entrain.ts).
 * Tonality:  Whole-tone scale, just-intonation ratios (not D-Dorian).
 * Visual:    ONE faint breathing dot — nothing else.
 * Input:     DeviceMotion (primary) · drag fallback · auto-demo.
 */

import { useEffect, useRef, useState, useCallback } from "react";
import {
  makeRockDetector,
  updateRockDetector,
  makeMusicOsc,
  stepMusicOsc,
  breathValue,
  sessionGain,
  SESSION_S,
} from "./entrain";
import type { RockDetectorState, MusicOscState } from "./entrain";

// ── Whole-tone scale frequencies (C3 root, just-intonation ratios) ────────────
// C3  D3  E3  F#3  G#3  A#3  C4
const C3 = 130.813;
const WHOLE_TONE: readonly number[] = [
  C3,                   // C3  = 130.8
  C3 * (9 / 8),         // D3  ≈ 147.2
  C3 * (5 / 4),         // E3  ≈ 163.5
  C3 * (45 / 32),       // F#3 ≈ 183.9
  C3 * (25 / 16),       // G#3 ≈ 204.4
  C3 * (225 / 128),     // A#3 ≈ 229.7
  C3 * 2,               // C4  = 261.6
];

/** 3-note hum phrase cycled each rock (whole-tone arpeggio: C3 → E3 → G#3) */
const HUM_PHRASE = [0, 2, 4] as const;

/** Low drone frequencies */
const DRONE_FREQS = [C3, C3 * (5 / 4)] as const; // C3 + E3

// ── Reverb impulse-response generator ────────────────────────────────────────
function buildReverb(ctx: AudioContext): AudioBuffer {
  const rate = ctx.sampleRate;
  const len  = Math.floor(rate * 1.8);
  const buf  = ctx.createBuffer(2, len, rate);
  for (let ch = 0; ch < 2; ch++) {
    const d = buf.getChannelData(ch);
    for (let i = 0; i < len; i++) {
      const env = Math.pow(1 - i / len, 2.4);
      d[i] = (Math.random() * 2 - 1) * env * 0.85;
    }
  }
  return buf;
}

// ── Additive hum voice ────────────────────────────────────────────────────────
function triggerHumNote(
  ctx: AudioContext,
  dest: AudioNode,
  freq: number,
  durationS: number,
  peakGain: number,
  pan: number,
) {
  const t = ctx.currentTime;
  const attackTc  = 0.05;
  const releaseTc = 0.07;

  const panner = ctx.createStereoPanner();
  panner.pan.value = pan;
  panner.connect(dest);

  const masterGain = ctx.createGain();
  masterGain.gain.setValueAtTime(0, t);
  masterGain.gain.setTargetAtTime(peakGain, t, attackTc);
  masterGain.gain.setTargetAtTime(0, t + durationS - releaseTc * 3, releaseTc);
  masterGain.connect(panner);

  // Partial 1: fundamental sine (body of hum)
  const osc1 = ctx.createOscillator();
  osc1.type = "sine";
  osc1.frequency.value = freq;

  // Partial 2: octave triangle (warmth)
  const osc2 = ctx.createOscillator();
  osc2.type = "triangle";
  osc2.frequency.value = freq * 2;
  const g2 = ctx.createGain();
  g2.gain.value = 0.25;

  // Partial 3: second harmonic shimmer
  const osc3 = ctx.createOscillator();
  osc3.type = "sine";
  osc3.frequency.value = freq * 3;
  const g3 = ctx.createGain();
  g3.gain.value = 0.09;

  // Vowel formants (bandpass at ~680 Hz "aah" and ~1150 Hz "ooh")
  const bp1 = ctx.createBiquadFilter();
  bp1.type = "bandpass";
  bp1.frequency.value = 680;
  bp1.Q.value = 4;

  const bp2 = ctx.createBiquadFilter();
  bp2.type = "bandpass";
  bp2.frequency.value = 1150;
  bp2.Q.value = 6;

  const bpGain = ctx.createGain();
  bpGain.gain.value = 0.16;

  // Formant path
  osc1.connect(bp1); bp1.connect(bpGain);
  osc1.connect(bp2); bp2.connect(bpGain);
  bpGain.connect(masterGain);

  // Direct partials
  osc1.connect(masterGain);
  osc2.connect(g2); g2.connect(masterGain);
  osc3.connect(g3); g3.connect(masterGain);

  const stopT = t + durationS + 0.1;
  osc1.start(t); osc1.stop(stopT);
  osc2.start(t); osc2.stop(stopT);
  osc3.start(t); osc3.stop(stopT);
}

// ── Drone ─────────────────────────────────────────────────────────────────────
function startDrone(ctx: AudioContext, dest: AudioNode): () => void {
  const oscs: OscillatorNode[] = [];
  const gains: GainNode[] = [];

  DRONE_FREQS.forEach((freq, i) => {
    const osc = ctx.createOscillator();
    osc.type = "triangle";
    osc.frequency.value = freq;
    osc.detune.value = i === 0 ? 0 : 4;

    const g = ctx.createGain();
    g.gain.setValueAtTime(0, ctx.currentTime);
    g.gain.setTargetAtTime(0.048, ctx.currentTime, 2.0);
    osc.connect(g);
    g.connect(dest);
    osc.start();
    oscs.push(osc);
    gains.push(g);
  });

  return () => {
    const t = ctx.currentTime;
    gains.forEach(g => g.gain.setTargetAtTime(0, t, 1.2));
    setTimeout(() => {
      oscs.forEach(o => { try { o.stop(); } catch { /* already stopped */ } });
    }, 5000);
  };
}

// ── Component ─────────────────────────────────────────────────────────────────

type AppState = "idle" | "running" | "done";

export default function KidsCradleSong() {
  const [appState, setAppState]         = useState<AppState>("idle");
  const [motionDenied, setMotionDenied] = useState(false);
  const [noAudio, setNoAudio]           = useState(false);

  // Breathing dot ref
  const dotRef = useRef<HTMLDivElement>(null);

  // Audio
  const ctxRef         = useRef<AudioContext | null>(null);
  const humDestRef     = useRef<AudioNode | null>(null);
  const pannerRef      = useRef<StereoPannerNode | null>(null);
  const stopDroneRef   = useRef<(() => void) | null>(null);
  const masterGainRef  = useRef<GainNode | null>(null);

  // Entrain state (from entrain.ts)
  const rockStateRef  = useRef<RockDetectorState | null>(null);
  const musicStateRef = useRef<MusicOscState | null>(null);

  // RAF
  const rafRef          = useRef<number>(0);
  const lastTimestampRef = useRef<number>(0);

  // Mode flags
  const hasMotionRef  = useRef(false);
  const autoModeRef   = useRef(false);
  const autoTimerRef  = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Drag fallback
  const dragActiveRef = useRef(false);
  const dragLastXRef  = useRef(0);
  // Synthetic rock phase for drag and auto-demo
  const synthPhaseRef = useRef(0);

  // Hum phrase index
  const phraseIdxRef  = useRef(0);
  // Previous music phase for cycle-complete detection
  const prevMusicPhaseRef = useRef(0);

  // Session timing (seconds, performance.now() based)
  const sessionStartSecRef = useRef(0);
  const fadingRef = useRef(false);

  // ── Audio init ────────────────────────────────────────────────────────────

  const initAudio = useCallback(() => {
    if (ctxRef.current) return;
    try {
      const ctx = new AudioContext();
      ctxRef.current = ctx;

      // Compressor (brick-wall limiter)
      const compressor = ctx.createDynamicsCompressor();
      compressor.threshold.value = -8;
      compressor.knee.value      = 3;
      compressor.ratio.value     = 12;
      compressor.attack.value    = 0.001;
      compressor.release.value   = 0.15;

      // Master gain
      const master = ctx.createGain();
      master.gain.value = 0.72;
      masterGainRef.current = master;

      // Reverb
      const reverb  = ctx.createConvolver();
      reverb.buffer = buildReverb(ctx);
      const dryG = ctx.createGain(); dryG.gain.value = 0.76;
      const wetG = ctx.createGain(); wetG.gain.value = 0.30;

      // Sway panner
      const panner = ctx.createStereoPanner();
      panner.pan.value = 0;
      pannerRef.current = panner;

      // Wire: panner → dry + wet/reverb → compressor → master → dest
      panner.connect(dryG); dryG.connect(compressor);
      panner.connect(reverb); reverb.connect(wetG); wetG.connect(compressor);
      compressor.connect(master); master.connect(ctx.destination);

      humDestRef.current = panner;
      stopDroneRef.current = startDrone(ctx, panner);

    } catch {
      setNoAudio(true);
    }
  }, []);

  // ── Hum trigger ───────────────────────────────────────────────────────────

  const triggerHum = useCallback((musicPhase: number, omega: number) => {
    const ctx  = ctxRef.current;
    const dest = humDestRef.current;
    if (!ctx || !dest) return;
    if (ctx.state === "suspended") ctx.resume().catch(() => {});

    const noteIdx = HUM_PHRASE[phraseIdxRef.current % HUM_PHRASE.length];
    phraseIdxRef.current++;
    const freq = WHOLE_TONE[noteIdx];

    // Duration: ~72% of one period
    const periodS  = (2 * Math.PI) / Math.max(omega, 0.5);
    const noteDur  = Math.min(1.4, Math.max(0.30, periodS * 0.72));

    const pan = Math.sin(musicPhase) * 0.38;
    triggerHumNote(ctx, dest, freq, noteDur, 0.36, pan);

    // Haptic (guarded — iOS ignores, that's fine)
    if (typeof navigator !== "undefined" && "vibrate" in navigator) {
      try { navigator.vibrate(28); } catch { /* ignore */ }
    }
  }, []);

  // ── RAF loop ──────────────────────────────────────────────────────────────

  const runLoop = useCallback((timestamp: number) => {
    if (!lastTimestampRef.current) lastTimestampRef.current = timestamp;
    const dt  = Math.min((timestamp - lastTimestampRef.current) / 1000, 0.05);
    lastTimestampRef.current = timestamp;

    const nowSec = timestamp / 1000;
    const rock   = rockStateRef.current;
    const music  = musicStateRef.current;
    if (!rock || !music) {
      rafRef.current = requestAnimationFrame(runLoop);
      return;
    }

    // Session fade at 12 minutes
    const elapsed = nowSec - sessionStartSecRef.current;
    if (elapsed > SESSION_S && !fadingRef.current) {
      fadingRef.current = true;
      stopDroneRef.current?.();
      if (masterGainRef.current && ctxRef.current) {
        masterGainRef.current.gain.setTargetAtTime(0, ctxRef.current.currentTime, 4.0);
      }
      setTimeout(() => setAppState("done"), 10000);
    }

    // Determine rock phase source
    let rockPhase: number;
    if (hasMotionRef.current && !dragActiveRef.current && !autoModeRef.current) {
      // Real motion — already updated in devicemotion handler
      rockPhase = rock.phase;
    } else if (dragActiveRef.current) {
      // Pointer drag: manual phase from drag velocity
      rockPhase = synthPhaseRef.current;
    } else {
      // Auto-demo: gentle 0.82 Hz synthetic rock
      const omegaAuto  = 0.82 * 2 * Math.PI;
      synthPhaseRef.current = (synthPhaseRef.current + omegaAuto * dt) % (2 * Math.PI);
      rockPhase = synthPhaseRef.current;
    }

    // Kuramoto step (from entrain.ts)
    const prevPhase = music.phase;
    const musicPhase = stepMusicOsc(music, rockPhase, dt, nowSec);

    // Detect music cycle completion (phase crosses 2π → 0)
    const cycleComplete = prevPhase > Math.PI && musicPhase < Math.PI * 0.5;
    prevMusicPhaseRef.current = musicPhase;

    if (cycleComplete && !fadingRef.current) {
      triggerHum(musicPhase, music.omega);
    }

    // Update sway panner
    if (pannerRef.current) {
      pannerRef.current.pan.setTargetAtTime(
        Math.sin(musicPhase) * 0.32,
        ctxRef.current?.currentTime ?? 0,
        0.08,
      );
    }

    // Apply session-end gain via sessionGain helper
    if (masterGainRef.current && ctxRef.current && !fadingRef.current) {
      const sg = sessionGain(music, nowSec);
      if (sg < 1) {
        masterGainRef.current.gain.setTargetAtTime(sg * 0.72, ctxRef.current.currentTime, 0.5);
      }
    }

    // Breathing dot visual — driven by companion breath value
    const dot = dotRef.current;
    if (dot) {
      const bv    = breathValue(musicPhase); // 0..1, soft cosine
      const scale = 0.82 + bv * 0.32;
      const opa   = 0.11 + bv * 0.22;
      dot.style.transform = `translate(-50%, -50%) scale(${scale.toFixed(3)})`;
      dot.style.opacity   = opa.toFixed(3);
    }

    rafRef.current = requestAnimationFrame(runLoop);
  }, [triggerHum]);

  // ── DeviceMotion handler (stable ref pattern) ─────────────────────────────

  const motionHandlerRef = useRef<(e: DeviceMotionEvent) => void>(() => {});

  useEffect(() => {
    motionHandlerRef.current = (e: DeviceMotionEvent) => {
      const g = e.accelerationIncludingGravity;
      if (!g) return;
      const gravX = g.x ?? 0;

      // If meaningful tilt, override auto mode
      if (Math.abs(gravX) > 0.4 && autoModeRef.current) {
        autoModeRef.current = false;
        if (autoTimerRef.current) {
          clearTimeout(autoTimerRef.current);
          autoTimerRef.current = null;
        }
      }

      const intervalS = e.interval ? e.interval / 1000 : 0.02;
      const nowSec = performance.now() / 1000;
      const rock = rockStateRef.current;
      if (rock) updateRockDetector(rock, gravX, nowSec + intervalS);
    };
  });

  const handleDeviceMotion = useCallback((e: DeviceMotionEvent) => {
    motionHandlerRef.current(e);
  }, []);

  // ── Start handler (must be inside tap for iOS AudioContext + permission) ──

  const handleStart = useCallback(async () => {
    initAudio();

    const nowSec = performance.now() / 1000;
    sessionStartSecRef.current = nowSec;
    rockStateRef.current       = makeRockDetector();
    musicStateRef.current      = makeMusicOsc(nowSec);
    prevMusicPhaseRef.current  = 0;

    setAppState("running");

    // iOS 13+ DeviceMotion permission
    let motionGranted = false;
    if (
      typeof DeviceMotionEvent !== "undefined" &&
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      typeof (DeviceMotionEvent as any).requestPermission === "function"
    ) {
      try {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const perm = await (DeviceMotionEvent as any).requestPermission();
        motionGranted = perm === "granted";
      } catch {
        motionGranted = false;
      }
    } else if (typeof DeviceMotionEvent !== "undefined") {
      motionGranted = true;
    }

    if (motionGranted) {
      hasMotionRef.current = true;
      window.addEventListener("devicemotion", handleDeviceMotion);
    } else {
      setMotionDenied(true);
    }

    // Auto-demo: engage if no rocking detected within 2.5 s
    autoTimerRef.current = setTimeout(() => {
      if (!dragActiveRef.current) {
        autoModeRef.current = true;
      }
    }, 2500);

    lastTimestampRef.current = 0;
    rafRef.current = requestAnimationFrame(runLoop);
  }, [initAudio, runLoop, handleDeviceMotion]);

  // ── Drag fallback handlers ────────────────────────────────────────────────

  const handlePointerDown = useCallback((e: React.PointerEvent) => {
    if (appState !== "running") return;
    dragActiveRef.current = true;
    dragLastXRef.current  = e.clientX;
    autoModeRef.current   = false;
    if (autoTimerRef.current) {
      clearTimeout(autoTimerRef.current);
      autoTimerRef.current = null;
    }
    e.preventDefault();
  }, [appState]);

  const handlePointerMove = useCallback((e: React.PointerEvent) => {
    if (!dragActiveRef.current) return;
    const dx = e.clientX - dragLastXRef.current;
    dragLastXRef.current = e.clientX;
    // Map horizontal drag to phase advance
    const scale = (2 * Math.PI) / (window.innerWidth * 0.6);
    synthPhaseRef.current = (synthPhaseRef.current + dx * scale) % (2 * Math.PI);
    if (synthPhaseRef.current < 0) synthPhaseRef.current += 2 * Math.PI;
    e.preventDefault();
  }, []);

  const handlePointerUp = useCallback((e: React.PointerEvent) => {
    dragActiveRef.current = false;
    e.preventDefault();
  }, []);

  // ── Cleanup ───────────────────────────────────────────────────────────────

  useEffect(() => {
    return () => {
      cancelAnimationFrame(rafRef.current);
      window.removeEventListener("devicemotion", handleDeviceMotion);
      if (autoTimerRef.current) clearTimeout(autoTimerRef.current);
      const ctx = ctxRef.current;
      if (ctx && ctx.state !== "closed") ctx.close().catch(() => {});
    };
  }, [handleDeviceMotion]);

  // ── Render: idle ──────────────────────────────────────────────────────────

  if (appState === "idle") {
    return (
      <main className="fixed inset-0 bg-[#050508] flex flex-col items-center justify-center gap-8 px-6 select-none">
        <div
          aria-hidden="true"
          className="text-white/20"
          style={{ fontSize: "56px", lineHeight: 1 }}
        >
          ☽
        </div>

        <h1 className="text-xl font-light tracking-widest text-white/95 text-center">
          Cradle Song
        </h1>

        <p className="text-base text-white/75 text-center max-w-xs leading-relaxed">
          Rock your tablet gently side to side.
          <br />
          Close your eyes. Listen.
        </p>

        <p className="text-sm text-white/50 text-center">
          🎧 Headphones work best
        </p>

        <button
          onPointerDown={handleStart}
          aria-label="Start the cradle song"
          className="mt-2 rounded-full border border-white/15 bg-white/5 px-10 py-5 text-lg font-light tracking-widest text-white/90 transition-transform active:scale-95 min-h-[64px] min-w-[180px]"
          style={{ WebkitTapHighlightColor: "transparent" }}
        >
          Begin
        </button>

        {noAudio && (
          <p className="mt-2 text-center text-base text-rose-300">
            Web Audio is not available in this browser.
          </p>
        )}
      </main>
    );
  }

  // ── Render: done ──────────────────────────────────────────────────────────

  if (appState === "done") {
    return (
      <main className="fixed inset-0 bg-[#020204] flex flex-col items-center justify-center gap-6 select-none">
        <div
          aria-hidden="true"
          className="text-white/15"
          style={{ fontSize: "48px", lineHeight: 1 }}
        >
          ☽
        </div>
        <p className="text-xl font-light tracking-widest text-white/40">
          Goodnight
        </p>
      </main>
    );
  }

  // ── Render: running (near-black, single breathing dot) ───────────────────

  return (
    <main
      className="fixed inset-0 bg-[#030306] select-none overflow-hidden"
      onPointerDown={handlePointerDown}
      onPointerMove={handlePointerMove}
      onPointerUp={handlePointerUp}
      onPointerCancel={handlePointerUp}
      style={{ touchAction: "none", WebkitTapHighlightColor: "transparent" }}
    >
      {/* THE ONLY VISUAL: a single faint breathing dot */}
      <div
        ref={dotRef}
        aria-hidden="true"
        style={{
          position:      "absolute",
          top:           "50%",
          left:          "50%",
          width:         "72px",
          height:        "72px",
          borderRadius:  "50%",
          background:    "radial-gradient(circle, rgba(180,210,255,0.55) 0%, rgba(120,160,240,0.18) 55%, transparent 100%)",
          transform:     "translate(-50%, -50%) scale(0.9)",
          opacity:       "0.18",
          pointerEvents: "none",
          willChange:    "transform, opacity",
        }}
      />

      {/* Motion-denied notice */}
      {motionDenied && (
        <p className="pointer-events-none absolute bottom-24 left-0 right-0 px-6 text-center text-base text-rose-300">
          Motion sensor unavailable — drag side to side, or just listen
        </p>
      )}

      {/* Tiny hint */}
      <p
        aria-hidden="true"
        className="pointer-events-none absolute bottom-6 left-0 right-0 select-none text-center text-xs text-white/20"
      >
        rock · listen · rest
      </p>
    </main>
  );
}
