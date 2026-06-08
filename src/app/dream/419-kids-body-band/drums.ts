// drums.ts — pure-percussion Web Audio synthesis for 419-kids-body-band.
//
// Every drum is synthesized from oscillators + noise; there is NO melody, NO
// chord, NO scale, NO tuning of pitched notes to a key. Toms/kicks use a pitch
// envelope purely as a percussive thump. Everything is summed through a
// brick-wall DynamicsCompressor + master gain so it can never blast small ears.
//
// Self-contained: copy of the primitives this prototype needs, no shared imports.

export type DrumKind = "kick" | "snare" | "hat" | "tom" | "crash";

export interface DrumKit {
  ctx: AudioContext;
  master: GainNode;
  limiter: DynamicsCompressorNode;
  noiseBuffer: AudioBuffer;
}

// ── White-noise buffer (reused by snare / hat / crash) ───────────────────────
function makeNoiseBuffer(ctx: AudioContext, seconds: number): AudioBuffer {
  const len = Math.floor(ctx.sampleRate * seconds);
  const buf = ctx.createBuffer(1, len, ctx.sampleRate);
  const data = buf.getChannelData(0);
  for (let i = 0; i < len; i++) data[i] = Math.random() * 2 - 1;
  return buf;
}

// ── Build the kit: master chain = [sum] → limiter → master gain → destination ─
export function buildKit(): DrumKit {
  const CtxCtor =
    window.AudioContext ??
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    ((window as any).webkitAudioContext as typeof AudioContext);
  const ctx = new CtxCtor();

  // Brick-wall limiter so peaks can never spike loud into little ears.
  const limiter = ctx.createDynamicsCompressor();
  limiter.threshold.value = -6;
  limiter.knee.value = 0;
  limiter.ratio.value = 12;
  limiter.attack.value = 0.002;
  limiter.release.value = 0.12;

  const master = ctx.createGain();
  master.gain.value = 0.55; // overall soft ceiling

  limiter.connect(master);
  master.connect(ctx.destination);

  const noiseBuffer = makeNoiseBuffer(ctx, 2.0);

  return { ctx, master, limiter, noiseBuffer };
}

// A short-lived noise source node (one-shot).
function noiseSource(kit: DrumKit): AudioBufferSourceNode {
  const src = kit.ctx.createBufferSource();
  src.buffer = kit.noiseBuffer;
  return src;
}

// ── KICK: pitch-enveloped sine + tiny click ──────────────────────────────────
function playKick(kit: DrumKit, t: number, vel: number): void {
  const { ctx, limiter } = kit;
  const osc = ctx.createOscillator();
  osc.type = "sine";
  osc.frequency.setValueAtTime(150, t);
  osc.frequency.exponentialRampToValueAtTime(45, t + 0.12);

  const g = ctx.createGain();
  const peak = 0.9 * vel;
  g.gain.setValueAtTime(peak, t);
  g.gain.exponentialRampToValueAtTime(0.0008, t + 0.34);

  osc.connect(g);
  g.connect(limiter);
  osc.start(t);
  osc.stop(t + 0.36);

  // Click transient
  const click = noiseSource(kit);
  const hp = ctx.createBiquadFilter();
  hp.type = "highpass";
  hp.frequency.value = 1400;
  const cg = ctx.createGain();
  cg.gain.setValueAtTime(0.4 * vel, t);
  cg.gain.exponentialRampToValueAtTime(0.001, t + 0.03);
  click.connect(hp);
  hp.connect(cg);
  cg.connect(limiter);
  click.start(t);
  click.stop(t + 0.04);
}

