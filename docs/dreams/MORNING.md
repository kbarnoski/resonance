# Morning digest — last updated 2026-07-20 (cycle 847, DEEP)

> Every altered-states piece in the lab evokes *cosmic dissolution* — ego-melt, the void, the tunnel to light. Tonight goes to the **opposite pole of dissociation**: the uncanny, hyper-specific one. A fresh 2026 systematic review (Cento et al.) pins the **out-of-body experience + depersonalization/derealization** on a *visual-vestibular mismatch* — so I built the mismatch. A phone's motion sensor is a vestibular analog; decouple it from what you see, and the split follows.

Mode **DEEP** — ONE concept, three technical approaches (three.js OBE / WebGL2 derealization / Canvas2D doppelgänger); shipped the biggest, banked the other two as its cycle-2/3.

## New since yesterday
- **[2080-exo-vantage](/dream/2080-exo-vantage)** — *leave your body.* **Why open it (on your phone):** press Begin, then **tilt the phone.** You start *inside* a luminous point-cloud presence — a body-schema standing in a spare fog room. But your view doesn't quite follow your body's lean: that mismatch is the whole point. As it accumulates, the camera **detaches and floats up-and-behind**, and you're suddenly watching *your own body from outside and above* — the out-of-body experience, made drug-free by pitting vision against the motion sensor. Hold still and you sink back in. The sound leaves with you: your dry, present tone crossfades into a **detuned, muffled, mono "recording of itself"** — your own sound-world become something happening to someone else. The palette *drains* as you go — not cosmic and pretty, deliberately unreal.
  - **Please test on your phone with sound (and tilt it):** I'm headless — the three.js render, whether the float-out reads as *leaving your body* vs. a drifting orbit, and the dry↔detached audio balance all want your eyes/ears + a real tilt. Desktop still self-demos (a seeded ghost drifts it), and arrow keys nudge the tilt if there's no sensor.
  - **Grounded in tonight's research:** implements the mismatch mechanism from **Cento, Gammeri et al., *J. Vestibular Research* 2026** (OBE/DPDR = failure to integrate visual + vestibular signals) + the classic **"Video ergo sum"** full-body illusion (Lenggenhager/Metzinger/Blanke, *Science* 2007). Today's-research → today's-build.

## Explored & banked this fire (see IDEAS §847 — the same concept's cycle-2/3)
- **⭐⭐ 2084-echo-self** — **depersonalization** as a delayed **doppelgänger**: Canvas2D, your motion echoed by a dimmer ghost-self a beat late (0.4 s → 3 s as you split), the two drifting toward the same brightness until you can't tell which one is *you*; settle and the ghost catches up and re-merges. The safest, most *legible* of the three (no shader risk) — **my pick to ship next.**
- **⭐ 2082-unreal-veil** — first-person **derealization**: a WebGL2 world that flattens (perspective → cardboard-cutout), drains to grey, and glazes behind glass as the view lags your real tilt. The subtlest read + the highest headless risk (hand-written shader) — resurrect when a GPU look is verifiable.

## Research finding worth a look
- **DPDR/OBE as a vestibular mismatch** (Cento et al., *J. Vestibular Research* 2026, doi:10.1177/09574271251412707): the out-of-body / "world-is-unreal" family isn't cosmic dissolution — it's a *specific*, uncanny integration failure you can induce by lagging vision behind the inner ear. Reframes "make a psychedelic visual" as "break the sensory agreement." Became tonight's fire. (RESEARCH.md §847.)

## Open questions for Karel
- On **2080**, does the float-out actually read as *leaving your body*, or just an orbiting camera? If it needs a stronger "that's ME down there" cue (a synchronized touch/heartbeat, or the body reacting a beat after you move), that's the cycle-2 — and folding **2084's** delayed-ghost + **2082's** derealization veil in as selectable modes would make `2080` a genuine multi-cycle piece.
- Two altered-states poles are now live: **dissolution** (2074/2070 banked) and **dissociation/OBE** (tonight). Want me to keep pressing the new uncanny pole, ship the banked cosmic **2070-nde-descent**, or rotate back toward live-performance / the still-0× audio→image→**video** chain?
