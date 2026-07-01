# Morning digest — last updated 2026-07-01 ~06:15 UTC (cycle 619)

> **The one thing this fire did:** shipped the lab's **FIRST instrument with MEMORY** — one that records you as you play, then at the peak *stops listening and dreams your own playing back to you*, recombined and drifting. It's a genuinely new **relationship** (not another live-reactive field), and it came from a fresh 2026 paper that flips the lab's founding assumption: hallucination isn't bottom-up noise — it's **top-down replay of the recently-learned world.**

## Open this first
- **[1078-dream-replay](https://getresonance.vercel.app/dream/1078-dream-replay)** — *the instrument that dreams you back.* Tap **Begin**, then tap/drag the dark field: each touch plays a warm just-intonation bell (higher = higher) and leaves a glowing dot — a **memory of your own note.** Over ~50 s it "closes its eyes": your live touches fade out and a bright **read-head** starts walking your remembered notes in a *recombined* order — first retracing your real phrases, then jumping and stitching them into sequences you never played, positions drifting, trails smearing. **You hear your own playing dreamed back, dissolving.** Drive it by hand with **Close-your-eyes ▸ / ◂ Wake / Let-it-drift.** No mic, no camera, nothing to grant — and a silent auto-demo plays the whole arc if you just watch. `state: hypnagogia / generative replay · pole: cosmic-ambient → dreamlike`. Ref: Bredenberg et al., *eLife* 2026 "oneirogen" replay model.

## Also explored this fire (DEEP — one concept, 3 substrates; 2 banked ⭐)
- **1079-dream-swarm** ⭐ — the **intense** version (raw-WebGL2): your tapped rhythm builds a Markov model, then the dream erupts as a churning particle **swarm** of recombined phrases, turbulence rising to a hot peak. Wants a GPU pass. (IDEAS §619)
- **1080-dream-grain** ⭐ — the **audio-first / screen-minimal** version (mic): hum a motif → it records your *voice* as grains → dreams it back as a self-choir of phrases you never sang. Has a synthetic-voice fallback so it runs with no mic. Wants a mic + pitch-shift (PSOLA) pass. (IDEAS §619)

## Why this one won
All three cleared the ambition floor (honest 4/5) and dodged every diversity ban. **1078 won** because it's the **most hand-verifiable** — pure Canvas2D + Web Audio, zero permissions, and the auto-demo runs the entire record→dream→dissolve arc, so you can actually *see and hear it* on a 06:30 phone glance (the swarm needs a GPU, the grain wants a mic). It's also the cleanest read of the concept and delivers a **"massively bigger concept"** — a new *relationship* with the instrument, not a new visual.

## Honest caveats
- **Built green.** Authoritative winner-only `npm run build` → compile + ESLint + project `tsc --noEmit` all pass (reached `Collecting page data`); scoped lint/typecheck on the 1078 folder = **0 issues**; only the standing container EMFILE fd-block stops static-gen (infra, Vercel-safe).
- **Device-only unknown:** the *fine ear-feel* of the recombination at mid-α — whether the dream reads as "my phrases loosening" vs merely random — is subtle and depends on how much you play before it closes its eyes. Sparse input dreams correctly but with less obvious recombination.

## Open questions for Karel
- **Does the "dreamed back" moment land?** The bet: hearing your *own* just-played phrases return, recombined and drifting, is more uncanny/personal than any generative field — because the material is yours.
- **Which next?** This is framed as a **multi-cycle** piece — obvious cycle-2 deepenings (in the README): a true variable-order memory model, a visible basal/apical layer split, and **cross-session memory** (it remembers you across visits). Or cash a sibling — **1079-dream-swarm** ⭐ (intense/GPU) or **1080-dream-grain** ⭐ (your voice).
- **Still open (needs you):** raise the container's ~4096 fd-ceiling (or bless `next build --experimental-build-mode compile`) so the full build finishes locally and the GPU/mic pieces finally get hardware-verified.
