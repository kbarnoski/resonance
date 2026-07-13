# Morning digest — last updated 2026-07-13 ~10:40 UTC

Open the lab: https://getresonance.vercel.app/dream

## New since yesterday
- **[1578-dream-jump](https://getresonance.vercel.app/dream/1578-dream-jump)** — *Sing a phrase and the whole reality teleports — the **browser itself** liquid-morphs you into an entirely new hypnagogic room.* **Why open this:** it's the lab's **first-ever piece built on the CSS View Transitions API** — a genuine **#1 "technique never used in the lab"** (the exact criterion the jury said is the last wall to a clean 5/5). Every teleport swaps the whole DOM scene inside `document.startViewTransition()`, and the browser crossfades + scales + rotates + irises the *entire viewport* on the compositor — it's **pure DOM/CSS, off-GPU**, exactly the starving surface the jury asked us to feed (off the three.js/WebGL monoculture). Sing a sustained note → it jumps; pitch picks the next room's palette. **Best on Chrome with a mic** (a seeded idle demo auto-teleports hands-free too, and it renders identically everywhere via a complete fallback).

## Mode this cycle: WIDE (3 unrelated directions in one fire; shipped the strongest)
Three explorers, one each on the jury's three starving off-GPU surfaces. 2 banked to IDEAS §760 with full code:
- **⭐⭐ 1582-scripture** (banked, TOP ship-next — a **second** never-used browser API) — a mantra you TYPE comes alive as light using the **CSS Custom Highlight API**, painting shimmering character-runs with *zero* extra DOM nodes. Keyboard+tap played. Held back only because the text-shimmer reads quieter than a full-scene teleport at a phone glance — but it carries its own genuine #1 and is ready to ship.
- **⭐ 1580-breath-void** (banked, headphones night) — eyes-closed **HRTF binaural** void where your breath moves sound-bodies in 3D around your head and slowing down opens a cosmic tunnel. Wants headphones.

## Why this run matters
- **The novelty frontier just moved.** After five 0× algorithm/substrate cycles, I re-ran the grep discipline and found the **visual-algorithm well is essentially dry** — moiré, gyroid, caustics, WFC, Truchet, attractors, reaction-diffusion, etc. are all already shipped. The fresh **#1** lever is now un-mined **browser platform APIs** — and there are at least two more good ones sitting right here (View Transitions shipped tonight; **Custom Highlight banked, ready**).
- **Six novel substrates proven in six cycles** (WebCodecs → Houdini Paint → wavelet/CQT → AnimationWorklet → fractal flame → **View Transitions**), plus one more banked. Each is a live lever for the lab's first clean **5/5** — we've proven **#1** and **#2+#3+#4+#5** *separately*; the 5/5 just needs one build welding them: a novel API + **your real Path piano** + a genuinely fresh (<14-day) finding, over 2–3 cycles.

## Open questions for Karel
- **The ≥2-model AI-pipeline chain (audio→image→video) is still unbuilt after TWELVE juries asking** — blocked ONLY on your OK to spend a small per-prototype FAL budget (I can't spend unattended). One yes/no and I build it next.
- **Two ready-to-ship browser-API pieces are banked** (Custom Highlight `1582`, and last week's AnimationWorklet family). Want me to ship the Custom Highlight mantra next, or push toward the 5/5 weld with your piano?

## Honest notes
- **Repo recovery (again):** this container's local `main` had a forced-update divergence from `origin/main` (759's winner shipped on origin); I reset hard to `origin/main` before working. Nothing lost — flagging so the git log makes sense. (This keeps recurring — worth a look at how the web container is cloned.)
- **A methodology bug I caught & fixed:** my first novelty grep used `grep -E 'a\|b'`, where `\|` is a *literal* pipe — it silently returned 0 for things that actually exist (granular, HRTF, Karplus). I re-verified everything with correct regex before trusting a single "0×" claim. Logged in RESEARCH §760 so it doesn't recur.
- Winner validated headless: compile-mode build EXIT 0, route in both manifests, ESLint/TS clean, forbidden-token grep clean, no non-winner leaked. Full `npm run build` still dies only at the container's ~700-route file-descriptor ceiling — an infra limit that does NOT affect Vercel.
- **Not yet felt on real hardware:** no mic/display here, so only the fallback path ran — the felt voice→teleport tightness and whether the browser morph is *visibly* liquid want your Chrome. The idle auto-teleport + fallback guarantee it's never blank and renders everywhere.
- **#5 honesty:** ninth cycle straight, the strict <14-day research hunt came up dry. So the winner is an honest **3/5** (#1+#2+#3), not the 5 — we have the novel #1, still lack a fresh #5.
