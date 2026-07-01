# Morning digest — last updated 2026-07-01 ~04:15 UTC (cycle 618)

> **The one thing this fire did:** shipped the lab's **FIRST *social* psychedelic piece.** Every trip in the lane so far has been solo — this one is *shared*. Two people, apart, tap their own rhythms; the piece couples them and you watch (and hear) the invisible **inter-brain synchrony** between you climb until you lock. And unusually for this lab: it's **hand-verifiable with no special hardware** — a synthetic "guide" runs the whole arc on one tab, and a **second browser tab** becomes a real partner over BroadcastChannel with no server.

## Open this first
- **[1077-two-minds](https://getresonance.vercel.app/dream/1077-two-minds)** — *two minds falling into sync.* Tap **Begin**, then tap a pulse (Spacebar or tap anywhere). A synthetic **guide** starts at an off-tempo and entrains to you over ~35 s — two luminous presences (warm rose / cool violet) drift toward each other as the big central **synchrony %** climbs, a woven figure sharpens between them, and at lock they meet in a gold-white bloom + a held chord. **The tell is in the audio:** two drones beat against each other when you're out of sync and slide to unison as you lock. **Try it properly: open the page in a second tab** and drive both into sync — that's the real thing. `state: collective trance · pole: cosmic-ambient → collective-ecstatic`. Refs: Kuramoto (1975) + order parameter, Strogatz *Sync* (2003), Frontiers 2026 interbrain-synchrony review.

## Also explored this fire (DEEP — one concept, 2 metaphors; 1 banked ⭐)
- **1078-shared-veil** ⭐ — the *emergent-field* version: no avatars — both of you pour into ONE shared field that self-organizes from turbulent → a single clean standing pattern via the **literal Kuramoto order parameter `r`**. The more **surprising** metaphor (order crystallizing out of a shared medium) — banked because its turbulent→coherent transition is the subtler read on a phone glance, where 1077's two-beings-meeting is self-evident. One fire away, wants an ear pass. (IDEAS §618)

## Why this one won
Both metaphors cleared the bar and both carry the synthetic-partner (so the fire stays verifiable). **1077 won** because it makes the *whole point* — that this is a **shared** experience — self-evident at a glance (two beings visibly meeting + a huge synchrony %), and because it's genuinely hand-verifiable (single-tab guide + two-tab coupling, no hardware), which dents the verification debt you've flagged for six juries. This also discharges your twice-named gap: *"a multi-user shared psychedelic room — the lab has never built one."*

## Honest caveats
- **Built green.** `npm run build` → `✓ Compiled successfully in 49s` + ESLint + project `tsc --noEmit`, **0 issues from the 1077 folder**; only the standing container EMFILE fd-block stops static-gen (infra, Vercel-safe).
- **One soft spot (disclosed):** the shared drone engine only exposes `drive`, not a live retune — so the beating→unison cue rides an added detuned sine pair *alongside* the drones rather than inside them. Audible and on-brief, but the cleaner fix is a `setRoot`/`setDetune` on `_shared/psych/droneBank` (queued as the cycle-2 deepening). The fine ear-feel of the lock and whether it reads as *ecstatic* are the only device-only unknowns.

## Open questions for Karel
- **Does the sync arc land?** The bet: watching two beings drift together while the drones stop beating *feels* like two nervous systems coupling. Best tested with a second tab — or just let the guide entrain to you.
- **Which next?** Cash **1078-shared-veil** ⭐ (the emergent-field sibling), or — the discipline you keep asking for — a genuine **cycle-2 of 1077**: N>2 presences (a real shared *room*, not a dyad), a WebRTC copy-paste cross-device path, and the drone-retune fix.
- **Still open (needs you):** raise the container's ~4096 fd-ceiling (or bless `next build --experimental-build-mode compile`) so the full build finishes locally and the ear/GPU-only pieces finally get verified.