// ── SNARE / CLAP: bandpassed noise burst + a tonal body ──────────────────────
function playSnare(kit: DrumKit, t: number, vel: number): void {
  const { ctx, limiter } = kit;
  const noise = noiseSource(kit);
  const bp = ctx.createBiquadFilter();
  bp.type = "bandpass";
  bp.frequency.value = 1800;
  bp.Q.value = 0.7;

  const ng = ctx.createGain();
  ng.gain.setValueAtTime(0.85 * vel, t);
  ng.gain.exponentialRampToValueAtTime(0.001, t + 0.18);

  noise.connect(bp);
  bp.connect(ng);
  ng.connect(limiter);
  noise.start(t);
  noise.stop(t + 0.2);

  // Short tonal body (not a tuned note — just a snare thwack tone)
  const body = ctx.createOscillator();
  body.type = "triangle";
  body.frequency.setValueAtTime(220, t);
  body.frequency.exponentialRampToValueAtTime(170, t + 0.1);
  const bg = ctx.createGain();
  bg.gain.setValueAtTime(0.3 * vel, t);
  bg.gain.exponentialRampToValueAtTime(0.001, t + 0.12);
  body.connect(bg);
  bg.connect(limiter);
  body.start(t);
  body.stop(t + 0.14);
}

// ── HI-HAT: high-passed short noise ──────────────────────────────────────────
function playHat(kit: DrumKit, t: number, vel: number, open: boolean): void {
  const { ctx, limiter } = kit;
  const noise = noiseSource(kit);
  const hp = ctx.createBiquadFilter();
  hp.type = "highpass";
  hp.frequency.value = 8000;

  const g = ctx.createGain();
  const decay = open ? 0.18 : 0.045;
  g.gain.setValueAtTime(0.4 * vel, t);
  g.gain.exponentialRampToValueAtTime(0.0006, t + decay);

  noise.connect(hp);
  hp.connect(g);
  g.connect(limiter);
  noise.start(t);
  noise.stop(t + decay + 0.02);
}

// ── TOM: pitch-enveloped sine (percussive, not a tuned note) ─────────────────
function playTom(kit: DrumKit, t: number, vel: number): void {
  const { ctx, limiter } = kit;
  const osc = ctx.createOscillator();
  osc.type = "sine";
  osc.frequency.setValueAtTime(260, t);
  osc.frequency.exponentialRampToValueAtTime(120, t + 0.2);

  const g = ctx.createGain();
  g.gain.setValueAtTime(0.8 * vel, t);
  g.gain.exponentialRampToValueAtTime(0.001, t + 0.3);

  osc.connect(g);
  g.connect(limiter);
  osc.start(t);
  osc.stop(t + 0.32);
}

// ── CRASH: long bright noise through a bandpass ──────────────────────────────
function playCrash(kit: DrumKit, t: number, vel: number): void {
  const { ctx, limiter } = kit;
  const noise = noiseSource(kit);
  const bp = ctx.createBiquadFilter();
  bp.type = "bandpass";
  bp.frequency.value = 6000;
  bp.Q.value = 0.4;
  const hp = ctx.createBiquadFilter();
  hp.type = "highpass";
  hp.frequency.value = 3500;

  const g = ctx.createGain();
  g.gain.setValueAtTime(0.55 * vel, t);
  g.gain.exponentialRampToValueAtTime(0.0006, t + 1.1);

  noise.connect(bp);
  bp.connect(hp);
  hp.connect(g);
  g.connect(limiter);
  noise.start(t);
  noise.stop(t + 1.15);
}

// ── Dispatch ──────────────────────────────────────────────────────────────────
export function playDrum(
  kit: DrumKit,
  kind: DrumKind,
  when: number,
  velocity: number,
): void {
  const t = Math.max(when, kit.ctx.currentTime);
  const v = Math.max(0.15, Math.min(1, velocity));
  switch (kind) {
    case "kick":
      playKick(kit, t, v);
      break;
    case "snare":
      playSnare(kit, t, v);
      break;
    case "hat":
      playHat(kit, t, v, false);
      break;
    case "tom":
      playTom(kit, t, v);
      break;
    case "crash":
      playCrash(kit, t, v);
      break;
  }
}

// Open-hat variant exposed for the always-on groove pulse.
export function playHatTick(kit: DrumKit, when: number, velocity: number, open: boolean): void {
  const t = Math.max(when, kit.ctx.currentTime);
  playHat(kit, t, Math.max(0.1, Math.min(1, velocity)), open);
}
