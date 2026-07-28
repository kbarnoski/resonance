// 3248 — crowd
// Pure model of a limited-capacity working memory with retroactive interference.
//
// No DOM, no audio, no randomness beyond a seeded PRNG. Every function here is
// deterministic and unit-testable — the live page and the headless self-check
// both drive the SAME reducers, so what a silent reviewer sees on screen equals
// the numbers proven in runSelfCheck().
//
// The one idea: attention is a near-conserved pool bounded by a small capacity
// budget. Encoding a NEW note injects activation for it and STEALS activation
// from the notes already held — more from those close in pitch and near in the
// phrase (similarity-weighted retroactive interference), and more from traces
// that are already weak (competition, not mere neglect). Fall below the eviction
// threshold and you are forgotten. Rehearsing re-injects a favourite, at the
// others' expense. You cannot keep everything; adding is choosing what to lose.

// ── deterministic PRNG ──────────────────────────────────────────────────────
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

// ── model constants (tuned in scratch sim; see README headless numbers) ──────
export const BUDGET = 5; // capacity budget ≈ Miller/Cowan working-memory slots
export const EVICT_THRESHOLD = 0.2; // below this a trace is forgotten
export const FRESH_ACT = 0.92; // a single-exposure trace tops out here …
export const REHEARSE_INJ = 0.6; // … only rehearsal can push a trace to 1.0
export const REHEARSE_INTERFERE = 0.35; // a re-activated trace competes less than fresh encoding

export const F_MIN = 110; // A2 — bottom of the continuous pitch axis
export const F_MAX = 880; // A5 — top (three octaves, NO scale snapping)

const SIGMA_PITCH = 4; // semitones — pitch-similarity width
const SIGMA_TIME = 0.16; // fraction of the loop — temporal-proximity width
const SIM_BASE = 0.06; // baseline steal even from distant notes (keeps pool alive)
const RECENCY_K = 0.6; // recent traces are more vulnerable to interference
const RECENCY_TAU = 3; // taps
const VULN_GAMMA = 2.2; // weak traces bleed faster (winner-take-all competition)

// ── continuous pitch mapping (radius/y → frequency, no snapping) ─────────────
export function yToFreq(y: number): number {
  const c = Math.min(1, Math.max(0, y));
  return F_MIN * Math.pow(F_MAX / F_MIN, c);
}
export function freqToY(freq: number): number {
  return Math.log(freq / F_MIN) / Math.log(F_MAX / F_MIN);
}
const semitones = (a: number, b: number) => 12 * Math.log2(a / b);
const circTime = (a: number, b: number) => {
  const d = Math.abs(a - b);
  return Math.min(d, 1 - d);
};

// ── types ────────────────────────────────────────────────────────────────────
export interface Note {
  id: number;
  t: number; // position in the looping phrase, [0,1)
  freq: number; // continuous pitch in Hz
  act: number; // activation, [0,1]
  order: number; // tapClock value when last (re)encoded — recency
  rehearsals: number;
}
export interface Gravestone {
  id: number;
  t: number;
  freq: number;
}
export interface MemoryState {
  notes: Note[];
  gravestones: Gravestone[];
  nextId: number;
  tapClock: number;
}
export interface InterferenceEvent {
  id: number; // note that lost activation
  removed: number; // how much was stolen
}
export interface StepResult {
  state: MemoryState;
  sourceId: number;
  events: InterferenceEvent[];
  evicted: Gravestone[]; // notes forgotten by this step (carry pre-evict coords)
}

export function makeState(): MemoryState {
  return { notes: [], gravestones: [], nextId: 1, tapClock: 0 };
}

export function totalActivation(s: MemoryState): number {
  return s.notes.reduce((sum, n) => sum + n.act, 0);
}

// similarity-weighted, recency-weighted, vulnerability-weighted steal weight
function interferenceWeight(src: Note, o: Note, tapClock: number): number {
  const pitchSim = Math.exp(-Math.pow(semitones(src.freq, o.freq) / SIGMA_PITCH, 2));
  const timeSim = Math.exp(-Math.pow(circTime(src.t, o.t) / SIGMA_TIME, 2));
  const age = tapClock - o.order;
  const recency = 1 + RECENCY_K * Math.exp(-age / RECENCY_TAU);
  const vuln = Math.pow(Math.max(0.02, 1.02 - o.act), VULN_GAMMA);
  return (SIM_BASE + pitchSim * timeSim * recency) * vuln;
}

