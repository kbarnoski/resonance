// audio.ts — Web Audio engine for the commons.
//
// Two layers:
//  1. A 4-voice drone "bed" that sustains the current chord and glides
//     (portamento, not a cut) whenever the shared harmony drifts to its
//     next chord.
//  2. Contribution voices — one short warm tone per hum/tap, from anyone
//     present, glided softly toward the shared framework and dropped into
//     a shared reverb tail so every contribution audibly joins one field.
//
// No audio ever crosses the network — only the tiny {pitch, strength, beat}
// intent messages (see net.ts). Every browser re-synthesises locally.

import { bedFreqs, mulberry32 } from "./harmony";

type AnyAudioContext = AudioContext;

function getCtor(): typeof AudioContext {
  return (
    window.AudioContext ||
    (window as unknown as { webkitAudioContext: typeof AudioContext })
      .webkitAudioContext
  );
}

/** Synthesized reverb impulse — exponentially decaying seeded noise.
 *  Deterministic (mulberry32), never Math.random(). */
function buildImpulse(ctx: AnyAudioContext, seconds: number, seed: number): AudioBuffer {
  const rng = mulberry32(seed);
  const rate = ctx.sampleRate;
  const len = Math.floor(rate * seconds);
  const buf = ctx.createBuffer(2, len, rate);
  for (let ch = 0; ch < 2; ch++) {
    const data = buf.getChannelData(ch);
    for (let i = 0; i < len; i++) {
      const t = i / len;
      data[i] = (rng() * 2 - 1) * Math.pow(1 - t, 2.4);
    }
  }
  return buf;
}

interface BedVoice {
  osc: OscillatorNode;
  detuneOsc: OscillatorNode;
  gain: GainNode;
}

export interface CommonsAudio {
  resume(): Promise<void>;
  /** Glide the drone bed to a new chord (called whenever the shared clock
   *  advances to the next chord). */
  setChord(chordIndex: number): void;
  /** Play one contribution voice at `freq` Hz. `strength` 0..1 sets gain
   *  and sustain length. `presence` only affects stereo placement so the
   *  two participants sit gently apart in the field. */
  contribute(presence: 0 | 1, freq: number, strength: number): void;
  close(): void;
}

