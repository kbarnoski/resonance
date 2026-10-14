# Unreal Engine cinematic pipeline

Film-grade, pre-rendered Resonance pieces (a trailer, a cinematic version of a
journey) built in **Unreal Engine 5**: Niagara particles, Lumen light,
volumetric fog and Movie Render Queue at 4K. They are driven by Resonance's own
musical intelligence and imagery, and they are **not** a new visual language.
The film should play like the kiosk at cinema quality: the same souls, the same
arc, the same laws.

```
tramokyo pack (read-only)         Resonance code (the brain)
 audio · stills · depth · emblems  analyser · onsets · phrase conductor · currents · breath · engine
            \                                   /
             scripts/export-unreal-bundle.mjs  ──▶  <bundle>/   (CSV · JSON · JPG/PNG · WAV)
                                                        │
                                   Unreal: CurveTable + DataTable + textures + Sound Wave
                                                        │
                       BP_ResonanceConductor ─▶ Niagara user params · Material Parameter Collection
                                                        │
                                    Sequencer (camera, planes, light)  ─▶  Movie Render Queue 4K
```

Everything up to opening Unreal is done: the exporter, its tests, and bundles
for Yellow Bird and Ghost. Unreal itself still has to be installed. It needs
Karel's Epic account (see "Karel: start here" at the end).

---

## 1. The bundle (`scripts/export-unreal-bundle.mjs`)

```sh
node scripts/export-unreal-bundle.mjs --journey=<id|name> [--set=tramokyo-mix] --out=<dir> \
     [--rate=30|60] [--pack=<tramokyo-pack dir>] [--no-media] [--with-clips]
# e.g.
node scripts/export-unreal-bundle.mjs --journey=c80a89bc-2c88-4bde-bec8-4be6916acb62 --out=~/Documents/Resonance/unreal
node scripts/export-unreal-bundle.mjs --journey=ghost --out=~/Documents/Resonance/unreal --rate=60
```

The bundle is written to `<out>/<slug>/`, for example `yellow-bird/` or
`ghost/`. Use Node 20. The pack defaults to `public/tramokyo-pack`; pass
`--pack` (or set `RESONANCE_PACK`) from a worktree. The pack is only read. The
exporter is deterministic and makes no network calls: the same pack and code
always give byte-identical curves and events. It never uses live imagery. A
bundle is a delivery artifact, so **never commit one to git**.

| File | Contents | Source in Resonance |
|---|---|---|
| `curves.csv` | **DataTable** CSV: one row per frame (`--rate`, default 30/s), 50 float columns | `src/lib/cinematic/curves.ts` |
| `curvetable.csv` | The same curves as an Unreal **CurveTable**: one row per curve, with the key times in the header. Needs no struct | same |
| `events.json` | Deep-analysis sections (names, imagery, mood), cadences, climax, chords, analysis events; phrase-conductor events; breath phrases; harmonic-current marks; onsets; journey phases plus each phase's prompt beats; travel-morph slots; **shader timeline** (primary/dual/tertiary segments with fade times); particle forms (presence windows, form cycle, morph souls, signature moments); emblem windows; **signature flight** (Yellow Bird anatomy and constants); still schedule; `ghostArc` (Ghost) | `particle-profiles.generated.ts`, `deep-analysis-protected.json` / pack `analyses.json`, `phrase-conductor.ts`, `breath.ts`, `harmonic-currents.ts`, `journey-engine.ts` (the real engine, the kiosk's pinned take), `particle-lead.ts`, `signature-flight.ts`, `ghost-arc.ts` |
| `palette.json` | Per phase: the theme palette (primary/secondary/accent/glow) and the image palette sampled from that phase's stills. Each colour as hex, sRGB 0..1 and **linear** (FLinearColor) | engine frames, `journey-palettes.generated.ts` |
| `notes.csv` | The analysis transcription: Time, MIDI note, Duration, Velocity | pack `analyses.json` |
| `images/` | Pack stills in story order. `images/depth/` holds the depth maps (Depth-Anything v2, **white = near**). `images/emblems/` holds the emblem and signature-moment images. `images/index.json` gives each still's slot, phase, Ghost arc stage, depth map and when it is shown | pack `images/`, `depth/`, `emblems/` |
| `audio/` | The pack track (`.m4a`/`.mp3`) plus `<slug>.wav` (48 kHz, 16-bit stereo PCM) for Unreal | pack `audio/` |
| `clips/` | Travel-morph clips, only with `--with-clips` | pack `clips/` |
| `README.md`, `bundle.json` | Import notes, column ranges, musical map; file list with sizes and the curves' sha256 | |

### The curves

