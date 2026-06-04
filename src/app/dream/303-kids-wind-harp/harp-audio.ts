// Web Audio engine for the wind-harp.
//
// Voices are synthesised with the Karplus-Strong plucked-string algorithm
// (Karplus & Strong, 1983): a short burst of noise is pushed through a tuned
// delay line whose length sets the pitch, with a lowpass (averaging) filter in
// the feedback path so successive wavetable cycles lose their high harmonics —
// giving the characteristic bright-attack / mellow-decay plucked-string tone.
//
// We render each pluck offline into an AudioBuffer and play it through a
// BufferSource. This is the simplest robust path (no ScriptProcessor /
// AudioWorklet lifecycle to babysit) and lets us bake brightness/length per
// pluck from the swing amplitude.
//
// Tuning: 7 strings in D-Dorian (D E F G A B C D), warm and modal — explicitly
// NOT C-major pentatonic. A soft drone pad underneath keeps silence from ever
// feeling dead. A DynamicsCompressor on the master acts as a friendly limiter.

// D-Dorian, low to high: D3 E3 F3 G3 A3 B3 C4
export const SCALE_HZ = [
  146.83, // D3
  164.81, // E3
  174.61, // F3
  196.0, // G3
  220.0, // A3
  246.94, // B3
  261.63, // C4
];

export const SCALE_NAMES = ["D", "E", "F", "G", "A", "B", "C"];

export interface HarpAudio {
  ctx: AudioContext;
  master: GainNode;
  pluck: (stringIndex: number, amplitude01: number) => void;
  setDroneLevel: (level01: number) => void;
  dispose: () => void;
}

// Render one Karplus-Strong pluck into an AudioBuffer.
//   freq        : fundamental in Hz
//   sampleRate  : ctx.sampleRate
//   durationSec : tail length
//   brightness  : 0..1 — controls feedback lowpass blend (more = brighter)
//   decay       : feedback gain just under 1 (longer = more sustain)
function renderKarplusStrong(
  freq: number,
  sampleRate: number,
  durationSec: number,
  brightness: number,
  decay: number,
): Float32Array {
  const N = Math.max(2, Math.round(sampleRate / freq)); // delay line length
  const out = new Float32Array(Math.ceil(durationSec * sampleRate));

  // Seed the delay line with band-limited-ish noise (the "pluck" excitation).
  const line = new Float32Array(N);
  for (let i = 0; i < N; i++) line[i] = Math.random() * 2 - 1;

  // brightness controls how much of the *previous* averaged sample bleeds in:
  // blend=0.5 is the classic two-tap average (darkest); pushing the current
  // sample's weight up keeps more highs.
  const cur = 0.5 + brightness * 0.45; // 0.5..0.95
  const prev = 1 - cur;

  let idx = 0;
  let last = 0;
  for (let n = 0; n < out.length; n++) {
    const sample = line[idx];
    // lowpass-averaging feedback comb
    const filtered = cur * sample + prev * last;
    last = filtered;
    line[idx] = filtered * decay;
    out[n] = sample;
    idx = (idx + 1) % N;
  }

  // Gentle fade-in (1ms) to kill the click, and an exponential-ish fade-out so
  // tails never clip when many strings ring at once.
  const fadeIn = Math.min(out.length, Math.round(0.001 * sampleRate));
  for (let i = 0; i < fadeIn; i++) out[i] *= i / fadeIn;
  const fadeOut = Math.min(out.length, Math.round(0.08 * sampleRate));
  for (let i = 0; i < fadeOut; i++) {
    const t = i / fadeOut;
    out[out.length - 1 - i] *= t;
  }
  return out;
}

