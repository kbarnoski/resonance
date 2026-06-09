/**
 * audio.ts — Impulse + Resonator Foley Engine
 *
 * Every brush has a distinct foley character built from:
 *   1. A short noise excitation (white/pink burst, click, or sweep)
 *   2. One or more band-pass / resonant filters giving the material timbre
 *   3. Inharmonic, heavily-damped resonances → NO pitched note emerges
 *   4. Per-voice randomization so repeated hits never form a melody
 *
 * All voices feed → DynamicsCompressor → master gain (very low) → output.
 * A per-brush cooldown prevents machine-gun blasts on rapid drag.
 */

export type BrushId = 'crunch' | 'pop' | 'tap' | 'scratch' | 'splash';

interface AudioState {
  ctx: AudioContext;
  master: GainNode;
  limiter: DynamicsCompressorNode;
  ambientSource: AudioBufferSourceNode | null;
  cooldowns: Record<BrushId, number>; // last-fired timestamp (performance.now)
}

// Minimum ms between foley events per brush (per pointer — shared across all)
const COOLDOWN_MS: Record<BrushId, number> = {
  crunch: 55,
  pop:    80,
  tap:    70,
  scratch: 45,
  splash: 90,
};

const MASTER_GAIN = 0.22;   // low — can never blast small ears
const AMBIENT_GAIN = 0.018; // very quiet airy wash

// --- HELPER: create white-noise AudioBuffer ---
function makeNoiseBuffer(ctx: AudioContext, durationSec: number, channels = 1): AudioBuffer {
  const rate = ctx.sampleRate;
  const len = Math.ceil(rate * durationSec);
  const buf = ctx.createBuffer(channels, len, rate);
  for (let c = 0; c < channels; c++) {
    const d = buf.getChannelData(c);
    for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
  }
  return buf;
}

// --- AMBIENT: soft airy textural noise wash (NOT a pitched pad) ---
function startAmbient(state: AudioState): void {
  const { ctx, limiter } = state;
  const buf = makeNoiseBuffer(ctx, 2.0);

  const src = ctx.createBufferSource();
  src.buffer = buf;
  src.loop = true;

  // Light bandpass centred ~400 Hz, wide Q → airy, toneless
  const bp1 = ctx.createBiquadFilter();
  bp1.type = 'bandpass';
  bp1.frequency.value = 380 + Math.random() * 80;
  bp1.Q.value = 0.4;

  const bp2 = ctx.createBiquadFilter();
  bp2.type = 'bandpass';
  bp2.frequency.value = 120 + Math.random() * 60;
  bp2.Q.value = 0.3;

  const g = ctx.createGain();
  g.gain.value = AMBIENT_GAIN;

  src.connect(bp1);
  bp1.connect(bp2);
  bp2.connect(g);
  g.connect(limiter);
  src.start();

  state.ambientSource = src;
}

// ============================================================
// BRUSH FOLEY SYNTHESISERS
// ============================================================

/** CRUNCH — cluster of randomised noise-burst crackles, spiky */
function fireCrunch(ctx: AudioContext, limiter: DynamicsCompressorNode): void {
  const t0 = ctx.currentTime;
  const clusterCount = 4 + Math.floor(Math.random() * 4);
  for (let i = 0; i < clusterCount; i++) {
    const delay = i * (0.006 + Math.random() * 0.009);
    const t = t0 + delay;

    // Noise burst (very short)
    const noiseBuf = makeNoiseBuffer(ctx, 0.03);
    const src = ctx.createBufferSource();
    src.buffer = noiseBuf;

    // Bandpass to give gravel-ish crunch character
    const bp = ctx.createBiquadFilter();
    bp.type = 'bandpass';
    // Inharmonic, randomised centre — avoids spelling a note
    bp.frequency.value = 1800 + Math.random() * 2400;
    bp.Q.value = 3 + Math.random() * 5;

    // HP to keep it crunchy, not bassy
    const hp = ctx.createBiquadFilter();
    hp.type = 'highpass';
    hp.frequency.value = 800 + Math.random() * 600;

    const g = ctx.createGain();
    g.gain.setValueAtTime(0, t);
    g.gain.linearRampToValueAtTime(0.45 + Math.random() * 0.25, t + 0.003);
    g.gain.exponentialRampToValueAtTime(0.001, t + 0.025);

    src.connect(hp);
    hp.connect(bp);
    bp.connect(g);
    g.connect(limiter);
    src.start(t);
    src.stop(t + 0.04);
  }
}

