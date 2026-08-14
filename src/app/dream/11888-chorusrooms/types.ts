// ─────────────────────────────────────────────────────────────────────────────
// 11888-chorusrooms · types.ts — the shared vocabulary.
//
//   A `Participant` is one voice in the shared canon. Three kinds coexist:
//     · "self"    — this tab, shaped live by your pointer.
//     · "peer"    — another open tab/window on this device, arriving over the
//                   zero-server BroadcastChannel.
//     · "phantom" — a seeded resident of the room, breathing deterministically so
//                   a lone muted tab still shows (and, once joined, sounds) a full
//                   living ensemble.
//   Room geometry, the synth (voice.ts) and the SVG (render.tsx) all speak this.
// ─────────────────────────────────────────────────────────────────────────────

export type ParticipantKind = "self" | "peer" | "phantom";

export interface Participant {
  /** Stable identity — a tab id, or "phantom-N". */
  id: string;
  kind: ParticipantKind;
  /** Pointer x in [0,1] → stereo pan and room-x. */
  px: number;
  /** Pointer y in [0,1] → timbre (brightness) and room-y. */
  py: number;
  /** This voice's entry point in the shared bar, [0,1). */
  slot: number;
  /** Scale-degree index into the just pentatonic (see voice.ts). */
  scaleIdx: number;
  /** Visual+audio weight, [0,1]. Phantoms recede as real tabs join. */
  presence: number;
  /** True when this participant is the elected conductor (leader). */
  conducting: boolean;
}
