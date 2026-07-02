/* ───────────────────────────────────────────────────────────────────────────
   strings.ts — a bank of Karplus-Strong sympathetic strings, built entirely
   from Web Audio nodes (no npm, no ScriptProcessor / AudioWorklet).

   Each string is a digital waveguide:

       excite ─▶ delay ─▶ damp (one-pole lowpass) ─┬─▶ out ─▶ master
                   ▲                                │
                   └──────── feedback gain ◀────────┘

   The delay length sets the pitch (delayTime ≈ 1 / freq). The feedback gain
   just under 1 makes the ring decay over seconds; the lowpass in the loop
   rolls off the highs a little faster each pass, which is exactly the plucked,
   physically-decaying timbre a sine resonator cannot give you. A short seeded
   noise burst injected at `excite` is the pluck — like a finger releasing a
   string. Re-injecting a fresh burst when the voice feeds energy into this
   string's partial is what makes the temple "answer" you sympathetically.

   The Karplus-Strong technique: Karplus & Strong, "Digital Synthesis of
   Plucked-String and Drum Timbres", Computer Music Journal, 1983.
─────────────────────────────────────────────────────────────────────────── */

/** Just-intonation ratios over the drone root — a warm two-octave sympathetic
 *  set (Sa, komal/shuddh degrees, Pa, octave, and upper partials). */
export const JI_RATIOS: readonly number[] = [
  1, // Sa   110.00
  9 / 8, // Re   123.75
  5 / 4, // Ga   137.50
  4 / 3, // Ma   146.67
  3 / 2, // Pa   165.00
  5 / 3, // Dha  183.33
  15 / 8, // Ni   206.25
  2, // Sa'  220.00
  9 / 4, // Re'  247.50
  5 / 2, // Ga'  275.00
  8 / 3, // Ma'  293.33
  3, // Pa'  330.00
];

export const DRONE_ROOT_HZ = 110;

/** A single Karplus-Strong string voice. */
export interface KSString {
  freq: number;
  /** Inject a fresh pluck. `strength` in ~0..1 scales the burst amplitude. */
  pluck: (strength: number, when: number, rng: () => number) => void;
  /** Tear down the persistent nodes (feedback loop lives forever otherwise). */
  dispose: () => void;
}

/** Build a short mono buffer of seeded white noise, reused for every pluck. */
export function makeNoiseBuffer(ctx: AudioContext, rng: () => number): AudioBuffer {
  const len = Math.floor(ctx.sampleRate * 0.06);
  const buf = ctx.createBuffer(1, len, ctx.sampleRate);
  const data = buf.getChannelData(0);
  for (let i = 0; i < len; i++) data[i] = rng() * 2 - 1;
  return buf;
}

/**
 * Create one sympathetic string tuned to `freq`, summed into `dest`.
 * `noise` is a shared burst buffer (see makeNoiseBuffer).
 */
export function createKSString(
  ctx: AudioContext,
  freq: number,
  dest: AudioNode,
  noise: AudioBuffer,
  index: number,
): KSString {
  const delay = ctx.createDelay(0.05);
  delay.delayTime.value = 1 / freq;

  // One-pole-ish lowpass inside the loop. Higher strings get a slightly lower
  // relative cutoff so they don't ring metallic. A touch of Q gives the bright
  // "jvari" edge of a tanpura bridge on the attack.
  const damp = ctx.createBiquadFilter();
  damp.type = "lowpass";
  damp.frequency.value = Math.min(5200, Math.max(1400, freq * 9));
  damp.Q.value = 0.4;

  // Feedback just under unity — lower strings ring longer.
  const fb = ctx.createGain();
  fb.gain.value = Math.min(0.9955, 0.998 - index * 0.0009);

  // Excitation summing bus and the output tap.
  const excite = ctx.createGain();
  excite.gain.value = 1;

  const out = ctx.createGain();
  // Lower strings a bit louder for a warm, bass-weighted drone.
  out.gain.value = 0.5 * Math.pow(0.94, index);

  excite.connect(delay);
  delay.connect(damp);
  damp.connect(fb);
  fb.connect(delay); // the waveguide loop
  damp.connect(out);
  out.connect(dest);

  const pluck = (strength: number, when: number, rng: () => number) => {
    const s = strength < 0 ? 0 : strength > 1 ? 1 : strength;
    if (s <= 0.001) return;
    const src = ctx.createBufferSource();
    src.buffer = noise;
    // A hair of detune on the excitation start keeps repeated plucks alive.
    src.playbackRate.value = 0.98 + rng() * 0.04;

    const env = ctx.createGain();
    const peak = s * 0.55;
    env.gain.setValueAtTime(0.0001, when);
    env.gain.linearRampToValueAtTime(peak, when + 0.002);
    env.gain.exponentialRampToValueAtTime(0.0001, when + 0.03);

    src.connect(env);
    env.connect(excite);
    src.start(when);
    src.stop(when + 0.05);
    // Let the short burst nodes fall out of the graph when finished.
    src.onended = () => {
      try {
        src.disconnect();
        env.disconnect();
      } catch {
        /* already gone */
      }
    };
  };

  const dispose = () => {
    try {
      excite.disconnect();
      delay.disconnect();
      damp.disconnect();
      fb.disconnect();
      out.disconnect();
    } catch {
      /* already gone */
    }
  };

  return { freq, pluck, dispose };
}
