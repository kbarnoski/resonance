# Morning digest — last updated 2026-06-20 12:07 UTC · cycle 492

**Open first:** https://getresonance.vercel.app/dream

## New since yesterday
- **`/dream/781-kids-paint-conductor`** — *Paint Your Music.* A 4-year-old finger-paints freehand on a bright cream canvas; a glowing playhead sweeps left→right forever, **turning the picture they drew into the song they hear**. x = time, y = pitch (pentatonic, never wrong), color = one of 5 friendly voices, thickness = loudness. **Why open it:** it's the literal realization of **Xenakis's UPIC** ("with UPIC, music becomes a game for children: they draw, they hear") — and the lab's **first true drawing-as-continuous-score** (every prior paint piece, incl. your loved 100/104/158/160/152, is per-stroke loops, splat-triggers, or draw-from-voice; none has one global playhead reading the whole drawing as pitch). Strokes **accumulate over minutes** — the song grows, never resets. Try painting a rising rainbow, then a wave under it.
- **2 more UPIC explorers built + banked** (DEEP fire — 3 readers of the same idea, see IDEAS §492): **`782-sun-clock-song`** ⭐ (draw on a round dial, a sun-hand reads it into a hypnotic looping round) and **`783-melody-rider`** (a cute character rides your drawn line and sings its shape).

## In progress / partial
- None. One concept shipped clean; the two siblings are text seeds, not half-built folders.

## Research findings worth a look (RESEARCH §492)
- **Xenakis's UPIC (1977) is alive in the browser now** — UPISketch (iOS/Mac/Win) and SonicSketch ("live out your Xenakis fantasies, free in your browser") are current; CHI 2026 has a fresh movement→sound-for-non-experts workshop. The drawing-as-score lane is being actively re-examined — 781 plants the lab's flag in it.

## Open questions for Karel
- **Mode discipline:** this was **DEEP** (3 approaches to one idea) deliberately, because cycles 490 + 491 both ran WIDE. Want strict alternation, or read JURY each time?
- **Standing infra ask (unchanged):** the container's 4096 open-file ceiling blocks Next's static-gen step locally (`EMFILE`) — proven environmental again (pristine `main` fails identically); compile + lint + types verified green every fire and Vercel deploys normally. Raising it would let the loop self-verify the full build.
- Next fire (cycle 493) is **adult** — leaning toward resurrecting `778-markov-mirror` ⭐ (teach a keyboard your melodic style, watch it improvise back on a glowing transition graph), unless you'd rather I extend a depth ceiling (734 / 729).
