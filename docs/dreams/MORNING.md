# Morning digest — last updated 2026-06-29 ~18:30 UTC (cycle 601)

## Open this first
- **[1053-ripple-loom](https://getresonance.vercel.app/dream/1053-ripple-loom)** — *an instrument you PLAY.* The screen rests dark — a still pond of light, a quiet drone. **Tap to strike a ripple; drag to draw a line of strikes.** The expanding rings get warped through your own visual cortex's log-polar map, so flat circles read on screen as **breathing tunnels, spirals or honeycombs**, and each ring sweeping past a hidden listener probe **rings a consonant bell.** Pick the Form, set Decay, scatter more Bells. It's a struck pond, not a screensaver.

## The real headline: the engine room finally got built
You asked (via the jury, ~7 fires running) for the **`_shared/psych/` extraction** — stop re-deriving the same psychedelic-geometry warp in every piece. Done this cycle:
- **`logpolar.ts`** — the load-bearing form-constant / log-polar engine (Bressloff–Cowan retina→V1 map). One import, every prototype gets tunnels/spirals/honeycomb. **It has a passing test** (round-trip exact) — a first for this lane, which has shipped this math un-tested 3× (1038/1042/1044).
- **`safeFlicker.ts`** — the photosensitive-safe flicker gate: OFF by default, hard-capped ≤3 Hz, soft sine (never a hard strobe), instant kill, honors reduced-motion. Now the *only* sanctioned flicker path.

1053 is the first piece that **composes** them instead of re-deriving — and it also brings **WebGPU compute back as the resonating body** (jury #4: it had collapsed to 2×, both dead Echo Halls). The body is a real WGSL wave-equation sim; a Canvas2D fallback means it never blanks on a phone.

## Also explored (banked, not shipped)
DEEP fire — ONE concept ("play a form-constant field into being"), **2 parallel builders**, shipped the stronger:
- **1054-cortex-paint** ⭐ (IDEAS §601) — *paint directly into your visual cortex*: drag strokes in cortical space, each blooms into a form constant and sustains a voice; **optional Welcome Home file-carrier**. Genuinely lovely, but its output is a WebGL2 full-screen field (the *form* the jury banned) and the real-piano angle just shipped in 1052 — so 1053's compute-body won. Ready to resurrect; its two best ideas (file-carrier + sustained-ridge) are folded into 1053's next-cycle notes.

## Open questions for Karel
- **Echo Halls** (your only 5/5, 1019/1029) is STILL formally adrift — I prioritized the overdue infra debt this fire instead. Next call: resurrect as cycle 3, or retire it? I'll force a decision next fire if you don't.
- Want a small public **Welcome Home track-list endpoint**? It'd let a prototype auto-load your real piano instead of you dropping a file at review (would unlock the 1053 file-carrier deepening immediately).
- Next infra to extract is **`feedback.ts`** (the ping-pong feedback accumulator, re-derived in 1047). Worth pulling so a feedback-tunnel piece composes instead of re-deriving?

## Caveat (same as every cycle)
Built + type/lint-clean (`tsc` 0 errors; `next lint` on the new folders 0/0; the log-polar math is now unit-tested). **Not GPU/ear-verified** in-container (no WebGPU/audio device — the Canvas2D fallback path is what would run). `npm run build` passes compile+lint+typecheck; only the standing container fd-ceiling blocks local static-gen (Vercel deploys fine).
