// Plain-text design notes surfaced in the in-app modal. Kept in sync with
// README.md (which carries the fuller self-assessment).

export const README_TEXT = `Magnet Basin — play deterministic chaos: release a magnetic pendulum, watch which magnet captures it, hear the capture ring.

THE ONE QUESTION
What if you could PLAY deterministic chaos — release a magnetic pendulum, watch which magnet catches it trace out an infinitely-detailed fractal boundary, and hear each capture as a tone in an evolving chord?

THE PHYSICS
A damped pendulum bob swings over three fixed magnets. Every timestep three forces act on it: a linear RESTORING pull toward the pivot (−k·p), viscous FRICTION (−c·v), and attraction toward each magnet, softened by a small height offset so the pull stays finite: strength·(mᵢ−p)/(|mᵢ−p|²+h²)^(3/2). Which magnet finally captures the bob depends with infinite sensitivity on where it started — the release plane is carved into fractal BASINS OF ATTRACTION, one colour per magnet, whose shared boundary is a fractal set. That is deterministic chaos: fully determined, yet practically unpredictable near the boundary.

THE MAP
The warm-metal field is that basin map, computed on the CPU a few rows per frame and uploaded to a GPU texture in three.js. Each pixel is colour-coded by its captor magnet — copper, brass, verdigris — and darkened by how LONG it took to settle, so the fractal boundary appears as a dark filigree threading between the smooth interiors.

PLAY IT
Click or drag anywhere on the plane to release a bob from that point; a bright trajectory integrates in real time and spirals toward its captor. Release near a basin interior and it settles fast on one clean tone; release near a boundary and it wanders — long, uncertain, musically alive — before it commits. Drag a magnet to reshape the whole basin (and re-tune it). A seeded auto-demo releases a few bobs on load so the screen is never dead.

THE SOUND (NON-JI)
Harmony is geometry-derived and equal-tempered — NOT just intonation. Each magnet's ANGLE around the pivot picks a degree from a 12-tone equal-tempered pentatonic (semitone offsets 0,2,4,7,9); its RADIUS picks the octave. So every magnet owns a pitch, and dragging it re-tunes it. In flight a sustained voice glides toward the inverse-distance blend of the magnet pitches while a low-pass filter opens with the bob's speed. On CAPTURE the captor rings an INHARMONIC bell (stretched partials 1, 2.01, 2.76, 5.40, 8.93) — several captures pile into an evolving, shimmering chord.

DETERMINISM
Fixed timestep, integer frame counter, AudioContext clock. The only randomness is the auto-demo's release jitter and the reverb impulse, both drawn from a mulberry32 seeded with 0x2020. No Math.random / Date.now / performance.now.

REFERENCES
The magnetic pendulum / three-magnet toy. Basins of attraction and sensitive dependence on initial conditions (Poincaré; Julia–Fatou-style fractal boundaries). Deterministic chaos.`;
