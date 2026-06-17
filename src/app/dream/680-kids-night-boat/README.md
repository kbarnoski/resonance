**For**: kids (4+)

# Night Boat

## The one question
What if a 4-year-old could *feel* a musical sentence finish — by gently rocking a
tablet like a boat or cradle, eyes off the screen, and hearing the music
almost-end-wrong (a deceptive cadence) and then truly land home (an authentic
cadence)?

## How to play
1. Tap **Begin** (this unlocks the audio and, on iOS, asks for motion
   permission inside the tap, as Safari requires).
2. Hold the tablet flat and **rock it gently side to side**, like rocking a
   cradle. No reading needed; there is nothing to get wrong.
3. Close your eyes. Steady rocking lulls the boat and pulls the music toward
   *home*. When it lands home you'll hear a warm bloom and a soft sparkle.
4. Keep rocking it "to sleep" — the lullaby slowly fades over ~11 minutes.

The screen stays near-black on purpose: this is an **audio-first / off-glass**
piece. One little boat glows on a moonlit sea so that a silent glance still
reads — it dips and dims on a deceptive cadence, blooms warm and settles on an
authentic one, and breathes with your rocking. All the *meaning* is in the ears.

## The harmonic mechanism
The piece is a barcarolle/nocturne in **F major**, a gentle rocking 6/8 feel,
with an always-on pad so it is never silent. A **phrase state machine** drives
real functional harmony (I, ii, IV, V, vi as actual triads, retuned with smooth
voice-leading via `setTargetAtTime` — *not* a pentatonic "no-wrong-notes" toy).

Every phrase wanders the diatonic chords and arrives on **V**, the dominant —
the chord of maximum "we want to go home" tension. From V there are two
endings. A **deceptive cadence (V→vi)** sidesteps home: instead of resolving to
the tonic it slips to the relative minor — the ear braces for "home" and gets a
soft, bittersweet surprise (the boat dips, the light dims). An **authentic
cadence (V→I)** is the real arrival: tension releases onto the tonic and it
*sounds finished* (the boat settles, a warm bloom and sparkle). Early phrases
tend to deceive; each deception, and steady calm rocking, increases the pull
toward home, so after one or two feints the music finally lands on V→I — the
child's reward for rocking it to sleep.

## Named references
- **Deceptive cadence (V–vi)** and **authentic cadence (V–I)** from functional
  harmony — the two endings this toy contrasts.
- The **lullaby / barcarolle** tradition: gentle rocking in 6/8 (the "boat
  song").
- **Brahms', *Wiegenlied* (Lullaby, Op. 49 No. 4)** as the archetypal child's
  cadence — a tune whose whole comfort is the certainty of how it lands home.

## Graceful degradation
If there is no motion sensor, permission is denied, or no motion arrives within
~1.5s, it falls back to **dragging up/down anywhere to rock the boat** (reason
shown in rose text), and an **auto-demo** rocks the boat by itself and plays the
full deceptive→authentic arc hands-free until real rocking seamlessly takes over.
