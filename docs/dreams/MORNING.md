# Morning digest — last updated 2026-08-09 (cycle 1067, DEEP)

Open the lab: https://getresonance.vercel.app/dream

## New since yesterday
- **[8728-luthier](/dream/8728-luthier)** — **WIRE YOUR OWN INSTRUMENT.** A blank workbench with no synthesizer: you drop point **masses**, string **springs** between them, **ground** a few anchors, pick a **listener** node, then **pluck** — and the object rings. The catch that makes it special: the whole spring network is integrated at *audio rate*, so the listener node's motion literally **IS** the waveform you hear, and the same moving dots you watch **are** the sound. Load the three presets and you *hear the shape*: a **string** (taut line) rings near-harmonic, a **ring** rings like a small inharmonic bell, a **web** (tangle) rattles metallic. This is Claude Cadoz's **CORDIS-ANIMA** idea (ACROE Grenoble; the `miPhysics` library, 2026) made playable — you're the instrument *maker*, not just the player. **Why open it:** it self-plays on load (the default string auto-plucks and rings on a **muted phone**), then wire your own object and pluck it.
- *2 more explored this fire, banked as seeds in IDEAS §1067* — **⭐⭐⭐ `8760-bowweb`** (BOW A SPIDER-WEB OF STRINGS — drag your pointer across a coupled web; fast strokes *sing*, slow ones whisper, and plucking one strand rings its neighbours in sympathy — the most expressive, stage-playable version; resurrect first) and **⭐⭐ `8744-material`** (MATERIAL MORPH — strike one fixed drumhead and dial it from skin → steel bar → gong). Both built clean; curated out on the axes below.

## Why this one (DEEP curate)
- ONE concept — *"what you see vibrating IS what you hear"* — raced across three interaction models (author the topology / bow a web / morph a material). `8728` won on the **boldest, most differentiated verb**: *authoring the object itself* is the genuinely un-built move (our shipped `5000-anneal` only morphs a *fixed* lattice), it's the most faithful to CORDIS-ANIMA, and it's a direct answer to last week's jury note "build one where the visual is **a diagram you edit**, not a glowing-dot field."
- Off the ruts on every axis: Canvas2D (off the raw-WebGL2 look the last few ships shared, and off the banned three.js), pointer, non-violet blueprint palette, and **no drone** — the object's own ring is the only sound.

## In progress / partial
- None mid-build. `8728` is demoable. Biggest next-cycle deepening (README): **pluck the network with your real Path piano** instead of an impulse — so you'd be exciting a hand-built instrument *with your own notes* — plus haptics (the Vibration API is miPhysics' third output) and a bigger net.

## Research findings worth a look
- **§1067 (RESEARCH.md):** mass-interaction physical modeling — Cadoz / CORDIS-ANIMA + the `miPhysics` library's 2026 release (one mass-spring sim = sound + haptics + visuals). The un-built move was to let you *author the topology*, not just play a fixed object.

## Open questions for Karel
- **Try it:** does the string-vs-ring-vs-web timbre change read on your speaker? The physics is real and Node-simulated as stable + distinct; the mix constants are reasoned, not ear-tuned.
- Two strong banked ideas ready next — the **bowed harp-web** (⭐⭐⭐, most stage-playable) or a resurrect that pushes `8744` past `5000-anneal`. A preference?
- **STRATEGIC (flagged ~13 cycles):** "first-ever technique" novelty is exhausted at 1017 prototypes — this cycle is another honest 3/5 with an explicit "NO #1." Formally shift the ambition bar to reward *fresh verb + scope + diversity*? (Note: I corrected two of last week's jury premises — "zero MediaPipe" and "only one multi-user piece" are true only of the last-15 window, not the lab; both are well-populated.)
- Long-standing yes/no (~33 cycles): the **AI-pipeline chain** (music→image→video) — fund a `FAL_KEY` budget or strike it?
