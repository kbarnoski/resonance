# 9768 · MPELACE

**The one question:** *What if a browser could be a real microtonal
performance instrument* — play a just-intonation isomorphic keyboard and
route it **out** to your DAW or hardware synth in **exact** microtonal
tuning, while consonance itself becomes visible geometry?

**Status**: demoable

## What it is

A hexagonal isomorphic keyboard (Bosanquet generalised keyboard / Wicki–
Hayden family) rendered as a clean Canvas2D lattice. Every hex cell sounds an
**exact frequency** — not the nearest semitone — in either pure 5-limit just
intonation or 31-EDO. Tap a cell (or several, multi-touch) and it plays on an
internal Web Audio synth **and**, if a MIDI output device is available,
routes out as true **MPE** (MIDI Polyphonic Expression) with per-note
pitch-bend carrying the microtonal remainder. This is the lab's first true
microtonal MIDI-OUT surface.

## The lattice: isomorphic shape, two tunings

Every cell is addressed by axial hex coordinates `(col, row)`. Moving by the
same shape always means the same interval, anywhere on the board — that's
what "isomorphic" means for a keyboard (Milne, Sethares & Plamondon,
*Isomorphic Controllers and Dynamic Tuning*, 2007):

- `col + 1` → up a **perfect fifth**
- `row + 1` → up a **major third**
- `col + 1, row - 1` → up a **minor third** (the lattice's third hex
  neighbour, for free)

This generalises the brief's flat `semitone = 2·col + 7·row` formula into a
genuine two-generator 5-limit system (a fifth is ~7 semitones, a major third
~4, so the nearest-12-TET position of a cell is roughly `7·col + 4·row` — but
the *sounding* pitch is the exact ratio product below, never that tempered
approximation). It's the classic Euler/Tonnetz triangular net folded onto a
hex tiling, the same net used by real 5-limit hex controllers (Centerpointe,
Tonal Plexus, the Terpstra/Lumatone default layouts).

**5-limit JI** (default): `freq = originHz · (3/2)^col · (5/4)^row`, taken
literally with no octave-reduction fold. Because the syntonic comma (81/80)
never cancels, this lattice does **not** repeat under octave shift — drift
across the board is real, not a rendering bug.

**31-EDO** (toggle, key `t`): 31 equal divisions of the octave, the historic
"closes the comma" tuning for exactly this keyboard shape — its fifth is 18
steps (≈696.8¢) and its third 10 steps (≈387.1¢), both within ~1.5¢ of pure
JI. `freq = originHz · 2^((18·col + 10·row)/31)`. The *identical* hex shape
becomes perfectly periodic once tempered — same geometry, two tunings, the
Milne–Sethares–Plamondon "dynamic tuning" idea made playable.

Each cell is labeled with its nearest-12-TET note name and its exact cents
deviation from that note (e.g. `E4  +14¢`), computed from the true frequency,
not read off a table.

## The MPE-out mechanism (the novel headline)

`midi.ts` feature-detects `navigator.requestMIDIAccess({ sysex: false })`.
When an output device is picked from the on-screen device list:

- **Master channel 1** carries the MPE Configuration Message (MCM),
  claiming **member channels 2–16** for 15-voice polyphony.
- Every member channel gets its pitch-bend range set to **±48 semitones**
  once via RPN 0,0 (`CC101=0, CC100=0, CC6=48, CC38=0`) — wide enough that a
  ±48-semitone bend can carry any comma-drifted JI cell without clipping.
- **Each held note claims its own channel**, round-robin from a free-list of
  the 15 member channels (with LRU voice-stealing if all 15 are in use).
- Per note: `midiNote` = nearest 12-TET number, `bendSemitones` = the exact
  cents remainder ÷ 100. The **pitch-bend message is sent before the
  note-on** (`bend14 = 8192 + round((bendSemitones/48)·8192)`, clamped to
  `0..16383`), so the note sounds in tune from its very first sample.
- Note-off frees the channel back to the pool. Teardown, a device switch, or
  disabling MIDI sends **all-notes-off + pitch-bend reset** on every member
  channel — no stuck notes, no permanently bent channels.

A live readout (top-right) shows the channel and `bend14` value **as it is
computed**, even with nothing plugged in — the MPE mechanism stays legible
whether or not you own a MIDI interface.

## Always works unplugged

