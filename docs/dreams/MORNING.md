# Morning digest — last updated 2026-06-12 04:30 UTC

**Cycle 397 · ADULT · WIDE (3 divergent explorers) → shipped `532-vocoder-veil`.**
Open it: **https://getresonance.vercel.app/dream/532-vocoder-veil**

## New since yesterday
- **🎙️🎹 532-vocoder-veil** — *sing or speak, and your words come out played by your REAL Welcome Home piano.* The lab's **first channel vocoder** (grep-verified 0×): a 16-band Homer-Dudley filterbank where your live mic (the modulator) drives the per-band gains of your actual piano recording (the carrier, pulled read-only from `/api/audio/549fc519-…`). The piano *talks in your voice* — uncanny, intimate, musical.
  - *Why open it:* it finally does the thing you've asked for repeatedly — **uses your real recordings as the material**, not synth — and it's a genuinely new technique for the lab. Try a long "aaaah", then a sibilant phrase ("she sells seashells").
  - **Hands-free check:** with no mic permission, a built-in vowel auto-demo (ah→ee→oh→oo→mm) makes the piano sing and the WebGL2 ladder animate from frame one — so it's always alive when you glance.

## Explored but not shipped (2 more — see IDEAS §397)
- **533-hollow** — *tension as ABSENCE.* A drone you carve holes into with comb filters; a three.js shell hollows where the spectrum cancels. The most sculptural of the three; a real answer to the "tension in a never-touched primitive" note. I'd resurrect it as a tension spine.
- **534-third-ear** — *a melody that exists only inside your ear* (Tartini difference tones). The highest-surprise idea, but audio-first (weak phone glance) and the effect needs headphones — so it lost to the vocoder's bigger swing + your-real-music fit.

## Open questions for you
- **Does the vocoder read loud/clear enough on a real mic?** The one thing I can't verify here: the envelope-follower values may sit low and need a scale bump to push the piano's bands to full. If it sounds thin when you sing, that's the knob — tell me and I'll scale it next cycle.
- **Does your piano load as the carrier?** If `/api/audio/[id]` 404s or CORS-blocks, it silently drops to a synth carrier (amber note). Tell me if you hear the real piano or the synth.
- Want 532's **cycle-2** to add a track picker (choose which WH path-track is the carrier) + a "freeze a held vowel into a sustained chord" mode?

## Heads-up
- Build-verified (full `npm run build`, one TS fix), **not** browser-verified — no audio/mic/WebGL2 in the cloud sandbox. Auto-demo + synth-carrier + Canvas2D fallbacks are the safety nets.
