# Morning digest — last updated 2026-07-19 (cycle 826, DEEP)

> **Tonight the lab built an instrument you play by *reading*.** A graphic score scrolls past a line, and your scroll speed IS the tempo — stop, and the marks under the line ring on as a held chord. No play button. The music only exists while you read. I fanned 3 realizations of "reading is performing" and shipped the strongest.

**Open this first (best on desktop/trackpad; works on phone by dragging the score):** https://getresonance.vercel.app/dream/1958-treatise-scroll — press **Begin reading ▷** (or just start scrolling). Scroll down to read a self-writing **Cornelius Cardew *Treatise*** graphic score; **scroll fast = quick, bright arrivals**, **slow = each mark blooms**, and **park the scroll on a thick line or box and it sustains as a drone**. Leave it ~1.5 s and a ghost reads it to you. Pitch is a real just-intonation scale; the marks are the notes.

## New since yesterday
- **`/dream/1958-treatise-scroll`** — *reading is performing.* A scroll-performed graphic score in **SVG-DOM** (no canvas). Its point: the lab already has score *visualizers* (`319-hub-score`, `1236-neume`) where the machine plays and the picture illustrates — this **inverts** it so your own reading gesture is the performance. **Fresh input:** scroll-velocity as an instrument is a lab-first (scroll had only ever been scrub/nav). **Non-psychedelic on purpose** — a warm ink-on-paper counterweight to a psychedelic-heavy week (comma-veil / somatic-echo / vestibular-dissolve).
- **Why it matters:** it's the direct build of tonight's freshest research — the "Arrows & Operators" exhibition that opened **9 days ago** (2026-07-10) with *live Treatise performances* — and it realizes the ⭐⭐ idea I banked last night. Reads instantly at a glance and self-demos with no device.
- **2 more explored, banked (IDEAS §826):** **`spiral-cantus`** ⭐⭐ — scroll *inward* along a spiral rose-window and hear a real **medieval mensuration canon** (one line at 1:2:3 speeds) phase against itself; the most musical of the three. **`hypnagogic-margin`** ⭐ — a *text* you perform by reading, where reading too **fast dissolves the words into the hypnagogic word-salad of falling asleep.**

## Research finding worth a look
- Graphic-score performance is having a 2026 moment (that 9-day-old UNE exhibition + a Cardew-*Treatise*-via-AI paper, arXiv:2412.08944). The lab had graphic scores only as playback visualizers — nobody had made **reading itself the instrument.** Full note in RESEARCH.md (§826).

## Honest caveat
- Headless container = **no display, no speakers, no scroll device.** Passed normalizer (0) + tsc (0) + eslint (0) + the authoritative compile build (route emitted, no loser leak). **Not feel-verified.** Your browser settles: does scroll-speed read clearly as tempo, does stopping land as a *musical* sustain, and do the endless Cardew marks read as a legible score vs visual noise?

## Open question for you (standing, ~23 juries)
- The **≥2-model AI-pipeline chain** (audio→image→video) is still the one genuinely-absent frontier, blocked only on your paid per-prototype budget (rule #6). **Possible unlock:** an **in-browser** chain (Transformers.js/WebGPU) could cash it with **no paid budget** — worth one scoping cycle if your env allows CDN model loads. Yes / no?
