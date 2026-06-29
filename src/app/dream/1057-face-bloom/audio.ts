// ─────────────────────────────────────────────────────────────────────────────
// audio.ts — self-contained Web Audio organ/drone bank for 1057-face-bloom.
//
//   A polyphonic just-intonation organ: a few detuned sine/triangle voices in
//   a stacked-fifths chord, plus a soft sub pad, all run through a synthesized
//   convolution reverb (the impulse is generated in an OfflineAudioContext —
//   no external file) and a DynamicsCompressor limiter on the master.
//
//   The face plays it: jawOpen swells master gain + opens a lowpass; brow
//   raises brightness (a high-shelf + more partial gain). Everything is
//   parameter-smoothed so expression feels like breath, not a switch.
// ─────────────────────────────────────────────────────────────────────────────

export interface FaceAudio {
  ctx: AudioContext;
  /** jawOpen [0,1] → loudness + lowpass cutoff swell. */
  setSwell: (jawOpen: number) => void;
  /** browUp [0,1] → brightness (high shelf + upper-partial gain). */
  setBrightness: (browUp: number) => void;
  /** overall present/idle gate, [0,1]; idle = near-silent breath. */
  setPresence: (present: number) => void;
  /** smile [0,1] → adds a shimmering high voice. */
  setShimmer: (smile: number) => void;
  dispose: () => void;
}

// Just-intonation stacked-fifths chord over a low fundamental.
// 1/1, 3/2, 9/4(→9/8 octave), 5/4, 15/8, 3/1 — a warm open organ stack.
const RATIOS = [1, 3 / 2, 9 / 8, 5 / 4, 15 / 8, 3];
const BASE_HZ = 73.42; // ~D2, low warm fundamental

/** Build a soft synthetic reverb impulse response via OfflineAudioContext.
 *  Returns a stereo AudioBuffer (decaying filtered noise). */
async function makeReverbIR(ctx: AudioContext): Promise<AudioBuffer> {
  const seconds = 3.2;
  const rate = ctx.sampleRate;
  const len = Math.floor(rate * seconds);
  const off = new OfflineAudioContext(2, len, rate);

  // noise source
  const noiseBuf = off.createBuffer(2, len, rate);
  for (let ch = 0; ch < 2; ch++) {
    const d = noiseBuf.getChannelData(ch);
    for (let i = 0; i < len; i++) {
      d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / len, 2.6);
    }
  }
  const src = off.createBufferSource();
  src.buffer = noiseBuf;
  // gentle lowpass so the tail is warm, not hissy.
  const lp = off.createBiquadFilter();
  lp.type = "lowpass";
  lp.frequency.value = 2600;
  src.connect(lp).connect(off.destination);
  src.start();
  return off.startRendering();
}

