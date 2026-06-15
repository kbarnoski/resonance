# 632 · Polymeter Loom

**The one question:** *What if interlocking polyrhythms wove a hypnotic groove you could watch being woven — Reich-style phasing, where identical patterns slowly drift out of and back into alignment?*

A generative trance-groove engine. Several pitched-percussion voices each play a
Euclidean rhythm; their differing step-counts make a polymetric loop that only
realigns after a long cycle, while a phasing pair slides in and out of unison.
A three.js loom renders each voice as a ring of beads that flash when they fire —
the weave visibly tightening and loosening.

## How it works

### Euclidean rhythms — E(k, n) via Bjorklund
Each voice plays `E(k, n)`: **k onsets spread as evenly as possible across n
steps**. This is computed with the **Bjorklund algorithm** (`bjorklundEuclid`),
which repeatedly merges "remainder" sub-sequences into "group" sub-sequences
until one remainder pool is left — yielding the maximally even distribution.
Examples produced by the implementation:

- `E(4,16)` → `x...x...x...x...` (four-on-the-floor)
- `E(5,8)`  → `x.xx.xx.` (Cuban *cinquillo*)
- `E(3,8)`  → `x..x..x.` (the *tresillo*)
- `E(7,12)` → `x.xx.x.xx.x.`

Tapping `+ / −` on a voice (or the `q/a w/s e/d r/f t/g` keys) nudges **k**, and
the pattern re-derives live.

### Polymeter — differing n
The voices use different step-counts (16, 8, 16, 16, 12). Because the periods
differ, the combined groove is **polymetric**: it only repeats after the **least
common multiple** of all active step-counts (shown live in the status line). The
result is a long, slowly-evolving loop rather than a 1-bar pattern.

### Reich phasing — a tempo offset
The **marimba** and **bell** share the same pattern, but the phasing voices run
**1.2% faster** when phasing is on. They drift out of unison and, much later,
slowly back together — exactly the process Steve Reich built *Piano Phase* and
*Clapping Music* from. This is the long-form evolution: the piece at minute 2
sounds different from minute 0. Toggle it with `space` or the **phasing** button.
In the loom, the phasing rings visibly counter-rotate against the others.

### Synthesis
Warm, musical percussion on a C-Dorian/pentatonic palette: a pitched sine
**kick**, a filtered saw **bass** with sub, an FM **marimba** pluck, an
inharmonic FM **bell**, and a filtered-noise **shaker**. A lookahead scheduler
(25 ms poll, 100 ms window) queues onsets on the Web Audio clock for tight timing.

### Visual (three.js)
Concentric rings — one per voice — built from sphere "bead" meshes at each step
position; onset beads are bright, rests are dim. When a step fires, its bead
flashes (emissive spike + scale pop). The whole loom auto-rotates and breathes
**on mount**, before any audio, so it is alive at a glance. A sweep line orbits
the loom. Rendered with a `PerspectiveCamera`, `MeshStandardMaterial`, additive
emissive flashes, dark background. All geometry/material/renderer are disposed
and the RAF cancelled on unmount.

## Controls
- **Weave / Pause** — start or pause the groove (unlocks AudioContext on gesture)
- **1–5** — toggle each voice on/off
- **q/a w/s e/d r/f t/g** — nudge each voice's onset count k up/down
- **space** — toggle Reich phasing drift
- **tempo** slider — master BPM

## Named references
- **Steve Reich** — phasing technique (*Music for 18 Musicians*, *Clapping
  Music*, *Piano Phase*): identical material at slightly offset tempi sliding
  through phase relationships.
- **Godfried Toussaint** — *The Euclidean Algorithm Generates Traditional Musical
  Rhythms* (2005): the link between Bjorklund's algorithm and world rhythms
  (tresillo, cinquillo, etc.).

## Ambition
- **#2 — ≥3 subsystems:** Euclidean rhythm generator (Bjorklund) · phasing clock
  (tempo-offset scheduler) · multi-voice FM/pluck percussion synth · three.js
  loom visual. (Four.)
- **#3 — named references:** Steve Reich (phasing) + Godfried Toussaint
  (Euclidean rhythms).
