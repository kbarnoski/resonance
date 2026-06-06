# Morning digest — last updated 2026-06-06 10:30 UTC, cycle 330 (kids · DEEP)

## ☀️ Open this first
- **[/dream/355-kids-glass-armonica](https://getresonance.vercel.app/dream/355-kids-glass-armonica)** — a kids **glass armonica** (Benjamin Franklin, 1761). **Drag a glass to fill it with water — more water = lower pitch, so the water level you SEE *is* the pitch you hear** — then **swipe a finger across the rims** and the glasses *sing* a sustained, overlapping wash (the famous "otherworldly" armonica sound, not a struck bell). A ghost finger plays it for you on load, so it's alive in ~10 seconds.
  - *Why this one:* the most **legible** mapping the lab has made — water height = pitch, the most direct answer to your "make it legible" note — plus a genuinely **new sound** (continuous rubbed-glass, not another struck bell). The lab's first **fill-to-tune** instrument.

## Also explored this fire (2 more — banked in IDEAS, not shipped)
- **356-pour-organ** — **pour water *between* bottles** to tune them: filling one empties another (conservation puzzle, "if I pour here, that one goes low"). The richest concept of the three — **queued as the strong next kids build** (just needs a simpler one-finger pour gesture for 4-year-olds).
- **354-water-glasses** — the pure struck glass-harp: fill to tune, *tap* to play. Cleanest and simplest; banked.

## How this was made (the studio choreography)
- **DEEP fan-out** (alternating off last fire's WIDE): ONE concept — a *tuned water-glass instrument* — built **three different ways** by three parallel builders (strike / rub-armonica / pour-puzzle), shipped the most surprising + most legible + best-first-open, banked the other two. One commit.
- The research dive was honest: the kids lane is **saturated** (110 pieces). Three fresh ideas were grep-killed against existing/loved pieces (wave-interference is already your loved `133-ripple-pond`; sequencers + soft-body covered; camera/hand-tracking already 5×+). Glass-harp / fill-to-tune was the genuine empty shelf. All three explorers were DOM/CSS, **cooling** the over-used WebGL renderer.

## Open question for you
- **`351-erosion` is triple-banked and ready, but keeps losing curation** for one reason: its whole hook (a tape more ruined *each morning*) is **invisible on a first open** — you'd see a pristine tape today; the magic only shows if you return tomorrow. **(a)** ship it next adult unconditionally, **(b)** reframe it to open already-half-eroded with a "rewind to new" control, or **(c)** leave it banked? Your call unblocks it.
- (Carried) **AI-pipeline-chain in an AV piece** is still blocked on a small paid FAL budget grant — one word and I build it.

## Caveats
- `355` is **build-verified, not browser-verified** — the tune-vs-swipe gesture feel for a 4-year-old, the armonica wash on a phone speaker, and iOS AudioContext unlock are unconfirmed without a real device.
- **GPU verification debt:** `323-latent-condensation` + `327-physarum-choir` have never run on real hardware — worth a pass before the next big WebGPU build.
