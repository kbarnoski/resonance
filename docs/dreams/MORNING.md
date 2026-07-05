# Morning digest — last updated 2026-07-05 (cycle 671, adult · WIDE)

> **Following the jury**: its headline was that the *sound* homogenized — six of the last fifteen play a just-intonation choir/drone, "new costume, same body." Provocation #2: *"ban the JI choir for a week — build the next piece on a fundamentally different synthesis: granular/FM/physical-modeling/noise-spectral/waveguide. Change the VOICE, not just the visual."* Today's fire is three fresh voices raced head-to-head, shipping the freshest. See `docs/dreams/JURY.md`.

## Open this first
- **`/dream/1203-gendy` — hold a living waveform and tune it from a pure tone to a stochastic roar. Press Begin, headphones on, then drag on the field.**
  The tone isn't sampled or oscillated — it's **drawn** as a 12-corner polygon, and every cycle each corner takes a random step (Xenakis's GENDYN). **Drag up/right** and the walk tightens into a clean pitched tone; **drag down/left** and it convulses into gritty, living roughness. The glowing oscilloscope *is* the actual waveform, breathing over its own afterimage so you can see the random walk.

## Why this one
- **A synthesis voice this lab has literally never had.** GENDYN (dynamic stochastic synthesis) is grep-0× — Xenakis was only ever *name-dropped* before (cellular automata, UPIC, granular), never built as a stochastic-waveform voice. It's the most direct answer to the jury's "the ear is bored" — a whole new category of sound, not another pad.
- **Clears all four standing bans:** active drag input (not passive), GENDYN voice (not the banned JI choir), WebGL2 feedback oscilloscope (not bright-Canvas2D), violet→amber-on-charcoal chromatic chiaroscuro (neither bright-daylight nor flat near-black).
- **Ran WIDE:** three orthogonal fresh voices — GENDYN stochastic · Izhikevich→modal · torus-knot→Karplus-Strong — raced. GENDYN won on being the single freshest voice against the jury's exact complaint.

## Explored but banked (2 more — see IDEAS §671, both fully built + clean)
- **⭐ `1201-ignition`** — a 96×96 sheet of **Izhikevich spiking neurons** you **ignite with a touch**; ignition spreads as spike-spirals, each spike striking **inharmonic modal percussion**, in teal→ember. Strongest ambition floor (4/5), a keeper engine — my **top resurrect** for the next intense/active-touch slot. Lost only because its modal voice is the least-fresh of the three (echoes 1193's gong).
- **`1202-torsion`** — a **(p,q) torus knot** you **drag to re-tie**, its topology plucking a **Karplus-Strong string**, in a strict two-colour ink-blue+vermilion Ikeda palette. This rebuild finally delivered a *true* projected-crossing detector — so it **supersedes** the older banked 1197. Resurrect for the next two-colour / plucked-string slot.

## Heads-up (build gate — infra, not code)
- Winner passed the **real gate**: `next lint --dir 1203-gendy` → **0 warnings/0 errors**; `tsc --noEmit` project-wide → **0 errors**; the winner's `page.js` **compiled (51 KB)**. The full `npm run build` still can't finish *in this container* — the **standing `EMFILE` fd ceiling** (hard-capped 4096 open files) hits during static-gen of the ~700-page tree. **Same ceiling since cycle ~472; Vercel has no such cap and deploys normally.** Not a code problem.
- **NOT ear/GPU-verified** (headless box, no speakers/display): whether the grit *reads* as a musical order↔chaos gradient wants your hardware. The Canvas2D fallback + slow-breath idle guarantee it's never blank or silent.

## Still queued behind you
- Jury's un-cashed provocations: **WebRTC multi-user** — the jury calls it 0×, but a grep found several prior attempts (`508-accord-call`, `754-conducted-table`, `918`…); it's a *revisit*, not a clean 0×, and still wants your **signaling-store** call (or "stub it against a public test server"). **Depth-camera spatial audio** is genuinely 0×.
- Near-black-glow ban (jury 07-04) lifts ~**07-11** — gates the dark resurrects `1174-magnetosphere-song`, `1166-ear-tone-field`.
- `1201-ignition` (⭐) · `1202-torsion` · `1198-limbline` (⭐) · `1189-turner-sky` all want a slot.
