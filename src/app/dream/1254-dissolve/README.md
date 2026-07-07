# 1254 · dissolve

**state: ketamine · pole: dissociative** (Cluster 2 — the K-hole)

## The question it answers

> What if, as you play, the sound you hear and the image you see slowly came
> unbound — the ketamine "K-hole" where the senses stop agreeing?

You play the computer keyboard (a floating whole-tone scale). At first each note
*flashes its shape exactly when you hear it* — sound and image are one event. Over
the session the piece progressively **unbinds** the two streams the brain normally
fuses, and you watch (and hear) the world come apart at the seam where perception
is stitched together.

## The audio–visual desync engine (the never-before-built mechanic)

The heart of the piece is a coupler that keeps **two clocks**:

- **The audio stream is always immediate.** A keypress sounds a low-latency
  detuned-oscillator voice *now*. What you *hear* is never desynced — that is what
  keeps it playable, and what makes the drift uncanny rather than laggy.
- **The visual representation of each note is routed through `desyncAmount`
  (0→1)**, which rises slowly over ~90 s of play (auto-drift), is boostable by the
  on-screen slider, and is snapped back by **Re-bind**.

As `desyncAmount` rises, five things happen at once (`page.tsx` `draw()` +
`field.ts` shader):

1. **Onset lag** — the ring's appearance is delayed behind the audio by up to
   `MAX_LAG` (1.1 s). The sound arrives; the picture arrives later.
2. **Phase drift** — the field's slow breathing is `mix(audioEnvelope, detunedLFO,
   desync)`. Bound, it pulses with what you hear; unbound, it breathes on its own
   LFO whose rate does **not** match the audio, so the two rhythms slide out of
   phase.
3. **Time dilation** — a global `timeScale = 1 − desync·0.72` slows the visual
   clock (`uTime`) and each note's dilated age. Everything stretches into slow
   motion; the drifting plane stalls.
4. **Slow-rhythm-down / gamma-up** — `uSlowAmp = 1−desync` thins the slow luminous
   rhythm while `uShimmer = desync` raises a fine grain. This is the literal EEG
   mapping (see refs).
5. **Body-schema melt** — a vertex/domain-warp **shear** on the wireframe plane
   grows with desync, and the void floor lifts so geometry loses contrast and
   "melts into the surroundings"; rings thicken, blur, and desaturate toward ash.

**Re-bind** ramps `desyncAmount` back to 0 fast enough that you *feel* the senses
snap together again — the reset exists so the contrast is visceral.

## Output — the void field (`field.ts`)

A full-screen **WebGL2** fragment shader (single full-screen triangle):

- a **low-poly wireframe plane** receding into **exponential depth-fog** — sparse
  luminous geometry drifting through a vast cold void, not a flat 2D field and not
  a fractal;
- each note is a **thin luminous ring** at its scale-degree anchor, expanding and
  fading; its dilated age (with onset lag) is computed on the CPU;
- palette: **near-monochrome bone / steel / ash** with a faint cold tint — the
  desaturated dissociative look, "melting into surroundings," not jewel-on-dark and
  not pale-print.

## Input & audio

- **Input class: computer keyboard.** Home-row `A S D F G H J K L` = a nine-note
  **whole-tone** scale (deliberately unresolved — nothing settles, the auditory
  face of dissociation). OS key-repeat is ignored so held keys don't retrigger; the
  key→note map is on screen; nine tappable pads make it work on a phone with no
  physical keyboard. Spacebar = Re-bind.
- **Synth:** each key is a stack of detuned triangles + a sine sub + a faint
  inharmonic 2-op FM shimmer, through a soft attack / long release and a mellow
  lowpass. Voices sum through the shared **`convolutionVoid`** reverb (its wet
  **opens** as desync deepens — the space grows vast) over a hollow open-fifth
  **`droneBank`** bed. Master ≈ 0.42 through a `DynamicsCompressor` limiter.
  Gesture-gated: the AudioContext resumes on **Begin** / first key.

## Named references

- **NMDA-antagonist thalamocortical disconnection / sensory-gating breakdown** —
  ketamine's mechanism (PSYCHEDELIC.md, Cluster 2): the drug blocks NMDA receptors,
  disconnecting thalamus from cortex so the normal binding of the senses breaks
  down. This piece enacts that breakdown as a literal *un-binding* of the audio and
  visual streams.
- **PubMed 41453872 (2026), *Cortical Mechanisms Contributing to Ketamine-Induced
  Dissociation*** — EEG under dissociation shows **diminished theta / alpha /
  low-beta** (the slow rhythms that bind perception) together with **elevated low
  gamma**. Mapped literally here: as desync deepens the *slow* visual rhythm thins
  (`uSlowAmp`) while a *fine high-frequency shimmer* climbs (`uShimmer`).

## Safety (photosensitive epilepsy — non-negotiable)

- The "high-frequency shimmer" is **fine-grained, low-contrast spatial grain**
  (film-grain, amplitude ≤ 0.05, mean ≈ constant) — **not** a full-screen
  luminance strobe. There is no flashing luminance channel; `uFlicker` is held at a
  steady 1.0.
- All global luminance changes are smooth over hundreds of ms (time dilation only
  slows things further).
- `prefers-reduced-motion` is honored: drift speed and warp are reduced.
- Full teardown on unmount: `cancelAnimationFrame`, keydown/keyup listeners
  removed, AudioContext stopped and closed, `WEBGL_lose_context` on the GL context.

## Performance

Single full-screen triangle; `low-power` context; DPR capped at 1.6; ≤ 12 note
uniforms; no per-frame allocation. Loads in well under a second.
