// ════════════════════════════════════════════════════════════════════════════
// Worldwire (2474) — audio engine
//
// A small Web Audio instrument for sonifying the live global Wikipedia edit
// stream. Bells for edits, a warm swell for new articles, a duller timbre for
// bots. Everything is snapped to a just-intonation lattice so the field of
// events is always consonant no matter how the world is editing.
//
// This module is plain TypeScript (no React). It is deliberately defensive:
// nothing throws — if Web Audio is missing, `createEngine` returns null and the
// page shows an on-brand notice.
// ════════════════════════════════════════════════════════════════════════════

// ── Just-intonation scale ────────────────────────────────────────────────────
// A 7-limit "major pentatonic" expressed as exact frequency ratios above a
// tonic. Pure small-integer ratios keep every simultaneous bell consonant.
//   1/1   unison
//   9/8   major second
//   5/4   major third
//   3/2   perfect fifth
//   5/3   major sixth
const JI_RATIOS = [1 / 1, 9 / 8, 5 / 4, 3 / 2, 5 / 3];

// Tonic for the lowest octave (Hz). ~C2 region — weighty but not muddy.
const TONIC_HZ = 65.406;

// How many octaves the scale spans. Big edits sit low, tiny edits sit high.
const OCTAVES = 5;

// Precomputed frequency table, ascending, spanning OCTAVES octaves.
const SCALE_HZ: number[] = (() => {
  const out: number[] = [];
  for (let oct = 0; oct < OCTAVES; oct++) {
    for (const r of JI_RATIOS) {
      out.push(TONIC_HZ * r * Math.pow(2, oct));
    }
  }
  return out;
})();

// Snap a "wish" in [0,1] (0 = lowest bell, 1 = highest bell) onto the lattice.
export function snapToScale(wish: number): number {
  const n = SCALE_HZ.length;
  const idx = Math.min(n - 1, Math.max(0, Math.round(wish * (n - 1))));
  return SCALE_HZ[idx];
}

// Map a signed byte delta to a pitch wish. Pitch is INVERSELY proportional to
// edit size: a huge edit rings low (wish→0), a one-byte tweak rings high
// (wish→1). We compress with a log so the scale reads musically across the
// enormous dynamic range of real edit sizes.
export function deltaToWish(delta: number): number {
  const mag = Math.min(50000, Math.abs(delta));
  // log1p(0)=0 .. log1p(50000)≈10.8 → normalize, then invert.
  const norm = Math.log1p(mag) / Math.log1p(50000);
  return 1 - norm;
}

// ── Engine ───────────────────────────────────────────────────────────────────
export interface Engine {
  ctx: AudioContext;
  resume: () => Promise<void>;
  setMasterGain: (g: number) => void;
  activeVoices: () => number;
  // Strike a struck-metal bell. `bot` dulls the timbre & lowers gain.
  bell: (freq: number, velocity: number, bot: boolean) => void;
  // A warm sustained swell for a new article (rarer, richer).
  swell: (freq: number, velocity: number) => void;
  dispose: () => void;
}

const MAX_VOICES = 16;

// Detuned partial ratios giving a struck-metal / tongue-drum shimmer.
const BELL_PARTIALS = [1, 2.01, 2.99, 4.17];

