# Morning digest — last updated 2026-10-17T13:27Z

> **A different instrument this time, not another room.** The last two fires both had you fly through a 3-D space that reverberated your piano (`mosaicfield`, then `chamber`). Today's ship breaks that gesture: `21920-pitchlattice` lets you pull your recording's PITCH and TIME onto two separate axes — slow it to a glacial drone without the register dropping, or stretch it with no chipmunk effect. **Today's fresh jury verdict (2026-10-17) names this exact move as its prov-2(b) / prov-4 exit — a 3-D datamatics register-break, not a third straight three.js reverb-space — and escalates the multi-cycle WebRTC shared-room to its #1 "stop deferring it" finding.** See `docs/dreams/JURY.md`.

## New since yesterday
- **`21920-pitchlattice` — transpose your piano's pitch independently of its time.** Move left/right to shift the register ±12 semitones; up/down to set the tempo (4× slower to 2× faster). Because a time-domain delay-line shifter cancels the varispeed, the two never drag on each other — and a stark 3-D black/white/red datamatics lattice makes it visible: the pitch axis slides sideways while the time axis scrolls at the playback rate.
  - **Why open it:** it's a new musical gesture for the lab (an instrument, not a space), in a 3-D datamatics look you fly through, with an on-screen readout that flips "coupled → decoupled" so you can prove the pitch really is independent of time. Headphones, press Play, move the mouse.
  - **status: demoable** — fully playable/audible with the mouse alone; the one-hand camera path (an open hand widens the active band) is untested headless and wants your ~30-sec check when web returns. One honest edge: the extreme corner (max transpose + slowest time) sounds a little artifacty; the mid-range is smooth.

## Also explored (banked, not shipped)
- `roomlattice` — fly your piano through a lattice of 10 COUPLED acoustic rooms, each a real 8-line Feedback Delay Network reverb (booth → cathedral), the space morphing as you cross between nodes. Fully built, stable, and the direct cash of today's FDN research dive — I banked it (IDEAS §1304) only because it would've been a third straight "fly through a reverb space" right behind `chamber`. One re-build from shipping once that gesture has rested; it brings a warm bronze/stone look the lab's never shown.

## Research find worth a look
- **Feedback Delay Network reverb is a live 2026 thread again:** arXiv:2510.00238 (Oct 2026) fits a real-time differentiable FDN for MOVING listeners/sources; arXiv:2508.06686 models COUPLED rooms (a nave opening into a chapel) as one FDN; DAFx26 shipped sfFDN, a real-time FDN library + interactive sandbox. All three point at the reverb/delay verb family and seeded `roomlattice`. (RESEARCH §2026-10-17 17:45.)

## The freeze (one-line, unchanged)
- 🟠 Web prod still frozen ~14 days — same one-command fix (`npm audit fix` → commit `package-lock.json`; 2 high + 1 critical in the tfjs chain, re-verified first-hand this fire: c1302/c1303 routes 404 in prod); it's out of my fence. `pitchlattice` + the whole pile (15+) flush the instant it lands. Still reading it as intentional while you're on the installation — say the word and I'll go fully silent on it.

## Open questions (decisions are yours)
1. **WebRTC shared-listening-room?** Still the last 0× lane AND the only "multi-cycle" ambition criterion the whole window lacks — a 2–3-cycle DEEP build. I keep deferring it because it's near-unverifiable headless while prod is frozen. Want me to start the skeleton when prod returns, keep rotating single-fire verbs/looks, or ship `roomlattice` next?
2. **Three registers in rotation** (violet house look · datum/pitchlattice datamatics · chamber steel/bone), and a fourth banked (roomlattice warm bronze/stone). Happy to keep rotating rather than settling — tell me if any isn't landing for you.
