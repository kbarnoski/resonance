# Morning digest — last updated 2026-07-23 (cycle 873, WIDE)

Open the lab: https://getresonance.vercel.app/dream · **headphones + tap a few times for today's piece.**

## New since yesterday — ⭐ `2348-tritone-veil`
**The screen+speakers as a psychophysics instrument that reads YOUR
perception back to you.** It plays Diana Deutsch's **tritone paradox**:
octave-ambiguous tone pairs that are objectively *neither* rising nor falling —
yet you involuntarily hear each as ▲ or ▼, and *which way is yours* (it tracks
your speaking-voice range and dialect). You tap what you hear; a live map draws
your private "signature"; then a spatial choir fades in and **glides endlessly
in your direction** — the room agrees with your nervous system.
→ https://getresonance.vercel.app/dream/2348-tritone-veil
- **No single knob — the purest form yet.** The two independent variables are the
  *objective* tone sequence vs. your *involuntary* percept. They genuinely can't
  collapse to one dial: the tones don't rise or fall, but you unshakeably hear one
  way. The percept can't be autopiloted because it's *yours*.
- **Output is SVG-DOM + a spatialized WebAudio choir** — deliberately off the
  WebGL/Canvas lane the last 10 leaned on. Clinical Ikeda-monochrome, not
  violet-gold.
- **Grounded:** Diana Deutsch, *The Tritone Paradox* (1991); Shepard (1964);
  Risset glissando. Directly cashes the 2026-07-22 jury's #1 (ban the single knob),
  #4 (fresh palette), #5 (a new interaction — the piece is *about you*).

## How this cycle ran
- **WIDE mode:** 3 parallel builders explored one thesis — *make the second
  variable the visitor's own involuntary perception* — via three different
  illusions. Shipped the strongest. **2 more explored** and banked in **IDEAS §873**:
  `moire-drift` (WebGL2 op-art moiré beat-locked to two drones — hypnotic, lost only
  on an over-used output lane) and `freeze-cathedral` (spectral-FREEZE of a piano
  into an accumulating "eternal-now" — lost on the jury's Canvas2D ban; easy re-skin).

## Open questions for you
- **Do you hear ▲ or ▼?** Tap through a full circle and watch your signature
  axis form — Deutsch found it correlates with your speaking voice. Curious whether
  the choir gliding *your* way feels uncanny. A love-tap routes next cycle deeper
  into auditory illusions (scale illusion, octave illusion, phantom words — all
  unbuilt).
- The last never-touched menu item is still an **AI-pipeline chain** (2+ models in
  series, e.g. audio→image embedded in an AV piece — your stated favorite). Needs
  FAL_KEY-budget + api-guard care; say the word and I'll take it on.

## Caveat (honest)
Headless run — no speakers here, so whether the Shepard pairs read as genuinely
octave-ambiguous and whether the choir convincingly glides in your *reported*
direction are reasoned + compile/lint-verified, not ear-verified. By design the
piece **waits for your taps** (no fake self-demo of a percept), so a silent glance
hears one pair + a tap prompt — the payoff needs a few answers. Build gates
(tsc + ESLint + compile) pass; the full `next build` page-collection is blocked
only by the standing fd-cap (`ulimit -n 4096`), same as every recent cycle.
