# 3720 · relay

**What if Resonance could be played from a real MIDI controller in the browser — a one-take recording desk where timing is the stake: notes on the click ring clean and gild the take, notes off the click visibly SCAR it, and the take is sealed when you're out of commits?**

A scrolling take-ribbon against a metronome grid. A steady click runs. Every note you play becomes a continuous-pitch voice, and the desk judges one thing only: *how close to the click you landed.*

## How to play

- **Start the take.** Audio begins on the gesture.
- **Play in time.** Use a **MIDI controller** (plug it in before Start — the badge names the device) or the **QWERTY** home row: `A W S E D F T G Y H U J K …` map to a chromatic run from middle C. Velocity → brightness/loudness.
- **Watch the scars.** Land a note inside a tight ±55ms window of the click and it snaps to the grid as a clean **violet** mark, adding an octave sheen to the loop. Miss it and the note stays *exactly where you played it* — a **red scar** offset from the grid line by its real timing error, roughening the loop with detune and a grain of noise. The offset readout (`+42ms late` / `−70ms early`) tells you what you did.
- **The budget seals the take.** You get **20 commits**. The counter only falls. At zero the take **seals** and loops forever — clean where you were tight, scarred where you rushed or dragged. **Reset** starts a brand-new blank take.

## The stakes

This is a *one-take* desk. There is no undo — a scar is permanent, and every commit spends part of a shrinking budget. The tension is timing under a finite, irreversible cost: play it safe and slow, or push and risk scarring the loop you have to live with. **It models nothing. The consequence is your own performance.**

## The technique

Web MIDI note-in → micro-timing analysis against a running click. Each note-on is timestamped against the audio clock, its phase measured against the eighth-note grid of an 8-beat loop, and the signed error (in ms, scaled by BPM) decides **reward vs. scar**. Clean notes lock to the grid and gild; scarred notes keep their real offset and roughen. Pitch is fully chromatic — `440·2^((n−69)/12)`, no pentatonic/just snapping — because the instrument here is *time*, not note choice. A look-ahead scheduler drives the click, the live monitor, and the sealed loop.

## AUTO mode

A headless reviewer has no MIDI hardware and won't touch the keyboard. So when `navigator.requestMIDIAccess` is unavailable/denied or no device is connected, a seeded **AUTO** performer plays the take itself — deliberately hitting some notes clean and pushing every third note off the beat — so the reward / scar / seal mechanic is always visible and audible, sealing within ~30s. QWERTY interrupts AUTO and hands you the desk; a real controller always takes priority.

## Notes

This is the lab's first **Web MIDI hardware input** — the still-unused wire — in service of live performance: a real instrument in your hands, driving the browser.

`state/vibe: performance/one-take-desk · pole: n/a · INPUT: web-midi-hardware(+qwerty/auto) · OUTPUT: Canvas2D · TECHNIQUE: MIDI micro-timing scoring + irreversible scar/seal`
