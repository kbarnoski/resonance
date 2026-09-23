# 17792-scriptorium

The live, worldwide stream of Wikipedia edits conducts one of Karel's real piano takes — each edit sounds a grain of his recording, and drifts up as a warm glyph of the article being written.

**Status:** demoable

## The one question

What if the live, worldwide stream of Wikipedia edits happening RIGHT NOW — every person, in every language, editing the encyclopedia this second — conducted one of Karel's real piano takes, each edit sounding a grain of his recording?

This DEEPENS Hatnote's *Listen to Wikipedia* (Stephen LaPorte & Mahmoud Hashemi, 2013, listen.hatnote.com), which sonified the same `recentchange` edit feed with synthesized bells. Here the synth is gone: every edit instead plays a GRAIN — a short slice of Karel's real recorded piano (concatenative granular scrub) — and the feed is rendered as a living 3D typographic constellation.

## The feed + the cold-demo design

- **Live source:** Wikimedia EventStreams `recentchange` via the browser's native `EventSource` (`https://stream.wikimedia.org/v2/stream/recentchange`) — keyless, CORS-open. Each message is one edit: its `wiki`/language, `namespace`, `title`, `user`, `bot`, `minor`, byte-`length` delta, `type`, `server_name`/`meta.domain`. All string fields are treated as UNTRUSTED external text: they are only ever rendered as plain text (React text nodes / canvas `fillText`, never HTML) and titles are truncated to ~40 chars.
- **Cold demo:** a bundled synthetic generator emits realistic recentchange-shaped events with NO network — a realistic wiki mix (en/de/fr/es/ja/ru.wikipedia + commons + wikidata), byte-deltas both signs (a few bytes to a few thousand), ~15% bot, ~10% minor, type weights edit > new > categorize > log, cadence ~2–8 events/sec jittered. This drives the visual field BEFORE the user taps Begin, and is the automatic fallback if `EventSource` errors or is blocked.
- **Status line (always visible):** `demo · sample stream (not live)` on the synthetic source, `live · stream.wikimedia.org` (foreground) once the real stream delivers its first event, and the demo label in `text-destructive` if the live feed errors out and we fall back. The demo is never presented as live.
- The visual + a first grain are legible/audible within ~1s of Begin because the demo source is already running.

## The sonification mapping (absolute rule 10)

One of Karel's real takes (default **Bath**) is decoded into an `AudioBuffer`. Every edit triggers a grain = an `AudioBufferSourceNode` reading a short slice of that buffer, through one `createSafeMaster`:

- **byte-delta magnitude → register + length** (log-scaled): a big edit is lower and longer, a tiny edit higher and shorter, via `playbackRate` + grain duration.
- **language/wiki → which region of the take the grain reads + stereo pan** (`StereoPannerNode`), so each language sings from its own phrase and its own place.
- **human vs bot → foreground vs background:** human grains are the warm foreground bus; bot grains route through a lowpass into a quieter background bus (dim ghost-grains).
- **edit type → grain length/envelope:** `new` pages swell fuller, `log` actions are short marks; every grain has a short attack + release gain envelope to avoid clicks.
- A very quiet continuous loop of the take (played at half speed) runs underneath so the piece is musical, not merely pointillist.
- Polyphony is capped at 24 concurrent grains, so a burst of edits can't overload. Every audible node is a slice of Karel's decoded real recording — zero synthesis (no oscillators, noise, or generated tones).

## The three.js visual

A living 3D typographic constellation in a warm-ink space (near-black warm background, amber→violet accents). Each edit spawns a title glyph (a pooled canvas-text sprite) that rises and fades over a few seconds:

- **hue → language** (kept in the warm amber→rose→violet band; no cold blue/green),
- **size → byte-delta**,
- **humans glow bright, bots drift as dim ghosts**,
- a faint warm dust field for depth, a slow camera drift, and overall bloom that pulses with `master.analyser`.

Glyph sprites are a fixed pool (72) with reused canvas textures, so a burst is bounded. No film grain.

## How it degrades

- **No network / blocked stream:** the synthetic generator carries the piece; status line flips to the demo label (destructive on a live-feed error).
- **No WebGL:** the constellation is hidden and a graceful notice plus a live scrolling DOM list of the current edits stands in, while the audio keeps playing.
- **No Web Audio:** the constellation still runs and the feed still shows; a caption states audio is unavailable.
- **prefers-reduced-motion:** the camera drift is calmed.
- Full cleanup on unmount: EventSource closed, demo timer cleared, AudioContext closed, all three.js geometries/materials/textures disposed, grain nodes self-disconnect on `onended`.

## Reference

Hatnote — *Listen to Wikipedia* (Stephen LaPorte & Mahmoud Hashemi, 2013, listen.hatnote.com): the live `recentchange` edit feed sonified. This piece replaces its synthesized bells with grains of Karel's real recorded piano and a 3D typographic rendering.

## What's unverified

Built and typechecked headless — there are no speakers or GPU in this environment, so the actual grain timbre/balance, the visual bloom, and the live Wikimedia stream connection have not been heard or seen running. The feed was confirmed keyless/CORS-open per the brief but not exercised here; the piece is designed to fall back to the cold demo if it fails. Grain loudness/density under a real high-rate firehose burst (up to ~30 edits/sec globally) is bounded by the 24-grain cap and safeMaster limiter but hasn't been tuned by ear.
