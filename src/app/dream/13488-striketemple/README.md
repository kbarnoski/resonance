# 13488 · striketemple — *A duet with Karel*

> **What if you could play a duet with Karel — striking bells and bowls that are
> always tuned to whatever chord his recording is playing right now?**

Karel's real recorded piano plays underneath. On screen sits a small ring of
touchable objects — bells, singing bowls and metal rods. Each one is a
physically-modeled **modal resonator**, and the whole ring **retunes itself in
real time to the chord currently sounding in his recording**. Tap or drag an
object and it rings *in his key, over his playing*. You improvise a
modal-percussion layer locked to his live harmony: a duet with the recording —
a playable instrument, not an analysis diagram.

## How the modal synthesis works

Each strike triggers a bank of decaying **sine partials** at
`fundamental × modalRatio` — no samples. The ring you hear is the modes' own
exponential decay: higher partials fall away first (their decay time shortens
with frequency), exactly like real struck metal. Velocity (tap vs. drag speed)
sets both loudness and brightness — hit hard and the upper modes speak.

Three materials, each a different partial set:

- **Bell** — strongly inharmonic, the hum / tierce / quint / nominal cluster of
  a cast bell: `[0.5, 1, 1.19, 1.71, 2, 2.74, 3, 3.76, 4.07]`.
- **Bowl** — near-harmonic `[1, 2, 3, 4, 5, 6]` with a slight per-partial detune,
  so it shimmers and beats like a singing bowl / handpan.
- **Rod** — a free–free metal bar with wide, fast-dying partials
  `[1, 2.76, 5.4, 8.93, 13.34]`.

Everything is bounded — a per-strike peak gain, a fixed partial count, and a
global oscillator budget — so the bank can never run away. All modal voices go
to `safeMaster.input` as a **secondary layer**; his real recording runs through
the same master, and its limiter is the last line of defence, not the first.

## How the chord-following retune works

The recording's analysis (`loadTrackAnalysis`) gives a **time-sorted chord
track**. Each frame the loop finds the chord under the audio playhead, parses it
into a set of chord tones — triad quality, `sus`, `6` / `7` / `maj7`, and the
`9` / `11` / `13` extensions — and spreads those tones **low→high across the
ring** as an ascending voicing. When the chord changes, each object glides to
its new pitch and glows to show it, so a strike is always in his current key.

Graceful degradation, in order:

1. **Published chord track** → follow it against the playhead.
2. **No chord track** → follow the dominant peaks of the live spectrum
   (`safeMaster.analyser`), a rough chord read from the sound itself.
3. **Before play / audio fails** → cycle a gentle `Am7–Dm7–G7–Cmaj7` loop so the
   temple is always playable in a key and never dead. Audio-load failure shows a
   `text-destructive` message but leaves the ring strikable.

## Named references

- **arXiv:2508.01789** — *"Sonify Anything: Towards Context-Aware Sonic
  Interactions in AR"* (Aug 2026). Objects given context-aware,
  physically-modeled modal voices; here the "context" is Karel's live harmony
  rather than a room's geometry.
- Modal / physical-modeling lineage: **Jean-Marie Adrien**'s modal synthesis
  formulation; **differentiable modal resonators** (arXiv:2210.15306); the
  **CORDIS-ANIMA** mass-interaction system (ACROE).

## Play

- Tap or drag across the ring — drag faster to strike harder.
- Number keys **1–7** strike the objects.
- Switch **material** (bell / bowl / rod) to reshape and recolor the whole ring.
- Idle a while and the temple plays itself, striking within his current chord.

---

`state: struck-and-ringing · pole: playable-instrument / live-performance ·
vibe: temple bells over his piano` · refs: arXiv:2508.01789 (Sonify Anything),
arXiv:2210.15306 (differentiable modal resonators), Adrien modal synthesis,
CORDIS-ANIMA
