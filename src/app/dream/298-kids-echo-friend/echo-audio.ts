/**
 * echo-audio.ts — Audio engine for Kids Echo Friend.
 *
 * Responsibilities:
 *  - Idle drone (D root, barely audible)
 *  - Creature sing-back synthesizer: warm sine+triangle → lowpass → delay → compressor
 *  - Phrase playback (plays back an array of {hz, duration} notes)
 *
 * All outputs pass through a DynamicsCompressorNode so volume can NEVER
 * get harsh or loud.
 */

export interface PhraseNote {
  hz: number;      // quantized frequency
  duration: number; // seconds
}

export interface EchoAudioState {
  ctx: AudioContext;
  masterGain: GainNode;
  compressor: DynamicsCompressorNode;
  droneGain: GainNode;
}

/** Create the audio context and routing graph.
 *  Must be called from a user gesture. */
export function makeAudioEngine(): EchoAudioState {
  const Ctx =
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    window.AudioContext || (window as any).webkitAudioContext;
  const ctx = new Ctx() as AudioContext;

  // Master limiter — always on, keeps kids safe
  const compressor = ctx.createDynamicsCompressor();
  compressor.threshold.value = -18;
  compressor.knee.value = 6;
  compressor.ratio.value = 8;
  compressor.attack.value = 0.003;
  compressor.release.value = 0.15;
  compressor.connect(ctx.destination);

  const masterGain = ctx.createGain();
  masterGain.gain.value = 0.7;
  masterGain.connect(compressor);

  // Drone: soft D2 + D3 sine, barely audible
  const droneGain = ctx.createGain();
  droneGain.gain.value = 0;
  droneGain.connect(masterGain);

  const droneOsc1 = ctx.createOscillator();
  droneOsc1.type = "sine";
  droneOsc1.frequency.value = 73.42; // D2
  droneOsc1.connect(droneGain);
  droneOsc1.start();

  const droneOsc2 = ctx.createOscillator();
  droneOsc2.type = "sine";
  droneOsc2.frequency.value = 146.83; // D3
  const droneG2 = ctx.createGain();
  droneG2.gain.value = 0.4;
  droneOsc2.connect(droneG2);
  droneG2.connect(droneGain);
  droneOsc2.start();

  // Fade drone in after a moment
  droneGain.gain.setValueAtTime(0, ctx.currentTime);
  droneGain.gain.linearRampToValueAtTime(0.06, ctx.currentTime + 2.5);

  return { ctx, masterGain, compressor, droneGain };
}

/** Play a single note on the creature synth voice.
 *  Warm sine+triangle blend through a soft lowpass + short stereo delay. */
export function playCreatureNote(
  state: EchoAudioState,
  hz: number,
  duration: number,
  startTime: number,
  gainScale = 1.0
): void {
  const { ctx, masterGain } = state;
  const t = startTime;

  // === Sine oscillator (fundamental) ===
  const osc1 = ctx.createOscillator();
  osc1.type = "sine";
  osc1.frequency.value = hz;

  // === Triangle oscillator (warmth, -8 dB relative) ===
  const osc2 = ctx.createOscillator();
  osc2.type = "triangle";
  osc2.frequency.value = hz;
  const triGain = ctx.createGain();
  triGain.gain.value = 0.28;

  // === Envelope ===
  const env = ctx.createGain();
  env.gain.setValueAtTime(0, t);
  env.gain.linearRampToValueAtTime(0.38 * gainScale, t + 0.06);
  env.gain.setValueAtTime(0.38 * gainScale, t + duration - 0.08);
  env.gain.linearRampToValueAtTime(0, t + duration);

  // === Lowpass filter (100–2500 Hz cutoff) ===
  const lpf = ctx.createBiquadFilter();
  lpf.type = "lowpass";
  lpf.frequency.value = Math.min(2500, hz * 4);
  lpf.Q.value = 0.8;

  // === Short echo delay for warmth ===
  const delay = ctx.createDelay(0.4);
  delay.delayTime.value = 0.13;
  const feedbackGain = ctx.createGain();
  feedbackGain.gain.value = 0.22;
  const delayDry = ctx.createGain();
  delayDry.gain.value = 0.78;
  const delayWet = ctx.createGain();
  delayWet.gain.value = 0.22;

  // Routing: oscs → env → lpf → dry+wet → masterGain
  osc2.connect(triGain);
  triGain.connect(env);
  osc1.connect(env);
  env.connect(lpf);
  lpf.connect(delayDry);
  delayDry.connect(masterGain);
  lpf.connect(delay);
  delay.connect(feedbackGain);
  feedbackGain.connect(delay);
  delay.connect(delayWet);
  delayWet.connect(masterGain);

  osc1.start(t);
  osc2.start(t);
  osc1.stop(t + duration + 0.5);
  osc2.stop(t + duration + 0.5);
}

/** Schedule a phrase (array of notes) starting at ctx.currentTime + offsetSec.
 *  Returns the total duration in seconds. */
export function schedulePhrase(
  state: EchoAudioState,
  phrase: PhraseNote[],
  offsetSec = 0.0,
  gainScale = 1.0
): number {
  const { ctx } = state;
  let t = ctx.currentTime + offsetSec;
  for (const note of phrase) {
    playCreatureNote(state, note.hz, note.duration, t, gainScale);
    t += note.duration * 0.92; // slight overlap for legato
  }
  return t - ctx.currentTime - offsetSec;
}

/** Play all remembered phrases in sequence as a little growing song. */
export function scheduleFullSong(
  state: EchoAudioState,
  phrases: PhraseNote[][],
  offsetSec = 0.2
): number {
  const { ctx } = state;
  let t = ctx.currentTime + offsetSec;
  let totalDur = 0;
  for (const phrase of phrases) {
    let phraseDur = 0;
    for (const note of phrase) {
      playCreatureNote(state, note.hz, note.duration, t, 0.85);
      t += note.duration * 0.92;
      phraseDur += note.duration * 0.92;
    }
    t += 0.35; // gap between phrases
    totalDur += phraseDur + 0.35;
  }
  return totalDur;
}

/** Resume AudioContext if suspended (iOS Safari requirement) */
export async function resumeAudio(state: EchoAudioState): Promise<void> {
  if (state.ctx.state === "suspended") {
    await state.ctx.resume();
  }
}

/** Gently duck the drone while the creature is singing */
export function duckDrone(state: EchoAudioState, duckDuration: number): void {
  const { ctx, droneGain } = state;
  const t = ctx.currentTime;
  droneGain.gain.setValueAtTime(droneGain.gain.value, t);
  droneGain.gain.linearRampToValueAtTime(0.008, t + 0.1);
  droneGain.gain.linearRampToValueAtTime(0.06, t + duckDuration + 0.4);
}
