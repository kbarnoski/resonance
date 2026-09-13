# 17136-tidemark

**Status:** demoable

**What if a recording remembered being heard — growing a geological cross-section of collective attention across every listening session?**

Tidemark treats one of Karel's real catalog recordings as a *medium that remembers being heard*. It is not about harmony or chords — it is about **memory** and the act of listening over time. Every time someone plays the track, the piece deposits a thin warm stratum whose shape records **where attention lingered**. Across sessions the strata stack into a growing tideline — a core sample of how the piece has been listened to.

`input=autonomous · output=Canvas2D · technique=cross-session collective-attention sediment · palette=warm-geological`

---

## The memory / sediment mechanism

1. **Buckets.** The track's duration is split into ~120 time-buckets (x-axis, left→right = time in the track).
2. **Dwell.** Each animation frame adds *dwell* to the bucket under the current playhead. Because dwell accumulates against wall-clock listening, **pausing, replaying and lingering** on a passage accretes more sediment there. Live analyser RMS (off the `safeMaster` tap) is blended in, so louder-attended moments weigh slightly more.
3. **Bedrock.** A static per-track "bedrock" profile is the intrinsic musical weight of each passage: per-bucket **note-density × mean velocity** from `loadTrackAnalysis().notes[]`. If the analysis is null, bedrock is derived from the track's own **per-bucket waveform RMS** (decoded channel data).
4. **Deposit.** On each play → pause / end, the piece lays down **one thin stratum** across the x-axis. Its per-x thickness = this session's dwell (normalized) blended with bedrock. Oldest layers sit at the bottom, newest on top — a sedimentary cross-section that grows with every listen.
5. **Readout.** `session #N · N layers remembered · most-returned passage at M:SS`, where the most-returned passage is the peak of accumulated dwell across all layers. A dashed marker draws it on the canvas.
6. **Replay.** Clicking a passage while playing seeks there (a fresh `AudioBufferSourceNode` at that offset) and continues the same session, so attention accretes where you linger. There is **no pointer-drag** as primary input — the piece reads autonomously from playback and accreted memory.

## Cross-session persistence (IndexedDB)

Strata are written to **IndexedDB** — database `tidemark-memory`, object store `sediment`, **one record per track id**, capped at **60 layers** (oldest dropped beyond the cap). On load the persisted layers are re-stacked oldest-at-bottom, so a returning visitor sees the whole accreted history immediately. **All IndexedDB access is wrapped in try/catch**; on private-mode / blocked storage the piece degrades to a single in-memory session and says so in the readout — it never throws.

## Pre-seeding for glance-verifiability

This concept was banked last cycle because a cold first load started near-empty and the geological payoff was not legible. The fix: on a cold load with no stored record, the piece **pre-seeds ~10–14 synthetic "prior-session" strata** derived from the bedrock, each with low-frequency wobble and one or two random attention "hotspots" so they read as **distinct listening passes**, not a smooth gradient. Seeds are muted (desaturated) so they read as *remembered* rather than fresh, and a readout line — *"seeded with N remembered listens · your sessions layer on top"* — makes the seeding honest and legible. The cross-section and the tideline are readable in the first three seconds, muted, on a phone. Real sessions layer on top; as history grows past the cap, the seeds are the first to be buried and dropped, at which point the readout flips to *"all layers below are real listenings."* A two-step **Forget / reset** control clears both real and seeded layers for the current track (then re-seeds a fresh cold state).

## Degrade paths

- **Buffer load fails** → a `text-destructive` notice; the remembered (seeded + real) sediment still renders.
- **Analysis is null** → bedrock is computed from the decoded buffer's per-bucket RMS instead of the note-roll.
- **No 2D context** → a DOM notice replaces the canvas.
- **IndexedDB blocked / private mode** → single-session in-memory; the readout notes storage is unavailable.

## Audio (rule-10-clean)

Karel's **real catalog only** (default track: **"Bath"** from `REAL_TRACKS`). A fresh `AudioContext` is created per play; exactly one `AudioBufferSourceNode` (from the decoded real buffer) connects to `safeMaster.input` and nothing else. No synth, no oscillator, no microphone, and never `ctx.destination` directly. Visuals are driven by the `safeMaster.analyser` RMS and the playhead. On unmount / track change the rAF is cancelled, the source stopped, `safeMaster` disconnected, and the `AudioContext` closed.

## References

- **The first three.js Conference** (Codrops, 2026-09-10) — Mr.doob's *"cumulative complexity / persistent state"*: the idea of a living generative system that **grows and remembers rather than resets**, keeping the minimal non-recomputable state across a session boundary. Tidemark's sediment is exactly that: state that survives the session and re-forms on return.
- **Katie Paterson** and **dendrochronology / geological core-sampling** — the long-form-accretion art reference: a work whose meaning is the record of time laid down in layers (tree rings, sediment cores), read as a cross-section rather than a moment.

## Palette

Warm geological — umber → amber → ochre — inside the Canvas2D art layer (hex/hsl). Older strata are deep umber and low-lightness; newer strata warm toward ochre/amber; the newest surface is crested by a bright warm **tideline**. Chrome and UI use Resonance semantic tokens (violet accent only); no film-grain / noise-overlay pass.
