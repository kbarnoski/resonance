// ─────────────────────────────────────────────────────────────────────────────
// audio.ts — the warm speech-melody voice.
//
// A small Web Audio engine that "sings" a compiled SpeechMelody:
//   • vowels  → a warm voice = sine + slightly-detuned triangle through a
//               lowpass with an ADSR amplitude envelope (click-free).
//   • consonants → short filtered-noise / click percussion.
//   • a soft, always-on drone underneath the whole phrase.
//   • a shared feedback delay + a procedural (impulse-response) reverb.
//   • master bus → brick-wall DynamicsCompressor → destination.
//
// The AudioContext is created lazily, inside the first user gesture (iOS-safe).
// ─────────────────────────────────────────────────────────────────────────────

import type { SpeechMelody, SyllableNote, PercClass } from "./text-music";

export interface VoiceState {
  // live values the visual layer can read each frame
  level: number; // 0..1 current vowel loudness (smoothed)
  height: number; // 0..1 current pitch-height
  bright: number; // 0..1 current timbre brightness
}

interface Engine {
  ctx: AudioContext;
  master: GainNode;
  comp: DynamicsCompressorNode;
  delay: DelayNode;
  delayGain: GainNode;
  reverb: ConvolverNode;
  reverbGain: GainNode;
  drone: { stop: () => void };
  state: VoiceState;
}

let engine: Engine | null = null;

// ── procedural reverb impulse response ────────────────────────────────────────
function buildImpulse(ctx: AudioContext, seconds: number, decay: number): AudioBuffer {
  const rate = ctx.sampleRate;
  const len = Math.max(1, Math.floor(seconds * rate));
  const buf = ctx.createBuffer(2, len, rate);
  for (let ch = 0; ch < 2; ch++) {
    const data = buf.getChannelData(ch);
    for (let i = 0; i < len; i++) {
      const t = i / len;
      // early-ish diffuse noise tail
      data[i] = (Math.random() * 2 - 1) * Math.pow(1 - t, decay);
    }
  }
  return buf;
}

// ── always-on soft drone (root + fifth) ───────────────────────────────────────
function runDrone(ctx: AudioContext, out: AudioNode): { stop: () => void } {
  const now = ctx.currentTime;
  const oscs: OscillatorNode[] = [];
  const g = ctx.createGain();
  g.gain.setValueAtTime(0, now);
  g.gain.linearRampToValueAtTime(0.05, now + 2.5);

  const lp = ctx.createBiquadFilter();
  lp.type = "lowpass";
  lp.frequency.value = 420;
  g.connect(lp).connect(out);

  // D2 root + A2 fifth, both very quiet, slightly detuned for warmth
  const freqs = [73.416, 110.0];
  for (const f of freqs) {
    for (const det of [-3, 3]) {
      const o = ctx.createOscillator();
      o.type = "sine";
      o.frequency.value = f;
      o.detune.value = det;
      const og = ctx.createGain();
      og.gain.value = 0.5;
      o.connect(og).connect(g);
      o.start(now);
      oscs.push(o);
    }
  }
  // gentle breathing LFO on the filter
  const lfo = ctx.createOscillator();
  lfo.frequency.value = 0.07;
  const lfoG = ctx.createGain();
  lfoG.gain.value = 120;
  lfo.connect(lfoG).connect(lp.frequency);
  lfo.start(now);

  return {
    stop: () => {
      const t = ctx.currentTime;
      g.gain.cancelScheduledValues(t);
      g.gain.setValueAtTime(g.gain.value, t);
      g.gain.linearRampToValueAtTime(0, t + 0.6);
      oscs.forEach((o) => o.stop(t + 0.7));
      lfo.stop(t + 0.7);
    },
  };
}

// ── engine lifecycle ──────────────────────────────────────────────────────────

// Must be called inside a user gesture. Returns the live engine (creating it
// once). Resumes the context if suspended.
export async function ensureEngine(): Promise<Engine> {
  if (engine) {
    if (engine.ctx.state === "suspended") await engine.ctx.resume();
    return engine;
  }
  const Ctx =
    window.AudioContext ||
    (window as unknown as { webkitAudioContext: typeof AudioContext })
      .webkitAudioContext;
  const ctx = new Ctx();

  const comp = ctx.createDynamicsCompressor();
  comp.threshold.value = -6;
  comp.knee.value = 4;
  comp.ratio.value = 20; // brick-wall-ish limiter
  comp.attack.value = 0.003;
  comp.release.value = 0.18;
  comp.connect(ctx.destination);

  const master = ctx.createGain();
  master.gain.value = 0.85;
  master.connect(comp);

  // feedback delay
  const delay = ctx.createDelay(1.0);
  delay.delayTime.value = 0.28;
  const delayGain = ctx.createGain();
  delayGain.gain.value = 0.32;
  const delayWet = ctx.createGain();
  delayWet.gain.value = 0.5;
  delay.connect(delayGain);
  delayGain.connect(delay); // feedback loop
  delay.connect(delayWet).connect(master);

  // procedural reverb
  const reverb = ctx.createConvolver();
  reverb.buffer = buildImpulse(ctx, 2.6, 3.0);
  const reverbGain = ctx.createGain();
  reverbGain.gain.value = 0.4;
  reverb.connect(reverbGain).connect(master);

  const drone = runDrone(ctx, master);

  engine = {
    ctx,
    master,
    comp,
    delay,
    delayGain,
    reverb,
    reverbGain,
    drone,
    state: { level: 0, height: 0.5, bright: 0.5 },
  };
  if (ctx.state === "suspended") await ctx.resume();
  return engine;
}

