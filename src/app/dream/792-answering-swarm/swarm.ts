// swarm.ts — the SWARM: the cycle-2 motif-memory layer.
//
// A decentralized colony of tiny memory-agents. Each agent holds ONE motif
// fragment harvested from his real playing (a few pitch-classes + rough inter-
// onset rhythm) plus a pheromone/strength value. Each frame every agent SENSES
// the currently-detected chord/key + his energy and DEPOSITS or decays
// pheromone:
//
//   • an agent whose motif sits mostly on chord/scale tones of the detected key
//     is REINFORCED (deposits pheromone) — it "fits" the music right now;
//   • every agent decays a little each frame (evaporation), so a motif only
//     survives if it is repeatedly reinforced over minutes;
//   • the colony is capped; when full, a newly-harvested fragment replaces the
//     WEAKEST current agent.
//
// Over minutes this consolidates the colony toward a few strong "bridging
// motifs" — emergent recurring themes — exactly the stigmergic / small-world
// self-organization Buehler's MusicSwarm describes. The swarm is fed only his
// PAST playing (causal, past-only — cf. LiveBand).
//
// Pure logic, no browser globals. The synth reads the ranked agents and sounds
// the strongest one(s) through 770's soft FM-bell voice.

import {
  chordPitchClasses,
  scalePitchClasses,
  type ChordEstimate,
  type OnsetEvent,
} from "./listener";

export type MotifAgent = {
  id: number;
  pcs: number[]; // pitch-classes of the motif, in order
  gapsMs: number[]; // inter-onset gaps (ms), length = pcs.length - 1
  pheromone: number; // 0..~1+ current strength
  bornMs: number; // clock time it joined the swarm
  reinforcedMs: number; // last time it was reinforced (for recency)
  fits: number; // smoothed 0..1 fit to the *current* harmony (display)
};

export type SwarmState = {
  agents: MotifAgent[];
  nextId: number;
  cap: number;
  clockMs: number;
};

const CAP = 12; // colony size (brief: ~10–14)
const EVAPORATION = 0.0009; // pheromone lost per ms, globally (slow decay)
const DEPOSIT_RATE = 0.0024; // pheromone gained per ms when an agent fits
const MAX_PHEROMONE = 1.4;
const SEED_PHEROMONE = 0.42; // a freshly-harvested motif starts mid-pack

export function makeSwarm(): SwarmState {
  return { agents: [], nextId: 1, cap: CAP, clockMs: 0 };
}

// How well a motif's pitch-classes sit in the current key/chord (0..1).
// Chord tones count full; other scale tones count partial; out-of-key hurts.
export function motifFit(pcs: number[], chord: ChordEstimate): number {
  if (pcs.length === 0) return 0;
  const chordPcs = chordPitchClasses(chord);
  const scalePcs = scalePitchClasses(chord);
  let score = 0;
  for (const pc of pcs) {
    if (chordPcs.has(pc)) score += 1;
    else if (scalePcs.has(pc)) score += 0.55;
    else score += 0; // chromatic / outside → no reinforcement
  }
  return score / pcs.length;
}

// Add a freshly-harvested fragment as a new agent. If the colony is full,
// replace the weakest agent (decentralized turnover — no central scheduler).
export function depositMotif(
  swarm: SwarmState,
  events: OnsetEvent[],
  nowMs: number,
): void {
  if (events.length < 2) return;
  const pcs = events.map((e) => e.pc);
  const gapsMs: number[] = [];
  for (let i = 1; i < events.length; i++) {
    gapsMs.push(Math.max(90, Math.min(900, events[i].tMs - events[i - 1].tMs)));
  }
  const agent: MotifAgent = {
    id: swarm.nextId++,
    pcs,
    gapsMs,
    pheromone: SEED_PHEROMONE,
    bornMs: nowMs,
    reinforcedMs: nowMs,
    fits: 0,
  };

  if (swarm.agents.length < swarm.cap) {
    swarm.agents.push(agent);
    return;
  }
  // Replace the weakest (lowest pheromone) agent.
  let weakest = 0;
  for (let i = 1; i < swarm.agents.length; i++) {
    if (swarm.agents[i].pheromone < swarm.agents[weakest].pheromone) weakest = i;
  }
  swarm.agents[weakest] = agent;
}

// One stigmergy step: every agent senses the current harmony + his energy,
// deposits pheromone if it fits, and evaporates globally. Energy scales the
// deposit (he is actively making harmony to fit against).
export function stepSwarm(
  swarm: SwarmState,
  chord: ChordEstimate,
  energy: number,
  dtMs: number,
): void {
  swarm.clockMs += dtMs;
  const evap = EVAPORATION * dtMs;
  // Reinforcement only counts when he is sounding and the chord is confident.
  const live = energy > 0.1 && chord.strength > 0.18 ? 1 : 0.15;
  for (const a of swarm.agents) {
    const fit = motifFit(a.pcs, chord);
    a.fits = a.fits * 0.9 + fit * 0.1;
    const deposit = fit * DEPOSIT_RATE * dtMs * live * (0.4 + energy);
    a.pheromone = Math.min(MAX_PHEROMONE, a.pheromone + deposit - evap);
    if (deposit > evap * 1.2) a.reinforcedMs = swarm.clockMs;
  }
  // Cull anything that has fully evaporated (frees a slot for new fragments).
  swarm.agents = swarm.agents.filter((a) => a.pheromone > 0.02);
}

// Agents ranked strongest-first (the consolidated themes float to the top).
export function rankedAgents(swarm: SwarmState): MotifAgent[] {
  return [...swarm.agents].sort((a, b) => b.pheromone - a.pheromone);
}

// The currently-strongest agent, or null if the colony is empty.
export function strongestAgent(swarm: SwarmState): MotifAgent | null {
  let best: MotifAgent | null = null;
  for (const a of swarm.agents) {
    if (!best || a.pheromone > best.pheromone) best = a;
  }
  return best;
}

// A 0..1 "consolidation" measure: how concentrated pheromone is in the top
// agents. Low early (many transient equal fragments), high once a few themes
// dominate. Used to show that minute 5 ≠ minute 1.
export function consolidation(swarm: SwarmState): number {
  if (swarm.agents.length < 2) return 0;
  const ranked = rankedAgents(swarm);
  let total = 0;
  for (const a of ranked) total += a.pheromone;
  if (total <= 0) return 0;
  const topN = Math.min(3, ranked.length);
  let top = 0;
  for (let i = 0; i < topN; i++) top += ranked[i].pheromone;
  const share = top / total; // fraction held by the top few
  const ideal = topN / ranked.length; // share if perfectly uniform
  // Map "above-uniform concentration" into 0..1.
  return Math.max(0, Math.min(1, (share - ideal) / (1 - ideal)));
}
