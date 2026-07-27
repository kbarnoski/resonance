# Morning digest — last updated 2026-07-27 (cycle 925, DEEP)

> **No fresh jury today** (923 consumed JURY-2026-07-27; its findings still stand as the audit — *get off the WebGL fragment shader, raise the bar from dial to decision, ban a fresh altered-state, and build a second multi-user piece*). Tonight cashed the jury's standing **multi-user #5** ask and the ⭐⭐ banked `3144-latency` I floated to you last night: a **DEEP** fan of three attacks on ONE idea → shipped the strongest.

Open the lab: https://getresonance.vercel.app/dream

## New since yesterday
- **[3144-latency](/dream/3144-latency)** — **two players turn the network lag between them into a musical CANON.** A Canvas2D rhythm wheel measures the round-trip delay, snaps it to a beat subdivision, and draws the gap between a note and its delayed echo as the canon interval. The lab's **second real multi-user piece** (first since `2912-ensemble`) and its first *latency-as-material* instrument — the round-trip stops being a defect and becomes the counterpoint.
  - **Try it (solo, no second device):** press **Start** — a seeded partner is already playing a two-voice canon on the wheel. Tap the wheel or hit any key to add your notes; tap **ON** a tick and note+echo interlock, tap **between** ticks and the figure frays. Drag the **latency slider** (40–320 ms) and watch a faint "ghost" show the raw lag getting *snapped* onto the grid. **The decision is rhythmic — when you tap can be wrong.** *Headphones help.*
  - **Two phones (opt-in):** "Invite a partner" → manual SDP copy-paste, no server. Real device-to-device canon.

## Also explored tonight (2 more — banked, IDEAS §925)
- **3160-relay** ⭐⭐ — latency as **visible travel**: each note launches a pulse that physically crosses to the other player, so the lag *is* the journey time. The strongest "aha, that's what latency is" — the natural companion to the wheel (or a render-mode of it).
- **3168-lockstep** ⭐⭐ — a **losable phase-lock game**: steer the lag-induced phase offset onto a subdivision and *hold* the canon lock while your partner keeps drifting. The purest dial→decision — held only because its audio needs a tighter scheduler first.

## Open questions for Karel
- **The two-phone canon needs your devices.** Solo loopback is fully playable and reads as a canon, but whether the *real* peer-to-peer version survives NAT/STUN and whether "off-grid frays" feels like *stakes* vs. just *sloppy* wants two real phones. Want me to build a **QR-SDP handshake helper** so any multi-user piece self-demos across two phones?
- **AI-pipeline chains (music→image→video) still 0×** — flagged by 5+ juries, ~13 cycles overdue. The single most novel unbuilt thing, but it spends your FAL_KEY budget, so I won't start it autonomously. **One word ("go, cap $X/run") unblocks it.**

## Housekeeping
- Winner-only compile build passed EXIT 0 (the container's hard 4096-fd cap still blocks a full-route local `npm run build` — infra, confirmed un-raisable; Vercel deploys the full pipeline fine). Zero new npm deps; no api route (pure browser WebRTC). Losers banked as text, never committed.
- **Ledger note:** cycles 923 & 924 committed fine but forgot to prepend to STATE.md — I added a note there and kept 925 honest.
