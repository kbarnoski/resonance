# Clap Back — design notes

**Route**: `/dream/154-kids-clap-back`
**Cycle**: 182 (kids build)
**For**: kids 4+ · Zero permissions · Zero API · Zero deps

---

## What it does

A call-and-response rhythm game for 4-year-olds. The prototype plays a 4-beat
pattern (some beats active, some silent rests). After a brief "your turn!" pause,
the same 4-beat clock runs again — this time the child taps. Big sparks for
on-beat taps; small sparks for off-beat taps. No fail state, no score counter.
The pattern cycles through 5 rhythms, starting simple and getting syncopated.

Three visual phases, three distinct colors:
- **Violet** — "👀 watch" (demo phase)
- **Green** — "✨ your turn!" (1.5-beat wait gap)
- **Cyan** — "👆 tap it!" (listen phase)

Four beat-indicator dots below the circle show which beats are active (lit) vs.
rest (dim). The dots show the pattern's shape before the child has to reproduce it.

---

## Design decisions

**Why a single big circle?** All 48 prior kids prototypes use tap targets
(discrete characters, keys, dots, fish) or drag surfaces (drawing path,
weather zones). Clap Back is the first where the TIMING of a tap is the
parameter — not where you tap, but when. A single full-screen circle makes
the instruction unambiguous: tap the circle when it glows.

**Why non-judgmental sparks?** The ±22% timing window (±165ms at 80 BPM) is
loose enough that most intentional on-beat taps succeed. Off-beat taps still
produce 9 sparks — a small but present reward. The child who misses the beat
is not punished; they just get fewer sparks. After a few cycles they naturally
start trying to match the bigger explosions. No scores, no "wrong", no frowns.

**Why start with all-4 active?** Pattern 1 is `[true, true, true, true]` —
every beat fires. The child's job is just to tap in steady time. This teaches
the 750ms beat interval (80 BPM) before any rhythmic complexity is introduced.
Pattern 2 introduces the first skip; the final pattern (`[. 2 . 4]`) is the
classic backbeat — familiar, surprising, satisfying.

**Why 80 BPM?** At 60 BPM (1 beat per second) the gaps feel uncomfortable for
a child — too long between beats. At 100 BPM the ±22% window shrinks to ±132ms,
which is challenging even for adults in a clapping game. 80 BPM ≈ 750ms/beat
gives ±165ms window and feels like a natural hand-clap tempo.

**The "watch → wait → listen" three-phase cycle** mirrors how music pedagogy
actually works: demonstrate → brief pause to signal transition → imitate. The
1.5-beat green gap (~1125ms) is long enough to see the color change and understand
"now it's different" without breaking the rhythmic energy.

---

## Audio

Triangle oscillator per beat note (C4, E4, G4, A4 — pentatonic, all consonant).
On-beat taps: loud pluck (0.40 gain, 750ms decay). Off-beat taps: quiet pluck
(0.12 gain). Silent listen phase — the child provides all sounds via their taps,
reinforcing agency. Ambient sine pad (C3 + G3, barely audible) keeps the canvas
alive before the first beat.

---

## What's next

- **Polish**: add a "round" counter (1-5 dots lighting up as patterns advance)
  so a child knows how far through the sequence they are.
- **v2**: after 5 patterns, generate a new random pattern from the child's own
  tap rhythm (use their timing to construct the next demo). The child becomes
  the composer.
- **Multi-touch**: two fingers = stereo call (left finger = left beat, right
  finger = right beat), letting two kids clap-back simultaneously.
