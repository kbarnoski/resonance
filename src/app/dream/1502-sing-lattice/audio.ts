// ─────────────────────────────────────────────────────────────────────────────
// audio.ts — pitch detection + the sympathetic-resonance instrument.
//
//   Three cooperating subsystems live here:
//
//   1. PITCH DETECTION. Real-time fundamental tracking by *autocorrelation*
//      (the McLeod normalized-square-difference variant) on time-domain samples
//      from an AnalyserNode — not an FFT-bin peak, which octave-errors on a
//      sung vowel. We compute the NSDF over the plausible vocal-f0 lag range,
//      pick the first strong peak, and parabola-interpolate the lag for
//      sub-sample accuracy. A clarity value gates out breath / silence.
//
//   2. THE SNAPPED VOICE. One continuous synth voice whose frequency GLIDES
//      (portamento) toward the lattice node the singer is nearest, so you hear
//      the "corrected" xenharmonic pitch riding alongside your own. Its timbre
//      is an ODD-HARMONIC periodic wave (partials 1,3,5,7,9) — the native
//      Bohlen–Pierce timbre, since BP consonance is an odd-harmonic phenomenon.
//
//   3. SYMPATHETIC STRINGS. Each lit node plucks a real Karplus–Strong string:
//      a one-period noise burst injected into a tuned delay loop with a lowpass
//      in the feedback path — a decaying pluck at exactly the node's pitch. When
//      a node rings it also *softly* plucks its harmonic lattice neighbours, the
//      way a sitar's tarab strings answer. Wake enough and the room blooms into
//      a 3:5:7 chord. Everything is bussed through a generated convolution
//      reverb (the "room") into a limiter; master gain never exceeds ~0.2.
// ─────────────────────────────────────────────────────────────────────────────

export interface PitchResult {
  /** detected fundamental in Hz, or -1 if unvoiced/too quiet. */
  freq: number;
  /** 0..1 confidence (NSDF peak). */
  clarity: number;
  /** RMS level of the frame, 0..1. */
  rms: number;
}

/** Autocorrelation (NSDF) pitch detector over the vocal range. */
export function detectPitch(
  buf: Float32Array,
  sampleRate: number
): PitchResult {
  const n = buf.length;

  // RMS gate — reject silence and quiet breath.
  let sumSq = 0;
  for (let i = 0; i < n; i++) sumSq += buf[i] * buf[i];
  const rms = Math.sqrt(sumSq / n);
  if (rms < 0.008) return { freq: -1, clarity: 0, rms };

  // Search only musically-plausible vocal fundamentals (~65–1000 Hz).
  const minLag = Math.max(2, Math.floor(sampleRate / 1000));
  const maxLag = Math.min(n - 1, Math.floor(sampleRate / 65));

  // Normalized square difference function (McLeod). nsdf ∈ [-1, 1].
  let bestLag = -1;
  let bestVal = 0;
  let prev = 0;
  let prev2 = 0;
  let foundFirstPeak = false;

  for (let lag = minLag; lag <= maxLag; lag++) {
    let acf = 0;
    let energy = 0;
    const lim = n - lag;
    for (let i = 0; i < lim; i++) {
      const a = buf[i];
      const b = buf[i + lag];
      acf += a * b;
      energy += a * a + b * b;
    }
    const nsdf = energy > 0 ? (2 * acf) / energy : 0;

    // Detect a local maximum (prev2 < prev >= nsdf) and keep the strongest one
    // once we've cleared the initial descent from lag 0.
    if (!foundFirstPeak) {
      if (nsdf < 0) foundFirstPeak = true; // wait for the function to dip
    } else if (prev > prev2 && prev >= nsdf && prev > 0.5) {
      if (prev > bestVal) {
        bestVal = prev;
        bestLag = lag - 1;
      }
      // The first peak above a high threshold is usually the true period.
      if (prev > 0.9) break;
    }
    prev2 = prev;
    prev = nsdf;
  }

  if (bestLag < 0 || bestVal < 0.5) return { freq: -1, clarity: bestVal, rms };

  // Parabolic interpolation around the integer lag for sub-sample precision.
  // Recompute nsdf at bestLag-1, bestLag, bestLag+1.
  const nsdfAt = (lag: number): number => {
    if (lag < 1 || lag >= n) return 0;
    let acf = 0;
    let energy = 0;
    const lim = n - lag;
    for (let i = 0; i < lim; i++) {
      const a = buf[i];
      const b = buf[i + lag];
      acf += a * b;
      energy += a * a + b * b;
    }
    return energy > 0 ? (2 * acf) / energy : 0;
  };
  const y0 = nsdfAt(bestLag - 1);
  const y1 = nsdfAt(bestLag);
  const y2 = nsdfAt(bestLag + 1);
  const denom = y0 - 2 * y1 + y2;
  const shift = denom !== 0 ? (0.5 * (y0 - y2)) / denom : 0;
  const trueLag = bestLag + shift;

  const freq = sampleRate / trueLag;
  if (freq < 60 || freq > 1100) return { freq: -1, clarity: bestVal, rms };
  return { freq, clarity: bestVal, rms };
}

