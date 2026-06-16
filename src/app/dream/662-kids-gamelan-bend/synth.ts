// Inharmonic modal bronze synthesis for the gamelan-bend prototype.
// Each key is built from additive sine partials at STRETCHED, inharmonic
// ratios (bar-mode-like, NOT integer harmonics). Every partial is rendered
// as two slightly-detuned voices so the pair beats slowly against each other
// -> the signature bronze "shimmer." The beating rate scales with how far a
// key is bent from its laras (in-tune) pitch, so settling a note back toward
// tune makes the shimmer audibly calmer.

// Bar-mode-ish inharmonic partial ratios for struck bronze idiophones.
// Not 1,2,3,4 (harmonic) -> the stretched ratios are what make it sound
// like bronze rather than a flute/organ.
export const PARTIAL_RATIOS = [1, 2.76, 5.4, 8.93] as const;
// Relative loudness per partial (higher partials quieter, as in real bars).
const PARTIAL_GAINS = [1.0, 0.5, 0.26, 0.13] as const;

// Laras (tuning system) cent tables, measured from the root.
// Real, approximate cent values -- deliberately NOT 12-TET, NOT pentatonic-snap.
export const SLENDRO_CENTS = [0, 231, 474, 717, 955] as const; // open / floating
export const PELOG_CENTS = [0, 120, 270, 540, 670] as const; //  tense ~120c half-step

export const ROOT_HZ = 246; // warm bronze register (~B3)

export const centsToRatio = (cents: number) => Math.pow(2, cents / 1200);

export type Laras = "slendro" | "pelog";

export function larasCents(laras: Laras): readonly number[] {
  return laras === "slendro" ? SLENDRO_CENTS : PELOG_CENTS;
}

// A struck voice: a bank of detuned partial pairs sharing one struck envelope.
interface Voice {
  oscA: OscillatorNode[];
  oscB: OscillatorNode[];
  partialGain: GainNode[];
  env: GainNode;
}

export interface GamelanAudio {
  ctx: AudioContext;
  master: GainNode;
  // Continuous drone (re-tunes on laras flip).
  setDroneFreq: (hz: number, when: number, laras?: Laras) => void;
  // Strike a key. bendCents is the live bend offset; it controls both pitch
  // and the beating depth (more bend -> faster, more dissonant shimmer).
  strike: (baseHz: number, bendCents: number, velocity: number) => void;
  resume: () => Promise<void>;
  dispose: () => void;
}

// Beating depth in Hz as a function of bend. At rest (in tune) the two voices
// of each partial sit ~0.6 Hz apart -> a slow, calm shimmer. As the child bends
// away the detune widens toward a rougher ~6 Hz wobble, which the ear reads as
// "out of tune / restless."
function beatHzForBend(bendCents: number): number {
  const k = Math.min(1, Math.abs(bendCents) / 300);
  return 0.6 + k * 5.4;
}

function makeVoice(
  ctx: AudioContext,
  dest: AudioNode,
  baseHz: number,
  beatHz: number,
  velocity: number,
): Voice {
  const now = ctx.currentTime;
  const env = ctx.createGain();
  env.gain.value = 0;
  env.connect(dest);

  const oscA: OscillatorNode[] = [];
  const oscB: OscillatorNode[] = [];
  const partialGain: GainNode[] = [];

  PARTIAL_RATIOS.forEach((ratio, i) => {
    const f = baseHz * ratio;
    // Higher partials beat a touch faster -> richer metallic life.
    const detune = beatHz * (1 + i * 0.35);
    const pg = ctx.createGain();
    pg.gain.value = PARTIAL_GAINS[i];
    pg.connect(env);

    const a = ctx.createOscillator();
    a.type = "sine";
    a.frequency.value = f;
    const b = ctx.createOscillator();
    b.type = "sine";
    b.frequency.value = f + detune;

    a.connect(pg);
    b.connect(pg);
    a.start(now);
    b.start(now);

    oscA.push(a);
    oscB.push(b);
    partialGain.push(pg);
  });

  // Struck envelope: fast attack, long inharmonic ring.
  const peak = 0.16 + 0.14 * velocity;
  env.gain.cancelScheduledValues(now);
  env.gain.setValueAtTime(0, now);
  env.gain.linearRampToValueAtTime(peak, now + 0.006); // ~6ms attack
  env.gain.exponentialRampToValueAtTime(0.0001, now + 3.4); // long ring

  // Tear the voice down after the ring completes.
  const stopAt = now + 3.6;
  oscA.forEach((o) => o.stop(stopAt));
  oscB.forEach((o) => o.stop(stopAt));
  const cleanup = () => {
    oscA.forEach((o) => o.disconnect());
    oscB.forEach((o) => o.disconnect());
    partialGain.forEach((g) => g.disconnect());
    env.disconnect();
  };
  oscA[0].addEventListener("ended", cleanup, { once: true });

  return { oscA, oscB, partialGain, env };
}

