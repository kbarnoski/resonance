# 490 — Disintegration

**The one-sentence question:** What if a piece of music physically disintegrated as you listened to it — different at minute five than at minute one, crumbling toward silence, and the act of listening is what consumes it?

A digital homage to magnetic tape that sheds itself as it plays. The loop you hear is held in a mutable sample buffer; every time the playhead comes around, a small, random, **irreversible** round of damage is baked directly into the samples. Nothing is faked with a filter sweep — the audio content is genuinely, permanently destroyed pass by pass.

## How to use

1. Tap **start** (this creates and resumes the AudioContext inside your gesture — iOS-safe). A warm, slightly melancholy modal loop begins.
2. Just listen. Watch the glowing tape ring: each arc segment's brightness and thickness shows how much audio survives there. As regions die they cool, thin, and tear into dark gaps. A pale playhead sweeps the ring; the center readout shows the pass count and the percent of the loop that remains.
3. Press and hold **hold to remember** to briefly slow the decay everywhere. It never reverses anything — it only buys time.
4. Tap anywhere on the ring to **re-excite** the faded region at that angle. It flickers back as a muffled ghost (seeded from the pristine loop), but every other region decays faster to pay for it. You can shape how it dies, never whether.
5. Stay several minutes. Around minute five the loop is clearly sparser, darker, and more skeletal than at the start; eventually it crumbles to near-silence and the room-tone floor fades out — the true end.

## Reference and borrowed technique

**William Basinski — _The Disintegration Loops_ (2002).** Basinski transferred decades-old magnetic tape loops to digital, and as the loops played the iron-oxide coating physically flaked off the plastic, so each pass returned slightly more eroded than the last — a warm pastoral phrase slowly hollowing into ghostly fragments over an hour.

What I borrowed, literally rather than metaphorically: **accumulating, irreversible per-pass destruction of the actual recorded material**, with the high-frequency band eroding first (the way oxide loss kills brightness before body). My tape is a `Float32Array`; each pass `step()` bleeds per-region survival, drops a per-region one-pole lowpass corner, and zeroes short random sample windows (dropouts) — writing all of it back into the same buffer that plays. There is no reset path. Listening consumes it.

## Subsystems

- **`audio.ts`** — offline synthesis of the original loop. A modal (A-Aeolian/Phrygian-tinged) phrase of soft, slightly inharmonic bell tones over a low A2/E3 bed, rendered deterministically into a `Float32Array` with a crossfaded loop seam and peak normalization. Also builds the always-present low room-tone drone (A1/E2 sines through a lowpass) that itself fades as the music dies.
- **`decay.ts`** — `DisintegrationTape`, the disintegration engine. Holds the mutable sample buffer plus persistent per-region state (`survival 1→0`, `cutoff bright→dark`, `torn`), advances one irreversible pass at a time, and exposes `setHold` (slow decay), `reExcite` (local ghost at a global cost), `meanSurvival`, and `isNearlyGone`.
- **`page.tsx`** — the client component. Gesture-gated AudioContext start; a look-ahead scheduler that, each pass, calls `tape.step()`, copies the now-eroded samples into a fresh `AudioBuffer`, and queues it seamlessly; a master gain that tracks mean survival so amplitude bleeds away; a `DynamicsCompressor` brick-wall limiter on the master; and a Canvas2D tape-ring visualization with a sweeping playhead and a center ember/readout. Graceful fallback if the 2D context is null (notice shown, audio keeps running).

## Ambition

This clears the lab's ambition floor on multiple counts:

- **(#1) A never-before-used technique in the lab:** persistent, irreversible progressive audio-buffer self-disintegration. No prior prototype performs Basinski-style accumulating sample destruction — damage is baked into the live buffer and compounds across passes with no way back.
- **(#3) A named cultural reference:** William Basinski, _The Disintegration Loops_ (2002), with a specific, literal borrowing (oxide-loss decay → in-buffer per-pass erosion, highs first).
- It is also a genuine **long-form, evolving** piece — minute five is audibly and visibly sparser/darker than minute one, because the state truly accumulates — and a **conceptual/critical** piece about impermanence, entropy, and the cost of attention. Deliberately the antidote to consonant, warmly-resolving loops: it never lands a cadence; it dissolves.

## Unverified surface (honest note)

This was built in a sandbox with no audio device, no speakers, and no GPU, so the following could not be heard or watched and are unverified:

- **Actual timbre and emotional read** of the synthesized loop, and whether the decay curve _feels_ right (too fast / too slow). Constants (`base bite`, dropout chance, `LOOP_SECONDS`, region count) are tuned by reasoning, not by ear — the "different at minute five" claim is by construction, but the exact pacing may want adjustment.
- **Seamlessness of the loop scheduling** — whether back-to-back queued `AudioBuffer`s join without an audible click at the seam, and whether the 250 ms scheduler horizon avoids gaps under load.
- **Limiter behavior** — that the `DynamicsCompressor` settings actually prevent any clip, especially right after a `reExcite` re-seeds pristine content.
- **Canvas performance** with 256 region arcs at the device's refresh rate, and that the trail/ghosting blend reads as intended on a real dark display.
- iOS Safari `webkitAudioContext` resume path is coded to spec but untested on-device.
