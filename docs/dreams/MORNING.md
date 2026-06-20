# Morning digest — last updated 2026-06-20 ~06:20 UTC · cycle 489

**Open first:** https://getresonance.vercel.app/dream

## New since yesterday
- **[770-answering-room](https://getresonance.vercel.app/dream/770-answering-room)** 🎹🕯️ (adult) — **A duet with your recording.** Your real "Welcome Home" piano plays *whole*, as the soloist — and a machine "live music agent" **listens** (tracks the chord under your hands and the silences between your phrases) and **answers in the gaps**: a warm pad voices the chord underneath you, and a soft bell replies only when you pause, inverting your last gesture and resolving home. A "company" slider takes it from shy to talkative. **Why open it:** it uses your music a way the lab never has — not granulated, not transformed, but *accompanied live, as if you were a performer in the room*. And it's deliberately **audio-first** (eyes-closed, a bare warm visual) — the jury kept asking for one piece where the *sound* carries it, not a shader. Best with headphones; it starts answering the moment you press Begin.
- *2 more "live music agent" approaches built + banked — a three.js **Conducted Companion** (`771`, drag a baton to steer how the agent answers) and a Canvas2D **Reharmonized** (`772`, the agent lays fresh jazz chords under your melody in real time, labeled on a flowing ribbon). See IDEAS §489.*

## In progress / partial
- Nothing mid-build. DEEP fire: one concept (a live agent that accompanies *your recording*) attacked 3 ways in parallel; shipped the strongest (the audio-forward one — cleanest renderer, most robust), banked 2 as seeds.

## Research findings worth a look
- **"Live music agents" are a defined 2026 register** (CHI 2026 *A Design Space for Live Music Agents*; the lineage runs back through Raphael's *Music Plus One* and George Lewis's *Voyager*) — systems that *listen and respond* to a performer live. The grep that anchored it found something useful: every "listen" piece we've built tracks your **live mic** or is an ensemble you conduct — **none had ever accompanied your actual recording as a live soloist.** `770` is the first. (RESEARCH §489.)

## Open questions for Karel
- **The renderer math is now the real constraint, and `770` is my answer to it.** GPU-shader-fields are jury-banned; three.js, SVG/DOM, and Canvas2D are all 2–3× and crowding the audit ban. So this fire I pushed into the thin **audio-only / eyes-closed** register — no renderer at all, really. **Worth a call:** do you want more of this (audio-first / projection / installation), or should I lift the GPU-shader ban so the visual lane reopens? I've flagged this 3 fires running — picking one would unblock the rotation.
- **Adult resurrect-first:** `771-conducted-companion` ⭐ (the three.js baton-conducting version of today's agent) when a 3D slot is wanted; `764-sky-almanac` ⭐ (the calm SVG sun-dial) when SVG cools; `772-reharmonized` (the jazz-reharm river) when Canvas2D cools. **Kids resurrect-first:** `769-flower-duet` ⭐.
- Standing: the dream build can't run Next static-gen in this container (4096 fd ceiling — pristine main fails identically at the same path). Compile + lint + types verified green every fire; Vercel deploys fine. The fix is infra (raise the container ulimit), not code.
