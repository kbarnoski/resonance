# Morning digest — last updated 2026-06-05 (UTC), cycle 313

Open the lab: https://getresonance.vercel.app/dream

## ⭐ Open this first (adult — then open it in a 2nd tab)
- **[319-hub-score](https://getresonance.vercel.app/dream/319-hub-score)** — **the lab's FIRST networked piece.** Every open tab of this page becomes one sustained voice in a single, server-less just-intonation drone. Press **Start**, then **open the same URL in a second tab** — the two voices breathe together, in sync, with no server. The trick: the **wall clock is the conductor** — every tab reads `Date.now()` and lands on the same swell at the same instant, so timing needs zero networking. Tap a degree to pick your chord-tone; press **Take the baton** to conduct the whole room's harmony — everyone glides to match. *Why open it:* "every browser tab is a player in one ensemble" is a new axis the lab had never shipped in 318 prototypes.

## Why this one
- **The multi-user shelf, finally opened.** Networked / multi-instance was the one categorical gap empty for 15+ cycles (the other, AI-pipeline-chain, is still waiting on a budget — see below). This is a real lab-first technique: shared state over `BroadcastChannel`, timing over the wall clock.
- **Massively-bigger-shaped:** a *conducted* ensemble (pass the baton, the room glides) — not just co-located players. Lineage cited: **The Hub** & **The League of Automatic Music Composers** (the 1978–80s networked-computer bands), **La Monte Young's Dream House**, **Ryoji Ikeda** for the restraint.
- **Diversity-clean:** a no-glow Canvas2D graphic score (not a shader, not three.js-bloom), just intonation over D (not pentatonic). Plays solo too (two ghost voices hold the chord; you can conduct them).

## Also explored this fire (DEEP — 1 more, banked in IDEAS.md)
- **318-ensemble-room** — the *rhythmic* sibling: every tab edits a 16×8 step pattern on a shared wall-clock grid, and the room is a **three.js 3D orbital constellation** of glowing players. Lost only on diversity (three.js + bloom-glow is the cluster the jury keeps flagging). Its resurrection path is the exciting one: **true WebRTC across machines** → the lab's first cross-*device* room.

## Threads / what's next
- **Kids (314):** ship the banked **316-seed-garden** (a long-form living garden) or **315-sing-up** (voice/pitch); rotate input away from camera.
- **Adult (315+):** deepen 319 (spatial pan per voice, a self-evolving progression) or resurrect 318 toward **cross-device WebRTC**; or deepen **Solar Wind** / **Orbit Choir cycle 3**.

## Open questions for you
- **AI-pipeline-chain (image gen inside an AV piece)** remains your explicit, most-wanted, never-built direction — it needs paid FAL generation and I won't spend autonomously. **Grant a per-prototype budget (e.g. $X/cycle) and I'll build it next adult fire.**
- **319 is build-verified, not browser-verified** — and note the honest limit: `BroadcastChannel` is *same-machine tabs only*, not cross-device. A real cross-room version (WebRTC) is the banked 318's next step; worth a steer on whether that's worth the signaling infra.
