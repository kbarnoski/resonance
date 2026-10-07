# Morning digest — last updated 2026-10-07T~13:05Z

> **Jury verdict today**: The source-break is now a real direction — three cycles, three mechanisms (spatial → voice → two-take vocoder), and graft nailed yesterday's critique dead-on; but three.js got *re-banned and ignored* (7×, worst in the window) and the palette just swapped one rut for another, so tomorrow: finally put the particle engine to work, burn down antiphon or swing for the two-person WebRTC room, and get off both color camps. See `docs/dreams/JURY.md`.

> **The source-break is now a direction, not a stunt.** vicinity (spatial, 4 takes) → cantor (your voice) → today **graft** fuses *two* of your recordings into one voice. Three different mechanisms, three cycles. Today also answers the jury head-on: its #3 (get off three.js — use raw WebGL2) and #5 (a NON-granular cross-synthesis between two takes) in one build.

## New since yesterday
- **[19520-graft](https://getresonance.vercel.app/dream/19520-graft) — two of your recordings become ONE voice.** Why open this: it's a two-source **channel vocoder** — *Bath* is the piano you hear, *Ghost* carves its spectrum (or flip it), so one take literally plays *through* the other. Your body conducts: **lean left/right** to choose whose voice it is, **lean toward the camera** to deepen the graft (dry recording → fully vocoded), **sit tall/low** to tilt warm↔bright. Rendered as a flowing 160k-point WebGL2 field in a warm "heartwood" palette. The lab's first vocoder of one real take by *another* real take (vocoder-veil used the mic). **Headphones.**
- **The audio core is guaranteed by construction.** The modulator take is wired only into gain AudioParams — it has zero path to the speakers, and each carrier band is silent until the other recording opens it. So "one take plays through the other" isn't a hope, it's how the graph is built. I verified that by reading it; `npm run build` is green and QA passed clean.

## Needs your ~30 seconds (camera + headphones)
- I can't point a webcam at myself or see a GPU up here, so **graft ships `wip`**. What I couldn't check: whether leaning feels immediate, whether the shoulder-width "lean in" depth read lands for a seated body, whether the dry↔vocoded balance sits right on your ears, and the first-screen look. If any feel off it's a one- or two-number tuning pass — tell me which.

## Still on the board
- **`antiphon`** (your body conducts a call-and-response between two takes) is now the ONLY banked source-break left after cantor + graft shipped — a quick burn-down if you want the shelf lower.
- The biggest unbuilt concept is still jury #2: a **two-person shared HRTF room over WebRTC** (multi-user + spatial, extending vicinity) — deliberate, multi-cycle. A convolution variant of graft (one take as a reverb-IR for the other) is a natural non-granular deepening.

## Open question for you
- **graft's feel** — does the vocoder "sing"? If the lean-to-graft and whose-voice crossfades land, this opens a two-recording-fusion lane (convolution, formant-mapping). If it feels laggy or the mix is off, say which and it's a small pass. Otherwise I'll default next fire to shipping `antiphon`.
