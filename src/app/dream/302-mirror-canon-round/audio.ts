// audio.ts — formant choir engine + canon voice pool for 302-mirror-canon-round.
// Each canon voice is a Klatt-ish sung voice (sawtooth glottal pulse → 3 parallel
// bandpass formants → gain). The master runs through a DynamicsCompressor limiter
// so the stacked round can NEVER get loud or harsh.

import { DORIAN_HZ, FORMANTS, FormantRow } from "./pose";

export interface ChoirVoice {
  pulseOsc: OscillatorNode; // glottal pulse (sawtooth)
  bp1: BiquadFilterNode;
  bp2: BiquadFilterNode;
  bp3: BiquadFilterNode;
  // second oscillator a fifth up for fuller, harmonized canon voice
  pulseOsc2: OscillatorNode;
  gain: GainNode; // pre-fader voice level
  faderGain: GainNode; // mute/solo conduct fader (glides)
}

export interface PadVoice {
  osc: OscillatorNode;
  gain: GainNode;
}

export interface AudioEngine {
  ctx: AudioContext;
  live: ChoirVoice; // the live performer
  canon: ChoirVoice[]; // up to 4 committed "past you" voices
  pads: PadVoice[];
  master: GainNode;
  limiter: DynamicsCompressorNode;
}

// tinted colours per canon voice slot (used by both audio meta + render ghosts)
export const VOICE_TINTS = [
  { h: 36, name: "amber" }, // live / first
  { h: 268, name: "violet" },
  { h: 158, name: "emerald" },
  { h: 8, name: "rose" },
];

function makeChoirVoice(ctx: AudioContext, dest: AudioNode, freq: number): ChoirVoice {
  const pulseOsc = ctx.createOscillator();
  pulseOsc.type = "sawtooth";
  pulseOsc.frequency.value = freq;

  const pulseOsc2 = ctx.createOscillator();
  pulseOsc2.type = "sawtooth";
  pulseOsc2.frequency.value = freq * 1.5; // a fifth up, softer
  pulseOsc2.detune.value = 4;

  const bp1 = ctx.createBiquadFilter();
  bp1.type = "bandpass";
  bp1.frequency.value = FORMANTS.oh[0];
  bp1.Q.value = 9;
  const bp2 = ctx.createBiquadFilter();
  bp2.type = "bandpass";
  bp2.frequency.value = FORMANTS.oh[1];
  bp2.Q.value = 10;
  const bp3 = ctx.createBiquadFilter();
  bp3.type = "bandpass";
  bp3.frequency.value = FORMANTS.oh[2];
  bp3.Q.value = 12;

  const gain = ctx.createGain();
  gain.gain.value = 0.26;

  const faderGain = ctx.createGain();
  faderGain.gain.value = 0; // starts muted; ramps up when active

  // split saw into 3 parallel bandpass paths
  const s1 = ctx.createGain(); s1.gain.value = 0.45;
  const s2 = ctx.createGain(); s2.gain.value = 0.35;
  const s3 = ctx.createGain(); s3.gain.value = 0.2;

  // second osc, quieter, feeds the same formant bank
  const s2g = ctx.createGain(); s2g.gain.value = 0.35;

  pulseOsc.connect(s1);
  pulseOsc.connect(s2);
  pulseOsc.connect(s3);
  pulseOsc2.connect(s2g);
  s2g.connect(s2);

  s1.connect(bp1);
  s2.connect(bp2);
  s3.connect(bp3);

  bp1.connect(gain);
  bp2.connect(gain);
  bp3.connect(gain);

  gain.connect(faderGain);
  faderGain.connect(dest);

  pulseOsc.start();
  pulseOsc2.start();

  return { pulseOsc, pulseOsc2, bp1, bp2, bp3, gain, faderGain };
}

export function buildAudio(): AudioEngine {
  const CtxCtor =
    window.AudioContext ??
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    ((window as any).webkitAudioContext as typeof AudioContext);
  const ctx = new CtxCtor();

  // Master + limiter so the round can never get loud.
  const limiter = ctx.createDynamicsCompressor();
  limiter.threshold.value = -14;
  limiter.knee.value = 24;
  limiter.ratio.value = 12;
  limiter.attack.value = 0.003;
  limiter.release.value = 0.25;

  const master = ctx.createGain();
  master.gain.value = 0.55;

  // soft tape-ish delay (Frippertronics nod) — feedback echo, gentle
  const delay = ctx.createDelay(2.0);
  delay.delayTime.value = 0.42;
  const delayFb = ctx.createGain();
  delayFb.gain.value = 0.34;
  const delayWet = ctx.createGain();
  delayWet.gain.value = 0.2;
  master.connect(delay);
  delay.connect(delayFb);
  delayFb.connect(delay);
  delay.connect(delayWet);
  delayWet.connect(limiter);
  master.connect(limiter);
  limiter.connect(ctx.destination);

  // live performer voice (always audible while performing)
  const live = makeChoirVoice(ctx, master, DORIAN_HZ[2]);
  live.faderGain.gain.value = 0.85;

  // canon voice pool (4), all start muted
  const canon = [0, 1, 2, 3].map((i) => makeChoirVoice(ctx, master, DORIAN_HZ[2 + i]));

  // warm sine pad — always on so it's never silent (D2/A2/D3/A3)
  const pads: PadVoice[] = [73.42, 110.0, 146.83, 220.0].map((f) => {
    const osc = ctx.createOscillator();
    osc.type = "sine";
    osc.frequency.value = f;
    const g = ctx.createGain();
    g.gain.value = 0.035;
    osc.connect(g);
    g.connect(master);
    osc.start();
    return { osc, gain: g };
  });

  return { ctx, live, canon, pads, master, limiter };
}

// Apply a param snapshot to a single choir voice. All changes glide.
export function applyVoiceParams(
  ctx: AudioContext,
  voice: ChoirVoice,
  pitch1: number,
  pitch2: number,
  formants: FormantRow,
  register: number,
  level: number, // pre-fader voice loudness (energy-driven), 0..1
): void {
  const now = ctx.currentTime;
  const tc = 0.08; // setTargetAtTime time-constant ≈ smooth glide
  voice.pulseOsc.frequency.setTargetAtTime(pitch1 * register, now, tc);
  voice.pulseOsc2.frequency.setTargetAtTime(pitch2 * register * 1.5, now, tc);
  voice.bp1.frequency.setTargetAtTime(formants[0], now, tc);
  voice.bp2.frequency.setTargetAtTime(formants[1], now, tc);
  voice.bp3.frequency.setTargetAtTime(formants[2], now, tc);
  voice.gain.gain.setTargetAtTime(0.1 + level * 0.22, now, tc);
}

// Set the conduct fader (mute/solo). Glides to avoid clicks.
export function setVoiceFader(ctx: AudioContext, voice: ChoirVoice, target: number): void {
  voice.faderGain.gain.setTargetAtTime(target, ctx.currentTime, 0.12);
}

export function disposeAudio(engine: AudioEngine): void {
  try {
    engine.ctx.close();
  } catch {
    // already closed
  }
}
