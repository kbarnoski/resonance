// agent.ts — the AGENT + the MOTIF MEMORY ENGINE (the cycle-2 novelty).
//
// Like 770, the agent has two sounding layers:
//   (a) a warm harmonizing PAD voiced to the detected chord, sitting UNDER him;
//   (b) a sparse answering VOICE (soft FM bell) that fires only in his gaps.
//
// What is NEW here is MEMORY. 770 improvised every answer fresh and forgot it.
// This agent keeps an ADAPTIVE PHRASE BANK of motifs stored SYMBOLICALLY and
// KEY-INDEPENDENTLY (scale-degree steps + relative durations). Motifs enter the
// bank two ways:
//   (1) when the agent invents a good answering phrase, it remembers it;
//   (2) it can LIFT a salient contour from his recent playing (via the listener).
//
// Over minutes a global "memory pressure" rises. Early answers are short and
// freshly invented; later answers increasingly RECALL a banked motif and
// DEVELOP it with a symbolic transform — transpose into the current key,
// augment / diminish the rhythm, fragment to the head, or invert the contour.
// So the piece accretes coherence: it quotes and varies its OWN earlier
// material, and minute 5 is genuinely a development of minute 1.
//
// Reference: CHI 2026 "A Design Space for Live Music Agents" (arXiv 2602.05064)
// — its "Adaptive Phrase Bank" mechanism (store recent phrases; recombine /
// transform via transposition + rhythmic variation) is the seed for this.

import type { ChordEstimate } from "./listener";

const MAJ_INTERVALS = [0, 4, 7]; // root, major third, fifth
const MIN_INTERVALS = [0, 3, 7]; // root, minor third, fifth

// Diatonic scale degrees (chromatic offsets from tonic) for maj / min.
const MAJ_SCALE = [0, 2, 4, 5, 7, 9, 11];
const MIN_SCALE = [0, 2, 3, 5, 7, 8, 10];

function midiToFreq(m: number): number {
  return 440 * Math.pow(2, (m - 69) / 12);
}

// Snap a chromatic degree (0..11) to the nearest diatonic scale index 0..6.
function chromaticToScaleIndex(deg: number, scale: number[]): number {
  let bestI = 0;
  let bestD = 99;
  for (let i = 0; i < scale.length; i++) {
    const d = Math.abs(scale[i] - deg);
    if (d < bestD) {
      bestD = d;
      bestI = i;
    }
  }
  return bestI;
}

// ─── The Motif: a key-independent symbolic gesture ───────────────────────────
// `degrees` are diatonic scale indices (can exceed 0..6 / go negative — they
// wrap across octaves at render time). `durs` are relative durations (×beat).
export type Motif = {
  id: number;
  degrees: number[]; // scale-degree steps, key-independent
  durs: number[]; // relative durations
  origin: "invented" | "lifted"; // his gesture, or the agent's own answer
  born: number; // performance-seconds when first banked
  recalls: number; // how many times it has been developed
  lastTransform: string; // human-readable label of the last development
};

export type MotifSnapshot = {
  id: number;
  degrees: number[];
  origin: "invented" | "lifted";
  recalls: number;
  active: number; // 0..1 recently-recalled glow (decays)
  lastTransform: string;
};

export type Agent = {
  setChord(chord: ChordEstimate): void;
  setCompany(company: number): void; // 0..1 shy ↔ talkative
  setMemoryLean(lean: number): void; // 0..1 invent ↔ recall
  updatePad(energy: number, now: number): void;
  // Trigger a short answer in a gap. Returns the answer's end-time (0 if it held back).
  answer(chord: ChordEstimate, contour: number, now: number): number;
  // Offer a lifted contour (degree-steps relative to his root) to the bank.
  liftContour(steps: number[], now: number): void;
  isAnswering(now: number): boolean;
  // Read-only views for the visual.
  memorySnapshot(): MotifSnapshot[];
  memoryPressure(): number; // 0..1, rises over minutes
  lastRecalledId(): number; // -1 if last answer was freshly invented
  dispose(): void;
};