// Distribute a drain pulse across every OTHER note, proportional to weight.
// drain scales with memory load (saturation): a near-empty memory does not
// compete; a near-full one competes hard.
function applyInterference(
  notes: Note[],
  srcId: number,
  pulse: number,
  totalBefore: number,
  tapClock: number,
): InterferenceEvent[] {
  const saturation = Math.min(1, totalBefore / BUDGET);
  const drain = pulse * saturation;
  const events: InterferenceEvent[] = [];
  if (drain <= 0) return events;
  const src = notes.find((n) => n.id === srcId);
  if (!src) return events;
  const others = notes.filter((n) => n.id !== srcId && n.act > 0);
  const ws = new Map<number, number>();
  let wsum = 0;
  for (const o of others) {
    const w = interferenceWeight(src, o, tapClock);
    ws.set(o.id, w);
    wsum += w;
  }
  if (wsum <= 0) return events;
  for (const o of others) {
    const removed = drain * (ws.get(o.id)! / wsum);
    o.act = Math.max(0, o.act - removed);
    events.push({ id: o.id, removed });
  }
  return events;
}

function collectEvictions(s: MemoryState): Gravestone[] {
  const evicted: Gravestone[] = [];
  const survivors: Note[] = [];
  for (const n of s.notes) {
    if (n.act < EVICT_THRESHOLD) {
      const stone: Gravestone = { id: n.id, t: n.t, freq: n.freq };
      evicted.push(stone);
      s.gravestones.push(stone);
    } else {
      survivors.push(n);
    }
  }
  s.notes = survivors;
  return evicted;
}

function clone(s: MemoryState): MemoryState {
  return {
    notes: s.notes.map((n) => ({ ...n })),
    gravestones: s.gravestones.map((g) => ({ ...g })),
    nextId: s.nextId,
    tapClock: s.tapClock,
  };
}

// Encode a brand-new note at (t, freq). Injects FRESH_ACT for it, steals a
// FRESH_ACT-sized pulse from the incumbents, then evicts anyone below threshold.
export function applyTap(prev: MemoryState, t: number, freq: number): StepResult {
  const s = clone(prev);
  const totalBefore = totalActivation(s);
  const id = s.nextId++;
  const note: Note = { id, t, freq, act: FRESH_ACT, order: s.tapClock, rehearsals: 0 };
  s.notes.push(note);
  const events = applyInterference(s.notes, id, FRESH_ACT, totalBefore, s.tapClock);
  s.tapClock++;
  const evicted = collectEvictions(s);
  return { state: s, sourceId: id, events, evicted };
}

// Re-activate an existing note (fight to keep a favourite). Pushes it toward 1.0
// and steals a smaller pulse from the rest — you feel the trade-off.
export function applyRehearse(prev: MemoryState, noteId: number): StepResult {
  const s = clone(prev);
  const n = s.notes.find((x) => x.id === noteId);
  if (!n) return { state: s, sourceId: noteId, events: [], evicted: [] };
  const totalBefore = totalActivation(s);
  n.act = Math.min(1, n.act + REHEARSE_INJ);
  n.rehearsals++;
  n.order = s.tapClock;
  const events = applyInterference(
    s.notes,
    noteId,
    REHEARSE_INJ * REHEARSE_INTERFERE,
    totalBefore,
    s.tapClock,
  );
  s.tapClock++;
  const evicted = collectEvictions(s);
  return { state: s, sourceId: noteId, events, evicted };
}

// ── deterministic self-demo schedule ─────────────────────────────────────────
export type DemoAction =
  | { atMs: number; kind: "tap"; t: number; freq: number }
  | { atMs: number; kind: "rehearse"; targetId: number };

const DEMO_SEED = 99;

