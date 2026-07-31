# 4440 · Vow

**What if a sound were _scarce_ — a finite reserve of strikes you can never get back — so that every note you spend actually costs you something?**

A conceptual-critical instrument about scarcity and attention. Twelve "vows" hang
in a dark, slow constellation. Each rings with real physically-modeled
struck-resonator synthesis. But the whole instrument holds a **finite reserve of
108 strikes — ever** — persisted across every visit. Spend them and the
constellation goes cold and silent. The only way back is penance.

---

## The scarcity mechanic

- A single number — strikes remaining — is stored in `localStorage` under
  `resonance-4440-vow`. It starts at **108** (a mala's worth) for a fresh
  visitor and **dwindles across sessions**: close the tab, come back tomorrow,
  the reserve is exactly where you left it.
- Every tap of a vow **permanently spends one**. The count (large mono numeral,
  top-right) and an emptying arc are always visible. The struck node's light
  **contracts and dims a little and never fully returns**; as the reserve falls
  the whole field cools.
- On the **last strike**, a farewell gesture: the vow rings ~3× longer (a
  stretched modal decay), then the entire constellation dims to near-black.
- At **zero** the instrument is silent forever — taps do nothing.

## The costly-renewal ritual

The only way back is a deliberate penance: **press-and-hold "Renew the vow" for
a full 8 unbroken seconds.** A ring fills as you hold. Let go even a moment early
and it resets to zero progress. Complete it and the reserve is restored to 108
and the field warms back to life. The friction is the point — renewal should
_cost_ attention, not be a free button.

## The sound — modal / banded struck synthesis

No samples, no sine beeps. Each vow is a real struck body built by **modal
synthesis** (the additive-mode view of the banded-waveguide family): a bank of
inharmonic vibrational modes, each an oscillator whose amplitude decays
exponentially. Four hand-voiced archetypes cycle across the 12 nodes so the
constellation is a genuine scale of distinct timbres:

- **bell** — Rossing church-bell partials (hum · prime · tierce · quint · nominal)
- **glass** — tall, bright, high-Q, closely stretched
- **bar** — tuned bronze/vibraphone, sparse 1 · 3.98 · 10.68
- **bowl** — perturbed singing bowl, very long ring

Each mode's decay time-constant is **τ = Q / (π·f)**, so bright high modes damp
fastest — the frequency-dependent damping of struck metal and glass falls out of
the physics for free. A seeded per-strike jitter (mulberry32, never
`Math.random`) shifts the mode balance and detune so no two strikes are
identical. The voice bank is summed through a `DynamicsCompressor` limiter.

## The self-demo

On load, **only if the reserve is fresh and full**, the piece auto-rings 2–3
nodes (chosen by `mulberry32(0x4440)`) as a clearly-labelled **preview that
spends nothing** — so a reviewer sees and hears the idea within a couple of
seconds. The visual ripple always plays; the audio joins once the AudioContext
is allowed to resume. The first real tap begins real play and starts costing.

## Named references

- **Tehching Hsieh** — the year-long durational/commitment performances (the
  _One Year Performances_): art whose medium is genuine, irreversible cost and
  the passage of real time. The finite reserve + 8-second penance are in this
  lineage of art-with-a-cost.
- The conceptual frame of _a recording you cannot hear without doing something
  costly_ — sound gated behind expenditure rather than freely sprayed.
- **Julius O. Smith III**, _Physical Audio Signal Processing_ — modal and
  banded-waveguide synthesis, the basis of the struck-resonator voice.

## Tags

- **INPUT** — deliberate touch/pointer strikes (raycast onto the 3D nodes). No
  mic, no camera.
- **OUTPUT** — three.js (icosahedra + additive halos + UnrealBloom). Not
  Canvas2D, not a fragment-shader field.
- **TECHNIQUE** — modal struck-resonator physical modeling **+ persistent
  cross-session `localStorage` state as a scarcity mechanic**. No FFT / spectral
  extraction.
- **VIBE** — conceptual-critical / scarcity-stakes.

## Fallback behaviour

- **No WebGL** → a `text-destructive` notice plus a 12-button grid so you can
  still strike every vow and hear it. Audio survives without the 3D scene.
- **localStorage blocked** (private mode, etc.) → the reserve falls back to an
  in-memory count for the session and a note says so; the mechanic still works,
  just without cross-session persistence.
- No `Math.random`, no `Date.now`/`new Date()` anywhere — all randomness is
  seeded `mulberry32`, all timing is `performance.now()` / rAF deltas.

Cleans up its AudioContext, rAF loop, and all three.js geometries / materials /
textures / renderer on unmount.
