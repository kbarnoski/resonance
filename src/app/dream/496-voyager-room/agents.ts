// agents.ts — the shared brain of the Voyager Room.
//
// A small client-side probabilistic generator. Each agent is an autonomous
// machine musician with a distinct PERSONALITY that shapes a probabilistic
// next-note choice. On every frame of a shared beat clock, each agent that is
// "due" generates its next event in lock-step (frame-synchronous streaming
// inference, after StreamMUSE), reading:
//   (a) the shared recent-note buffer of what the OTHER agents just played, and
//   (b) the conductor's live tension target.
//
// The collective dissonance is steered toward the conductor's TENSION dial via
// a live Plomp–Levelt / Sethares sensory-roughness estimate: candidate notes
// are scored by how they move measured roughness toward the target, weighted by
// each personality. Harmonist pulls roughness down; Provocateur pushes it up.

import { Partial, roughnessWithCandidate } from "./roughness";

export type Personality =
  | "leader"
  | "harmonist"
  | "provocateur"
  | "follower"
  | "drifter";

export type OscType = "sine" | "triangle" | "sawtooth" | "square";

export interface AgentSpec {
  id: number;
  name: string;
  personality: Personality;
  color: string; // CSS color for the orb
  hue: number; // for canvas gradients
  osc: OscType;
  pan: number; // -1..1 stereo
  partialWeights: number[]; // relative harmonic amplitudes (for roughness model)
  // How many clock steps between this agent's events (rhythmic density base).
  basePeriod: number;
  octave: number; // register center
}

// A note event emitted on a given frame.
export interface NoteEvent {
  agentId: number;
  midi: number;
  amp: number;
  frame: number;
}

// ── Scale ────────────────────────────────────────────────────────────────
// D dorian-ish modal set — open, lets dissonance be a choice not an accident.
// Scale degrees as semitone offsets from the root.
export const ROOT_MIDI = 50; // D3
export const SCALE = [0, 2, 3, 5, 7, 9, 10]; // D dorian

// Tension-raising intervals (semitones) the Provocateur favours.
const TENSE_INTERVALS = [1, 6, 11, 13]; // m2, tritone, M7, m9

// Build the agent ensemble. 5 autonomous musicians.
export function buildAgents(): AgentSpec[] {
  return [
    {
      id: 0,
      name: "VEGA",
      personality: "leader",
      color: "#a78bfa", // violet
      hue: 258,
      osc: "triangle",
      pan: 0,
      partialWeights: [1, 0.4, 0.22, 0.12, 0.06],
      basePeriod: 2,
      octave: 0,
    },
    {
      id: 1,
      name: "LYRA",
      personality: "harmonist",
      color: "#6ee7b7", // emerald
      hue: 158,
      osc: "sine",
      pan: -0.6,
      partialWeights: [1, 0.5, 0.18, 0.05],
      basePeriod: 3,
      octave: 1,
    },
    {
      id: 2,
      name: "DRACO",
      personality: "provocateur",
      color: "#fda4af", // rose
      hue: 351,
      osc: "sawtooth",
      pan: 0.6,
      partialWeights: [1, 0.7, 0.5, 0.36, 0.26, 0.18],
      basePeriod: 3,
      octave: 0,
    },
    {
      id: 3,
      name: "ECHO",
      personality: "follower",
      color: "#fcd34d", // amber
      hue: 45,
      osc: "square",
      pan: -0.35,
      partialWeights: [1, 0.0, 0.33, 0.0, 0.2, 0.0, 0.14],
      basePeriod: 2,
      octave: 1,
    },
    {
      id: 4,
      name: "NEBULA",
      personality: "drifter",
      color: "#93c5fd", // soft blue
      hue: 213,
      osc: "sine",
      pan: 0.3,
      partialWeights: [1, 0.25, 0.1],
      basePeriod: 5,
      octave: -1,
    },
  ];
}

