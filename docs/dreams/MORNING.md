# Morning digest — last updated 2026-07-01 (~12:40 UTC, cycle 622)

> **The one thing this fire did:** built the lab's **first live space-weather
> instrument** — a piece driven by the *actual solar wind hitting Earth right now.*
> It pulls NOAA's real-time-solar-wind JSON (DSCOVR/ACE + NASA's new-in-2026 IMAP
> I-ALiRT sentinel) and turns speed / density / interplanetary Bz / Kp into BOTH a
> vast folding three.js auroral sheet AND a matched sound. Verified fetching live
> 200-OK data this cycle; still builds a full modeled storm offline.

## Open this first
- **[1084-magnetostorm](https://getresonance.vercel.app/dream/1084-magnetostorm)** — *what does the solar wind actually hitting Earth right now sound and look like?* Tap **Start**. ~42k GPU particles form seven vertical **auroral curtains** advected by a data-driven flow; a live panel shows the real numbers (speed / density / Bz / Kp + timestamp + a **live/offline** badge). The dramatic variable is real physics: when the interplanetary **Bz turns south** — the orientation that actually couples the wind into the magnetosphere — the storm **erupts**: curtains brighten and redden from quiet green/teal to storm magenta, the audio opens, a substorm **sub-boom** fires. Re-polls every 60 s; when the feed is blocked it swaps to a bundled modeled G2 storm so the whole arc still plays. `state: geomagnetic-storm / auroral-substorm · pole: intense → auroral storm-awe`.

## Why this one, and why now
Direct **today's-research → today's-build** chain: RESEARCH §622 found that as of 2026 NASA's IMAP I-ALiRT telemetry joined NOAA's *public* real-time stream, and June 2026 logged real G1–G3 storms — so the live solar wind is now a playable substrate. It dodges every diversity ban (three.js not Canvas2D, live-data not pointer-drag, storm-awe not the banned cosmic-ambient bloom), fills the thin **real-world-data** lane with a fresh substrate distinct from the lab's only prior (`1070-deep-tremor`, USGS earthquakes), and sits in Karel's loved aurora/particle/spatial cluster — while being **zero-permission and live-fetch-verified**, denting the jury's #1 verification liability.

## Also explored + banked this fire (WIDE — 3 orthogonal explorers, 2 banked ⭐ IDEAS §622)
- **1083-lightning-organ** ⭐ *(top resurrection candidate)* — your two hands are electrodes; MediaPipe hand-tracking → a **dielectric-breakdown / Laplacian-growth** lightning that forks between them, every branch ringing a note. The *electric* pole the lab has never shipped, and embodied. Built + type/lint-clean; needs a webcam to shine.
- **1085-veil-room** ⭐ — a real **WebRTC multi-user** shared psychedelic room (copy-paste-SDP, no server); several people's tapped rhythms Kuramoto-lock a single coherent field. Cashes the jury's named "multi-user room" gap — banked because it'd be the lab's *third* Kuramoto piece in ~5 cycles.

## Honest caveats
- **Built green.** Authoritative winner-only `npm run build` → `✓ Compiled successfully` + ESLint + full-project `tsc --noEmit` all PASS (reached `Collecting page data`); scoped lint on the 1084 folder = **0/0**; build-log grep of the slug in errors = **0**. Only the standing container **EMFILE** fd-ceiling stops static-gen (infra, Vercel-safe).
- **Strong verification posture:** three.js + Web Audio, no mic/cam/permissions — and the live NOAA fetch was confirmed **200-OK, well-formed** from the build box this cycle, with the modeled-storm fallback running regardless. The GPU aurora look + storm-swell audio feel are the device-only part.

## Open questions for Karel
- **The embodied pattern:** for two fires running (620, 622) the lab *explored* embodied/hand-tracking and *shipped* the zero-permission piece (genuinely the more robust 06:30 review). `1083-lightning-organ` is banked, one fire from demoable — want me to **DEEP it next cycle** to finally land an embodied ship, even though it needs a webcam?
- **Still open (needs you):** raise the container's ~4096 fd-ceiling (or bless `next build --experimental-build-mode compile`) so the full build finishes locally and the GPU/embodied pieces finally get hardware-verified.
