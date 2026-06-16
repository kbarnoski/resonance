// synth.ts — the whole sound of "glasswork", pure Web Audio, no samples.
//
// Signal graph:
//
//   melody bell ─┐
//   4 pad voices ─┼─► dry sum ──────────────────────┐
//   sub          ─┘                                  ├─► limiter ─► master ─► out
//                  └─► reverb send ─► convolver ──────┤
//                  └─► shimmer send ─► delay ↺ filter ┘
//
//   - bell: FM-ish (carrier sine + modulator) with fast attack / long decay.
//   - pad voices: glassy triangle+sine pair per voice; frequency PORTAMENTOs
//     (audible glide) when the voice-leading engine retargets it.
//   - sub: soft sine on the harmony root, an octave low.
//   - reverb: ConvolverNode fed a synthetic decaying-noise impulse.
//   - shimmer: filtered feedback delay for the glassy tail.
//   - limiter: DynamicsCompressor brick wall so it can never blast/clip.

import { midiToFreq } from "./theory";

export interface VoiceNode {
  osc1: OscillatorNode;
  osc2: OscillatorNode;
  gain: GainNode;
  currentMidi: number;
}

export interface GlassworkSynth {
  ctx: AudioContext;
  master: GainNode;
  dryBus: GainNode;
  reverbSend: GainNode;
  shimmerSend: GainNode;
  voices: VoiceNode[];
  setMasterGain: (g: number) => void;
  setShimmer: (amount01: number) => void;
  glideVoice: (i: number, midi: number, glideSec: number) => void;
  pluckBell: (midi: number, velocity: number, bright: number) => void;
  setSubRoot: (midi: number, glideSec: number) => void;
  teardown: () => void;
}

// Build a synthetic reverb impulse: exponentially decaying stereo noise.
function makeImpulse(ctx: AudioContext, seconds: number, decay: number): AudioBuffer {
  const rate = ctx.sampleRate;
  const len = Math.max(1, Math.floor(seconds * rate));
  const buf = ctx.createBuffer(2, len, rate);
  for (let ch = 0; ch < 2; ch++) {
    const data = buf.getChannelData(ch);
    for (let i = 0; i < len; i++) {
      const env = Math.pow(1 - i / len, decay);
      data[i] = (Math.random() * 2 - 1) * env;
    }
  }
  return buf;
}

