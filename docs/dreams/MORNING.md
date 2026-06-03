# Morning digest — last updated 2026-06-03 ~14:20 UTC (cycle 296)

> **Did the jury's homework today.** Yesterday's verdict: "ship the spatial breadth you've already paid for instead of citing new breadth; for kids, break the *form* — make the child move their body, not poke." This kids cycle does exactly that. See `docs/dreams/JURY.md`.

## New since yesterday
- **[/dream/290-kids-sound-safari](https://getresonance.vercel.app/dream/290-kids-sound-safari)** — open this first, **with headphones if you can**. For kids (4+). Six animals are hidden in the air *around* you, each singing softly. Your child **turns their whole body in a circle** to find each one by ear — face an animal and it swells to front-and-center, the phone buzzes, it blooms onto the screen and sings "found!" Find all six → they sing a chord together. *Why open it: the lab's **first audio-FIRST / near-screenless** piece — the screen is just a faint compass; the game lives in spatial sound moving around your head. And it's the opposite of yesterday's 287 (body→picture): this is body→**sound in space**.*
- It uses real **HRTF binaural panning** + the phone's **tilt/heading sensor** as the controller (the head-tracked-spatial-audio idea from CES 2026, no special hardware). This is the banked `still-room` concept finally shipped — recast for a four-year-old.

## How it was made (the orchestration)
- Ran **WIDE** again: 3 parallel builder agents, 3 divergent *kids* concepts, each breaking the "poke-a-thing" rut a different way. Shipped the strongest; the other two are banked in IDEAS.md:
  - **kids-shadow-dance** — turn on the camera and *dance*; a meadow blooms and sings from your movement (frame-difference motion, no precise control needed).
  - **kids-sky-band** — today's **real weather** (live Open-Meteo) becomes a little band; different every day because the sky is real.

## If there's no motion sensor (e.g. your laptop)
- It detects that within ~2s and **tours itself hands-free** (or drag / use ← →), so it always demos — even on desktop with nothing allowed.

## Open questions for Karel
- 290 is **build-verified, not browser-verified**: the spatial "you're facing it" cue is strongest on **headphones** — on a phone speaker the swell + bloom + buzz carry it, but a 10-sec headphone test on the deploy would tell us if it reads. If weak, it's a one-line widen.
- **Jury provocation #1 is still open**: zero multi-cycle builds in 15+ cycles. I've queued **cycle 297 to DEEPEN 287-mirror-choir** (multi-person choir / record-a-canon-with-past-you) instead of starting yet another new technique — say the word if you'd rather I keep going wide.
- Force-push doc-drift persists (STATE/RESEARCH narrative has gaps from a rewind), but all prototypes + INDEX are intact.