// Quantise an arbitrary midi to the nearest scale tone.
function snapToScale(midi: number): number {
  const rel = ((midi - ROOT_MIDI) % 12 + 12) % 12;
  const octBase = midi - rel;
  let best = SCALE[0];
  let bestD = 99;
  for (const s of SCALE) {
    const d = Math.min(Math.abs(s - rel), Math.abs(s - rel + 12), Math.abs(s - rel - 12));
    if (d < bestD) {
      bestD = d;
      best = s;
    }
  }
  return octBase + best;
}

// Candidate pitches for an agent: scale tones across a ~1.5 octave window
// centred on the agent's register.
function candidates(spec: AgentSpec): number[] {
  const center = ROOT_MIDI + spec.octave * 12 + 7;
  const out: number[] = [];
  for (let oct = -1; oct <= 1; oct++) {
    for (const s of SCALE) {
      const m = ROOT_MIDI + spec.octave * 12 + oct * 12 + s;
      if (Math.abs(m - center) <= 14) out.push(m);
    }
  }
  return out;
}

export interface BrainState {
  // The buffer of events emitted on the PREVIOUS frame (what others just played).
  prevFrame: NoteEvent[];
  // Sounding partials right now (for the roughness model).
  sounding: Partial[];
  // Conductor's tension target, 0 (consonant) .. 1 (dissonant).
  tension: number;
  // Loudness per agent over the recent window (for the Follower).
  loudness: number[];
  // Currently spotlighted agent id, or -1.
  spotlight: number;
  // The leader's current root motif degree (state the leader repeats).
  leaderMotif: number;
}

// Softmax sampling helper.
function sample(weights: number[]): number {
  let sum = 0;
  for (const w of weights) sum += w;
  if (sum <= 0) return Math.floor(Math.random() * weights.length);
  let r = Math.random() * sum;
  for (let i = 0; i < weights.length; i++) {
    r -= weights[i];
    if (r <= 0) return i;
  }
  return weights.length - 1;
}

