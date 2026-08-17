# 14848 · Holdlight

A recording you can only keep present by holding your attention on it.

> *"What if a recording had no play button — what if sound existed only while you
> actively, effortfully held your attention on it, and faded the instant you let
> go?"*

Five of Karel's real piano takes (the first five of `REAL_TRACKS`: *Interplay*,
*Bath*, *Welcome Home*, *The Knife*, *2019*) hang as five thin vertical
**filaments of light** on a near-black field, drawn as austere inline SVG in a
committed grayscale palette — white through graphite, luminance only, no hue.

## The concept — an anti-mixer

A fader bank lets you set a level and walk away. Holdlight is the opposite:
**presence is scarce and enacted, never set-and-forget.** There is no play
button and no latch. Attention itself is the instrument. The piece is materially
different after five minutes of tending a few threads while others are allowed
to go dark — it remembers what you neglected.

## How it works

- **Hold → presence.** Press-and-**hold** a filament (pointer down on the thread,
  or hold keyboard keys `1`–`5`) and that take's looping audio fades in while its
  thread brightens, tautens, and quivers. On release, the sound *and* the light
  decay back down over ~1.5s. Continuous, effortful attention is required.
- **Presence *is* the envelope.** The value that drives a thread's brightness is
  the same value written to its `GainNode` each frame — the light you see is
  literally the audio envelope.
- **Finite attention.** At most **two** filaments may sound at once. A third
  press is refused (a brief "can't" pulse on the new thread) rather than granted.
- **Memory of neglect.** Each filament carries `neglect ∈ [0,1]` that **rises
  while unheld** (~105s to full) and **falls while held**. High neglect **dims
  and thins** the thread and scales its revive-rate by **`(1 − 0.72·neglect)`**,
  so a long-neglected thread blooms back slowly. Neglect persists across the
  whole session.
- **True loss.** A thread whose neglect reaches `1.0` and **stays there ~8s**
  goes **permanently dark for the session** — it can no longer be revived until
  a reset. Real consequence, not just dimming.
- **Afterimage.** On release a faint ghost of the last-held brightness lingers a
  beat, then fades.
- **Per-voice reactivity.** Every voice has its **own `AnalyserNode` tap**, so a
  thread quivers to *its* take's live energy, not a shared mix.
- **"Let it all rest."** Resets all neglect, afterimages, and permanent-loss
  state, and lets everything decay to silence.

## Audio rules honored

- **100% Karel's real catalog.** Audio comes only from `loadRealTrackBuffer` over
  the first five `REAL_TRACKS`. **Zero synthesis** — no oscillators, no generated
  tones or noise as music.
- Each voice: looping `AudioBufferSourceNode` → per-voice `GainNode` (the presence
  envelope) → the **one shared `createSafeMaster`** input. Nothing ever connects
  directly to `ctx.destination`.
- **Lazy-loaded.** A track is decoded the first time its thread is pressed (a
  subtle loading shimmer marks the wait); the `AudioContext` is created and
  resumed inside the first user gesture.
- **Graceful degradation.** A track that fails to load is marked with
  `text-destructive` and the rest keep working; a browser with no Web Audio shows
  a notice instead of crashing.

## Reference lineage

- **Pauline Oliveros, *Deep Listening*** — attention framed as an active,
  effortful, whole-body discipline rather than passive reception.
- **The listener as "composer-performer"** — the 2026 framing (ACM Creativity &
  Cognition 2026) of attention itself as the primary creative tool. Here the act
  of attending is the only thing that composes and sustains the sound.

## Next-cycle deepenings

- **Gradient of loss** — instead of a binary permanent-dark, let a lost thread
  leave a severed, drifting fragment that can only be re-anchored by tending its
  neighbors first.
- **Weight of the held pair** — make the two allowed voices influence each other
  (a held thread lends a little revive-rate to the one beside it), so *which*
  pair you hold matters harmonically.
- **Breath cadence** — bind the neglect-rise rate to a slow shared pulse so the
  whole field breathes, making inattention feel like tide rather than clock.
- **Session ledger** — a faint record of which takes you kept alive and which you
  let go, surfaced only at rest.
