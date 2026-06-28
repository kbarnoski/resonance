# Wiki Bells (1024)

**Route:** `/dream/1024-wiki-bells`

## The one question

> What does the whole world thinking out loud sound like — every Wikipedia
> edit, anywhere on Earth, this very second, struck as a bell?

A **live, real-world-data sonification**. It is **non-pointer**: a pure global
data stream plays on its own; the visitor never aims or targets anything. You
only **shape the listening** — which language wikis you hear, whether bot edits
ring, the overall density. The world's collective editing is the instrument.

## Named reference / credit

A Resonance-flavored, harmonically richer descendant of **Hatnote's
"Listen to Wikipedia"** by **Stephen LaPorte & Mahmoud Hashemi (2013)** — the
project that first turned the Wikipedia recent-changes feed into bells for edits
and swells for new users. This piece keeps that spirit and pushes the synthesis
toward inharmonic bell/tongue-drum voices over a slowly drifting modal scale.
Full credit and thanks to the original authors.

## Subsystems (4 — clears the ≥3 bar)

1. **SSE stream ingestion + filter + throttle.** A browser `EventSource` on the
   keyless, CORS-open Wikimedia EventStreams feed
   (`https://stream.wikimedia.org/v2/stream/recentchange`). No server route, no
   api-guard — the feed is CORS-open. Each JSON message is parsed, classified
   (edit / new article / new user via `log_type=newusers`), language-tagged, and
   pushed into a bounded pending queue. An audible heartbeat fires at most one
   strike per ~135ms, choosing the **most significant** pending event when the
   stream floods, so a busy day never becomes noise.
2. **Inharmonic bell / tongue-drum synth.** Each strike is additive: a few
   detuned sine partials at metallic ratios (`1, 2.01, 2.71, 3.93, 5.18`) with
   exponential decay. Voice-capped at **12** (oldest voice stolen on overflow),
   modest master gain, gentle feedback-delay tail, compressor on the bus.
3. **Drifting modal scale.** Pitches snap to a pentatonic / Dorian lattice that
   re-seeds its tonic and scale family every ~30s, walking through a set of warm
   modes — so minute 5 never sounds like minute 1.
4. **Canvas2D bloom viz.** One expanding ring/glyph per audible event on a deep
   near-black field; additive (`lighter`) soft glow. No WebGL fragment-shader
   raster.

## Event → sound mapping

| Event property                | Sound / visual result                                       |
| ----------------------------- | ----------------------------------------------------------- |
| byte-delta magnitude (log)    | pitch: big change → low, weighty bell; small copyedit → high tinkle. Also ring size + decay length. |
| `type = "edit"`               | struck metallic bell, warm **gold** ring (pale ivory if a removal). |
| `type = "new"` (new article)  | warm swelling **violet** chime — slow attack, longer decay, triangle partials, larger ring. |
| new user (`log/newusers`)     | rising **mint** sparkle — high, short, with an upward pitch glide. |
| `bot = true`                  | woodier, quieter voice (fewer/closer partials); mutable on/off in the UI. |
| wiki language                 | subtle deterministic stereo **pan** and horizontal screen position. |
| scale state (drifts ~30s)     | every pitch is snapped to the current drifting modal lattice. |

## Synthetic fallback behavior (mandatory, zero-network)

If `EventSource` is missing, throws, errors before first message, or sends no
message within 6s, the piece switches to a **built-in synthetic generator**:
Poisson-ish arrivals (exponential inter-event gaps, occasional small bursts),
varied byte-deltas (mostly small copyedits, sometimes large additions/removals),
~6% new users, ~12% new articles, ~45% bots. It looks and sounds identical and
shows the notice **"simulated edit stream — live feed unavailable"** in
`text-amber-300/95`. The AudioContext is created and resumed on the first click
("Listen to the world edit"), satisfying the autoplay gesture requirement.

## Ambition criteria hit

- **Named reference:** Hatnote's "Listen to Wikipedia" (cited above).
- **≥3 distinct subsystems:** 4 — SSE ingest/filter, inharmonic bell synth,
  drifting modal-scale state, Canvas2D bloom viz.
- **Varies the human↔sound relationship:** non-pointer / instrument — the global
  edit stream plays itself; the human shapes *what is heard* (language filter,
  bot mute), not *what is struck*.
