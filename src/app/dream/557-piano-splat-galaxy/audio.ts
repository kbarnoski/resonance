// audio.ts — 557-piano-splat-galaxy
//
// Audio engine for the onset-driven Gaussian-splat galaxy. Three jobs:
//   1. Source: fetch + decode Karel's real Welcome Home piano, OR synthesise
//      a gentle evolving solo-piano-like fallback that always makes sound.
//   2. Analysis: an AnalyserNode (fftSize 2048) gives per-frame magnitude
//      spectrum. We compute spectral flux (onset), dominant pitch (hue),
//      loudness (bloom size/count), and spectral centroid (tight vs diffuse).
//   3. A master DynamicsCompressor limiter so nothing ever clips.
//
// All client-side, all Web Audio API. No npm deps.

export const PIANO_RECORDING_ID = "549fc519-f7fc-4c38-a771-adaad2edbc81";

export type AudioSourceKind = "piano" | "fallback";

/** A single detected musical onset, consumed by the bloom particle system. */
export interface Onset {
  /** Loudness 0..1 (drives bloom splat count + size). */
  loudness: number;
  /** Spectral centroid 0..1 (brightness → bloom tightness). */
  brightness: number;
  /** Dominant pitch as MIDI-ish note 0..1 fraction of range (→ hue). */
  pitch: number;
  /** Estimated frequency in Hz (informational / HUD). */
  hz: number;
}

/** Per-frame analysis snapshot. */
export interface Frame {
  /** Overall energy 0..1 (drives sustained nebula haze). */
  energy: number;
  /** Brightness 0..1. */
  brightness: number;
  /** Dominant pitch 0..1 (over full track range). */
  pitch: number;
  /** A fresh onset this frame, or null. */
  onset: Onset | null;
}

interface AudioEngineHandles {
  ctx: AudioContext;
  analyser: AnalyserNode;
  kind: AudioSourceKind;
  stop: () => void;
}

// ─── Piano fetch ──────────────────────────────────────────────────────────────

/**
 * Fetch + decode Karel's piano. Response may be JSON {url} (then fetch that)
 * or raw audio bytes. Times out after ~4s so the fallback always runs offline.
 */
async function fetchPianoBuffer(ctx: AudioContext): Promise<AudioBuffer | null> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 4000);
  try {
    const res = await fetch(`/api/audio/${PIANO_RECORDING_ID}`, {
      signal: controller.signal,
    });
    if (!res.ok) return null;

    const ct = res.headers.get("content-type") ?? "";
    let bytes: ArrayBuffer;

    if (ct.includes("application/json")) {
      const json = (await res.json()) as { url?: string };
      if (!json.url) return null;
      const r2 = await fetch(json.url, { signal: controller.signal });
      if (!r2.ok) return null;
      bytes = await r2.arrayBuffer();
    } else {
      bytes = await res.arrayBuffer();
    }

    return await ctx.decodeAudioData(bytes);
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}

// ─── Fallback synth: gentle evolving solo-piano-like sequence ──────────────────

/** C-major / lydian-flavoured pool of pitches (MIDI), warm mid register. */
const NOTE_POOL = [
  60, 62, 64, 67, 69, 71, 72, 74, 76, 79, // C4..G5 diatonic + lydian #4 (F#=66)
  66, 78, 55, 57, 59,
];

function midiToHz(m: number): number {
  return 440 * Math.pow(2, (m - 69) / 12);
}

/**
 * Build a self-running synthetic piano-ish voice. Schedules overlapping
 * arpeggios with soft hammer-like envelopes and a few warm partials so the
 * spectrum has real structure for the analyser to chew on. Returns a stopper.
 */
