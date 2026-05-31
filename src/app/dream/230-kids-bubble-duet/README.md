# 230 — Bubble Duet

**For**: kids (3+)  
**Route**: `/dream/230-kids-bubble-duet`  
**Built**: Cycle 264 (2026-05-31)  
**Status**: demoable

---

## The idea

Two soap bubbles float on a starry canvas — YOU (pink) and FRIEND (cyan). Tap your bubble to play a pentatonic note. Your friend listens, then sings back a consonant reply 1.2 seconds later. The dashed arc that appears between them during the exchange is the "conversation thread."

No wrong notes. No game over. An infinite musical back-and-forth with a character who always responds.

---

## What's new

**First kids prototype where the responder has a distinct character identity.** Prior call-and-response prototypes (`213-kids-echo-drum`, `142-kids-echo-canon`) use a generic system to echo back. Bubble Duet has TWO named characters — a face in one bubble, a music note in the other — and the exchange has a social framing: your friend heard you and wants to reply.

**Musical harmony baked into the response lookup.** Every YOU note gets a consonant partner:

| YOU plays | FRIEND responds | Interval |
|-----------|----------------|----------|
| C3        | G3             | Perfect 5th up |
| E3        | A3             | Perfect 4th up |
| G3        | C4             | Perfect 4th up |
| A3        | C3             | Octave below   |
| C4        | G3             | Perfect 4th below |

No matter which note the child triggers, the response sounds harmonious. The child doesn't need to know music theory — they just discover that it always sounds "right."

**Dashed arc connection thread.** The quadratic curve drawn between the two bubbles during FRIEND's response is the first visual "conversation thread" between two characters in the kids zone. It appears when FRIEND is singing and fades when the exchange ends.

---

## Mechanics

- **Idle**: YOU bubble pulses with a warm rose glow. FRIEND is dim and quiet.
- **Tap YOU**: bounce animation + random pentatonic note + 14-sparkle burst.
- **Thinking (1.2s)**: FRIEND bubble slowly brightens, anticipating the response.
- **Singing (0.9s)**: FRIEND bounces, plays consonant response, 16 cyan sparkles arc toward YOU, dashed connection arc appears.
- **Back to idle**: "your turn ♪" label, YOU glows again.

---

## Design principles applied

- **BANDIMAL**: not applicable (both bubbles same size to indicate equality; future variation: bigger YOU bubble = lower pitch ownership).
- **Immediate response**: tap → bounce + sound in < 50ms (Web Audio precision scheduling).
- **No wrong notes**: pentatonic scale + consonant response table.
- **No fail state**: child can tap as fast or slow as they want; FRIEND always responds.
- **No permissions**: no mic, no camera, no gyroscope. Pure pointer events.

---

## Audio

Triangle oscillators with Hann-window envelope (4ms attack, exponential decay to 0.001 over 900ms). Ambient C3+G3 sine pad at gain 0.013/0.008 from first tap — barely audible, but prevents the "is it broken?" silence before interaction.

---

## What to try next

1. **Add a third "grandparent" bubble (purple)** that joins after 5 exchanges and plays the sub-bass root below both — growing the ensemble from duo to trio.
2. **Pitch zones**: make YOU bubble's vertical position at the moment of tap determine the note (higher tap = higher pitch), so the child has agency over the melody.
3. **Mic mode**: hum into the mic → YOU bubble plays the closest pentatonic match to your voice pitch → FRIEND responds.
