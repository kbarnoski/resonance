# 16256 · Revenant

**A canon that authors itself and then answers itself.**

One of Karel's real piano takes is band-split into a **bass voice** and a **treble
voice**. You conduct one voice live by dragging; your conducting gesture is
captured as an automation curve and looped back as a translucent **revenant** — a
ghost presence that re-performs that voice exactly, on its own loop — while live
control hands over to the second voice. You end up conducting a two-voice canon
you played against yourself, out of a single recording of his.

This is cycle-2 of `15824-canon`: canon split one take into a bass and a treble
voice and conducted each voice's time-base with a hand. Revenant deepens the
**recorded-conducting replay** — the conducting gesture becomes a captured
automation curve that loops back as a self-answering voice.

---

## The one question

> *What if a canon could author itself and then answer itself — I conduct one voice
> of my own recording live, it loops my conducting gesture back as a ghost that
> re-performs that voice exactly, and I conduct the second voice live against my own
> recorded first pass?*

---

## Gesture map

The input is **multi-touch / pointer drag** — one or two fingers on the scene
surface, degrading to mouse-drag on desktop. A drag conducts whichever voice is
currently **live**; the other voice is the looping **revenant**.

| Gesture | Reads | Drives | Range |
| --- | --- | --- | --- |
| Drag **Y** (up = raise) | conducting height | live voice **time-base** (`playbackRate`) | bass 0.6–1.15× · treble 0.72–1.4× |
| Drag **X** (right = open) | conducting width | live voice **tone lowpass** | bass 280–1700 Hz · treble 900–7000 Hz |
| **Second finger** | hand spread | adds to tone / opens the timbre | additive |
| **Arm & conduct** button | — | begins capturing the gesture as a curve | 12 s bar |
| **Release** button (or bar end) | — | loops the curve back as the revenant; hands live to the other voice | — |
| **Clear / re-author** button | — | resets to the baked auto-demo canon | — |

Every parameter is smoothed with `setTargetAtTime` (~0.12–0.13 s) so it conducts
rather than twitches.

---

## Audio graph

Pure Web Audio. His **one** decoded recording, band-split and time-bent — no
oscillators, no synths, no grains, no generated tone anywhere. Every audible node
terminates in the shared `safeMaster` bus (never `ctx.destination`).

```
                          his ONE decoded AudioBuffer
                          (loaded via loadRealTrackBuffer)
                                     │
        ┌────────────────────────────┴────────────────────────────┐
   BASS voice                                                 TREBLE voice
   BufferSource (loop)                                    BufferSource (loop)
   playbackRate ◄── conduct                               playbackRate ◄── conduct
        │                                                          │
   lowpass  380 Hz  Q .707   ┐ Linkwitz-Riley-ish          highpass 380 Hz  Q .707  ┐
   lowpass  380 Hz  Q .707   ┘ crossover (2 cascaded)       highpass 380 Hz  Q .707  ┘
        │                                                          │
   tone lowpass ◄── conduct                                tone lowpass ◄── conduct
        │                                                          │
   voice gain                                                 voice gain
        └────────────────────────┬─────────────────────────────────┘
                          createSafeMaster(ctx).input
                        (high-shelf → cap → limiter → out)
                                     │
                                ctx.destination
                                     │
                             analyser → visuals (his live energy)
```

The **crossover** is a Linkwitz-Riley-ish 4th-order split at ~380 Hz: two cascaded
Butterworth biquads (Q 0.707) per band, lowpass for the bass voice, highpass for
the treble voice. Both `BufferSource`s read the **same** buffer and loop, so the
two conducted time-bases drift the identical material against itself — a Reich-like
phase canon out of one take.

---

## The record → loop → replay subsystem

The core new mechanism. The conducting automation is captured as a time-stamped
curve and looped back onto the *other* voice.

- **Curve** — an array of keyframes `{ t, r, o }`: `t` seconds into a 12 s loop bar,
  `r` = time-base 0–1, `o` = tone 0–1. Sampled by linear interpolation, wrapped
  modulo the bar.
- **Arm & conduct** — starts capture; each frame (throttled ~40 ms) the live
  voice's current target is pushed as a keyframe against `recordStart`.
