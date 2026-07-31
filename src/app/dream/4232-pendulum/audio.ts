// audio.ts — the two-voice ring-down synth behind the harmonograph.
//
// Two continuous oscillators at 220·rx and 220·ry — the SAME two ratios that
// drive the two pendulums — so a closed figure is literally a consonant dyad
// and a precessing figure beats/roughens. Each voice is a pair of sines detuned
// by ±4 cents for a soft, living beat. A shared exponential envelope rings the
// whole thing down over ~26 s (matching the visual decay); Re-strike resets it.
// No quantiser: the oscillators sound their true continuous frequency, so the
// space between just ratios is audible roughness, not silence.

const BASE_HZ = 220;
const DETUNE_CENTS = 4;
const RING_SECONDS = 26; // audible ring-down horizon
const GLIDE = 0.055; // s — ratio changes glide, never zipper

interface Voice {
  gain: GainNode;
  main: OscillatorNode;
  det: OscillatorNode; // ±4c partner
  pan: StereoPannerNode;
}

export interface HarmonographAudio {
  /** Glide both oscillators to the current pendulum ratios. */
  setRatios(rx: number, ry: number): void;
  /** Re-strike the ring-down envelope from its peak. */
  strike(): void;
  /** Tear down all nodes (caller owns the AudioContext). */
  stop(): void;
}

function makeVoice(
  ctx: AudioContext,
  bus: AudioNode,
  panValue: number,
): Voice {
  const now = ctx.currentTime;
  const pan = ctx.createStereoPanner();
  pan.pan.value = panValue;
  pan.connect(bus);

  const gain = ctx.createGain();
  gain.gain.value = 0.5;
  gain.connect(pan);

  const main = ctx.createOscillator();
  main.type = "sine";
  main.frequency.setValueAtTime(BASE_HZ, now);

  const det = ctx.createOscillator();
  det.type = "sine";
  det.frequency.setValueAtTime(BASE_HZ, now);
  det.detune.setValueAtTime(DETUNE_CENTS, now);

  const detGain = ctx.createGain();
  detGain.gain.value = 0.6;
  main.connect(gain);
  det.connect(detGain);
  detGain.connect(gain);

  main.start(now);
  det.start(now);
  return { gain, main, det, pan };
}

export function createHarmonographAudio(ctx: AudioContext): HarmonographAudio {
  // master → gentle lowpass → ring envelope → limiter → out
  const ring = ctx.createGain();
  ring.gain.value = 0.0001;

  const tone = ctx.createBiquadFilter();
  tone.type = "lowpass";
  tone.frequency.value = 2600;
  tone.Q.value = 0.4;

  const limiter = ctx.createDynamicsCompressor();
  limiter.threshold.value = -10;
  limiter.knee.value = 24;
  limiter.ratio.value = 12;
  limiter.attack.value = 0.004;
  limiter.release.value = 0.2;

  ring.connect(tone);
  tone.connect(limiter);
  limiter.connect(ctx.destination);

  // Two voices, softly panned so the dyad opens across the stereo field.
  const vx = makeVoice(ctx, ring, -0.35);
  const vy = makeVoice(ctx, ring, 0.35);

  function strike(): void {
    const now = ctx.currentTime;
    ring.gain.cancelScheduledValues(now);
    ring.gain.setValueAtTime(0.0001, now);
    ring.gain.exponentialRampToValueAtTime(0.26, now + 0.03); // strike
    ring.gain.exponentialRampToValueAtTime(0.0006, now + RING_SECONDS); // ring down
  }

  function setRatios(rx: number, ry: number): void {
    const now = ctx.currentTime;
    const fx = BASE_HZ * rx;
    const fy = BASE_HZ * ry;
    vx.main.frequency.setTargetAtTime(fx, now, GLIDE);
    vx.det.frequency.setTargetAtTime(fx, now, GLIDE);
    vy.main.frequency.setTargetAtTime(fy, now, GLIDE);
    vy.det.frequency.setTargetAtTime(fy, now, GLIDE);
  }

  function stop(): void {
    const now = ctx.currentTime;
    for (const v of [vx, vy]) {
      try {
        v.main.stop(now);
        v.det.stop(now);
      } catch {
        /* already stopped */
      }
      try {
        v.gain.disconnect();
        v.pan.disconnect();
      } catch {
        /* noop */
      }
    }
    try {
      ring.disconnect();
      tone.disconnect();
      limiter.disconnect();
    } catch {
      /* noop */
    }
  }

  strike();
  return { setRatios, strike, stop };
}
