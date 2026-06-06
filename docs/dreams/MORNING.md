# Morning digest — last updated 2026-06-06 (UTC), cycle 326

## ☀️ Open this first (headphones on!)
- **[/dream/346-kids-sound-hunt](https://getresonance.vercel.app/dream/346-kids-sound-hunt)** — **The lab's FIRST piece you play with your EARS, not your eyes.** Put on headphones, tap Listen, and *turn your phone (or your body)* — six singing animals (owl, frog, bird, whale, cricket, firefly) are hidden in the space around you. Face one and it gets louder and the compass glows; hold on it (or tap the center) and it swoops in with a chime + sparkle. Collect all six → they sing a little song together. The screen is just a dim compass; everything is in the sound.
  - *Why this one:* it's your jury's **#2 provocation made real** — "build the SECOND non-screen piece; `308-orbit-choir` found the freshest axis the lab owns and *nothing followed it*." Now something does — and it's the first **non-screen / audio-first KIDS** piece in 300+ prototypes. It auto-plays itself hands-free, so it's alive even before you touch it; works on your phone with no headphones too (just less magical).

## Also explored this fire (2 more — banked in IDEAS, not shipped)
- **348-kids-song-catcher** — turn toward each hidden note to *catch a melody in order* and build a visible ribbon. The most "legible" of the three (you assemble a known song by ear). Lost only because collecting cute animals out-charms catching abstract notes for a 4-year-old. **Banked as the next kids build.**
- **347-kids-echo-cave** — call into the dark and creatures echo back from fixed directions, building a spatial round. Lovely and simplest to play, but the echo lane is already crowded in the lab — banked with a note to differentiate before reviving.

## How this was made (the studio choreography)
- **DEEP fan-out:** one fresh concept (a non-screen kids listening adventure), three *interaction models*, 3 parallel builders, then I curated on surprise + 4-year-old playability + verifiability. Shipped 1, banked 2. One commit.
- Deliberately **broke from the queued plan** (another two-child consonance duet): `341-kids-star-pair` already shipped that last kids cycle, and a second would be the "too similar" rut you flagged. Picked the freshest untouched axis instead.
- Diversity audit **banned SVG** (5× in the last 10); the winner's dim compass is pure **DOM/CSS** and **device-orientation input is brand new to the lab** (0× recent).

## Open questions for you
1. **343-live-accompanist** (play live, a band locks to your tempo/key) has now lost three fan-outs for the same reason — its whole point needs a real instrument I can't test in a sandbox. Want me to run a focused **verification cycle on a real device** next adult fire? (LiveBand, a Jun-3 2026 arXiv paper, confirms this lane is hot.)
2. **AI-pipeline-chain in an AV piece** (audio→image→video) is still blocked on a small paid FAL budget grant — one word ($X/cycle) and I build it. (Carried since cycle 311.)
3. **GPU verification debt:** `323-latent-condensation` + `327-physarum-choir` have never run on a real GPU. Worth a pass on real hardware before the next big WebGPU/compute build.
