# 1288 · Gasket Cathedral

**Walk *inside* the Apollonian gasket — a cathedral of nested nacre bells where
each sphere's size is its pitch, spatialised around your head.**

The top-rung 3D deepening of `1285-apollonian-gasket`. Where 1285 is a flat
tap-to-densify gasket you look *at*, this one is a first-person room you move
*through*: a 3D Soddy / Apollonian sphere packing rendered as real instanced
spheres, struck and heard in true HRTF-spatialised sound.

---

## The one question it answers

> What if you could *walk inside* the Apollonian gasket — a cathedral of nested
> bells where each sphere's size is its pitch, spatialised around your head?

---

## The math — a 3D Soddy / Apollonian sphere packing

A sphere is a signed **curvature** (bend) `b = ±1/r` and a centre `c ∈ ℝ³`
(negative bend for the enclosing shell). **Five** mutually-tangent spheres form
a *Descartes configuration* and satisfy the **Soddy–Gosset theorem** — the 3D
generalisation of the Descartes Circle Theorem:

```
(b₁ + b₂ + b₃ + b₄ + b₅)²  =  3 · (b₁² + b₂² + b₃² + b₄² + b₅²)
```

(The general form in `d` dimensions is `(Σbᵢ)² = d·Σbᵢ²` over `d+2` spheres; here
`d = 3`.) Our seed is the canonical Soddy config: **four unit spheres at the
vertices of a regular tetrahedron**, mutually tangent, inside their common
bounding sphere of radius `√6/2 + 1`. It satisfies Soddy–Gosset to machine
precision (`gossetResidual ≈ 1e-15`).

**Recursion by reflection.** Given four of the five spheres, the two spheres
tangent to all four have bends that sum to `Σ(the four)` — so the *other* tangent
sphere is the **reflection** of the omitted one (Lagarias–Mallows–Wilks, *Beyond
the Descartes Circle Theorem*, 2002). The same reflection acts on the
curvature-weighted centre `m = b·c`:

```
b'  =  (b₁+b₂+b₃+b₄) − b_omitted
m'  =  (m₁+m₂+m₃+m₄) − m_omitted        (mᵢ = bᵢ·cᵢ, a vector)
c'  =  m' / b'
```

Swapping each sphere of a config for its conjugate fills every
curvilinear-tetrahedron gap with an ever-smaller inscribed bell, and each new
sphere spawns a new config — a self-similar 3D gasket, breadth-first, capped by a
minimum radius / maximum count (≈ 480 spheres, 5 levels deep by default).

**Self-check** (`runSelfCheck`, logged to the console + shown in the HUD): every
generated sphere is confirmed mutually tangent to its four parents; over the
whole packing the worst tangency residual is `~1e-15`, the Soddy–Gosset residual
on the seed is `~1e-15`, and recursion terminates under the caps.

## Curvature → pitch (5-limit just intonation)

A bell's bend `b = 1/r` maps to frequency: **big nave-spanning shells (small
bend) sound low; tiny deep bells (large bend) sound high**, quantised to a
5-limit **just-intonation pentatonic** `[1, 9/8, 5/4, 3/2, 5/3]` across octaves
so every strike harmonises — the same idea as 1285's `bendToFreq`, lifted into
3D. A low **root + fifth drone bed** (root ≈ C2) keeps the cathedral resting on a
chord, swelling gently with strike density.

## Spatialisation (the whole point)

Each struck bell is a Web Audio **`PannerNode`** with the **HRTF** panning model,
positioned at the sphere's 3D world coordinates. The **`AudioListener`** is
driven every frame by the first-person camera (position + forward/up), so a bell
above-left of you is heard above-left. Voices run through a cistern-like
convolution reverb (`_shared/psych/convolutionVoid`) and a limiter into a master
gain ≤ 0.3.

## Controls

- **Enter the cathedral** — starts audio (user gesture) and drops you inside.
- **Pointer-lock + WASD** — mouse to look, `WASD` to move, `Q/E` (or `Space`) up
  /down, `Shift` to sprint. Click a bell under the reticle to strike it.
- **No pointer-lock?** Drag to look; tap a bell to strike. (Graceful fallback.)
- **Phone** — *use gyro* tilts your head with the device and glides you slowly
  forward along your gaze so you drift through the nave.
- **Proximity** — passing *through* a bell rings it automatically.
- **Auto-tour** — idle ~2s and the camera drifts a gentle Lissajous path through
  the nave, ringing bells by proximity, so a hands-free reviewer hears the payoff
  immediately.

## Palette

Nacre / mother-of-pearl on deep slate — deliberately **not** saturated
jewel-glow-on-black. Pale iridescent shells (thin-film via
`MeshPhysicalMaterial.iridescence` + clearcoat), soft near-white speculars
sliding across them from a pale key / cool-pearl fill / warm-champagne rim, low
saturation throughout. The enclosing Soddy sphere is a dark inward-facing shell —
the cathedral walls. Struck bells pulse in scale and brighten toward white.

## Named references

- Frederick Soddy, *The Kiss Precise*, **Nature 137/139** (1936) — the poem that
  gives the Descartes Circle Theorem and its extension to spheres.
- The **Soddy–Gosset theorem** — `(Σbᵢ)² = d·Σbᵢ²` for `d+2` mutually tangent
  spheres.
- The 3D generalisation of the **Descartes Circle Theorem**: Lagarias, Mallows &
  Wilks, *Beyond the Descartes Circle Theorem*, Amer. Math. Monthly (2002).
- Mumford, Series & Wright, *Indra's Pearls* (2002) — Kleinian limit sets and the
  aesthetics of infinite tangent-circle/sphere packings.

## Files

- `packing.ts` — the 3D Soddy/Apollonian generator (reflection recursion) +
  numeric self-check. Pure math, zero DOM.
- `audio.ts` — spatial HRTF strike voices, JI `bendToFreq`, drone bed, listener
  driver. Output only, no mic.
- `scene.ts` — three.js first-person navigable room: instanced nacre bells,
  camera controller (pointer-lock/WASD, drag, gyro), proximity + gaze strikes,
  auto-tour. Full teardown on dispose.
- `page.tsx` — the `"use client"` React page: UI, Enter/audio gate, design notes,
  render loop wiring scene pose → audio listener.

## Next-cycle deepening ideas

- **Sub-strike resonance:** when you strike a large bell, briefly excite its
  tangent children (a chord that ripples down the gasket by tangency graph).
- **Curved-space navigation:** move by *inversion* through spheres (Möbius/
  Kleinian transport) so the packing tiles infinitely as you pass into a bell —
  the true *Indra's Pearls* move.
- **On-screen thumb-pad** for touch movement independent of gaze, plus a minimap
  of the tangency graph.
- **Physicalised reverb:** size the convolution tail by the local gap volume so
  deeper, tighter regions sound smaller and drier.
- **Bell timbres from mode shapes:** give each sphere a struck-shell spectrum
  (à la 1280-earth-bell's normal modes) instead of two detuned partials.

*Not verified on a real GPU / real ears — the orchestrator runs the authoritative
build. Tangency + Soddy–Gosset verify numerically headless (`~1e-15`).*
