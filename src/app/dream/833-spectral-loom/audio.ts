// audio.ts — Spectral Loom audio engine
//
// Two sources feed an identical capture pipeline:
//   1. live microphone (MediaStreamSource)
//   2. an internally-generated "demo sound" (slow chord + whistle + filtered
//      noise sweep) used when no mic is available.
//
// Both route into a single AnalyserNode that drives the rolling spectrogram.
// Resynthesis of the FROZEN, PAINTED image is done by a capped additive
// oscillator bank reading a magnitude column each frame.
//
// Master chain: gain → lowpass(≤13.5 kHz) → DynamicsCompressor → destination.

export const FFT_SIZE = 1024;
export const FREQ_BINS = FFT_SIZE / 2; // 512
export const TIME_COLS = 220; // rolling + frozen buffer width (time axis)

// Resynth grid: we map the FREQ_BINS down to a smaller perceptual row count so
// the oscillator bank stays capped and the painting stays tactile.
export const ROWS = 128; // frequency rows in the editable image
export const MAX_OSC = 96; // hard cap on additive oscillators

const MIN_HZ = 60;
const MAX_HZ = 12000;

/** Row index (0 = bottom = low freq) → Hz, log/perceptual mapping. */
export function rowToHz(row: number): number {
  const t = row / (ROWS - 1);
  return MIN_HZ * Math.pow(MAX_HZ / MIN_HZ, t);
}

/** Map a normalized analyser bin (0..1 over FREQ_BINS) to a row, perceptual. */
function binTToRow(binT: number): number {
  // binT is linear-in-Hz fraction; convert toward log rows.
  const hz = binT * (MAX_HZ); // analyser bins are linear in Hz up to Nyquist
  const clamped = Math.max(MIN_HZ, Math.min(MAX_HZ, hz));
  const t = Math.log(clamped / MIN_HZ) / Math.log(MAX_HZ / MIN_HZ);
  return Math.round(t * (ROWS - 1));
}

export type SourceKind = "mic" | "demo";

export interface EngineHandles {
  ctx: AudioContext;
  analyser: AnalyserNode;
  master: GainNode;
  // resynth
  oscs: OscillatorNode[];
  oscGains: GainNode[];
  // demo source nodes (only present when demo running)
  demoStop?: () => void;
  // mic
  micStream?: MediaStream;
  micSource?: MediaStreamAudioSourceNode;
}

/** Build the shared master chain + analyser + oscillator bank. */
export function makeEngine(): EngineHandles {
  const Ctx = (window.AudioContext ||
    (window as unknown as { webkitAudioContext: typeof AudioContext })
      .webkitAudioContext) as typeof AudioContext;
  const ctx = new Ctx();

  const analyser = ctx.createAnalyser();
  analyser.fftSize = FFT_SIZE;
  analyser.smoothingTimeConstant = 0.55;
  analyser.minDecibels = -90;
  analyser.maxDecibels = -10;

  // ── master chain ──
  const master = ctx.createGain();
  master.gain.value = 0.0;

  const lp = ctx.createBiquadFilter();
  lp.type = "lowpass";
  lp.frequency.value = 13500;
  lp.Q.value = 0.5;

  const comp = ctx.createDynamicsCompressor();
  comp.threshold.value = -18;
  comp.knee.value = 24;
  comp.ratio.value = 4;
  comp.attack.value = 0.004;
  comp.release.value = 0.25;

  master.connect(lp);
  lp.connect(comp);
  comp.connect(ctx.destination);

  // ── additive oscillator bank (resynth of the painted image) ──
  const oscs: OscillatorNode[] = [];
  const oscGains: GainNode[] = [];
  for (let i = 0; i < MAX_OSC; i++) {
    const o = ctx.createOscillator();
    o.type = "sine";
    const g = ctx.createGain();
    g.gain.value = 0;
    o.connect(g);
    g.connect(master);
    o.start();
    oscs.push(o);
    oscGains.push(g);
  }

  return { ctx, analyser, master, oscs, oscGains };
}

/** Attach a live mic stream to the analyser. */
export function attachMic(eng: EngineHandles, stream: MediaStream): void {
  const src = eng.ctx.createMediaStreamSource(stream);
  src.connect(eng.analyser);
  eng.micStream = stream;
  eng.micSource = src;
}

/**
 * Build & start the internally generated demo sound and route it through the
 * IDENTICAL analyser (so freeze→paint→resynth works with no mic).
 * Evolving: a slow drifting chord + whistle sweep + filtered noise.
 */
