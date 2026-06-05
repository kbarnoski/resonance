// audio.ts — Web Audio API only. No libraries, no fetched files.
//
// SAFE-FOR-KIDS signal chain:
//   [drone + plucks + pad] -> reverb (generated impulse) + dry
//        -> masterGain (~0.5) -> DynamicsCompressor (brick-wall limiter) -> out
// Everything is limited so it can NEVER blast. No harsh transients.
//
// SCALE: D Lydian (D E F# G# A B C#) over a low D drone. Lydian's raised 4th
// gives a bright, dreamy, "floating" colour that is decidedly NOT the banned
// C-major pentatonic. We journey through a short modal chord progression so the
// garden's harmonic colour drifts over the session (a new chord ~every 40s).

const A4 = 440;

/** Convert a MIDI note number to Hz. */
function midiToHz(m: number): number {
  return A4 * Math.pow(2, (m - 69) / 12);
}

// D Lydian scale degrees as semitone offsets from D.
// D=0, E=2, F#=4, G#=6, A=7, B=9, C#=11
const LYDIAN_OFFSETS = [0, 2, 4, 6, 7, 9, 11];
const ROOT_MIDI = 50; // D3

/** A short, gentle chord progression *within* D Lydian. Each chord is a set of
 *  scale-degree indices (into LYDIAN_OFFSETS) at a chosen octave. The garden
 *  blooms notes from the CURRENT chord, so the harmonic colour evolves. */
const PROGRESSION: { degrees: number[]; label: string }[] = [
  { degrees: [0, 2, 4], label: "I (D)" }, // D F# A
  { degrees: [1, 3, 5], label: "ii (Em)" }, // E G# B
  { degrees: [5, 0, 2], label: "vi-ish (Bm/D)" }, // B D F#
  { degrees: [3, 5, 0], label: "IV (G#dim→home)" }, // G# B D
];
const CHORD_SECONDS = 40;

export interface AudioEngine {
  /** Pluck a note from the CURRENT chord. degree picks which chord tone. */
  pluck: (chordToneIndex: number, octaveShift: number, gain: number) => void;
  /** Advance harmonic state. Returns the current chord index (0..n-1). */
  step: (dtSeconds: number) => number;
  /** Hue (deg) for the current chord — drives the bloom/sky palette. */
  currentHue: () => number;
  /** Number of tones in the current chord (for noteFor). */
  chordSize: () => number;
  /** Begin the always-on root drone + pad. */
  startDrone: () => void;
  /** Slide everything to a soft lullaby (lower, quieter) — end of session. */
  lullaby: () => void;
  /** Full teardown: disconnect nodes, no leaks. (Context closed by caller.) */
  dispose: () => void;
}

/** Build a short, smooth generated reverb impulse (no fetched files). */
function buildImpulse(ctx: AudioContext, seconds: number, decay: number): AudioBuffer {
  const rate = ctx.sampleRate;
  const len = Math.floor(rate * seconds);
  const buf = ctx.createBuffer(2, len, rate);
  for (let ch = 0; ch < 2; ch++) {
    const data = buf.getChannelData(ch);
    for (let i = 0; i < len; i++) {
      // Decaying noise tail -> a soft hall.
      data[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / len, decay);
    }
  }
  return buf;
}

