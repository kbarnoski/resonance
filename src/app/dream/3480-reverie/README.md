# 3480 · Reverie

> *What if a Resonance journey engine were a **cinematic three-act narrative
> arc** — and its most crafted moments were the **transitions** between acts:
> a director that synthesizes a seamless musical **and** visual bridge morphing
> one act's world into the next?*

Reverie is an **alternate** journey engine. Resonance's default is a
psychedelic six-phase arc; the sibling `3456-surge` is an EDM build-and-drop.
This one is the canonical **three-act score/trailer form** — *Setup →
Confrontation → Resolution* — and the deliberate centerpiece is the **bridge
between acts**, never a hard cut.

The human relationship is **witness & pace**: not a fail-state, not calm
ambient — a directed dramatic shape you ride and can linger inside.

---

## The three-act affective arc

A state machine (`arc.ts`) runs a fixed cinematic order that loops (~2:52 base,
longer as you dwell):

| segment | ~dur | feel |
|---|---|---|
| **Act I · Setup** | 40 s | calm, low arousal, consonant, establishing |
| bridge · **rise** | 10 s | a riser lifts the calm world into the storm |
| **Act II · Confrontation** | 48 s | rising tension, unstable harmony, dense |
| bridge · **collapse** | 10 s | the climax — the storm implodes, dark folds into light |
| **Act III · Resolution** | 54 s | a bloom-climax, then denouement into stillness |
| bridge · **settle** | 10 s | relative-minor fall back to the start |

### The affective director (`director.ts`)

Each act is an anchor in an affective space — `valence` (dark↔bright),
`arousal` (calm↔intense), `density`, `tempo`, `brightness` — plus the four
particle **force-field weights** (drift / vortex / radial / turbulence). Every
frame the director eases the *current* state toward the active target. Act III
is not constant: it interpolates its own **climax → denouement** envelope.

Rule-based, deterministic, no LLM, no network. Reference: **NarraScore**
(arXiv:2602.09070, Feb 2026) — hierarchical affective valence/arousal control
of a musical arc.

---

## The signature technique — generative transitions

Across a bridge the director does **not** cut. It glides the target between the
two acts' anchors and selects a **style** shaped to the affect delta:

- **rise** (→ Act II): arousal, density and turbulence lift *early* and
  overshoot — a riser drags the calm world up before the harmony arrives.
- **collapse** (→ Act III): the dense storm implodes (`radialDir` dives
  negative, brightness dips to a dissolve) then releases outward as it hands
  off to the bloom — a dark-fold-into-light gesture.
- **settle** (→ Act I): everything eases down; relative-minor gravity pulls the
  radial bloom back into the slow horizon drift.

This is **JenBridge** (arXiv:2606.01703, Jun 2026) — an agentic director that
selects a transition style per narrative shift and synthesizes a *generative
transition* between two distinct segments — made **deterministic +
browser-native** (rule-based, no AI).

### Musical bridge — common-tone / pivot-chord modulation (`audio.ts`)

Each act is a 5-voice pad chord. Every bridge **holds a shared tone fixed**
while the other voices glide by minimal motion — audible common-tone
modulation:

```
Act I  A minor  [A2 E3 A3 C4 E4]
  ↓ rise      pivot C4 held ;  A→F, E→F, A→Ab, E→F
Act II F minor  [F2 F3 Ab3 C4 F4]
  ↓ collapse  pivot C4 held ;  F→E, F→E, Ab→G, F→E   (dark → bright)
Act III C major [C2 E3 G3 C4 E4]
  ↓ settle    pivots C4+E held ; C→A, G→A            (relative minor)
```

During a bridge the pad frequencies **log-interpolate index-by-index** from the
departing chord to the arriving chord, so the pivot literally stays put while
its neighbors slide. Layers: detuned pad bank (saw+triangle voices), sub bass,
a legato/portamento lead sequenced by a lookahead clock walking the act's
diatonic scale (chromatic passing tones allowed — **no pentatonic safety net**),
and a bandpassed noise bed that becomes the riser/fall texture across bridges.
Master gain → gentle `DynamicsCompressor` limiter; seeded convolver reverb.

