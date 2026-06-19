# 760 · Wiki Carillon

**Route:** `/dream/760-wiki-carillon`

## What it is

> *What does the world sound like as it writes itself?*

A bright civic carillon driven by the **live, public stream of Wikipedia edits**.
Every edit anywhere on Wikimedia rings a struck bell over a pale "atlas" field:

- **Edit size → pitch & decay.** Big edits ring low and long; small tweaks ring
  bright and short. Pitches snap to a warm major-pentatonic scale so nothing
  sounds wrong.
- **Each wiki keeps its place.** Stereo pan and a vertical band are hashed from
  the edit's domain, so `en.wikipedia.org` always lands in the same spot.
- **A brand-new / anonymous editor → a soft swell** pad under the bell (violet bloom).
- **A bot edit → a muted woodblock** instead of a bell (grey bloom).

Edits accrete into an ever-shifting, never-repeating composition. This is
real-world **data sonification** — music *about* the world's collective writing,
not about music.

## How it works

- **Input — live external SSE.** `feed.ts` opens the keyless, CORS-enabled
  Wikimedia EventStreams `recentchange` feed:
  `new EventSource("https://stream.wikimedia.org/v2/stream/recentchange")`.
  Each `message` is parsed as JSON; we use `type`, `wiki`, `meta.domain`,
  `title`, `length.new - length.old` (edit magnitude), `bot`, and a `user`
  heuristic for new/anonymous editors. The feed is read **directly client-side**
  — there is **no API route**, and nothing is sent or stored.
- **Output — Canvas2D bloom field.** `page.tsx` draws a pale parchment ground
  with a faint atlas grid; each rung edit places an expanding ink/gold/violet
  ring sized by edit magnitude. Pure Canvas2D `2d` context — **no WebGL/WebGPU,
  no shaders**.
- **Audio — FM bells, synthesized.** `audio.ts` builds an FM bell voice (carrier
  + inharmonic modulator + a gold upper partial), a dry bandpass woodblock for
  bots, and a slow additive swell for new editors. A kind master chain runs
  `master gain ≤0.3 → lowpass ≤8kHz → DynamicsCompressor(-12, ~12:1) →
  destination`, with an always-on open-fifth drone bed so silence between edits
  still has a floor. A **voice cap (14)** and **refractory (~55ms)** keep a flood
  from blowing up the polyphony.
- **Musical throttle.** Incoming edits are queued (cap 8, drop oldest) and rung
  at most ~6/sec, so a busy stream stays musical instead of turning to noise.

## Offline fallback design (important)

The build container and many review devices block the SSE. `feed.ts` abstracts
the source: it tries the real `EventSource`, but if it errors, fails to connect
within ~3s, or `EventSource` is unavailable, it **transparently switches to a
synthetic edit generator** — Poisson-ish timing and randomized realistic edit
objects (random wiki from a small list, heavy-tailed sizes, occasional
bot/new-user). The piece therefore **always rings and blooms**. An honest status
badge shows **`live: en.wikipedia + 40 wikis`** (emerald) vs
**`demo stream (offline)`** (amber).

## Controls

- **Ring the carillon** — start gate; creates + resumes the `AudioContext` on the
  user gesture (iOS), connects the feed, and auto-runs.
- **Read the design notes** — toggles an in-page notes panel.

## Tags

- **INPUT:** live external web event-stream (Wikimedia EventStreams SSE).
- **OUTPUT:** Canvas2D bloom field over a light/bright ground.
- **TECHNIQUE:** live external-API SSE data sonification → generative bell ensemble.
- **VIBE:** civic / atlas / bright daylight (parchment, ink-and-gold).

## Named references

- Hatnote — *Listen to Wikipedia* (Stephen LaPorte & Mahmoud Hashemi)
- Brian Eno — generative ambient
- KLING KLANG KLONG — *Sounds of the Unseen*

## Self-assessment

The mapping is honest and legible — edit size genuinely drives pitch/decay, wiki
identity drives position, and the bot/new-user variants are audibly and visually
distinct — and the offline fallback means it always performs, which is the right
call for a stream-dependent piece. The main limitation is that the synthetic demo
stream can only approximate the strange, lumpy texture of the real firehose
(real Wikipedia has bursts, vandalism reverts, and language-time-zone rhythms a
random generator won't capture), and the FM bells, while warm, are a single
timbre family rather than a true carillon of distinct cast bells. Given more time
I'd add a few bell registers per octave band and a gentle reverb tail for more
cathedral space.