The columns use the kiosk's own code, so the film moves with the numbers the
installation moves with:

| Column(s) | Meaning | Same as OSC (`docs/touchdesigner-bridge.md`) |
|---|---|---|
| `Bass` `Mid` `Treble` `Level` | The shaders' FFT drive. The kiosk analyser (fftSize 256, smoothing 0.8, −100…−30 dB, read at **60 Hz**; `src/lib/cinematic/offline-analyser.ts` reimplements the Web Audio AnalyserNode) is split into bins 0-5 / 6-30 / 31-63 and smoothed at 0.06 @ 60 fps. Frozen in silence | `/resonance/audio/bass` … `/level` |
| `BassRaw` … `LevelRaw` | Unsmoothed band levels | `/resonance/audio/raw/*` |
| `BassKinetic` `MidKinetic` `TrebleKinetic` | The kinetic layers' faster drive (0.3 @ 60 fps) after the visible velocity limit (`UNIFORM_SLEW_PER_SEC`) | (the kinetic `u_bass…` uniforms) |
| `Silent` | The drive's silence test | `/resonance/audio/silent` |
| `Onset` `OnsetPitch` `OnsetEnv` | Living-score onsets: strength on the row the onset fired, register 0 low … 1 high, and the swirl envelope (smooth rise, 1-3 s decay) | `/resonance/audio/onset` (event) |
| `Bpm` `Beat` `BeatPhase` `Bar` `BarPhase` | A steady grid from the analysis tempo (beat 0 = track start) | `/resonance/clock/*` |
| `Intensity` `SectionIndex` `SectionProgress` | The deep analysis's 5 s dynamics curve, and the current section | — |
| `PhaseIndex` `PhaseProgress` `Progress` | Journey phase (the travel-morph boundaries) | `/resonance/journey/phase/*`, `/progress` |
| `SwellDensity` `SwellSize` `SwellReact` | Phrase-conductor swell (1 = neutral; crests swell, breaths thin) | `/resonance/phrase/swell/*` |
| `CurrentAmount` `CurrentTension` `CurrentLayering` | Harmonic currents plus the tide (0 = laminar release … 1 = gathering vortices) | `/resonance/harmony/*` |
| `BreathAmount` `BreathPhase` `BreathSettle` | Phrasing breath (−1 exhaled … +1 inhaled; settle as a phrase lands) | `/resonance/breath/*` |
| `EmblemForm` `EmblemShow` | The emblem envelope (opening 0.8-16 s, the middle of long pieces, the last 17 s) | `/resonance/journey/emblem` |
| `FlightActive` `FlightX` `FlightY` `FlightScale` `FlightPitch` `WingRoot` `WingTip` `WingFlex` `WingFold` `WingSweep` `WingBob` `TailSpread` | The Yellow Bird songbird flight (opening and closing). x/y are screen half-extents (y up), angles are radians about the wing hinge. Zero for journeys with no flight | — |

Every column has a declared range (`CURVE_RANGES`), and the tests assert it.
**Solo piano has almost nothing above ~5.5 kHz at the analyser's −100 dB
floor**, so `Treble` (5.8-12 kHz) barely leaves 0. The kiosk sees the same
thing. For sparkle, use `Mid`, `OnsetPitch` and `OnsetEnv`.

The conducted timelines (phrase, currents) are switched off on the kiosk for
the mastered journeys (Snowflake, Ghost). The bundle still offers them for the
film, and `events.json` flags them `kioskActive: false`. Using them in a Ghost
film is an artistic choice. They do not change the locked kiosk take.

---

## 2. The UE5 project

**Unreal Engine 5.5 or newer**, a Blueprint-only project. It needs no C++, so
no Xcode C++ toolchain, although UE on macOS still uses Xcode's Metal shader
compiler. Use the "Film / Video & Live Events → Blank" template, with Starter
Content off. On the M4 Pro / 24 GB:

- **Lumen** runs in software ray tracing. Macs have no hardware RT, and the
  software path is the look we want anyway: soft and volumetric.
- **Nanite** is fine on Apple Silicon.
- Keep the editor viewport at **Engine Scalability: High**. Render at **Cinematic** only through MRQ.

### Plugins (Edit → Plugins)

Movie Render Queue, **Movie Render Queue Additional Render Passes** (optional),
**Niagara** (on by default), **OSC** (for the live path, §8), **Apple ProRes
Media** (if your UE build has it on macOS; see §7), and **JSON Blueprint
Utilities** (to read `events.json` in Blueprint, optional).

### Content layout

