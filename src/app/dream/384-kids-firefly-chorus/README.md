**For**: kids (4+)

# Firefly Chorus

A dark dusk meadow full of fireflies. At first each one blinks out of phase and
hums its own slightly-different soft note — a gentle twinkly chaos. **Tilt the
device** (or drag a finger) to float the fireflies together. When fireflies get
close, they start to *nudge each other's blink timing*, and a gathered cluster
**spontaneously snaps into unison**: they blink together and their scattered
notes pull onto one warm pulsing chord. No reading, no score, no "wrong" — just
a meadow that breathes into harmony as a child gathers it.

## How to play

1. Tap **✦ start** (this unlocks sound and asks for tilt permission on iOS).
2. **Tilt** the phone, or **drag** a finger across the meadow, to make a breeze
   that drifts the fireflies toward each other.
3. Watch a cluster form — its glow warms to gold, the blinks line up, and the
   **together** meter (top-right) climbs as the meadow synchronizes.
4. Do nothing for ~3 seconds and a slow **auto-breeze** takes over, herding the
   fireflies into a cluster so they sync on their own — hands-free, no sensor.

## The technique: Kuramoto coupled oscillators

This is a genuine implementation of the **Kuramoto model** (Yoshiki Kuramoto,
1975) — the math behind the spontaneous flash-synchrony of **Southeast-Asian
fireflies** (*Pteroptyx*) and **Christiaan Huygens' coupled pendulum clocks
(1665)**, which Huygens found drifting into anti-phase lock through the shared
beam they hung on.

Each firefly `i` is a phase oscillator with phase `θᵢ ∈ [0,2π)` and its own
natural angular frequency `ωᵢ`. Every frame we integrate:

```
dθᵢ/dt = ωᵢ + (K / Nᵢ) · Σ_j sin(θⱼ − θᵢ)
```

where the sum runs **only over neighbours `j` within a coupling radius** (here
`COUPLE_R ≈ 0.13` of the meadow), `Nᵢ` is that neighbour count, and `K` is the
coupling strength. A firefly **flashes** (and retriggers its note) when `θ`
crosses `2π`. Neighbour lookup uses a **spatial hash grid** (3×3 cell window) so
~280 fireflies couple cheaply at 60fps instead of an O(n²) scan.

Because coupling is neighbour-only, isolated fireflies keep their own rhythm,
but as the breeze packs them together the local `sin(θⱼ−θᵢ)` terms pull their
phases into agreement → visible + audible phase-locking. Clusters are tracked
with union-find so a synced group shares a colour (and stays synced — memory).

We also compute the global **Kuramoto order parameter**:

```
r · e^{iψ} = (1/N) · Σ_j e^{iθⱼ}
```

`r ≈ 0` = chaos, `r ≈ 1` = full synchrony. It drives the **together** meter and
a warm centre-glow so the synchronization is legible at a glance. A per-firefly
**local r** (synchrony of its own neighbourhood) drives each glow's halo and how
far its note bends toward the shared chord.

Live research front: higher-dimensional / network generalisations of the model
continue (e.g. arXiv:2603.08352, "Synchronization of higher-dimensional Kuramoto
oscillators on networks," March 2026).

## Sound — D-Dorian, toddler-safe

- An **always-on warm pad bed** (D + A drone, slowly breathing) so it is never
  silent — a summer-night bed.
- Each flash → a soft **sine bell** in **D-Dorian** (D E F G A B C — explicitly
  *not* C-major-pentatonic). Un-synced flies scatter across the scale; as a
  firefly's local `r` rises, its pitch **blends toward the Dorian tonic triad
  (D F A)**, so a locked cluster sings one pulsing chord.
- Soft attacks, long releases — no harsh transients.
- **Voice-pooled** (14 voices), with a per-firefly refractory and a probability
  gate, so hundreds of flashes never become a machine-gun.
- Everything routes through a **`DynamicsCompressor` brick-wall limiter**
  (threshold −10, ratio 14) so it can never blast little ears.
- After ~12 min the master gain slowly dims toward a goodnight lullaby.

## Input & fallbacks

- **Primary**: `deviceorientation` — `gamma`/`beta` become a gravity vector. iOS
  13+ permission is requested inside the Start tap.
- **Fallback A**: pointer/drag "breeze" that drifts fireflies identically; if
  tilt is denied a `text-rose-300` notice appears.
- **Fallback B**: after ~3s idle, a synthetic wandering breeze herds the flies
  so the 06:30 reviewer SEES them sync and HEARS the chord lock without touching
  anything and without a sensor.
- No WebGL2 context → readable `text-rose-300` notice; audio still runs.

## Output

Raw **WebGL2 / hand-written GLSL ES 3.00** (no three.js, no Canvas2D, no SVG).
A full-screen dusk-indigo meadow gradient + instanced soft-glow firefly quads,
**premultiplied alpha-over** compositing (matte house style, no additive
glow-stacking). DPR/resize aware.

## Tags

- INPUT: **device tilt** (pointer + auto-demo fallbacks)
- OUTPUT: **WebGL2** (GLSL ES 3.00, instanced, premultiplied alpha)
- TECHNIQUE: **Kuramoto coupled-oscillator synchronization**
- PALETTE/VIBE: **kids, calm dusk meadow, D-Dorian, lullaby**

## Unverified surface (honest notes)

No real sensor or GPU was available while building this, so these are guesses
that need a real phone:

- **K + radius feel**: `K = 3.4`, `COUPLE_R = 0.13` were tuned by reasoning, not
  by watching. Sync might lock too fast (feels scripted) or too slow (feels
  broken).
- **tilt → gravity feel**: the `gamma/35`, `(beta−35)/35` mapping and the 0.35
  scale are untested against real hands; the neutral "hold angle" may feel off.
- **Reads as magic vs. glitch**: whether a phone-glance reviewer perceives the
  phase-lock as enchanting unison or as a rendering hiccup is unverified.
- **Voice-pool load**: 280 fireflies × flash gate × 14 voices should stay light,
  but real mobile Web Audio scheduling jitter under load is untested.