// Core: given an agent and the shared brain state, choose its next note.
// This is the frame-synchronous "inference" for one agent on one frame.
export function chooseNote(
  spec: AgentSpec,
  state: BrainState,
  frame: number,
): NoteEvent {
  const cands = candidates(spec);

  // Find what "the others" are doing: most recent event from another agent.
  const others = state.prevFrame.filter((e) => e.agentId !== spec.id);
  const lastOther = others.length ? others[others.length - 1] : null;

  // Loudest recent agent (for the Follower).
  let loudestId = -1;
  let loudestV = 0;
  for (let i = 0; i < state.loudness.length; i++) {
    if (i !== spec.id && state.loudness[i] > loudestV) {
      loudestV = state.loudness[i];
      loudestId = i;
    }
  }
  const loudestEvent =
    loudestId >= 0
      ? [...state.prevFrame].reverse().find((e) => e.agentId === loudestId) ?? null
      : null;

  // Score each candidate. Higher score = more likely.
  const scores = cands.map((cand) => {
    let score = 1;

    // Voice-leading: prefer small steps from this agent's own register center.
    const center = ROOT_MIDI + spec.octave * 12 + 7;
    score *= 1 / (1 + Math.abs(cand - center) * 0.12);

    // Roughness steering — the shared-brain conditioning.
    // Predict roughness if this candidate joins the sounding partials, then
    // reward candidates that move measured roughness toward the target.
    const predicted = roughnessWithCandidate(
      state.sounding,
      cand,
      0.6,
      spec.partialWeights,
    );
    const err = predicted - state.tension; // >0 = too rough, <0 = too smooth
    // Base everyone gently tracks the target.
    score *= Math.exp(-Math.abs(err) * 2.2);

    // Personality-specific biasing (weighted by the dial where noted).
    switch (spec.personality) {
      case "harmonist": {
        // Strongly pull roughness DOWN: punish candidates above target hard.
        if (err > 0) score *= Math.exp(-err * 4.5);
        else score *= 1.4;
        break;
      }
      case "provocateur": {
        // Push roughness UP, scaled by the dial — at tension 0 it behaves.
        if (err < 0) score *= 1 + state.tension * 3.5 * -err;
        // Favour tense intervals against the last other note, scaled by dial.
        if (lastOther) {
          const iv = Math.abs((cand - lastOther.midi) % 12);
          if (TENSE_INTERVALS.includes(iv) || TENSE_INTERVALS.includes(12 - iv)) {
            score *= 1 + state.tension * 2.5;
          }
        }
        break;
      }
      case "leader": {
        // States/repeats a root motif; rhythmically active.
        const motifMidi = ROOT_MIDI + spec.octave * 12 + state.leaderMotif;
        if (snapToScale(cand) === snapToScale(motifMidi)) score *= 2.6;
        // Octave of the root also strong.
        if (((cand - ROOT_MIDI) % 12 + 12) % 12 === 0) score *= 1.8;
        break;
      }
      case "follower": {
        // Echo/imitate the loudest other agent, transposed.
        if (loudestEvent) {
          const target = snapToScale(loudestEvent.midi);
          // reward candidates near a transposition (unison, +5, +7, +12).
          for (const t of [0, 5, 7, 12]) {
            if (snapToScale(cand) === snapToScale(target + t)) score *= 2.2;
          }
        }
        break;
      }
      case "drifter": {
        // Slow whole-tone wash: favour even-semitone neighbours, ignore others.
        const prev = lastOther ? lastOther.midi : center;
        const d = Math.abs(cand - prev);
        if (d === 2 || d === 4 || d === 0) score *= 1.8;
        break;
      }
    }

    return Math.max(1e-6, score);
  });

  const idx = sample(scores);
  const midi = snapToScale(cands[idx]);

  // Amplitude: spotlighted agent and the leader play out front.
  let amp = 0.5;
  if (spec.personality === "leader") amp = 0.62;
  if (spec.personality === "drifter") amp = 0.4;
  if (state.spotlight === spec.id) amp = 0.85;
  else if (state.spotlight >= 0) amp *= 0.6; // others defer

  return { agentId: spec.id, midi, amp, frame };
}

// Does the agent fire on this frame? Spotlight makes it more active; others
// defer (fire less often). Returns true if "due".
export function isDue(spec: AgentSpec, state: BrainState, frame: number): boolean {
  let period = spec.basePeriod;
  if (state.spotlight === spec.id) period = Math.max(1, period - 1);
  else if (state.spotlight >= 0) period = period + 1;
  // Leader is rhythmically active regardless.
  if (spec.personality === "leader") period = Math.max(1, period - 0);
  return frame % period === 0;
}

// Returns which agent (if any) this agent is currently answering/imitating —
// used to draw the lit edge in the constellation. Only the Follower forms a
// strong directed edge; the Harmonist forms a softer one to the last other.
export function answeringEdge(
  spec: AgentSpec,
  state: BrainState,
): number {
  if (spec.personality === "follower") {
    let loudestId = -1;
    let loudestV = 0;
    for (let i = 0; i < state.loudness.length; i++) {
      if (i !== spec.id && state.loudness[i] > loudestV) {
        loudestV = state.loudness[i];
        loudestId = i;
      }
    }
    return loudestV > 0.08 ? loudestId : -1;
  }
  return -1;
}

// Human-readable label for a roughness/tension level.
export function tensionLabel(r: number): string {
  if (r < 0.18) return "Resolved";
  if (r < 0.4) return "Settling";
  if (r < 0.66) return "Tense";
  return "Clashing";
}

// Pitch-class name for display.
const PC = ["C", "C#", "D", "D#", "E", "F", "F#", "G", "G#", "A", "A#", "B"];
export function midiName(midi: number): string {
  return PC[((midi % 12) + 12) % 12];
}
