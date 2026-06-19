// audio.ts — FM bell carillon synthesized with the Web Audio API.
//
// A kind master chain:
//   master gain (≤0.3) → gentle lowpass (≤8kHz) → DynamicsCompressor → destination
// plus a soft always-on drone/pad bed so silence between edits has a floor.
//
// Bells are FM voices (carrier + inharmonic modulator) snapped to a warm
// consonant scale so nothing sounds wrong. A voice cap + short refractory
// keep a flood of edits from blowing up the polyphony.

export type BellSpec = {
  freq: number; // carrier frequency (Hz), already scale-snapped
  decay: number; // seconds
  gain: number; // 0..1 peak
  pan: number; // -1..1 stereo position
  bot: boolean; // muted woodblock instead of a struck bell
  swell: boolean; // brand-new editor → soft swell pad hit
};

export type CarillonEngine = {
  ring: (spec: BellSpec) => void;
  setBedLevel: (v: number) => void;
  dispose: () => void;
};

// A warm consonant scale: pentatonic-ish over several octaves (Hz).
// Built around A (220) using a major pentatonic frequency ratio set.
const SCALE_HZ: number[] = (() => {
  const ratios = [1, 9 / 8, 5 / 4, 3 / 2, 5 / 3]; // major pentatonic
  const bases = [110, 220, 440]; // three octaves
  const out: number[] = [];
  for (const b of bases) for (const r of ratios) out.push(b * r);
  out.sort((a, b) => a - b);
  return out;
})();

const MAX_VOICES = 14;
const REFRACTORY_MS = 55; // minimum gap between bell starts

// Pure: pick a scale frequency from a normalized 0..1 position.
// Smaller edits → higher (bright) bells, larger edits → lower (resonant) bells.
export function pitchForMagnitude(norm: number): number {
  const clamped = Math.max(0, Math.min(1, norm));
  // invert so big edits are low
  const idx = Math.round((1 - clamped) * (SCALE_HZ.length - 1));
  return SCALE_HZ[idx];
}

// Pure: map an absolute edit delta to a 0..1 magnitude (log-scaled).
export function magnitudeOf(delta: number): number {
  const a = Math.abs(delta);
  // log scale: ~0 at 1 byte, ~1 around 8000 bytes
  return Math.min(1, Math.log10(a + 1) / Math.log10(8000));
}

// Pure: stable pan from a domain string (so each wiki keeps its place on stage).
export function panForDomain(domain: string): number {
  let h = 0;
  for (let i = 0; i < domain.length; i++) {
    h = (h * 31 + domain.charCodeAt(i)) >>> 0;
  }
  return ((h % 1000) / 1000) * 2 - 1; // -1..1
}