export function startDemoSound(eng: EngineHandles): void {
  const { ctx, analyser } = eng;
  const now = ctx.currentTime;
  const hub = ctx.createGain();
  hub.gain.value = 0.9;
  hub.connect(analyser);

  const stops: Array<() => void> = [];

  // slow chord (three detuned partials drifting in level)
  const chordHz = [174.6, 261.6, 392.0, 523.25];
  chordHz.forEach((hz, i) => {
    const o = ctx.createOscillator();
    o.type = i % 2 === 0 ? "sine" : "triangle";
    o.frequency.value = hz;
    const g = ctx.createGain();
    g.gain.value = 0.0;
    // level LFO
    const lfo = ctx.createOscillator();
    lfo.frequency.value = 0.05 + i * 0.017;
    const lfoG = ctx.createGain();
    lfoG.gain.value = 0.08;
    lfo.connect(lfoG);
    lfoG.connect(g.gain);
    g.gain.value = 0.08;
    // slow detune drift
    o.detune.value = (i - 1.5) * 6;
    o.connect(g);
    g.connect(hub);
    o.start(now);
    lfo.start(now);
    stops.push(() => {
      try {
        o.stop();
        lfo.stop();
      } catch {
        /* already stopped */
      }
    });
  });

  // whistle sweep
  const whistle = ctx.createOscillator();
  whistle.type = "sine";
  whistle.frequency.setValueAtTime(900, now);
  const wg = ctx.createGain();
  wg.gain.value = 0.06;
  const wlfo = ctx.createOscillator();
  wlfo.type = "sine";
  wlfo.frequency.value = 0.07;
  const wlfoG = ctx.createGain();
  wlfoG.gain.value = 700;
  wlfo.connect(wlfoG);
  wlfoG.connect(whistle.frequency);
  whistle.connect(wg);
  wg.connect(hub);
  whistle.start(now);
  wlfo.start(now);
  stops.push(() => {
    try {
      whistle.stop();
      wlfo.stop();
    } catch {
      /* noop */
    }
  });

  // filtered noise sweep (airy texture)
  const noiseLen = 2 * ctx.sampleRate;
  const buf = ctx.createBuffer(1, noiseLen, ctx.sampleRate);
  const data = buf.getChannelData(0);
  for (let i = 0; i < noiseLen; i++) data[i] = Math.random() * 2 - 1;
  const noise = ctx.createBufferSource();
  noise.buffer = buf;
  noise.loop = true;
  const bp = ctx.createBiquadFilter();
  bp.type = "bandpass";
  bp.frequency.value = 1500;
  bp.Q.value = 4;
  const nlfo = ctx.createOscillator();
  nlfo.frequency.value = 0.04;
  const nlfoG = ctx.createGain();
  nlfoG.gain.value = 1200;
  nlfo.connect(nlfoG);
  nlfoG.connect(bp.frequency);
  const ng = ctx.createGain();
  ng.gain.value = 0.05;
  noise.connect(bp);
  bp.connect(ng);
  ng.connect(hub);
  noise.start(now);
  nlfo.start(now);
  stops.push(() => {
    try {
      noise.stop();
      nlfo.stop();
    } catch {
      /* noop */
    }
  });

  eng.demoStop = () => {
    stops.forEach((s) => s());
    try {
      hub.disconnect();
    } catch {
      /* noop */
    }
  };
}

/**
 * Pull the latest analyser frame and write it into the supplied rolling
 * column (length ROWS), normalized 0..1. We fold the linear FFT bins into the
 * perceptual log rows by max-pooling.
 */
export function captureColumn(
  analyser: AnalyserNode,
  scratch: Uint8Array<ArrayBuffer>,
  outCol: Float32Array
): void {
  analyser.getByteFrequencyData(scratch);
  outCol.fill(0);
  for (let b = 0; b < scratch.length; b++) {
    const binT = b / scratch.length;
    const row = binTToRow(binT);
    if (row < 0 || row >= ROWS) continue;
    const v = scratch[b] / 255;
    if (v > outCol[row]) outCol[row] = v;
  }
  // light vertical smoothing so log-rows aren't sparse in the low end
  for (let r = 1; r < ROWS - 1; r++) {
    outCol[r] = outCol[r] * 0.7 + (outCol[r - 1] + outCol[r + 1]) * 0.15;
  }
}

/**
 * Drive the additive oscillator bank from one frozen/painted column.
 * Picks the loudest MAX_OSC rows, sets frequency + smoothed gain.
 * `gateOpen` lets the scrub head silence the bank between loop hits.
 */
export function applyColumnToBank(
  eng: EngineHandles,
  col: Float32Array,
  amount: number, // 0..1 overall resynth level
  gateOpen: boolean
): void {
  const { ctx, oscs, oscGains } = eng;
  const now = ctx.currentTime;
  const tau = 0.02;

  // rank rows by magnitude
  const idx: number[] = [];
  for (let r = 0; r < ROWS; r++) {
    if (col[r] > 0.02) idx.push(r);
  }
  idx.sort((a, b) => col[b] - col[a]);
  const used = Math.min(MAX_OSC, idx.length);

  for (let i = 0; i < MAX_OSC; i++) {
    const g = oscGains[i].gain;
    if (i < used && gateOpen) {
      const row = idx[i];
      const hz = rowToHz(row);
      oscs[i].frequency.setTargetAtTime(hz, now, tau);
      const mag = col[row];
      // perceptual loudness curve + per-osc headroom (÷ used for safety)
      const lvl = (mag * mag * amount * 0.9) / Math.sqrt(used + 1);
      g.setTargetAtTime(lvl, now, tau);
    } else {
      g.setTargetAtTime(0, now, tau);
    }
  }
}

/** Ramp master in/out without clicks. */
export function rampMaster(eng: EngineHandles, target: number): void {
  const now = eng.ctx.currentTime;
  eng.master.gain.setTargetAtTime(target, now, 0.05);
}

/** Full teardown: stop mic tracks, demo, disconnect, close ctx. */
export function disposeEngine(eng: EngineHandles): void {
  try {
    eng.demoStop?.();
  } catch {
    /* noop */
  }
  try {
    eng.micStream?.getTracks().forEach((t) => t.stop());
    eng.micSource?.disconnect();
  } catch {
    /* noop */
  }
  try {
    eng.oscs.forEach((o) => {
      try {
        o.stop();
      } catch {
        /* noop */
      }
      o.disconnect();
    });
    eng.oscGains.forEach((g) => g.disconnect());
    eng.analyser.disconnect();
    eng.master.disconnect();
  } catch {
    /* noop */
  }
  try {
    void eng.ctx.close();
  } catch {
    /* noop */
  }
}
