# Morning digest — last updated 2026-07-05 (cycle 672, adult · DEEP)

> **Following the jury**: its un-cashed provocation #5 named *"a conducted shared ensemble"* as **the single largest un-built category** in the whole menu. So today went DEEP — one big concept (a many-hand collaborative instrument), three topologies raced, ship the least-derivative. Research spine: a **lookahead-commit** distributed clock (StreamMUSE arXiv 2606.11886, 10 Jun 2026 + ReaLJam 2502.21267). See `docs/dreams/JURY.md`.

## Open this first
- **`/dream/1206-murmuration` — a flock of 180 voice-birds that *sings when it clusters*. Press "Enter the flock", headphones on, then move your pointer to pull the swarm.**
  You are a glowing attractor; the murmuration bends toward you, and when birds knot together they ring a glassy, bowed-glass ping. **Open a second tab** and each tab becomes another hand — the two of you sculpt one emergent piece together, kept in phase by a shared beat clock. Alone, two drifting ghost-attractors keep it breathing.

## Why this one
- **The lab's first *collaborative* instrument** — every prior multi-peer piece is a 2-person duet (508, 729, 1077). This is a symmetric N-hand ensemble where the swarm itself is the shared score.
- **A real distributed-timing spine, not a fake.** The voice is quantised to a shared beat grid and committed one beat ahead (lookahead-commit, straight from this week's StreamMUSE paper + ReaLJam) — so tabs ring the same notes in phase instead of chasing each other's latency.
- **Clears all four standing bans:** active multi-hand input (not passive), granular bowed-glass voice (not the banned JI choir), deep-indigo additive chiaroscuro (not bright-daylight Canvas2D), teal→magenta→amber chromatic palette.
- **Honest ambition: 3/5.** I did *not* claim "first multi-user" — a grep found the jury was wrong that it's 0× (WebRTC/BroadcastChannel duets already exist). The fresh part is the *collaborative flock-instrument + distributed clock* combination.

## Explored but banked (2 more — see IDEAS §672, both fully built + lint/tsc clean)
- **`1204-baton-ensemble`** — you *conduct* with a baton (tempo/dynamics/key), others each drive one chair of an FM gamelan section. Lovely, but it shadows the existing **754-conducted-table** — same concept, so I banked it rather than ship the instrument twice.
- **`1205-loom-in-c`** — a leaderless room playing Terry Riley's *In C*, everyone braiding through the 53 cells at their own pace, on a struck-bar marimba. Also strong, but it shadows the existing **1183-in-c-loom**. Banked.

## Heads-up (build gate — infra, not code)
- Winner passed the real gate: `next lint --dir 1206` → **0 warnings/0 errors**; `tsc --noEmit` project-wide → **0 errors**; the winner's `page.js` **compiled (28.7 KB)**. The full `npm run build` "compiled with warnings" (all pre-existing files, **none from 1206**) then can't finish static-gen in this container — the **standing `EMFILE` fd ceiling** since ~cycle 472. **Vercel has no such cap and deploys normally.**
- **NOT ear/GPU-verified, and multiplayer not runtime-verified** (headless box, no speakers/display, can't open two live tabs): whether the flock *reads* as gorgeous and whether two tabs truly stay phase-locked wants your hardware. Solo + ghost path guarantees it's never blank/silent.

## Open question for you
- **Cross-device multiplayer** (phone ↔ laptop, not just two tabs) needs a signaling-store decision — or I can stub it against a public WebRTC broker. 1206's intent/clock protocol is already the right shape to drop onto WebRTC. Say the word and next cycle wires it.

## Still queued behind you
- `1201-ignition` (⭐ Izhikevich→modal) · `1202-torsion` (torus-knot→Karplus-Strong) · `1198-limbline` · `1189-turner-sky`.
- Genuinely fresh grep-0× engines confirmed for a future WIDE: **Belousov–Zhabotinsky** spiral waves · **magnetohydrodynamics / Alfvén waves**.
