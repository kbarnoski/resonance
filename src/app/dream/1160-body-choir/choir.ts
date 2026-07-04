// ── Luminous choir — Web Audio only ─────────────────────────────────────────
// A warm just-intonation "aah" pad built from stacked detuned oscillators
// through a shared lowpass, a slow chorus/vibrato, and a master limiter.
// Motion drives it: total energy -> loudness + filter; centroid Y -> which
// voice sits in the light (hands high = upper voices); centroid X -> pan of a
// shimmer; speed -> a gentle brightness/attack lift. Stillness settles to a
// calm sustained drone — restful, never dead-silent.

import type { MotionField } from "./flow";

// Warm open voicing on G2 (98.0 Hz) using just-intonation ratios, low -> high.
const BASE = 98.0;
const RATIOS = [1, 3 / 2, 2, 5 / 2, 3, 4]; // G2 D3 G3 B3 D4 G4
// bass voices stay present as the bed; upper voices bloom with raised hands.
const BED = [1.0, 0.85, 0.6, 0.4, 0.28, 0.2];

interface Voice {
  gain: GainNode;
  pan: StereoPannerNode;
  oscs: OscillatorNode[];
}

export interface Choir {
  start(): void;
  update(field: MotionField, reduced: boolean): void;
  stop(): void;
  ctx: AudioContext;
}