export function buildCarillonEngine(ctx: AudioContext): CarillonEngine {
  // ── Master chain ────────────────────────────────────────────────────────────
  const master = ctx.createGain();
  master.gain.value = 0.28;

  const lp = ctx.createBiquadFilter();
  lp.type = "lowpass";
  lp.frequency.value = 7800;
  lp.Q.value = 0.5;

  const comp = ctx.createDynamicsCompressor();
  comp.threshold.value = -12;
  comp.knee.value = 8;
  comp.ratio.value = 12;
  comp.attack.value = 0.003;
  comp.release.value = 0.25;

  master.connect(lp);
  lp.connect(comp);
  comp.connect(ctx.destination);

  // ── Always-on drone/pad bed ───────────────────────────────────────────────────
  const bedGain = ctx.createGain();
  bedGain.gain.value = 0.05;
  bedGain.connect(master);

  const bedFilter = ctx.createBiquadFilter();
  bedFilter.type = "lowpass";
  bedFilter.frequency.value = 700;
  bedFilter.connect(bedGain);

  const bedOscs: OscillatorNode[] = [];
  // A soft open fifth + octave drone (A2, E3, A3) with slow detune shimmer.
  const bedFreqs = [110, 110 * (3 / 2), 220];
  for (let i = 0; i < bedFreqs.length; i++) {
    const o = ctx.createOscillator();
    o.type = "sine";
    o.frequency.value = bedFreqs[i];
    o.detune.value = (i - 1) * 4;
    const g = ctx.createGain();
    g.gain.value = i === 0 ? 0.6 : 0.32;
    o.connect(g);
    g.connect(bedFilter);
    o.start();
    bedOscs.push(o);
    // gentle LFO on detune for life
    const lfo = ctx.createOscillator();
    lfo.type = "sine";
    lfo.frequency.value = 0.05 + i * 0.03;
    const lfoGain = ctx.createGain();
    lfoGain.gain.value = 3.5;
    lfo.connect(lfoGain);
    lfoGain.connect(o.detune);
    lfo.start();
    bedOscs.push(lfo);
  }

  let activeVoices = 0;
  let lastRingAt = 0;

  const stereo = (): StereoPannerNode | null => {
    try {
      return ctx.createStereoPanner();
    } catch {
      return null;
    }
  };

  function strikeBell(spec: BellSpec, now: number) {
    const dur = spec.decay;
    const out = ctx.createGain();
    out.gain.value = 0;

    const pan = stereo();
    if (pan) {
      pan.pan.value = Math.max(-1, Math.min(1, spec.pan));
      out.connect(pan);
      pan.connect(master);
    } else {
      out.connect(master);
    }

    // FM bell: carrier + inharmonic modulator.
    const carrier = ctx.createOscillator();
    carrier.type = "sine";
    carrier.frequency.value = spec.freq;

    const mod = ctx.createOscillator();
    mod.type = "sine";
    // inharmonic ratio gives the metallic bell shimmer
    mod.frequency.value = spec.freq * 1.41;
    const modGain = ctx.createGain();
    modGain.gain.value = spec.freq * 1.6;
    // modulation index decays fast → bright attack, mellow tail
    modGain.gain.setValueAtTime(spec.freq * 1.6, now);
    modGain.gain.exponentialRampToValueAtTime(spec.freq * 0.05, now + dur * 0.5);
    mod.connect(modGain);
    modGain.connect(carrier.frequency);

    carrier.connect(out);

    // a faint upper partial for "gold" sparkle
    const partial = ctx.createOscillator();
    partial.type = "sine";
    partial.frequency.value = spec.freq * 2.76;
    const partialGain = ctx.createGain();
    partialGain.gain.value = 0;
    partial.connect(partialGain);
    partialGain.connect(out);

    const peak = spec.gain;
    out.gain.setValueAtTime(0, now);
    out.gain.linearRampToValueAtTime(peak, now + 0.006);
    out.gain.exponentialRampToValueAtTime(0.0001, now + dur);

    partialGain.gain.setValueAtTime(0, now);
    partialGain.gain.linearRampToValueAtTime(peak * 0.18, now + 0.004);
    partialGain.gain.exponentialRampToValueAtTime(0.0001, now + dur * 0.4);

    const stopAt = now + dur + 0.05;
    carrier.start(now);
    mod.start(now);
    partial.start(now);
    carrier.stop(stopAt);
    mod.stop(stopAt);
    partial.stop(stopAt);

    activeVoices++;
    carrier.onended = () => {
      activeVoices = Math.max(0, activeVoices - 1);
      try {
        out.disconnect();
        pan?.disconnect();
      } catch {
        /* already gone */
      }
    };
  }

  function strikeWoodblock(spec: BellSpec, now: number) {
    // Muted woodblock: short, dry, band-limited click for bot edits.
    const dur = 0.16;
    const out = ctx.createGain();
    out.gain.value = 0;
    const pan = stereo();
    if (pan) {
      pan.pan.value = Math.max(-1, Math.min(1, spec.pan));
      out.connect(pan);
      pan.connect(master);
    } else {
      out.connect(master);
    }

    const o = ctx.createOscillator();
    o.type = "triangle";
    o.frequency.value = Math.min(1200, spec.freq * 1.5);
    o.frequency.setValueAtTime(Math.min(1200, spec.freq * 1.5), now);
    o.frequency.exponentialRampToValueAtTime(spec.freq * 0.8, now + dur);

    const bp = ctx.createBiquadFilter();
    bp.type = "bandpass";
    bp.frequency.value = 900;
    bp.Q.value = 2;

    o.connect(bp);
    bp.connect(out);

    const peak = spec.gain * 0.5;
    out.gain.setValueAtTime(0, now);
    out.gain.linearRampToValueAtTime(peak, now + 0.003);
    out.gain.exponentialRampToValueAtTime(0.0001, now + dur);

    const stopAt = now + dur + 0.03;
    o.start(now);
    o.stop(stopAt);

    activeVoices++;
    o.onended = () => {
      activeVoices = Math.max(0, activeVoices - 1);
      try {
        out.disconnect();
        pan?.disconnect();
      } catch {
        /* already gone */
      }
    };
  }

  function strikeSwell(spec: BellSpec, now: number) {
    // Brand-new editor → a soft, slow swell pad hit under the bell.
    const dur = Math.max(2.2, spec.decay * 1.3);
    const out = ctx.createGain();
    out.gain.value = 0;
    const pan = stereo();
    if (pan) {
      pan.pan.value = Math.max(-1, Math.min(1, spec.pan)) * 0.6;
      out.connect(pan);
      pan.connect(master);
    } else {
      out.connect(master);
    }

    const lp2 = ctx.createBiquadFilter();
    lp2.type = "lowpass";
    lp2.frequency.value = 1400;
    lp2.connect(out);

    const freqs = [spec.freq * 0.5, spec.freq * 0.75, spec.freq];
    const oscs: OscillatorNode[] = [];
    for (const f of freqs) {
      const o = ctx.createOscillator();
      o.type = "sine";
      o.frequency.value = f;
      const g = ctx.createGain();
      g.gain.value = 0.33;
      o.connect(g);
      g.connect(lp2);
      o.start(now);
      o.stop(now + dur + 0.1);
      oscs.push(o);
    }

    const peak = spec.gain * 0.6;
    out.gain.setValueAtTime(0, now);
    out.gain.linearRampToValueAtTime(peak, now + dur * 0.45); // slow swell in
    out.gain.exponentialRampToValueAtTime(0.0001, now + dur);

    activeVoices++;
    oscs[0].onended = () => {
      activeVoices = Math.max(0, activeVoices - 1);
      try {
        out.disconnect();
        pan?.disconnect();
      } catch {
        /* already gone */
      }
    };

    // Also strike the bell on top of the swell.
    strikeBell(spec, now);
  }

  function ring(spec: BellSpec) {
    const tNow = ctx.currentTime;
    const wall = performance.now();
    if (wall - lastRingAt < REFRACTORY_MS) return; // refractory
    if (activeVoices >= MAX_VOICES) return; // voice cap
    lastRingAt = wall;

    if (spec.bot) {
      strikeWoodblock(spec, tNow);
    } else if (spec.swell) {
      strikeSwell(spec, tNow);
    } else {
      strikeBell(spec, tNow);
    }
  }

  function setBedLevel(v: number) {
    const t = ctx.currentTime;
    bedGain.gain.setTargetAtTime(Math.max(0, Math.min(0.12, v)), t, 0.6);
  }

  function dispose() {
    for (const o of bedOscs) {
      try {
        o.stop();
        o.disconnect();
      } catch {
        /* already stopped */
      }
    }
    try {
      bedFilter.disconnect();
      bedGain.disconnect();
      master.disconnect();
      lp.disconnect();
      comp.disconnect();
    } catch {
      /* ignore */
    }
  }

  return { ring, setBedLevel, dispose };
}
