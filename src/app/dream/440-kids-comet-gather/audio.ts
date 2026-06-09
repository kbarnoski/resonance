/**
 * audio.ts — Comet Gather lullaby audio engine
 *
 * Architecture:
 *   AudioContext → DynamicsCompressor → masterGain → destination
 *
 * Channels:
 *   1. Ambient pad  (root + fifth, always on after start)
 *   2. Per-gathered-mote voices  (pentatonic, spatial StereoPanner)
 *   3. Gather chime  (one-shot bell on capture)
 *
 * Long-form evolution:
 *   - A slow "rootDrift" cycle (~8 min) modulates the pad's root frequency
 *     through a few pentatonic-friendly centres (D2 → E2 → A2 → D2)
 *   - A slow LFO (~4 min cycle) gently opens/closes a BiquadFilter on the pad
 *   - Each gathered voice re-arpeggiation rate shifts with a per-voice LFO
 *     that uses the elapsed clock, so voices sound different over time
 *   - After ~12 min a "goodnight" fade begins, settling all voices to silence
 */

// D major pentatonic: D E F# A B across two octaves
// All consonant — any subset harmonizes.
export const MOTE_FREQS: readonly number[] = [
  146.83, // D3
  164.81, // E3
  185.00, // F#3
  220.00, // A3
  246.94, // B3
  293.66, // D4
  329.63, // E4
  369.99, // F#4
  440.00, // A4
  493.88, // B4
  587.33, // D5
  659.25, // E5
  739.99, // F#5
  880.00, // A5
];

// Pad root + fifth positions (cycled over long-form drift)
// Each entry: [root, fifth] in Hz
const PAD_ROOTS: ReadonlyArray<[number, number]> = [
  [73.42,  110.00], // D2 + A2
  [82.41,  123.47], // E2 + B2
  [110.00, 164.81], // A2 + E3
  [73.42,  110.00], // back to D2 (cycle)
];

const GOODNIGHT_START_S = 12 * 60; // 12 min
const GOODNIGHT_DUR_S   =  2 * 60; // 2-min fade

export interface LullabyAudio {
  ctx: AudioContext;
  masterGain: GainNode;
  compressor: DynamicsCompressorNode;
  /** seconds since audio start — for long-form tracking */
  elapsedSeconds: () => number;
  suspend: () => void;
  resume: () => void;
}

export function buildAudio(): LullabyAudio {
  const ctx = new AudioContext();

  const compressor = ctx.createDynamicsCompressor();
  compressor.threshold.value = -16;
  compressor.knee.value      =   8;
  compressor.ratio.value     =  14;
  compressor.attack.value    = 0.003;
  compressor.release.value   = 0.22;
  compressor.connect(ctx.destination);

  const masterGain = ctx.createGain();
  masterGain.gain.value = 0.52;
  masterGain.connect(compressor);

  const startWall = ctx.currentTime;

  return {
    ctx,
    masterGain,
    compressor,
    elapsedSeconds: () => ctx.currentTime - startWall,
    suspend: () => { void ctx.suspend(); },
    resume:  () => { void ctx.resume(); },
  };
}

// ── Ambient pad ────────────────────────────────────────────────────────────────

export interface PadHandle {
  /** Update pad state to reflect elapsed time (call each second or so) */
  tick: (elapsedS: number) => void;
  stop: () => void;
}

