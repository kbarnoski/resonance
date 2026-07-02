# Morning digest — last updated 2026-07-02 (~08:10 UTC, cycle 631)

> **The one thing this fire did:** it made an instrument out of *breaking* your
> senses apart. `1101-time-dissolve` is audio-first — an endless falling tone
> poured into a swelling void until echo and onset merge — and the faint light
> you see is drawn *late*, on a lag that deepens as you sink, so your eyes and
> ears quietly disagree. That mismatch **is** the dissociation. A "Re-bind"
> button snaps them back into sync so you can feel it switch on and off.

## Open this first
- **[1101-time-dissolve](https://getresonance.vercel.app/dream/1101-time-dissolve)** — *an audio-first descent that dissolves your sense of when; put headphones on, tap "Begin", and let it run.* A Shepard–Risset endless **descent** + just-intoned drone + a granular time-stretch smear pour into a swelling convolution void; one global `timeScale` slows everything the deeper you go. It's a real ~4-minute arc with state — deepening → a plateau → a brief hyper-lucid **clarity snap** near minute 3 (everything sharp and coherent for a moment — the "gamma surge at death" translation) → a soft return, so minute 4 sounds nothing like minute 1. The novel core is the deliberate **audio-visual desync + Re-bind A/B** — grep-0× in the lab. `state: ketamine/NDE temporal dissolution · pole: cosmic-ambient`. **30-sec check:** open it, hit Begin, then toggle "Re-bind" a couple times and watch the bloom snap into/out of time with the sound.

## Why this one, and why now
A **DEEP** fire — 2 parallel builders on ONE concept (dissolve the felt sense of *when/where* sound comes from), ship the stronger. **Time-dissolve won** over `1100-sourceless` (a binaural HRTF "sound-with-no-place" version) because 1100's HRTF-ring + Shepard substrate overlaps the already-shipped `1090-threshold-descent` — and this lab just learned (1069=1084) not to build the same substrate twice. Time-dissolve is more differentiated (granular time-stretch + clarity-snap arc), fills the thin **long-form-generative-with-state** category, and reads on the morning glance without headphones. It also swings the pole back to **cosmic-ambient** after four intense pieces in a row, and rests WebGPU-compute (used 3× recently). Today's research seeded it (RESEARCH §631): the 2026 frontier races to perfectly *sync* spatial audio to video — this inverts it.

## Also explored (banked — see IDEAS §631)
- **`1100-sourceless`** — 8 binaural voices orbit your head and never settle anywhere; the sound comes from everywhere and nowhere (ketamine spatial de-localization), same Re-bind A/B. Build-complete and clean; banked only to avoid duplicating 1090's substrate. Worth resurrecting once sharpened away from it (broadband grains, a continuous desync slider, Doppler).

## Honest caveats
- **Built green (for shipping).** Winner-only `npm run build` → compile + ESLint + full type-check all PASS (0 ESLint issues from the 1101 folder; `tsc --noEmit` exit 0; scoped `eslint` exit 0; the page compiled). Only the standing container static-gen `EMFILE` (~4096-fd ceiling, every cycle since ~472) stops a full green. Vercel-safe.
- **Not heard on hardware.** The audio graph, the ~4-min arc, and the desync are code-verified (kit signatures, grain scheduler, ring-buffer lag, arc math all reasoned through) but **not listened to** in this headless box — the lag-warp and clarity-snap constants are hand-tuned, not perceptually validated. This one really wants your ears and a full ~4-min sit.

## Open questions for Karel
- **Does the clarity snap land?** ~3:15 in — a brief everything-goes-sharp moment before the return. Worth the full listen to tell me if it needs to hit harder / sooner / not at all.
- **Ship `1100-sourceless` next** (sharpened away from 1090), or push a cycle-2 of this one (multi-channel desync, grain-pitch descent, endless-arc mode)?
- **Still open (needs you):** raise the container's ~4096-fd ceiling (or bless `next build --experimental-build-mode compile`) so full builds finish locally and the audio/GPU pieces finally get hardware-verified — the standing #1 verification debt.
