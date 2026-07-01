# Dream Replay

*A Canvas2D "engram field" instrument. Zero permissions — no microphone, no camera.*

## The question this answers

What if an instrument recorded you while you played — then, at the peak, stopped
listening and **dreamed your own playing back to you**: your recent gestures
replayed but recombined and drifting, less and less faithful — the way a 2026
model says psychedelic hallucination is *top-down generative replay of the
recently-learned world*, not bottom-up noise?

## The mechanic

A single parameter `α` runs **0 → 1** across a ~50-second arc (it rises slowly and
automatically once you start playing, and you can drive it by hand with **Close
your eyes ▸** / **◂ Wake**, or hand control back with **Let it drift**).

- **WAKE (α low) — faithful, transparent.** You tap/drag the dark field. Every
  onset (a) plays a warm just-intonation bell whose pitch is chosen from a fixed
  diatonic scale by vertical position (higher = higher), and (b) is recorded into
  a ring-buffer **engram** — `{x, y, pitchIndex, velocity, t}` — leaving a
  persistent luminous glyph, hue set by pitch. The field slowly fills with a
  constellation of your own notes. Your gesture directly makes the sound and the
  light.
- **DREAM (α high) — recombined, drifting.** Live input fades out (taps stop
  recording and only sound faintly). A top-down **read-head** now autonomously
  walks the stored engrams in a *recombined* order: a stochastic walk over the
  recorded **sequence transitions** whose sampling **temperature is α**. At low–mid
  α it mostly retraces your real phrases; at high α it jumps freely and recombines
  fragments into sequences you never played. Each visited engram **re-fires** its
  note and **re-blooms** its glyph. As α rises, the spatial positions **drift** (a
  slow field warp), the timing loosens, glyphs smear into afterimage trails, and
  the recombination diverges further from the literal record — your playing,
  dreamed back, dissolving.

**Silent auto-demo:** if you don't interact within ~2.5 s, a synthetic player
auto-taps a short 8-note motif across the field, then the arc proceeds into the
dream on its own — so a reviewer glancing with zero input sees *and hears* the
whole **record → dream → dissolve** arc.

## What's faithful vs what's dreamed

| | Faithful (α low) | Dreamed (α high) |
|---|---|---|
| Sound source | your live onset | the read-head re-firing engrams |
| Pitch | your gesture's height | the recorded engram's pitch |
| Order | your real chronology | stochastic walk (temp = α) over transitions |
| Position | where you touched | recorded position + drift warp |
| Light | persistent glyph you placed | transient re-bloom, smearing into trails |
| Recording | on | off (input fades) |

The only material the dream ever uses is what you actually played. Nothing is
invented from noise; everything is *replay*, recombined.

## Named references

- **Bredenberg et al., "Modeling the hallucinatory effects of classical
  psychedelics in terms of replay-dependent plasticity mechanisms," eLife
  2026;14:RP105968.** The **oneirogen** model: an internal parameter α runs 0→1
  from *awake* (bottom-up sensory, basal-dendrite-driven) to *dreaming* (top-down
  generative replay, apical dendrites dominating). Hallucination is cast as
  top-down generative **replay of the recently-learned world**, driven by
  replay-dependent plasticity — not amplified bottom-up noise. This piece takes
  that literally: α is the temperature of a Markov walk over your just-recorded
  engrams; "recently learned" = the bounded ring buffer; apical/top-down = the
  read-head's rising glow, basal/bottom-up = your fading live input.
- **Carhart-Harris & Friston, REBUS — "relaxed beliefs under psychedelics"**
  (*Pharmacological Reviews* 2019). A *relaxation* account: flattened high-level
  priors let bottom-up prediction errors ascend. Contrast with the replay model's
  *active generative* stance. Here the "priors" are your own just-played phrases;
  the dream is what happens when the generator runs them forward untethered from
  live sensory correction.
- **Predictive processing / active inference** (Friston; Hohwy) frames both: a
  hierarchical generative model balancing top-down predictions against bottom-up
  evidence. α tilts the balance from evidence → prediction as the dream takes over.

## Design / build notes

- **Zero-permission, hand-verifiable take.** Pure Canvas2D + Web Audio, no
  three.js/WebGL. The replay engine lives in `engram.ts` as pure TS (a bounded
  ring buffer + a temperature-sampled Markov `ReadHead` + a deterministic drift
  function), so the record→dream logic is testable and inspectable in isolation.
- **Audio** (`audio.ts`): per-note just-intonation pluck/bell (triangle→sine as
  we dream, short exp-decay gain, capped 10-voice self-cleaning polyphony) over
  the shared `startDroneBank` bed and `createVoidReverb` void, everything through
  a final `DynamicsCompressor`. Drone drive and reverb wetness rise with α so the
  dream sounds wetter, longer, brighter. AudioContext is created/resumed only on
  the Begin gesture; visuals still run if audio is blocked.
- **Safety:** no strobe. All luminance changes are slow/eased (afterimage wash,
  breathing glyphs); nothing pulses faster than ~3 Hz.

## Next-cycle deepening

This is designed as a multi-cycle piece. Next passes:

1. **Plasticity, not just sampling.** Bredenberg's model is *replay-dependent
   plasticity* — let each dream re-fire slightly reweight the transition table, so
   the dream reshapes the memory it draws from (attractors form, phrases mutate
   irreversibly). Currently the transitions are read-only.
2. **True basal/apical two-layer render.** Split the field into an explicit basal
   layer (live, cool, fading with α) and an apical layer (replayed, warm, rising),
   cross-fading rather than sharing one canvas.
3. **Return-to-wake tail.** Let α come back down and show the field *changed* by
   the dream — some drifted glyphs settled in new places, a few phrases the dream
   invented now "remembered" as real. The come-down as consolidation.
4. **Timbral drift with α**, not just longer tails: detune, inharmonic partials,
   and spectral blur as fidelity drops.
5. **Optional gesture recording of velocity envelopes**, so replayed notes carry
   the dynamic shape of the original stroke, not just a point.
