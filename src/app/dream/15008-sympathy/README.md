# 15008 · Sympathy of clocks

## The one question

What if Karel's catalog became **a room with no conductor** — where each present
listener is a voice, and the voices find each other and lock into a round through
**decentralized mutual influence** (Kuramoto / Huygens' "sympathy of clocks"),
not an imposed clock?

## How the Kuramoto sync works

Every voice carries a phase-oscillator: a phase **θ** and a natural frequency **ω**.
There is no master clock. Instead, on every animation tick each voice nudges itself
toward the whole room's mean phase:

```
dθ_i/dt = ω_i + (K/N) · Σ_j sin(θ_j − θ_i)
```

- The coupling `K` is weak and symmetric — nobody leads. Because each voice starts
  with a slightly different natural frequency, the loops first **drift and hunt**,
  then over ~15–40s **entrain** into a phase-locked round (fireflies flashing in
  unison).
- The **order parameter** `r = |mean(e^{iθ})|` measures the lock: ~0 is chaos, 1 is
  a perfect round. It is shown live in the HUD and drives the unison "breathing"
  wash in the shader.
- Coupling adjusts **when** a voice speaks (its phase), never its pitch.

### Audio (100% real catalog — zero synthesis)

Each voice is one `AudioBufferSourceNode` playing a short **phrase slice** of one of
Karel's real recordings (via `loadRealTrackBuffer`), on its own `GainNode` →
`createSafeMaster`. The slice is **retriggered on each phase-zero crossing** with
`start(when, offset, dur)`, so the audible loop period *is* the oscillator period —
as the room entrains, the loops line up. `loadTrackAnalysis` picks a musical phrase
window (first strong note onset) and, when available, bends ghost voices toward the
track's third (`chordRoot` / `chordIsMinor`) via `BufferSource.detune` so the round
stays consonant. There are **no oscillators and no synthesis** anywhere in the audio
path. Falls back to a fixed phrase window when analysis is null.

### A room, not a mixer (multi-tab)

Tabs share only **phase, natural frequency, hue, track title and position** over
`BroadcastChannel("dream-15008-sympathy")` at ~8 Hz; a peer is present if seen within
2.5s. Each tab plays only *its own* voice's audio, and the tabs' outputs sum in the
shared speakers — so opening a second tab genuinely adds a coupled voice to the room.
A solo tab seeds **2–3 ghost voices** with detuned natural frequencies so the sync is
audible/visible alone; the ghosts **yield and retire one by one** as real peer tabs
arrive (and return if peers leave). A pointer **drag** adds an impulse to the local
voice's phase, so a reviewer can perturb the lock and watch it re-form.

## Tags

- **INPUT** — multi-tab co-presence (BroadcastChannel) + catalog playback + a
  pointer-drag "nudge my phase".
- **OUTPUT** — raw WebGL2 with hand-written GLSL (no three.js, no Canvas2D): a
  single full-screen fragment shader draws each voice as a firefly node, filaments of
  the tightening round, and a mean-field unison wash.
- **TECHNIQUE** — Kuramoto coupled-oscillator decentralized phase-sync over real-audio
  loops.
- **PALETTE** — near-black cool ground + a **constrained cool ramp** only
  (green → teal → cyan → blue, hue 135–235); no warm/amber/orange, no full rainbow,
  no single-violet monoculture. Chrome uses semantic tokens (violet `--primary`);
  raw hues appear only inside the GLSL art.

## Named references

- Y. Kuramoto, *Self-entrainment of a population of coupled non-linear oscillators*
  (1975).
- C. Huygens, letters on the "sympathy of two clocks" / odd sympathy (1665).
- S. Strogatz, *Sync: The Emerging Science of Spontaneous Order* (2003).

## Honest limitations

- Built headless: **not ear-verified** (loop-tiling clicks, envelope crossfades, and
  the consonant detune are reasoned, not heard), **not multi-tab-verified** on real
  hardware (BroadcastChannel presence, ghost yielding, and cross-tab lock are
  untested live), and **not GPU-verified** (the WebGL2 shader compiled only in my
  head; falls back to an on-brand error notice if WebGL2 is unavailable).
- Kuramoto lock timing (`K = 1.45`, period spread 4.3–6.3s) is tuned by estimate — on
  real audio it may lock faster or slower than the ~15–40s target and want retuning.
- Phase-crossing retrigger is detected per animation frame (not sample-accurate), so
  timing has up to one frame of jitter; fine for a meditative round, not for tight
  percussion.
- Remote peers are drawn/heard as a single voice each; their audio lives in their own
  tab and only sums acoustically through shared speakers (same-origin, same browser).
