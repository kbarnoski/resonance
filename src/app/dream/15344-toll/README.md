# 15344 · The Toll

**A recording you can't hear without paying a cost. One of Karel's real recordings is cut into a finite ledger of cadence-shaped phrases; at rest the page is silent, and to hear a phrase you must spend it — it plays exactly once, then becomes a permanent void. There is no reset.**

## The one question

*What if hearing your own recording cost you the recording?*

Every one of the ~1,182 prior lab pieces is **additive**: press play and the
recording is given to you, intact, as many times as you like. The Toll inverts
that. The recording is **finite** and **consumable** — listening subtracts from
it, irreversibly, and the page owes you nothing until you pay.

## Design notes

### Silence as the default

There is no autoplay and no "play" affordance. On open, the ledger is a full
grid of intact phrase-cells and the timeline is one continuous bar. Nothing is
sounding. The stance is deliberate: *you are not owed this recording.* Any sound
you hear, you will have chosen to spend into being.

### Cadence-shaped slicing (the spendable unit)

The track is cut into a finite, ordered list of phrase slices
`{ index, offset, dur }`. The cut points are chosen to make each unit a musical
phrase rather than an arbitrary fragment:

- **Preferred — harmonic boundaries.** `loadTrackAnalysis(id)` returns the
  performance's `chords[]` (chord symbol + onset time). Each chord onset becomes
  a cut point, bracketed by track start and end, so every slice spans one
  harmonic region — a cadence-shaped phrase. This is the same intuition behind
  **phrase-boundary detection in music information retrieval**, where harmonic
  cadence points are used to segment a performance into musical units.
- **Fallback — even windows.** If a track has fewer than 12 usable chord onsets
  (or no analysis at all), the ledger falls back to even windows derived from the
  decoded buffer duration and shows a small badge, *"even-window fallback (no
  harmonic analysis)."*
- **Clamp to ~24–52.** Slices shorter than ~0.9s merge into their shorter
  neighbor; if chord onsets yield more than 52 cells the shortest are merged down;
  if fewer than 24, the longest are subdivided. Phrases land at roughly 1–6s each.

Slicing is deterministic per track, so the phrase indices are stable across
re-loads and track switches — which is what lets the spent-ledger line up again
when you come back to a track.

### Spend, irreversibly

To hear a phrase you must **spend** it: press-and-hold a cell past a **~280ms
commit threshold** (pointer hold, or keyboard — focus a cell and hold Enter or
Space). A held cell **charges**, filling with the destructive-red from its base
toward commit. On commit:

1. the cell **burns** red,
2. the phrase's audio plays **exactly once** — `ctx.createBufferSource()` started
   at `(offset, dur)`, routed through the shared **ear-safety master**
   (`createSafeMaster().input`), never to `ctx.destination`,
3. on the source's `ended` event the slice becomes a **permanent void**: struck
   from the grid as a dimmed dash (—), non-interactive, and **torn out** of the
   Canvas2D timeline, leaving a gap where it was.

A tap that releases *before* the threshold does nothing — no accidental spends.
Spending is a deliberate, committed act. The ledger is **single-voice**: while a
phrase is sounding, no other phrase can be committed. And there is **no reset
button**, by design.

The currently-playing segment in the timeline **pulses** with a smoothed RMS read
of `master.analyser` (`getByteTimeDomainData`). When every phrase is spent the
timeline is blank, the ledger is all dashes, and a large red **`0`** stands over
the line *"nothing remains."*

### The persistence decision

Spent state is held **in memory only**, per track, in a module-scope
`Map<trackId, Set<index>>` — **never** `localStorage`. This is a deliberate
tension:

- Switching tracks and coming back within one sitting keeps what you spent, so
  the cost is real inside a session.
- A **page reload gives the whole recording back**, which keeps the piece
  reviewable each morning without permanently destroying a reviewer's copy.

The UI states this honestly: *"Reload to be given the recording again — but
within a sitting, what you spend is spent."*

### Palette & type

Achromatic ink on the near-black app background (`bg-background`,
`text-foreground` / `text-muted-foreground`). The **only** non-neutral color is
the **destructive red** (`bg-destructive` / `text-destructive`), reserved
strictly for the act of spending: the charging fill, the burn, and the terminal
`0`. No other hue. House typography throughout — sans hero title, `font-mono`
only for small uppercase labels and readouts. `prefers-reduced-motion` is
respected: the timeline draws statically and the charge shows as a solid state
rather than a growing fill.

### Robustness

- `AudioContext` is built **only inside the user gesture** (Open the ledger /
  track switch) and resumed there — SSR-safe.
- Track-load failure shows a `text-destructive` notice, never a blank crash.
- No 2D canvas context → the DOM ledger keeps working on its own.
- Full teardown on unmount: any playing `BufferSource` is stopped,
  `master.disconnect()`, the charge `requestAnimationFrame` is cancelled, and
  `ctx.close()`.

## References

- **Ephemeral / decay-through-listening sound art (2026)** — works that are
  consumed by the act of hearing them; the recording does not survive its own
  audition.
- **Yoko Ono, *Cut Piece* (1964)** — the audience subtracts the work piece by
  piece; once cut, it cannot be made whole again. The Toll transposes that
  subtractive, irreversible participation onto a recording.
- **Phrase-boundary detection in music information retrieval** — segmenting a
  performance at harmonic cadence points so each unit is a musical phrase, which
  is exactly how the ledger's spendable cells are cut.

```
input:  Karel's real catalog (loadRealTrackBuffer + loadTrackAnalysis)
output: DOM grid ledger + Canvas2D timeline
audio:  every phrase → createSafeMaster().input (single-voice, plays once)
palette: achromatic ink + one destructive-red (the cost)
route:  /dream/15344-toll
```