// Build the timed action list a silent reviewer watches on first Start:
// 8 taps over ~13 s into a capacity-5 memory, then 2 "favourite" notes
// rehearsed 3× each over ~5 s. Favourites = the two strongest survivors after
// the tap phase (deterministic). Note ids are assigned 1..8 in tap order, so the
// live runner and the headless check target identical ids.
export function buildDemoSchedule(seed: number = DEMO_SEED): DemoAction[] {
  const rnd = mulberry32(seed);
  const taps: { t: number; freq: number }[] = [];
  for (let i = 0; i < 8; i++) {
    const t = rnd();
    const y = rnd();
    taps.push({ t, freq: yToFreq(y) });
  }
  // simulate the tap phase to discover which notes survive as favourites
  let s = makeState();
  for (const tp of taps) s = applyTap(s, tp.t, tp.freq).state;
  const ranked = [...s.notes].sort((a, b) => b.act - a.act);
  const favA = ranked[0]?.id ?? 1;
  const favB = ranked[1]?.id ?? 2;

  const actions: DemoAction[] = [];
  const TAP_GAP = 1600;
  const TAP_START = 700;
  taps.forEach((tp, i) => {
    actions.push({ atMs: TAP_START + i * TAP_GAP, kind: "tap", t: tp.t, freq: tp.freq });
  });
  let clock = TAP_START + taps.length * TAP_GAP + 900; // ~14.4 s in
  const seq = [favA, favB, favA, favB, favA, favB];
  for (const target of seq) {
    actions.push({ atMs: clock, kind: "rehearse", targetId: target });
    clock += 850;
  }
  return actions;
}

// ── headless numeric self-check ──────────────────────────────────────────────
export interface SelfCheck {
  seed: number;
  survivors: number;
  evicted: number;
  favIds: [number, number];
  favActs: [number, number];
  perNote: { id: number; act: number; rehearsals: number }[];
  minSurvivorAct: number;
  capacityEnforced: boolean; // survivors ≤ BUDGET
  rehearsedAreHighest: boolean; // both favourites strictly above every other survivor
  atLeast3Evicted: boolean;
}

export function runSelfCheck(seed: number = DEMO_SEED): SelfCheck {
  const schedule = buildDemoSchedule(seed);
  let s = makeState();
  for (const a of schedule) {
    s = a.kind === "tap" ? applyTap(s, a.t, a.freq).state : applyRehearse(s, a.targetId).state;
  }
  const rnd = mulberry32(seed);
  const tapsForFav: { t: number; freq: number }[] = [];
  for (let i = 0; i < 8; i++) {
    const t = rnd();
    const y = rnd();
    tapsForFav.push({ t, freq: yToFreq(y) });
  }
  let sim = makeState();
  for (const tp of tapsForFav) sim = applyTap(sim, tp.t, tp.freq).state;
  const ranked = [...sim.notes].sort((a, b) => b.act - a.act);
  const favIds: [number, number] = [ranked[0].id, ranked[1].id];

  const alive = [...s.notes].sort((a, b) => b.act - a.act);
  const favNotes = favIds.map((id) => s.notes.find((n) => n.id === id)).filter(Boolean) as Note[];
  const favActs: [number, number] = [favNotes[0]?.act ?? 0, favNotes[1]?.act ?? 0];
  const nonFav = alive.filter((n) => !favIds.includes(n.id));
  const highestNonFav = nonFav.reduce((m, n) => Math.max(m, n.act), 0);
  const minFav = Math.min(...favActs);

  return {
    seed,
    survivors: s.notes.length,
    evicted: s.gravestones.length,
    favIds,
    favActs: [round3(favActs[0]), round3(favActs[1])],
    perNote: alive.map((n) => ({ id: n.id, act: round3(n.act), rehearsals: n.rehearsals })),
    minSurvivorAct: round3(alive.length ? alive[alive.length - 1].act : 0),
    capacityEnforced: s.notes.length <= BUDGET,
    rehearsedAreHighest: favNotes.length === 2 && minFav > highestNonFav,
    atLeast3Evicted: s.gravestones.length >= 3,
  };
}

function round3(x: number): number {
  return Math.round(x * 1000) / 1000;
}