// ── The instrument ──────────────────────────────────────────────────────────

export interface LatticeAudio {
  ctx: AudioContext;
  /** Attach the mic. Returns null on success, an error message on failure. */
  startMic: () => Promise<string | null>;
  /** True once a mic stream is analysing. */
  hasMic: () => boolean;
  /** Read the current pitch frame (null if no mic). */
  readPitch: () => PitchResult | null;
  /** Glide the snapped voice to freq (Hz); voiced=false fades it out. */
  setVoice: (freq: number, voiced: boolean, level: number) => void;
  /** Pluck a Karplus–Strong string at freq with the given amplitude & sustain. */
  pluck: (freq: number, amp: number, sustain: number) => void;
  stop: () => void;
}

/** Build an odd-harmonic periodic wave — the native Bohlen–Pierce timbre. */
function oddHarmonicWave(ctx: AudioContext): PeriodicWave {
  const amps = [0, 1, 0, 0.5, 0, 0.32, 0, 0.2, 0, 0.12]; // harmonics 0..9, odd only
  const real = new Float32Array(amps.length);
  const imag = new Float32Array(amps.length);
  for (let i = 0; i < amps.length; i++) imag[i] = amps[i];
  return ctx.createPeriodicWave(real, imag, { disableNormalization: false });
}

/** Generate a short, warm convolution reverb impulse (the resonating room). */
function makeRoomImpulse(ctx: AudioContext): AudioBuffer {
  const seconds = 2.4;
  const len = Math.floor(ctx.sampleRate * seconds);
  const buf = ctx.createBuffer(2, len, ctx.sampleRate);
  for (let ch = 0; ch < 2; ch++) {
    const d = buf.getChannelData(ch);
    for (let i = 0; i < len; i++) {
      const t = i / len;
      // Exponential decay with a soft early build — reads as a real room.
      const env = Math.pow(1 - t, 2.6) * (1 - Math.exp(-i / 400));
      d[i] = (Math.random() * 2 - 1) * env;
    }
  }
  return buf;
}

