# Morning digest — last updated 2026-07-26 (cycle 915, WIDE)

## New since yesterday
- **`2952-tabla`** → https://getresonance.vercel.app/dream/2952-tabla — **strike a real drumhead with your fingers, then PRESS into it to bend the note up mid-ring.** The sound is a genuine **2-D digital waveguide MESH membrane** (the lab's first — everything before was 1-D strings), solved at audio rate: every tap sends real waves radiating out, reflecting off the round rim into the drum's modes. Nothing is sampled. *Why open this:* it's the most *physical* "hand on the instrument" yet — no voice, no score, no listening machine, just a vibrating body you touch. **Press-and-hold bends the pitch up** the way a tabla player slides the heel of their hand across the head (the *ga* stroke); strike the **rim** for a bright *na*, the **centre** for a deep *ge*. You **see the wave you hear** — the canvas shades the membrane's real displacement. Hit **Start**, or watch the seeded player run a *theka* on load.
- Went **WIDE**: a deliberate pivot off the last two nights' **voice-follower** pieces (913/914 were both "sing and be accompanied" — a forming rut). Raced **3 direct-manipulation tactile instruments** — a 2-D membrane drum, a bowed string, an MPE touch surface — all hand-on-the-instrument, none using the mic. Shipped the freshest; **2 more explored — see IDEAS §915.**

## In progress / partial
- Nothing half-built. One clean ship + two banked seeds (both built demoable + build-verified this cycle).

## Research findings worth a look (RESEARCH §915)
- **The 2-D digital waveguide mesh (Van Duyne & Smith 1993) is still "small-mesh-only" in real time** — which is exactly why a browser drumhead with a *press-to-bend* stroke was unbuilt and feasible. `2952-tabla` is a 42×42 mesh in an AudioWorklet; the *ga* pitch-bend is a local tension (`c²`) field you raise under your finger.
- Banked **`2944-bowfield`** ⭐⭐ (HIGH — top next ship) — **bow a string with your hand** and it catches/sings/scratches like real rosin, a genuine **stick-slip friction physical model** (McIntyre–Schumacher–Woodhouse 1983), not a sample. First bowed-string model in the lab; the counterpart to the tabla's membrane. Build-clean this cycle.
- Banked **`2936-seaboard`** ⭐ — a ROLI-Seaboard/Osmose multi-touch surface where each finger bends/swells/recolors its own note independently (three.js petal field). First MPE instrument; playable with no hardware.

## Open questions for Karel
- **Does `2952-tabla` sound like a drum on your device?** I can't hear it here (headless). Does the strike *ring* and does the press audibly *bend the pitch up*? The tuning (fundamental ~410 Hz, ring time, press-glide feel) is hand-estimated and wants your ear.
- **Physical instruments are a rich seam now** — this cycle opened the tactile / physical-modeling corner deliberately (membrane + bowed string + MPE surface). Want me to keep building playable instruments (bowed string next), or fold them toward your actual product (an expressive controller for a pianist)?
- **AI-pipeline chains (music→image→video) are still 0× — the FIFTH+ jury flagging it.** It spends your FAL_KEY budget, so it needs your explicit go-ahead + a per-run cap. One word unblocks it.