```
/Game/Resonance/
  Data/<Slug>/        CT_<Slug>_Curves (CurveTable) · DT_<Slug>_Frames (DataTable) · DT_<Slug>_Notes
  Audio/              SW_<Slug> (Sound Wave from audio/<slug>.wav)
  Textures/<Slug>/    Stills/ (T_gen-000 …, sRGB) · Depth/ (TD_gen-000 …, sRGB OFF) · Emblems/
  Materials/          MPC_Resonance · M_DepthPlane (+ MI_ per still) · M_Particle_Soft · MF_Palette
  Niagara/            NS_Murmuration · NS_Starburst · NS_Nebula · NS_Fireflies · NS_Songbird · NE_ shared modules
  Blueprints/         BP_ResonanceConductor · S_ResonanceFrame · S_ResonanceNote · BP_DepthPlaneRig
  Sequences/<Slug>/   LS_<Slug>_Master · LS_<Slug>_Shot010 … (subsequences)
  Maps/               L_<Slug> (one level per piece: dark, empty, fog)
```

### Importing a bundle

1. **Curves, no struct.** Drag `curvetable.csv` into `Data/<Slug>/` and choose
   **CurveTable**, interpolation **Linear**. Each row (Bass, Mid, …, WingRoot)
   becomes a curve keyed in seconds.
2. **Frames as a DataTable (optional).** Create the struct `S_ResonanceFrame`
   with one **float** field per `curves.csv` column, using the exact column
   names (Time, Bass, …). Import `curves.csv` as a DataTable with that row
   struct. Rows are named `F000000…`, and at the bundle rate the row index is
   the frame number. The CurveTable is easier to evaluate at arbitrary times,
   so prefer it. The DataTable is for spreadsheet-style inspection and for
   Blueprint lookups by frame.
3. **Notes.** Import `notes.csv` as a DataTable with `S_ResonanceNote`
   (Time, Midi, Duration, Velocity, all float).
4. **Audio.** Drag `audio/<slug>.wav` into `Audio/` to make a Sound Wave. In
   the master sequence, add an **Audio track** at frame 0. Leave the sound
   unattenuated, and set the sequence frame rate to the render rate.
5. **Stills.** Import `images/*.jpg` into `Stills/` (Texture Group: World,
   sRGB on). Import `images/depth/*.png` into `Depth/` with **sRGB off** and
   Compression **Grayscale** or Alpha (on Mac, BC4 = "Alpha"). Turn mip
   generation on.
6. **Palette.** Create `MPC_Resonance` with vector parameters `Primary`,
   `Secondary`, `Accent`, `Glow`, `Img0…Img4` and scalars that mirror the
   curve names (§3). Type in the **linear** values from `palette.json` per
   phase, or set them from the conductor Blueprint as the phase changes.

---

## 3. Driving Niagara and materials: `BP_ResonanceConductor`

One small actor reads the curves at the **sequence's** time and pushes them
everywhere. It reads the sequence, not the wall clock, so MRQ renders are
frame-exact and identical every time.

**Variables:**

- `Curves` (CurveTable).
- `TrackTime` (float, **Instance Editable + Expose to Cinematics**). Sequencer animates it.
- `CurveNames` (Name array): Bass, Mid, Treble, Level, BassKinetic, MidKinetic, OnsetEnv, OnsetPitch, SwellDensity, SwellSize, SwellReact, CurrentAmount, CurrentTension, CurrentLayering, BreathAmount, BreathPhase, BreathSettle, EmblemForm, EmblemShow, FlightActive, FlightX, FlightY, FlightScale, FlightPitch, WingRoot, WingTip, WingFlex, WingFold, WingSweep, WingBob, TailSpread, Intensity, PhaseIndex, PhaseProgress, BeatPhase, BarPhase.
- `NiagaraTargets` (array of Niagara Component refs; or use **Get All Actors with Tag** "Resonance").
- `MPC` (Material Parameter Collection = MPC_Resonance).

**Event graph (Event Tick, or a Sequencer "Repeater" event track):**

1. **For Each Loop** over `CurveNames`, then:
2. **Evaluate Curve Table Row** (Curve Table = `Curves`, Row Name = array element, In XY = `TrackTime`). Its outputs are `Out Result` and `Out XY`.
3. Branch on `Out Result == Found`, then:
4. **Set Scalar Parameter Value** (Collection = `MPC`, Parameter Name = element, Value = `Out XY`).
5. **For Each Loop** over `NiagaraTargets`, then **Set Niagara Variable (Float)**
   (In Variable Name = `"User." + element`, In Value = `Out XY`).
6. Once per tick, after the loop: **Set Niagara Variable (Float)** `User.TrackTime` = `TrackTime`.