export function createLatticeAudio(): LatticeAudio | null {
  const Ctx: typeof AudioContext | undefined =
    typeof window !== "undefined"
      ? // eslint-disable-next-line @typescript-eslint/no-explicit-any
        window.AudioContext || (window as any).webkitAudioContext
      : undefined;
  if (!Ctx) return null;

  const ctx = new Ctx();

  // Master chain: busGain → reverb + dry → compressor(limiter) → destination.
  const limiter = ctx.createDynamicsCompressor();
  limiter.threshold.value = -8;
  limiter.knee.value = 6;
  limiter.ratio.value = 12;
  limiter.attack.value = 0.003;
  limiter.release.value = 0.25;
  limiter.connect(ctx.destination);

  const master = ctx.createGain();
  master.gain.value = 0.18;
  master.connect(limiter);

  // Reverb send.
  const reverb = ctx.createConvolver();
  reverb.buffer = makeRoomImpulse(ctx);
  const reverbReturn = ctx.createGain();
  reverbReturn.gain.value = 0.9;
  reverb.connect(reverbReturn);
  reverbReturn.connect(master);
  const reverbSend = ctx.createGain();
  reverbSend.gain.value = 0.5;
  reverbSend.connect(reverb);

  // The continuously-glided "snapped" voice.
  const voiceOsc = ctx.createOscillator();
  voiceOsc.setPeriodicWave(oddHarmonicWave(ctx));
  voiceOsc.frequency.value = 185;
  const voiceFilter = ctx.createBiquadFilter();
  voiceFilter.type = "lowpass";
  voiceFilter.frequency.value = 2400;
  voiceFilter.Q.value = 0.6;
  const voiceGain = ctx.createGain();
  voiceGain.gain.value = 0;
  voiceOsc.connect(voiceFilter);
  voiceFilter.connect(voiceGain);
  voiceGain.connect(master);
  voiceGain.connect(reverbSend);
  voiceOsc.start();

  // Mic + analyser.
  let stream: MediaStream | null = null;
  let analyser: AnalyserNode | null = null;
  let timeBuf: Float32Array | null = null;

  const startMic = async (): Promise<string | null> => {
    try {
      stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          echoCancellation: false,
          noiseSuppression: false,
          autoGainControl: false,
        },
      });
      const src = ctx.createMediaStreamSource(stream);
      analyser = ctx.createAnalyser();
      analyser.fftSize = 2048;
      // NOT connected to destination — analysis only, no feedback.
      src.connect(analyser);
      timeBuf = new Float32Array(analyser.fftSize);
      if (ctx.state === "suspended") await ctx.resume();
      return null;
    } catch (e) {
      return e instanceof Error
        ? e.message
        : "Microphone unavailable. Check permissions and reload.";
    }
  };

  const readPitch = (): PitchResult | null => {
    if (!analyser || !timeBuf) return null;
    analyser.getFloatTimeDomainData(
      // TS lib.dom narrows the arg to Float32Array<ArrayBuffer>; cast through.
      timeBuf as unknown as Float32Array<ArrayBuffer>
    );
    return detectPitch(timeBuf, ctx.sampleRate);
  };

  const setVoice = (freq: number, voiced: boolean, level: number) => {
    const now = ctx.currentTime;
    if (freq > 0) {
      voiceOsc.frequency.setTargetAtTime(freq, now, 0.05); // portamento glide
    }
    const target = voiced ? Math.min(0.11, 0.05 + level * 0.09) : 0;
    voiceGain.gain.setTargetAtTime(target, now, voiced ? 0.06 : 0.14);
  };

  const pluck = (freq: number, amp: number, sustain: number) => {
    if (freq <= 0 || !isFinite(freq)) return;
    const now = ctx.currentTime;
    const period = 1 / freq;

    // Excitation: one period of noise (the "pluck").
    const burstLen = Math.max(64, Math.floor(ctx.sampleRate * period));
    const nb = ctx.createBuffer(1, burstLen, ctx.sampleRate);
    const d = nb.getChannelData(0);
    for (let i = 0; i < burstLen; i++) d[i] = Math.random() * 2 - 1;
    const src = ctx.createBufferSource();
    src.buffer = nb;

    const delay = ctx.createDelay(0.05);
    delay.delayTime.value = period;

    const damp = ctx.createBiquadFilter();
    damp.type = "lowpass";
    damp.frequency.value = Math.min(9000, freq * 7);

    const fb = ctx.createGain();
    // Longer sustain → feedback closer to 1. Clamp so it always dies out.
    fb.gain.value = Math.min(0.992, 0.94 + sustain * 0.05);

    const out = ctx.createGain();
    out.gain.value = amp;

    // Karplus–Strong loop.
    src.connect(delay);
    delay.connect(damp);
    damp.connect(fb);
    fb.connect(delay);
    // Tap the loop to the buses (dry + reverb send).
    delay.connect(out);
    out.connect(master);
    out.connect(reverbSend);

    // Guaranteed release so the loop can't ring forever.
    const decay = 0.6 + sustain * 2.6;
    out.gain.setValueAtTime(amp, now);
    out.gain.setTargetAtTime(0.0001, now + decay * 0.4, decay * 0.35);

    src.start(now);
    src.stop(now + period + 0.02);

    const life = (decay + 1.2) * 1000;
    window.setTimeout(() => {
      try {
        src.disconnect();
        delay.disconnect();
        damp.disconnect();
        fb.disconnect();
        out.disconnect();
      } catch {
        /* already gone */
      }
    }, life);
  };

  const stop = () => {
    try {
      stream?.getTracks().forEach((t) => t.stop());
    } catch {
      /* ignore */
    }
    stream = null;
    analyser = null;
    timeBuf = null;
    try {
      voiceOsc.stop();
    } catch {
      /* ignore */
    }
    void ctx.close();
  };

  return {
    ctx,
    startMic,
    hasMic: () => analyser !== null,
    readPitch,
    setVoice,
    pluck,
    stop,
  };
}
