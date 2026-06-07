// Web Audio engine for the firefly chorus — D-Dorian lullaby, toddler-safe.
//
// - Always-on warm pad bed (D + A) so it is never silent.
// - Each firefly flash → a soft sine "bell" note in D-Dorian.
//     · un-synced firefly (low local r) → scattered pitches across the scale
//     · synced cluster (high local r)   → pitches pull toward a shared triad,
//       so a locked cluster sings one pulsing chord.
// - Everything routed through a DynamicsCompressor brick-wall limiter so it
//   can never blast a toddler's ears.
// - Voice-pooled + per-firefly refractory + on-screen gate so hundreds of
//   flashes never become a machine-gun.
//
// D-Dorian: D E F G A B C  (explicitly NOT C-major-pentatonic).

// D-Dorian pitches across a gentle lullaby range (Hz).
const D_DORIAN_HZ = [
  146.83, // D3
  164.81, // E3
  174.61, // F3
  196.0, // G3
  220.0, // A3
  246.94, // B3
  261.63, // C4
  293.66, // D4
  329.63, // E4
  349.23, // F4
  392.0, // G4
  440.0, // A4
];

// When a cluster is synced, its notes settle onto the Dorian tonic triad
// (D F A) spread across octaves → a locked cluster sings one chord.
const SYNC_TRIAD_HZ = [146.83, 174.61, 220.0, 293.66, 349.23, 440.0];

const MAX_VOICES = 14; // simultaneous bell voices in the pool

export interface AudioEngine {
  resume(): void;
  /**
   * Trigger a flash note.
   * @param pitchSeed  stable per-firefly 0..1 → picks a scale degree
   * @param localR     0..1 local synchrony → blends toward the shared triad
   * @param pan        -1..1 stereo position from screen x
   * @param gain       0..1 overall loudness
   */
  flash(pitchSeed: number, localR: number, pan: number, gain: number): void;
  /** call once per frame: drives the slow goodnight fade after ~12 min */
  tick(elapsedSec: number): void;
  dispose(): void;
}

export function makeAudioEngine(ctx: AudioContext): AudioEngine {
  // ── Master chain: tone → bus → limiter → destination ──
  const master = ctx.createGain();
  master.gain.value = 1;

  const limiter = ctx.createDynamicsCompressor();
  limiter.threshold.value = -10;
  limiter.knee.value = 6;
  limiter.ratio.value = 14; // brick-wall
  limiter.attack.value = 0.003;
  limiter.release.value = 0.25;

  master.connect(limiter);
  limiter.connect(ctx.destination);

  // Gentle low-pass on the whole mix → no harsh highs for little ears.
  const tone = ctx.createBiquadFilter();
  tone.type = "lowpass";
  tone.frequency.value = 4200;
  tone.Q.value = 0.5;
  tone.connect(master);

  // ── Always-on pad bed: D + A drone, two detuned sines each ──
  const padGain = ctx.createGain();
  padGain.gain.value = 0;
  padGain.connect(tone);
  padGain.gain.setValueAtTime(0, ctx.currentTime);
  padGain.gain.linearRampToValueAtTime(0.05, ctx.currentTime + 3.5);

  const padOscs: OscillatorNode[] = [];
  const padLfo = ctx.createOscillator();
  const padLfoGain = ctx.createGain();
  padLfo.frequency.value = 0.08; // very slow breathing
  padLfoGain.gain.value = 0.012;
  padLfo.connect(padLfoGain);
  padLfoGain.connect(padGain.gain);
  padLfo.start();

  [73.42, 73.86, 110.0, 110.4].forEach((hz) => {
    const o = ctx.createOscillator();
    o.type = "sine";
    o.frequency.value = hz;
    const g = ctx.createGain();
    g.gain.value = 0.5;
    o.connect(g);
    g.connect(padGain);
    o.start();
    padOscs.push(o);
  });

  // ── Bell voice pool ── (round-robin gain nodes; oscillators are per-note)
  let voiceCursor = 0;
  const voices: GainNode[] = [];
  for (let i = 0; i < MAX_VOICES; i++) {
    const g = ctx.createGain();
    g.gain.value = 0;
    g.connect(tone);
    voices.push(g);
  }

  function flash(pitchSeed: number, localR: number, pan: number, gain: number) {
    const scattered =
      D_DORIAN_HZ[(pitchSeed * D_DORIAN_HZ.length) | 0] ?? D_DORIAN_HZ[0];
    const triad =
      SYNC_TRIAD_HZ[(pitchSeed * SYNC_TRIAD_HZ.length) | 0] ?? SYNC_TRIAD_HZ[0];
    const r = Math.max(0, Math.min(1, localR));
    // Blend pitch toward the triad as local synchrony rises.
    const hz = scattered * (1 - r) + triad * r;

    const slotGain = voices[voiceCursor];
    voiceCursor = (voiceCursor + 1) % MAX_VOICES;

    const t = ctx.currentTime;
    const osc = ctx.createOscillator();
    osc.type = "sine";
    osc.frequency.value = hz;

    const panner = ctx.createStereoPanner();
    panner.pan.value = Math.max(-1, Math.min(1, pan));

    osc.connect(panner);
    panner.connect(slotGain);

    // Soft attack, long release → bell/twinkle. Synced notes ring a touch
    // longer & louder so the chord "blooms".
    const peak = (0.05 + 0.05 * r) * Math.max(0, Math.min(1, gain));
    const rel = 0.9 + 1.1 * r;
    slotGain.gain.cancelScheduledValues(t);
    slotGain.gain.setValueAtTime(0, t);
    slotGain.gain.linearRampToValueAtTime(peak, t + 0.03);
    slotGain.gain.exponentialRampToValueAtTime(0.0001, t + 0.03 + rel);

    osc.start(t);
    osc.stop(t + 0.06 + rel);
    osc.onended = () => {
      try {
        osc.disconnect();
        panner.disconnect();
      } catch {
        /* already gone */
      }
    };
  }

  // ── Goodnight fade after ~12 min ──
  let faded = false;
  function tick(elapsedSec: number) {
    if (!faded && elapsedSec > 12 * 60) {
      faded = true;
      const t = ctx.currentTime;
      master.gain.cancelScheduledValues(t);
      master.gain.setValueAtTime(master.gain.value, t);
      master.gain.linearRampToValueAtTime(0.25, t + 90); // slow lullaby dim
    }
  }

  function resume() {
    if (ctx.state === "suspended") ctx.resume().catch(() => {});
  }

  function dispose() {
    try {
      padOscs.forEach((o) => o.stop());
      padLfo.stop();
    } catch {
      /* already stopped */
    }
    try {
      master.disconnect();
      limiter.disconnect();
      tone.disconnect();
    } catch {
      /* noop */
    }
  }

  return { resume, flash, tick, dispose };
}
