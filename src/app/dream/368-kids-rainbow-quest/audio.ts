// audio.ts — Rainbow Quest audio engine (368)
// ─────────────────────────────────────────────────────────────────────────────
// All sound through a DynamicsCompressor brick-wall limiter (safe for kids).
// Scale: D-Dorian — D E F G A B C (NOT C-major-pentatonic; hard rule).
// Always-on: soft D + A drone pad.
// ─────────────────────────────────────────────────────────────────────────────

// D-Dorian frequencies — one octave D4→D5, matching rainbow order
// D4  E4     F4     G4     A4     B4     C5     D5
// 293.66 329.63 349.23 392.00 440.00 493.88 523.25 587.33
export const D_DORIAN: readonly number[] = [
  293.66, // D4 — RED
  329.63, // E4 — ORANGE
  349.23, // F4 — YELLOW
  392.00, // G4 — GREEN
  440.00, // A4 — CYAN/BLUE
  493.88, // B4 — BLUE/INDIGO
  523.25, // C5 — VIOLET
];

// ── types ─────────────────────────────────────────────────────────────────────
export interface RainbowAudio {
  ctx: AudioContext;
  // Call this to trigger the "found it!" fanfare for a given color index 0-6
  playFanfare: (colorIdx: number) => void;
  // Play the final rainbow song (all 7 notes in order, each band lights up)
  playRainbowSong: (onBeat: (idx: number) => void) => void;
  // Update warmth shimmer (0=far from target, 1=right on target)
  setWarmth: (value: number) => void;
  teardown: () => void;
}

// ── compressor settings ───────────────────────────────────────────────────────
function buildMasterChain(ctx: AudioContext): GainNode {
  const compressor = ctx.createDynamicsCompressor();
  compressor.threshold.value = -8;
  compressor.knee.value = 3;
  compressor.ratio.value = 20;
  compressor.attack.value = 0.001;
  compressor.release.value = 0.15;
  compressor.connect(ctx.destination);

  const master = ctx.createGain();
  master.gain.value = 0.72;
  master.connect(compressor);
  return master;
}

// ── drone: D4 + A4 (perfect fifth, always on) ────────────────────────────────
function buildDrone(ctx: AudioContext, dest: AudioNode): OscillatorNode[] {
  const pairs: [number, number][] = [
    [146.83, 220.00], // D3 + A3 — one octave lower for warmth
  ];
  const oscs: OscillatorNode[] = [];
  for (const [f1, f2] of pairs) {
    for (const freq of [f1, f2]) {
      const osc = ctx.createOscillator();
      osc.type = "sine";
      osc.frequency.value = freq;
      const g = ctx.createGain();
      g.gain.value = 0.048;
      osc.connect(g);
      g.connect(dest);
      osc.start();
      oscs.push(osc);
    }
  }
  return oscs;
}

// ── shimmer warmth node ───────────────────────────────────────────────────────
// A high-pitched shimmer that rises in amplitude as warmth → 1
function buildWarmthShimmer(
  ctx: AudioContext,
  dest: AudioNode,
): { gain: GainNode; oscs: OscillatorNode[] } {
  const shimmerGain = ctx.createGain();
  shimmerGain.gain.value = 0;
  shimmerGain.connect(dest);

  const oscs: OscillatorNode[] = [];

  // Three detuned high sine partials
  const freqs = [1174.66, 1318.51, 1396.91]; // D6 E6 F6
  for (const freq of freqs) {
    const osc = ctx.createOscillator();
    osc.type = "sine";
    osc.frequency.value = freq;
    const g = ctx.createGain();
    g.gain.value = 0.07;

    // slow tremolo on each
    const lfo = ctx.createOscillator();
    lfo.type = "sine";
    lfo.frequency.value = 3.5 + Math.random() * 2;
    const lfoG = ctx.createGain();
    lfoG.gain.value = 0.5;
    const lfoBase = ctx.createGain();
    lfoBase.gain.value = 0.5;
    lfo.connect(lfoG);
    lfoG.connect(lfoBase.gain);
    osc.connect(lfoBase);
    lfoBase.connect(g);
    g.connect(shimmerGain);
    osc.start();
    lfo.start();
    oscs.push(osc, lfo);
  }

  return { gain: shimmerGain, oscs };
}

