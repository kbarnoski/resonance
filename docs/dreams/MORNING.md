# Morning digest — last updated 2026-07-20 (cycle 842, WIDE)

> **Jury verdict today**: Best novelty window yet — first AI chain, first live-earthquake score, a haptic eyes-closed instrument — but the lab quietly stopped being psychedelic (1 of 12), stopped making multi-cycle bets, and swapped the banned JI drone for one reused glass-bell; tomorrow, go psychedelic and go deep on ONE piece. See `docs/dreams/JURY.md`.

Mode **WIDE** — 3 parallel builders, ship the strongest. This fire cashed the three strongest **banked TOP-resurrects** (each built demoable in a prior fire), disjoint on every tag axis, all off the jury 2026-07-19 bans, on the two cold substrates + un-banned WebGL2.

## New since yesterday
- **[2046-orbit-transit](/dream/2046-orbit-transit)** — *the satellites and the ISS passing overhead right now, sung as an evolving Doppler-swept chord.* **Why open it:** the sky's real orbital traffic becomes music — each visible pass is a sustained voice whose pitch bends with its actual range-rate (approaching rises, departing falls), altitude sets register, elevation sets loudness, azimuth pans it; the chord re-voices as passes rise and set. Opens the **never-used orbital-data lane** — the boldest anti-"too similar" move available. Self-drives on mount (seeded sim); an optional live ISS fetch flips the chip to "live". Audio-forward + a quiet SVG sky-dome, non-JI Doppler glissando, off every ban.

## In progress / partial
- None — single-fire ship. Two runners-up were built demoable this session and banked (below), not committed (non-winner rule).

## Explored & banked this fire (see IDEAS §842)
- **⭐⭐ diffusion-field** — *draw glowing colour-curves; the luminous field diffusing between them IS the music.* The **most technically substantial + most beautiful** build of the fan: a real WebGL2 Jacobi **Poisson diffusion-curve** solver (Orzan, SIGGRAPH 2008; confirmed *live 2026* by arXiv:2408.09211) driving a 5-formant spectral synth. De-selected only because "draw→hear" is the lab's most-worn *loved* shape — but it's the **TOP resurrect** and pays back the cosmic-ambient re-center the recent non-psychedelic window owes.
- **⭐ tide-glass** — *tip a vessel of luminous liquid and hear the tide slosh, overshoot and ring.* A real damped-oscillator slosh on the **coldest substrate** (CSS-compositor only), spectral non-JI wash. Coldest-lane bank.

## Research finding worth a look (RESEARCH §842)
- **Diffusion-curves-as-a-Poisson-problem is a live 2026 thread** (arXiv:2408.09211 · NURBS-Splatting 2606.31764 · ETH-Zurich ray-traced diffusion curves 2026) — which is what upgraded the diffusion-field resurrect from "foundational" to "current."

## Open questions for Karel
- **Diversity vs. beauty:** I shipped orbit-transit (never-used data lane, bigger *concept*) over diffusion-field (higher ambition, richer *visual*) to honor the hard Diversity Mandate + your "too similar" directive. If you'd rather I weight *beauty/technical depth* over *lane-novelty*, say so — diffusion-field is one curation away.
- **The AI-pipeline chain (audio→image→video, ≥2 models) is STILL 0×** (jury #5). I keep earmarking it and not building it because I'm headless and can't verify a multi-GB in-browser model actually *loads* — a runtime model failure passes the compile-mode build gate and would silently break your review. Worth a dedicated cycle where runtime is verifiable. Flagging honestly rather than punting silently again.
- **Infra:** the dream container's 4096-fd hard cap still blocks a *full* `npm run build` at ~800 routes (HEAD too) — the lab leans on `next build --experimental-build-mode compile` (the Vercel compile gate). Raising the ulimit or paginating `/dream` would restore the real static build.
