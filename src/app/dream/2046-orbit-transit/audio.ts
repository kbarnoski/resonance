/**
 * Web Audio engine for `2046-orbit-transit` — one sustained voice per
 * currently-visible pass, re-voiced as satellites rise and set.
 *
 * Signal chain per voice:
 *   2 detuned oscillators (saw + triangle) → lowpass → gain envelope
 *     → StereoPanner → [dry + reverb sends] → bus
 * Master bus: sum → DynamicsCompressor (glue) → limiter (hard) → master
 *   gain (≤ 0.14) → destination. A synthesized convolution impulse gives a
 *   cold reverb bed. Pitch is continuous portamento (setTargetAtTime) — a
 *   Doppler glissando, NON-JI, with no fixed scale or lattice.
 *
 * The pool is capped at 10 voices with elevation-based voice-stealing: when a
 * new pass needs a voice and the pool is full, the lowest-elevation (quietest)
 * voice is released to make room.
 */

const POOL_CAP = 10;

/** Per-voice target parameters, all mapped from topocentric orbital state. */
export interface VoiceTarget {
  id: string;
  freq: number; // Hz — base register (altitude) × Doppler ratio (range-rate)
  gain: number; // 0..1 — elevation-driven loudness
  cutoff: number; // Hz — elevation-driven brightness
  pan: number; // -1..1 — azimuth
  elevation: number; // deg — used for voice-stealing decisions
}

interface Voice {
  id: string;
  osc1: OscillatorNode;
  osc2: OscillatorNode;
  filter: BiquadFilterNode;
  gain: GainNode;
  panner: StereoPannerNode;
  dry: GainNode;
  wet: GainNode;
  elevation: number;
  stopTimer: ReturnType<typeof setTimeout> | null;
}

export interface AudioEngine {
  ctx: AudioContext;
  resume: () => Promise<void>;
  /** Reconcile the live voice pool against the set of visible passes. */
  sync: (targets: VoiceTarget[]) => void;
  close: () => void;
}

/** Deterministic reverb impulse — uses the passed PRNG, never Math.random. */
function buildImpulse(ctx: AudioContext, prng: () => number): AudioBuffer {
  const seconds = 3.2;
  const rate = ctx.sampleRate;
  const length = Math.floor(seconds * rate);
  const impulse = ctx.createBuffer(2, length, rate);
  for (let ch = 0; ch < 2; ch++) {
    const data = impulse.getChannelData(ch);
    for (let i = 0; i < length; i++) {
      const decay = Math.pow(1 - i / length, 2.6);
      data[i] = (prng() * 2 - 1) * decay;
    }
  }
  return impulse;
}

