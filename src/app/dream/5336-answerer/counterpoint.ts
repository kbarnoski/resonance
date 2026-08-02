// ════════════════════════════════════════════════════════════════════════════
// counterpoint.ts — the decision engine (the heart of the piece).
//
// For every note the visitor plays, the PARTNER voice chooses how to answer:
// echo it at a canonic delay, invert it around an axis, meet it in contrary
// motion on a consonance, hold a dissonant suspension, or — when the visitor
// pushes toward a cadence — REFUSE to resolve. Rules are drawn from species
// counterpoint (J.J. Fux, *Gradus ad Parnassum*, 1725): prefer imperfect
// consonances (3rds/6ths), prefer contrary motion, treat P4/tritone/2nds/7ths
// as dissonances, and avoid parallel perfect fifths & octaves.
//
// Everything is deterministic given the seed: the ONLY randomness is a seeded
// mulberry32 PRNG threaded through EngineState. No Math.random, no Date.
// ════════════════════════════════════════════════════════════════════════════

export type Mood = "shadow" | "contrary" | "wilful";

export type Relation =
  | "echo" // canonic imitation, transposed, at a delay
  | "invert" // mirror inversion around an axis
  | "contrary" // consonance reached by contrary motion
  | "consonance" // smooth consonant answer (oblique/parallel)
  | "suspend" // dissonance held on purpose — tension up
  | "refuse" // withholds a cadential resolution
  | "resolve"; // resolves a leading-tone / cadence

export interface PartnerNote {
  midi: number;
  relation: Relation;
  interval: number; // signed semitone interval partner - played
  delayMs: number; // canonic / reaction delay before it sounds
  tension: number; // engine tension after this decision, 0..1
}

export interface EngineState {
  mood: Mood;
  tension: number; // 0..1
  lastPlayed: number | null; // visitor's previous note (midi)
  lastPartner: number | null; // partner's previous note (midi)
  prevInterval: number | null; // signed interval of the previous vertical pair
  rng: () => number;
}

