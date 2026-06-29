# Morning digest — last updated 2026-06-29 (cycle 596 · ADULT · psychedelic — WIDE)

**Today's ship: [`/dream/1047-tracer-drift`](https://getresonance.vercel.app/dream/1047-tracer-drift)** — the long weightless *drift* of an acid trip, and the lab's first feedback-trail engine.

## New since yesterday
- **`1047-tracer-drift`** — surfaces breathe, and any motion smears into lagging, color-shifting **trails** behind it; faint visual-snow and slow moiré drift underneath. Breathe into the mic and the trails lengthen. `state: LSD · pole: cosmic-ambient (drifting)`. **Why open it:** every psychedelic piece so far chases the *peak* (DMT breakthrough, NDE light, form-constant bloom, Dreamachine flicker) — this is the one that's all *plateau*, the hours-long weightless drift. It feels different from the rest of the lane on purpose.
- Under the hood it's the lab's **first ping-pong feedback buffer** (two textures swapping each frame, the old frame re-fed warped + decayed) — exactly the `feedbackBuffer.ts` shared-infra PSYCHEDELIC.md keeps asking for. Pastel palette (lilac/peach/mint/rose), not neon. Works hands-free with zero permissions (self-driven drone + drift if you skip the mic).

## Explored but not shipped (2 more — see IDEAS §596)
- **`1048-threshold`** ⭐ — **hypnagogia**: forms self-assemble out of the dark (a half-seen face, a horizon, a lattice) and the scene *teleports* with dream-logic, never repeating. The most "did I just see that?" of the three — banked resurrect-first for the next fire. (Held only because 1047 landed the missing feedback infra + the missing *drift* tempo.)
- **`1046-mycelial-bloom`** — **psilocybin**: warm-organic foliage/mycelium structure breathing and blooming open like a chrysanthemum (amber/rust/moss/gold). Brings the warm palette the whole lane lacks; good for an intense-warm night.

## Open questions for Karel
- **Overdue, worth a DEEP cycle:** I now have real consumers for all the `_shared/` psychedelic infra — `1047`→`feedbackBuffer.ts`, `1043`→`safeFlicker.ts`+`droneBank.ts`, `1038`→`logPolarWarp`, `1042`→`raymarch4D`. Four cycles have deferred extracting them. Want me to spend a cycle building the shared kit so future psych pieces compose in minutes? **Highest-leverage non-build cycle available.**
- **Still the local build gate** (unchanged from yesterday): full `npm run build` can't finish in my sandbox — the container's open-file cap (4096) is too low for 1000+ routes, so it dies with `EMFILE` in prerender (proven environmental; Vercel deploys fine). I validate via the full compile+ESLint+type-check, which passes clean. Could you raise the fd limit or bless `--experimental-build-mode compile` as the gate?

## Lane status (psychedelic)
5 builds: `1038` DMT (intense) · `1041` NDE (cosmic) · `1042` 4D-DMT (intense) · `1043` Dreamachine (cosmic) · **`1047` LSD-drift (cosmic)**. Pole leans cosmic-ambient 3/2 → next fire could go intense (banked `1044` hyperbolic / `1046` psilocybin fit).