export function makeGamelanAudio(): GamelanAudio {
  const Ctor =
    window.AudioContext ||
    (window as unknown as { webkitAudioContext: typeof AudioContext })
      .webkitAudioContext;
  const ctx = new Ctor();

  // SAFE-SOUNDS master chain: gain -> lowpass -> limiter -> destination.
  const master = ctx.createGain();
  master.gain.value = 0.9;

  const lowpass = ctx.createBiquadFilter();
  lowpass.type = "lowpass";
  lowpass.frequency.value = 7200; // tame harsh highs
  lowpass.Q.value = 0.5;

  const limiter = ctx.createDynamicsCompressor();
  limiter.threshold.value = -10;
  limiter.knee.value = 4;
  limiter.ratio.value = 20; // brick-wall-ish
  limiter.attack.value = 0.003;
  limiter.release.value = 0.25;

  master.connect(lowpass);
  lowpass.connect(limiter);
  limiter.connect(ctx.destination);

  // Always-on soft bronze gong drone: an octave-below pad with two detuned
  // partials so it never feels broken and re-tunes with the laras.
  const droneGain = ctx.createGain();
  droneGain.gain.value = 0.0; // faded in on unlock
  droneGain.connect(master);

  const droneOscs: OscillatorNode[] = [];
  const droneRatios = [1, 2.76];
  const droneSub = ctx.createGain();
  droneSub.gain.value = 1;
  droneSub.connect(droneGain);
  droneRatios.forEach((r, i) => {
    const a = ctx.createOscillator();
    a.type = "sine";
    const b = ctx.createOscillator();
    b.type = "sine";
    const g = ctx.createGain();
    g.gain.value = i === 0 ? 0.5 : 0.18;
    a.connect(g);
    b.connect(g);
    g.connect(droneSub);
    a.start();
    b.start();
    droneOscs.push(a, b);
    // store ratio on the node for retune
    (a as unknown as { _r: number })._r = r;
    (b as unknown as { _r: number })._r = r;
    (b as unknown as { _d: number })._d = 0.5 + i * 0.4; // slow beat
  });

  // The gong bed re-tunes with the laras: its upper partial shifts so the
  // flip is felt underneath, not just heard in the keys. Slendro keeps the
  // open inharmonic bronze colour; pelog leans its upper partial up toward the
  // tense ~540-cent interval that gives pelog its restless character.
  const setDroneFreq = (
    hz: number,
    when: number,
    laras: Laras = "slendro",
  ) => {
    const t = Math.max(when, ctx.currentTime);
    const upper = laras === "pelog" ? 2.76 * centsToRatio(70) : 2.76;
    droneOscs.forEach((o) => {
      const baseR = (o as unknown as { _r: number })._r;
      const r = baseR === 1 ? 1 : upper;
      const d = (o as unknown as { _d?: number })._d ?? 0;
      // octave below the playing root for a warm gong bed
      const target = (hz / 2) * r + d;
      o.frequency.cancelScheduledValues(t);
      o.frequency.setTargetAtTime(target, t, 0.35); // audible mass re-tune glide
    });
  };
  // init drone at root
  setDroneFreq(ROOT_HZ, ctx.currentTime, "slendro");

  const strike = (baseHz: number, bendCents: number, velocity: number) => {
    const playHz = baseHz * centsToRatio(bendCents);
    makeVoice(ctx, master, playHz, beatHzForBend(bendCents), velocity);
  };

  const resume = async () => {
    if (ctx.state !== "running") await ctx.resume();
    // fade drone in gently
    const now = ctx.currentTime;
    droneGain.gain.cancelScheduledValues(now);
    droneGain.gain.setValueAtTime(droneGain.gain.value, now);
    droneGain.gain.linearRampToValueAtTime(0.12, now + 1.6);
  };

  const dispose = () => {
    try {
      droneOscs.forEach((o) => {
        try {
          o.stop();
        } catch {
          /* already stopped */
        }
        o.disconnect();
      });
      master.disconnect();
      lowpass.disconnect();
      limiter.disconnect();
      void ctx.close();
    } catch {
      /* noop */
    }
  };

  return { ctx, master, setDroneFreq, strike, resume, dispose };
}