export function startAmbientPad(audio: LullabyAudio): PadHandle {
  const { ctx, masterGain } = audio;
  const t = ctx.currentTime;

  // Gentle filter on pad — slow LFO modulates cutoff
  const filter = ctx.createBiquadFilter();
  filter.type            = "lowpass";
  filter.frequency.value = 600;
  filter.Q.value         = 0.8;
  filter.connect(masterGain);

  // Filter LFO: ~4-min cycle, opens/closes cutoff 400→1200 Hz
  const filterLfo = ctx.createOscillator();
  filterLfo.type = "sine";
  filterLfo.frequency.value = 1 / 240; // 4-min cycle
  const filterLfoGain = ctx.createGain();
  filterLfoGain.gain.value = 400; // ±400 Hz from centre (600)
  filterLfo.connect(filterLfoGain);
  filterLfoGain.connect(filter.frequency);
  filterLfo.start(t);

  const padGain = ctx.createGain();
  padGain.gain.setValueAtTime(0, t);
  padGain.gain.linearRampToValueAtTime(0.20, t + 4.0);
  padGain.connect(filter);

  // Start with D2 root + A2 fifth
  const rootOsc  = ctx.createOscillator();
  const fifthOsc = ctx.createOscillator();
  const octaveOsc = ctx.createOscillator();
  rootOsc.type    = "sine";
  fifthOsc.type   = "sine";
  octaveOsc.type  = "sine";

  rootOsc.frequency.value   = PAD_ROOTS[0][0];
  fifthOsc.frequency.value  = PAD_ROOTS[0][1];
  octaveOsc.frequency.value = PAD_ROOTS[0][0] * 2;

  const rg = ctx.createGain(); rg.gain.value  = 0.55;
  const fg = ctx.createGain(); fg.gain.value  = 0.35;
  const og = ctx.createGain(); og.gain.value  = 0.18;

  // Gentle tremolo on each partial
  [rootOsc, fifthOsc, octaveOsc].forEach((osc, i) => {
    const lfo = ctx.createOscillator();
    lfo.type = "sine";
    lfo.frequency.value = 0.07 + i * 0.023;
    const lg = ctx.createGain(); lg.gain.value = 0.03;
    lfo.connect(lg); lg.connect([rg, fg, og][i].gain);
    lfo.start(t);
    osc.start(t);
  });

  rootOsc.connect(rg).connect(padGain);
  fifthOsc.connect(fg).connect(padGain);
  octaveOsc.connect(og).connect(padGain);

  // Long-form root drift: scheduled frequency ramps every ~2 min
  // We schedule these in tick() based on elapsed time
  let lastRootIdx = 0;

  const tick = (elapsedS: number) => {
    // Root drift: every ~2 min advance to next PAD_ROOT
    const rootIdx = Math.floor(elapsedS / 120) % PAD_ROOTS.length;
    if (rootIdx !== lastRootIdx) {
      lastRootIdx = rootIdx;
      const [newRoot, newFifth] = PAD_ROOTS[rootIdx];
      const now = ctx.currentTime;
      rootOsc.frequency.setTargetAtTime(newRoot,   now, 8.0); // 8s time-constant
      fifthOsc.frequency.setTargetAtTime(newFifth, now, 8.0);
      octaveOsc.frequency.setTargetAtTime(newRoot * 2, now, 8.0);
    }

    // Goodnight fade
    if (elapsedS >= GOODNIGHT_START_S) {
      const progress = Math.min(1, (elapsedS - GOODNIGHT_START_S) / GOODNIGHT_DUR_S);
      const targetGain = 0.20 * (1 - progress);
      const now = ctx.currentTime;
      padGain.gain.setTargetAtTime(targetGain, now, 2.0);
    }
  };

  const stop = () => {
    const now = ctx.currentTime;
    padGain.gain.setValueAtTime(padGain.gain.value, now);
    padGain.gain.linearRampToValueAtTime(0.0001, now + 2.0);
    rootOsc.stop(now + 2.1);
    fifthOsc.stop(now + 2.1);
    octaveOsc.stop(now + 2.1);
    filterLfo.stop(now + 2.1);
  };

  return { tick, stop };
}

// ── Per-mote gathered voice ────────────────────────────────────────────────────

export interface MoteVoice {
  /** Pan -1..1 based on screen X position */
  setPan: (p: number) => void;
  /** Called each second with elapsed time so arpeg rate can evolve */
  tick: (elapsedS: number, voiceBirthS: number) => void;
  stop: () => void;
}

