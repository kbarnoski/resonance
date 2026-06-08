// audio.ts — pure-percussion Web Audio synthesis for 423-kids-face-beat.
//
// Five drum voices synthesized from oscillators + shaped noise:
//   kick  = pitch-enveloped sine (150→45 Hz) + click transient
//   hat   = high-passed noise burst (> 8 kHz)
//   shaker/clap = filtered noise (2-pass bandpass, double-layered)
//   tom   = lower pitch-enveloped sine (100→55 Hz)
//   rim   = short bandpassed click (800–2 kHz burst)
//
// ALL voices are percussion only — no pitched melody, no scale, no chords.
// Tonic envelopes are purely for percussive thump character.
//
// Summed through: voices → brick-wall DynamicsCompressor (-8 dB threshold,
// ratio 12) → master GainNode → destination. Volume can NEVER spike.
//
// Look-ahead scheduler: 25 ms setInterval polls; schedules up to 100 ms ahead
// of audioCtx.currentTime (Chris Wilson "A Tale of Two Clocks" pattern).
//
// Self-contained; no imports from other dream folders.

export type DrumKind = "kick" | "hat" | "shaker" | "tom" | "rim";

export interface DrumKit {
  ctx: AudioContext;
  master: GainNode;
  limiter: DynamicsCompressorNode;
  noiseBuf: AudioBuffer;
}

// ── Noise buffer (reused across all noise-based voices) ──────────────────────

function makeNoiseBuf(ctx: AudioContext, secs: number): AudioBuffer {
  const len = Math.floor(ctx.sampleRate * secs);
  const buf = ctx.createBuffer(1, len, ctx.sampleRate);
  const d = buf.getChannelData(0);
  for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
  return buf;
}

function noiseSource(kit: DrumKit): AudioBufferSourceNode {
  const src = kit.ctx.createBufferSource();
  src.buffer = kit.noiseBuf;
  return src;
}

// ── Build the kit — MUST be called inside a user-gesture handler ─────────────

export function buildKit(): DrumKit {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const CtxCtor = window.AudioContext ?? (window as any).webkitAudioContext as typeof AudioContext;
  const ctx = new CtxCtor();

  // Brick-wall limiter — threshold -8 dB, ratio 12:1, near-zero attack.
  const limiter = ctx.createDynamicsCompressor();
  limiter.threshold.value = -8;
  limiter.knee.value = 0;
  limiter.ratio.value = 12;
  limiter.attack.value = 0.001;
  limiter.release.value = 0.1;

  const master = ctx.createGain();
  master.gain.value = 0.6;

  limiter.connect(master);
  master.connect(ctx.destination);

  const noiseBuf = makeNoiseBuf(ctx, 2.0);

  return { ctx, master, limiter, noiseBuf };
}

// ── Individual voice synthesizers ─────────────────────────────────────────────

function playKick(kit: DrumKit, t: number, vel: number): void {
  const { ctx, limiter } = kit;
  // Pitch-enveloped sine: 150 → 45 Hz in 120 ms
  const osc = ctx.createOscillator();
  osc.type = "sine";
  osc.frequency.setValueAtTime(150, t);
  osc.frequency.exponentialRampToValueAtTime(45, t + 0.12);

  const g = ctx.createGain();
  g.gain.setValueAtTime(0.9 * vel, t);
  g.gain.exponentialRampToValueAtTime(0.001, t + 0.35);
  osc.connect(g);
  g.connect(limiter);
  osc.start(t);
  osc.stop(t + 0.38);

  // Click transient (very short highpassed noise burst)
  const click = noiseSource(kit);
  const hp = ctx.createBiquadFilter();
  hp.type = "highpass";
  hp.frequency.value = 1400;
  const cg = ctx.createGain();
  cg.gain.setValueAtTime(0.45 * vel, t);
  cg.gain.exponentialRampToValueAtTime(0.001, t + 0.028);
  click.connect(hp);
  hp.connect(cg);
  cg.connect(limiter);
  click.start(t);
  click.stop(t + 0.035);
}

