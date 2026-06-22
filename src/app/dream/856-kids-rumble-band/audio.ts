// Web Audio engine for "Feel the Beat" — kids-safe, always-on soft groove.
//
// Signal chain (REQUIRED kids-safety):
//   voices → master gain (0.26) → lowpass (6500 Hz) → compressor
//            (threshold -10, ratio 20:1) → destination
//
// Voices:
//   - always-on soft drone (two detuned sines + sub) — never silent
//   - melody creature: one continuous warm voice, frequency snapped to a
//     C-major pentatonic scale; loudness/brightness follow stick magnitude
//   - harmony creature: second continuous voice a consonant interval above
//   - drums: four warm tuned membrane/marimba pings (A/B/X/Y)
//   - a soft pulse on every beat (the audible companion to the haptic pulse)
//
// All attacks are soft (>=40ms); no harsh transients.

// C major pentatonic across a couple of octaves (C D E G A), Hz.
const PENTA = [
  130.81, 146.83, 164.81, 196.0, 220.0, // C3 D3 E3 G3 A3
  261.63, 293.66, 329.63, 392.0, 440.0, // C4 D4 E4 G4 A4
  523.25, 587.33, 659.25, // C5 D5 E5
];

// Drum pad pitches (warm marimba-ish), Hz — A, B, X, Y.
const DRUM_PITCHES = [196.0, 261.63, 329.63, 174.61]; // G3 C4 E4 F3

export type DrumColor = { r: number; g: number; b: number };
export const DRUM_COLORS: DrumColor[] = [
  { r: 0.2, g: 0.95, b: 0.55 }, // A green
  { r: 1.0, g: 0.35, b: 0.45 }, // B red
  { r: 0.35, g: 0.6, b: 1.0 }, // X blue
  { r: 1.0, g: 0.85, b: 0.3 }, // Y yellow
];

export type AudioEngine = {
  resume: () => void;
  /** stickMag 0..1, stickAngle radians (for note selection) */
  setMelody: (mag: number, sel: number) => void;
  setHarmony: (mag: number, sel: number) => void;
  /** trigger a drum pad 0..3; returns the chosen color for visuals */
  hitDrum: (pad: number) => DrumColor;
  /** a swell / sparkle (triggers, bumpers) */
  sparkle: () => void;
  /** beats-per-second of the groove */
  readonly bpsBeat: number;
  dispose: () => void;
};

function snapToScale(sel: number): number {
  // sel 0..1 → index into PENTA
  const i = Math.max(0, Math.min(PENTA.length - 1, Math.round(sel * (PENTA.length - 1))));
  return PENTA[i];
}

