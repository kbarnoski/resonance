# Morning digest — last updated 2026-06-09 (UTC) · cycle 368

> **Built the kids half of the jury's #1 ask.** The jury said the bans split the lab into a **cold-adult / sweet-kids binary** and that ambition collapsed (zero pieces at 4–5/5). This kids cycle ships the **loud, fast, playfully chaotic** piece the kids lane was missing — and clears **4/5** by restarting a multi-cycle spine (#4) and binding today's research (#5).

## New since yesterday
- **`451-kids-jelly-storm`** ([open](https://getresonance.vercel.app/dream/451-kids-jelly-storm)) — *Tap, drag, and **SHAKE** to make squishy jelly creatures RAIN — the more chaos, the louder and more triumphant the music climbs, then it lands on a big happy chord when it settles.* **Why open it:** it's the **missing kids middle** — not a 5th calm-pentatonic lullaby but energetic, joyful, and it **resolves on purpose**. Real **soft-body physics** (Position-Based Dynamics): the jelly genuinely squishes, and that squish drives both the glow and the sound. A bright "MORE!" energy bar makes the build-and-resolve arc legible to a 4-year-old. Best on a phone/tablet (shake-to-rain); plays itself hands-free after ~3s.
- This was a **DEEP** kids fire — **one concept** (*a soft-body jelly playground that escalates and resolves*) attacked **3 ways** (PBD / Verlet mass-spring / metaball-SDF goo); the PBD one shipped.

## Why it clears 4/5 (the regression fix the jury demanded)
- **#2** ≥3 subsystems (PBD solver · energy-driven music engine · WebGL render · multi-touch · shake) · **#3** named ref (Müller *Position Based Dynamics* 2007) · **#4** cycle 1 of a new multi-cycle **"Squish" spine** (the axis dead since 414) · **#5** today's research *binds* the build.
- Dodges all four new bans: WebGL (not Canvas2D) · pitched melodic G-major (not drum-machine) · joyful/resolving (not refuse-to-resolve, not pentatonic-lullaby). Pulled by your loves of `169-kids-marble-run`❤️ + `234-kids-hand-creature`❤️.

## Explored but not shipped (IDEAS §368)
- `449-kids-squish-jam` — Verlet mass-spring jelly (cleanest, safest).
- `450-kids-goo-band` — WebGL2 **metaball-SDF merging goo** (most visually surprising — gooey blobs fuse into chords; strong cycle-2 fold-in candidate).

## Research worth a look (RESEARCH §368)
- Browser **soft-body physics** is a live 2025–26 vein (WebGPU **AVBD** solver / jure/webphysics; Medusae re-featured) — the lab had never shipped a true deformable. 451 realizes it at kids fidelity via PBD.

## Open questions for Karel
- Build-verified, not browser-verified (no GPU/audio/touch sensor here). On a real tablet: does the squish read as *bouncy* (not jittery) at 36 creatures, and does the energy→arpeggio escalation feel *musical* (not frantic) on phone speakers?
- Make "Squish" a real spine? Strongest cycle-2: fold 450's gooey **merge→chord** mechanic into 451 (two jellies touching fuse into a louder chord).
