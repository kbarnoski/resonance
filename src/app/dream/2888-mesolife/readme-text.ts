// Plain-text design notes surfaced in the in-app modal. Kept in sync with
// README.md (which carries the fuller self-assessment and references).

export const README_TEXT = `Mesolife — a liquid crystal that is ALIVE: a self-stirring active nematic that never stops churning, birthing and annihilating topological defects, rendered as glowing crossed-polarizer birefringence you can tilt and shear.

THE ONE QUESTION
What if a liquid crystal were alive — an active nematic that stirs itself forever, in perpetual turbulent churn, seen through crossed polarizers as oil-film iridescence you can tilt and shear?

THE DIRECTOR FIELD
A nematic is a fluid of rod-like molecules with an orientation θ(x,y) but no head/tail — θ and θ+π are the same rod. We store the DOUBLED-ANGLE vector u = (cos 2θ, sin 2θ) in a GPU texture, which is exactly why ±½ defects (the physical ones) appear naturally: a full 2π loop of u is only a ±½ winding of θ. These half-integer defects are little self-propelled "rods" — comet-like +½ cores that swim, and three-fold −½ cores that spin.

WHY IT IS ALIVE (ACTIVE SELF-STIRRING)
Each step the field does three things on the GPU (ping-pong framebuffers):
1. ELASTIC RELAXATION — u diffuses toward its neighborhood average (Frank one-constant elasticity ≈ a Laplacian), healing distortion.
2. ACTIVE FLOW — the director generates its own flow. Active stress ∝ ∇·Q, and with Q built from u this reduces to a velocity read straight off the gradients of u. The field advects itself (semi-Lagrangian back-sample). Seeded noise perpetually nucleates new defects, so it never freezes to uniform and never explodes — it stays in living turbulent churn.
3. CONFINEMENT — near the dish edge the director is biased tangential, organizing the chaos into circulating cells. Raise "Confinement" to feel the churn coil into orbits.

CROSSED-POLARIZER BIREFRINGENCE
The picture is real optics. Through crossed polarizers a birefringent film transmits I = sin²(2(θ−α)) · sin²(Γ/2), where α is the polarizer angle (slowly rotating here) and Γ is the optical retardation. We scale Γ with local distortion energy |∇θ|², so stressed regions and defect cores blaze. Γ is then mapped through an iridescent thin-film cosine palette for the jeweled oil-film color, with gentle feedback bloom for luminous smear.

TILT + SHEAR
Primary input is device tilt (DeviceOrientationEvent; iOS asks permission from the Start button). Tilt adds an anisotropic advection bias — you shear the living material and the defects respond. No sensor? Drag on the canvas to set the shear vector. And a seeded auto-demo always breathes a slow shear so the piece is alive and audible with no sensor and no touch.

THE SOUND
A coarse CPU mirror of the same field yields cheap global scalars every frame: mean flow speed opens the master brightness and a lowpass (overall drive); turbulence adds detune beating and a filtered-noise roughness bed; and every defect BIRTH or ANNIHILATION rings a soft inharmonic bell whose pitch is a CONTINUOUS consequence of where it happened — never snapped to a musical scale. Five to eight inharmonic partials, master ≤ 0.15 through a compressor.

SAFETY
No strobe; luminance modulation stays ≤ 3 Hz. Reduced-motion preference slows everything down.

REFERENCES
· PNAS 2026, "Chaos-generating periodic orbits of topological defects in confined active nematics"
· Doostmohammadi & Yeomans — active nematics and defect self-propulsion
· Crossed-polarizer birefringence / the Fréedericksz transition`;
