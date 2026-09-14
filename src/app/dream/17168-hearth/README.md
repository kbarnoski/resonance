# 17168-hearth — A room that remembers being listened in

**Status:** Demoable. Enter the room to hear Karel's real take and see the warm
WebGPU field; open a second tab for instant two-tab co-presence. Runs solo
(ambient presence), degrades to a static warm still where WebGPU is missing, and
stays in-memory where storage is blocked.

## The one question

What if a listening room *remembered* everyone who ever listened in it — so the
room itself grows warmer, session after session, from the attention held inside
it?

This is a shared, multi-user, memory piece. Two people (or two browser tabs) join
one synchronized session and listen to the same take together. Their co-present
attention deposits warmth into a persistent field that is remembered across
sessions, per room. The room a visitor enters already carries the warmth of
everyone who listened before — collective listening as **accreted material, not a
stream**.

## How it works

- **Co-presence → attention.** Each participant is a soft presence in a shared
  warm field (the local pointer; a peer's presence streams at ~18 Hz). A single
  scalar — shared attention — rises only when the two presences hold *near* each
  other **and** move *gently* (nearness × gentleness(you) × gentleness(them)). It
  rises slowly and relaxes faster when broken. Alone, a slow breathing ambient
  presence stands in so the bloom is fully demoable solo.

- **Attention → warmth.** The shared attention deposits warmth into the field at
  the locus *between* the two presences, lit a little brighter by the music.

- **Warmth → memory.** The field is a WebGPU **compute-shader field**: a
  `GRID×GRID` scalar buffer stepped every frame — it diffuses and settles, keeps
  a low remembered-warmth floor sourced from every stored deposit, and takes the
  bright live deposit from the listeners. Warmth is remembered per room as a
  **compact set of warm deposits** in IndexedDB (keyed by room + track). Repeated
  listening in a similar place *deepens* an existing deposit rather than adding a
  new one, so the room accretes. On load, the field is seeded from that memory
  before the first frame.

- **Cold-start payoff.** A brand-new room is pre-seeded with ~12 synthetic *prior
  held sessions* (warm deposits at plausible loci) so the memory reads on the
  first muted frame, before any peer joins — a memory piece that opened empty
  would fail the read.

- **Sync + sound.** `peerSync` runs an NTP-style shared clock; the host anchors
  the take to a shared instant so it starts sample-close on both peers and
  re-anchors every ~2s for late joiners. Two tabs sync instantly over
  BroadcastChannel; two machines use a copy-paste WebRTC data channel (no server).
  Audio is Karel's **real catalog only** (Welcome Home + Snowflake), routed
  source → warm room lowpass → the ear-safe master bus. No synth, no oscillator,
  nothing to `ctx.destination`; visuals read the music from `master.analyser`.

## Renderer

Raw WebGPU (`navigator.gpu` → adapter → device). A compute pass steps the warm
field; a render pass tone-maps it through ember, amber, honey, rose, and a violet
touch at the hottest cores. Slow luminance drift only — **no strobe, no grain**.
There is no Canvas2D fallback: without WebGPU the room shows an on-brand notice
plus a static warm still.

## Degrades

- No WebGPU → on-brand "this room needs WebGPU" notice over a warm still.
- No peer → solo breathing ambient presence to attune to.
- Storage blocked (private mode / quota) → single-session, in-memory warmth.

## References

- **Devon Turnbull, "HiFi Pursuit Listening Room Dream No. 3"** — Cooper Hewitt,
  Dec 2025 – Jul 2026. A listening room as an inhabited, collective space.
- **UCL Bartlett, "Urban Listening Room"** — 2026. Listening framed as a shared,
  inhabited room rather than individual consumption.
- **Pauline Oliveros — Deep Listening.** Listening together as a discipline; this
  is a room built for that practice.
