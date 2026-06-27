# Morning digest — last updated 2026-06-27 ~06:20 UTC (cycle 570, kids · WIDE)

> **The jury's hardest KIDS asks** (JURY 2026-06-26): #1 *"pentatonic-no-wrong-notes is the new kids crutch — ban it; a 4-year-old can hold REAL harmony in one finger."* #3 *"force a non-pointer input — drag-on-glass is back to 7×."* #4 *"verification debt is the #1 liability — 15/15 builds are machine-unverified; hand-verify the strongest before shipping a 16th."* Today's winner answers all three. See `docs/dreams/JURY.md`.

Open the lab: https://getresonance.vercel.app/dream

## New since yesterday
- **[/dream/981-kids-happy-sad-tree](/dream/981-kids-happy-sad-tree) — Happy / Sad Tree** ⭐ (cycle 570, kids). **Tap glowing fruit to play a melody, then flip ONE giant ☀️/🌙 switch — the SAME song, SAME taps suddenly feel happy or tender as the whole world melts between real parallel C-major and C-minor.** It's real diatonic harmony (the lowered 3rd/6th/7th do the feeling), **not** a pentatonic safety scale — and flipping the switch voice-leads the held chord to the new mode over ~400ms while the sky crossfades gold↔indigo, so it *melts* instead of cutting. Grounded in 2026 dev-psych: kids at 4–6 already hear major-as-happy / minor-as-tender (it's the *late-maturing* affect dimension — the one worth practicing). **Why open it:** it's the most literal "feel real harmony" toy in the lab — and the **easiest piece we've ever shipped to actually verify**: zero permissions (no mic/camera/sensor), plays + sounds the instant you open it, idle ghost auto-plays a phrase if you just look. **Please give it 60 seconds of your ears this morning** — it directly dents the verification-debt liability.

## This was a WIDE fire — 3 non-pointer/real-harmony explorers; 2 banked (IDEAS §570)
- **982-kids-shake-bells** — SHAKE the phone off-glass to ring a real **G-Mixolydian** bell ladder (climbs/descends with how hard you shake; Orff Schulwerk). Built + clean; banked because accelerometer needs real-iPad calibration.
- **983-kids-breath-meadow** — *blow* into the mic (breath **energy**, not pitch) to swell a voice-led **D-Lydian** chord as flowers bloom. Freshest input concept; banked because mic-breath thresholding is the least reliable on first try.
- All three answered JURY #1 (real harmony) + #3 (non-pointer) three different ways — tap / shake / breath. Winner chosen on JURY #4: the one you can actually hear without permissions.

## Research that drove it (RESEARCH §570)
- **MDPI *IJERPH* child-music review + *Applied Sciences* 2026** (mode/key→emotion in performed **piano**): the happy/sad-by-mode percept is already installed at 4–6 and matures *later* than tempo — so a one-switch parallel-mode flip is the developmentally *correct* move, not a dumbed-down one.

## Open questions for Karel — verification debt (jury's #1 liability, 3+ juries running)
- Builds are compile/lint/type-clean but **never run** — the container has no audio/camera device and Next static-gen still dies on the locked ~4096 fd ceiling (`EMFILE`), so I can't self-verify at runtime. Two real fixes, both need you: **(a)** raise the container fd ceiling so static-gen runs locally, or **(b)** the 60-second hand-verify — and **981 is the easiest target yet**: open it, tap a few fruit, flip ☀️↔🌙, tell me if the happy↔tender flip lands.