export function createAudioEngine(prng: () => number): AudioEngine {
  const ctx = new AudioContext();

  const master = ctx.createGain();
  master.gain.value = 0.14; // house ceiling

  // Limiter: fast, hard compressor acting as a brick-wall safety net.
  const limiter = ctx.createDynamicsCompressor();
  limiter.threshold.value = -3;
  limiter.knee.value = 0;
  limiter.ratio.value = 20;
  limiter.attack.value = 0.002;
  limiter.release.value = 0.12;

  // Glue compressor for the summed chord.
  const glue = ctx.createDynamicsCompressor();
  glue.threshold.value = -20;
  glue.knee.value = 8;
  glue.ratio.value = 3.5;
  glue.attack.value = 0.02;
  glue.release.value = 0.25;

  const reverb = ctx.createConvolver();
  reverb.buffer = buildImpulse(ctx, prng);
  const reverbReturn = ctx.createGain();
  reverbReturn.gain.value = 0.9;

  // bus → glue → limiter → master → destination
  const bus = ctx.createGain();
  bus.gain.value = 1;
  bus.connect(glue);
  reverb.connect(reverbReturn).connect(glue);
  glue.connect(limiter).connect(master).connect(ctx.destination);

  const voices = new Map<string, Voice>();

  function allocate(target: VoiceTarget): Voice {
    if (voices.size >= POOL_CAP) {
      // Steal the lowest-elevation (quietest) active voice.
      let victim: Voice | null = null;
      for (const v of voices.values()) {
        if (!victim || v.elevation < victim.elevation) victim = v;
      }
      if (victim) hardRelease(victim);
    }

    const now = ctx.currentTime;
    const osc1 = ctx.createOscillator();
    osc1.type = "sawtooth";
    const osc2 = ctx.createOscillator();
    osc2.type = "triangle";
    osc2.detune.value = 7; // cents — gentle chorus, not a tuned interval

    const filter = ctx.createBiquadFilter();
    filter.type = "lowpass";
    filter.Q.value = 0.7;
    filter.frequency.value = target.cutoff;

    const gain = ctx.createGain();
    gain.gain.value = 0.0001; // fade in

    const panner = ctx.createStereoPanner();
    panner.pan.value = target.pan;

    const dry = ctx.createGain();
    dry.gain.value = 0.75;
    const wet = ctx.createGain();
    wet.gain.value = 0.55;

    osc1.frequency.value = target.freq;
    osc2.frequency.value = target.freq;
    osc1.connect(filter);
    osc2.connect(filter);
    filter.connect(gain).connect(panner);
    panner.connect(dry).connect(bus);
    panner.connect(wet).connect(reverb);

    osc1.start(now);
    osc2.start(now);

    const voice: Voice = {
      id: target.id,
      osc1,
      osc2,
      filter,
      gain,
      panner,
      dry,
      wet,
      elevation: target.elevation,
      stopTimer: null,
    };
    voices.set(target.id, voice);
    return voice;
  }

  function updateVoice(v: Voice, target: VoiceTarget) {
    const now = ctx.currentTime;
    v.elevation = target.elevation;
    // Continuous Doppler portamento — a glide, never a stepped note.
    v.osc1.frequency.setTargetAtTime(target.freq, now, 0.06);
    v.osc2.frequency.setTargetAtTime(target.freq, now, 0.06);
    v.filter.frequency.setTargetAtTime(target.cutoff, now, 0.12);
    v.gain.gain.setTargetAtTime(Math.max(0.0001, target.gain), now, 0.09);
    v.panner.pan.setTargetAtTime(target.pan, now, 0.12);
  }

  /** Graceful release: fade, then stop and disconnect. */
  function release(v: Voice) {
    if (v.stopTimer) return; // already releasing
    const now = ctx.currentTime;
    v.gain.gain.setTargetAtTime(0.0001, now, 0.35);
    v.stopTimer = setTimeout(() => teardown(v), 1100);
    voices.delete(v.id);
  }

  /** Immediate release for voice-stealing. */
  function hardRelease(v: Voice) {
    if (v.stopTimer) clearTimeout(v.stopTimer);
    const now = ctx.currentTime;
    v.gain.gain.setTargetAtTime(0.0001, now, 0.05);
    v.stopTimer = setTimeout(() => teardown(v), 120);
    voices.delete(v.id);
  }

  function teardown(v: Voice) {
    try {
      v.osc1.stop();
      v.osc2.stop();
    } catch {
      /* already stopped */
    }
    try {
      v.osc1.disconnect();
      v.osc2.disconnect();
      v.filter.disconnect();
      v.gain.disconnect();
      v.panner.disconnect();
      v.dry.disconnect();
      v.wet.disconnect();
    } catch {
      /* ignore */
    }
    v.stopTimer = null;
  }

  return {
    ctx,
    resume: () => ctx.resume(),
    sync(targets: VoiceTarget[]) {
      const wanted = new Set(targets.map((t) => t.id));
      for (const target of targets) {
        const existing = voices.get(target.id);
        if (existing) updateVoice(existing, target);
        else updateVoice(allocate(target), target);
      }
      // Release voices whose pass has ended.
      for (const v of Array.from(voices.values())) {
        if (!wanted.has(v.id)) release(v);
      }
    },
    close() {
      for (const v of Array.from(voices.values())) {
        if (v.stopTimer) clearTimeout(v.stopTimer);
        teardown(v);
      }
      voices.clear();
      ctx.close().catch(() => {
        /* ignore */
      });
    },
  };
}
