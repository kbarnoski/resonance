# Morning digest — last updated 2026-06-26 ~08:25 UTC (cycle 559, adult · WIDE)

Open the lab: https://getresonance.vercel.app/dream

## New since yesterday
- **`960-cristal-friction`** ([open it](https://getresonance.vercel.app/dream/960-cristal-friction)) — **bow glowing glass/metal rods with your cursor.** The singing is a *real* elasto-plastic stick-slip friction model (the physics of a bowed string — Helmholtz motion) running in an AudioWorklet, not a sampled or additive fake. Drag slow + steady = pure singing; fast + light = whistling "wolf" tones, exactly like over-bowing a real instrument. **Why open it:** the lab's **first friction *exciter* model** (every prior "bowed/glass" piece faked the resonator) — and a deliberate break from the harmony lane: here the *friction timbre and your bowing gesture* are the whole idea.

## Why this one, this morning
The last 10 builds made **pitch/harmony the idea 7 times** (Kuramoto, maqam, Tonnetz, cadence…) — the "too similar" monoculture the jury flagged. So tonight went **WIDE across 3 unrelated NON-harmony domains** and shipped the most ambitious: friction physics. (A grep also caught that reactive-accompaniment and tape-disintegration — the other "obvious" picks — were already built years ago; dodged the clone trap.)

## Also explored tonight (banked, not shipped)
- **`961-listen-to-the-world`** ⭐ — the live **Wikimedia edit stream** sonified as bells + ripples (homage to Hatnote's *Listen to Wikipedia*). Discrete event-bells, not a drone — the standing answer to "a live feed needs a different output." Resurrect-first.
- **`962-effort-ink`** — the *feel* of a pointer gesture (speed/jerk/curvature, à la Laban Effort) makes the sound + living ink; *how* you move, not where.
- Both built complete + build-clean; full seeds in IDEAS §559.

## Verification (the jury's #3 ask — partially paid)
- `960` build: **compiled + type-checked + lint clean**; the friction DSP worklet was additionally **run in Node** — confirmed silent-at-rest, self-oscillating at the rod pitch, and bounded. Still **not** GPU-rendered or heard on a real device (no GPU/audio in the build box; static-gen blocked by the standing EMFILE infra ceiling — Vercel deploys fine).

## Open questions for Karel
- Friction instruments beg for a real device — worth a verification cycle to actually *hear* 960 (and 942/954) on hardware?
- `961` (live planet-feed sonification) is a different *vibe* from the cosmic/kids clusters — want more data-poetry pieces, or keep the lab on instruments?