export function createHarpAudio(ctx: AudioContext): HarpAudio {
  const master = ctx.createGain();
  master.gain.value = 0.0;

  // Friendly limiter so a fistful of simultaneous plucks can't blast.
  const limiter = ctx.createDynamicsCompressor();
  limiter.threshold.value = -10;
  limiter.knee.value = 24;
  limiter.ratio.value = 12;
  limiter.attack.value = 0.003;
  limiter.release.value = 0.25;

  master.connect(limiter).connect(ctx.destination);

  // Fade master in so the start gesture doesn't pop.
  master.gain.setValueAtTime(0, ctx.currentTime);
  master.gain.linearRampToValueAtTime(0.9, ctx.currentTime + 0.6);

  // ---- Ambient drone pad: root D + fifth A, two detuned triangles each. ----
  const droneGain = ctx.createGain();
  droneGain.gain.value = 0;
  const droneFilter = ctx.createBiquadFilter();
  droneFilter.type = "lowpass";
  droneFilter.frequency.value = 700;
  droneFilter.Q.value = 0.4;
  droneGain.connect(droneFilter).connect(master);

  const droneOscs: OscillatorNode[] = [];
  const droneFreqs = [SCALE_HZ[0] / 2, SCALE_HZ[4] / 2]; // D2 + A2
  for (const f of droneFreqs) {
    for (const det of [-3, 3]) {
      const o = ctx.createOscillator();
      o.type = "triangle";
      o.frequency.value = f;
      o.detune.value = det;
      const g = ctx.createGain();
      g.gain.value = 0.5;
      o.connect(g).connect(droneGain);
      o.start();
      droneOscs.push(o);
    }
  }
  // Slow tremolo on the pad so it breathes.
  const lfo = ctx.createOscillator();
  lfo.type = "sine";
  lfo.frequency.value = 0.07;
  const lfoGain = ctx.createGain();
  lfoGain.gain.value = 0.18;
  lfo.connect(lfoGain).connect(droneGain.gain);
  lfo.start();
  droneGain.gain.setTargetAtTime(0.22, ctx.currentTime, 2.5);

  // Per-string reverb-ish send via a small feedback delay for shimmer.
  const delay = ctx.createDelay(1.0);
  delay.delayTime.value = 0.21;
  const fb = ctx.createGain();
  fb.gain.value = 0.32;
  const wet = ctx.createGain();
  wet.gain.value = 0.25;
  const damp = ctx.createBiquadFilter();
  damp.type = "lowpass";
  damp.frequency.value = 2600;
  delay.connect(damp).connect(fb).connect(delay);
  delay.connect(wet).connect(master);

  // Cache rendered buffers per string at a nominal brightness; we vary
  // brightness by rendering a small set of variants lazily. Simpler: render
  // fresh per pluck (cheap for short buffers) but memoise the "soft" variant.
  function pluck(stringIndex: number, amplitude01: number): void {
    if (stringIndex < 0 || stringIndex >= SCALE_HZ.length) return;
    const a = Math.max(0, Math.min(1, amplitude01));
    const freq = SCALE_HZ[stringIndex];

    // Bigger swing -> louder, brighter, slightly longer.
    const brightness = 0.25 + a * 0.6;
    const decay = 0.992 + a * 0.006; // 0.992..0.998
    const dur = 1.4 + a * 1.6;
    const peak = 0.18 + a * 0.5;

    const data = renderKarplusStrong(freq, ctx.sampleRate, dur, brightness, decay);
    const buf = ctx.createBuffer(1, data.length, ctx.sampleRate);
    buf.getChannelData(0).set(data);

    const src = ctx.createBufferSource();
    src.buffer = buf;

    const vca = ctx.createGain();
    vca.gain.value = peak;

    // a touch of per-pluck stereo-ish placement via a panner keeps the row
    // spatially legible (string 0 = left, string 6 = right).
    const pan = ctx.createStereoPanner();
    pan.pan.value = (stringIndex / (SCALE_HZ.length - 1)) * 1.6 - 0.8;

    src.connect(vca).connect(pan);
    pan.connect(master);
    pan.connect(delay); // shimmer send
    src.start();
    src.onended = () => {
      src.disconnect();
      vca.disconnect();
      pan.disconnect();
    };
  }

  function setDroneLevel(level01: number): void {
    const v = Math.max(0, Math.min(1, level01)) * 0.3;
    droneGain.gain.setTargetAtTime(v, ctx.currentTime, 0.6);
  }

  function dispose(): void {
    try {
      master.gain.cancelScheduledValues(ctx.currentTime);
      master.gain.setValueAtTime(master.gain.value, ctx.currentTime);
      master.gain.linearRampToValueAtTime(0, ctx.currentTime + 0.25);
    } catch {
      /* noop */
    }
    const stopAt = ctx.currentTime + 0.3;
    for (const o of droneOscs) {
      try {
        o.stop(stopAt);
      } catch {
        /* already stopped */
      }
    }
    try {
      lfo.stop(stopAt);
    } catch {
      /* noop */
    }
    setTimeout(() => {
      if (ctx.state !== "closed") ctx.close().catch(() => {});
    }, 400);
  }

  return { ctx, master, pluck, setDroneLevel, dispose };
}
