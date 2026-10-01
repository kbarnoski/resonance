# Morning digest — last updated 2026-10-01T01:22Z (05:45 PT fire, cycle 1271)

> **Jury verdict today**: The lab finally broke its biggest habit — it *finished* two things instead of just making new ones (`throatmorph` is a clean 5/5, `chordfold` reads your recording's own chords and harmonizes to the moment), the broken-git-head problem fixed itself this morning, and the only thing I'm now watching is that "finishing" doesn't become its own rut: your last four pieces are all two-hand DSP-morphs, so tomorrow I'm pushing it back off two hands — tone today is **strongest window in weeks, one new watch.** See `docs/dreams/JURY.md`.

## New since yesterday
- **`18416-chordfold`** → https://getresonance.vercel.app/dream/18416-chordfold
  Open this one. It's **fluxweave's cycle-2, and it claims criterion D** — the
  multi-cycle "finish what you make" the jury has flagged as unclaimed by *anybody*
  for six verdicts. Fluxweave fanned your take into a *fixed* chord of itself;
  chordfold reads your recording's **own chord track** and re-voices the fan to
  **whatever chord is actually playing right now** — pull your hands apart over a
  minor passage and the fan sounds minor; over a major chord it warms and sounds
  major, gliding smoothly as the harmony moves. The current of light tells you the
  harmony too: its hue tracks the chord root around the circle of fifths and
  warms/cools with major vs minor (a new restrained `harmonic-chroma` register —
  off the banned amber & cyan/violet, not the pearl of fluxweave). Hands together =
  clear unison; raise them to swell the chord; move faster to shimmer it.

## In progress / partial
- Nothing half-built. This was a DEEP ×2 fire: two harmony methods built in
  parallel; chordfold (parse the real chord's own notes) shipped; `chordwell`
  (key/scale voice-leading glide + chord-change surge) was banked to IDEAS as the
  cycle-3 merge candidate — fold its smooth part-writing onto chordfold's richer parse.

## Research findings worth a look
- **MIDIBack** (arXiv:2609.28008, 2026-09-23): harmony-aware singing pitch
  correction — a note is corrected *by the chord around it*, not to a fixed grid.
  That premise is exactly what chordfold implements over your catalog, and it points
  at a cycle-3: nearest-neighbor voice leading so the added voices move by the
  smallest step from chord to chord (chordwell's banked idea).

## Open questions for Karel
- **30-second check:** does chordfold track your hands on your webcam, and does the
  fan audibly follow the chords? (Cloud can't test a camera or play audio — the
  demo drive, audio graph, chord parser, and control path are all code-verified; the
  live feel and the sound against your real take are the only unconfirmed parts.)
- **Score-follower** (your recording follows *you* via onset/beat detection) — the
  jury's standing ask, offered 7× and awaiting your one word over the camera
  directive. Green-light it or it comes off the board.
- Good news on the recurring one: `main` did **not** get force-rewritten this fire —
  origin was a clean fast-forward (your 15 hero shaders). First quiet sync in ~6 fires.
