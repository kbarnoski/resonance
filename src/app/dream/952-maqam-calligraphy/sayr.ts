// sayr.ts — the long-form self-developing journey of a taqsim.
//
// The sayr is the customary PATH of melodic development: a taqsim opens low
// near the tonic (qarar), ascends to the ghammaz, establishes the upper jins,
// modulates to a related maqam for tension/peak, then descends home and rests.
//
// We model it as a state machine over a journey position 0→1 across ~5+ min,
// with memory: the piece at minute 5 is genuinely different from minute 1.

import {
  ADJACENCY,
  AJNAS,
  buildScale,
  MAQAMAT,
  MaqamName,
  MaqamDef,
  ScaleDegree,
} from "./maqam";

export type Stage =
  | "qarar-low" // resting low, exploring the lower jins
  | "ascent" // climbing toward the ghammaz
  | "ghammaz" // established on the pivot, upper jins
  | "modulation" // a related maqam washes in
  | "peak" // highest register, maximum tension
  | "descent" // coming home through the modulations
  | "qarar-home"; // long final rest on the tonic

export const STAGE_LABEL: Record<Stage, string> = {
  "qarar-low": "qarar — resting low",
  ascent: "ascent — reaching for the ghammaz",
  ghammaz: "ghammaz — the pivot established",
  modulation: "modulation — a related maqam washes in",
  peak: "peak — the highest register",
  descent: "descent — coming home",
  "qarar-home": "qarar — the long rest on the tonic",
};

// Stage boundaries as fractions of the total journey (≈5.5 min default).
const STAGE_PLAN: { stage: Stage; until: number }[] = [
  { stage: "qarar-low", until: 0.16 },
  { stage: "ascent", until: 0.32 },
  { stage: "ghammaz", until: 0.46 },
  { stage: "modulation", until: 0.62 },
  { stage: "peak", until: 0.74 },
  { stage: "descent", until: 0.9 },
  { stage: "qarar-home", until: 1.0 },
];

export function stageAt(pos: number): Stage {
  for (const s of STAGE_PLAN) if (pos <= s.until) return s.stage;
  return "qarar-home";
}

// One generated note event, ready for synth + visual.
export interface NoteEvent {
  cents: number; // absolute pitch in cents from tonic
  prevCents: number | null; // for portamento rendering
  durationMs: number; // free, uneven
  emphasis: number; // 0..1 → stroke weight + gain
  glide: boolean; // portamento into this note
  grace: number | null; // grace-note cents (quick neighbour) or null
  trill: boolean; // vibrato/trill on a held tone
  lean: boolean; // over/undershoot settle on a neutral degree
  rest: boolean; // a breath (silence) rather than a struck note
  role: ScaleDegree["role"];
  jinsHue: number;
}

// The live state of the improvisation — carries memory across phrases.
export interface SayrState {
  maqam: MaqamName;
  def: MaqamDef;
  scale: ScaleDegree[];
  pos: number; // journey position 0..1
  lastCents: number;
  steerToward: MaqamName | null; // visitor nudge for next modulation
  steerRest: boolean; // visitor asked to head home early
  modulatedThisStage: boolean;
}

export function initSayr(start: MaqamName): SayrState {
  const def = MAQAMAT[start];
  return {
    maqam: start,
    def,
    scale: buildScale(def),
    pos: 0,
    lastCents: 0,
    steerToward: null,
    steerRest: false,
    modulatedThisStage: false,
  };
}

// Register window (low..high cents) the melody is allowed to roam, by stage.
function registerWindow(stage: Stage): [number, number] {
  switch (stage) {
    case "qarar-low":
      return [-200, 350];
    case "ascent":
      return [-100, 700];
    case "ghammaz":
      return [200, 900];
    case "modulation":
      return [200, 1050];
    case "peak":
      return [500, 1400];
    case "descent":
      return [-100, 700];
    case "qarar-home":
      return [-200, 350];
  }
}

// Choose the next target degree — weighted toward characteristic / rest tones
// and the ghammaz, constrained to the current stage register window.
function chooseTarget(state: SayrState, stage: Stage): ScaleDegree {
  const [lo, hi] = registerWindow(stage);
  const candidates = state.scale.filter((d) => d.cents >= lo && d.cents <= hi);
  const pool = candidates.length ? candidates : state.scale;

  const weight = (d: ScaleDegree): number => {
    let w = 1;
    if (d.role === "ghammaz") w += stage === "ascent" || stage === "ghammaz" ? 4 : 2;
    if (d.role === "tonic") w += stage.startsWith("qarar") ? 5 : 1.5;
    if (d.role === "neutral") w += 2.5; // the half-flats are the point
    if (d.role === "rest") w += 1.5;
    if (stage === "peak") w += d.cents / 400; // pull upward at the peak
    // prefer nearness to the last note (stepwise singing line)
    const leap = Math.abs(d.cents - state.lastCents);
    w *= Math.exp(-leap / 350);
    return Math.max(0.001, w);
  };

  const total = pool.reduce((s, d) => s + weight(d), 0);
  let r = Math.random() * total;
  for (const d of pool) {
    r -= weight(d);
    if (r <= 0) return d;
  }
  return pool[pool.length - 1];
}

