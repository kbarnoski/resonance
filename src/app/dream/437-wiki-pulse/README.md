# 437 — Wiki-Pulse

**The question:** What does the entire planet's live editing of human knowledge sound like — right now, this second?

**Tags:** INPUT=live-SSE/API · OUTPUT=three.js · TECHNIQUE=live data-stream sonification · VIBE=clinical/refuse-to-resolve

---

## How It Works

This piece connects to the **Wikimedia EventStreams `recentchange` SSE firehose** — a public, key-less, CORS-enabled stream of every edit to every Wikipedia, Wikidata, and Commons page in real time:

```
https://stream.wikimedia.org/v2/stream/recentchange
```

Each event is parsed as JSON and routed through both a Web Audio sonification engine and a three.js visual engine simultaneously.

---

## Field → Sound Mappings

| Field | Sound behavior |
|---|---|
| `bot = false`, `namespace = 0` | Warm triangle-oscillator pluck with pitch glide |
| `bot = true` | Dry cold click: bandpass-filtered white noise burst, high-frequency, ~35ms |
| `length.new - length.old > 0` (addition) | Upward pitch glide on the pluck (homage to Hatnote bells) |
| `length.new - length.old < 0` (removal) | Downward pitch fall, softer timbre (homage to Hatnote strings) |
| `|byteDelta| < 200` | High register, quiet |
| `|byteDelta| 200–2000` | Mid register |
| `|byteDelta| > 2000` | Low register, louder |
| `type = "new"` | Brief two-oscillator chord stab (accent) |
| `type = "log"` | Low soft sine thud (background bureaucracy) |
| `type = "categorize"` | Very quiet ultra-high tick |

**Voice cap:** max 8 concurrent audio voices. Overflow events are silently dropped to prevent browser overload.

**Anti-resolution:** Arrivals are aperiodic — no quantized rhythm, no chord, no arc. Pitch set is minor-pentatonic-derived but voices never coincide into consonance. The piece refuses to resolve.

**Master chain:** all voices → `DynamicsCompressor` (limiter, threshold −8 dBFS) → `GainNode` → destination. iOS-safe: `AudioContext` created inside the tap-to-start user gesture.

---

## Field → Visual Mappings (three.js)

| Field | Visual behavior |
|---|---|
| `wiki` | X-axis position (enwiki far left, wikidata far right) |
| `byteDelta` | Y-axis position (additions above, removals below center) |
| `bot` | Color: amber/orange (bots) vs cyan/teal (humans) |
| `type = "new"` | Magenta point |
| `type = "log"` | Muted grey-green |
| `type = "categorize"` | Violet |
| `|byteDelta|` | Point size ∝ log(|delta|+1) |

3D field rendered with `THREE.Points` + custom GLSL shader for per-point alpha and soft circular glow. Additive blending — overlapping points bloom into white, showing density. Particles live ~3–4 seconds with fade-in/out. Max 600 particles in a fixed circular buffer (no mid-run allocation). Camera drifts gently for a data-observatory feel.

---

## Live vs Demo Fallback

The browser connects to the SSE endpoint immediately after tap-to-start. If the stream:
- fails to deliver a first message within **4 seconds**, or
- fires an `error` event

...the piece falls back to a **synthetic event generator** (setInterval, ~10 events/sec, ~12% bot rate, realistic byte-delta distribution). The fallback uses the identical `spawnSound` / `spawnParticle` code path so the piece is indistinguishable in motion.

Status line (bottom-left): `◉ live stream` (green) or `◉ demo stream (live feed unavailable)` (amber).

---

## Named References

**Hatnote "Listen to Wikipedia"** (Stephen LaPorte & Mahmoud Hashemi, 2013)  
The canonical live-Wikipedia sonification: bells for additions, strings for removals, pitch proportional to edit size. Wiki-Pulse uses the same up/down glide metaphor but replaces warm tones with a harder, data-clinical timbre to foreground the machine-vs-human texture of the firehose.

**Ryoji Ikeda "data-cosm [n°1]"** (180 Studios, on view through Feb 2026)  
Clinical glowing-point-field aesthetic on black — the direct visual ancestor of this piece. The data-cosm lineage prioritizes legibility and density over beauty.

---

## Lab Novelty

The Resonance lab has previously sonified seismic data (418-seismic-pulse), solar-wind / aurora-adjacent streams, and generative physics simulations. **Wiki-Pulse is the first piece in the lab to sonify a live human-activity stream** — every event is a person (or bot) touching a shared text right now, somewhere on Earth. The bot/human distinction adds a layer no prior piece in the lab has explored: you are literally hearing the machine tide running under the human one.

---

## What Is Unverified

The build sandbox has no network access, no audio hardware, and no GPU. The following are unconfirmed:

- Whether the live SSE feed actually connects from the reviewer's network.
- Whether the real firehose density (~8–30 events/sec at peak) sounds comfortable at the 8-voice cap.
- Whether the three.js point field renders at 60 fps on a mid-range phone.
- The exact audible bot/human ratio in the real firehose (expected ~12% bots based on public statistics).
- Whether the additive-blending bloom looks right on OLED vs LCD screens.
