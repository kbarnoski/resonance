# Morning digest — last updated 2026-10-01T13:13Z (05:45 PT fire, cycle 1272)

> **Jury verdict today**: The lab finally broke its biggest habit — it *finished* two things instead of just making new ones (`throatmorph` is a clean 5/5, `chordfold` reads your recording's own chords and harmonizes to the moment), the broken-git-head problem fixed itself this morning, and the only thing I'm now watching is that "finishing" doesn't become its own rut: your last four pieces are all two-hand DSP-morphs, so tomorrow I'm pushing it back off two hands — tone today is **strongest window in weeks, one new watch.** See `docs/dreams/JURY.md`.

## New since yesterday
- **`18512-facescore`** → https://getresonance.vercel.app/dream/18512-facescore
  Open this one — it looks and feels unlike anything in the last two weeks. Your
  **face conducts the phrasing** of one of your recordings, drawn as a **living ink
  line-score on bone paper**. Soften and open your face and the piano blooms into
  long **legato** (a feedback delay built from the take itself) — the ink line
  thickens into unbroken arcs with tie-tails trailing right. Tighten your face and
  it clips to **dry, articulate** attacks — the line breaks into staccato dashes and
  short ticks. Brow raises the brightness; tilt your head to lean the sound L/R.
  This was a deliberate break from the glowing-particle-field look — SVG, not
  WebGPU/WebGL — to answer your "too similar in design and theme."

## In progress / partial
- Nothing half-built. This was a **WIDE ×3** fire: three *different* embodied verbs
  built in parallel. The SVG face-phrasing piece shipped; two strong siblings are
  banked and near-ship — **`swellbody`** (open/close your whole body to swell or hush
  the take like a dynamics pedal → a thermal "body of light") and **`steppulse`**
  (bounce in place; your pulse becomes a tempo and re-articulates the piano on your
  beat). `swellbody` is basically next-fire-ready.

## Research findings worth a look
- **Expressive Robotic Pianist — Musical Dynamics** (arXiv:2609.10844, 2026-09-09):
  a robot hand that models **keypress velocity → score dynamics** as a first-class
  axis. All three builds this fire *invert* it — the body dictates the recording's
  **dynamics / phrasing**, the oldest human expressive axis, which the lab had barely
  conducted (we'd been camped on harmony, timbre and time).

## Open questions for Karel
- **30-second check:** does facescore track your face, and does opening/closing it
  audibly move between legato and staccato? (Cloud can't test a camera or play audio
  — the demo drive, audio graph and full control path are code-verified; only the
  live feel and the sound on your real take are unconfirmed.)
- **Score-follower** (your recording follows *you* via onset/beat detection) — still
  the jury's standing ask, offered 7×, awaiting your one word over the camera
  directive. Green-light it or it comes off the board.
- `main` synced cleanly again (no force-rewrite) — second quiet fire in a row.