export function getState(): VoiceState | null {
  return engine ? engine.state : null;
}

// route a per-note source into master + the shared sends
function connectSends(eng: Engine, src: AudioNode) {
  src.connect(eng.master);
  src.connect(eng.delay);
  src.connect(eng.reverb);
}

// ── one vowel note ────────────────────────────────────────────────────────────
function runVowel(eng: Engine, n: SyllableNote, when: number) {
  const ctx = eng.ctx;
  const peak = 0.16 + n.accent * 0.14;

  // amp ADSR
  const amp = ctx.createGain();
  amp.gain.setValueAtTime(0.0001, when);
  const atk = 0.02;
  const dec = 0.08;
  const sus = peak * 0.7;
  const rel = 0.14;
  amp.gain.linearRampToValueAtTime(peak, when + atk);
  amp.gain.linearRampToValueAtTime(sus, when + atk + dec);
  const holdEnd = when + Math.max(n.dur, atk + dec + 0.02);
  amp.gain.setValueAtTime(sus, holdEnd);
  amp.gain.exponentialRampToValueAtTime(0.0001, holdEnd + rel);

  // lowpass tracks brightness
  const lp = ctx.createBiquadFilter();
  lp.type = "lowpass";
  const cutoff = 600 + n.bright * 3200 + n.accent * 800;
  lp.frequency.setValueAtTime(cutoff, when);
  lp.Q.value = 0.7;

  // sine fundamental + detuned triangle
  const o1 = ctx.createOscillator();
  o1.type = "sine";
  o1.frequency.value = n.freq;
  const o2 = ctx.createOscillator();
  o2.type = "triangle";
  o2.frequency.value = n.freq;
  o2.detune.value = 6;
  const o2g = ctx.createGain();
  o2g.gain.value = 0.45;

  o1.connect(lp);
  o2.connect(o2g).connect(lp);
  lp.connect(amp);
  connectSends(eng, amp);

  o1.start(when);
  o2.start(when);
  o1.stop(holdEnd + rel + 0.05);
  o2.stop(holdEnd + rel + 0.05);
}

// ── one consonant percussion hit ─────────────────────────────────────────────
let noiseBuf: AudioBuffer | null = null;
function getNoise(ctx: AudioContext): AudioBuffer {
  if (noiseBuf && noiseBuf.sampleRate === ctx.sampleRate) return noiseBuf;
  const len = Math.floor(ctx.sampleRate * 0.3);
  const b = ctx.createBuffer(1, len, ctx.sampleRate);
  const d = b.getChannelData(0);
  for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
  noiseBuf = b;
  return b;
}

function runPerc(eng: Engine, p: PercClass, when: number, gain: number) {
  const ctx = eng.ctx;
  const src = ctx.createBufferSource();
  src.buffer = getNoise(ctx);

  const bp = ctx.createBiquadFilter();
  bp.type = p.voice === "thud" ? "lowpass" : "bandpass";
  bp.frequency.value = p.tone;
  bp.Q.value = p.voice === "ring" ? 6 : 1.2;

  const g = ctx.createGain();
  const peak = gain * (p.voice === "hiss" ? 0.09 : 0.13);
  g.gain.setValueAtTime(0.0001, when);
  g.gain.linearRampToValueAtTime(peak, when + 0.004);
  g.gain.exponentialRampToValueAtTime(0.0001, when + p.decay);

  src.connect(bp).connect(g);
  connectSends(eng, g);
  src.start(when);
  src.stop(when + p.decay + 0.05);
}

// ── schedule a whole melody ───────────────────────────────────────────────────
// Returns the audio start time (ctx.currentTime base) so the visual playhead can
// align. The caller updates eng.state each frame from the visual loop.
export function runMelody(eng: Engine, mel: SpeechMelody): number {
  const start = eng.ctx.currentTime + 0.12;
  for (const n of mel.notes) {
    const when = start + n.onset;
    if (n.onsetPerc) runPerc(eng, n.onsetPerc, when - 0.012, 0.7 + n.accent * 0.5);
    runVowel(eng, n, when);
    if (n.codaPerc) runPerc(eng, n.codaPerc, when + n.dur - 0.02, 0.6);
  }
  return start;
}

// Smoothly push the live state toward the active note (called from rAF).
export function applyState(target: { level: number; height: number; bright: number }) {
  if (!engine) return;
  const s = engine.state;
  const k = 0.18;
  s.level += (target.level - s.level) * k;
  s.height += (target.height - s.height) * k;
  s.bright += (target.bright - s.bright) * k;
}

// Full teardown — stop drone, close context.
export function disposeEngine() {
  if (!engine) return;
  try {
    engine.drone.stop();
  } catch {
    /* noop */
  }
  const e = engine;
  engine = null;
  setTimeout(() => {
    e.ctx.close().catch(() => {
      /* noop */
    });
  }, 800);
}