**Sequencer side:** add `BP_ResonanceConductor` to the level sequence. Add a
**TrackTime** float track with two keys, at frame 0 = 0.0 and at the last frame
= the duration in seconds, with **Linear** interpolation. The conductor then
reads the curves in *track* time. In a shot that re-times the music (a trailer
edit, §6), key TrackTime to the shot's **source** time, so a shot cut from
1:36 starts at 96.0. The data follows the cut automatically.

**Niagara side:** every system exposes the same **User parameters** (float,
same names: `User.Bass`, `User.OnsetEnv`, …). A system reads only what it needs.

> Alternative with no Blueprint: Sequencer can key Niagara user parameters
> directly (Niagara component track → **Parameters**). Typing thousands of keys
> by hand is unrealistic, so use this route only for the few slow
> **conducted** curves you shape by hand (swell, breath). Use the CurveTable
> for everything audio-rate.

### Mapping laws (seizure / motion law)

| Drive | Map it to | Never to |
|---|---|---|
| `Bass*`, `Mid*`, `OnsetEnv` | Velocity, curl-noise strength, spawn **rate** (not burst size above ~20 %), drag, vortex strength, particle **size ≤ ±15 %** | Emissive intensity, light intensity, exposure, fog emissive |
| `Swell*`, `Breath*`, `Current*` | Density, spread, layer separation, attraction radius, vortex tension | Colour flashes |
| `Intensity`, `PhaseIndex` | Slow look changes over ≥ 4 s: palette blend, fog density (≤ 10 % per second) | Cuts |
| `Onset` (one-frame impulse) | A Niagara **event**: spawn a group whose life is ≥ 1 s and which fades in over ≥ 0.3 s | Anything that blinks |

Every curve here already respects the kiosk's motion law (slewed, envelope
rises, no step changes). Keep any additional gain inside it.

---

## 4. Niagara: the Resonance souls

These mirror the kiosk souls (`src/lib/particles/souls.ts`) and the journey's
form timeline (`events.json → particles.windows / formCycle / morphSouls`).
They are GPU sims with soft, unlit, additive sprites at **constant emissive**
(colour from `MPC_Resonance` image palette), 30-200 k particles each, and
alpha fade in/out ≥ 0.5 s. The souls appear **only in their presence
windows**, and a soul hands over to the next with a ≥ 3 s crossfade of spawn
rate. A soul is never popped.

- **NS_Murmuration** ("a flock of light folding through the dark"). Spawn 80 k
  in a soft ellipsoid. The modules are Curl Noise Force (strength = 40 +
  80·`User.MidKinetic`), **Point Attraction** to a target that wanders on a
  **steady** clock (`User.TrackTime`, never the beat; Lissajous 0.03/0.05 Hz),
  Vortex Velocity around camera-up (axis tilted 15°, amount =
  `User.CurrentTension`), and Drag 1.5. Folding comes from flipping the
  attraction target between two slow orbits when `PhaseIndex` changes, eased
  over 4 s. Ribbon renderer optional (trail ≤ 0.4 s).