/** POP / BUBBLE — band-passed noise blip, fast pitch-less envelope, round */
function firePop(ctx: AudioContext, limiter: DynamicsCompressorNode): void {
  const t = ctx.currentTime;
  const dur = 0.055 + Math.random() * 0.035;

  const noiseBuf = makeNoiseBuffer(ctx, dur + 0.02);
  const src = ctx.createBufferSource();
  src.buffer = noiseBuf;

  // Narrow bandpass — NOT a note, just timbral character
  const bp = ctx.createBiquadFilter();
  bp.type = 'bandpass';
  // Randomise across a wide inharmonic range
  bp.frequency.value = 300 + Math.random() * 900;
  bp.Q.value = 6 + Math.random() * 8;

  // LP to round it off (bouba character)
  const lp = ctx.createBiquadFilter();
  lp.type = 'lowpass';
  lp.frequency.value = 1200 + Math.random() * 600;

  const g = ctx.createGain();
  g.gain.setValueAtTime(0, t);
  g.gain.linearRampToValueAtTime(0.5, t + 0.008);
  g.gain.exponentialRampToValueAtTime(0.001, t + dur);

  src.connect(bp);
  bp.connect(lp);
  lp.connect(g);
  g.connect(limiter);
  src.start(t);
  src.stop(t + dur + 0.01);
}

/** TAP / WOOD — click through short damped resonance, dry knock */
function fireTap(ctx: AudioContext, limiter: DynamicsCompressorNode): void {
  const t = ctx.currentTime;

  // Very short click excitation
  const clickDur = 0.004;
  const clickBuf = makeNoiseBuffer(ctx, clickDur);
  const click = ctx.createBufferSource();
  click.buffer = clickBuf;

  // Short damped resonator — inharmonic frequencies, never a note
  // Use two BPs with slightly offset centres (neither harmonic)
  const bp1 = ctx.createBiquadFilter();
  bp1.type = 'bandpass';
  bp1.frequency.value = 1300 + Math.random() * 800;
  bp1.Q.value = 12 + Math.random() * 8;

  const bp2 = ctx.createBiquadFilter();
  bp2.type = 'bandpass';
  bp2.frequency.value = 2700 + Math.random() * 1100;
  bp2.Q.value = 8 + Math.random() * 6;

  const g1 = ctx.createGain();
  g1.gain.setValueAtTime(0.55, t);
  g1.gain.exponentialRampToValueAtTime(0.001, t + 0.06);

  const g2 = ctx.createGain();
  g2.gain.setValueAtTime(0.3, t);
  g2.gain.exponentialRampToValueAtTime(0.001, t + 0.045);

  const mix = ctx.createGain();
  mix.gain.value = 1;

  click.connect(bp1); bp1.connect(g1); g1.connect(mix);
  click.connect(bp2); bp2.connect(g2); g2.connect(mix);
  mix.connect(limiter);
  click.start(t);
  click.stop(t + 0.08);
}

/** SCRATCH — short noisy friction sweep, high-frequency rasp */
function fireScratch(ctx: AudioContext, limiter: DynamicsCompressorNode): void {
  const t = ctx.currentTime;
  const dur = 0.04 + Math.random() * 0.05;

  const noiseBuf = makeNoiseBuffer(ctx, dur + 0.01);
  const src = ctx.createBufferSource();
  src.buffer = noiseBuf;

  // HP → raspy, kiki character
  const hp = ctx.createBiquadFilter();
  hp.type = 'highpass';
  hp.frequency.value = 3000 + Math.random() * 2000;

  // Narrow notch-like BP for scratch timbre
  const bp = ctx.createBiquadFilter();
  bp.type = 'bandpass';
  bp.frequency.value = 4000 + Math.random() * 3000;
  bp.Q.value = 2 + Math.random() * 3;

  const g = ctx.createGain();
  g.gain.setValueAtTime(0, t);
  g.gain.linearRampToValueAtTime(0.45 + Math.random() * 0.2, t + 0.005);
  g.gain.setValueAtTime(0.4, t + dur * 0.6);
  g.gain.exponentialRampToValueAtTime(0.001, t + dur);

  src.connect(hp);
  hp.connect(bp);
  bp.connect(g);
  g.connect(limiter);
  src.start(t);
  src.stop(t + dur + 0.01);
}