function buildFallbackPiano(ctx: AudioContext, out: AudioNode): () => void {
  let stopped = false;
  const timers: ReturnType<typeof setTimeout>[] = [];
  const liveOsc: OscillatorNode[] = [];

  // A soft pad bed (slow nebula haze) under the notes.
  const padGain = ctx.createGain();
  padGain.gain.value = 0.0;
  padGain.connect(out);
  const padFreqs = [midiToHz(48), midiToHz(55), midiToHz(60)];
  for (const f of padFreqs) {
    const o = ctx.createOscillator();
    o.type = "sine";
    o.frequency.value = f;
    const g = ctx.createGain();
    g.gain.value = 0.06;
    o.connect(g);
    g.connect(padGain);
    o.start();
    liveOsc.push(o);
  }
  // breathe the pad in
  padGain.gain.setTargetAtTime(0.5, ctx.currentTime, 2.0);

  const playNote = (midi: number, when: number, vel: number) => {
    if (stopped) return;
    const hz = midiToHz(midi);
    // Warm piano-ish partials: fundamental + a couple inharmonic overtones.
    const partials: Array<[number, number, OscillatorType]> = [
      [1, 1.0, "triangle"],
      [2, 0.45, "sine"],
      [3, 0.22, "sine"],
      [4.02, 0.1, "sine"],
    ];
    const noteGain = ctx.createGain();
    noteGain.gain.value = 0.0001;
    noteGain.connect(out);

    // Hammer onset (fast attack, long-ish decay) → clear transients.
    const peak = 0.18 * vel;
    noteGain.gain.setValueAtTime(0.0001, when);
    noteGain.gain.exponentialRampToValueAtTime(peak, when + 0.012);
    noteGain.gain.exponentialRampToValueAtTime(0.0001, when + 1.6 + vel * 1.2);

    for (const [ratio, amp, type] of partials) {
      const o = ctx.createOscillator();
      o.type = type;
      o.frequency.value = hz * ratio;
      const g = ctx.createGain();
      g.gain.value = amp;
      o.connect(g);
      g.connect(noteGain);
      o.start(when);
      o.stop(when + 3.2);
    }
  };

  // Scheduler: rolling arpeggios, occasional clear single onsets.
  let step = 0;
  const schedule = () => {
    if (stopped) return;
    const now = ctx.currentTime;
    const bar = step % 8;
    // Pick a small arpeggio rooted on a shifting degree.
    const root = NOTE_POOL[(step * 3) % NOTE_POOL.length];
    const arp = [root, root + 4, root + 7, root + 11];
    if (bar === 0 || bar === 4) {
      // Strong clear onset (single struck note) to exercise the bloom burst.
      playNote(root, now + 0.05, 1.0);
    } else {
      const spread = 0.13;
      arp.forEach((m, i) => {
        if (Math.random() < 0.8) {
          playNote(m, now + 0.05 + i * spread, 0.45 + Math.random() * 0.4);
        }
      });
    }
    step++;
    const next = 900 + Math.random() * 500;
    timers.push(setTimeout(schedule, next));
  };
  schedule();

  return () => {
    stopped = true;
    timers.forEach(clearTimeout);
    try {
      padGain.gain.setTargetAtTime(0.0001, ctx.currentTime, 0.4);
    } catch {
      /* noop */
    }
    liveOsc.forEach((o) => {
      try {
        o.stop(ctx.currentTime + 0.6);
      } catch {
        /* noop */
      }
    });
  };
}

// ─── Engine construction ──────────────────────────────────────────────────────

/**
 * Build the full audio engine. Tries Karel's piano first; on any failure or
 * timeout, synthesises the fallback. Always ends in a limiter and feeds the
 * analyser. Returns handles for analysis + teardown.
 */
export async function makeAudioEngine(): Promise<AudioEngineHandles> {
  const Ctor =
    window.AudioContext ||
    (window as unknown as { webkitAudioContext: typeof AudioContext })
      .webkitAudioContext;
  const ctx = new Ctor();

  const analyser = ctx.createAnalyser();
  analyser.fftSize = 2048;
  analyser.smoothingTimeConstant = 0.55;

  // Master limiter so nothing clips regardless of source.
  const limiter = ctx.createDynamicsCompressor();
  limiter.threshold.value = -8;
  limiter.knee.value = 8;
  limiter.ratio.value = 12;
  limiter.attack.value = 0.003;
  limiter.release.value = 0.25;

  const master = ctx.createGain();
  master.gain.value = 0.9;

  master.connect(analyser);
  analyser.connect(limiter);
  limiter.connect(ctx.destination);

  // Attempt real piano.
  const buffer = await fetchPianoBuffer(ctx);

  if (buffer) {
    const src = ctx.createBufferSource();
    src.buffer = buffer;
    src.loop = true;
    src.connect(master);
    try {
      src.start();
    } catch {
      /* noop */
    }
    const stop = () => {
      try {
        src.stop();
      } catch {
        /* noop */
      }
      void ctx.close();
    };
    return { ctx, analyser, kind: "piano", stop };
  }

  // Fallback.
  const stopFallback = buildFallbackPiano(ctx, master);
  const stop = () => {
    stopFallback();
    void ctx.close();
  };
  return { ctx, analyser, kind: "fallback", stop };
}

