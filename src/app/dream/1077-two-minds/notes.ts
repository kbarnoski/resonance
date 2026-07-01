// Design notes rendered inline (no README route). Kept as a plain string so the
// page can format it without any markdown dependency.

export const NOTES_MD = `# Two Minds

Two people, apart, whose separate rhythms slowly ENTRAIN — the piece makes the
invisible inter-brain synchrony between them visible and audible.

## The one question

What if a psychedelic experience could be *shared*: two beings approaching across
a void until they meet, and the synchrony between them becomes something you can
see and hear?

## How to experience it

- Tap a pulse: Spacebar, or click / tap anywhere on the field.
- Open this page in a SECOND browser tab to become the partner — the two tabs
  couple instantly over a BroadcastChannel, no server.
- With no partner present, a synthetic **guide** appears. It starts at an OFF
  tempo and, over ~35 seconds, drifts toward matching your tempo and phase — so
  the whole apart → approaching → merged arc plays out on a single tab.
- If you never tap, a gentle self-pulse keeps the piece alive on its own.

## What you are seeing

- Warm presence (amber / rose) is you; cool presence (violet / cyan) is the
  other mind. Each pulses on its own beat.
- As the synchrony index rises the two presences drift toward centre, a woven
  interference figure grows and sharpens between them, and at full lock they
  blend to a shared gold-white.
- The large readout is the synchrony index — the emotional core of the piece.

## What you are hearing

- Two drone voices, one per mind, that beat against each other when out of sync
  and ramp toward unison as you lock — you HEAR the minds meet.
- Each tap is a soft just-intonation bell panned to that mind's side.
- Sustained high synchrony blooms a collective chord; the reverb opens; the
  field brightens — the ecstatic peak — then it can breathe back down.

## The grounding

The neural signature of shared trance / collective states is **theta-band
frontotemporal inter-brain synchrony**, as surveyed in the Frontiers (2026)
narrative review of inter-brain synchrony in mindfulness / meditation
hyperscanning. This piece dramatizes exactly that: two minds falling into sync.

## The math

Each mind is a Kuramoto phase oscillator (Kuramoto, 1975; Strogatz, *Sync*,
2003): dφ/dt = 2π·f + K·sin(φ_other − φ_self). Tapping near the partner's beat
lets the coupling K pull the phases together, so lock feels earned. The
synchrony index is the phase-locking value |mean(e^{iΔφ})| over a short sliding
window of the phase difference, slewed so it reads like a felt state.

## Safety

No strobe. Pulses and blooms are eased (fast rise, slow luminous decay);
luminance changes stay smooth and well under 3 Hz.`;
