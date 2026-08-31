# 16608-longvigil — The Sediment Wall

A hands-off, all-night venue installation for a projector: it plays Karel's catalog forever and slowly accretes a persistent geological record of everything it has played — the wall at hour 3 is the *sum* of the night, not a loop.

**Status:** Demoable. Audio engine, accreting stratigraphy, live audio-reactive surface, and reboot-surviving persistence are all implemented and lint-clean. Untested with real speakers/GPU in this environment — timing (dwell/crossfade) and exact palette feel are unverified live.

## The one question it answers

What does Resonance look like as a calm, hands-off wall that *remembers the night* — an installation that runs unattended until morning and shows its whole history at a glance, surviving a kiosk reboot?

## How it works

Boot shows a single centered **"Begin the vigil"** button — a real gesture is required to unlock the Web Audio `AudioContext`. If a night is already saved, the boot screen notes how many strata are remembered. After the gesture the piece runs hands-off:

The wall is a full-bleed Canvas2D cross-section. Deep void at the top; sediment builds up from the floor. Each finished track deposits a **persistent horizontal stratum** at the base, pushing older layers upward and compacting the whole night so nothing is ever lost from view — that compaction *is* the "sum of the night." The currently-playing track paints the **live active surface** at the very bottom, its luminance drifting slowly with the audio (never a strobe).

A stratum's look is keyed to that track's **harmony** (`loadTrackAnalysis`):
- **Hue** — the chord roots (`chordRoot` → `pitchClassHue`) averaged around the circle of fifths, so harmonically-near tracks sit near each other in color. With the 12 pitch classes across a full catalog the wall is naturally polychrome — a mineral / oxide / ore register, not grey-plus-accent and not a duotone.
- **Saturation / coolness** — the `chordIsMinor` ratio: more minor reads cooler and more muted.
- **Thickness + fine banding** — note density: busier pieces lay down thicker, more finely-banded sediment. Banding is deterministic (seeded), so it is stable across every redraw and reboot.

## Subsystems

- **Audio engine** — auto-advances through `REAL_TRACKS` in a shuffled order. Each track loads via `loadRealTrackBuffer` and plays through its own `GainNode`; tracks are held for an adjustable **dwell** (~100s default, or the track's own length if shorter) and crossed with a **~6s equal-power crossfade** on the two per-track gains. The next track's buffer is **preloaded** during the dwell; a track that fails to load is skipped. Every node terminates in `createSafeMaster(ctx).input` — never `ctx.destination`. **No synthesis of any kind** — Karel's recordings are the only sound.
- **Memory / persistence** — the accreted strata (hue, saturation, thickness, name, timestamp per track) are written to `localStorage` on every deposit, wrapped in try/catch. On boot a saved night is restored, so a kiosk reboot resumes the record rather than starting over. "Clear the night" resets it.
- **Live visual** — a smoothed low/mid/high band-split of `safeMaster.analyser` drives the luminance of the active bottom band and a drifting surface glow. Heavy smoothing guarantees slow drift only — no flicker, and no noise/grain overlay pass anywhere.
- **Operator strip** — auto-hides after ~4s, reappears on mouse-move or a key. Fullscreen toggle, prev/next (also ←/→), a dwell slider, "clear the night", and "Read the design notes" (opens a modal). The current track title is drawn large and quiet inside the light.
- **Graceful degradation & teardown** — if the whole catalog is unreachable, the wall still renders the remembered night with an on-brand notice. On unmount everything is torn down: sources stopped and disconnected, master detached, context closed, animation frame cancelled, listeners removed, fullscreen exited.

## Reference

After **Brian Eno's _77 Million Paintings_ and _Music for Airports_** — generative installation works designed to evolve over very long timescales and never quite repeat. The sediment wall borrows that ambition of a piece that plays unattended for hours and is different every time you look, and adds a memory: it keeps the record of the night it has lived through.