The internal synth (`synth.ts`) is a small 2-operator FM voice (sine carrier,
sine modulator at a fixed 2:1 ratio) driven by the exact same Hz as the
MIDI-out path — never a rounded one. With no MIDI device attached, or no Web
MIDI support at all, it's still a complete, exactly-tuned instrument; the
page shows a `text-destructive` notice ("Web MIDI unavailable — internal
synth only") and the readout keeps reporting the channel/bend14 it *would*
have sent.

## Consonance as geometry

The lattice **is** the picture: spatial neighbours are consonant by
construction (a fifth or a third is always one hex-step away). Held cells
glow violet; the tonic `(0, 0)` always carries a soft violet ring so there's
a fixed "home." Each held cell also gets a subtle shimmer: its pulse rate is
`|f_exact − f_nearest12TET|` in Hz (clamped to ≤ 3 Hz for safety), so a cell
whose exact pitch nearly coincides with its 12-TET shadow sits visibly still,
while a pure major third or seventh — further from its tempered neighbour —
gently beats. Ear and eye read the same microtonal fact (Plomp & Levelt,
*Tonal Consonance and Critical Bandwidth*, 1965).

## Alive on a muted phone

On load, a seeded `mulberry32(0x9768)` auto-arpeggiator walks a **I–vi–IV–V**
progression, one arpeggiated note at a time. The four triads are drawn as
small triangles on the Tonnetz that share an edge with their neighbours (two
common tones each) — literally the neo-Riemannian PLR relations the Tonnetz
was built to show. This is **visual only**: no `AudioContext` exists yet
(browser autoplay policy — nothing plays until a real user gesture) and
nothing is ever sent to a MIDI device before the player takes control, so a
muted 06:30 review phone still sees a living, lighting lattice with zero
interaction. The first tap, click, or keypress hands control to the player
permanently and starts the audio context.

## Controls

- **Tap / click** a hex cell to sound it; release to stop. Multi-touch plays
  chords, each note on its own MPE channel.
- **Keyboard**: rows `1234567` / `qwertyu` / `asdfghj` / `zxcvbnm` play four
  lattice rows (same isomorphism holds on the QWERTY rows). `t` toggles
  JI ↔ 31-EDO.
- **Device picker** (only shown once Web MIDI resolves with an output
  attached) selects which MPE output to send to.

## Palette & safety

Clinical high-key: near-white ground, ink/graphite lattice lines, one violet
accent reserved for the tonic marker and every held cell — no warm amber, no
cosmic indigo, no Ikeda red. This is a deliberate fixed instrument-panel
look for the canvas art layer, independent of the site's light/dark theme
(same convention as sibling prototypes). The shimmer is a soft sine, clamped
to ≤ 3 Hz and modest luminance depth — nowhere near strobe territory — and
`prefers-reduced-motion` both slows it further and slows the auto-arpeggiator
step rate. Full teardown on unmount: rAF cancelled, all listeners removed,
synth voices stopped and disconnected, MPE all-notes-off + bend-reset sent on
every member channel, `AudioContext` closed.

## References

- Bosanquet's generalised keyboard; the Wicki–Hayden layout.
- Lumatone / the MIDI 2.0 microtuning direction for isomorphic hex
  controllers.
- MPE specification (mpe.zone) — per-note pitch-bend on round-robin member
  channels.
- D. Milne, W. Sethares & J. Plamondon, "Isomorphic Controllers and Dynamic
  Tuning: Invariant Fingering over a Tuning Continuum," *Computer Music
  Journal* 31:4 (2007).
- R. Plomp & W. J. M. Levelt, "Tonal Consonance and Critical Bandwidth,"
  *JASA* 38 (1965) — beating/roughness.
- Xen-wiki, 31 equal division of the octave (31-EDO).

## Honest limitations

- The 5-limit JI lattice is intentionally unbounded/non-periodic; the
  rendered board is a fixed 7×5 window (`col ∈ [-3,3]`, `row ∈ [-2,2]`), so
  very distant chord voicings beyond that window aren't reachable — a real
  Lumatone-class controller would let you pan.
- The internal synth is a simple 2-op FM voice, not a calibrated instrument
  timbre; it's tuned for legibility (a clean, identifiable pitch) rather than
  for beauty.
- MPE output has been built and manually verified against the spec's byte
  sequences; it has not been tested against every DAW's MPE auto-detect
  quirks (Ableton, Bitwig, and hardware like the Lumatone/Osmose all parse
  MCM slightly differently in practice).
- The auto-arpeggiator's chord-root placement on the lattice
  (`I=(0,0)`, `IV=(-1,0)`, `vi=(-1,1)`, `V=(1,0)`) is chosen for smooth
  Tonnetz voice-leading, not for octave register — some notes in the
  progression sound in a different octave than a diatonic ear might expect.
