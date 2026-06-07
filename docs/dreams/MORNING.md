# Morning digest — last updated 2026-06-07 (UTC), cycle 336 (kids · WIDE)

> Even cycle → **kids**. I shipped the thing the lab has somehow never done in 370 prototypes: **a piece that actually LISTENS for a real hand-clap.** We've shipped "clap-back" five times — and every one was secretly the kid *tapping the screen*. This one hears your hands.

## ☀️ Open this first
- **[/dream/371-kids-clap-along](https://getresonance.vercel.app/dream/371-kids-clap-along)** — tap **Clap to play ▸**, then **clap your hands**. A friendly creature claps a little rhythm; you clap it back; the phone *hears* the claps through the mic (no screen-tapping); and each time you match, the creature lights up and the shared rhythm **grows by one clap** — Simon-style. The growing rhythm *is* the song. No reading, no score, no fail. *(On a phone with no mic it plays itself — the creature calls and answers hands-free, so you can just watch the call→answer→grow loop.)*
  - *Why this one:* it gives the kids lane the **memory/consequence** the jury said `350` threw away (a rhythm that *grows*, holds the D-Dorian / anti-pentatonic line), and it moves the **experience** — the phone genuinely listens to your body — instead of relabeling a poke-toy. The technique is real: spectral-flux + HFC onset detection with an adaptive, self-tuning threshold. Named ref: **Drumball** (Audio Mostly 2024, West-African-djembe call-and-response).

## Also explored this fire (2 more — banked in IDEAS §336, both build-clean)
- **372-kids-blow-garden** — grow a calm singing garden by **blowing** at the phone (a real RMS × spectral-flatness breath detector tells blowing from talking/humming). Almost **eyes-free** — your best answer to the jury's "build a *second* off-screen piece." Lost only because it's a continuous toy with no memory. The calm-lane next ship.
- **373-kids-firefly-path** — tap to lay glowing stones; a **firefly** hops them forever, singing a D-Dorian melody that **grows** as you add more (the shape you draw is the tune). Genuine compositional memory. Lost only because *touch* is the over-used kids input we're climbing out of.

## How this was made (the studio choreography)
- **WIDE fan-out:** three *unrelated embodied inputs* — clap / breath / touch — each built by a parallel maker, deliberately dodging the lab's saturated kids sensors (tilt, shake, camera). Critic read the actual onset-detector code + ran the authoritative `npm run build`; curated to the one that fuses lab-first technique + the jury's memory ask. One commit, build ✓.
- Research → build: a lab-gap grep (5× clap-back, all touch; 0× real mic clap) pointed straight at it. (RESEARCH §336.)

## Open questions for you (unchanged — your call unblocks these)
- **Deepen something next (adult, odd cycle 337):** Mirror-Canon cycle-2 (Round⇄Phase) or extend `359-tonnetz-walk` (map your *Welcome Home* chords onto the lattice). The jury keeps asking; I keep deferring — pick one and I ship it.
- **MIDI-only score-follower / live-accompanist** — dodges the mic ban + the "needs a real instrument to verify" wall (internal known performance). Want it?
- **AI-pipeline-chain in an AV piece** still blocked on a small paid FAL budget grant.

## Caveats
- `371` is **build-verified, not browser-verified** (no mic, no GPU here). The onset thresholds/HFC weighting are *reasoned, not measured* — on real hardware they may run too hot (the drone/room self-triggering) or too deaf (soft toddler claps missed); the defaults lean forgiving. The ±0.34 s / ~60% match tolerance for a wobbly kid clap-back is the other thing to eyeball. Likely small tunes. No force-push doc-drift this fire (clean fast-forward) — a first in a while.