export async function makeAudio(ctx: AudioContext): Promise<FaceAudio> {
  // ── master chain: bus → tone shelf → limiter → destination ──
  const master = ctx.createGain();
  master.gain.value = 0.0001;

  const shelf = ctx.createBiquadFilter();
  shelf.type = "highshelf";
  shelf.frequency.value = 1800;
  shelf.gain.value = -6; // start mellow

  const limiter = ctx.createDynamicsCompressor();
  limiter.threshold.value = -8;
  limiter.knee.value = 6;
  limiter.ratio.value = 12;
  limiter.attack.value = 0.003;
  limiter.release.value = 0.25;

  master.connect(shelf).connect(limiter).connect(ctx.destination);

  // gentle ramp-in
  master.gain.setValueAtTime(0.0001, ctx.currentTime);
  master.gain.exponentialRampToValueAtTime(0.45, ctx.currentTime + 1.4);

  // ── reverb send ──
  const conv = ctx.createConvolver();
  try {
    conv.buffer = await makeReverbIR(ctx);
  } catch {
    /* if offline render fails, run dry */
  }
  const wet = ctx.createGain();
  wet.gain.value = 0.5;
  const dry = ctx.createGain();
  dry.gain.value = 0.75;
  conv.connect(wet).connect(master);
  dry.connect(master);

  // ── the jaw-driven lowpass the whole organ passes through ──
  const tone = ctx.createBiquadFilter();
  tone.type = "lowpass";
  tone.frequency.value = 600;
  tone.Q.value = 0.5;
  tone.connect(dry);
  tone.connect(conv);

  // ── organ voices ──
  const oscs: OscillatorNode[] = [];
  const gains: GainNode[] = [];
  const baseLevels: number[] = [];
  for (let i = 0; i < RATIOS.length; i++) {
    const osc = ctx.createOscillator();
    osc.type = i % 2 === 0 ? "sine" : "triangle";
    osc.frequency.value = BASE_HZ * RATIOS[i];
    osc.detune.value = (i - RATIOS.length / 2) * 3; // tiny chorus spread
    const g = ctx.createGain();
    // lower partials carry more weight (organ-ish)
    const lvl = 0.16 / (1 + i * 0.5);
    baseLevels.push(lvl);
    g.gain.value = 0.0001;
    osc.connect(g).connect(tone);
    osc.start();
    oscs.push(osc);
    gains.push(g);
  }

  // ── soft sub pad ──
  const pad = ctx.createOscillator();
  pad.type = "sine";
  pad.frequency.value = BASE_HZ / 2;
  const padGain = ctx.createGain();
  padGain.gain.value = 0.0001;
  pad.connect(padGain).connect(tone);
  pad.start();

  // ── smile shimmer voice (high, comes in on a smile) ──
  const shimmer = ctx.createOscillator();
  shimmer.type = "sine";
  shimmer.frequency.value = BASE_HZ * 6; // two octaves + a fifth-ish
  const shimmerGain = ctx.createGain();
  shimmerGain.gain.value = 0.0001;
  shimmer.connect(shimmerGain).connect(tone);
  shimmer.start();

  let presence = 0;

  const apply = () => {
    // re-apply partial levels scaled by presence (idle = quiet breath)
    const tc = ctx.currentTime;
    for (let i = 0; i < gains.length; i++) {
      const lvl = Math.max(0.0001, baseLevels[i] * (0.1 + 0.9 * presence));
      gains[i].gain.setTargetAtTime(lvl, tc, 0.15);
    }
    padGain.gain.setTargetAtTime(Math.max(0.0001, 0.12 * (0.1 + 0.9 * presence)), tc, 0.2);
  };

  return {
    ctx,
    setSwell(jawOpen) {
      const tc = ctx.currentTime;
      // jaw opens lowpass (mellow → bright) and swells the master a touch.
      const cutoff = 400 + jawOpen * 4200;
      tone.frequency.setTargetAtTime(cutoff, tc, 0.1);
      const m = 0.35 + jawOpen * 0.35;
      master.gain.setTargetAtTime(m * (0.3 + 0.7 * presence), tc, 0.12);
    },
    setBrightness(browUp) {
      const tc = ctx.currentTime;
      shelf.gain.setTargetAtTime(-6 + browUp * 12, tc, 0.15); // -6 → +6 dB
    },
    setPresence(p) {
      presence = Math.max(0, Math.min(1, p));
      apply();
    },
    setShimmer(smile) {
      const tc = ctx.currentTime;
      shimmerGain.gain.setTargetAtTime(
        Math.max(0.0001, smile * 0.05 * (0.2 + 0.8 * presence)),
        tc,
        0.2,
      );
    },
    dispose() {
      try {
        master.gain.setTargetAtTime(0.0001, ctx.currentTime, 0.1);
      } catch {
        /* noop */
      }
      setTimeout(() => {
        [...oscs, pad, shimmer].forEach((o) => {
          try {
            o.stop();
          } catch {
            /* noop */
          }
        });
        try {
          ctx.close();
        } catch {
          /* noop */
        }
      }, 220);
    },
  };
}
