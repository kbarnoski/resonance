# Rerise

**Status**: demoable — cycle-2 of the lab's MEMORY lane and its first *bidirectional* memory piece: retrieval (re-auditioning a past stratum) is an active force that strengthens it and drifts its remembered offset toward the present, while strata you never return to fade. Builds and passes `qa-proto`. Camera/audio paths unverifiable in the build sandbox (no webcam, no audio device); logic is wired for live pose, a pointer fallback, and an autonomous demo.

## The question

**What if memory were bidirectional?** Instead of only depositing new states as you
conduct, you can **settle and descend** back down through everything you've already
laid down — and the very act of **re-auditioning** a past moment *reconsolidates* it
(strengthens and subtly drifts it), while moments you never return to slowly **fade**.

This is **cycle-2 of the lab's MEMORY lane**. Cycle-1 (sediment) was write-only
accretion: memory was written only on new input. Rerise makes **retrieval an active
force that mutates what is remembered**. It is re-implemented self-contained; it does
not read or depend on the cycle-1 folder.

## The interaction (full body; camera is the control layer)

Audio is always Karel's **real** piano recording (Welcome Home / Snowflake). The
camera never generates sound — it only steers one continuous **present ↔ past** axis
driven by body height and openness (smoothed; feature lerp ≈ 0.12 s, audio
`setTargetAtTime` ≈ 0.14 s).

- **Present / deposit — reach up, open the body.** While the upper body is raised and
  open, the recording plays live and its live playhead is **deposited as a new stratum
  at the top** of a growing vertical column — every ~3.5 s and on each upward gesture
  peak. Opening wider lays down a brighter, wider stratum.
- **Past / descend — settle, lower / close the body.** Lowering the body travels the
  **camera back down** through the accreted strata. At the depth you reach, a lookahead
  grain scheduler **re-auditions** that stratum: Hann-windowed grains scheduled from the
  **original recording buffer** at the time-offset remembered in that stratum, so you
  literally re-hear the moment you deposited it. The live take is crossfaded under /
  instead of the grains by how deep you are.
- **Reconsolidation — the deepening.** **Dwelling** on a stratum (re-auditioning it)
  raises its `strength` and drifts its remembered `offset` slightly toward the present
  (a memory recalled comes back changed). Strata never revisited slowly **decay**
  (`strength` falls). Strength → warmth (verdigris → bronze → gold = often-returned-to);
  decay → cool slate/ash (faded). By minute 5 the column is a **biased memoir**: dense
  and warm where you kept returning, faint where you never looked back — genuinely
  different than it was at minute 1, and shaped by *what you chose to remember*.

### Control chain (landmark → feature → parameter → audible + visible)

- **Deposit:** shoulders + nose rise in frame (+ wrists raised/spread when visible) →
  `axis` high → a new `Stratum{offset = live playhead}` pushed on top → the column
  grows upward (visible) and the next descent can re-hear that moment (audible).
- **Re-audition:** `axis` low → camera descends to `focusIdx` → grain scheduler plays
  grains from `strata[focusIdx].offset` while the live gain recedes → you hear the past
  moment (audible) and its slab highlights (visible).
- **Reconsolidate:** dwell at depth → `focusIdx.strength +=`, `offset` drifts toward now
  → slab warms toward gold (visible) and the remembered moment starts later next time
  (audible); unvisited slabs lose strength and cool to slate (visible).

## References

- **"Retrieval-Driven Memory Reconsolidation for Long-Term LLM Agents"**
  (arXiv:2609.16053, 2026-09-13) — its thesis is that agent memory should **evolve on
  retrieval, not only on new input**. Rerise makes that literal: re-auditioning a
  stratum is what strengthens and drifts it.
- **Memory reconsolidation (neuroscience)** — recalling a memory *destabilises* it, so
  it must be re-stored, and it comes back subtly **changed**. Here that destabilisation
  is the offset-drift-toward-present, and the re-storage is the strength increase.

## Robustness / graceful degradation

- **No camera / permission denied / model-load failure →** a **pointer** fallback
  (mouse Y = body height/descend, drag = openness) **plus** a labelled **demo ·
  autonomous** conductor that breathes up to deposit and periodically descends to
  re-audition + reconsolidate — both exercise the identical deposit → reconsolidate →
  audio chain. The drive is always labelled (`live` / `pointer` / `demo`) and never
  looks like live tracking.
- **No WebGL →** a cheap 2D canvas fallback draws the column; audio still plays.
- Tracking gated **only** on shoulders (11, 12) + nose (0) visibility > 0.5 — never on
  hips/ankles/knees (a seated laptop webcam can't see them); the frame's lower edge is
  the synthetic floor the body's height is read against.
- Every audio node (live source + re-audition grains) terminates in
  `createSafeMaster(ctx).input`; nothing touches `ctx.destination`. Visuals are driven
  from the master analyser's RMS.
- Cleans up on unmount: stops camera tracks, closes the AudioContext, cancels the RAF,
  disposes the three.js resources.

## Status

Demoable. Alive on load (autonomous demo accretes the column + gentle auto-orbit, live
band glowing). Built and self-validated against the lab's hard constraints;
`tsc --noEmit` clean for this file.
