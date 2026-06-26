# Morning digest — last updated 2026-06-26 ~22:15 UTC (cycle 566, kids · DEEP)

> **Yesterday's jury** asked (provocation #1, kids): *"pentatonic-no-wrong-notes is the new kids crutch — ban it; give a child a real mode, a functional progression, or genuine tension/resolution."* This kids cycle answers it with a toy a 4-year-old can play with their *hands and balance*: tilt the tablet, feel a real V7→I cadence resolve. See `docs/dreams/JURY.md`.

Open the lab: https://getresonance.vercel.app/dream

## New since yesterday
- **`974-kids-tilt-cadence`** ([open it](https://getresonance.vercel.app/dream/974-kids-tilt-cadence)) — **TILT the tablet to roll a glowing marble HOME through a tension-and-resolution meadow.** Three color-coded wells *are* real harmonic functions — **gold = Home (Tonic)**, **green = Away (Subdominant)**, **orange = Pull (Dominant 7th)**. Roll the marble out of the restless orange well and into the gold one and a real **V7→I authentic cadence** fires: the leading tone resolves *up*, the seventh resolves *down*, sparks burst, flowers bloom — *tension → home, learned in the hands.* **Why open it:** it's a child holding genuine functional harmony with no safety scale, and it's driven by **tilt** (not a finger on glass — the jury flagged drag-on-glass back to 7×). On a laptop: drag the tilt-pad or use arrow keys; leave it ~3s and it auto-rolls a full cadence by itself.

## Why this one, this morning
DEEP fire — one concept ("feel a V7→I cadence in your hands by tilting"), two interaction models. The **discrete-wells** version shipped over the **continuous-hill** version because for a 4-year-old, three bold color-coded targets give a clear, *repeatable* magic moment (color is the kids language) — a continuous gradient has no target and a payoff they'd have to *time*. Both are real functional harmony, both dodge every jury ban. It also resurrects the ⭐ tilt seed I've been banking for three cycles, and breaks a small rut: the last two kids ships (969, 972) were both *sing-into-a-mic*; this is a completely different body and sensor.

## Also explored tonight (banked, not shipped — full seed in IDEAS §566)
- **`975-kids-tilt-hill`** ⭐ — the **continuous tension-gradient** twin: no wells, one smooth glowing sunset hill where *harmonic tension = altitude*. Tilt to climb into the Dominant (the leading tone + seventh swell and beat harder as you rise), release to slide home — the cadence as one exhaled breath. It's the *purer* embodiment of today's research (movement should carry a felt *quality*, not just trigger a chord). Resurrect-first, or graft its continuous tension-trail *between* 974's wells next cycle.

## Research finding worth a look (RESEARCH §566)
- **CHI 2026 "From Movement to Sound and Back"** — the field formalized movement→sound→movement as its own 2026 workshop, and the children's-sonification work insists the mapping carry a *quality* (effort, tension, settling), not a trigger. That's what reframed tonight's tilt toy: tilt should let a child *feel tension build and release*, not just pick a chord.

## Open questions for Karel
- **Verification debt is still the jury's #1 standing liability** (~20 builds green-by-compile, ~0 actually heard — no audio/sensor device in my sandbox; Vercel deploys fine). Good news: **974 is hearable on any laptop** (drag-pad / arrow-keys fallback + auto-demo — no tilt phone needed), like 970-gong and 973-wave-terrain. **Want me to spend the next cycle hand-verifying the strongest hearable builds instead of shipping a 21st unheard one?**
- The two tilt constants (`TILT_SENSITIVITY`, `DOWNHILL_ACCEL`) are surfaced at the top of `physics.ts` for quick real-device tuning — if you try it on an iPad and it feels too touchy or too sluggish, those are the two numbers to nudge.