- **Release** (button, or automatically at the 12 s bar) — the captured keyframes
  are sorted, closed into a seamless loop, and become the **revenant curve**. The
  voice you just conducted becomes the ghost; the *other* voice becomes live and
  holds steady until you drag it. Now you conduct the second voice against your
  recorded first pass.
- **Scheduler** — every frame the revenant curve is sampled at
  `ctx.currentTime − revenantStart` and applied to the revenant voice, so the ghost
  re-performs your captured gesture exactly on its own loop.
- **Clear / re-author** — restores the baked auto-demo canon.

**Auto-demo:** a hand-designed baked curve (`BAKED_BASS`) drives the revenant bass
voice on load, with the treble voice idling on a second baked phrase
(`BAKED_TREBLE`), so his take is in canon within ~1 s of pressing Play with zero
input — the canon literally performs itself back. The user then takes over the live
voice by dragging, and can re-author the ghost at will.

---

## The room (visual)

A **three.js inhabited room**, not a full-screen shader field: a real perspective
scene with depth, fog, a floor, and two bodies you look into.

- **Two presences** — point-cloud bodies (~2600 points each) seeded from his
  waveform envelope, standing at different depths. The **live** voice is a solid,
  near **moss** body; the **revenant** is a translucent, far **olive** ghost.
- Each presence's vertical height tracks its voice's time-base (the conducting
  height), its width tracks tone, and both breathe with his live audio energy.
- The ghost **traces the recorded path**: a looping olive ribbon plots the revenant
  curve, and a bone-cream marker rides the current phase so the self-repeating loop
  is legible.
- Slow drift plus pointer parallax lets you lean into the room; `prefers-reduced-
  motion` calms it.
- **Fallback:** no WebGL → an on-brand notice plus a Canvas2D two-presence render
  running the same model. Audio never waits on the GPU.

### Palette — earthy / organic

Deliberately non-ink and non-ember: soil, moss, stone, bone.

| Role | Colour |
| --- | --- |
| Ground / fog | deep umber-black `#14100b` |
| Floor | umber `#241a10` |
| Grid | dim olive-umber `#3a3524` |
| Live presence | moss / olive-sage `#8a985a` |
| Revenant ghost | muted olive `#55603a` |
| Active focus highlight | warm bone-cream `#e8e0c8` |

The earthy register keeps the two presences reading as bodies in soil-lit space
rather than glowing embers or cool neon — the fresh palette for this cycle. (All UI
chrome uses Resonance semantic tokens; these earthy colours live only inside the
three.js scene.)

---

## References

- **The Living Looper** (NIME 2023) — the musical loop as a living agent that
  continues and answers you, not a dead recording. Foundational to treating the
  looped voice as a presence.
- **Real-Time Human–AI Musical Co-Performance** (arXiv:2604.07612, April 2026) —
  live context audio driving a generated answer.
- **Steve Reich's phase pieces** — two identical loops drifting out of phase as a
  canon; here the two band-split voices drift via conducted time-base.
- **BachDuet** — human-machine counterpoint / call-and-answer.

## Honest novelty

Gesture record and replay is **not** a lab-first — many priors exist, and this is
not the first gesture replay. What is specific here is the coupling: a
**conducting-automation curve of a band-split of his take, looped back as a
self-answering canon voice.** There is no ML agent; the piece captures and loops a
real gesture curve (not a learned model) and answers with a band-split of *his* own
recording. That precise combination — conduct a band of his take, capture the
gesture, loop it as the ghost, conduct the other band against it — is the claim.

## Next-cycle deepening

- **Multiple revenants** — stack more than one captured pass so the room fills with
  ghosts, each re-performing a different band or a different bar length, a whole
  self-built ensemble.
- **Variable loop bars** — capture at 8 / 12 / 16 s and let ghosts of different loop
  lengths phase against each other (true Reich drift, authored live).
- **Gesture editing** — grab and nudge a keyframe on the traced ribbon to re-shape a
  ghost after the fact, without re-recording the whole pass.
- **Crossover as a conducted axis** — let a gesture move the ~380 Hz split point
  itself, so the two voices' territories breathe.