export function createSynth(ctx: AudioContext): GlassworkSynth {
  // ── Master + limiter ──────────────────────────────────────────────────
  const master = ctx.createGain();
  master.gain.value = 0.34; // ≤ ~0.4 per spec

  const limiter = ctx.createDynamicsCompressor();
  limiter.threshold.value = -6;
  limiter.knee.value = 1;
  limiter.ratio.value = 12; // brick-wall-ish
  limiter.attack.value = 0.003;
  limiter.release.value = 0.18;
  limiter.connect(master);
  master.connect(ctx.destination);

  // ── Buses ───────────────────────────────────────────────────────────────
  const dryBus = ctx.createGain();
  dryBus.gain.value = 0.85;
  dryBus.connect(limiter);

  // Reverb: convolver fed a synthetic impulse.
  const convolver = ctx.createConvolver();
  convolver.buffer = makeImpulse(ctx, 4.2, 3.0);
  const reverbSend = ctx.createGain();
  reverbSend.gain.value = 0.5;
  const reverbReturn = ctx.createGain();
  reverbReturn.gain.value = 0.9;
  reverbSend.connect(convolver);
  convolver.connect(reverbReturn);
  reverbReturn.connect(limiter);

  // Shimmer: filtered feedback delay.
  const shimmerSend = ctx.createGain();
  shimmerSend.gain.value = 0.2;
  const delay = ctx.createDelay(1.5);
  delay.delayTime.value = 0.42;
  const feedback = ctx.createGain();
  feedback.gain.value = 0.45;
  const delayFilter = ctx.createBiquadFilter();
  delayFilter.type = "bandpass";
  delayFilter.frequency.value = 2200;
  delayFilter.Q.value = 0.7;
  const shimmerReturn = ctx.createGain();
  shimmerReturn.gain.value = 0.6;
  shimmerSend.connect(delay);
  delay.connect(delayFilter);
  delayFilter.connect(feedback);
  feedback.connect(delay); // feedback loop
  delayFilter.connect(shimmerReturn);
  shimmerReturn.connect(limiter);
  // shimmer also gets a touch of reverb for glassiness
  shimmerReturn.connect(reverbSend);

  // ── Pad voices (4) — glassy triangle+sine pairs with portamento ─────────
  const voices: VoiceNode[] = [];
  const initialMidi = [38, 53, 60, 65];
  for (let i = 0; i < 4; i++) {
    const osc1 = ctx.createOscillator();
    osc1.type = "triangle";
    const osc2 = ctx.createOscillator();
    osc2.type = "sine";
    const f = midiToFreq(initialMidi[i]);
    osc1.frequency.value = f;
    osc2.frequency.value = f * 2.001; // slightly detuned octave for shimmer
    const gain = ctx.createGain();
    // Lower voices a little quieter so the chord doesn't get bottom-heavy.
    gain.gain.value = 0.0; // swells up after start
    const lp = ctx.createBiquadFilter();
    lp.type = "lowpass";
    lp.frequency.value = 2600;
    lp.Q.value = 0.4;
    osc1.connect(gain);
    osc2.connect(gain);
    gain.connect(lp);
    lp.connect(dryBus);
    lp.connect(reverbSend);
    lp.connect(shimmerSend);
    osc1.start();
    osc2.start();
    voices.push({ osc1, osc2, gain, currentMidi: initialMidi[i] });
  }

  // Swell pad voices in gently after a beat.
  const padPeak = [0.10, 0.11, 0.12, 0.12];
  const now0 = ctx.currentTime;
  voices.forEach((v, i) => {
    v.gain.gain.setValueAtTime(0.0001, now0);
    v.gain.gain.linearRampToValueAtTime(padPeak[i], now0 + 3.0);
  });

  // ── Sub: soft sine on the harmony root, low ─────────────────────────────
  const sub = ctx.createOscillator();
  sub.type = "sine";
  sub.frequency.value = midiToFreq(26); // ~D1
  const subGain = ctx.createGain();
  subGain.gain.value = 0.0001;
  sub.connect(subGain);
  subGain.connect(dryBus);
  subGain.connect(reverbSend);
  sub.start();
  subGain.gain.linearRampToValueAtTime(0.06, now0 + 4.0);

  // ── Methods ─────────────────────────────────────────────────────────────
  const glideVoice = (i: number, midi: number, glideSec: number): void => {
    const v = voices[i];
    if (!v) return;
    const t = ctx.currentTime;
    const f = midiToFreq(midi);
    // exponential portamento — audibly glides to the nearest tone
    v.osc1.frequency.cancelScheduledValues(t);
    v.osc2.frequency.cancelScheduledValues(t);
    v.osc1.frequency.setValueAtTime(Math.max(1, v.osc1.frequency.value), t);
    v.osc2.frequency.setValueAtTime(Math.max(1, v.osc2.frequency.value), t);
    v.osc1.frequency.exponentialRampToValueAtTime(f, t + glideSec);
    v.osc2.frequency.exponentialRampToValueAtTime(f * 2.001, t + glideSec);
    // tiny re-bloom of the voice gain on retarget so the move is felt
    const peak = padPeak[i];
    v.gain.gain.cancelScheduledValues(t);
    v.gain.gain.setValueAtTime(Math.max(0.0001, v.gain.gain.value), t);
    v.gain.gain.linearRampToValueAtTime(peak * 1.25, t + glideSec * 0.4);
    v.gain.gain.linearRampToValueAtTime(peak, t + glideSec + 0.4);
    v.currentMidi = midi;
  };

  const setSubRoot = (midi: number, glideSec: number): void => {
    const t = ctx.currentTime;
    const f = midiToFreq(midi - 12); // an octave below the chord root
    sub.frequency.cancelScheduledValues(t);
    sub.frequency.setValueAtTime(Math.max(1, sub.frequency.value), t);
    sub.frequency.exponentialRampToValueAtTime(Math.max(20, f), t + glideSec);
  };

  const pluckBell = (midi: number, velocity: number, bright: number): void => {
    const t = ctx.currentTime;
    const f = midiToFreq(midi);
    // FM-ish music-box bell: carrier + modulator.
    const carrier = ctx.createOscillator();
    carrier.type = "sine";
    carrier.frequency.value = f;
    const mod = ctx.createOscillator();
    mod.type = "sine";
    // inharmonic-ish ratio for a bell/glass timbre
    mod.frequency.value = f * (3.0 + bright * 0.5);
    const modGain = ctx.createGain();
    const modIndex = f * (1.4 + bright * 1.2);
    modGain.gain.setValueAtTime(modIndex, t);
    modGain.gain.exponentialRampToValueAtTime(modIndex * 0.05, t + 0.9);
    mod.connect(modGain);
    modGain.connect(carrier.frequency);

    const amp = ctx.createGain();
    const peak = 0.18 * velocity;
    const decay = 1.8 + bright * 1.2;
    amp.gain.setValueAtTime(0.0001, t);
    amp.gain.exponentialRampToValueAtTime(peak, t + 0.006); // fast attack
    amp.gain.exponentialRampToValueAtTime(0.0001, t + decay); // long decay

    const tone = ctx.createBiquadFilter();
    tone.type = "lowpass";
    tone.frequency.value = 3500 + bright * 3500;

    carrier.connect(amp);
    amp.connect(tone);
    tone.connect(dryBus);
    tone.connect(reverbSend);
    tone.connect(shimmerSend);

    carrier.start(t);
    mod.start(t);
    carrier.stop(t + decay + 0.2);
    mod.stop(t + decay + 0.2);
    // auto-disconnect after the note finishes
    carrier.onended = () => {
      try {
        carrier.disconnect();
        mod.disconnect();
        modGain.disconnect();
        amp.disconnect();
        tone.disconnect();
      } catch {
        /* already gone */
      }
    };
  };

  const setMasterGain = (g: number): void => {
    master.gain.setTargetAtTime(Math.min(0.4, Math.max(0, g)), ctx.currentTime, 0.3);
  };

  const setShimmer = (amount01: number): void => {
    const a = Math.min(1, Math.max(0, amount01));
    shimmerSend.gain.setTargetAtTime(0.12 + a * 0.28, ctx.currentTime, 0.4);
    feedback.gain.setTargetAtTime(0.35 + a * 0.25, ctx.currentTime, 0.4);
  };

  const teardown = (): void => {
    try {
      voices.forEach((v) => {
        try {
          v.osc1.stop();
        } catch {
          /* */
        }
        try {
          v.osc2.stop();
        } catch {
          /* */
        }
        v.osc1.disconnect();
        v.osc2.disconnect();
        v.gain.disconnect();
      });
      try {
        sub.stop();
      } catch {
        /* */
      }
      sub.disconnect();
      subGain.disconnect();
      dryBus.disconnect();
      reverbSend.disconnect();
      convolver.disconnect();
      reverbReturn.disconnect();
      shimmerSend.disconnect();
      delay.disconnect();
      delayFilter.disconnect();
      feedback.disconnect();
      shimmerReturn.disconnect();
      limiter.disconnect();
      master.disconnect();
    } catch {
      /* best effort */
    }
  };

  return {
    ctx,
    master,
    dryBus,
    reverbSend,
    shimmerSend,
    voices,
    setMasterGain,
    setShimmer,
    glideVoice,
    pluckBell,
    setSubRoot,
    teardown,
  };
}