function playHat(kit: DrumKit, t: number, vel: number, open?: boolean): void {
  const { ctx, limiter } = kit;
  const decay = open ? 0.16 : 0.04;
  const noise = noiseSource(kit);
  const hp = ctx.createBiquadFilter();
  hp.type = "highpass";
  hp.frequency.value = 8000;
  const g = ctx.createGain();
  g.gain.setValueAtTime(0.38 * vel, t);
  g.gain.exponentialRampToValueAtTime(0.0005, t + decay);
  noise.connect(hp);
  hp.connect(g);
  g.connect(limiter);
  noise.start(t);
  noise.stop(t + decay + 0.01);
}

function playShaker(kit: DrumKit, t: number, vel: number): void {
  const { ctx, limiter } = kit;
  // Double bandpass layer (clap character: two noise bursts ~22 ms apart)
  [0, 0.022].forEach((offset) => {
    const noise = noiseSource(kit);
    const bp1 = ctx.createBiquadFilter();
    bp1.type = "bandpass";
    bp1.frequency.value = 1100;
    bp1.Q.value = 0.6;
    const bp2 = ctx.createBiquadFilter();
    bp2.type = "bandpass";
    bp2.frequency.value = 3200;
    bp2.Q.value = 0.5;
    const g = ctx.createGain();
    const ta = t + offset;
    g.gain.setValueAtTime(0.6 * vel, ta);
    g.gain.exponentialRampToValueAtTime(0.001, ta + 0.14);
    noise.connect(bp1);
    bp1.connect(bp2);
    bp2.connect(g);
    g.connect(limiter);
    noise.start(ta);
    noise.stop(ta + 0.16);
  });

  // Bright shaker shimmer on top
  const shimmer = noiseSource(kit);
  const shimHp = ctx.createBiquadFilter();
  shimHp.type = "highpass";
  shimHp.frequency.value = 6000;
  const shimG = ctx.createGain();
  shimG.gain.setValueAtTime(0.25 * vel, t);
  shimG.gain.exponentialRampToValueAtTime(0.001, t + 0.06);
  shimmer.connect(shimHp);
  shimHp.connect(shimG);
  shimG.connect(limiter);
  shimmer.start(t);
  shimmer.stop(t + 0.07);
}

function playTom(kit: DrumKit, t: number, vel: number): void {
  const { ctx, limiter } = kit;
  // Lower pitch envelope: 100 → 55 Hz (softer/deeper than kick)
  const osc = ctx.createOscillator();
  osc.type = "sine";
  osc.frequency.setValueAtTime(100, t);
  osc.frequency.exponentialRampToValueAtTime(55, t + 0.18);

  const g = ctx.createGain();
  g.gain.setValueAtTime(0.75 * vel, t);
  g.gain.exponentialRampToValueAtTime(0.001, t + 0.32);
  osc.connect(g);
  g.connect(limiter);
  osc.start(t);
  osc.stop(t + 0.35);
}

function playRim(kit: DrumKit, t: number, vel: number): void {
  const { ctx, limiter } = kit;
  // Short bandpassed noise "tick" — mimics rimshot or woodblock
  const noise = noiseSource(kit);
  const bp = ctx.createBiquadFilter();
  bp.type = "bandpass";
  bp.frequency.value = 900;
  bp.Q.value = 2.5;
  const hp = ctx.createBiquadFilter();
  hp.type = "highpass";
  hp.frequency.value = 500;
  const g = ctx.createGain();
  g.gain.setValueAtTime(0.55 * vel, t);
  g.gain.exponentialRampToValueAtTime(0.001, t + 0.06);
  noise.connect(bp);
  bp.connect(hp);
  hp.connect(g);
  g.connect(limiter);
  noise.start(t);
  noise.stop(t + 0.07);
}

// ── Public dispatch ───────────────────────────────────────────────────────────

