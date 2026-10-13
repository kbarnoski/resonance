// VJ TAP — where the show's own musical intelligence leaves a copy for the
// VJ bridge (client.ts). Producers (the particle lead layer) only ASSIGN
// references / scalars here, behind `VJ_TAP.on`; nothing is computed for the
// bridge on the render path. Off (the default) = one boolean check per tick.

import type { PhraseTimeline, SwellState } from "@/lib/particles/phrase-conductor";
import type { CurrentState } from "@/lib/particles/harmonic-currents";
import type { BreathTimeline, BreathState } from "@/lib/particles/breath";
import { VjEventQueue, vjBridgeConfig } from "./protocol";

export interface VjTap {
  /** the bridge is running on this page (set by client.ts) */
  on: boolean;
  events: VjEventQueue;
  // particle lead layer (null when it is not mounted / the feature is off)
  journeyId: string | null;
  phraseTl: PhraseTimeline | null;
  breathTl: BreathTimeline | null;
  swell: SwellState | null;
  current: CurrentState | null;
  breath: BreathState | null;
  soul: string | null;
  image: string | null;
  emblem: boolean;
  imagePalette: string[] | null;
  /** the lead layer's latest analyser bytes (its own reused buffer — read,
   *  never written, by the bridge: no extra analyser reads) + when */
  bytes: Uint8Array | null;
  bytesAt: number;
}

export const VJ_TAP: VjTap = {
  on: false,
  events: new VjEventQueue(),
  journeyId: null,
  phraseTl: null,
  breathTl: null,
  swell: null,
  current: null,
  breath: null,
  soul: null,
  image: null,
  emblem: false,
  imagePalette: null,
  bytes: null,
  bytesAt: -Infinity,
};

let wanted: boolean | null = null;
/** Is the bridge requested for this page? (?osc=1 / kiosk setting — cached).
 *  The lead layer asks at journey mount, which can run before the bridge's
 *  own effect has started, so this reads the flag directly. */
export function vjTapWanted(): boolean {
  if (VJ_TAP.on) return true;
  if (wanted === null) {
    if (typeof window === "undefined") return false;
    let session: Storage | null = null, local: Storage | null = null;
    try { session = window.sessionStorage; } catch { /* blocked */ }
    try { local = window.localStorage; } catch { /* blocked */ }
    wanted = vjBridgeConfig(window.location.search, session, local).on;
  }
  return wanted;
}

/** A new journey mounted on the lead layer: forget the last one's timelines. */
export function vjTapJourney(journeyId: string, phraseTl: PhraseTimeline | null, breathTl: BreathTimeline | null): void {
  VJ_TAP.journeyId = journeyId;
  VJ_TAP.phraseTl = phraseTl;
  VJ_TAP.breathTl = breathTl;
  VJ_TAP.swell = VJ_TAP.current = VJ_TAP.breath = null;
  VJ_TAP.image = null;
  VJ_TAP.emblem = false;
  VJ_TAP.imagePalette = null;
}

/** test hook */
export function __resetVjTap(): void {
  VJ_TAP.on = false;
  VJ_TAP.events.clear();
  vjTapJourney("", null, null);
  VJ_TAP.journeyId = null;
  VJ_TAP.soul = null;
  VJ_TAP.bytes = null;
  VJ_TAP.bytesAt = -Infinity;
  wanted = null;
}
