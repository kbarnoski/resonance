# Worldwire

**Route:** `/dream/2474-worldwire`

The whole world editing its shared encyclopedia, right now, rendered as a field of just-intoned bells — a live sonification of the global Wikimedia recent-changes stream.

## The one question

> "What does the whole world editing its shared encyclopedia, right now, sound like?"

You do not play Worldwire. The world does. Every edit anywhere on Earth strikes a bell; you only shape the listening (which wiki, bots audible or hidden).

## Data source

Wikimedia **EventStreams** — the public, keyless, CORS-open Server-Sent-Events feed at `https://stream.wikimedia.org/v2/stream/recentchange`, opened directly from the client with the browser `EventSource` API (no API route, no library, no side effects — we only read a public stream). Each frame is JSON: `type` (`edit`/`new`/`log`/`categorize`), `wiki`, `title`, `bot`, `length.old`/`length.new`.

## Design notes

### Mapping

- **edit → a struck bell.** Pitch is **inversely proportional to edit size** (`|length.new − length.old|` bytes): a huge edit rings LOW, a one-byte tweak rings HIGH. Compressed with a log so the enormous dynamic range of real edits reads musically.
- **new article → a warm sustained swell** an octave down (a rarer, richer event — triangle + saw pad, a fifth stacked, gently detuned, with a slow filter open).
- **bot edit → a duller, quieter bell** — a lowpass "cloth over the bell" and fewer partials. Fully filterable with the **Bots audible / hidden** toggle.
- Polyphony is capped at **16 voices** (voice-stealing past that) and the master bus runs through a `DynamicsCompressor` limiter, so a burst of edits never clips or gets harsh. A short filtered feedback delay keeps the field alive between strikes.

### The just-intonation scale

Every bell snaps to a strict **7-limit just-intonation** lattice built from exact frequency ratios above a low tonic (~C2):

```
1/1   9/8   5/4   3/2   5/3      (major pentatonic, just)
```

repeated across five octaves. Because the ratios are pure small integers, any set of simultaneous bells stays consonant no matter how chaotic the world's editing is. This is the main musical departure from equal-tempered predecessors.

### Hash-to-position layout

Each event blooms a growing ripple on the dark field. Radius tracks edit size; **position is a stable FNV-style hash of the article title**, so the same article always lands in the same spot — recurring edits to a hot page pulse in one place. Blooms fade over a few seconds with a trailing-fade canvas (soft comet tails). Colour stays in the brand violet family: new articles brightest, human edits mid, bots dim and desaturated. The biggest few live blooms are labelled with their (truncated) title. A quiet mono readout tracks edits/sec, wikis seen, and total heard.

## Graceful degradation & self-demo

- The `AudioContext` is created only after the **Start listening** gesture (autoplay policy).
- If the EventStream cannot connect — offline, blocked, or CORS — within a 7s window, or errors before ever opening, Worldwire falls back to a **deterministic synthetic generator** (seeded mulberry32, Poisson-ish exponential inter-arrivals, heavy-tailed edit sizes) that emits plausible fake edits. The piece is therefore always alive and fully demoable with **zero network**, and the synthetic stream doubles as the idle self-demo.
- A small on-brand badge shows **live feed** vs **demo stream (feed unavailable)** vs **connecting…**.
- If Web Audio is unavailable, nothing throws — an on-brand `text-destructive` notice replaces the start button.

## Named reference

A Resonance-grade descendant of Hatnote's **"Listen to Wikipedia"** (Stephen LaPorte & Mahmoud Hashemi, 2013 — [listen.hatnote.com](https://listen.hatnote.com)), which pioneered bells for edits, strings for new articles, and pitch inversely proportional to edit size.

**How Worldwire differs:** a strict 7-limit just-intonation lattice (rather than a diatonic/pentatonic ET palette), a Resonance ripple-field visual with title-hash placement and comet-tail fades, bot/human/new timbral and colour separation, and a deterministic offline synthetic fallback so it always runs.

This is an **outward-facing, real-world-data** piece: it is about the world — thousands of anonymous hands editing a shared encyclopedia — not about the visitor's own consciousness.