export function createCommonsAudio(): CommonsAudio {
  const Ctor = getCtor();
  const ctx = new Ctor();

  // Master chain: soft compressor -> clamped master gain.
  const comp = ctx.createDynamicsCompressor();
  comp.threshold.value = -20;
  comp.knee.value = 26;
  comp.ratio.value = 3;
  comp.attack.value = 0.012;
  comp.release.value = 0.3;

  const master = ctx.createGain();
  master.gain.value = 0.3;
  comp.connect(master).connect(ctx.destination);

  // Shared reverb send — the "room" every contribution lands in.
  const convolver = ctx.createConvolver();
  convolver.buffer = buildImpulse(ctx, 3.2, 0x3504c0);
  const wet = ctx.createGain();
  wet.gain.value = 0.32;
  convolver.connect(wet).connect(comp);

  // A slow feedback delay for extra roominess / communal air.
  const delay = ctx.createDelay(1.2);
  delay.delayTime.value = 0.62;
  const fb = ctx.createGain();
  fb.gain.value = 0.3;
  const delaySend = ctx.createGain();
  delaySend.gain.value = 0.16;
  delay.connect(fb).connect(delay);
  delay.connect(comp);
  delaySend.connect(delay);

  // ── Drone bed: 4 persistent voices, one per chord tone slot ─────────────
  const bedBus = ctx.createGain();
  bedBus.gain.value = 1;
  bedBus.connect(comp);
  bedBus.connect(delaySend);
  bedBus.connect(convolver);

  const bedVoices: BedVoice[] = [];
  const initialFreqs = bedFreqs(0);
  for (let i = 0; i < 4; i++) {
    const osc = ctx.createOscillator();
    osc.type = "triangle";
    osc.frequency.value = initialFreqs[i] ?? initialFreqs[initialFreqs.length - 1];

    // A slow LFO on detune gives the bed a gentle communal chorus/breathing
    // shimmer rather than a static drone.
    const detuneOsc = ctx.createOscillator();
    detuneOsc.type = "sine";
    detuneOsc.frequency.value = 0.05 + i * 0.017;
    const detuneGain = ctx.createGain();
    detuneGain.gain.value = 4 + i * 1.3;
    detuneOsc.connect(detuneGain).connect(osc.detune);

    const gain = ctx.createGain();
    gain.gain.value = 0.07;
    osc.connect(gain).connect(bedBus);

    osc.start();
    detuneOsc.start();
    bedVoices.push({ osc, detuneOsc, gain });
  }

  function setChord(chordIndex: number): void {
    const freqs = bedFreqs(chordIndex);
    const now = ctx.currentTime;
    for (let i = 0; i < bedVoices.length; i++) {
      const target = freqs[i] ?? freqs[freqs.length - 1];
      // setTargetAtTime for a smooth, un-clicked glide — the audible
      // signature of "drifting" harmony.
      bedVoices[i].osc.frequency.setTargetAtTime(target, now, 1.4);
    }
  }

  // ── Contribution voices ──────────────────────────────────────────────────
  let voiceCount = 0;
  const MAX_VOICES = 14;

  function contribute(presence: 0 | 1, freq: number, strength: number): void {
    if (voiceCount >= MAX_VOICES) return;
    const now = ctx.currentTime;
    const s = Math.max(0.15, Math.min(1, strength));

    const osc = ctx.createOscillator();
    osc.type = "sine";
    const partial = ctx.createOscillator();
    partial.type = "triangle";
    partial.frequency.value = freq * 2.003; // faint upper partial, warmth

    // Arrive from slightly below — a gentle glide into the target pitch
    // rather than a hard onset, echoing the "no snap, just company" feel.
    const startFreq = freq * 0.965;
    osc.frequency.setValueAtTime(startFreq, now);
    osc.frequency.exponentialRampToValueAtTime(freq, now + 0.5 + s * 0.25);
    partial.frequency.setValueAtTime(startFreq * 2.003, now);
    partial.frequency.exponentialRampToValueAtTime(
      freq * 2.003,
      now + 0.5 + s * 0.25
    );

    const partialGain = ctx.createGain();
    partialGain.gain.value = 0.1 + s * 0.08;

    const vca = ctx.createGain();
    const peak = 0.1 + s * 0.24;
    const sustain = 1.1 + s * 1.1;
    const release = 1.6 + s * 1.8;
    vca.gain.setValueAtTime(0.0001, now);
    vca.gain.exponentialRampToValueAtTime(peak, now + 0.09);
    vca.gain.setTargetAtTime(peak * 0.75, now + 0.09, 0.5);
    vca.gain.setTargetAtTime(0.0001, now + sustain, release / 3);

    const pan = ctx.createStereoPanner();
    pan.pan.value = presence === 0 ? -0.22 : 0.22;

    osc.connect(vca);
    partial.connect(partialGain).connect(vca);
    vca.connect(pan);
    pan.connect(comp);
    pan.connect(convolver);
    pan.connect(delaySend);

    voiceCount++;
    osc.start(now);
    partial.start(now);
    const stopAt = now + sustain + release + 0.3;
    osc.stop(stopAt);
    partial.stop(stopAt);
    osc.onended = () => {
      voiceCount = Math.max(0, voiceCount - 1);
      osc.disconnect();
      partial.disconnect();
      partialGain.disconnect();
      vca.disconnect();
      pan.disconnect();
    };
  }

  async function resume(): Promise<void> {
    if (ctx.state === "suspended") {
      await ctx.resume();
    }
  }

  function close(): void {
    try {
      master.gain.cancelScheduledValues(ctx.currentTime);
      master.gain.setValueAtTime(0, ctx.currentTime);
    } catch {
      /* ignore */
    }
    for (const v of bedVoices) {
      try {
        v.osc.stop();
        v.detuneOsc.stop();
      } catch {
        /* already stopped */
      }
    }
    setTimeout(() => {
      void ctx.close().catch(() => {
        /* ignore */
      });
    }, 150);
  }

  return { resume, setChord, contribute, close };
}
