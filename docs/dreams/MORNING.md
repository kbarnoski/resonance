# Morning digest — last updated 2026-06-06 (UTC), cycle 328

## ☀️ Open this first
- **[/dream/350-kids-bump-along](https://getresonance.vercel.app/dream/350-kids-bump-along)** — **The kids lane's first chain-reaction music machine.** A row of seven sleepy, breathing creatures, each a color + a note. Tap one and a "bump" travels down the line — each creature wakes and *sings* as the wave reaches it — then it bounces off the end and rolls back for a return melody. One little push → a whole melodic wave you can watch travel and return. Plays itself on load; **drag a creature sideways to reorder the row and the tune changes.**
  - *Why this one:* it's your **legibility** ask brought to the kids lane — one tap makes an *ordered, visible, repeatable* melody you can follow with your eyes (not an abstract noodle), and it's the lowest-effort possible action for a 4-year-old (tap a big creature). It's also a **grep-verified lab-first**: 110+ kids prototypes and not one chain-reaction / cause-and-effect-cascade piece before this. Newton's-cradle physics, pentatonic so nothing can sound wrong.

## Also explored this fire (2 more — banked in IDEAS, not shipped)
- **348-kids-domino-song** — drag a winding trail of dominoes, tap the first, watch the whole chain topple one-by-one, each fall singing a note. The **most charming** of the three (toppling dominoes are iconic) and the cleanest code — lost only because tapping the *first domino* to tip it is fiddly for a 4-year-old. Flagged as the strong next-kids build (add a big "tip it!" button).
- **349-kids-marble-bells** — place bells, drop a glowing marble, it bounces down chiming each one (Wintergatan/Plinko). Strongest **love-pull** (you loved `169-kids-marble-run`). Banked to refactor a per-frame perf smell + make the bounce more predictable before it ships.

## Note on what I did NOT ship
- The standing queue wanted `348-kids-song-catcher` next — but it reuses **last** kids cycle's exact recipe (`346`'s turn-your-phone + spatial-audio + dim-compass). Shipping it back-to-back would be the "too similar in design and theme" the ambition mandate exists to stop, so I opened a genuinely fresh axis instead (and the research dive confirmed live-weather-for-kids is also already taken — `293-kids-sky-band`).

## How this was made (the studio choreography)
- **DEEP fan-out** (alternating off last fire's WIDE): one ambitious concept — *the first chain-reaction music machine for kids* — attacked by **three parallel builders** via different physics (domino topple / marble cascade / Newton's-cradle impulse). I curated on legibility + 4yo-playability + code-robustness + your love signal, shipped 1, banked 2. One commit.
- All three were SVG-only (dodging the Canvas2D ban + warm WebGL2 + the WebGPU verification-debt) and pentatonic-no-fail. Soft flag: SVG is now warm (4×) — next renderer should cool to DOM/CSS or audio-only.

## Open questions for you (carried — no dream-agent action possible)
1. **343-live-accompanist** (play live, a band locks to you) needs a **real-instrument verification cycle on a device** — it keeps losing fan-outs because its whole point is un-testable in a sandbox. Want me to schedule that?
2. **AI-pipeline-chain in an AV piece** (audio→image→video) is still blocked on a small paid FAL budget grant — one word and I build it.
3. **GPU verification debt:** `323-latent-condensation` + `327-physarum-choir` have never run on real hardware. Worth a pass before the next big WebGPU build.
