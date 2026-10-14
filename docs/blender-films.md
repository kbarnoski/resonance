# Blender cinematic films

Pre-rendered, film-grade pieces of Resonance journeys, built **procedurally in
Blender 4.2 LTS (EEVEE Next on Metal)** from the same bundles the Unreal plan
uses (`docs/unreal-pipeline.md`, `scripts/export-unreal-bundle.mjs`). This is
that design translated to Blender: no editor clicks. One headless command builds
the scene from the bundle and a cut file, then renders, encodes and muxes the
music edit.

```
bundle (curves.csv · events.json · palette.json · images/ · audio/)      cut JSON (the edit + the picture)
                         \                                              /
            resonance_film/timeline.py   film time <-> source time, curve blending, clocks
            resonance_film/director.py   every frame's state = f(film time)   (pure numpy)
            resonance_film/souls.py      murmuration · drift (pollen/dust/fireflies/petals/stars) · vortex · emblem (+ songbird flight)
            resonance_film/plates.py     still -> 2.5D plate (crop · inpaint · feather · blurred twin · depth)
                         |
            resonance_film/scene.py      Blender: plates, mote instancer (GN), haze/mist volume, spot shafts, compositor
                         |
            build_film.py                render loop (resumable 5 s chunks) -> HEVC 10-bit -> + music edit (AAC) -> .mp4
```

## Run

Blender: `~/Applications/Blender.app` (4.2.23 LTS). The ffmpeg is the repo's
`ffmpeg-static`. Outputs go to `~/Documents/Resonance/films/` and are never committed.

```sh
B=~/Applications/Blender.app/Contents/MacOS/Blender
# full film, 1080p60
nice -n 10 $B -b --factory-startup -P scripts/blender/build_film.py -- \
  --bundle=~/Documents/Resonance/unreal-bundles/yellow-bird \
  --cut=scripts/blender/cuts/yellow-bird.json \
  --out=~/Documents/Resonance/films/yellow-bird --res=1920x1080 --fps=60
# 4K: --res=3840x2160      a sample: --range=4:14      look-dev stills: --preview --stills=6,30,45
# options: --samples=N (default 48; preview 8) --chunk=300 --crf=14 --engine=cycles --keep-frames --name=<stem>
```

- `--preview` = 640×360 @ 30 fps, 8 samples (look development).
- Renders are **resumable**: frames are encoded in 300-frame chunks under
  `<out>/.work-<name>/`. Re-running the same command skips finished chunks.
- Each film writes `<name>.mp4` (HEVC Main10 `hvc1`, BT.709, AAC 320k) plus
  `<name>.json` (segments, render time, s/frame).
- **Gate every render:** `node scripts/flicker-meter.mjs <file.mp4>` (Node 20).
  A FAIL is not shippable. Fix any WARN.
- **Law tests (no Blender):** `python3 scripts/blender/test_film.py`.

## How it works

**Stateless director.** Every frame is a pure function of film time: the
camera, focus, plate opacities, every particle position, the light energies and
the fog tint. Nothing is simulated step by step. Motion that needs history uses
**integrated clocks** (`flow = ∫(base + bass·BassKinetic + mid·MidKinetic) dt`),
precomputed for the whole film. As a result, any frame renders on its own and
identically every time. That gives chunked, resumable renders, a 10 s sample
that matches the full film frame for frame, and `--stills` for look-dev.

**The music edit.** A cut is a list of source segments joined by equal-power
(`qsin`) crossfades. Film time maps to weighted source times. Curves blend
linearly through a join (they are already slewed), so everything they drive is
continuous across the edit. The audio is rebuilt with ffmpeg
`atrim` + `acrossfade` and rides the picture's master fade. Authoring helpers in
the cut: `"src:99"` is the film time of source 99 s, and `"end"` / `"end-4"`
count from the end.

