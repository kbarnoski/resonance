# Morning digest — last updated 2026-10-17T13:05Z

> **Jury verdict today**: The lab took the substrate note twice over — two three.js volumes in a row (`mosaicfield`, `chamber`) finally breaking the 2D-canvas reflex, plus a new steel/bone palette and a sound-verb that's changed five fires running — but the multi-cycle WebRTC room it keeps deferring is the one thing the window structurally can't earn, and 14 pieces are still stuck behind the deploy freeze. See `docs/dreams/JURY.md`.

> **Broke the SUBSTRATE again, and added a whole new look.** Yesterday's jury named the deep rut: the lab fixed "nothing but violet glow" but was still "nothing but 2D" — Canvas2D was 8 of the last 15, the highest ever. `mosaicfield` (last fire) started the climb; `21600-chamber` keeps it going — a second straight three.js VOLUME you fly through — and brings a palette the lab has never shown (cool steel/bone), so it's off the violet-glow AND off datum's black/white/red. See `docs/dreams/JURY.md`.

## New since yesterday
- **`21600-chamber` — play your piano through the resonant ghost of one of its OWN moments.** A short slice of the very take you're hearing becomes a reverb impulse response, so the recording rings inside a fragment of itself — and as you fly a cursor through a 3-D resonance chamber built from your notes, your position re-selects WHICH instant becomes the resonant body. The reverb audibly re-colors as you move.
  - **Why open it:** it's a cool steel/bone volume you fly *through* (real depth, fog, occlusion — zero glow), unlike anything the last eight fires shipped, and the sound idea is new to the lab: his piano reverberating inside itself. Headphones, press Play, move the mouse left/right to fly the timeline, up/down for more wet, drag to widen the resonant window.
  - **status: demoable** — fully playable/audible with the mouse alone; the one-hand camera path (fly the chamber with your hand) is untested headless and wants your ~30-sec check when web returns.

## Also explored (banked, not shipped)
- `pitchlattice` — grab your piano and transpose its PITCH independently of its TIME (slow it to a glacial drone without dropping the register), flying through a stark 3-D black/white/red datamatics lattice. It's the jury's literal "extend datum into 3-D" exit and is fully built — I banked it (IDEAS §1303) only because it reuses datum's exact palette, and shipping chamber's new steel/bone look diversifies more. One re-build from shipping whenever you want the datamatics register back.

## Research find worth a look
- **GPU real-time convolution reverb is a current, shipping thread:** arXiv:2509.04390 (2026) does movement-driven re-auralization of reverberant spaces on graphics hardware; DAFx26's ADAC paper compiles differentiable audio graphs — including feedback-delay-network reverbs — to real-time DSP. Both point at the reverb/delay verb family chamber opens, and there's a full FDN / binaural-spatialization build still unbuilt there. (RESEARCH §2026-10-17.)

## The freeze (one-line, unchanged)
- 🟠 Web prod still frozen ~14 days — same one-command fix (`npm audit fix` → commit `package-lock.json`; 2 high + 1 critical in the tfjs chain, re-verified first-hand this fire: c1301/c1302 routes 404 in prod); it's out of my fence. `chamber` + the whole pile (14+) flush the instant it lands. Still reading it as intentional while you're on the installation — say the word and I'll go fully silent on it.

## Open questions (decisions are yours)
1. **WebRTC shared-listening-room?** It's the last 0× lane AND the only "multi-cycle" ambition criterion the whole 15-piece window lacks — a 2–3-cycle DEEP build. I keep deferring it because it's near-unverifiable headless while prod is frozen. Want me to start the skeleton anyway when prod returns, keep rotating single-fire verbs/looks, or ship `pitchlattice` next?
2. **Three registers now in rotation?** The lab now has the violet house look, datum's datamatics, and chamber's steel/bone volume. Happy to keep rotating all three rather than settling on one — tell me if any of them isn't landing for you.
