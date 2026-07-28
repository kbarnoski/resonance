# Morning digest — last updated 2026-07-28 (cycle 937, WIDE)

**Open this first:** [/dream/3448-aura](https://getresonance.vercel.app/dream/3448-aura) — **your silhouette becomes a glowing aura, and the *shape* of you makes the sound.** Stand in front of the camera: the piece keeps only your **outline** (the raw video is never shown or stored — privacy-forward by design) and reads a few shape numbers — how much you fill the frame, how ragged/reaching your outline is, how high you climb. Stand tall and gathered → the tone darkens and settles; open out and reach up → it brightens and lifts, and a golden-spiral bloom breathes around you. Not your motion, not your pitch — your *shape*, hummed back. No score, no win, no fail. No camera? A breathing synthetic figure stands in so it plays anyway.

## New since yesterday
- **`3448-aura`** — the loved **camera/body** lane (verdict-07-28 #4), but a technique the lab has never used: **silhouette *shape* → sound** (area → fullness, outline complexity → brightness, reach → a continuous gliding pitch that never snaps to a scale). Rendered on the **rarest output** (raw WebGL2 shader), which keeps the output mix healthy rather than piling onto Canvas2D or three.js. Photosensitive-safe (≤0.11 Hz drift, no strobe). Refs: Krueger's *Videoplace* (1974), Rozin's mirrors, *Fluid Body* (CHI 2026).

## Explored tonight, banked (see IDEAS §937)
- **`3456-heliochoir`** ⭐⭐ — **the real weather of the Sun, right now, sung.** Live NOAA space-weather (solar-wind speed/density, magnetic Bz, Kp) → a slow cosmic choir + a violet aurora you just witness. The freshest concept and the direct cash of tonight's research (Helioradar AV, Feb 2026). **Held only because I couldn't verify the live data feed from inside the agent's sandbox** — the NOAA endpoints are public + CORS-open and should work in your browser; ship it once you confirm the readout says "live." Would love a go on this one.
- **`3464-bowl`** ⭐⭐ — hold your **phone like a shallow bowl of light**; tilt to pour a luminous fluid that sloshes and pools, its motion singing. The only motion-sensor/tilt piece — delightful on a phone. Ship-ready; held only as the lightest-concept of the three.

## Why this shape
Ledger said WIDE (last two nights were DEEP), so I raced **three unrelated no-stakes directions** across three different sensors (camera / live-data / tilt) and three different outputs (WebGL2 / Canvas2D / SVG) — directly attacking "too similar." Shipped the highest-ambition, best-verified, output-diversifying one; banked the other two as ready-to-ship.

## Open questions for Karel
- **AI-pipeline chain (music→image→video)** — now the **7th+ jury deferral**, the single most novel unbuilt thing in the lab. It spends your `FAL_KEY`, so it needs one word from you: *"go, cap $X/run."*
- **`3456-heliochoir`** — want me to ship the live-solar-wind choir? (I just need you to confirm the NOAA feed reads "live" on your device, or I'll harden the fetch.)
- `3144-latency`'s two-phone WebRTC path still needs a **second-device** verify from your phone.
