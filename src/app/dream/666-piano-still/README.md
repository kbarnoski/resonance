# 666 · Still Room

**Cycle-4 of the piano spine** (606 vivisection → 630 refract → 643 constellation → **666 still**).

## The one question

> What if Karel's solo piano — isolated down to its 12 pitch classes — became an
> AUDIO-FIRST, eyes-closed instrument you could sit inside: you place a few of his
> notes into a slow looping phrase, then close your eyes while it grows itself over
> minutes in his own timbre, quietly adding consonant notes and letting others fade —
> a still room made of his touch?

## GET OFF THE GLASS

This piece deliberately answers the jury's standing #1 ask. 13 of the last 15
pieces render to a screen; the 2 that don't are the best. So **Still Room is
audio-first**: the music is the whole point. The visual is a single quiet **SVG**
aura — a softly breathing center that brightens as more of his notes ring, small
markers for the notes currently in the loop, and a slow dot tracing the phrase
position. It is designed to be glanced at, then *ignored*: you close your eyes and
the music carries the room. No Canvas2D (jury-banned this cycle), no GPU scene.

## What it does that 643 did not

643 isolated the 12 pitch classes and let you *replay* them as grains — but it was
a static loop. Still Room adds the two things 643 lacked:

1. **A recorded slow phrase.** You tap any of his 12 notes to *place* it into a
   ~16s looping phrase (8 slow slots). Each pass re-fires that note's isolated
   material as a long, tender grain of Karel's real touch.
2. **Audible long-form evolution.** The room is not a loop you watch repeat —
   it changes over minutes. Minute 5 ≠ minute 0.

### Generative growth — the De Roure rule (the anti-pentatonic move)

Every several seconds the room **buds ONE new note**. It is *not* snapped to a
scale. Instead `consonance.ts` scores all 12 pitch classes by an **asymmetric
consonance** measure against the notes currently ringing, then **samples from the
top** (favoring consonance, allowing gentle tension), so harmony is *chosen*, never
snapped.

Anchor reference: **De Roure, "An Asymmetric Formula for Interval Consonance and
its Relation to Harmonic Coincidence," arXiv:2606.16412 (2026).** The two ideas we
honor, in an honest simple implementation:

- **Harmonic coincidence ⇒ consonance.** Each interval gets a base score
  `1 / log2(n·d + 1)` from its just-intonation ratio `n:d` (a Benedetti-style
  harmonic-distance proxy): octave/fifth/fourth/thirds coincide early and score
  high; tritone and minor-second coincide late and score low. (Validated at
  runtime: fifth 0.356 > 4th 0.270 > M3 0.228 > m2 0.126 > tritone 0.095.)
- **Asymmetry.** An interval and its inversion are *not* equally consonant, and
  there is a small flat-vs-sharp lean. We model a directional term that gently
  favors the lower-complexity direction of each interval, so a fifth UP (3:2) and
  the fourth UP (4:3, its inversion) score differently (C→G leans −0.016 where
  C→F leans +0.016). The magnitude is tiny — it adds color and breaks ties, it
  never overrides gross consonance.

The `stillness ↔ growth` lever controls both how *often* the room buds (every ~14s
at stillness, ~5s at growth) and how *wide* the consonance sampling window opens
(top ~2 most-consonant at stillness, top ~6 spicier at growth).

### Decay — the room breathes

Every note loses presence continuously (half-life ~90s of silence). A note that
keeps firing on its loop slot tops itself back up and stays; an un-refreshed note
fades and **drops out** below a threshold. So the texture is alive: it gathers,
sits in presence, and thins. A **release** button halves everyone's presence to let
the room empty gracefully — the optional ritual arc (gathering → presence → release).

## Lineage / named refs

- **Brian Eno — *Music for Airports* / *Discreet Music*.** Generative ambient that
  evolves itself from a few seeds and rewards inattention; the explicit "you can
  ignore it" stance is the spiritual parent of audio-first here.
- **Éliane Radigue.** Long-form, near-static drift where change happens at the
  threshold of perception — the model for "minute 5 ≠ minute 0" without anything
  ever feeling like an *event*.
- **La Monte Young — *The Well-Tuned Piano* / Dream House.** Just-intonation as a
  room you sit inside; the harmonic-coincidence basis of the growth rule is a nod
  to this just-intoned, drone-adjacent tradition.

## Honest ambition self-assessment

- **What lands:** the off-the-glass thesis is real — you genuinely can close your
  eyes and the room carries. The De Roure growth is honestly implemented and
  audibly *not* pentatonic-snapped; the asymmetry is small but present and cited.
  Decay + refresh gives a true long-form arc rather than a loop. The SVG aura is
  calm and alive at a silent glance.
- **Where it's modest:** the asymmetric lean is a hand-built proxy for the real
  paper's formula, not a derivation from it — directionally faithful, not exact.
  The grains are isolated-pitch-class material, so timbre is "his touch, filtered,"
  not pristine single notes; on the synth fallback the isolation is coarser. The
  reverb is a synthesized-noise IR, adequate but not a sampled hall.
- **Reused verbatim (copied in, not cross-imported):** `audio.ts`, `hpss.ts`,
  `chroma.ts` from cycle 643. New work: `consonance.ts` (the growth brain) and the
  looper / decay / SVG aura in `page.tsx`.

## Files

- `page.tsx` — looper, decay engine, De Roure growth driver, SVG aura, controls.
- `consonance.ts` — asymmetric interval-consonance scoring + growth-note chooser.
- `audio.ts` — fetch Karel's recording (read-only existing route) + synth fallback. *(from 643)*
- `hpss.ts` — median-filter harmonic/percussive separation. *(from 643)*
- `chroma.ts` — salience-mask isolation of the 12 pitch classes. *(from 643)*

Route: `/dream/666-piano-still`