- **NS_Starburst** ("rays from a bright heart, thrown outward on every bass
  hit", *motion* version). A fixed-brightness core sphere of motes. On
  `Onset` (with pitch < 0.4), a Niagara event spawns 400-800 motes with radial
  velocity 300·`OnsetEnv` and Drag 2.5, life 1.5-3 s, alpha in 0.3 s and out
  1 s. The heart never brightens. The burst reads as speed and spread.
- **NS_Nebula** ("a soft cloud that inhales on the bass"). 150 k large soft
  sprites (or a **Heterogeneous Volume** if your UE version has it), shape
  radius = R·(1 + 0.12·`User.BreathPhase` + 0.08·`User.Bass`), Curl Noise 20,
  very slow Vortex. Colour comes from the phase image palette (Img1/Img3),
  opacity ≤ 0.08 per sprite. The density reads as depth, never as a wash.
- **NS_Fireflies** ("slow wanderers that dart when the treble sparkles"). 300
  points with a Light renderer (radius 30 cm, **constant** intensity) or
  emissive sprites. Wander noise 0.2 Hz. A dart is a velocity impulse (never
  a brightness change) on `Onset` with `OnsetPitch` > 0.6. On piano, use
  `OnsetPitch` instead of `Treble` (§1).
- **NS_Songbird** (Yellow Bird's signature, §6) forms the emblem from motes
  and flies it.

**Emblems.** When `EmblemForm` rises, a **Sample Texture** module (UV grid
over the emblem image, `images/emblems/`) attracts the field into the emblem
picture (spring to the sampled positions, colour from the texture). It
releases as `EmblemForm` falls. This is the kiosk's emblem moment. For Ghost,
the blossom moment (`particles.signature.moments`: phase 4, +2 s, 16 s, the
blossom images) forms the pink canopy, which then falls as petals. The closing
signature is the **wings** (`ghost-wings-*.jpg`).

---

## 5. Look: Lumen, fog, laws

Karel's aesthetic laws are hard constraints, not style notes:

- **Dark floor.** The frame rests near black. Use **Manual** exposure (Post
  Process: Exposure → Metering Mode Manual, a fixed EV100 per piece). **No
  auto-exposure**, because pumping is a brightness change.
- **Never a full-screen wash, no flicker (the seizure law).** ≤ 3 luminance
  transitions a second anywhere, never a saturated-red flash, no strobe, and
  no light keyed to beats. Lights and fog change over ≥ 2 s. Bloom intensity
  ≤ 0.5 with threshold ≥ 1. **Lens flares off.**
- **Motion, not brightness.** The music moves things (§3 mapping).
- **No film grain.** Post Process → Film Grain Intensity 0. When rendering to
  16-bit EXR, also set `r.Tonemapper.GrainQuantization 0`.
- **No literal humans or faces.** Abstraction and nature only. Ghost's figure
  appears only as the pack's own stills (eyes closed, no face detail, no halos)
  and as particle wings.
- **Transitions never abrupt.** Use dissolves, camera moves through planes,
  and particles carrying the change. A boundary has exactly **one mover**: the
  camera or the content, never both at once. This is the boundary-glitch law.

**Recipe:**

- Lumen GI and reflections on. Final Gather Quality 2, Lumen Scene Detail 2 (for render only).
- **Exponential Height Fog** with Volumetric Fog on: Scattering Distribution
  0.6, Albedo dark (0.25), Extinction Scale 1-2, Fog Inscattering near black.
- One **key light** (spot or rect, Volumetric Scattering Intensity 2-4) makes
  shafts through the fog. Ghost's imagery cue is "a single amber shaft breaks
  through at the 2:58 peak". Bring that shaft in over 6-8 s before 2:58, as a
  slow fade or a light moving into frame. Never a pop.
- Sky light 0.05-0.2 for fill only. No SkyAtmosphere daylight.
- Palette: key light colour and fog albedo per phase from `palette.json →
  theme.glow / accent` (linear values), blended over ≥ 4 s at phase changes.

### 2.5D depth planes (the stills as places to fly through)

`M_DepthPlane` (Surface, Unlit or Default Lit + low roughness) uses `Still` (sRGB) and `Depth` (linear):

- **Displacement (preferred).** Use a high-resolution plane (Modeling Mode →
  Create → Plane, 400×400 subdivisions, or Nanite displacement if enabled).
  World Position Offset = VertexNormalWS × (Depth.r − 0.5) ×
  `DepthScale` (60-200 cm). White = near pops toward the camera. Add a
  **DepthPower** (Depth^1.5) to flatten the background.
- **Parallax Occlusion Mapping (cheap alternative).** The `ParallaxOcclusionMapping`
  node with Heightmap Texture = Depth, Height Ratio 0.05-0.15 and Reference
  Plane 1, feeding the still's UVs. It works well for slow dollies; displace
  for big camera moves.
- **Edges.** Multiply opacity (Masked + dithered, or Translucent) by a soft
  radial vignette and by `saturate((Depth − 0.05)·8)`, so the far background
  falls into the fog and never shows a rectangle.
- **The rig (`BP_DepthPlaneRig`).** Stage 3-5 planes of the *same* phase at
  different depths (from `images/index.json`, consecutive slots of one phase),
  with volumetric fog between them. The camera dollies **through** them. A
  still change is a camera move from one plane to the next, which is the
  kiosk's travel morph rebuilt in 3D. Ghost uses `arcStage` so the camera only
  ever moves forward through the arc.
- Show a plane only in the window `events.stills` suggests, ±2 s. That
  schedule is an edit suggestion (the kiosk's slot mapping on a 10 s cadence),
  not a recording of a run.

---

## 6. Camera language and the first pieces

- **Slow dollies** on a Camera Rig Rail or keyed CineCameraActor transforms,
  with no faster than ~0.5 m/s at plane scale and no handheld shake. **No cuts
  on beats.**
- **Focus pulls at section boundaries.** Lens 35-50 mm, aperture f/2-f/2.8,
  with Focus Method Manual keyed. Each pull starts 1.5-2 s **before** an
  `analysis.sections[].start` or cadence (`analysis.cadences`) and lands on it,
  so the music turns the page and the eye follows.
- **Phase boundaries** (`phaseBounds`, `morphs`) are the big moves: the camera
  travels through a plane into the next phase, and the conductor's `PhaseIndex`
  blends the palette.
- **Crests and the climax** (`phrases.events` kind `crest`, `analysis.climax`)
  call for the camera to *slow* while the particles swell. The music carries
  the peak, not a camera whip.

### Piece 1: "Yellow Bird", 60-90 s (the flight is the signature)

The bundle is `yellow-bird/` (2:17, F major, 111 BPM free time). The sections
are Rocking Sunrise 0:00-0:23, Subdominant Lift 0:23-0:41, Fuller Return
0:41-1:07, Final Ascent 1:07-1:46 (climax 1:40), and Fading Open Fifth
1:46-2:17. The cadences fall at 0:23, 0:41, 1:07 and 1:46. The imagery cues
are low golden side-light → full sun peaking ~1:40 → a thin amber glow, a
gentle sway "like grass in a soft breeze", and lifting during the B♭ passages
(0:28, 0:56, 1:36).

**Suggested ~82 s cut, made from two excerpts:**

| Shot | Source (track time) | Picture |
|---|---|---|
| 010 | 0:00-0:16 | Black → the emblem forms from motes (`EmblemForm`). The **opening flight at 0:08-0:13.5**: the songbird lifts and glides off frame, up-left (FlightX/Y/Scale/Pitch, flap-bounding wings). Focus pull onto the first plane lands as the bird leaves |
| 020 | 0:16-0:41 | Dolly through the threshold → expansion planes (sunrise field). Murmuration under the B♭ lift (0:28), crest swell at 0:30, focus pull to the cadence 0:41 |
| 030 | 1:36-1:52 | *(music edit: dissolve at the 0:41 cadence into 1:36; both sides sit on the F pedal)*. The lift into B♭ and the **climax at 1:40**. The camera slows, the field swells (`SwellDensity`), and the key light is at its fullest |
| 040 | 1:52-2:17 | Fading Open Fifth. Planes recede into amber, and the closing emblem forms. The **closing flight at 2:07-2:13** leaves as the music reaches its quietest moment (2:12). Fade to black |

The music edit is Karel's call as composer. Render the full 2:17 first as the
cinematic version of the journey, then the cut. Per the "sample before batch"
law, render shots 010 and 030 as samples for his approval before the full
render.

**NS_Songbird (flap-bounding).** The rig data is in `events.json →
emblems.signatureFlight`: the image is `images/emblems/yellow-bird.jpg`
(1024², side view facing left); the wing hinge runs along the back through
the shoulder (0.51, 0.465) on the head→tail axis (0.41, 0.45)→(0.64, 0.61); the
wing is the region on the tip side (0.79, 0.21) within the along-axis band
[−0.10, 0.20]. All coordinates are image fractions with y pointing down.

1. Sample the emblem into motes (Sample Texture + Grid2D, ~60 k). Mark wing
   motes by that region and store the hinge-relative position in a particle attribute.
2. A parent transform takes the plane offset `FlightX/FlightY` (screen
   half-extents mapped to the camera frustum at the bird's depth), the scale
   `FlightScale` and the in-plane pitch `FlightPitch`. The body bobs by
   `WingBob`.
3. Wing motes rotate about the hinge by `WingRoot` (root) blended to `WingTip`
   (tip, which trails by 0.06 s) along the wing. The wrist folds the hand in
   by `WingFlex` (upstroke), `WingSweep` sweeps the extended wing forward
   (downstroke), and `WingFold` lays the wing along the body (**the bound**).
   `TailSpread` fans the tail at takeoff.
4. The motion is the science of small-passerine flap-bounding (Tobalske et al.
   1999; Rayner 1985), already baked into the curves. There is a takeoff
   burst, then bursts of 2 flaps with a folded bound, on an undulating path.
   The stroke rate is held at ≤ 2.2 strokes/s, because of the seizure law
   (real wingbeats are 15-25 Hz). **Do not speed it up.**
5. In 3D you may also fly a world-space bird along a path: forward glide with
   the undulation, the camera following on a long lens. The wing curves stay
   the same.

### Piece 2: "Ghost", the arc (respect the arc law)

The bundle is `ghost/` (3:39, C major/minor, 54 BPM). The sections are Pedal
and Shadow 0:00-0:37, Restless Inner Voices 0:37-1:11, Descent into Minor
1:11-1:39, Ambiguous Thaw 1:39-2:10, Second Gathering 2:10-2:40, Aeolian
Summit 2:40-3:04 (climax 2:58), and Suspended Homecoming 3:04-3:39. The
imagery cues are slow, drifting, unmetred glides with no cuts on a beat;
breaths about every 7 s; the camera sinking lower in the minor surges; and the
single amber shaft at 2:58.

**The arc law (Karel 2026-10-01, `docs/ghost-journey-spec.md` §0) is the
storyboard.** The stages, in order and never backwards, are:

1. Stone room with window
2. At the entrance of a tunnel into the depths of the earth (from outside)
3. Deeper and deeper in the tunnel
4. The pool with infinite floating (white) flowers
5. Light at the end of the tunnel, above: she rises and emerges, and sees the pink tree on its small dark planet
6. Flight through infinite space toward the tree: the blossoms grow
7. Spiritual union with the tree: full infinite pink bloom, hair an infinite spiral
8. The angel unifying with light amidst the cosmos. This is the ending: never the stone room again, no tree, tunnel or pool.

`images/index.json` tags all 90 stills with `arcStage`. Build each stage's
depth-plane rig only from its own stills. The camera moves forward through
stages 1 → 8 exactly once. The kiosk's bass flashes (1:38, 2:40) are a kiosk
device. In the film, **no flashes**: those moments are a slow push-in only.
The pack has **no depth maps for Ghost**. Make them before building planes
(see "Karel: start here"), or use flat planes with fog parallax.

**Full-length cinematic (3:39, recommended first):** stage timing follows the
kiosk schedule in `events.stills`: 1 at 0:00-0:30, 2 at 0:30-0:40, 3 at
0:40-1:10, 4 at 1:10-2:00, 5 at 2:00-3:00, 6 at 3:00-3:10, 7 at 3:10-3:20,
8 at 3:20-3:39. Section focus pulls fall at 0:37, 1:11, 1:39, 2:10, 2:40 and
3:04. The amber shaft comes in at 2:52-2:58. The wings form in the last 17 s
(`EmblemForm`). Particles: murmuration → blossom → petals (the form cycle);
the blossom moment in phase 4; wings at the end.

**~90 s arc cut (each excerpt ends on a cadence; the music edit is Karel's call):**

| Shot | Source | Stage(s) |
|---|---|---|
| 010 | 0:00-0:16 | 1, room with window. Dark floor, one window of light |
| 020 | 0:25-0:37 | 2, the tunnel entrance from outside → cadence 0:37 |
| 030 | 1:23-1:39 | 3 → 4, deeper, arriving at the flower pool → cadence 1:39 |
| 040 | 2:44-3:04 | 5 → 6, light above, emerge, flight toward the pink tree. The amber shaft and the climax 2:58 → cadence 3:04 |
| 050 | 3:13-3:39 | 7 → 8, union with the tree, then the angel in light amidst the cosmos (finale still `gen-089`). Wings form, fade to black |

---

## 7. Movie Render Queue: 4K60 ProRes

Window → Cinematics → Movie Render Queue, then add the master sequence. Settings preset `MRQ_Resonance_4K60`:

- **Output:** 3840×2160, the sequence at **60 fps** (author the sequence at
  60, or let Output → Frame Rate override it). Use Handle Frames 0 and "Use
  Custom Playback Range" off.
- **Anti-aliasing:** Override AA **on**, AA Method **None**, **Spatial Sample
  Count 1**, **Temporal Sample Count 8** (16 for the final). Temporal samples
  give the AA and real **motion blur** together. Turn on "Render Warm Up
  Frames", set **Engine Warm Up Count 120** so Niagara and Lumen converge
  before frame 0, and turn on **Use Camera Cut for Warm Up**.
- **Camera:** Shutter Timing Frame Center. Shutter angle comes from the
  CineCamera (180° = natural blur; lower it, never raise it, if blur smears
  motes).
- **Game Overrides:** Cinematic quality, texture streaming off ("Flush Grass
  Streaming", "Disable LODs").
- **Console variables:** `r.MotionBlurQuality 4`, `r.MotionBlur.Max 5`,
  `r.Lumen.ScreenProbeGather.ScreenTraces 1`, `r.Lumen.Reflections.Allow 1`,
  `r.VolumetricFog.GridPixelSize 4`, `r.VolumetricFog.GridSizeZ 128`,
  `r.Tonemapper.GrainQuantization 0`, `r.DepthOfFieldQuality 4`,
  `r.ScreenPercentage 100`, `r.TemporalAA.Upsampling 0`.
- **Output format:**
  - With **Apple ProRes Media**, choose output **Apple ProRes** → codec
    **ProRes 4444 XQ** (or 422 HQ), and add audio via the **.wav Audio** output.
  - Without it on your macOS build, choose **EXR 16-bit (half) image sequence**
    (or 16-bit PNG) plus the .wav Audio output. Then encode ProRes with the
    repo's ffmpeg-static:

    ```sh
    FF=$(node -e "console.log(require('ffmpeg-static'))")
    "$FF" -framerate 60 -i Shot010.%04d.exr -i yellow-bird.wav -c:v prores_ks -profile:v 4 \
          -pix_fmt yuva444p10le -vendor apl0 -c:a pcm_s24le YellowBird_4K60.mov
    ```
- **Seizure gate before anyone sees it:** put the renders in a folder and run
  `node scripts/flicker-gate.mjs <folder>` (`docs/flicker-safety.md`, WCAG
  2.3.1). A FAIL is not shippable. A WARN (local shimmer) means fixing the
  particles.
- **Budget on the M4 Pro / 24 GB:** start with 1080p, Temporal Sample Count 4,
  for look development. Expect several seconds a frame at 4K with 8 temporal
  samples, so render overnight. Turn off "Use Tiled Rendering". Quit the
  editor viewport realtime during renders.

---

## 8. The live path: OSC instead of CSV

Unreal's **OSC plugin** can read the kiosk's OSC map live (`docs/touchdesigner-bridge.md`):

1. On the kiosk, run `node scripts/osc-relay.mjs --osc-host <UE machine IP>`
   and open the kiosk page with `?osc=1`.
2. In Unreal, **Create OSC Server** (Receive IP 0.0.0.0, Port 7000, Start
   Listening) in BeginPlay of a `BP_ResonanceOSC` actor. Keep a reference.
3. Bind **On OSC Message Received**: **Get OSC Message Address** → **Convert
   OSC Address To String**, then **Get OSC Message Float At Index 0**.
4. Map the address to the same curve name (`/resonance/audio/bass` → `Bass`,
   `/resonance/phrase/swell/density` → `SwellDensity`, `/resonance/harmony/tension`
   → `CurrentTension`, `/resonance/breath/phase` → `BreathPhase`, …; the table in
   §1). Feed it into the **same** Set Scalar Parameter Value / Set Niagara
   Variable calls `BP_ResonanceConductor` uses.

The same Niagara systems then run off the live show, for example an LED wall
beside the projection. The live feed carries no `OnsetEnv` or `Flight*`.
Rebuild `OnsetEnv` from `/resonance/audio/onset` events (strength × a 0.35 s
smoothstep rise and a 1-3 s decay). The seizure law applies even more strictly
on an LED wall.

---

## 9. Code

- `src/lib/cinematic/offline-analyser.ts`: the kiosk AnalyserNode reimplemented (Blackman window, FFT, 0.8 smoothing per read, byte scaling).
- `src/lib/cinematic/curves.ts`: the per-frame curves (`computeCurves`, `CURVE_COLUMNS`, `CURVE_RANGES`) and the DataTable / CurveTable CSV writers.
- `src/lib/cinematic/bundle.ts`: the bundle layout and validator, the still schedule, linear palette colours, shader segments.
- `scripts/export-unreal-bundle.mjs`: IO: pack reads, ffmpeg decode (`nice -n 10`), the real JourneyEngine run (clock stubbed, as in `audit-snowflake-standard.mjs`), and the writes.
- Tests: `src/lib/cinematic/curves.test.ts` (analyser vs. a naive DFT and known tones, determinism, row rate, column ranges, onsets, silence freeze, flight) and `bundle.test.ts` (layout validator, palette, still schedule incl. the **Ghost arc order**, shader segments, and an end-to-end exporter run on the real pack that checks byte-identical reruns; skipped where no pack is present).

---

## Karel: start here

1. **Install** the Epic Games Launcher and sign in with your Epic account.
   Install **Unreal Engine 5.5+** (budget ~60-100 GB of disk). Also install
   **Xcode** from the App Store, because UE uses its Metal shader compiler.
2. **Make the bundles** on the kiosk-free laptop (Node 20):
   `node scripts/export-unreal-bundle.mjs --journey=c80a89bc-2c88-4bde-bec8-4be6916acb62 --out=~/Documents/Resonance/unreal`
   and the same with `--journey=ghost`. Pre-built copies from 2026-10-13 also
   exist (see the hand-off report).
3. **Ghost depth maps:** the pack has none for Ghost (it is mastered and was
   never harvested). Either approve a one-off `scripts/harvest-depth-maps.mjs`
   style run for the 90 Ghost stills into a *staging* folder (fal,
   Depth-Anything v2; it costs a little and needs your OK, and never touches
   the locked pack), or start with flat planes plus fog parallax.
4. **New project** (Film / Video & Live Events → Blank, Blueprint). Turn on the
   plugins in §2, import a bundle as in §2, build `BP_ResonanceConductor` (§3)
   and one Niagara soul (§4). Then lay the Yellow Bird shots (§6).
5. **Approve samples** (shots 010 and 030) before the full render, then run the
   **flicker gate** (§7) on every render.
