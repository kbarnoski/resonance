// Same-origin multiplayer over BroadcastChannel. NO network, NO server.
// Two tabs/phones on the same URL share ONE room. We sync:
//   - a shared beat-zero epoch (the first player sets it; joiners adopt it)
//   - presence (who is here)
//   - each player's 16-step pattern per voice (last-write-wins)
//
// Audio is NEVER streamed. Each device schedules its own audio locally
// against the shared epoch, so both loops stay phase-locked.

import type { VoiceId } from "./audio";
import { STEPS } from "./audio";

export const ROOM_NAME = "monster-band-room";
export const VOICES: VoiceId[] = ["boom", "honk", "pop", "boing"];

/** A player's pattern: for each voice, a boolean[STEPS]. */
export type Pattern = Record<VoiceId, boolean[]>;

export function makeEmptyPattern(): Pattern {
  return {
    boom: new Array(STEPS).fill(false),
    honk: new Array(STEPS).fill(false),
    pop: new Array(STEPS).fill(false),
    boing: new Array(STEPS).fill(false),
  };
}

export type Msg =
  | { type: "hello"; id: string; epoch: number; t: number }
  | { type: "welcome"; id: string; epoch: number; t: number }
  | { type: "pattern"; id: string; rev: number; pattern: Pattern; t: number }
  | { type: "hit"; id: string; voice: VoiceId; step: number; t: number }
  | { type: "bye"; id: string; t: number };

export function randomId(): string {
  return Math.random().toString(36).slice(2, 9);
}

/**
 * Translate a shared epoch + the AudioContext clock into a continuous loop
 * position. We pin "epoch" to a baseAudioTime captured once, then derive
 * loop phase from ctx.currentTime. Returns seconds since epoch (>=0).
 */
export function makeClock(epochPerfMs: number, perfNowMs: number, ctxNow: number) {
  // ctxNow corresponds to perfNowMs. Seconds elapsed since the shared epoch:
  const elapsedAtCapture = (perfNowMs - epochPerfMs) / 1000;
  // audioTimeOfEpoch = the ctx time that maps to epoch (beat zero)
  const audioTimeOfEpoch = ctxNow - elapsedAtCapture;
  return { audioTimeOfEpoch };
}