**Plates (the stills as places).** Each still becomes a subdivided card,
displaced by its depth map (Yellow Bird: the bundle's Depth-Anything maps,
`depth^1.5`). Ghost has no depth maps, so its plates use synthetic profiles:
`radial` (a tunnel: centre far, walls near), `ground` (pool) or `dome` (a form).
Plates are **emissive** (no light ever flashes them) and blend **additively**,
so black never occludes. Consecutive plates dissolve over **identical
windows**, so their opacities always sum to 1: a true dissolve with no
brightness bump (asserted in the tests). Edges are feathered (a rounded rect
times an optional ellipse), so a plate never shows a rectangle.

**Focus pulls** are deterministic. Each plate has a blurred twin, mixed by
its distance from the focal plane, and motes get an energy-conserving bokeh
(radius grows, alpha drops ∝ size², so the light stays constant). Pulls start
~2 s **before** the beat they land on (a cadence, a section, the bird's
departure) and travel in dioptres, the way a focus puller's ring feels. With
no EEVEE DOF there is no sampling noise and no blended-surface depth issues.

**Souls** (the kiosk's particle souls, `src/lib/particles/souls.ts`), one
instanced mesh of soft additive spheres (Geometry Nodes, per-instance
colour/alpha/size):

| Soul | Model | Music drive (motion only) |
|---|---|---|
| `flock` (murmuration) | ellipsoid folding to a ribbon on a steady 38-44 s clock; centre on a Lissajous at 0.03/0.05 Hz (never the beat) | MidKinetic → turbulence; SwellSize/Breath/Bass → spread; CurrentTension → twist |
| `drift` (pollen, dust, fireflies, petals, stars) | world-anchored motes in a box that wraps softly around the camera path (real parallax as the camera dollies) | flow clock → wander/rise; fireflies **dart** (decaying impulse) on high-register onsets |
| `vortex` | differential-rotation spiral (the climax galaxy) | flow clock → rotation; SwellSize → radius; the heart never brightens |
| `emblem` | an image sampled into motes (luminance-weighted) that streams in on arcs as `EmblemForm` (or keyed) rises; release = `scatter` or `fall` (petals) | onsets → swirls while unformed |
| songbird | emblem + `flight: true`: a vectorised port of `wingDisplacement()` (`signature-flight.ts`) driven by the bundle's `Flight*`/`Wing*`/`TailSpread` curves (flap-bounding, ≤ 2.2 strokes/s). Placement via FlightX/Y in screen half-extents at the bird's depth; the pose is held off-frame after the flight while the motes let go over 1.5 s | wing motes are dimmed by projected area (a wing turned edge-on would otherwise pack its light into a 2 Hz hotspot) |

**Onsets → gentle local swirls**: every strong onset turns the field about a
point on screen (rise 0.6-0.8 s, settle over 2.4-3 s). The turn is a rotation
of positions, never a brightness change.

**Look.** Standard view transform (the stills keep their authored colour),
exposure 0, black world, no film grain (`dither 0`, 16-bit frames, 10-bit
encode), no lens flares, and no EEVEE DOF or motion blur. Light shafts come from
spot lights scattering in a homogeneous **haze** volume box (EEVEE Next's world
volume barely scatters). Ghost adds a drifting 4D-noise **mist** in world space,
advected on a steady clock. Light energies are keyed and eased (≤ 50 % of peak
per second, tested). Glow is a compositor Bloom with a high threshold. The
master fade to and from black is a compositor multiply.

## Karel's laws → where they live

| Law | Enforcement |
|---|---|
| Seizure safety: no flashes, ≥ 2 s eases | envelopes are smootherstep ≥ 2 s; lights ≤ 0.5×/s; plate dissolves complementary; `test_film.py`; **flicker meter on every render** |
| Motion, not brightness | curves drive positions, speeds, spread and swirl only; mote/plate brightness changes only via presence envelopes |
| Dark black floor, no washes | black world, per-cut `plateExposure`, vignettes, summed plate light ≤ 1.45 (tested) |
| Never abrupt | dissolves only; camera = monotone spline with zero end slopes, ≤ 0.5 m/s (tested), ≤ 3°/s turn |
| No film grain | dither 0, no grain anywhere |
| No literal humans / faces | Ghost: every still is a **figure-free crop**, or has the tiny cosmic figure **inpainted** (`exclude` ellipses); the angel exists only as particle wings. A test fails any Ghost plate that shows a whole still |
| Music decides | joins sit on cadences / section starts / harmonic gathering marks (tested); focus pulls land on cadences |
| Ghost arc, never backwards | plates sorted by entry follow `arcStage` 1 → 8 monotonically, ending on 8 (tested) |

## The cuts

### Yellow Bird: `cuts/yellow-bird.json` (83.3 s)

Music: **0:00-0:41.8 + 1:34.8-2:17.4**. The 1.2 s crossfade is centred so the
phrase after the 0:41 cadence lands on the B♭ lift at 1:35.4; both sides sit on
the F pedal. It keeps both flights and the 1:40 climax.

| Film | Picture |
|---|---|
| 0-8 | Black → gold motes stream into the songbird (`EmblemForm`) over a defocused leaf on a branch |
| 8-13.5 | **The opening flight**: takeoff burst, flap-bound, up-left and off-frame. The focus pull lands on the leaf as it leaves |
| 13.5-41 | Leaf → golden tree (cadence 0:23) → leaves rising through the light (the 0:28 B♭ lift: the camera rises and tilts up); a murmuration folds under the lift, swelling at the 0:30 crest |
| 41-56 | The music edit dissolves into the galaxy. A vortex soul turns with it, the camera slows into the **1:40 climax** (film 45), and the golden side-light shaft is at its fullest |
| 52-73 | Cadence 1:46 → the gilded leaf shedding sparks → a leaf on rippling water. The closing emblem re-forms (focus pulls back to it) |
| 72.8-78.8 | **The closing flight** leaves as the music reaches its quietest moment; fireflies drift |
| 75-83.3 | Dusk horizon; fade to black |

### Ghost: `cuts/ghost.json` (97.8 s, the arc)

Music: **0:00-0:39 | 1:24.2-1:40 | 2:43.2-3:05.8 | 3:12.6-3:39.4**. The
crossfades are centred on 0:38 ≡ 1:25.2 (the 1:25 harmonic gathering), on the
1:39 cadence ≡ 2:44.2, and on 3:04.6 (just after the 3:04 cadence) ≡ 3:13.8.

| Film | Stage | Picture (figure-free crops) |
|---|---|---|
| 0-24 | 1 room | The vaulted stone room and its one window of light; dust in the air |
| 24-43 | 2 tunnel entrance | The spiral roots and the dark hole → the blossom ring (cadence 0:37) |
| 39-51.8 | 3 depths | The teal tunnel rings; the camera sinks (the minor surge); a pale murmuration |
| 47.5-58 | 4 flower pool | The cave arches over the pool, landing on the 1:39 cadence; pink flowers float low |
| 55-70 | 5 light above / emerge | The tunnel path into the light → the glowing opening (figure inpainted). The camera rises. **The amber shaft eases in over 6 s to the 2:58 climax** (film 65.6). No flashes |
| 66-78 | 6 flight to the tree | The white tree on its planet, streaming blossom motes, star dust (infinite space) |
| 74-87 | 7 union | Pink motes form the blossom tree (`ghost-blossoms-1`), hold, and fall as petals |
| 80-97.8 | 8 light amidst the cosmos | The light beam into the cosmos → the galaxy (figure inpainted). **The wings form from motes** (`ghost-wings-1`). Fade to black. Never back to the room |

## Notes for Karel

- **The music edits are proposals.** They are the composer's call. Change the
  `segments` in the cut JSON (`xfade` = crossfade seconds); everything else
  follows, because the picture timings can be written as `"src:<seconds>"`.
- **Ghost has no depth maps.** The synthetic profiles work well for slow
  dollies. A Depth-Anything pass on the Ghost stills (a staging folder, your
  OK) would add true relief; then point the plates' `depth` at the PNGs.
- Cycles works (`--engine=cycles`) for stills. The films are EEVEE.
- Render log and times: see the hand-off report and each film's `.json` sidecar.