export function createAudioEngine(ctx: AudioContext): AudioEngine {
  // --- master / safety chain -------------------------------------------------
  const limiter = ctx.createDynamicsCompressor();
  limiter.threshold.value = -6; // brick-wall-ish
  limiter.knee.value = 0;
  limiter.ratio.value = 20;
  limiter.attack.value = 0.003;
  limiter.release.value = 0.25;

  const master = ctx.createGain();
  master.gain.value = 0.5; // modest master — can never blast
  master.connect(limiter);
  limiter.connect(ctx.destination);

  // --- reverb send -----------------------------------------------------------
  const reverb = ctx.createConvolver();
  reverb.buffer = buildImpulse(ctx, 3.2, 2.6);
  const reverbGain = ctx.createGain();
  reverbGain.gain.value = 0.32;
  reverb.connect(reverbGain);
  reverbGain.connect(master);

  // Bus that voices write to (dry + into reverb).
  const bus = ctx.createGain();
  bus.gain.value = 1;
  bus.connect(master);
  bus.connect(reverb);

  // --- harmonic state --------------------------------------------------------
  let elapsed = 0;
  let chordIndex = 0;

  function step(dt: number): number {
    elapsed += dt;
    chordIndex = Math.floor(elapsed / CHORD_SECONDS) % PROGRESSION.length;
    return chordIndex;
  }

  function chordSize(): number {
    return PROGRESSION[chordIndex].degrees.length;
  }

  // Hue drifts with the progression; each chord gets a calm, distinct dusk hue.
  const CHORD_HUES = [275, 205, 320, 250]; // violet, teal, magenta, indigo
  function currentHue(): number {
    return CHORD_HUES[chordIndex % CHORD_HUES.length];
  }

  // --- root drone + soft pad -------------------------------------------------
  let droneGain: GainNode | null = null;
  function startDrone() {
    if (droneGain) return;
    droneGain = ctx.createGain();
    droneGain.gain.value = 0;
    droneGain.connect(master);
    droneGain.connect(reverb);

    // Two slightly detuned low sines = a warm, breathing root D.
    const freqs = [midiToHz(ROOT_MIDI - 12), midiToHz(ROOT_MIDI - 12) * 1.005];
    for (const f of freqs) {
      const osc = ctx.createOscillator();
      osc.type = "sine";
      osc.frequency.value = f;
      const g = ctx.createGain();
      g.gain.value = 0.5;
      // gentle LFO breathing
      const lfo = ctx.createOscillator();
      lfo.frequency.value = 0.07;
      const lfoGain = ctx.createGain();
      lfoGain.gain.value = 0.12;
      lfo.connect(lfoGain);
      lfoGain.connect(g.gain);
      osc.connect(g);
      g.connect(droneGain);
      osc.start();
      lfo.start();
    }
    // Fade the drone in so it's never a sudden onset.
    droneGain.gain.linearRampToValueAtTime(0.18, ctx.currentTime + 2.5);
  }

  // --- Karplus-Strong soft pluck --------------------------------------------
  // A short noise burst through a feedback delay = a plucked-string mallet.
  function pluck(chordToneIndex: number, octaveShift: number, gain: number): void {
    const chord = PROGRESSION[chordIndex].degrees;
    const degIdx = chord[((chordToneIndex % chord.length) + chord.length) % chord.length];
    const semis = LYDIAN_OFFSETS[degIdx % LYDIAN_OFFSETS.length];
    const midi = ROOT_MIDI + semis + 12 * octaveShift + 12; // up an octave so it sits above the drone
    const hz = midiToHz(midi);
    const now = ctx.currentTime;

    // Excitation: a tiny filtered noise burst.
    const burstLen = 0.02;
    const buf = ctx.createBuffer(1, Math.floor(ctx.sampleRate * burstLen), ctx.sampleRate);
    const data = buf.getChannelData(0);
    for (let i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1;
    const burst = ctx.createBufferSource();
    burst.buffer = buf;

    const delay = ctx.createDelay(0.05);
    delay.delayTime.value = 1 / hz; // string length = period

    const feedback = ctx.createGain();
    feedback.gain.value = 0.965; // decay length

    // Lowpass in the feedback loop = damping (softer, no harsh high ringing).
    const damp = ctx.createBiquadFilter();
    damp.type = "lowpass";
    damp.frequency.value = 2400;

    const out = ctx.createGain();
    const vol = Math.max(0.04, Math.min(0.5, gain)) * 0.5;
    out.gain.setValueAtTime(0.0001, now);
    out.gain.exponentialRampToValueAtTime(vol, now + 0.005);
    out.gain.exponentialRampToValueAtTime(0.0001, now + 2.2);

    burst.connect(delay);
    delay.connect(damp);
    damp.connect(feedback);
    feedback.connect(delay); // KS feedback loop
    damp.connect(out);
    out.connect(bus);

    burst.start(now);
    burst.stop(now + burstLen);
    // Stop the loop cleanly after the note has decayed (no leaks).
    setTimeout(() => {
      try {
        out.disconnect();
        feedback.disconnect();
        delay.disconnect();
        damp.disconnect();
      } catch {
        /* already gone */
      }
    }, 2600);
  }

  function lullaby(): void {
    // Quieter, lower, slower — drift the master down to a hush.
    const now = ctx.currentTime;
    master.gain.cancelScheduledValues(now);
    master.gain.setValueAtTime(master.gain.value, now);
    master.gain.linearRampToValueAtTime(0.22, now + 12);
    if (droneGain) {
      droneGain.gain.linearRampToValueAtTime(0.1, now + 12);
    }
  }

  function dispose(): void {
    try {
      bus.disconnect();
      reverb.disconnect();
      reverbGain.disconnect();
      master.disconnect();
      limiter.disconnect();
      droneGain?.disconnect();
    } catch {
      /* ignore */
    }
  }

  return {
    pluck,
    step,
    currentHue,
    chordSize,
    startDrone,
    lullaby,
    dispose,
  };
}

export const PROGRESSION_INFO = PROGRESSION.map((p) => p.label);
export const SCALE_NAME = "D Lydian (D E F# G# A B C#) over a low D drone";
