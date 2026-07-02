# Morning digest — last updated 2026-07-02 ~12:30 UTC (cycle 633)

Psychedelic era · adult · kids paused. Cycle 633 was **DEEP** — one concept (*binocular depth from pure noise*), 2 parallel builders, ship the stronger.

## New since yesterday
- **⭐ `/dream/1105-hidden-eye`** — *a field of noise that hides a living 3-D surface visible only inside your own visual cortex.* A real-time animated **magic-eye (autostereogram / SIRDS)**: what looks like random static hides a breathing dome / tunnel / mandala with **zero monocular cues** — the depth is manufactured entirely by binocular fusion in your brain (Julesz, 1971). It's the one classic case of the lab's favourite "the percept is made in YOU, not the signal" thread (stochastic resonance, combination tones, Deutsch, Caputo) that we'd **never built**. *Why open it:* the default **reveal/wiggle** mode shows the hidden surface hands-free (a lit, gently-swaying heightfield), so it lands at a glance — then hit `R` to try free-fusing the real random-dot stereogram (two guide dots help). The surface morphs on its own and the drone tracks its relief. **Grep-0× technique; a genuinely new toy for the lab.**

## In progress / partial (banked, not shipped — see IDEAS)
- **`1106-wallpaper-deep`** (IDEAS §633) — the sibling explorer: a **colourful wallpaper autostereogram** (repeating psychedelic motif whose local period encodes depth) with a first-class parallax wiggle. Easier to free-fuse + more overtly psychedelic than the random-dot version. Built complete; banked to keep 1105's purer "depth from nothing" ship — its wallpaper-texture mode is the obvious cycle-2 graft onto 1105.
- **`1102-chromatic-organ`** (IDEAS §632) — still warm: the **MIDI/keyboard chromesthesia color-organ** (play notes → Klüver form-constants, Scriabin's clavier à lumières). **The most Karel-serving idea in the queue** — playable, live-performance. Say the word and it ships.

## Research findings worth a look (RESEARCH §633)
- The palinopsia/HPPD dive reconfirmed that trailing afterimages are a *dorsal-stream motion-processing* failure — but grep-first killed the two obvious builds: **LSD tracers are already shipped** (`1047-tracer-drift`) and **MediaPipe hand-tracking is already shipped** (`1051-hand-hyperspace`), and chaotic-attractor instruments are saturated (10/1076/432/872/820). The honest grep-0× move in the same "percept-in-you" lineage was the **autostereogram**: Julesz proved depth can be seen from pure noise with no monocular cue — so I built that.

## Open questions for Karel
- **`1105` wants your eyes.** In the default reveal mode the surface is obvious hands-free — but can you **free-fuse** the random-dot stereogram (`R`), and does the hidden shape "pop"? Fusibility is display-size/distance dependent and hand-tuned.
- **Ship `1102-chromatic-organ` next?** It's the pianist's color-organ, built and clean — just needs a green light.
- **Standing verification debt:** the container's ~4096-fd ceiling still stops local static-gen (`EMFILE`), so GPU/audio pieces can't be hardware-verified in-box. 1105 is a rare *fully-in-box-verifiable* piece (deterministic pixels, node-harness-checked math) — but the *felt* fusion still needs a human. Raising the fd ceiling (or a hardware pass) is the recurring Karel-only fix.
