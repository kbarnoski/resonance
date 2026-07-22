# 2326 · We Breathe

> **The one question.** What if an altered state needed OTHER PEOPLE — a room
> where every open browser tab is a living, breathing presence, and the
> collective breath of everyone here entrains into one shared rhythm you can
> feel, with **nobody in control of it**?

This is the dream lab's first genuinely **multi-context** piece. Every prior
route is one person alone in front of the glass. Here the glass is shared: open
this page in a second tab or window and a real second breather joins the room.

State: **collective effervescence / inter-brain respiratory synchrony** — the
shared co-regulation you feel breathing together in a choir, a meditation
circle, a crowd. Pole: **cosmic-ambient co-regulation** — a shared calm that can
also tip into turbulence, never an over-bright ecstatic "union" plenum.

---

## How the cross-context transport works

- On mount, each tab generates a random `selfId` and a **seeded avatar** from
  that id — a warm hue and a personal resting breath rate (0.16–0.28 Hz).
- Every **120 ms** the tab broadcasts a tiny heartbeat over
  `BroadcastChannel("resonance-we-breathe")`:
  `{ id, phase (0..2π), rate, energy (0..1), hue }`. **No server, no fetch, no
  socket, no API route** — BroadcastChannel is a browser-native, same-origin
  message bus.
- A roster of **remote** presences is keyed by id. A presence unheard for
  **1.5 s** is evicted. Between heartbeats a remote's phase is *extrapolated*
  from its last report (`phase + 2π·rate·Δt`) so coupling and display stay
  smooth.
- **Result:** opening a second tab/window genuinely adds a second coupled
  oscillator. It usually arrives *out of phase*, so coherence drops and the room
  visibly/audibly fractures before it re-entrains. That is the real demo.

### Seeded synthetic chorus (for solo review)

When there are no real peers, the piece spawns **5 deterministic synthetic
presences** from a `mulberry32` stream seeded `0x2326` (see `rng.ts`). They
breathe at plausible, slightly different rates with a slow seeded rate-drift, so
a single reviewer at 06:30 — no mic, no interaction, no second tab — always sees
the *same* populated, breathing, coupling room. As real peers join, synthetics
gently retire (energy faded to zero) down to 1–2 ambient; if you end up alone
again they repopulate. If `BroadcastChannel` is absent, the piece runs in pure
synthetic mode and says so in the HUD.

---

## The coupling (no master knob)

Every presence — you, the synthetics, and each remote tab — is a **Kuramoto
phase-oscillator**:

```
dθ_i/dt = 2π·rate_i + (K/N)·Σ_j sin(θ_j − θ_i)
```

`K` is **modest and FIXED** (0.9 rad/s in `transport.ts`); it is never exposed as
a UI dial. Each tab integrates only the oscillators it *owns* (itself + its
synthetics); remote oscillators are owned and integrated by their own tabs and
arrive over the channel. Coupling is therefore genuinely **distributed** — the
entrainment is a real negotiation across contexts, not one tab puppeteering the
rest.

The collective **order parameter**

```
R = | (1/N) · Σ_j e^{iθ_j} |    ∈ [0, 1]
```

is computed over **all** present phases and is a **pure emergent readout**. It
rises toward 1 as breaths entrain, and falls toward 0 when a tab joins out of
phase or rates clash into turbulence.

**Fracture is built to be as expressive as sync:**

| | low R (many / turbulent) | high R (one / entrained) |
|---|---|---|
| field | cool-shifted, grainy, domain-warped, choppy | warm, smooth, blooms merge into one slow swell |
| pad | partials detune and **beat** audibly | partials pull toward unison, filter opens, blooms fuller |
| space | drier | reverb wetter — a shared room |

There is **no single 0→1 slider** anywhere. You cannot "turn up the intensity";
you can only breathe, and let coupling do what coupling does.

Your own presence is driven by breath: with mic granted, a smoothed loudness
envelope drives your `energy` (inhale swells, exhale falls); without mic,
**hold anywhere = inhale**. Your resting rate stands in for breath rate (an
honest simplification — see limitations).

---

## Output & safety

- **Raw WebGL2** fullscreen fragment field (`field.ts`) — no Canvas2D, no
  three.js. Each presence is a warm bloom; `R` reshapes the whole field.
- Palette is **warm dawn** — cream / soft coral / pale rose-amber on warm dark
  charcoal. No gold, no violet. All colour lives inside the shader; the React
  chrome uses only semantic tokens.
- **Web Audio** collective breath drone (`audio.ts`): detuned partials → lowpass
  → void reverb → compressor → master (≤ 0.2), 1 s fade-in, silent until Start,
  full teardown on unmount.
- **No strobe.** All motion is slow luminance drift at breath rate (≤ 0.3 Hz).
  Grain is spatial and low-amplitude, not a full-field flicker.
  `prefers-reduced-motion` is honored (drift and swell are damped).

---

## References

- **Émile Durkheim** — *collective effervescence*: shared ritual generates a
  heightened collective state. Recent 2025–2026 social-psychology work shows it
  arises even in **digital** spaces without physical co-presence — which is
  exactly what this multi-tab room stages.
- **2026, Frontiers in Psychology** — fNIRS hyperscanning of **inter-brain
  synchrony** during shared music: IBS rises with cooperation and emotional
  coordination. The breath here is the coordinating channel.
- **Kuramoto (1975)** — coupled-oscillator synchronization and the **order
  parameter R** as a population-level readout of collective phase-locking.

---

## Honest limitations

- **BroadcastChannel is same-origin *and* same-browser.** This is
  multi-tab / multi-window on one machine, **not** internet-multi-device. It is
  real cross-*context* presence, not networked telepresence. A server-backed
  transport (WebSocket / WebRTC) would extend it across the internet; that is
  deliberately out of scope (no server).
- Breath **rate** is not truly estimated from the mic — loudness drives `energy`
  and the resting rate stands in for rate. A zero-crossing / autocorrelation
  breath-rate estimator would be more faithful.
- **Unverified headless:** ESLint and project-wide `tsc` could not be executed
  in this build environment (no installed `node_modules`). The four helper
  `.ts` modules and `page.tsx` were type-checked clean with a standalone
  TypeScript pass (the only diagnostic was a lib-version quirk *inside the shared
  `use-mic-analyser.ts`*, unrelated to this folder). WebGL2 rendering, mic
  capture, and live cross-tab coupling have not been exercised in a real browser
  here and should be smoke-tested on device.

## Files

- `page.tsx` — client component: WebGL2 field + presence room + audio wiring, chrome.
- `field.ts` — raw WebGL2 renderer + warm-dawn fragment shader.
- `transport.ts` — `Room`: BroadcastChannel presence, Kuramoto coupling, R readout, seeded chorus.
- `audio.ts` — `CollectiveBreath`: coherence-tracking detune/beat pad drone.
- `rng.ts` — mulberry32 (`0x2326`) + string→position hashing for determinism.
- `README.md` — this file.