export function buildAgent(ctx: AudioContext, out: GainNode): Agent {
  // ── Pad layer (continuous, lowpassed, gentle) ──
  const padGain = ctx.createGain();
  padGain.gain.value = 0;
  const padFilter = ctx.createBiquadFilter();
  padFilter.type = "lowpass";
  padFilter.frequency.value = 900;
  padFilter.Q.value = 0.5;
  padGain.connect(padFilter).connect(out);

  type Voice = { osc: OscillatorNode; g: GainNode };
  const voices: Voice[] = [];
  const VOICE_COUNT = 4;
  for (let i = 0; i < VOICE_COUNT; i++) {
    const osc = ctx.createOscillator();
    osc.type = i % 2 === 0 ? "sine" : "triangle";
    osc.detune.value = (i - 1.5) * 5; // slight chorus
    const g = ctx.createGain();
    g.gain.value = 1 / VOICE_COUNT;
    osc.connect(g).connect(padGain);
    osc.start();
    voices.push({ osc, g });
  }

  let company = 0.5;
  let memoryLean = 0.5; // 0 = always invent, 1 = always recall when possible
  let lastAnswerEnd = 0;

  // ── The memory bank ──
  const BANK_CAP = 10;
  const bank: Motif[] = [];
  let nextId = 1;
  const startTime = ctx.currentTime; // performance clock origin
  let lastRecalled = -1;

  // Per-motif glow for the visual (decays each read).
  const glow = new Map<number, number>();

  function ageSeconds(now: number): number {
    return Math.max(0, now - startTime);
  }

  // Memory pressure rises over ~4 minutes toward 1, scaled by the memory slider.
  function memoryPressure(): number {
    const t = ageSeconds(ctx.currentTime);
    const ramp = 1 - Math.exp(-t / 150); // ~150s time-constant
    return Math.min(1, ramp * (0.35 + memoryLean * 0.9));
  }

  function bankMotif(m: Motif): void {
    bank.push(m);
    if (bank.length > BANK_CAP) {
      // Evict the least-developed, oldest motif (keep ones we keep reusing).
      let worstI = 0;
      let worstScore = Infinity;
      for (let i = 0; i < bank.length; i++) {
        const s = bank[i].recalls * 10 - bank[i].born * 0.01;
        if (s < worstScore) {
          worstScore = s;
          worstI = i;
        }
      }
      const [gone] = bank.splice(worstI, 1);
      glow.delete(gone.id);
    }
  }

  function setChord(chord: ChordEstimate): void {
    const ivs = chord.quality === "maj" ? MAJ_INTERVALS : MIN_INTERVALS;
    const base = 48 + chord.root;
    const midis = ivs.map((iv) => base + iv).concat([base + 12 + ivs[1]]);
    const now = ctx.currentTime;
    for (let i = 0; i < voices.length; i++) {
      const m = midis[i % midis.length];
      voices[i].osc.frequency.setTargetAtTime(midiToFreq(m), now, 0.25);
    }
  }

  function setCompany(c: number): void {
    company = Math.max(0, Math.min(1, c));
  }
  function setMemoryLean(l: number): void {
    memoryLean = Math.max(0, Math.min(1, l));
  }

  function updatePad(energy: number, now: number): void {
    const target = (0.05 + energy * 0.1) * (0.5 + company * 0.7);
    padGain.gain.setTargetAtTime(Math.min(0.16, target), now, 0.4);
  }

  // Invent a fresh short answer as a symbolic motif (degree-steps + durs).
  function inventMotif(contour: number, now: number): Motif {
    const noteCount = 2 + Math.round(company * 2); // 2..4
    const descending = contour > 0.5; // answer against his contour
    const degrees: number[] = [];
    const durs: number[] = [];
    let deg = descending ? 4 : 0;
    for (let n = 0; n < noteCount; n++) {
      const isLast = n === noteCount - 1;
      // Land last note on the tonic (degree 0) for a consonant resolution.
      degrees.push(isLast ? 0 : deg);
      durs.push(isLast ? 1.1 : 0.42);
      deg += (descending ? -1 : 1) * (1 + (n % 2));
    }
    return {
      id: nextId++,
      degrees,
      durs,
      origin: "invented",
      born: ageSeconds(now),
      recalls: 0,
      lastTransform: "first stated",
    };
  }

  // ── Symbolic developments (the heart of long-form memory) ──
  type Transform = { label: string; apply: (m: Motif) => Motif };

  function transformsFor(m: Motif, now: number): Transform[] {
    const ts: Transform[] = [];
    // Augment / diminish rhythm.
    ts.push({
      label: "augmented",
      apply: (s) => ({ ...s, durs: s.durs.map((d) => d * 1.6) }),
    });
    ts.push({
      label: "diminished",
      apply: (s) => ({ ...s, durs: s.durs.map((d) => Math.max(0.2, d * 0.6)) }),
    });
    // Fragment to the head (first 2 notes).
    if (m.degrees.length > 2) {
      ts.push({
        label: "fragmented",
        apply: (s) => ({
          ...s,
          degrees: s.degrees.slice(0, 2),
          durs: s.durs.slice(0, 2),
        }),
      });
    }
    // Inversion about the first degree.
    ts.push({
      label: "inverted",
      apply: (s) => {
        const pivot = s.degrees[0];
        return { ...s, degrees: s.degrees.map((d) => pivot - (d - pivot)) };
      },
    });
    // Sequence up a step (transpose the whole shape diatonically).
    ts.push({
      label: "sequenced up",
      apply: (s) => ({ ...s, degrees: s.degrees.map((d) => d + 1) }),
    });
    void now;
    return ts;
  }

  // Render a motif into the detected key, starting at performance time t.
  function renderMotif(m: Motif, chord: ChordEstimate, t: number): number {
    const scale = chord.quality === "maj" ? MAJ_SCALE : MIN_SCALE;
    const tonic = 60 + chord.root; // C4-ish register — sings above the pad
    const beat = 0.5;
    let cursor = t + 0.04;
    for (let n = 0; n < m.degrees.length; n++) {
      const sd = m.degrees[n];
      // Wrap a (possibly out-of-range) scale degree into pitch with octaves.
      const oct = Math.floor(sd / scale.length);
      const idx = ((sd % scale.length) + scale.length) % scale.length;
      const midi = tonic + oct * 12 + scale[idx];
      const dur = Math.max(0.18, m.durs[n] * beat * 0.9);
      const isLast = n === m.degrees.length - 1;
      playBell(
        ctx,
        out,
        midiToFreq(midi),
        cursor,
        isLast ? dur + 0.5 : dur,
        0.12 + company * 0.06,
      );
      cursor += dur * 0.84;
    }
    return cursor + 0.3;
  }

  function answer(chord: ChordEstimate, contour: number, now: number): number {
    const spacing = 1.6 - company * 0.9;
    if (now - lastAnswerEnd < spacing) return 0;

    const pressure = memoryPressure();
    const canRecall = bank.length > 0;
    // With growing probability as the piece ages, recall + develop instead of
    // inventing fresh.
    const recall = canRecall && Math.random() < pressure;

    let end: number;
    if (recall) {
      // Prefer motifs we have not over-used; light bias to older material.
      const idx = pickMotifIndex();
      const base = bank[idx];
      const transforms = transformsFor(base, now);
      const tf = transforms[Math.floor(Math.random() * transforms.length)];
      // Transpose into the current key is implicit: renderMotif uses the
      // detected chord's tonic + scale. The transform reshapes the symbol.
      const developed = tf.apply(base);
      base.recalls += 1;
      base.lastTransform = `${tf.label} → ${chord.name}`;
      lastRecalled = base.id;
      glow.set(base.id, 1);
      end = renderMotif(developed, chord, now);
    } else {
      const fresh = inventMotif(contour, now);
      lastRecalled = -1;
      // Bank the agent's own fresh phrase so it can be developed later.
      bankMotif(fresh);
      glow.set(fresh.id, 1);
      end = renderMotif(fresh, chord, now);
    }
    lastAnswerEnd = end;
    return end;
  }

  // Weighted pick: favor less-recalled motifs so the bank gets explored.
  function pickMotifIndex(): number {
    let total = 0;
    const weights = bank.map((m) => {
      const w = 1 / (1 + m.recalls);
      total += w;
      return w;
    });
    let r = Math.random() * total;
    for (let i = 0; i < bank.length; i++) {
      r -= weights[i];
      if (r <= 0) return i;
    }
    return bank.length - 1;
  }

  // Lift one of HIS recurring gestures into the bank (degree-steps from listener).
  function liftContour(steps: number[], now: number): void {
    if (steps.length < 3) return;
    const scale = MIN_SCALE; // store relative; rendered in detected key later
    // Convert his chromatic degree-steps to diatonic scale indices.
    const degrees = steps.map((d) => chromaticToScaleIndex(d, scale));
    // Skip if a near-identical lifted motif is already banked.
    const dup = bank.some(
      (m) =>
        m.origin === "lifted" &&
        m.degrees.length === degrees.length &&
        m.degrees.every((d, i) => d === degrees[i]),
    );
    if (dup) return;
    // Only lift sometimes — his most salient gestures, not every phrase.
    if (Math.random() > 0.5) return;
    const durs = degrees.map((_, i) => (i === degrees.length - 1 ? 1.0 : 0.5));
    bankMotif({
      id: nextId++,
      degrees,
      durs,
      origin: "lifted",
      born: ageSeconds(now),
      recalls: 0,
      lastTransform: "lifted from him",
    });
  }

  function isAnswering(now: number): boolean {
    return now < lastAnswerEnd;
  }

  function memorySnapshot(): MotifSnapshot[] {
    return bank.map((m) => {
      const g = glow.get(m.id) ?? 0;
      glow.set(m.id, g * 0.9); // decay
      return {
        id: m.id,
        degrees: m.degrees,
        origin: m.origin,
        recalls: m.recalls,
        active: g,
        lastTransform: m.lastTransform,
      };
    });
  }

  function lastRecalledId(): number {
    return lastRecalled;
  }

  function dispose(): void {
    const now = ctx.currentTime;
    padGain.gain.setTargetAtTime(0, now, 0.2);
    for (const v of voices) {
      try {
        v.osc.stop(now + 0.6);
      } catch {
        // already stopped
      }
    }
    setTimeout(() => {
      try {
        padGain.disconnect();
        padFilter.disconnect();
        for (const v of voices) v.g.disconnect();
      } catch {
        // nodes already gone
      }
    }, 800);
  }

  return {
    setChord,
    setCompany,
    setMemoryLean,
    updatePad,
    answer,
    liftContour,
    isAnswering,
    memorySnapshot,
    memoryPressure,
    lastRecalledId,
    dispose,
  };
}

// A soft FM-ish bell/pluck for the answering voice.
function playBell(
  ctx: AudioContext,
  out: AudioNode,
  freq: number,
  t: number,
  dur: number,
  gain: number,
): void {
  const carrier = ctx.createOscillator();
  carrier.type = "sine";
  carrier.frequency.value = freq;

  const mod = ctx.createOscillator();
  mod.type = "sine";
  mod.frequency.value = freq * 2.01;
  const modGain = ctx.createGain();
  modGain.gain.setValueAtTime(freq * 1.4, t);
  modGain.gain.exponentialRampToValueAtTime(freq * 0.2, t + dur);
  mod.connect(modGain).connect(carrier.frequency);

  const env = ctx.createGain();
  env.gain.setValueAtTime(0, t);
  env.gain.linearRampToValueAtTime(gain, t + 0.02);
  env.gain.exponentialRampToValueAtTime(0.0001, t + dur);

  const tone = ctx.createBiquadFilter();
  tone.type = "lowpass";
  tone.frequency.value = 2600;

  carrier.connect(env).connect(tone).connect(out);
  carrier.start(t);
  mod.start(t);
  carrier.stop(t + dur + 0.05);
  mod.stop(t + dur + 0.05);
}
