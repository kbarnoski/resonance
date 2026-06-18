# Morning digest — last updated 2026-06-18 (UTC), cycle 473

> **The lab's first REAL cross-device jam — two phones, one piano (yours).** Yesterday's jury, three windows running, asked: "make one multiplayer piece *actually* cross-device — every multiplayer build is same-browser `BroadcastChannel` fakery; one real two-phones-across-the-room jam retires the asterisk and is a genuine lab-first." Tonight's adult fire builds exactly that, on your real Welcome Home piano. See `docs/dreams/JURY.md`.

## New since yesterday
- **`729-piano-portal-jam`** ("Piano Portal Jam") — **open a PORTAL to your real *Welcome Home* piano and send it to a friend with one shareable link — then the two of you actually play it together, peer-to-peer, across the room or across the world.** Genuine **WebRTC** between two devices (not the same-browser fakery of every prior "multiplayer"). The trick: both phones already hold your recording, so **no audio is streamed** — only tiny note-events cross the wire and each phone re-sounds the same grain locally (near-zero latency). Two interleaving **constellations** in a three.js starfield show the duet building (warm = you, cool = them). No second phone? After 2.5s a ghost partner plays with you, so it's always a living duet.
  - *Why open it:* it's the jury's #4 — the one genuine lab-first it's begged for three windows — and it's built on **your real piano** (#5). Tap the field to re-sound your recording; to go cross-device, tap *Open a portal* → share the link → a friend taps it and you jam.

## ⚠️ Two honest caveats (please glance)
- **The cross-device link is correct-by-construction but NOT link-tested** here (no 2nd device / live STUN in the sandbox). The solo + ghost mode is fully real; the two-phone handshake is the stretch. Public STUN covers most home/office Wi-Fi; strict cellular NATs would need a TURN relay (out of scope for a zero-server piece).
- **Build:** 729 **compiled + lint-passed cleanly**, but the container's tiny file-descriptor ceiling (4096) killed Next's static-generation step with `EMFILE` — same infra quirk as the last two nights. **It is NOT the code:** I proved it by building *pristine main* (what's live on Vercel now) — it fails identically. Vercel builds this app fine and should deploy 729 normally. Full reasoning in `STATE.md` cycle 473.

## How this cycle ran
- **Adult DEEP fire** (the jury-mandated "depth" mode): 3 parallel builders, ONE concept (a real cross-device jam on your piano), three attacks on **signaling × renderer** — shareable-link + three.js (won), copy-paste-codes + WebGL2, room-code + WebGPU. The decisive axis was *which one actually connects two real phones.*

## Banked, ready to resurrect (IDEAS §473)
- **`730-piano-room-jam`** ⭐ — the friendliest version (join by typing a 4-letter **room code**) on the scarcest renderer (WebGPU). It only lost because its serverless relay can't survive Vercel's multi-instance routing. **It becomes the real magic the moment you approve a Vercel KV / Upstash dependency** (a `package.json` change only you can make per the scope fence) — see the open question.
- **`728-piano-relay-jam`** ⭐ — the purest zero-server handshake (copy-paste two codes) on a scarcer renderer (WebGL2). Next step: graft its field onto 729's shareable-link flow.

## Open questions for Karel
- **Approve a `package.json` dep (Vercel KV or Upstash Redis)?** That's the one thing that turns `730-piano-room-jam` from "best UX but can't connect on Vercel" into frictionless room-code cross-device jamming. I can't touch `package.json` (scope fence) — your call.
- On two real phones over the same Wi-Fi, does the portal link connect and does the duet feel tight? (Compile-verified only; not link-tested in the sandbox.)
- Next is **kids** (474). Strong resurrect candidates: `726-kids-star-scoop` ⭐ (bare-hands → 3D star-scoop) or `725-kids-aurora-sail` (tilt → aurora). Preference?
