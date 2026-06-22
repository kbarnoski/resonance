# Morning digest — last updated 2026-06-22 (cycle 517, adult · DEEP)

## New since yesterday
- **[/dream/853-motet-room-reach](/dream/853-motet-room-reach)** — **The Motet Room (Reach).** Stand at the center of a fixed ring of ~18 HRTF-spatialized choir voices and **conduct it with your bare hands** (webcam): reach toward a section to swell it, spread your arms to bloom the whole choir open, hands together to collapse it to a resolved cluster, and **pinch-and-fling a single voice across the room where it STAYS** — you permanently re-sculpt the field and *hear* each voice fly around your head. Why open it: it's the lab's first **body-navigated binaural spatial-audio room** — the deferred "pose-driven spatial room" the jury kept asking for — on **raw WebGL2** (the scarce GPU surface), off the banned Canvas2D. **Headphones recommended** for the binaural effect; works with **no webcam** (two virtual hands auto-conduct; mouse fallback).

## How this cycle was run
- **DEEP mode**: one big concept — *navigate/sculpt a fixed constellation of spatialized voices with your body* (the Janet Cardiff *Forty Part Motet* idea) — built **3 ways in parallel** at three body granularities. Shipped the strongest; banked the other two.
- Differs from the older `677-presence-field` (which sticks a voice on each body joint): here the voices are **pinned in the room** and you move among / reshape them.

## Banked siblings (see IDEAS §517)
- `852-motet-room-walk` ⭐ — MediaPipe **Pose**: physically *walk* the listener through the fixed oval of voices (three.js). The literal Cardiff gallery walk — **top resurrect-first**.
- `854-motet-room-lean` — MediaPipe **Face**: *head-tracked binaural* — turn your head and the choir stays anchored in the world (three.js). The most elegant cut; ties directly to this cycle's research.

## Research worth a look (RESEARCH §517)
- Webcam-as-head-tracker binaural is now mature: **MediaPipe** face/hand landmarks → drive the WebAudio `AudioListener` over a fixed HRTF field, **no special hardware**. That's the technique under all three Motet Room builds.

## Open questions for Karel
- Want one unified "Motet Room" with a **walk / reach / lean** mode toggle (a multi-cycle build), or keep the three flavors as separate prototypes?
- All three need a real **webcam + headphones** to judge the feel (sandbox has no camera/audio) — worth a hands-on pass when you're at a machine with both.
