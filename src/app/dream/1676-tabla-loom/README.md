# 1676 · Tabla Loom

**The one question:** What if Resonance could let you *play* a physically-modeled Indian *tabla* through a *konnakol tala* cycle — where the rhythm's structure (the tala) is visible and the drum voices are synthesized, not sampled?

This is a **rhythm instrument**: beat-driven, resonant, gritty. No drone, no pad.

---

## What it is

A self-contained audio-visual prototype (Web Audio + Canvas2D, no external audio/graphics deps). A steady clock advances a repeating **tala** while the spoken-rhythm **theka** lights up matra-by-matra on a circular **tala wheel**. You can drum along on synthesized tabla bols with the on-screen pads or the home row, and jam over the machine's groove or turn the auto-theka off to play solo.

On load a **ghost demo** starts immediately: the wheel turns, the playhead sweeps, and the theka flashes deterministically so the page is never blank. Where the browser's autoplay policy allows it the ghost is also audible; otherwise pressing **Play** (a user gesture) unmutes the drum.

---

## How it works

### Modal / banded tabla synthesis (no samples)

Every *bol* (drum stroke) is built from a small bank of **tuned resonators excited by a short noise burst** — modal / banded-waveguide-style percussion synthesis. `modalStroke()` sums:

- a **noise excitation** (bandpassed white-noise burst) — the attack transient / membrane slap, and
- a set of **tuned sine partials** at per-bol inharmonic ratios, each with its own exponential decay — the resonant ring and pitch of the drum.

The roster:

| Bol | Character | Synthesis notes |
|-----|-----------|-----------------|
| `na`, `ta` | rim strokes, bright clear pitch | dayan partials `[1, 2, 2.7]`, medium decay, bright noise tick |
| `tin` | open ringing rim, singing sustain | `[1, 2, 3]`, long decay, low noise |
| `tun` | resonant open center, "tuuun" | strong fundamental, long decay, slight downward micro-bend |
| `ke`/`ka` | closed slap on the baya | low-passed noise thud, no ring — dead |
| `ge`/`ghe` | the **baya bass** | low partials **bent downward** (`bendRatio 0.6`) — the signature heel-pressure glide |
| `dha` | bass + ring | `ge` + `na` struck together |
| `dhin` | bass + ring | `ge` + `tin` struck together |

The master chain adds a `tanh` soft-clip (grit/warmth), a high-shelf (air), and a compressor. A **sur** control retunes the dayan (and the baya tracks it); the noise buffer is generated once from a **seeded PRNG** (`mulberry32`) so nothing in the core path uses `Math.random`.

### Tala engine

A **lookahead scheduler** (a 25 ms `setInterval` *pump*) schedules bol audio onto exact `AudioContext.currentTime` stamps — audio is **not** driven by `setInterval` timing itself (Chris Wilson, "A Tale of Two Clocks"). A single `Transport` ref tracks the current matra, its start time, and the next scheduled time. Before audio is permitted the same transport runs on `performance.now()` so the visual ghost never stalls; on the first successful `resume()` the clock is handed to `AudioContext.currentTime` and the flash queue is reset.

Shipped talas (all Hindustani, so the bol vocabulary stays consistent):

- **Teental** — 16 matras, `4+4+4+4`, sam @ 1, khali @ 9. *Dha Dhin Dhin Dha | Dha Dhin Dhin Dha | Dha Tin Tin Ta | Ta Dhin Dhin Dha*
- **Keherwa** — 8, `4+4`, khali @ 5. *Dha Ge Na Ti | Na Ka Dhi Na*
- **Jhaptal** — 10, `2+3+2+3`, khali @ 6.
- **Rupak** — 7, `3+2+2` (opens on the khali sam).

**Sam** (emphatic beat 1) is accented and marked with a ring; **khali** (the empty/waved beat) is drawn hollow and its theka uses treble-only strokes (Tin/Ta) where the baya is lifted. Sam and vibhag downbeats get a velocity accent.

### Visualization

A **circular tala wheel** (rhythmic-necklace framing after Godfried Toussaint): matras sit around the ring, connected as a necklace polygon, with the konnakol syllable labelled at each node. A radial playhead sweeps continuously (interpolated from the audio clock), each struck bol flashes a resonant ripple at its node, and the center shows the current syllable + tala readout. Warm ochre / clay / ink palette — the art layer only; all UI chrome uses the house semantic tokens with violet as the sole accent.

### Playing it

- **Pads** (≥44 px) and the **home row** — `A`ge `S`ke `D`na `F`tin `G`tun `H`ta `J`dhin `K`dha — trigger bols instantly on a user gesture.
- **Auto-theka** toggles the machine's groove on/off (jam over it, or play solo).
- **Tala** picker and **Lay** (tempo) / **Sur** (tuning) sliders.

---

## Named references

- **Perry R. Cook** — *PhISM / PhOLIES* parametric physically-informed stochastic/spectral models for particle & modal percussion.
- **Georg Essl & Perry R. Cook** — banded waveguides for bar/membrane percussion synthesis (tuned resonators excited by a short burst).
- **Konnakol** — the South Indian (Carnatic) vocal-percussion / solkattu tradition; the Hindustani **theka** and **tala** system (Teental, Keherwa, Jhaptal, Rupak; matra / vibhag / sam / khali).
- **Godfried Toussaint** — *The Geometry of Musical Rhythm*; the rhythmic-necklace representation used for the circular wheel.

---

## Constraints honored

Client component; Web Audio + Canvas2D only; self-contained in this folder; no API routes; autoplay policy handled via a Play gesture with a silent-but-animated ghost fallback; deterministic core demo (seeded noise, fixed theka pattern — no `Math.random`/`Date.now` for timing or ornamentation); graceful degrade if `AudioContext` is unavailable.
