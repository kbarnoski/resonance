// ─────────────────────────────────────────────────────────────────────────────
// stages.ts — the four-stage immersion ladder.
//
// Renders the central finding of "Micro-phenomenology of immersion and
// perceived presences under DMT" (Neuroscience of Consciousness, 2026,
// niag015): under DMT, immersion is a *structured continuum*. A perceived
// PRESENCE emerges only AFTER multisensory binding and 3D-spatial structure
// have developed — first the body, then the senses bind, then a space forms,
// then something inhabits it. Here that continuum is a single scalar
// `coherence` in [0,1], driven up by sustained bodily motion and decaying
// when the visitor goes still. It is sustained, never permanent.
// ─────────────────────────────────────────────────────────────────────────────

export type Stage = "bodily" | "bind" | "spatial" | "presence";

export const STAGE_LABEL: Record<Stage, string> = {
  bodily: "I · Bodily",
  bind: "II · Binding",
  spatial: "III · Antechamber",
  presence: "IV · Presence",
};

export const STAGE_BLURB: Record<Stage, string> = {
  bodily: "Only motion registers. There is no structure yet — move to make one.",
  bind: "Sensation is binding to your motion; the form constants begin to resolve.",
  spatial: "A receding honeycomb chamber is assembling — the waiting room.",
  presence: "The room is built. Something has arrived in it, and regards you.",
};

/** Map the immersion scalar to a discrete stage. Thresholds are ordered so
 *  the body → bind → space → presence progression is legible. */
export function stageFromCoherence(c: number): Stage {
  if (c >= 0.82) return "presence";
  if (c >= 0.5) return "spatial";
  if (c >= 0.18) return "bind";
  return "bodily";
}

/** Leaky integrator. Sustained motion (energy ~ 0.5–1) climbs to the presence
 *  threshold in roughly 15–35 s; stillness lets it decay back down. Tuned so
 *  the presence is earned and never becomes a permanent autopilot. */
export function nextCoherence(prev: number, energy: number, dt: number): number {
  const RISE = 0.055;
  const DECAY = 0.1;
  const e = Math.min(1, Math.max(0, energy));
  const rise = RISE * e;
  // Decay only bites once motion drops below ~1/3 energy — so the room holds
  // while you keep moving, but recedes when you stop.
  const decay = DECAY * Math.max(0, 1 - e * 3);
  let next = prev + (rise - decay) * dt;
  if (next < 0) next = 0;
  if (next > 1) next = 1;
  return next;
}
