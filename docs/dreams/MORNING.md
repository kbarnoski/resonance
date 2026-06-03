# Morning digest — last updated 2026-06-03 ~06:15 UTC (cycle 292, kids · WIDE, 3 explored)

**Open this first:** [/dream/284-kids-thunder-drum](https://getresonance.vercel.app/dream/284-kids-thunder-drum)
*(Tap the drum skin anywhere — center for a deep round boom, the rim for a bright slap. Hit it hard or roll fast and the head's tension bends the pitch up before it settles. Multi-touch. Never silent.)*

## New since yesterday
- **284-kids-thunder-drum — the lab's first *playable physical-modeling* instrument.**
  Every other kids toy plays a Karplus pluck / triangle bell locked to **C-major
  pentatonic**. This one is different at the root: it's a tiny **non-linear modal
  synthesis** of a circular drum head — the pitches are real **membrane eigenmodes**
  (Bessel-zero ratios), inharmonic and **non-pentatonic by physics**.
  - **The signature: a tension pitch-glide.** Hit it hard and all partials start
    sharp then relax to rest pitch — the "bwooOOWww" of a thunder-drum / tympani,
    wired directly to how hard you strike.
  - **Strike position = timbre** (center = round/dark, rim = bright/slappy), mirrored
    by a three.js membrane that ripples outward from exactly where you touch.
  - The **deepest answer yet to your "audit the SOUND" note** — it diversifies the
    *synthesis method*, not just the scale (beyond the recent tuning-only breaks at
    272/276/280). Refs: nlm (arXiv 2603.10240, 2026); Rayleigh 1877. Kids 4+, 3.69 kB.

## Also explored this fire (build-verified, banked in IDEAS.md)
- **kids-singing-bowl** — drag a finger round the rim and a shimmer **grows out of the
  rubbing** (friction/stick-slip), rings on when you lift; three.js metal bowl + cymatic
  water. The lab's first sustain-by-gesture / stick-slip excitation.
- **kids-jelly-choir** — squish a wobbly soft-body blob and it **sings its own wobble**
  (mass-spring/Verlet), squish two for a just-intonation harmony; inline SVG, cute faces.

## Research worth a look
- **§292 — real-time physical modeling is a whole untouched sound family for the lab.**
  *nlm — Non-linear Modal Synthesis* (arXiv 2603.10240, Mar 2026) + Bessel membranes
  (Rayleigh 1877). Pick a *physical object* (drum/bell/plate/jelly) and its eigenmodes
  hand you inharmonic, non-pentatonic pitches for free. The drum is the first; bowl +
  jelly are queued; a *playable* Chladni plate is the obvious next.

## Open questions for Karel
- The kids zone's monotony is the **sound**, not the input — recent fires broke the
  tuning, now the synthesis method. Keep pushing this axis, or pivot the next kids cycle
  to a fresh *interaction* (multi-user, camera/body, haptic)?
- Adult side: your stated #1 — **AI-image-INSIDE-an-AV-piece** — is still 0× in the last
  15. Want cycle 293 to finally spend a DEEP fire on it?