export function createChoir(): Choir {
  const AC: typeof AudioContext =
    window.AudioContext ||
    (window as unknown as { webkitAudioContext: typeof AudioContext })
      .webkitAudioContext;
  const ctx = new AC();

  // master chain: sum -> lowpass -> limiter -> destination
  const master = ctx.createGain();
  master.gain.value = 0.0;

  const filter = ctx.createBiquadFilter();
  filter.type = "lowpass";
  filter.frequency.value = 400;
  filter.Q.value = 0.7;

  const limiter = ctx.createDynamicsCompressor();
  limiter.threshold.value = -8;
  limiter.knee.value = 6;
  limiter.ratio.value = 12;
  limiter.attack.value = 0.005;
  limiter.release.value = 0.25;

  master.connect(filter);
  filter.connect(limiter);
  limiter.connect(ctx.destination);

  // slow shared vibrato -> a touch of chorus/life on the detune
  const vibrato = ctx.createOscillator();
  vibrato.frequency.value = 0.18;
  const vibratoDepth = ctx.createGain();
  vibratoDepth.gain.value = 3.2; // cents
  vibrato.connect(vibratoDepth);
  vibrato.start();

  const voices: Voice[] = RATIOS.map((r, idx) => {
    const vg = ctx.createGain();
    vg.gain.value = 0.0001;
    const pan = ctx.createStereoPanner();
    pan.pan.value = (idx / (RATIOS.length - 1)) * 1.4 - 0.7; // spread voices
    vg.connect(pan);
    pan.connect(master);

    const freq = BASE * r;
    // 3 slightly detuned oscillators per voice = a choral "aah" cluster
    const oscs: OscillatorNode[] = [];
    const detunes = [-7, 0, 7];
    for (let k = 0; k < detunes.length; k++) {
      const o = ctx.createOscillator();
      o.type = idx < 3 ? "sawtooth" : "triangle";
      o.frequency.value = freq;
      o.detune.value = detunes[k];
      vibratoDepth.connect(o.detune);
      const og = ctx.createGain();
      og.gain.value = k === 1 ? 0.5 : 0.32;
      o.connect(og);
      og.connect(vg);
      oscs.push(o);
    }
    return { gain: vg, pan, oscs };
  });

  // a high airy shimmer that tracks motion speed, panned by centroid X
  const shimmer = ctx.createGain();
  shimmer.gain.value = 0.0001;
  const shimmerPan = ctx.createStereoPanner();
  shimmer.connect(shimmerPan);
  shimmerPan.connect(master);
  const shOsc = ctx.createOscillator();
  shOsc.type = "sine";
  shOsc.frequency.value = BASE * 6; // G5
  const shOsc2 = ctx.createOscillator();
  shOsc2.type = "sine";
  shOsc2.frequency.value = BASE * 8; // G6
  shOsc2.detune.value = 4;
  const shG2 = ctx.createGain();
  shG2.gain.value = 0.5;
  shOsc.connect(shimmer);
  shOsc2.connect(shG2);
  shG2.connect(shimmer);

  let started = false;

  function start() {
    if (started) return;
    started = true;
    if (ctx.state === "suspended") void ctx.resume();
    const now = ctx.currentTime;
    for (const v of voices) for (const o of v.oscs) o.start();
    shOsc.start();
    shOsc2.start();
    // gentle fade-in of the master so onset is a swell, never a click/flash
    master.gain.setValueAtTime(0.0001, now);
    master.gain.linearRampToValueAtTime(0.6, now + 1.6);
  }

  function update(field: MotionField, reduced: boolean) {
    if (!started) return;
    const now = ctx.currentTime;
    const tc = reduced ? 0.4 : 0.22; // smoothing (also keeps changes < 3 Hz)

    const energy = field.energy;
    const speed = field.speed;
    // calm drone floor so it's restful, not dead
    const loudFloor = reduced ? 0.14 : 0.18;
    const loud = Math.min(1, loudFloor + energy * (reduced ? 0.55 : 0.82));

    // focus index: hands high (cy small) -> upper voices in the light
    const N = voices.length;
    const focus = (1 - field.cy) * (N - 1);
    const spread = 1.35;
    for (let i = 0; i < N; i++) {
      const d = i - focus;
      const bloom = Math.exp(-(d * d) / (2 * spread * spread));
      // bed keeps bass present; bloom lifts the voice under the hands
      const g = (0.22 * BED[i] + 0.9 * bloom) * loud * 0.16;
      voices[i].gain.gain.setTargetAtTime(Math.max(0.0001, g), now, tc);
      // subtle per-voice pan lean toward centroid X
      const base = (i / (N - 1)) * 1.4 - 0.7;
      const lean = (field.cx * 2 - 1) * 0.25;
      voices[i].pan.pan.setTargetAtTime(
        Math.max(-1, Math.min(1, base + lean)),
        now,
        tc,
      );
    }

    // filter opens with energy + speed -> "brightness"
    const cutoff = 320 + energy * (reduced ? 1500 : 2400) + speed * 1400;
    filter.frequency.setTargetAtTime(cutoff, now, tc);

    // shimmer follows speed, panned hard-ish by centroid X
    const shLevel = Math.min(0.18, speed * (reduced ? 0.08 : 0.16) + energy * 0.03);
    shimmer.gain.setTargetAtTime(Math.max(0.0001, shLevel), now, tc);
    shimmerPan.pan.setTargetAtTime(field.cx * 2 - 1, now, tc);

    // master rides energy gently (limiter guards peaks); smooth = no flicker
    const m = 0.42 + loud * 0.4;
    master.gain.setTargetAtTime(m, now, tc);
  }

  function stop() {
    const now = ctx.currentTime;
    try {
      master.gain.cancelScheduledValues(now);
      master.gain.setTargetAtTime(0.0001, now, 0.1);
    } catch {
      /* ignore */
    }
    const stopAt = now + 0.4;
    const kill = (o: OscillatorNode) => {
      try {
        o.stop(stopAt);
      } catch {
        /* already stopped */
      }
    };
    for (const v of voices) for (const o of v.oscs) kill(o);
    kill(shOsc);
    kill(shOsc2);
    try {
      vibrato.stop(stopAt);
    } catch {
      /* ignore */
    }
    window.setTimeout(() => {
      if (ctx.state !== "closed") void ctx.close();
    }, 600);
  }

  return { start, update, stop, ctx };
}
