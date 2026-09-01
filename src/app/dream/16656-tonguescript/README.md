# 16656-tonguescript — a living manuscript that is also a loop-station

A page of writing that plays: every line you commit becomes a persistent, looping voice of Karel's piano, and the poem you type accumulates into a layered, phasing score that survives a reload.

**Status:** Demoable. TypeScript (scoped `tsc --noEmit`) and ESLint both pass clean. Audio is Karel's real catalog only, routed entirely through `createSafeMaster`; visuals are a pure DOM/CSS typographic surface (no canvas, no WebGL).

## The one question

> What if a page of writing became a LOOPING, LAYERED instrument — each line you commit becomes a persistent voice of Karel's piano that keeps playing, so a poem you type accumulates into a living multi-voice score that survives even after you reload?

## How it works

- A single input line sits at the bottom. Type a line and press **Enter** to commit it (Shift+Enter for a soft break). Committed lines stack up the page as a manuscript — each line is a left-to-right row of word-glyphs, a timeline you can read.
- Each committed line becomes a **persistent, looping voice**. Its words play in sequence as short, enveloped slices of Karel's real takes, and the whole line loops forever on its own cycle (line length → loop duration).
- Because different lines have different loop durations, they **drift against each other** and never quite realign — a phasing polyphony. Up to 8 lines layer at once.
- The currently-sounding word in each line **brightens and swells** (a violet bloom scaled by live master RMS), then relaxes — a moving playhead you can see in every voice at once.
- Per-line **mute / solo / remove** affordances; muted or un-soloed lines fall to a dim register but keep looping silently.

Audio graph, per slice:
`AudioBufferSourceNode → GainNode (click-free trapezoid envelope) → BiquadFilter (lowpass) → per-line GainNode (mute/solo/level) → createSafeMaster(ctx).input`.

Never `ctx.destination`; never an oscillator or noise. Every audible sound is a slice of one of Karel's decoded `AudioBuffer`s (`REAL_TRACKS` via `loadRealTrackBuffer`), 5 takes preloaded on the first gesture. A single lookahead scheduler (`setInterval` ~25 ms, scheduling ~120 ms ahead with `source.start(when)`) keeps every line's loop glitch-free; concurrent one-shot slices are capped at 10 (oldest stolen).

## The prosody mapping (cross-modal bridge)

The text is read as **rhythm, not meaning** (`prosody.ts`, pure and audio-agnostic):

- **word length → slice duration** (`0.16 + len·0.045` s).
- **char-code sum → which take** (`REAL_TRACKS`-derived buffer index = `charSum % nLoaded`) **+ a golden-ratio offset** (`(charSum·φ⁻¹) mod 1`) into that recording, so successive words cut from non-repeating positions.
- **vowel ratio → brightness + transpose**: lowpass cutoff `600–4200 Hz`, playback rate ~`0.9–1.12×` (before the line bias).
- **terminal punctuation → accents + rests**: `!`/`?` hit harder and add a longer breath; `.` a softer accent; `,;:—-` a short rest. A pure-punctuation token is a silent rest, still drawn as a glyph.
- **the line's overall vowel density → its register**: a per-line rate bias (`~0.82–1.24×`) so vowel-dense lines sit higher and different lines occupy different bands.

Because the mapping is deterministic, a restored line always sounds identical to when you first wrote it.

## Persistence & looping design (the load-bearing ambition)

The manuscript (each committed line's text + its muted flag) is saved to `localStorage` under `tonguescript:manuscript:v1`, wrapped in `try/catch` (it can throw or be empty). On reload the manuscript is restored and displayed immediately, silent; one gesture (browser autoplay policy — `AudioContext` is created only on first user gesture, with `ctx.resume()`) gives every restored line its looping voice again. **Clear manuscript** stops all voices and wipes the stored entry. If storage is unavailable, the piece runs in-memory with an empty manuscript.

Timing is decoupled from React: audio nodes and the scheduler live in refs, the scheduler advances each line by whole loop cycles, and both audio onsets and the visual playhead are computed from the same fixed per-line `startTime` so they stay in phase. Glyph bloom is applied by direct DOM manipulation inside a single rAF (no per-frame React re-render).

## Graceful degradation & teardown

- Some takes fail to load → an on-brand notice, keep playing with whatever decoded. None load → a `text-destructive` notice and no crash.
- `localStorage` throws/empty → caught, empty manuscript.
- Full teardown on unmount: clear the scheduler interval, stop/disconnect all live slices and per-line gains, `master.disconnect()`, `ctx.close()`, cancel rAF.

## Named references

- **Cornelius Cardew, _Treatise_** — the graphic/concrete-poetry text-score whose page you read as sound; the manuscript surface is in that lineage.
- **Steve Reich (phase music) & Brian Eno, _Music for Airports_** — why layered lines of different lengths drift and never quite repeat.
- **Cross-modal prosody** — mapping a text's rhythm / vowel density / punctuation as the bridge to sound, in the spirit of recent prosody-aware cross-modal audio work (arXiv, 2026).

## Known limitations

- Slices are cut from fixed golden-ratio offsets; a given word always samples the same moment of a take, so repeated words within a line sound identical (intended, but can feel mechanical on very short words).
- Word-level slices are monophonic per line at the envelope level; heavy overlap across 8 long lines can hit the 10-slice concurrency cap and steal voices (audible as an occasional dropped note under dense manuscripts).
- No stereo placement — lines share the center image and separate by register/brightness only.
- Restored voices resume only after the first gesture (unavoidable under browser autoplay policy); the manuscript itself is visible immediately.
- The lookahead scheduler assumes a live tab; a backgrounded tab's throttled timers can briefly thin the texture until refocused.
