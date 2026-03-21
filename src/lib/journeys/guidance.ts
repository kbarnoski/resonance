import type { JourneyPhaseId } from "./types";

/** Generic phase transition guidance phrases (used as fallback) */
export const GENERIC_GUIDANCE: Record<JourneyPhaseId, string[]> = {
  threshold: ["breathe...", "close your eyes...", "let the sound find you..."],
  expansion: ["let go...", "you're rising...", "don't resist..."],
  transcendence: ["you are here...", "surrender...", "become..."],
  illumination: ["you see clearly now...", "stay...", "notice everything..."],
  return: ["slowly now...", "the warmth returns...", "remember this feeling..."],
  integration: ["welcome back...", "you are changed...", "carry this with you..."],
};

/** Realm-specific guidance overrides */
export const REALM_GUIDANCE: Record<string, Partial<Record<JourneyPhaseId, string[]>>> = {
  heaven: {
    threshold: ["feel the warmth...", "light is coming...", "open your heart..."],
    expansion: ["rise...", "the light knows you...", "let it lift you..."],
    transcendence: ["you are light...", "there is no boundary...", "this is home..."],
    integration: ["the glow remains...", "carry the warmth..."],
  },
  hell: {
    threshold: ["descend...", "there is no turning back...", "the pit has no bottom..."],
    expansion: ["deeper...", "they are watching...", "the judgement begins..."],
    transcendence: ["the judgement is here...", "there is no mercy...", "witness..."],
    illumination: ["see what survives the fire...", "even here there is truth...", "the ashes speak..."],
    return: ["climb...", "the surface remembers you...", "leave the fire behind..."],
    integration: ["you survived the judgement...", "the fire marked you..."],
  },
  garden: {
    threshold: ["the spores are waking...", "feel the soil...", "life begins small..."],
    expansion: ["it's growing...", "everything connects...", "feel the network..."],
    transcendence: ["you are the network...", "all is one organism...", "breathe with the forest..."],
    integration: ["one spore holds everything...", "you carry the forest..."],
  },
  ocean: {
    threshold: ["sink...", "let the water hold you...", "trust the depth..."],
    expansion: ["deeper...", "the light changes here...", "pressure becomes peace..."],
    transcendence: ["the deep sees you...", "you are weightless...", "become the ocean..."],
    integration: ["you've surfaced...", "the depth stays with you..."],
  },
  machine: {
    threshold: ["connecting...", "signal detected...", "initializing..."],
    expansion: ["uploading...", "bandwidth expanding...", "feel the data..."],
    transcendence: ["you are the network...", "every node is you...", "process everything..."],
    integration: ["link closed...", "the machine remembers you..."],
  },
  cosmos: {
    threshold: ["look up...", "the stars are ancient light...", "you are moving without moving..."],
    expansion: ["stars are being born...", "creation is happening now...", "feel the scale..."],
    transcendence: ["witness the supernova...", "death is creation...", "you are stardust remembering..."],
    integration: ["you are the cosmos looking at itself...", "drift home..."],
  },
  temple: {
    threshold: ["enter the temple...", "the stones are listening...", "breathe with the ancients..."],
    expansion: ["the geometry reveals itself...", "every angle is intentional...", "feel the golden ratio..."],
    transcendence: ["the temple is infinite...", "you are the geometry...", "every ratio is divine..."],
    integration: ["the temple is always here...", "the geometry lives in you..."],
  },
  labyrinth: {
    threshold: ["enter...", "every direction is the same...", "the walls are listening..."],
    expansion: ["you are lost...", "this is where you belong...", "deeper into the maze..."],
    transcendence: ["you are the labyrinth...", "there is no exit because there is no inside...", "the center is everywhere..."],
    illumination: ["the pattern reveals itself...", "you were never lost...", "the maze is the map of your mind..."],
    return: ["the walls are thinning...", "the path appears...", "you chose a direction and it is right..."],
    integration: ["you carry the maze...", "the labyrinth lives in you..."],
  },
  mountain: {
    threshold: ["look up...", "the summit is a rumor...", "begin..."],
    expansion: ["higher...", "the air thins and thoughts clarify...", "don't look down..."],
    transcendence: ["you are above everything...", "the summit is a feeling not a place...", "breathe the infinite..."],
    illumination: ["see how far you've come...", "the view is the reward...", "everything is below you..."],
    return: ["descend gently...", "the mountain stays...", "carry the height..."],
    integration: ["you climbed...", "the summit lives in you now..."],
  },
  desert: {
    threshold: ["step into the light...", "leave everything behind...", "the desert has no mercy and no malice..."],
    expansion: ["the horizon retreats...", "emptiness is freedom...", "the sand knows your footsteps..."],
    transcendence: ["you are the desert...", "emptiness is fullness...", "the light is everything..."],
    illumination: ["the stars emerge...", "silence speaks...", "the desert and the sky are the same infinity..."],
    return: ["the crossing nears its end...", "you survived the emptiness...", "the desert marked you..."],
    integration: ["you crossed the infinite...", "the emptiness lives in you now..."],
  },
  archive: {
    threshold: ["open the first page...", "the library has been waiting...", "every book knows your name..."],
    expansion: ["the library unfolds...", "every thought ever thought is here...", "read deeper..."],
    transcendence: ["you are the text...", "reading and being read are the same...", "infinite knowledge, infinite peace..."],
    illumination: ["you found your book...", "the text is you...", "the library is your mind..."],
    return: ["close the book...", "the words stay with you...", "the silence after reading..."],
    integration: ["the library is always open...", "you carry every book..."],
  },
  storm: {
    threshold: ["it's coming...", "feel the pressure change...", "the storm knows you..."],
    expansion: ["let the storm take you...", "every lightning is a thought...", "the rain is washing everything..."],
    transcendence: ["you are the lightning...", "the storm is alive and you are it...", "infinite power..."],
    illumination: ["the eye...", "perfect calm inside infinite fury...", "the center holds..."],
    return: ["the storm passes...", "every storm ends...", "you survived the infinite..."],
    integration: ["the air is new...", "the storm changed everything..."],
  },
};

