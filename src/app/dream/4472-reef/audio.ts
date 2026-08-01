// audio.ts — the consequence-aware synth behind the reef.
//
// Every branch birth plays one warm bell/pluck voice whose pitch, detune,
// brightness and length come from the birth's geometry + local crowding (see
// growth.ts::voiceForBirth). A low DRONE tracks total biomass so the garden
// gains body as it fills. As the garden's smoothed CHOKEDNESS rises, three
// things happen at the master: the lowpass closes (light dims), a detuned
// second drone leaks in (beating), and an airy NOISE bed bleaches upward — so
// an overcrowded garden audibly chokes while a sparse one rings luminous.
//
// Poly, voice-capped, deterministic. Chain:
//   plucks + drone → toneFilter → masterGain → limiter → destination
//   noise bed      → masterGain (post-filter, so the bleach cuts through)
// AudioContext is created by the caller inside a user gesture; stop() tears
// down every node the caller-owned context still holds.

const MAX_VOICES = 14;
const MASTER = 0.25;

export interface ReefAudio {
  /** Sonify one branch birth. freq Hz, ±detune cents, brightness 0..1. */
  pluck(freq: number, detuneCents: number, brightness: number): void;
  /** Update the slow beds: biomass 0..1 (drone body), chokedness 0..1 (bleach). */
  setGarden(biomass01: number, chokedness: number): void;
  /** Tear down all audio nodes. */
  stop(): void;
}

interface Voice {
  main: OscillatorNode;
  partial: OscillatorNode;
  gain: GainNode;
  lp: BiquadFilterNode;
  endsAt: number;
}