// Stepwise path from lastCents to target through the exact-cents degrees.
function pathTo(state: SayrState, target: ScaleDegree): ScaleDegree[] {
  const asc = target.cents >= state.lastCents;
  const between = state.scale
    .filter((d) =>
      asc
        ? d.cents > state.lastCents && d.cents <= target.cents
        : d.cents < state.lastCents && d.cents >= target.cents
    )
    .sort((a, b) => (asc ? a.cents - b.cents : b.cents - a.cents));
  // occasionally allow a small leap by dropping interior degrees
  if (between.length > 2 && Math.random() < 0.35) {
    return [between[Math.floor(between.length / 2)], target].filter(
      (d, i, a) => a.indexOf(d) === i
    );
  }
  return between.length ? between : [target];
}

// Generate the next phrase (3–9 notes) as a list of NoteEvents, then a breath.
export function nextPhrase(state: SayrState): NoteEvent[] {
  const stage = stageAt(state.pos);
  const events: NoteEvent[] = [];
  const phraseLen = 3 + Math.floor(Math.random() * 7); // 3..9

  for (let i = 0; i < phraseLen; i++) {
    const target = chooseTarget(state, stage);
    const path = pathTo(state, target);

    for (let p = 0; p < path.length; p++) {
      const deg = path[p];
      const isTarget = p === path.length - 1;
      const prev = state.lastCents;
      const leap = Math.abs(deg.cents - prev);

      const neutral = deg.role === "neutral";
      // portamento especially on neutral tones and on moderate leaps
      const glide = neutral || (leap >= 150 && Math.random() < 0.5);
      // a grace note before strong targets
      const grace =
        isTarget && Math.random() < 0.3
          ? deg.cents + (Math.random() < 0.5 ? 100 : -100)
          : null;
      // trill/vibrato on long held targets
      const longHold = isTarget && Math.random() < 0.3;
      const lean = neutral && Math.random() < 0.55; // lean on the half-flats

      let durationMs = 120 + Math.random() * 280;
      if (longHold) durationMs = 600 + Math.random() * 900; // leaning tone
      if (isTarget && (deg.role === "rest" || deg.role === "tonic"))
        durationMs += 200 + Math.random() * 300;

      const emphasis = Math.min(
        1,
        (isTarget ? 0.55 : 0.3) +
          (deg.role === "ghammaz" || deg.role === "tonic" ? 0.3 : 0) +
          (neutral ? 0.2 : 0) +
          durationMs / 2000
      );

      events.push({
        cents: deg.cents,
        prevCents: prev,
        durationMs,
        emphasis,
        glide,
        grace,
        trill: longHold && Math.random() < 0.7,
        lean,
        rest: false,
        role: deg.role,
        jinsHue: AJNAS[deg.jins].hue,
      });
      state.lastCents = deg.cents;
    }
  }

  // a breath (rest) between phrases, landing on a rest tone
  events.push({
    cents: state.lastCents,
    prevCents: state.lastCents,
    durationMs: 300 + Math.random() * 900,
    emphasis: 0,
    glide: false,
    grace: null,
    trill: false,
    lean: false,
    rest: true,
    role: "rest",
    jinsHue: AJNAS[state.def.lower].hue,
  });

  return events;
}

// Advance the journey clock; perform a modulation when the stage calls for it.
// Returns a description string if a modulation just happened, else null.
export function advance(state: SayrState, elapsedMs: number, totalMs: number): string | null {
  const prevStage = stageAt(state.pos);
  state.pos = Math.min(1, elapsedMs / totalMs);
  const stage = stageAt(state.pos);

  if (stage !== prevStage) state.modulatedThisStage = false;

  // The visitor asked to head home — collapse toward qarar.
  if (state.steerRest && stage !== "qarar-home" && stage !== "descent") {
    state.pos = Math.max(state.pos, 0.82); // jump into descent
  }

  // Modulate once when entering modulation or peak.
  if (
    (stage === "modulation" || stage === "peak") &&
    !state.modulatedThisStage &&
    Math.random() < 0.9
  ) {
    state.modulatedThisStage = true;
    return modulate(state);
  }

  // On descent, drift back toward home maqam if we wandered.
  if (stage === "descent" && !state.modulatedThisStage && Math.random() < 0.5) {
    state.modulatedThisStage = true;
    return modulate(state, true);
  }

  return null;
}

function modulate(state: SayrState, homeward = false): string {
  const neighbours = ADJACENCY[state.maqam];
  let next: MaqamName;
  if (state.steerToward && neighbours.includes(state.steerToward)) {
    next = state.steerToward;
    state.steerToward = null;
  } else if (homeward) {
    // pick whichever neighbour is "simplest" — prefer Rast/Bayati as home colours
    next =
      neighbours.find((n) => n === "Rast") ??
      neighbours.find((n) => n === "Bayati") ??
      neighbours[0];
  } else {
    next = neighbours[Math.floor(Math.random() * neighbours.length)];
  }
  const from = state.maqam;
  state.maqam = next;
  state.def = MAQAMAT[next];
  state.scale = buildScale(state.def);
  return `${from} → ${next}`;
}