// ── fanfare: three-note rising chime ─────────────────────────────────────────
function playFanfareNow(
  ctx: AudioContext,
  dest: AudioNode,
  colorIdx: number,
): void {
  const root = D_DORIAN[colorIdx];
  // play root, fifth above, octave
  const noteHz = [
    root,
    root * 1.5,   // perfect fifth
    root * 2.0,   // octave
  ];

  noteHz.forEach((hz, i) => {
    const t = ctx.currentTime + i * 0.18;
    const osc = ctx.createOscillator();
    osc.type = "triangle";
    osc.frequency.value = hz;
    const g = ctx.createGain();
    g.gain.setValueAtTime(0, t);
    g.gain.linearRampToValueAtTime(0.35, t + 0.04);
    g.gain.exponentialRampToValueAtTime(0.001, t + 0.65);
    osc.connect(g);
    g.connect(dest);
    osc.start(t);
    osc.stop(t + 0.7);
  });

  // sparkle tail — high sine burst
  const sparkleT = ctx.currentTime + 0.45;
  const sparkle = ctx.createOscillator();
  sparkle.type = "sine";
  sparkle.frequency.value = D_DORIAN[colorIdx] * 4;
  const sg = ctx.createGain();
  sg.gain.setValueAtTime(0, sparkleT);
  sg.gain.linearRampToValueAtTime(0.22, sparkleT + 0.06);
  sg.gain.exponentialRampToValueAtTime(0.001, sparkleT + 0.55);
  sparkle.connect(sg);
  sg.connect(dest);
  sparkle.start(sparkleT);
  sparkle.stop(sparkleT + 0.6);
}

// ── rainbow song: each band plays its note in sequence ───────────────────────
function playRainbowSongNow(
  ctx: AudioContext,
  dest: AudioNode,
  onBeat: (idx: number) => void,
): void {
  const beatDur = 0.48;

  // Play each of the 7 notes with a callback for visual sync
  for (let i = 0; i < D_DORIAN.length; i++) {
    const t = ctx.currentTime + i * beatDur;
    const hz = D_DORIAN[i];

    // Schedule audio
    const osc = ctx.createOscillator();
    osc.type = "triangle";
    osc.frequency.value = hz;
    const g = ctx.createGain();
    g.gain.setValueAtTime(0, t);
    g.gain.linearRampToValueAtTime(0.28, t + 0.05);
    g.gain.setTargetAtTime(0.18, t + 0.15, 0.12);
    g.gain.setTargetAtTime(0.001, t + beatDur * 0.7, 0.08);
    osc.connect(g);
    g.connect(dest);
    osc.start(t);
    osc.stop(t + beatDur + 0.3);

    // Schedule onBeat callback
    const delay = (t - ctx.currentTime) * 1000;
    setTimeout(() => onBeat(i), Math.max(0, delay));
  }

  // Final chord bloom — all 7 together
  const chordStart = ctx.currentTime + D_DORIAN.length * beatDur + 0.2;
  D_DORIAN.forEach((hz, i) => {
    const t = chordStart + i * 0.06;
    const osc = ctx.createOscillator();
    osc.type = "sine";
    osc.frequency.value = hz;
    const g = ctx.createGain();
    g.gain.setValueAtTime(0, t);
    g.gain.linearRampToValueAtTime(0.20, t + 0.12);
    g.gain.setTargetAtTime(0.001, t + 2.5, 0.6);
    osc.connect(g);
    g.connect(dest);
    osc.start(t);
    osc.stop(t + 5.0);
  });
}

// ── public factory ────────────────────────────────────────────────────────────
export function createRainbowAudio(ctx: AudioContext): RainbowAudio {
  const master = buildMasterChain(ctx);

  // Fade in
  master.gain.setValueAtTime(0, ctx.currentTime);
  master.gain.linearRampToValueAtTime(0.72, ctx.currentTime + 1.5);

  const droneOscs = buildDrone(ctx, master);
  const warmth = buildWarmthShimmer(ctx, master);

  function playFanfare(colorIdx: number): void {
    playFanfareNow(ctx, master, colorIdx);
  }

  function playRainbowSong(onBeat: (idx: number) => void): void {
    playRainbowSongNow(ctx, master, onBeat);
  }

  function setWarmth(value: number): void {
    const clamped = Math.max(0, Math.min(1, value));
    const now = ctx.currentTime;
    warmth.gain.gain.setTargetAtTime(clamped * 0.55, now, 0.12);
  }

  function teardown(): void {
    for (const osc of droneOscs) {
      try { osc.stop(); } catch { /* already stopped */ }
    }
    for (const osc of warmth.oscs) {
      try { osc.stop(); } catch { /* already stopped */ }
    }
    try { master.disconnect(); } catch { /* noop */ }
    ctx.close().catch(() => undefined);
  }

  return { ctx, playFanfare, playRainbowSong, setWarmth, teardown };
}