Classic form reference: the three-act **setup / confrontation / resolution**
trailer-music structure.

---

## Visual substrate — WebGPU compute particle nebula (`compute.ts`)

~42k particles in a WGSL compute pipeline. The force field is a **weighted sum**
of four primitive operators; each act is a point in that weight-space:

- **Act I** — high `driftW`: a slow drifting horizon field.
- **Act II** — high `vortexW` + `turbW`: a rotational curl-noise storm.
- **Act III** — high `radialW` with `radialDir`: a collapsing-then-blooming
  radial burst.

Because the director interpolates the weights every frame, the **transition is
a true GPU morph** — the cloud continuously re-forms from horizon → storm →
bloom, no cut. Particles render additively into an `rgba16float` trail texture
that fades each frame (dreamy smear), then a tonemap pass. Palette is the violet
brand ramp; hue/brightness heat and cool with `valence` / `brightness`.

**Fallback:** no `navigator.gpu` → a **Canvas2D** field (`fallback.ts`) CPU-
integrates ~3.6k particles through the *same* force model, driven by the same
director / arc / audio. A small on-brand note flags the 2D mode. The piece is
never dead.

---

## Human relationship — witness & pace

- The arc **auto-advances** and demos itself hands-off from the first Begin.
- **Hold Space** (or the on-screen pad) to **linger**: `dt` is dilated toward
  zero, so the clock nearly freezes — the current act deepens (pad voices
  bloom, brightness and density rise). You can freeze *inside* a bridge and
  watch the morph hang.
- Release resumes the advance. `↑ ↓` nudge overall intensity.
- No score, no win/lose, nothing can be failed. The first interaction flips the
  driver badge from `auto` to `you` but the story keeps advancing on its own.

---

## Self-demo

On Begin, the arc plays the **entire three acts including every bridge**
deterministically (seeded `mulberry32(0x3480)`; time accumulated from rAF
timestamps — no wall clock, no `Math.random`). A hands-off reviewer sees the
three distinct worlds and hears the score move through all acts + modulations
without touching anything.

---

## Verified vs. needs Karel's device/ears

**Verified here**
- `npx tsc --noEmit` — clean (whole project).
- `npx eslint src/app/dream/3480-reverie/` — clean (no hook/unused-var issues).
- No banned nondeterministic calls (`Math.random` / `Date.now` / `new Date()`).
- Self-contained; only reads shared patterns, writes nothing outside this folder.
- WGSL structure mirrors the working `75-houdini-particle-flock` compute
  pipeline; Params uniform is a 64-byte scalar struct.

**Needs a real device / ears (no GPU or audio output in this environment)**
- That the WebGPU pipeline actually compiles + renders on Karel's machine and
  the morph reads as a genuine continuous re-form (not a crossfade).
- That the pivot-chord modulations sound smooth and the limiter tames peaks at
  `master = 0.17`.
- Canvas2D fallback framerate with 3.6k additive arcs on a laptop.
- `prefers-reduced-motion` damping feels right (no >3 Hz flicker — luminance
  changes are only smooth drifts by construction).

---

## Next-cycle deepening

- **Bridge-aware lead motif**: give each transition a short signature melodic
  gesture (an ascending line on *rise*, a resolving suspension on *collapse*)
  instead of the generic random-walk sequencer.
- **Per-act particle rendering modes**: streak-elongated points in the vortex,
  point-sprite bloom flare on the Act III burst.
- **GPU trail resize** on window resize (currently fixed at start; fallback
  already re-sizes).
- **Second modulation path**: let a long dwell inside a bridge *deepen the
  modulation itself* (add tension extensions) rather than only blooming voices.
- **Reduced-motion audio pass**: optionally soften the riser sweep for users
  who also want a calmer sonic experience.
