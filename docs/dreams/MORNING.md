# Morning digest — last updated 2026-07-02 (~04:20 UTC, cycle 629)

> **The one thing this fire did:** it built an instrument on a genuinely
> counterintuitive idea — **you can only hear the melody by adding NOISE.**
> `1096-noise-bloom` renders a tune *below the threshold of hearing*, then lets
> you dial in noise: too little and there's silence, too much and it drowns, and
> at the resonance sweet-spot the phantom melody blooms out of the static. It's
> real psychoacoustics (stochastic resonance — the mechanism behind the Zwicker
> tone illusion and tinnitus), turned into a thing you play.

## Open this first
- **[1096-noise-bloom](https://getresonance.vercel.app/dream/1096-noise-bloom)** — *drag the noise dial and hunt for the sweet-spot where a hidden melody phases into being.* A quiet D-Dorian phrase sits at/below audibility; band-shaped noise added on top, at the right level, unmasks it (an inverted-U resonance curve, sweet-spot slowly drifting). A grain field coheres from static → luminous filaments as it resolves, so you *see* how close you are. Zero permissions; a 22s idle auto-sweep means it blooms + coheres hands-free the moment you open it. `state: hypnagogia / sensory-deprivation threshold · pole: eerie-liminal`. **30-second morning check: open it, hear the melody rise out of noise and fall back.**

## Why this one, and why now
A DEEP fire — one concept (stochastic resonance), two parallel builders, two modalities. **Noise Bloom won** the *auditory* version over `1097-veil-listen` (the *visual* Ganzfeld twin — a presence resolving out of TV-static) on: (1) **research fidelity** — stochastic resonance is literally *the model of auditory perception* (Krauss et al.), so the audio version IS the cited mechanism; (2) **surprise for a musician** — "noise is the only thing that lets you hear the music"; (3) it keeps the fresh **audio-first** output in play and swings the pole to **eerie-liminal** off the recent cosmic-ambient runs. Today's research seeded it (RESEARCH §629).

## Also explored (banked — see IDEAS §629)
- **⭐ `1097-veil-listen`** — the visual twin: a faint mandala resolving out of animated noise at the SR sweet-spot, a chord coalescing with it, flicker-safe by construction. **Top resurrect — the clean cycle-2 graft:** merge its visual-resolve onto 1096 so you SEE *and* HEAR the phantom emerge at one shared sweet-spot.

## Honest caveats
- **Built green (for shipping).** Winner-only `npm run build` → compile + ESLint + full-project type-check all PASS (reached `Generating static pages`; 0 output from the 1096 folder; `tsc --noEmit` exit 0; scoped `eslint` exit 0). Only the standing container static-gen `EMFILE` (~4096-fd ceiling, every cycle since ~472) stops a full green. Vercel-safe.
- **Verification honesty:** the inverted-U emergence is demonstrable *by construction* (clarity boosts the melody at the sweet-spot), but the *felt* psychoacoustic unmasking is **ear-dependent** and NOT ear-verified in this headless box. The auto-sweep guarantees a sounding + cohering glance regardless.

## Open questions for Karel
- **Does the melody genuinely bloom out of the noise for you?** The whole pitch is that noise is the enabling ingredient — worth 20s of actual listening to feel the sweet-spot.
- **Ship the cross-modal merge next?** `1097`'s visual resolve grafted onto `1096` = one dial, see + hear the phantom together. Say the word and I'll cash it as cycle-2.
- **Still open (needs you):** raise the container's ~4096-fd ceiling (or bless `next build --experimental-build-mode compile`) so full builds finish locally and GPU/audio pieces finally get hardware-verified — the standing #1 verification debt.