export function startMoteVoice(
  audio: LullabyAudio,
  freq: number,
  initialPan: number
): MoteVoice {
  const { ctx, masterGain } = audio;
  const t = ctx.currentTime;

  const panner = ctx.createStereoPanner();
  panner.pan.value = Math.max(-1, Math.min(1, initialPan));
  panner.connect(masterGain);

  const gainNode = ctx.createGain();
  gainNode.gain.setValueAtTime(0, t);
  gainNode.gain.linearRampToValueAtTime(0.001, t + 0.05);
  gainNode.connect(panner);

  // Triangle fundamental for warmth
  const osc1 = ctx.createOscillator();
  osc1.type = "triangle";
  osc1.frequency.value = freq;

  // Upper harmonic sine (bell partial)
  const osc2 = ctx.createOscillator();
  osc2.type = "sine";
  osc2.frequency.value = freq * 2.0;
  const g2 = ctx.createGain(); g2.gain.value = 0.22;

  // Soft shimmer partial
  const osc3 = ctx.createOscillator();
  osc3.type = "sine";
  osc3.frequency.value = freq * 3.0;
  const g3 = ctx.createGain(); g3.gain.value = 0.08;

  // Vibrato LFO (very gentle)
  const vibratoLfo = ctx.createOscillator();
  vibratoLfo.type = "sine";
  vibratoLfo.frequency.value = 5.0;
  const vibratoGain = ctx.createGain();
  vibratoGain.gain.value = freq * 0.005;
  vibratoLfo.connect(vibratoGain);
  vibratoGain.connect(osc1.frequency);

  osc1.connect(gainNode);
  osc2.connect(g2).connect(gainNode);
  osc3.connect(g3).connect(gainNode);

  osc1.start(t); osc2.start(t); osc3.start(t); vibratoLfo.start(t);

  // Arpeggio via gain envelope — pulsed sustain
  // The pulse rate will evolve via tick()
  let arpPulseRate = 0.25; // pulses per second initially (slow)
  let lastArpT = t;
  let arpPhase = 0; // 0 = decay, 1 = swell
  let stopped = false;
  let currentGain = 0;

  // Target gain: fades in over ~2s
  let targetBase = 0.0;
  const maxBase  = 0.38;

  // Fade in entry
  gainNode.gain.linearRampToValueAtTime(maxBase * 0.5, t + 1.2);
  gainNode.gain.linearRampToValueAtTime(maxBase,       t + 2.8);
  targetBase = maxBase;

  const setPan = (p: number) => {
    if (stopped) return;
    panner.pan.setTargetAtTime(Math.max(-1, Math.min(1, p)), ctx.currentTime, 0.08);
  };

  const tick = (elapsedS: number, voiceBirthS: number) => {
    if (stopped) return;
    const age = elapsedS - voiceBirthS;

    // Long-form: arpeg rate slowly increases with age (0.25 → 1.0 over 5 min)
    // and with global elapsed time (piece gets busier/richer)
    const ageRate   = 0.25 + Math.min(0.5, age / 300) * 0.75; // 0.25 → 1.0 over 5 min
    const timeRate  = 1.0 + Math.min(1.0, elapsedS / 480);    // ×1 → ×2 over 8 min
    arpPulseRate = ageRate * timeRate;

    // Goodnight: reduce gain toward silence
    if (elapsedS >= GOODNIGHT_START_S) {
      const progress = Math.min(1, (elapsedS - GOODNIGHT_START_S) / GOODNIGHT_DUR_S);
      targetBase = maxBase * (1 - progress);
    }

    // Arpeg pulse: schedule gain swell/decay based on current pulse rate
    const now = ctx.currentTime;
    const period = 1.0 / Math.max(0.1, arpPulseRate);
    if (now - lastArpT >= period) {
      lastArpT = now;
      arpPhase = 1 - arpPhase;
      currentGain = arpPhase === 1
        ? targetBase * (0.6 + 0.4 * Math.random())
        : targetBase * 0.2;
      gainNode.gain.cancelScheduledValues(now);
      gainNode.gain.setValueAtTime(gainNode.gain.value, now);
      gainNode.gain.linearRampToValueAtTime(currentGain, now + period * 0.4);
    }
  };

  const stop = () => {
    if (stopped) return;
    stopped = true;
    const now = ctx.currentTime;
    gainNode.gain.cancelScheduledValues(now);
    gainNode.gain.setValueAtTime(gainNode.gain.value, now);
    gainNode.gain.linearRampToValueAtTime(0.0001, now + 0.5);
    osc1.stop(now + 0.6);
    osc2.stop(now + 0.6);
    osc3.stop(now + 0.6);
    vibratoLfo.stop(now + 0.6);
  };

  return { setPan, tick, stop };
}

// ── Gather chime (one-shot) ────────────────────────────────────────────────────

export function playGatherChime(
  audio: LullabyAudio,
  freq: number,
  pan: number
): void {
  const { ctx, masterGain } = audio;
  const t = ctx.currentTime;

  const panner = ctx.createStereoPanner();
  panner.pan.value = Math.max(-1, Math.min(1, pan));
  panner.connect(masterGain);

  const g = ctx.createGain();
  g.gain.setValueAtTime(0, t);
  g.gain.linearRampToValueAtTime(0.30, t + 0.018);
  g.gain.exponentialRampToValueAtTime(0.0001, t + 1.4);
  g.connect(panner);

  // Bell: triangle at 2× freq + sine at 4×
  const osc1 = ctx.createOscillator();
  osc1.type = "triangle";
  osc1.frequency.value = freq * 2;
  osc1.connect(g);
  osc1.start(t);
  osc1.stop(t + 1.5);

  const g2 = ctx.createGain(); g2.gain.value = 0.30;
  const osc2 = ctx.createOscillator();
  osc2.type = "sine";
  osc2.frequency.value = freq * 4;
  osc2.connect(g2).connect(g);
  osc2.start(t);
  osc2.stop(t + 0.7);
}
