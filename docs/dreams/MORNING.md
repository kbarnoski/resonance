# Morning digest — last updated 2026-06-12 (UTC, cycle 402)

> **Heard the jury.** Provocation #6: *"518-living-ember is the one kids piece with memory that rewards return across days — extend THAT — a creature a child finds genuinely changed tomorrow, not another 90-second glow toy."* This cycle does exactly that.

**Cycle 402 · KIDS · DEEP (3 approaches, one concept) → `549-kids-song-friend`.**
Open it: **https://getresonance.vercel.app/dream/549-kids-song-friend**

## New since yesterday
- **🎵 549-kids-song-friend** — *a creature literally made of the songs your kid sings it.* Hum or sing; it snaps your voice to a pentatonic melody, grows a **petal shaped like that melody**, and **keeps every song forever, across days**. Come back tomorrow and it greets you, is bigger, and **sings your songs back — woven together and changed.** It has a little face that opens its mouth when it sings.
  - *Why open it:* it's **cycle 2 of 518-living-ember**, but where 518 remembered a vague *energy*, this remembers the actual *songs* — and you can SEE them (each petal traces the pitches you sang). It changes because of *what your kid sang*, not a timer (that's how it's different from the older voice-garden plant).
  - **No waiting / no permission needed:** it loads already knowing a couple of "yesterday's songs" and sings them hands-free. Tap **"✨ pretend it's tomorrow"** to watch it grow + re-sing instantly — you don't have to wait a real day to see the payoff.

## Explored but not shipped (2 more — see IDEAS §402)
- **547-kids-songkeeper** — same idea as a glowing **three.js** creature, each song an orbiting strand. Richest "alive" feel; lost only because three.js just shipped yesterday (545) and petals-with-a-face read clearer for a 4-year-old.
- **548-kids-songbloom** — same idea as a **bioluminescent deep-sea creature** (WebGL2 shader) grown from your song history. Gorgeous; lost because a full-screen shader is the *least* legible "you can see your own songs" — no face, no character.

## The jury scorecard (honest)
- Clears **3/5** (≥3 subsystems · Tamagotchi/Eno refs · extends the Companion/Presence spine). The interesting-but-contestable #1 (remembering melodic *content* across days, body drawn from the contours) I discounted honestly — localStorage persistence itself isn't a lab-first (322 already ages a creature).
- **#5 still didn't bind** — cs.SD is all server-ML again; the one genuinely relevant fresh finding (a 2026 study: young kids bond with a voice companion that *remembers* them, not one that's merely novel) backs the design but isn't verifiably <14 days. Said plainly.

## Open questions for you
- **Does pitch-tracking actually catch a 4-year-old's voice?** The core risk: a child's voice is high/breathy and autocorrelation can octave-slip. I added a "babble-note" fallback so *any* sound still teaches it something — but if capture feels off when you test with a real kid, tell me and I'll tune the thresholds (or promote 547, whose detector is a touch more conservative).
- **Cycle 3 direction?** Two options: (a) let the friend *compose a genuinely new song overnight* by combining what it learned, or (b) a call-and-response game ("sing the part it forgot"). Which is more your kid?

## Heads-up
- Build-verified (full `npm run build`, exit 0, 438/438 pages, zero warnings in the folder), **not** browser-verified — no mic/audio in the cloud sandbox. Pre-seeded memory + "pretend it's tomorrow" are the safety nets so the glance always shows a friend made of songs.
- No new deps, no API route, pure client (mic stays local — never recorded or uploaded). Memory lives only in *your* browser's localStorage.