export function createEngine(): Engine | null {
  const Ctor =
    typeof window !== "undefined"
      ? window.AudioContext ||
        (window as unknown as { webkitAudioContext?: typeof AudioContext })
          .webkitAudioContext
      : undefined;
  if (!Ctor) return null;

  let ctx: AudioContext;
  try {
    ctx = new Ctor();
  } catch {
    return null;
  }

  // master -> soft limiter (compressor) -> destination
  const master = ctx.createGain();
  master.gain.value = 0.9;

  const limiter = ctx.createDynamicsCompressor();
  limiter.threshold.value = -10;
  limiter.knee.value = 8;
  limiter.ratio.value = 12;
  limiter.attack.value = 0.003;
  limiter.release.value = 0.25;

  // A gentle reverb-ish send via a short feedback delay keeps the field alive.
  const wet = ctx.createGain();
  wet.gain.value = 0.28;
  const delay = ctx.createDelay(1.0);
  delay.delayTime.value = 0.33;
  const feedback = ctx.createGain();
  feedback.gain.value = 0.42;
  const wetTone = ctx.createBiquadFilter();
  wetTone.type = "lowpass";
  wetTone.frequency.value = 2600;

  master.connect(limiter);
  master.connect(wet);
  wet.connect(delay);
  delay.connect(wetTone);
  wetTone.connect(feedback);
  feedback.connect(delay);
  wetTone.connect(limiter);
  limiter.connect(ctx.destination);

  let voices = 0;
  const track = (dur: number) => {
    voices++;
    window.setTimeout(() => {
      voices = Math.max(0, voices - 1);
    }, dur * 1000);
  };

  const stealIfNeeded = () => voices >= MAX_VOICES;

  const bell: Engine["bell"] = (freq, velocity, bot) => {
    if (stealIfNeeded()) return;
    const now = ctx.currentTime;
    const dur = bot ? 1.6 : 2.6;
    const peak = (bot ? 0.16 : 0.3) * Math.max(0.12, Math.min(1, velocity));

    const voiceGain = ctx.createGain();
    voiceGain.gain.setValueAtTime(0.0001, now);
    voiceGain.gain.exponentialRampToValueAtTime(peak, now + 0.006);
    voiceGain.gain.exponentialRampToValueAtTime(0.0001, now + dur);

    // Bots get a lowpass "cloth over the bell" — duller, less shimmer.
    const tone = ctx.createBiquadFilter();
    tone.type = "lowpass";
    tone.frequency.value = bot ? 900 : 5200;
    voiceGain.connect(tone);
    tone.connect(master);

    const partials = bot ? BELL_PARTIALS.slice(0, 2) : BELL_PARTIALS;
    partials.forEach((ratio, i) => {
      const osc = ctx.createOscillator();
      osc.type = "sine";
      osc.frequency.value = freq * ratio;
      const pg = ctx.createGain();
      // Higher partials decay faster and quieter.
      const pAmp = 1 / (i + 1.4);
      const pDur = dur * (1 - i * 0.16);
      pg.gain.setValueAtTime(pAmp, now);
      pg.gain.exponentialRampToValueAtTime(0.0001, now + Math.max(0.2, pDur));
      osc.connect(pg);
      pg.connect(voiceGain);
      osc.start(now);
      osc.stop(now + dur + 0.05);
    });
    track(dur);
  };

  const swell: Engine["swell"] = (freq, velocity) => {
    if (stealIfNeeded()) return;
    const now = ctx.currentTime;
    const dur = 5.5;
    const peak = 0.22 * Math.max(0.2, Math.min(1, velocity));

    const voiceGain = ctx.createGain();
    voiceGain.gain.setValueAtTime(0.0001, now);
    voiceGain.gain.linearRampToValueAtTime(peak, now + 1.4);
    voiceGain.gain.linearRampToValueAtTime(peak * 0.7, now + dur * 0.6);
    voiceGain.gain.exponentialRampToValueAtTime(0.0001, now + dur);

    const tone = ctx.createBiquadFilter();
    tone.type = "lowpass";
    tone.frequency.setValueAtTime(600, now);
    tone.frequency.linearRampToValueAtTime(2400, now + 1.6);
    voiceGain.connect(tone);
    tone.connect(master);

    // A soft two-oscillator string-ish pad, a fifth apart, gently detuned.
    const voicesHz = [freq, freq * 1.5, freq * 2];
    voicesHz.forEach((f, i) => {
      const osc = ctx.createOscillator();
      osc.type = i === 0 ? "triangle" : "sawtooth";
      osc.frequency.value = f;
      osc.detune.value = (i - 1) * 5;
      const pg = ctx.createGain();
      pg.gain.value = i === 0 ? 0.5 : 0.22;
      osc.connect(pg);
      pg.connect(voiceGain);
      osc.start(now);
      osc.stop(now + dur + 0.1);
    });
    track(dur);
  };

  return {
    ctx,
    resume: () => ctx.resume(),
    setMasterGain: (g: number) => {
      master.gain.setTargetAtTime(Math.max(0, Math.min(1, g)), ctx.currentTime, 0.05);
    },
    activeVoices: () => voices,
    bell,
    swell,
    dispose: () => {
      try {
        void ctx.close();
      } catch {
        /* ignore */
      }
    },
  };
}
