// audio.ts — aeroacoustic synthesis (Web Audio).
//
// Each reed sings an Aeolian tone: flow shedding past a thin obstacle radiates
// sound at f ≈ St · U / d  (Strouhal number St ≈ 0.2). This is the wind-singing
// physics of an aeolian harp / a wire in the wind. We voice each reed as a
// high-Q band-pass noise whistle plus a faint sine partial at f. Amplitude
// follows shedding strength (a function of local flow speed U and vorticity),
// hysteresis-smoothed so it swells and fades like breath — never clicks. Local
// vorticity adds a gentle FM/AM warble, in the spirit of the Ffowcs
// Williams–Hawkings analogy where surface pressure fluctuations radiate as sound.
//
// SAFETY: the microphone is routed ONLY into an AnalyserNode for breath energy.
// It is NEVER connected to the destination (that would feed back / howl).

export const STROUHAL = 0.2;

type Voice = {
  noise: AudioBufferSourceNode;
  bp: BiquadFilterNode;
  noiseGain: GainNode;
  sineOsc: OscillatorNode;
  sineGain: GainNode;
  fmOsc: OscillatorNode;
  fmGain: GainNode; // modulates bp frequency (warble)
  voiceGain: GainNode;
  baseFreq: number;
};

export type AeroEngine = {
  ctx: AudioContext;
  update: (
    perReed: { freq: number; amp: number; warble: number }[],
    bedCutoff: number,
    bedGain: number
  ) => void;
  dispose: () => Promise<void>;
};

function makeNoiseBuffer(ctx: AudioContext, seconds = 2): AudioBuffer {
  const len = Math.floor(ctx.sampleRate * seconds);
  const buf = ctx.createBuffer(1, len, ctx.sampleRate);
  const data = buf.getChannelData(0);
  for (let i = 0; i < len; i++) data[i] = Math.random() * 2 - 1;
  return buf;
}

/**
 * Build the aeroacoustic engine for `nReeds` voices + one broadband breath bed.
 * Master chain: voices → master gain (0.3) → lowpass 7kHz → compressor → out.
 */
export function makeAeroEngine(ctx: AudioContext, nReeds: number): AeroEngine {
  const master = ctx.createGain();
  master.gain.value = 0.3;

  const lp = ctx.createBiquadFilter();
  lp.type = "lowpass";
  lp.frequency.value = 7000;

  const comp = ctx.createDynamicsCompressor();
  comp.threshold.value = -18;
  comp.knee.value = 24;
  comp.ratio.value = 4;
  comp.attack.value = 0.01;
  comp.release.value = 0.25;

  master.connect(lp);
  lp.connect(comp);
  comp.connect(ctx.destination);

  const noiseBuf = makeNoiseBuffer(ctx);

  // broadband breath-noise bed (always-on texture while air moves)
  const bedNoise = ctx.createBufferSource();
  bedNoise.buffer = noiseBuf;
  bedNoise.loop = true;
  const bedBp = ctx.createBiquadFilter();
  bedBp.type = "bandpass";
  bedBp.frequency.value = 600;
  bedBp.Q.value = 0.7;
  const bedLp = ctx.createBiquadFilter();
  bedLp.type = "lowpass";
  bedLp.frequency.value = 1200;
  const bedGain = ctx.createGain();
  bedGain.gain.value = 0;
  bedNoise.connect(bedBp);
  bedBp.connect(bedLp);
  bedLp.connect(bedGain);
  bedGain.connect(master);
  bedNoise.start();

  const voices: Voice[] = [];
  for (let i = 0; i < nReeds; i++) {
    const noise = ctx.createBufferSource();
    noise.buffer = noiseBuf;
    noise.loop = true;

    const bp = ctx.createBiquadFilter();
    bp.type = "bandpass";
    bp.frequency.value = 220;
    bp.Q.value = 18; // high Q → a clear whistle

    const noiseGain = ctx.createGain();
    noiseGain.gain.value = 0.0;

    const sineOsc = ctx.createOscillator();
    sineOsc.type = "sine";
    sineOsc.frequency.value = 220;
    const sineGain = ctx.createGain();
    sineGain.gain.value = 0.0;

    // FM/AM warble source driven by vorticity → modulates bp.frequency
    const fmOsc = ctx.createOscillator();
    fmOsc.type = "sine";
    fmOsc.frequency.value = 5 + i; // slow per-reed warble
    const fmGain = ctx.createGain();
    fmGain.gain.value = 0;

    const voiceGain = ctx.createGain();
    voiceGain.gain.value = 1 / Math.max(1, nReeds);

    noise.connect(bp);
    bp.connect(noiseGain);
    noiseGain.connect(voiceGain);
    sineOsc.connect(sineGain);
    sineGain.connect(voiceGain);
    fmOsc.connect(fmGain);
    fmGain.connect(bp.frequency);
    voiceGain.connect(master);

    noise.start();
    sineOsc.start();
    fmOsc.start();

    voices.push({ noise, bp, noiseGain, sineOsc, sineGain, fmOsc, fmGain, voiceGain, baseFreq: 220 });
  }

  function update(
    perReed: { freq: number; amp: number; warble: number }[],
    bedCutoff: number,
    bedGainVal: number
  ) {
    const t = ctx.currentTime;
    for (let i = 0; i < voices.length; i++) {
      const v = voices[i];
      const r = perReed[i] ?? { freq: 220, amp: 0, warble: 0 };
      const f = Math.max(60, Math.min(2000, r.freq));
      // hysteresis-smoothed param changes (~80ms) so nothing clicks
      v.bp.frequency.setTargetAtTime(f, t, 0.08);
      v.sineOsc.frequency.setTargetAtTime(f, t, 0.08);
      v.noiseGain.gain.setTargetAtTime(Math.min(0.9, r.amp), t, 0.08);
      v.sineGain.gain.setTargetAtTime(Math.min(0.25, r.amp * 0.3), t, 0.08);
      // vorticity → warble depth (Hz of frequency wobble)
      v.fmGain.gain.setTargetAtTime(Math.min(f * 0.15, r.warble * f * 0.4), t, 0.12);
    }
    bedLp.frequency.setTargetAtTime(Math.max(300, Math.min(4000, bedCutoff)), t, 0.1);
    bedGain.gain.setTargetAtTime(Math.min(0.18, bedGainVal), t, 0.1);
  }

  async function dispose() {
    try {
      bedNoise.stop();
      for (const v of voices) {
        v.noise.stop();
        v.sineOsc.stop();
        v.fmOsc.stop();
      }
    } catch {
      /* already stopped */
    }
    try {
      master.disconnect();
    } catch {
      /* ignore */
    }
    if (ctx.state !== "closed") {
      try {
        await ctx.close();
      } catch {
        /* ignore */
      }
    }
  }

  return { ctx, update, dispose };
}