/** Get guidance phrases for a phase, with realm-specific overrides */
export function getGuidancePhrases(
  phase: JourneyPhaseId,
  realmId?: string
): string[] {
  if (realmId && REALM_GUIDANCE[realmId]?.[phase]) {
    return REALM_GUIDANCE[realmId][phase]!;
  }
  return GENERIC_GUIDANCE[phase];
}

/** Pick a random guidance phrase for a phase transition */
export function pickGuidancePhrase(
  phase: JourneyPhaseId,
  realmId?: string
): string {
  const phrases = getGuidancePhrases(phase, realmId);
  return phrases[Math.floor(Math.random() * phrases.length)];
}

/** Phase-specific context for AI poetry generation */
export const PHASE_POETRY_CONTEXT: Record<JourneyPhaseId, string> = {
  threshold:
    "Subtle, questioning fragments. Incomplete thoughts trailing off. The feeling of something about to begin. Whispered anticipation.",
  expansion:
    "Build intensity. Shorter, sharper. Energy rising. Words accelerating. Growing urgency and wonder.",
  transcendence:
    "Maximum intensity. Fragmented. Single words allowed. Raw. Overwhelming. Ecstatic dissolution. No complete sentences needed.",
  illumination:
    "Clear-seeing. Longer, more complete thoughts. Insight. The calm after the storm. Contemplative awareness.",
  return:
    "Gentle. Warm. Grounding. Familiar things seen anew. Tenderness. The world returning.",
  integration:
    "Peace. Integration. Simple. Complete. Gratitude. The softest possible words.",
};

/** Phase-specific voice speed */
export const PHASE_VOICE_SPEED: Record<JourneyPhaseId, number> = {
  threshold: 0.75,
  expansion: 0.85,
  transcendence: 1.0,
  illumination: 0.8,
  return: 0.75,
  integration: 0.7,
};
