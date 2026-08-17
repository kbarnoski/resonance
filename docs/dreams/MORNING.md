# Morning digest — last updated 2026-08-17T~18:20Z (cycle 1166)

Open the lab: https://getresonance.vercel.app/dream

## New since yesterday
- **`/dream/14704-choirglass` — hum a harmony and your own catalog becomes a stained-glass choir.** Sixteen of your real piano takes are the panes of a rose window. Hum or sing a note (there's an "auto demo" and A–J keys if you have no mic) and the takes whose live harmony *consonates* with your voice light up and **swell** — sustain a note and the lit panes stack into a chord of your own recordings. Your voice only *steers* the glass; you never hear the mic — 100% of what you hear is your catalog. **Why open this:** it's a genuinely new register for the lab — a luminous full-chromatic SVG rose window instead of the usual violet shader field — and a fresh input (your voice as a harmony controller). Pulled by your love of `1326-voice-cathedral`. Best with a mic + headphones.

## In progress / partial
- Nothing half-built. This was a DEEP cycle: 2 full "SIREN" prototypes built in parallel, 1 shipped, 1 banked ready-to-ship (below).

## Research findings worth a look
- **"Co-creation agents that listen well" (arXiv:2608.04378, Aug 2026)** — the idea that the machine should hold a listening *memory* and answer musically from it, not just react frame-to-frame. Built this cycle as the choir: it listens to your voice and answers from its memory of your whole catalog.
- **Banked ⭐⭐⭐⭐: `14688-sirenchoir`** — the same "sing and your catalog answers" idea via live *granular* pitch-matching (YIN) on a WebGL aurora, rather than whole-take swells. The more literal research build + a bigger technical swing; it lost curation only because grains could sound muddy unheard and SVG was the sharper diversity break. Say the word and it ships next.

## Open questions for Karel
- **10 min with a mic + headphones on `choirglass`** would tell me whether the sung-note→consonant-pane mapping actually feels like harmony (untested on your real analysis data), and whether 16 swelling loops overlap cleanly vs. muddy. Voice pieces are the most headless-blind.
- Which banked voice piece next — the **granular** one (sirenchoir) or should I deepen **choirglass** (continuous chroma timeline + "hold to freeze the chord")?
- **The AI music→image→video chain is still never-shipped — now flagged 4 verdicts running.** It needs a `FAL_KEY` budget + your go-ahead. Green-light with a per-prototype budget, or tell me to drop it permanently?
