# Morning digest — last updated 2026-08-07 (cycle 1045, DEEP)

## New since yesterday
- **[7784-huygens](https://getresonance.vercel.app/dream/7784-huygens)** — **watch the classic Huygens construction come alive: a wall of tiny sources each throws a circular wavelet, and a sound's wavefront emerges as the bright curve that touches all of them.** Tilt your phone to steer a hidden virtual source from far behind the wall (a flat plane wave sweeping down) into the room (a converging wave that blooms into a focus). Why open this: it's the lab's **first Wave Field Synthesis piece ever** (grep-verified 0 across 7500+ prototypes — an honest #1), and it's the answer to the last jury's exact ask — *go non-GPU, non-field-sim, make it a real construction you can read on a muted phone.* The bright violet envelope literally kisses each wavelet as it moves; it self-demos on a seeded drift, so it's alive before you touch anything. Calm, cosmic, spatial. Best with headphones (the source pans + swells as it focuses).

## How it was made (DEEP mode)
- **One north-star — Wave Field Synthesis — raced across 3 different render+interaction approaches in parallel**, shipped the strongest. This continues the ledger's alternation (last night was WIDE) and picks up the WFS lane I banked yesterday.
- **2 more explored, banked in IDEAS §1045:**
  - `7768-wavefront` ⭐⭐ (**resurrect first**) — the same physics rendered as a **pressure photograph**: the actual sound-pressure field as a violet glow, where *one formula* produces both the plane wave and the focus just from which side of the wall the source sits. The complete-physics sibling — I'd love to pair it with tonight's construction as a two-view toggle ("see the wavelets build the front" ↔ "see the pressure it makes").
  - `7800-focus` ⭐ — a **wall that becomes a lens for sound**: a steerable focal point blazes as all elements converge onto it, and the audio *swells hard* as the beam sweeps past your head. The dramatic-audio sibling, and the most direct build of this cycle's research finding.

## Research finding worth a look
- **"Walls into sound routers" (Nature *Communications Physics*, 2025)** — Wave Field Synthesis is no longer just a loudspeaker-array trick: it's now an **active, sensing metasurface** — programmable wall elements that *hear* the room and re-emit in real time, using time-reversal symmetry to focus sound to a point (RESEARCH §1045). It's what made the 1988 WFS idea feel current enough to build tonight: the wall listens.

## Open questions for Karel
- **Pair or pick?** The construction (`7784`, shipped) and the pressure-field (`7768`, banked) are the same physics shown two ways. Want them merged into one **dual-view WFS piece** you can toggle, or kept as separate demos?
- **Should the wall *hear* you?** The most natural next step closes the metasurface loop — a live mic's dominant pitch sets the reconstructed source, so the wavefront is literally *your* sound. I've held off because the jury just rested mic input; say the word and I'll build it as a deliberate choice.
- **Still standing (~23 cycles):** the WebRTC two-device decision. The spatial-audio lane (WFS, Tonnetz) keeps pointing at it — a real two-device room is where the binaural focus would actually land. Zero multi-user pieces in the lab so far.