/** SPLASH / DRIP — noise burst + quick filtered drip decay */
function fireSplash(ctx: AudioContext, limiter: DynamicsCompressorNode): void {
  const t = ctx.currentTime;

  // Initial burst
  const burstBuf = makeNoiseBuffer(ctx, 0.02);
  const burst = ctx.createBufferSource();
  burst.buffer = burstBuf;

  const lpBurst = ctx.createBiquadFilter();
  lpBurst.type = 'lowpass';
  lpBurst.frequency.value = 2000 + Math.random() * 1000;

  const gBurst = ctx.createGain();
  gBurst.gain.setValueAtTime(0.5, t);
  gBurst.gain.exponentialRampToValueAtTime(0.001, t + 0.018);

  burst.connect(lpBurst); lpBurst.connect(gBurst); gBurst.connect(limiter);
  burst.start(t); burst.stop(t + 0.025);

  // Drip tail — slightly longer noise with descending LP sweep (not a pitch glide)
  const drip = makeNoiseBuffer(ctx, 0.12);
  const dripSrc = ctx.createBufferSource();
  dripSrc.buffer = drip;

  const lpDrip = ctx.createBiquadFilter();
  lpDrip.type = 'lowpass';
  lpDrip.frequency.setValueAtTime(1600 + Math.random() * 600, t);
  lpDrip.frequency.exponentialRampToValueAtTime(80 + Math.random() * 60, t + 0.10);
  // Use inharmonic Q to avoid modal pitch
  lpDrip.Q.value = 4 + Math.random() * 4;

  const gDrip = ctx.createGain();
  gDrip.gain.setValueAtTime(0.3, t + 0.005);
  gDrip.gain.exponentialRampToValueAtTime(0.001, t + 0.11);

  dripSrc.connect(lpDrip); lpDrip.connect(gDrip); gDrip.connect(limiter);
  dripSrc.start(t + 0.005);
  dripSrc.stop(t + 0.13);
}

// ============================================================
// PUBLIC API
// ============================================================

export function makeAudioState(): AudioState {
  const ctx = new AudioContext();
  const limiter = ctx.createDynamicsCompressor();
  limiter.threshold.value = -6;
  limiter.knee.value = 3;
  limiter.ratio.value = 20;
  limiter.attack.value = 0.001;
  limiter.release.value = 0.05;

  const master = ctx.createGain();
  master.gain.value = MASTER_GAIN;

  limiter.connect(master);
  master.connect(ctx.destination);

  const cooldowns: Record<BrushId, number> = {
    crunch: 0, pop: 0, tap: 0, scratch: 0, splash: 0,
  };

  return { ctx, master, limiter, ambientSource: null, cooldowns };
}

export function resumeAudio(state: AudioState): Promise<void> {
  return state.ctx.resume();
}

export function startAmbientBed(state: AudioState): void {
  if (state.ambientSource) return;
  startAmbient(state);
}

export function fireFoley(state: AudioState, brush: BrushId): void {
  const now = performance.now();
  if (now - state.cooldowns[brush] < COOLDOWN_MS[brush]) return;
  state.cooldowns[brush] = now;

  const { ctx, limiter } = state;
  switch (brush) {
    case 'crunch':  fireCrunch(ctx, limiter);  break;
    case 'pop':     firePop(ctx, limiter);     break;
    case 'tap':     fireTap(ctx, limiter);     break;
    case 'scratch': fireScratch(ctx, limiter); break;
    case 'splash':  fireSplash(ctx, limiter);  break;
  }
}

export function teardownAudio(state: AudioState): void {
  state.ambientSource?.stop();
  state.ctx.close();
}
