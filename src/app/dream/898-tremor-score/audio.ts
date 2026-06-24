// audio.ts — Web Audio graph for the tremor score.
// Per-event: OscillatorNode(s) + GainNode envelope -> lowpass BiquadFilter
//   -> StereoPanner -> master gain -> ConvolverNode (algorithmic IR)
//   -> DynamicsCompressor limiter -> destination.
// Warm and consonant. Data never maps to dissonance.

import type { ScoreEvent } from "./score";

export interface AudioRig {
  ctx: AudioContext;
  master: GainNode;
}

/** Build a short algorithmic impulse response for a warm room reverb. */
function buildImpulse(ctx: AudioContext, seconds = 2.4, decay = 3.2): AudioBuffer {
  const rate = ctx.sampleRate;
  const len = Math.floor(rate * seconds);
  const buf = ctx.createBuffer(2, len, rate);
  for (let ch = 0; ch < 2; ch++) {
    const data = buf.getChannelData(ch);
    for (let i = 0; i < len; i++) {
      const t = i / len;
      // noise tail with smooth exponential decay; gently darker than white
      const noise = (Math.random() * 2 - 1) * 0.6 + (Math.random() * 2 - 1) * 0.4;
      data[i] = noise * Math.pow(1 - t, decay);
    }
  }
  return buf;
}

/** Create the shared rig once. */
export function buildRig(): AudioRig {
  const Ctor =
    window.AudioContext ||
    (window as unknown as { webkitAudioContext: typeof AudioContext })
      .webkitAudioContext;
  const ctx = new Ctor();

  const master = ctx.createGain();
  master.gain.value = 0.85;

  const convolver = ctx.createConvolver();
  convolver.buffer = buildImpulse(ctx);

  // dry/wet blend so the reverb supports without washing out
  const wet = ctx.createGain();
  wet.gain.value = 0.32;
  const dry = ctx.createGain();
  dry.gain.value = 0.9;

  const limiter = ctx.createDynamicsCompressor();
  limiter.threshold.value = -6;
  limiter.knee.value = 6;
  limiter.ratio.value = 12;
  limiter.attack.value = 0.003;
  limiter.release.value = 0.25;

  master.connect(dry);
  master.connect(convolver);
  convolver.connect(wet);
  dry.connect(limiter);
  wet.connect(limiter);
  limiter.connect(ctx.destination);

  return { ctx, master };
}

/**
 * Schedule one score event as a voice that enters at `startTime` (AudioContext
 * clock seconds). Returns nothing; nodes self-clean on stop.
 */
export function scheduleVoice(
  rig: AudioRig,
  ev: ScoreEvent,
  startTime: number,
): void {
  const { ctx, master } = rig;

  const env = ctx.createGain();
  env.gain.value = 0;

  const filter = ctx.createBiquadFilter();
  filter.type = "lowpass";
  filter.frequency.value = ev.cutoff;
  filter.Q.value = 0.6;

  const panner = ctx.createStereoPanner();
  panner.pan.value = ev.pan;

  // partials: fundamental + a few quiet overtones (octave, fifth, double-octave)
  const ratios = [1, 2, 3, 4].slice(0, ev.partials);
  const partialGains = [1, 0.4, 0.22, 0.12];
  const oscs: OscillatorNode[] = [];
  for (let i = 0; i < ratios.length; i++) {
    const osc = ctx.createOscillator();
    osc.type = i === 0 ? "triangle" : "sine";
    osc.frequency.value = ev.freq * ratios[i];
    const pg = ctx.createGain();
    pg.gain.value = partialGains[i];
    osc.connect(pg);
    pg.connect(env);
    oscs.push(osc);
  }

  env.connect(filter);
  filter.connect(panner);
  panner.connect(master);

  // envelope: soft attack, long-ish decay, gentle release
  const attack = Math.min(0.08, ev.dur * 0.15);
  const peak = ev.gain;
  const end = startTime + ev.dur;
  env.gain.setValueAtTime(0, startTime);
  env.gain.linearRampToValueAtTime(peak, startTime + attack);
  env.gain.exponentialRampToValueAtTime(
    Math.max(0.0001, peak * 0.25),
    startTime + ev.dur * 0.6,
  );
  env.gain.exponentialRampToValueAtTime(0.0001, end);

  for (const osc of oscs) {
    osc.start(startTime);
    osc.stop(end + 0.05);
  }
  // cleanup
  const last = oscs[oscs.length - 1];
  last.onended = () => {
    try {
      panner.disconnect();
      filter.disconnect();
      env.disconnect();
    } catch {
      /* already torn down */
    }
  };
}

export function closeRig(rig: AudioRig | null): void {
  if (!rig) return;
  try {
    rig.ctx.close();
  } catch {
    /* ignore */
  }
}