export function playDrum(
  kit: DrumKit,
  kind: DrumKind,
  when: number,
  velocity: number,
): void {
  const t = Math.max(when, kit.ctx.currentTime);
  const v = Math.max(0.1, Math.min(1, velocity));
  switch (kind) {
    case "kick":    playKick(kit, t, v);    break;
    case "hat":     playHat(kit, t, v);     break;
    case "shaker":  playShaker(kit, t, v);  break;
    case "tom":     playTom(kit, t, v);     break;
    case "rim":     playRim(kit, t, v);     break;
  }
}

// Open-hat variant for the always-on groove pulse
export function playHatTick(
  kit: DrumKit,
  when: number,
  velocity: number,
  open: boolean,
): void {
  const t = Math.max(when, kit.ctx.currentTime);
  playHat(kit, t, Math.max(0.08, Math.min(1, velocity)), open);
}

// ── Look-ahead groove scheduler ───────────────────────────────────────────────

export const BPM = 100;
const SEC_PER_BEAT = 60 / BPM;
export const SEC_PER_STEP = SEC_PER_BEAT / 4; // 16th notes
const LOOKAHEAD_MS = 25;
const SCHEDULE_AHEAD = 0.1; // seconds

interface PendingHit {
  kind: DrumKind;
  velocity: number;
}

export interface GrooveCallbacks {
  onHit?: (kind: DrumKind, step: number) => void;
}

export class Groove {
  private kit: DrumKit;
  private nextStepTime = 0;
  private step = 0;
  private timer: ReturnType<typeof setInterval> | null = null;
  private pending: PendingHit[] = [];
  private cb: GrooveCallbacks;

  // Energy 0..1 — raised by face activity to fill the backbone pulse
  energy = 0;

  constructor(kit: DrumKit, cb: GrooveCallbacks = {}) {
    this.kit = kit;
    this.cb = cb;
    this.nextStepTime = kit.ctx.currentTime + 0.05;
  }

  start(): void {
    if (this.timer) return;
    this.nextStepTime = this.kit.ctx.currentTime + 0.05;
    this.timer = setInterval(() => this.tick(), LOOKAHEAD_MS);
  }

  stop(): void {
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
    }
  }

  // Queue a gesture hit — dedupes per kind, keeps loudest
  trigger(kind: DrumKind, velocity: number): void {
    const existing = this.pending.find((p) => p.kind === kind);
    if (existing) {
      existing.velocity = Math.max(existing.velocity, velocity);
    } else {
      this.pending.push({ kind, velocity });
    }
  }

  private tick(): void {
    const ctx = this.kit.ctx;
    while (this.nextStepTime < ctx.currentTime + SCHEDULE_AHEAD) {
      this.scheduleStep(this.step, this.nextStepTime);
      this.nextStepTime += SEC_PER_STEP;
      this.step = (this.step + 1) % 16;
    }
  }

  private scheduleStep(step: number, time: number): void {
    const kit = this.kit;
    const e = this.energy;

    // Always-on backbone: quiet hat pulse + kick/hat accents
    // Beat 1 (step 0): kick + hat accent
    if (step === 0) {
      playDrum(kit, "kick", time, 0.45 + 0.3 * e);
      this.cb.onHit?.("kick", step);
    }
    // Beat 3 (step 8): quiet tom tap
    if (step === 8 && e > 0.1) {
      playDrum(kit, "tom", time, 0.25 + 0.25 * e);
      this.cb.onHit?.("tom", step);
    }
    // Hat on every quarter note, 8ths when energetic, 16ths when very energetic
    const onBeat = step % 4 === 0;
    const onEighth = step % 2 === 0;
    if (onBeat) {
      playHatTick(kit, time, 0.28 + 0.18 * e, false);
    } else if (onEighth && e > 0.2) {
      playHatTick(kit, time, 0.15 + 0.15 * e, false);
    } else if (e > 0.6 && step % 2 === 1) {
      playHatTick(kit, time, 0.1 + 0.1 * e, false);
    }

    // Quantized gesture hits land on this slot
    if (this.pending.length > 0) {
      const hits = this.pending.splice(0);
      for (const h of hits) {
        playDrum(kit, h.kind, time, h.velocity);
        this.cb.onHit?.(h.kind, step);
      }
    }
  }
}