export function makeAudioEngine(ctx: AudioContext): AudioEngine {
  // ── Master safety chain ──
  const master = ctx.createGain();
  master.gain.value = 0.26;

  const lp = ctx.createBiquadFilter();
  lp.type = "lowpass";
  lp.frequency.value = 6500;
  lp.Q.value = 0.5;

  const comp = ctx.createDynamicsCompressor();
  comp.threshold.value = -10;
  comp.ratio.value = 20;
  comp.attack.value = 0.01;
  comp.release.value = 0.25;
  comp.knee.value = 6;

  master.connect(lp);
  lp.connect(comp);
  comp.connect(ctx.destination);

  // ── Always-on drone ──
  const droneGain = ctx.createGain();
  droneGain.gain.value = 0.0;
  droneGain.connect(master);
  const droneA = ctx.createOscillator();
  droneA.type = "sine";
  droneA.frequency.value = 65.41; // C2
  const droneB = ctx.createOscillator();
  droneB.type = "sine";
  droneB.frequency.value = 98.0; // G2
  droneB.detune.value = 4;
  const droneC = ctx.createOscillator();
  droneC.type = "triangle";
  droneC.frequency.value = 130.81; // C3
  droneC.detune.value = -3;
  droneA.connect(droneGain);
  droneB.connect(droneGain);
  droneC.connect(droneGain);
  droneA.start();
  droneB.start();
  droneC.start();
  // soft fade-in of the drone
  droneGain.gain.setValueAtTime(0.0, ctx.currentTime);
  droneGain.gain.linearRampToValueAtTime(0.14, ctx.currentTime + 1.2);

  // ── Continuous creature voice factory ──
  function makeCreature(detune: number, warm: boolean) {
    const g = ctx.createGain();
    g.gain.value = 0.0;
    const tone = ctx.createBiquadFilter();
    tone.type = "lowpass";
    tone.frequency.value = 1200;
    tone.Q.value = 1.2;
    const osc = ctx.createOscillator();
    osc.type = warm ? "triangle" : "sine";
    osc.frequency.value = 261.63;
    osc.detune.value = detune;
    const osc2 = ctx.createOscillator();
    osc2.type = "sine";
    osc2.frequency.value = 261.63;
    osc2.detune.value = detune + 6;
    const mix2 = ctx.createGain();
    mix2.gain.value = 0.4;
    osc.connect(tone);
    osc2.connect(mix2);
    mix2.connect(tone);
    tone.connect(g);
    g.connect(master);
    osc.start();
    osc2.start();
    return { g, tone, osc, osc2, mix2 };
  }

  const melody = makeCreature(0, true);
  const harmony = makeCreature(-4, false);

  function applyVoice(
    v: ReturnType<typeof makeCreature>,
    mag: number,
    sel: number,
    intervalRatio: number,
  ) {
    const now = ctx.currentTime;
    const freq = snapToScale(sel) * intervalRatio;
    // soft glide between notes (no zipper, no harsh jumps)
    v.osc.frequency.setTargetAtTime(freq, now, 0.06);
    v.osc2.frequency.setTargetAtTime(freq, now, 0.06);
    // loudness follows magnitude with a soft attack
    const target = mag < 0.06 ? 0.0 : 0.04 + mag * 0.12;
    v.g.gain.setTargetAtTime(target, now, 0.05);
    // brightness follows magnitude
    v.tone.frequency.setTargetAtTime(700 + mag * 3200, now, 0.08);
  }

  function setMelody(mag: number, sel: number) {
    applyVoice(melody, mag, sel, 1.0);
  }
  function setHarmony(mag: number, sel: number) {
    // a consonant third / fifth feel above
    applyVoice(harmony, mag, sel, 1.5);
  }

  // ── Drums: warm tuned membrane/marimba ping ──
  function hitDrum(pad: number): DrumColor {
    const idx = Math.max(0, Math.min(3, pad));
    const now = ctx.currentTime;
    const base = DRUM_PITCHES[idx];

    const g = ctx.createGain();
    g.connect(master);
    g.gain.setValueAtTime(0.0, now);
    g.gain.linearRampToValueAtTime(0.22, now + 0.012);
    g.gain.exponentialRampToValueAtTime(0.001, now + 0.85);

    const tone = ctx.createBiquadFilter();
    tone.type = "lowpass";
    tone.frequency.value = 2200;
    tone.connect(g);

    const o1 = ctx.createOscillator();
    o1.type = "sine";
    o1.frequency.setValueAtTime(base, now);
    o1.frequency.exponentialRampToValueAtTime(base * 0.92, now + 0.4);
    const o2 = ctx.createOscillator();
    o2.type = "triangle";
    o2.frequency.value = base * 2.01; // soft overtone
    const o2g = ctx.createGain();
    o2g.gain.value = 0.25;
    o1.connect(tone);
    o2.connect(o2g);
    o2g.connect(tone);
    o1.start(now);
    o2.start(now);
    o1.stop(now + 0.9);
    o2.stop(now + 0.9);
    o1.onended = () => {
      o1.disconnect();
      o2.disconnect();
      o2g.disconnect();
      tone.disconnect();
      g.disconnect();
    };
    return DRUM_COLORS[idx];
  }

  // ── Sparkle (triggers/bumpers): a soft high shimmer swell ──
  function sparkle() {
    const now = ctx.currentTime;
    const g = ctx.createGain();
    g.connect(master);
    g.gain.setValueAtTime(0.0, now);
    g.gain.linearRampToValueAtTime(0.1, now + 0.08);
    g.gain.exponentialRampToValueAtTime(0.001, now + 1.1);
    const o = ctx.createOscillator();
    o.type = "sine";
    o.frequency.setValueAtTime(880, now);
    o.frequency.linearRampToValueAtTime(1320, now + 0.9);
    o.connect(g);
    o.start(now);
    o.stop(now + 1.2);
    o.onended = () => {
      o.disconnect();
      g.disconnect();
    };
  }

  function resume() {
    if (ctx.state === "suspended") void ctx.resume();
  }

  function dispose() {
    try {
      droneA.stop();
      droneB.stop();
      droneC.stop();
      melody.osc.stop();
      melody.osc2.stop();
      harmony.osc.stop();
      harmony.osc2.stop();
    } catch {
      // already stopped
    }
    try {
      master.disconnect();
      lp.disconnect();
      comp.disconnect();
      droneGain.disconnect();
      melody.g.disconnect();
      harmony.g.disconnect();
    } catch {
      // ignore
    }
  }

  return {
    resume,
    setMelody,
    setHarmony,
    hitDrum,
    sparkle,
    bpsBeat: 1.6, // ~96 BPM felt pulse
    dispose,
  };
}