// ─── Analysis: spectral flux onset, pitch, centroid ────────────────────────────

/** Pitch range (Hz) we map to hue, roughly piano mid range A1..C7. */
const HZ_LO = 55;
const HZ_HI = 2100;

/**
 * Stateful analyser that turns AnalyserNode frequency data into onsets +
 * per-frame features. Keeps an adaptive flux threshold (running mean) so it
 * works on both the loud fallback and quieter real recordings.
 */
export function makeAnalysis(analyser: AnalyserNode, sampleRate: number) {
  const bins = analyser.frequencyBinCount; // 1024
  const mag = new Float32Array(bins); // dB
  const prevMag = new Float32Array(bins);
  const linNow = new Float32Array(bins);
  const linPrev = new Float32Array(bins);

  let fluxAvg = 0; // running mean of flux for adaptive threshold
  let fluxVar = 1;
  let cooldown = 0; // frames before another onset can fire

  const hzPerBin = sampleRate / 2 / bins;

  const dbToLin = (db: number) => Math.pow(10, db / 20);

  function read(): Frame {
    analyser.getFloatFrequencyData(mag);

    // Convert to linear magnitudes, compute energy + spectral flux + centroid.
    let energy = 0;
    let centroidNum = 0;
    let centroidDen = 0;
    let flux = 0;
    let peakVal = 0;
    let peakBin = 1;

    for (let i = 0; i < bins; i++) {
      const lin = dbToLin(mag[i]);
      linNow[i] = lin;
      energy += lin;
      centroidNum += lin * i;
      centroidDen += lin;
      const d = lin - linPrev[i];
      if (d > 0) flux += d;
      if (i > 2 && lin > peakVal) {
        peakVal = lin;
        peakBin = i;
      }
      linPrev[i] = lin;
      prevMag[i] = mag[i];
    }

    energy /= bins;
    const centroidBin = centroidDen > 1e-6 ? centroidNum / centroidDen : 0;
    const brightness = Math.min(1, centroidBin / (bins * 0.45));

    // Loudness normalised (linear energy is tiny; scale + clamp).
    const loudness = Math.min(1, energy * 26);

    // Dominant pitch from peak bin (+ parabolic interpolation for accuracy).
    let refinedBin = peakBin;
    if (peakBin > 1 && peakBin < bins - 1) {
      const a = linNow[peakBin - 1];
      const b = linNow[peakBin];
      const c = linNow[peakBin + 1];
      const denom = a - 2 * b + c;
      if (Math.abs(denom) > 1e-9) {
        refinedBin = peakBin + (0.5 * (a - c)) / denom;
      }
    }
    const hz = Math.max(1, refinedBin * hzPerBin);
    // map log-frequency into 0..1
    const pitch = Math.min(
      1,
      Math.max(0, Math.log(hz / HZ_LO) / Math.log(HZ_HI / HZ_LO)),
    );

    // Adaptive onset detection on spectral flux.
    const fluxNorm = flux; // already linear-scale sum
    // update running stats (EMA)
    const alpha = 0.06;
    const diff = fluxNorm - fluxAvg;
    fluxAvg += alpha * diff;
    fluxVar += alpha * (diff * diff - fluxVar);
    const std = Math.sqrt(Math.max(fluxVar, 1e-9));
    const threshold = fluxAvg + 1.5 * std + 0.002;

    let onset: Onset | null = null;
    if (cooldown > 0) cooldown--;
    if (fluxNorm > threshold && cooldown === 0 && loudness > 0.02) {
      cooldown = 4; // ~4 frames min gap
      onset = {
        loudness: Math.min(1, loudness * 1.3 + 0.15),
        brightness,
        pitch,
        hz,
      };
    }

    return { energy: loudness, brightness, pitch, onset };
  }

  return { read };
}
