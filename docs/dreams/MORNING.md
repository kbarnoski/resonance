# Morning digest — last updated 2026-06-04 (cycle 306) UTC

**Cycle 306 · kids · WIDE (3 explorers) → ships `306-kids-rain-shaker`.** Three hands-free kid instruments built in parallel; shipped the one with the best phone-review fit and a brand-new input axis.

## New since yesterday
- **▶ [/dream/306-kids-rain-shaker](https://getresonance.vercel.app/dream/306-kids-rain-shaker)** — **Shake the phone like a rainstick.** Gentle shakes = a soft trickle of beads; bigger shakes tumble a warm rain down the screen and ring **D-Dorian** bells. The lab's **first accelerometer (`devicemotion`) instrument** — shake-ENERGY, not tilt. **Open it on your phone and just shake it** (no mic, no camera; if you don't shake, it rains by itself). A hard limiter means it can never blast no matter how vigorously a kid shakes.

## Also explored this fire (build-verified, re-banked — ready to ship)
- **`304-kids-clap-band`** — clap → onset detection → a 16-step groove that layers woodblock/kick/shaker/bell (Steve Reich *Clapping Music*, D-Mixolydian). Cleared the ambition floor **strongest of the three (3/5)** and is the missing kids rhythm lane — but it's **now banked a 3rd time**, so I'm flagging it for a definite ship-or-retire next kids cycle.
- **`305-kids-blow-sail`** — blow into the mic, your breath sails a glowing boat past singing C-Lydian buoys (Wiener-entropy breath detector). Calm/dreamy lane.

## Why rain-shaker won
Best 06:30 phone fit — you shake the phone you're already holding, zero permission friction. A genuinely never-used input axis (accelerometer *shake-energy*, distinct from the tilt in `303` and heading in `290`). And it moves the *experience*: shaking is a new kid gesture, not another poke or sing. Ambition 3/5; dodges every banned tag. (Curation note: the builder used an additive/glow render against the lab's matte house style — I switched it to matte alpha-over before shipping.)

## Research worth a look
- **RESEARCH §306** — CHI **2026** *Designing Interactive Movement Sonification* (+ a CHI'26 movement↔sound workshop). The live research interest is the motion→sound *mapping*, which is sensor-agnostic — so the cheapest, most private, zero-AI body sensor (the phone's own accelerometer) is fair game. That's the rain-shaker hook, and it steers off the camera the last 3 adult fires over-used.

## Open questions for Karel
- **Does the shake feel right?** Threshold/scale are tuned by reasoning, not a real phone — tell me if it's too touchy or too stiff (a one-number fix).
- **`304-kids-clap-band` is now thrice-banked.** Want me to commit to shipping it next kids cycle, or retire it? It keeps winning on gates but losing on experience-novelty.
- **Good news for once:** this fire synced **clean** — no force-push divergence, and the on-disk `AGENT.md` was the current full version (the recurring drift did NOT recur). If that drift was something happening manually, it looks resolved this fire.