export function createReefAudio(ctx: AudioContext): ReefAudio {
  // ── master chain ───────────────────────────────────────────────────────────
  const limiter = ctx.createDynamicsCompressor();
  limiter.threshold.value = -8;
  limiter.knee.value = 22;
  limiter.ratio.value = 12;
  limiter.attack.value = 0.004;
  limiter.release.value = 0.22;
  limiter.connect(ctx.destination);

  const master = ctx.createGain();
  master.gain.value = MASTER;
  master.connect(limiter);

  // toneFilter: bright when sparse, closes as the garden chokes.
  const toneFilter = ctx.createBiquadFilter();
  toneFilter.type = "lowpass";
  toneFilter.frequency.value = 6200;
  toneFilter.Q.value = 0.5;
  toneFilter.connect(master);

  // ── drone (tracks biomass; a second detuned layer beats as it chokes) ──────
  const droneBus = ctx.createGain();
  droneBus.gain.value = 0.0001;
  droneBus.connect(toneFilter);

  const now0 = ctx.currentTime;
  const droneRoot = ctx.createOscillator();
  droneRoot.type = "sine";
  droneRoot.frequency.value = 65.41; // C2
  const droneFifth = ctx.createOscillator();
  droneFifth.type = "sine";
  droneFifth.frequency.value = 65.41 * 1.5; // G2 (just fifth)
  const droneFifthGain = ctx.createGain();
  droneFifthGain.gain.value = 0.5;
  // The "rot" layer: a slightly sharp root that beats against the true one —
  // silent when sparse, opened by chokedness.
  const droneRot = ctx.createOscillator();
  droneRot.type = "sine";
  droneRot.frequency.value = 65.41 * 1.012;
  const droneRotGain = ctx.createGain();
  droneRotGain.gain.value = 0.0001;

  droneRoot.connect(droneBus);
  droneFifth.connect(droneFifthGain);
  droneFifthGain.connect(droneBus);
  droneRot.connect(droneRotGain);
  droneRotGain.connect(droneBus);
  droneRoot.start(now0);
  droneFifth.start(now0);
  droneRot.start(now0);

  // ── bleaching noise bed (post-filter, so it cuts through the murk) ─────────
  const noiseLen = Math.floor(ctx.sampleRate * 2);
  const noiseBuf = ctx.createBuffer(1, noiseLen, ctx.sampleRate);
  const nd = noiseBuf.getChannelData(0);
  // Deterministic value-noise fill (no Math.random).
  let s = 0x4472 >>> 0;
  for (let i = 0; i < noiseLen; i++) {
    s = (s + 0x6d2b79f5) >>> 0;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    nd[i] = (((t ^ (t >>> 14)) >>> 0) / 4294967296) * 2 - 1;
  }
  const noiseSrc = ctx.createBufferSource();
  noiseSrc.buffer = noiseBuf;
  noiseSrc.loop = true;
  const noiseBP = ctx.createBiquadFilter();
  noiseBP.type = "bandpass";
  noiseBP.frequency.value = 3400;
  noiseBP.Q.value = 0.7;
  const noiseGain = ctx.createGain();
  noiseGain.gain.value = 0.0001;
  noiseSrc.connect(noiseBP);
  noiseBP.connect(noiseGain);
  noiseGain.connect(master);
  noiseSrc.start(now0);

  // ── voice pool ─────────────────────────────────────────────────────────────
  const voices: Voice[] = [];

  function reap(now: number): void {
    for (let i = voices.length - 1; i >= 0; i--) {
      if (voices[i].endsAt <= now) {
        const v = voices[i];
        try {
          v.main.stop();
          v.partial.stop();
        } catch {
          /* already stopped */
        }
        try {
          v.gain.disconnect();
        } catch {
          /* noop */
        }
        voices.splice(i, 1);
      }
    }
  }

  function pluck(freq: number, detuneCents: number, brightness: number): void {
    const now = ctx.currentTime;
    reap(now);
    if (voices.length >= MAX_VOICES) return; // voice cap — greed can't spam

    const decay = 0.5 + brightness * 1.7; // sparse rings long, crowded is curt
    const peak = 0.16 * (0.35 + 0.65 * brightness);

    const gain = ctx.createGain();
    gain.gain.setValueAtTime(0.0001, now);
    gain.gain.exponentialRampToValueAtTime(peak, now + 0.006);
    gain.gain.exponentialRampToValueAtTime(0.0001, now + decay);

    const lp = ctx.createBiquadFilter();
    lp.type = "lowpass";
    lp.frequency.value = 900 + brightness * 5200;
    lp.Q.value = 0.6;

    const main = ctx.createOscillator();
    main.type = "sine";
    main.frequency.value = freq;
    main.detune.value = detuneCents;

    const partial = ctx.createOscillator();
    partial.type = "sine";
    partial.frequency.value = freq * 2.01; // shimmering octave partial
    partial.detune.value = detuneCents;
    const partialGain = ctx.createGain();
    partialGain.gain.value = 0.32 * brightness;

    main.connect(gain);
    partial.connect(partialGain);
    partialGain.connect(gain);
    gain.connect(lp);
    lp.connect(toneFilter);

    main.start(now);
    partial.start(now);
    main.stop(now + decay + 0.05);
    partial.stop(now + decay + 0.05);

    voices.push({ main, partial, gain, lp, endsAt: now + decay + 0.1 });
  }

  function setGarden(biomass01: number, chokedness: number): void {
    const now = ctx.currentTime;
    const tc = 0.4;
    // Drone body swells with biomass.
    const droneTarget = 0.012 + 0.12 * biomass01;
    droneBus.gain.setTargetAtTime(droneTarget, now, tc);
    // Chokedness: close the light, open the beating rot layer, bleach the noise.
    const cutoff = 6200 - chokedness * 5400; // 6200 → 800 Hz
    toneFilter.frequency.setTargetAtTime(Math.max(700, cutoff), now, tc);
    droneRotGain.gain.setTargetAtTime(0.0001 + chokedness * 0.5, now, tc);
    noiseGain.gain.setTargetAtTime(0.0001 + chokedness * 0.05, now, tc);
    noiseBP.frequency.setTargetAtTime(2600 + chokedness * 1600, now, tc);
  }

  function stop(): void {
    const now = ctx.currentTime;
    for (const v of voices) {
      try {
        v.main.stop(now);
        v.partial.stop(now);
      } catch {
        /* noop */
      }
      try {
        v.gain.disconnect();
      } catch {
        /* noop */
      }
    }
    voices.length = 0;
    for (const o of [droneRoot, droneFifth, droneRot, noiseSrc]) {
      try {
        o.stop(now);
      } catch {
        /* noop */
      }
    }
    try {
      droneBus.disconnect();
      noiseGain.disconnect();
      toneFilter.disconnect();
      master.disconnect();
      limiter.disconnect();
    } catch {
      /* noop */
    }
  }

  // A breath of drone from the first frame so Start isn't silent.
  droneBus.gain.setTargetAtTime(0.02, now0, 0.6);
  return { pluck, setGarden, stop };
}
