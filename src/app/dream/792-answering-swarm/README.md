# 792 · Answering Swarm

**The one question:** *What if the duet partner were a SWARM of tiny
memory-agents — each holding one motif harvested from his real piano — that
self-organize over minutes, reinforcing the fragments that fit the music and
letting the rest fade, until a few recurring themes EMERGE and are played back,
so minute 5 has settled themes that minute 1 didn't?*

This is **cycle-2 of `770-answering-room`**. The soloist, listener, and a
separate synthesized answering voice all carry over. What's new is a
**motif-memory layer**: a decentralized stigmergic swarm that turns his own past
phrases into the material the agent answers with — material that
self-organizes rather than being scripted.

You press **Begin**. His recording plays whole, as the lead voice. As he plays,
the room quietly harvests fragments of his phrases into a swarm of memory-agents.
Each frame, every agent feels the chord under his hands and either gathers
strength (if its motif fits) or fades. Over minutes the swarm consolidates onto
a few dominant themes, and the soft bell answers in his gaps by sounding the
strongest one — snapped to whatever key he is in now.

## How it works

Four roles, one room.

### The soloist — his recording, whole
`audio.ts` (loader copied verbatim from 770) fetches the real recording (a
read-only public GET) and plays it through a single `AudioBufferSourceNode`. It
is **never** chopped into grains, never granulated, never resynthesized. If the
fetch fails, we synthesize a warm ~16s lyrical phrase offline and play *that*,
with an honest emerald "synthesized fallback" badge — the room is never silent.

### The listener — machine listening + motif harvesting
`listener.ts` taps the soloist with an `AnalyserNode` (fftSize 2048). Each frame
it folds the FFT into a **12-bin chroma**, fits the **triad under his hands**,
and tracks **energy** + **spectral flux** to find **phrase gaps**. Cycle-2 adds
an onset edge-detector: during a phrase it records the dominant pitch-class at
each attack, and when a phrase gap opens it emits that run of pitch-events (plus
their inter-onset timing) as a **harvested motif fragment** — his PAST playing
only, never a lookahead.

### The swarm — the new motif-memory layer (stigmergy)
`swarm.ts` is a decentralized colony, capped at 12 agents. Each agent holds one
harvested motif + a **pheromone** value. There is no central composer; structure
emerges from local rules:

- **Sense + deposit:** each frame every agent measures how well its
  pitch-classes sit on the current chord/scale tones (`motifFit`). Agents that
  fit *deposit* pheromone, scaled by his energy; the better the fit, the more
  they gain.
- **Evaporate:** every agent loses a little pheromone each frame, so a motif
  survives only if it is **repeatedly** reinforced across changing harmony.
- **Turnover:** a freshly harvested fragment joins if there is room, else it
  replaces the **weakest** current agent; fully-evaporated agents are culled.
- **Consolidate:** over minutes the colony concentrates its pheromone onto a few
  **bridging motifs** — emergent recurring themes. A `consolidation` readout
  (0–100%) makes this audible-in-numbers: low and flat early, high once a few
  themes dominate. **Minute 5 ≠ minute 1.**

### The agent — a second, synthesized voice (now sounding the swarm)
`agent.ts` keeps 770's warm **pad** (detuned sine/triangle voices, lowpassed,
retuned to the detected chord) and its soft **FM bell**. The change: the answer
is no longer a contour-inversion of his last gesture — it **sounds the
strongest swarm agent's motif**, snapping each harvested pitch-class onto the
nearest scale tone of the current key and landing on a chord tone to resolve.
The **company** slider moves it shy ↔ talkative. A **trading-fours** toggle lets
the agent take a longer, doubled turn from the consolidated theme during quiet
stretches.

### The visual — a quiet readout of self-organizing memory
DOM/CSS plus a small `<canvas>` — deliberately **not** a fullscreen shader. A
warm hearth ground: *him* on the left (a breathing glow scaled by his energy),
and *the swarm* as a small field of glowing dots, one per agent, each dot's
brightness and size = its pheromone strength. Strong agents drift toward the
field centre and a faint duet thread to the dominant theme lights up when the
agent answers. The detected chord is shown large; a small line reads
`swarm: N motifs · strongest theme …` with consolidation % and elapsed time.
The **sound** carries the piece; the dots are a calm window onto the memory.

## Lineage / named references

- **Markus J. Buehler, *MusicSwarm: Biologically Inspired Intelligence for Music
  Composition*** (Advanced Intelligent Systems, April 2026; arXiv 2509.11973) —
  decentralized swarm agents that sense and deposit harmonic/rhythmic/structural
  cues, adapt short-term memory, and consolidate local novelties into global form
  via recurring "bridging motifs" (stigmergy / small-world self-similarity). This
  is the direct model for the swarm layer here.
- **George Lewis, *Voyager*** — a machine co-performer that listens and responds
  from a memory of material rather than merely accompanying.
- **Research anchor: *LiveBand: Live Accompaniment Generation in the Audio
  Domain*** (arXiv 2606.03803, June 2026) — real-time accompaniment under strict
  causal, past-only constraints. The swarm is fed only his PAST playing — no
  lookahead.

## How this differs from 770

770's agent is **reactive and memoryless**: in each gap it improvises a short
gesture that loosely *inverts his last contour* and resolves on a chord tone. It
has no record of what he played a minute ago, so minute 5 sounds like minute 1.

792 adds a **decentralized memory that self-organizes over time**. The agent no
longer invents an inversion — it plays back *his own harvested motifs*, but only
the ones the swarm has reinforced into recurring themes through stigmergy. The
result accretes: early on the swarm is full of transient, roughly-equal
fragments; over minutes a few dominant themes emerge and recur. The piece has a
**long-form shape** that 770 structurally cannot have.

## Next-cycle deepening

- **Rhythmic stigmergy:** reinforce on rhythmic as well as harmonic fit, so the
  swarm consolidates groove, not just pitch.
- **Cross-pollination:** let strong agents spawn *variant* children (transposed
  or rhythmically displaced motifs), a small-world mutation operator toward
  richer emergent form.
- **Two interacting colonies** (a "low" register and a "high" register swarm)
  that answer each other, edging toward counterpoint.
- **Cadence anticipation:** begin a trading-fours swell a beat before a likely
  cadence rather than only in detected quiet.
- **Seventh chords / inversions** in the chord fit, so motif-fit scoring (and
  thus consolidation) is harmonically finer-grained.
