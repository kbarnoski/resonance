# 16160-roomtone

**The one question:** *What if Karel's own recording became the ROOM his other recording is played through?*

Two of Karel's real piano takes. A few raw seconds of one take are loaded straight into a `ConvolverNode` as its **impulse response** — that take *becomes* the acoustic space — and the **other** take is played *through* it. Convolution is cross-synthesis: the room take's notes, resonance and decay literally reshape the voice take. A tilt / drag / auto-demo morphs the wet/dry blend, and a hard forward tilt (or a button) swaps which take is the room.

## The two takes

- **Voice take (played through):** *Welcome Home* — the album's title track.
- **Room take (the raw IR):** *The Knife*.

Both are from Karel's verified *Welcome Home* catalog (`REAL_TRACKS`, loaded via `loadRealTrackBuffer`). The visitor can swap either take from the full 16-track verified catalog, and swap which of the two is the room. No synths, no oscillators, no generated audio — his real recordings only.

## The convolution mechanism

1. **Impulse response** = `buildImpulse()` trims ~3 s of the room take starting ~15% in (to skip any lead-in), copies the samples **raw** into a fresh `AudioBuffer`, and applies only 5 ms / 150 ms edge fades so the onset and tail don't click. That raw waveform is the IR — no synthesis. `convolver.normalize = true`.
2. **Voice path** = one looping `AudioBufferSourceNode` of the voice take fans out two ways:
   - **dry:** `source → dryGain → safeMaster.input`
   - **wet:** `source → convolver → wetGain → safeMaster.input`
3. **Blend** = an equal-power crossfade on `wetGain` / `dryGain`. The wet path additionally carries a `WET_MAKEUP` (0.55) attenuation, because convolving two loud musical takes blooms hard; the shared **safeMaster** limiter is the final ceiling. Every audible node terminates in `safeMaster` — never `ctx.destination`.
4. **Swap** reassigns the convolver's IR buffer to the other take and restarts the source with the swapped voice buffer.

## Subsystems (ambition floor: ≥3)

1. Catalog loader / two-take selection (`REAL_TRACKS` + `loadRealTrackBuffer`).
2. Impulse-response builder (`buildImpulse`, raw trim + edge fades).
3. `ConvolverNode` cross-synthesis graph with wet/dry crossfade into `safeMaster`.
4. `DeviceOrientation` tilt control (gamma → blend, beta → swap) with pointer-drag + auto-demo fallback.
5. Inline-SVG architectural cross-section renderer (`RoomCrossSection.tsx`).

## Controls / degradation

- **Primary:** "Play his catalog" starts the audio (catalog playback is the primary action).
- **Secondary:** tilt (`gamma` → wet/dry, forward `beta` → room-swap). On iOS, motion permission is requested inside the play gesture.
- **Fallback:** no sensor / permission denied → drag horizontally across the cross-section, or the range slider, or the **auto-demo** which slowly sweeps the blend when idle so the effect is always audible hands-free. An on-brand notice explains the active mode; audio-load failures surface in `text-destructive`.
- Full teardown on unmount: RAF cancelled, `deviceorientation` listener removed, audio nodes disconnected, `ctx.close()`.

## The visual

Inline SVG / DOM vector only — **no canvas / WebGL / shader**, and no grain/noise pass. An architectural cross-section on a high-key light ground with ink + one saturated accent (deep magenta `#c21a74`):

- **Ceiling / vault** = the impulse-response decay envelope of the room take — a chamber that lowers as the tail decays.
- **Voice stratum** = the voice take as a threading line through the chamber.
- **Bedrock** = the room take's waveform, the same take used raw as the IR.
- The chamber **stains** deeper magenta the wetter the blend; a **sounding-line** sweeps the voice-take playhead, its glow driven by live output RMS.

## Named references

- **Nugen Audio *Paragon*** (2026) — billed the "world's first 3D-compatible convolution reverb," re-synthesising reverb from 3D recordings of real spaces. Here the sampled "space" is not a room but another of Karel's own performances.
- **Convolution as cross-synthesis** — the classic Sound on Sound / iZotope framing that a convolution reverb is literally the cross-synthesis of the source with the impulse response.

## Honest novelty statement

I grepped the lab: **57** prototypes use `createConvolver`, and four combine a convolver with Karel's real catalog audio (`14864-betweenus`, `14832-disintegration`, `14784-nave`, `308-orbit-choir`). In **every** one of those, the convolver's `buffer` is a **synthesised** decaying-noise impulse response used as a conventional reverb kernel — none feed a real recording into the convolver as the IR.

So what is (as far as this grep shows) new here: **using one of Karel's own takes, raw, as the impulse response and playing a second take through it** — convolution as cross-synthesis between two of his recordings, rather than convolution as a synthetic reverb. What is **not** new: the `ConvolverNode`/wet-dry/safeMaster plumbing, the tilt-control and auto-demo patterns, and the SVG-strata visual idiom, all of which follow established lab conventions. I make **no** "first ever" claim beyond this repo — convolution cross-synthesis is a decades-old technique; the specific gesture of using his own recording as the room is what this piece isolates.

## Files

- `page.tsx` — UI, transport, tilt/drag/auto-demo control, take pickers, design-notes modal.
- `engine.ts` — AudioContext ownership, catalog loading, IR builder, convolver graph, crossfade, safeMaster routing, strata/RMS/playhead getters.
- `RoomCrossSection.tsx` — inline-SVG architectural cross-section.
- `README.md` — this file.
