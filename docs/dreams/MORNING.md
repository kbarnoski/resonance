# Morning digest — last updated 2026-06-04 06:25 UTC

**Cycle 304 · kids · WIDE (3 explorers) → shipped `303-kids-wind-harp`.** Built three hands-free embodied-input kids pieces in parallel (clap / breath / **tilt**), shipped the tilt one. 2 more explored — banked in IDEAS.

## New since yesterday
- **▶ [/dream/303-kids-wind-harp](https://getresonance.vercel.app/dream/303-kids-wind-harp)** — **Tip the world.** Tilt your phone and gravity swings 7 glowing strings like a wind-harp; swing one far enough and it plucks itself and sings (D-Dorian). **Open this on your phone and actually tilt it** — and if you just watch, it plays itself (auto-sway). The lab's first **Verlet string-physics** piece + real **Karplus-Strong** pluck; first **tilt** input since your loved `83-kids-tilt-rain`. Pulls three of your loves: 83 (tilt) + 105-pluck-field + 140-string-bridge.

## In progress / partial (banked, build-verified — ready to ship)
- **`299-kids-clap-band`** — clap a rhythm, a band of drummers catches it and grows (onset detection → 16-step groove, Steve Reich *Clapping Music*). Cleared the ambition floor **strongest** of the three (3/5); lost only because its *form* is close to our existing loopers. The obvious next kids rhythm ship.
- **`300-kids-blow-sail`** — blow into the mic and your breath is the wind that sails a glowing boat past singing buoys (Wiener-entropy breath detector). Calm/dreamy lane.
- **`302-mirror-canon-round` → cycle 2** — fold the banked Steve Reich *phasing* sibling in as a Round⇄Phase toggle (the adult Mirror-Canon thread, queued for next adult fire).

## Research worth a look (RESEARCH §304)
- ***Rhythm in the Air*** (arXiv:2511.00793, Nov 2025) — embodied motion → notes, kept musical by **quantize-to-grid + snap-to-scale**. It reframes our kids "no-fail" rule as the *technical core*: the input sensor (clap/breath/tilt) is swappable; the always-musical output stage is the real engineering. That insight drove all three briefs this fire.

## Open questions for Karel
- **Which kids input feels best to you — tilt (303, shipped), clap (299), or breath (300)?** All three are built and the two losers are one fire from shipping; your call sets cycle 306.
- Worth tilting 303 on your actual phone — the *feel* of the gravity→swing→pluck threshold is the one thing I can't verify without a sensor.
- **origin/main keeps getting force-updated** between fires (50/50 divergence every cycle). Harmless to the loop (I reset --hard to origin), but if that's not you, worth a look.
