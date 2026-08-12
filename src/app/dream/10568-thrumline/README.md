# 10568 · Thrumline — a planetary carillon

## The one question

**What if the world's live activity — every edit being made to every Wikipedia
on Earth, right now — were a planetary carillon you could hear and re-perform?**

## Live data source (+ fallback)

- **Input:** the public, CORS-open, keyless **Wikimedia recent-changes
  EventStream** — `https://stream.wikimedia.org/v2/stream/recentchange` — a
  Server-Sent Events feed, opened client-side with the browser `EventSource`
  API. Each message is a JSON `recentchange`; we read `type`, `wiki`, `title`,
  `bot`, and `length.{old,new}` (`new − old` is the edit magnitude in bytes).
- **Fallback (mandatory):** if `EventSource` errors or never delivers a message
  within ~2.5 seconds, the piece switches to a **seeded synthetic stream** driven
  by `mulberry32(0x10568)` — fully deterministic, no `Math.random`, no network —
  that emits plausible fake edits so the carillon is alive within ~1 second. It
  is badged **"offline — simulated stream"** in `text-destructive`.
- The whole piece reads on a **muted phone**: the SVG clock rotates and bells
  bloom regardless of audio. Audio is deferred to the first **Start** tap per
  browser autoplay policy. All timing is driven by `performance.now()`; no
  `Date.now()` / `new Date()` anywhere.

## The mapping (edit → bell)

Each incoming edit is a **struck bell** placed on a rotating **90-second
clock-face**:

- **angle** — the edit's arrival time within the current 90 s sweep. A slow
  sweep-hand marks "now".
- **radius** — the edit's byte-magnitude (log-scaled); a bigger edit rides the
  **outer ring**.
- **hue** — the language/wiki mapped onto the **violet → indigo → slate ramp
  only** (no off-brand art hues).
- **timbre** — human vs `bot` edits use two distinct **inharmonic bell voices**
  (partial ratios `1 : 2.76 : 5.40 : 8.93`, fast-decaying envelopes ≤ 0.45 s, no
  sustained drone). Magnitude sets pitch depth (bigger edit → lower/deeper);
  language sets stereo pan.
- **bloom** — each bell is an expanding, fading SVG `<circle>`/`<g>` that plucks
  its voice as it is born. Visible bells are capped (≤ 120) and recycled.

## Re-performable

The last **90 seconds** are held as a rolling ring buffer — the faint dots on
the face are that score. **Drag the sweep-hand backward** and the bells the hand
crosses re-sound. The live feed writes a score; your hand re-performs it. This is
the instrument verb.

## Rendering & audio

- **Output is SVG-DOM only** — clock, graticule, sweep-hand, and every bell are
  real inline SVG elements animated via `requestAnimationFrame`. **No canvas, no
  WebGL.**
- **Audio** is Web Audio, routed entirely through the shared safe master
  (`createSafeMaster`) via a modest 0.15 bus — never to `ctx.destination`
  directly. Full teardown on unmount (cancel rAF, close the `EventSource`, close
  the `AudioContext`).

## Named reference

**Hatnote — *Listen to Wikipedia*, Stephen LaPorte & Mahmoud Hashemi, 2013** —
the work that first turned the Wikimedia edit feed into bells and swells. This is
its clock-face, re-performable descendant.

## Ambition tags

`input: live-data · output: SVG-DOM · technique: live-external-data sonification ·
palette: slate+violet · named ref: Hatnote Listen to Wikipedia 2013`