// ── Seeded PRNG (mulberry32). Determinism for review. ────────────────────────
export function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return function () {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function createEngineState(mood: Mood, seed = 0x5336): EngineState {
  return {
    mood,
    tension: 0,
    lastPlayed: null,
    lastPartner: null,
    prevInterval: null,
    rng: mulberry32(seed),
  };
}

// ── Key context: C major. ────────────────────────────────────────────────────
const SCALE = [0, 2, 4, 5, 7, 9, 11]; // C D E F G A B
const LEADING_PC = 11; // B — pulls up to the tonic C
const TRIAD_PC = [0, 4, 7]; // tonic triad tones for resolution

// Partner's comfortable register (a distinct upper voice) and imitation axis.
const PART_LO = 55;
const PART_HI = 84;
const AXIS = 72; // C5 — inversion mirror
const CENTER = 72;

const CANON_DELAY = 520; // Shadow's canon-at-a-delay
const REACT = 150; // reactive delay for the other behaviors

// Consonant interval-classes (mod 12): unison/oct, m3/M3, P5, m6/M6.
const CONSONANT_IC = new Set([0, 3, 4, 7, 8, 9]);

const pc = (m: number) => ((m % 12) + 12) % 12;
const inScale = (m: number) => SCALE.includes(pc(m));
const ic = (interval: number) => Math.abs(interval) % 12;
const isConsonant = (interval: number) => CONSONANT_IC.has(ic(interval));
const isPerfect = (interval: number) => ic(interval) === 0 || ic(interval) === 7;
const clamp = (m: number, lo: number, hi: number) =>
  Math.max(lo, Math.min(hi, m));

function snap(m: number): number {
  if (inScale(m)) return m;
  for (let d = 1; d <= 6; d++) {
    if (inScale(m - d)) return m - d;
    if (inScale(m + d)) return m + d;
  }
  return m;
}

// Consonant scale-tones near a center, optionally biased to a melodic direction
// (dir = sign of desired motion FROM the center). Returned nearest-first.
function consonantTonesNear(
  played: number,
  center: number,
  dir: number
): number[] {
  const out: number[] = [];
  for (let m = Math.round(center) - 14; m <= Math.round(center) + 14; m++) {
    if (m < PART_LO || m > PART_HI) continue;
    if (!inScale(m)) continue;
    if (!isConsonant(m - played)) continue;
    out.push(m);
  }
  out.sort((a, b) => {
    // Prefer the requested direction of motion, then smooth voice-leading.
    const da = dir !== 0 && Math.sign(a - center) === dir ? 0 : 1;
    const db = dir !== 0 && Math.sign(b - center) === dir ? 0 : 1;
    if (da !== db) return da - db;
    return Math.abs(a - center) - Math.abs(b - center);
  });
  return out;
}

// Nearest dissonant scale-tone to the center (a 2nd/4th/7th above a consonance
// — the raw material of a suspension).
function dissonantToneNear(played: number, center: number): number | null {
  let best: number | null = null;
  let bestErr = Infinity;
  for (let m = Math.round(center) - 8; m <= Math.round(center) + 8; m++) {
    if (m < PART_LO || m > PART_HI) continue;
    if (!inScale(m)) continue;
    if (isConsonant(m - played)) continue; // want a dissonance
    const err = Math.abs(m - center);
    if (err < bestErr) {
      bestErr = err;
      best = m;
    }
  }
  return best;
}

interface Candidate {
  midi: number;
  relation: Relation;
  delayMs: number;
  weight: number;
}

// ── The policy. Given the state and the note just played, weigh the moves. ───
export function decidePartner(st: EngineState, played: number): PartnerNote {
  const mood = st.mood;
  const dir = st.lastPlayed == null ? 0 : Math.sign(played - st.lastPlayed);
  const cadence = pc(played) === LEADING_PC; // leading tone → wants to resolve
  const lastP = st.lastPartner ?? CENTER;
  const cands: Candidate[] = [];

  // 1. ECHO — canon at the octave (fall back to unison range if out of bounds).
  {
    let em = played + 12;
    if (em > PART_HI) em = played;
    if (em < PART_LO) em = played + 12;
    em = clamp(snap(em), PART_LO, PART_HI);
    cands.push({
      midi: em,
      relation: "echo",
      delayMs: CANON_DELAY,
      weight: mood === "shadow" ? 6 : 1,
    });
  }

  // 2. INVERT — mirror the played note around the C5 axis.
  {
    const im = clamp(snap(2 * AXIS - played), PART_LO, PART_HI);
    cands.push({
      midi: im,
      relation: "invert",
      delayMs: REACT,
      weight: mood === "contrary" ? 4 : 1,
    });
  }

  // 3. CONTRARY — consonance reached by moving opposite to the visitor.
  {
    const want = -dir || 1;
    const tones = consonantTonesNear(played, lastP, want);
    if (tones.length) {
      cands.push({
        midi: tones[0],
        relation: "contrary",
        delayMs: REACT,
        weight: mood === "contrary" ? 5 : mood === "shadow" ? 2 : 3,
      });
    }
  }

  // 4. CONSONANCE — nearest smooth consonant answer (voice-leading default).
  {
    const tones = consonantTonesNear(played, lastP, 0);
    if (tones.length) {
      cands.push({
        midi: tones[0],
        relation: "consonance",
        delayMs: REACT,
        weight: 2,
      });
    }
  }

  // 5. SUSPEND / REFUSE — hold a dissonance; on a cadence, that is a refusal.
  {
    const dtone = dissonantToneNear(played, lastP);
    if (dtone != null) {
      const rel: Relation = cadence ? "refuse" : "suspend";
      const w =
        mood === "wilful"
          ? cadence
            ? 8
            : 5
          : cadence
            ? 1
            : 0.4;
      cands.push({
        midi: dtone,
        relation: rel,
        delayMs: mood === "wilful" ? REACT + 130 : REACT,
        weight: w,
      });
    }
  }

  // 6. RESOLVE — on a cadence, non-wilful voices land on a tonic-triad tone.
  if (cadence && mood !== "wilful") {
    const res = consonantTonesNear(played, lastP, 0).find((m) =>
      TRIAD_PC.includes(pc(m))
    );
    if (res != null) {
      cands.push({ midi: res, relation: "resolve", delayMs: REACT, weight: 6 });
    }
  }

  // Fux's prohibition: penalize parallel perfect fifths / octaves.
  for (const c of cands) {
    const interval = c.midi - played;
    if (
      isPerfect(interval) &&
      st.prevInterval != null &&
      isPerfect(st.prevInterval) &&
      ic(interval) === ic(st.prevInterval) &&
      Math.sign(interval) === Math.sign(st.prevInterval)
    ) {
      c.weight *= 0.12;
    }
  }

  // Weighted seeded pick.
  const pool = cands.filter((c) => c.weight > 0);
  const total = pool.reduce((s, c) => s + c.weight, 0);
  let chosen = pool[0] ?? cands[0];
  if (total > 0) {
    let r = st.rng() * total;
    for (const c of pool) {
      r -= c.weight;
      if (r <= 0) {
        chosen = c;
        break;
      }
    }
  }

  // Tension bookkeeping — the engine's "will".
  switch (chosen.relation) {
    case "suspend":
      st.tension = Math.min(1, st.tension + 0.22);
      break;
    case "refuse":
      st.tension = Math.min(1, st.tension + 0.34);
      break;
    case "resolve":
      st.tension = Math.max(0, st.tension - 0.45);
      break;
    default:
      st.tension = Math.max(0, st.tension * 0.9 - 0.02);
  }

  const interval = chosen.midi - played;
  st.lastPlayed = played;
  st.lastPartner = chosen.midi;
  st.prevInterval = interval;

  return {
    midi: chosen.midi,
    relation: chosen.relation,
    interval,
    delayMs: chosen.delayMs,
    tension: st.tension,
  };
}

// Reusable helpers for the view layer.
export const relationLabel: Record<Relation, string> = {
  echo: "echo — canon at the octave",
  invert: "inversion — mirrored",
  contrary: "contrary motion",
  consonance: "consonance",
  suspend: "suspension — dissonance held",
  refuse: "refusal — resolution withheld",
  resolve: "resolution",
};

export function intervalIsConsonant(a: number, b: number): boolean {
  return isConsonant(a - b);
}

export function moodBlurb(mood: Mood): string {
  switch (mood) {
    case "shadow":
      return "close imitation — answers you at a canonic delay";
    case "contrary":
      return "the mirror — moves against you, inverts your line";
    case "wilful":
      return "its own will — suspends, and refuses to resolve";
  }
}
