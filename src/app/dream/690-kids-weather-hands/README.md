**For**: kids (4+)

# Weather in Your Hands

Hold the tablet like a tray, look away from the glass, and discover — with your whole body, no reading and no buttons — that being calm makes sunshine and moving wildly brings the storm.

## Why open this

A 4-year-old can change the *feeling* of music without touching the screen. Be still and the music sits in a bright, sunny world; sway, rock, wave the device, or hum and shout, and the harmony smoothly darkens into a storm — then glides back to sun the moment they settle. The lesson is pre-verbal: *the body shapes the music's emotion.*

## How it works

Three input subsystems feed one shared "energy" signal (0 = calm/sunny, 1 = wild/stormy):

1. **Device tilt** (`DeviceOrientation`) — tipping and swaying the held device accumulates as movement energy that decays back toward calm when you hold still.
2. **Device motion** (`DeviceMotion`) — shaking/waving adds acceleration energy (gravity baseline removed).
3. **Microphone RMS** — quiet play = sun, loud humming/shouting = storm. Movement and voice are blended into the *same* energy number, so either (or both together) can summon the weather.

That single energy value drives a continuous **mode-morph** in the Web Audio engine (`weather-engine.ts`). The full-bleed visual (`sky.ts`) is a soft sun↔cloud glow that *breathes* — faster and cooler as the storm grows. The screen is otherwise empty: all the play is in the ears and the body (off-glass, eyes-off).

Everything runs inside a single user gesture (the big "Begin" tap): the `AudioContext` is created/resumed and, on iOS, `DeviceOrientationEvent.requestPermission()` / `DeviceMotionEvent.requestPermission()` and mic permission are requested there.

### Graceful degrade (never silent, never dead)
- No motion sensor → falls back to **mic energy** alone.
- No mic either → falls back to a **gentle autonomous weather drift**.
- Before audio is even unlocked → the **glow still animates**, so a glance is alive.
- **~2.5s idle auto-demo:** if no one interacts (or before sensors are granted), the sky gently auto-cycles sun→cloud→sun on its own, so an unattended glance at the deployed page shows the sky breathing and morphing.

### Ear-safe
Soft attacks/releases, a `DynamicsCompressorNode` limiter, and a low master gain cap (~0.3). No sudden loud transients — safe near a sleeping sibling.

## The harmonic mechanic — a real mode flip, not a pentatonic snap

The engine keeps a steady root drone (A2) and a stable perfect fifth in *both* worlds. What actually moves is the **third** and the **sixth** — the scale degrees that *define major vs. minor*:

- The **third** is a single oscillator whose pitch **bends** continuously from a major third (+4 semitones) at energy 0 to a minor third (+3 semitones) at energy 1. You literally hear the interval slide, so the mode flip is *audible as a moving pitch*, not just a level change.
- The **sixth** is a crossfaded pair: a major/Lydian-bright **major sixth** (+9) fades out while an **Aeolian minor sixth** (+8) fades in.
- A bright **Lydian #11 sparkle** sits on top in the sun and fades as it clouds over; a tense **♭7** and filtered rain/wind noise fade *in* as it storms.

This is a genuine harmonic event: the chord changes *quality* (major ↔ minor) by shifting its defining tones. It is explicitly **not** a pentatonic scale-snap — there is no "pick a safe note from a pentatonic scale so nothing sounds wrong." Instead the child is given continuous, embodied, expressive control over the **mode** itself, which is the thing that carries a piece's emotional character.

## Named references

- **Music-cognition / embodied pedagogy.** Children's perception of musical *expressiveness* is modulated by their own and observed body movement — moving the body changes the perceived expressive character of what is heard. This is the embodied basis of **Reggio Emilia** music education. The piece operationalizes this as embodied, expressive control of musical mode.
- **Brian Eno's generative-ambient weather systems.** The autonomous drift and idle auto-demo — a sky that keeps quietly evolving with no one playing — are modeled on Eno's generative ambient approach.

## Known limitations

- Tilt/motion thresholds are hand-tuned constants; real-world phones vary, so the calm↔storm sensitivity may need per-device calibration.
- Desktop browsers usually expose no motion sensors, so on a laptop the piece runs in mic-only or autonomous-drift mode — the full body-play needs a phone/tablet.
- iOS requires HTTPS and a user gesture for both sensors and mic; if the reviewer declines either prompt, it silently falls back (mic → drift) rather than erroring.
- The microphone is analysed for RMS only and is never connected to the output (no feedback) and never recorded or sent anywhere — no network calls at all.
- Mode-morph is a single continuous axis (mode + brightness + texture move together); it deliberately does not expose tempo, melody, or key as separate controls — the point is one whole-body gesture, one emotional dimension.
