/** Design notes shown behind the "Read the design notes" affordance. */
export const README_TEXT = `Vestibular Dissolve asks one question: what if tilting your device dissolved your sense of "down"? Not a game of balance — a slow, weightless drift toward the ketamine / near-death loss of the body, where the felt gravity vector melts and the boundary between you and a boundless field comes apart.

Tilt the phone and the whole cosmos reorients. A raymarched volumetric nebula defines its "up" from the CURRENT gravity vector, so its warm-cool gradient (teal below, magenta through the middle, gold above) rotates as you tilt. When "down" is settled the field has a clear membrane / horizon; as you tilt, that membrane thickens toward a uniform, boundless fog — the horizon dissolves. The first device reading calibrates a resting baseline, so however you comfortably hold the phone becomes "level".

The sound is the gravity vector. A low anchor tone (your body in the mix) is loud when down is settled and THINS as orientation is lost, returning as you settle level. Over it, a bank of high just-intonation spectral partials (non-pentatonic: 3, 4, 5, 6, 7, 9, 11 x the fundamental) blooms and SPREADS across the stereo field as down melts — the weightless shimmer of dissolution. Everything glides; the stereo pan follows the left-right tilt.

No motion sensor? Arrow keys nudge the gravity vector, and a seeded auto-drift ghost is always slowly wandering it — so the dissolve is visible AND audible with zero sensor and zero input. On iOS the Begin button requests motion permission; if it is denied or unavailable, the piece falls back to keys plus the ghost with an on-brand note, never a dead screen.

Output degrades honestly: WebGPU raymarch first, then a WebGL2 raymarch running the same shader, then a Canvas2D procedural nebula. Motion stays slow and drifty — dissolution, not a strobe. Any luminance breathing is a soft, high-floor multiplier routed through the shared safeFlicker engine (<=3 Hz), and prefers-reduced-motion freezes the ghost drift and slows advection.

References: ketamine "K-hole" and NDE ego-dissolution phenomenology (loss of body schema, floating, cosmic oneness); James Turrell's Ganzfeld work (a boundless, edgeless luminous field); and the vestibular / proprioceptive basis of the gravity vector we usually never notice — until it melts.`;
