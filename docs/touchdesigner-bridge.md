# TouchDesigner bridge (OSC out of Resonance)

Resonance stays the brain. TouchDesigner, Resolume, Notch or Max/MSP run beside
it at a venue (projection mapping, extra outputs, LED walls, lighting) and are
driven by Resonance's own musical intelligence: the shader drives, the
living-score onsets, the phrase conductor, harmonic currents, breath, the
journey arc and its palettes.

```
kiosk page (?osc=1) ──WebSocket JSON, 10–30 Hz──▶ scripts/osc-relay.mjs ──OSC/UDP──▶ TouchDesigner :7000
                     ◀── remote bus (/api/pack/remote) ◀── OSC cues :7001 (optional) ◀──
```

Browsers can't send UDP, so the page streams a compact JSON frame to a small
**separate** Node relay on the kiosk, and the relay emits OSC. The relay puts no
load on the kiosk's `next start` server. You can start and stop it on its own,
and if it crashes the show doesn't notice.

## Quick start

1. **Relay** (on the kiosk, Node 20, no dependencies):
   ```sh
   node scripts/osc-relay.mjs                                  # OSC → 127.0.0.1:7000
   node scripts/osc-relay.mjs --osc-host 192.168.1.20          # TD on another machine
   node scripts/osc-relay.mjs --cues                           # + TD → Resonance cues on udp :7001
   node scripts/osc-relay.mjs --demo --dump                    # synthetic frames: patch TD with no kiosk
   ```
   `--help` lists every option. Status: `curl http://127.0.0.1:9100/`.
2. **Kiosk page**: add `osc=1` to the URL once (e.g. `/room/installation?loop=1&osc=1`).
   It is kept in sessionStorage across the loop's navigations, like `?currents=1`.
   - `?osc=always` keeps it on for this browser (localStorage, the kiosk setting).
   - `?osc=0` turns it off again (clears both).
   - `?oscws=ws://127.0.0.1:9200` points it at another relay port. Loopback only:
     the relay runs on the kiosk, and only its `--osc-host` may point at the LAN.
   - `?oschz=30` sets the send rate (10–30 Hz, default 20).
3. **TouchDesigner**: add an **OSC In CHOP** with Network Port `7000` and
   Protocol UDP. Set Address Scope to `/resonance/*` if other gear shares the
   port. Add an **OSC In DAT** on the same port for the string and multi-argument
   messages (names, palettes, events).

Page diagnostics: in the kiosk console, `__resonanceVjBridge.stats`
(sent / rateLimited / skippedBackpressure / connects) and
`__resonanceVjBridge.connected`.

## Performance and safety rules

- **Off by default, and off costs nothing.** With no `?osc` there is no socket,
  no timer and no listener. The only cost is one boolean check on the particle
  layer's 10 Hz tick.
- **No work on the render path.** The send loop is a `setInterval` (never
  `requestAnimationFrame`). Producers only *assign references* into a tap
  (`src/lib/vj-bridge/tap.ts`). The phrase, cadence and beat events are worked
  out in the send loop by walking timelines that already exist. The audio bands
  reuse the particle layer's own spectrum buffer (no extra analyser reads). The
  analyser is read directly only when particles aren't running.
- **Rate-limited at both ends.** The page sends at most `oschz` frames a second
  (a schedule-based gate, so a stall never bursts). It drops whole frames,
  never queueing them, when the socket backs up (64 kB). The event queue is
  bounded (256). The relay caps continuous OSC at `--max-hz` (30). Events still
  pass on a rate-limited frame.
- **Reconnect is cheap.** With no relay running the page retries with backoff
  (1 → 10 s) and does no other work.
- **No network.** Everything is localhost by default. The page's CSP allows
  only `ws://127.0.0.1:*` and `ws://localhost:*`. The relay accepts WebSocket
  connections only from no Origin or a localhost Origin, and cues only from
  `--cue-allow` IPs (default 127.0.0.1).
- **Seizure law.** The data itself is irrelevant to the law, but **whatever TD
  renders from it must honour the same seizure law the show does**: no
  full-field flashes on onsets or beat ticks (≤ 3 flashes a second, never
  saturated red), and lag or filter every pulse before it reaches brightness.
  LED walls and lighting are bigger and brighter than the projection, so be
  more conservative there, not less.

## OSC address map

Every continuous value is **one number on its own address**, because the OSC In
CHOP makes one channel per address. All of them are sent on every frame. Strings
are sent when they change, plus a keyframe every 2 s (`--keyframe-ms`). Each
frame is one OSC bundle with an "immediately" time tag (split under 1400 bytes;
`--split` sends separate messages instead).

### Continuous (CHOP)

| Address | Type | Range | Meaning |
|---|---|---|---|
| `/resonance/audio/bass` `/mid` `/treble` | f | 0..1 | Band drive, smoothed exactly like the shaders' FFT drive (bins 0-5 / 6-30 / 31-63, 0.06 @ 60 fps, frozen in silence) |
| `/resonance/audio/level` | f | 0..1 | Overall level (mean of all bins, same smoothing) |
| `/resonance/audio/raw/bass` `/mid` `/treble` `/level` | f | 0..1 | Unsmoothed band levels at the send rate |
| `/resonance/audio/silent` | i | 0/1 | The shader drive's silence test (track ended, paused, the breath between journeys) |
| `/resonance/clock/bpm` | f | | Track tempo from the analysis (0 = unknown) |
| `/resonance/clock/beat` | f | | Beats since track start (a steady grid from the tempo, not a beat tracker) |
| `/resonance/clock/beat/phase` | f | 0..1 | Ramp within the beat |
| `/resonance/clock/bar` | i | | Bar number (4/4 assumed) |
| `/resonance/clock/bar/phase` | f | 0..1 | Ramp within the bar |
| `/resonance/presenter/playing` | i | 0/1 | Audio playing |
| `/resonance/presenter/holding` | i | 0/1 | The statement / title card is holding the stage |
| `/resonance/presenter/time` `/duration` | f | s | Track position / length |
| `/resonance/presenter/volume` | f | 0..1 | Kiosk volume |
| `/resonance/journey/phase/index` | i | | Current journey phase (0-based) |
| `/resonance/journey/phase/count` | i | | Phases in this journey (usually 6) |
| `/resonance/journey/phase/progress` | f | 0..1 | Progress through the phase |
| `/resonance/journey/progress` | f | 0..1 | Progress through the journey |
| `/resonance/journey/emblem` | i | 0/1 | The journey's emblem (or Ghost's blossom moment) is being worn by the particles |
| `/resonance/palette/count` | i | 0..5 | Colours in the palette below |
| `/resonance/palette/{0..4}/r` `/g` `/b` | f | 0..1 | The journey's **image palette for this phase** (sampled from its stills), or its theme palette if it has none. A short palette repeats its last colour |
| `/resonance/shader/opacity` | f | 0..1 | The journey frame's shader opacity |
| `/resonance/particles/present` | i | 0/1 | The particle field is on screen |
| `/resonance/phrase/swell/density` `/size` `/react` | f | around 1 | Phrase-conductor swell multipliers (1 = neutral) |
| `/resonance/harmony/current` | f | 0..1 | Harmonic current strength |
| `/resonance/harmony/tension` | f | 0..1 | Harmonic tension: 0 = release (laminar drift), 1 = gathering |
| `/resonance/harmony/layering` | f | 0..1 | Depth stratification |
| `/resonance/breath/amount` | f | 0..1 | Breath strength (0 = off for this journey) |
| `/resonance/breath/phase` | f | -1..1 | -1 exhaled (contracted) … +1 inhaled (expanded) |
| `/resonance/breath/settle` | f | 0..1 | Rest as a phrase lands |
| `/resonance/morph/playing` | i | 0/1 | A travel morph clip is on screen |
| `/resonance/morph/progress` | f | 0..1 | Its progress |
| `/resonance/heartbeat` | i | | Frame sequence number (a stall shows as a frozen channel) |

### Pulses (CHOP triggers)

`/resonance/pulse/<name>` (f) holds the event's strength for **one frame**, then
goes back to 0. Feed it into a Trigger CHOP or a Lag CHOP. The names are
`onset`, `note`, `section`, `phrase`, `crest`, `breath`, `cadence`, `beat`,
`bar`, `phase`, `journey` and `morph`. At 20 Hz a pulse lasts about 50 ms, so
use the event messages below if you need the exact count.

### Strings (OSC In DAT; on change + keyframe)

| Address | Args | Meaning |
|---|---|---|
| `/resonance/journey/id` | s | Journey id (e.g. `ghost`) |
| `/resonance/journey/name` | s | Display name |
| `/resonance/journey/phase` | s | `threshold` `expansion` `transcendence` `illumination` `return` `integration` |
| `/resonance/journey/image` | s | What the particles wear: `emblem` `moment` `motif` `echo` `angel` `none` |
| `/resonance/shader/name` | s | Shader in use |
| `/resonance/shader/dual` | s | The dual layer under it (`none`) |
| `/resonance/particles/soul` | s | Particle soul / form (`vortex`, `blossom`, …; `none`) |
| `/resonance/presenter/label` | s | Kiosk phase label between journeys (set title, dedication, `LIVE · …`) |
| `/resonance/palette/hex` | s… | The palette as `#rrggbb` (≤ 5) |
| `/resonance/theme/hex` | ssss | Theme palette: primary, secondary, accent, glow |

### Events (OSC In DAT; once each)

| Address | Args | Source |
|---|---|---|
| `/resonance/audio/onset` | f strength, f pitch (0 low … 1 high register) | The living-score onset detector |
| `/resonance/midi/note` | i note, i velocity | Nord / any MIDI input (Live Theatre, `?midi=1`) |
| `/resonance/midi/noteoff` | i note | |
| `/resonance/midi/pedal` | i down | Sustain pedal |
| `/resonance/phrase/event` | s kind, s action, f strength, s label | Phrase conductor. Kind is `section` `phrase` `crest` `breath`; action is `form` `refigure` `swell` `thin` `morph` |
| `/resonance/phrase/cadence` | f peak | A breath phrase landing on a section boundary |
| `/resonance/event/phase` | s phase, i index | Journey phase change |
| `/resonance/event/journey` | s id, s name | A new journey began |
| `/resonance/event/morph` | i start(1)/end(0), f duration | Travel morph clip |
| `/resonance/clock/tick` | i beat | Each beat of the tempo grid |
| `/resonance/clock/downbeat` | i bar | Each bar |

### Where each signal comes from (and when it's neutral)

- **Bands** are computed in the send loop from the particle layer's spectrum
  buffer, or from the shared analyser when particles are off. They use the same
  bins, smoothing and silence law as `visualizer.tsx`. In Live Theatre they
  follow the mic analyser the show listens to.
- **Onsets** come from `OnsetDetector` (`living-score.ts`). While the bridge is
  on, the detector runs on every journey, including Snowflake and Ghost, where
  it drives nothing on screen. They need the particle layer mounted.
- **Phrase / cadence / swell, harmonic currents, breath** come from the
  conducted timelines (`phrase-conductor.ts`, `harmonic-currents.ts`,
  `breath.ts`). They are **neutral** wherever the feature is off for a journey
  (the mastered journeys run without them), and they are never emitted across
  a seek.
- **Journey / phase / theme palette / shader** come from the journey engine's
  frame. The **image palette** comes from `journey-palettes.generated.ts` (this
  phase's stills), the same colours the particles wear.
- **MIDI** carries the exact notes whenever MIDI input is running.

## Data in: TD → Resonance cues (optional)

Run the relay with `--cues`. Send OSC to `udp 127.0.0.1:7001`. For a desk on
another machine, use `--cue-host 0.0.0.0 --cue-allow <desk IP>`. Cues are
forwarded to the kiosk's phone-remote bus (`/api/pack/remote`), so they work
**only on the offline-pack kiosk**, exactly like the phone remote. If
`TRAMOKYO_REMOTE_KEY` is set, pass `--remote-key` or set the same env var.
Cues are allow-listed and capped at 5 a second. A trigger with argument `0` (a
TD button release) is ignored.

| OSC cue | Remote command |
|---|---|
| `/resonance/cue/next` | `skip` (next journey in the loop / Live Theatre) |
| `/resonance/cue/prev` | `prev` |
| `/resonance/cue/play` | `toggle-play` |
| `/resonance/cue/set/next` `/set/prev` | `set-next` / `set-prev` |
| `/resonance/cue/title/hold` `/title/release` | Hold / release the title card |
| `/resonance/cue/journey` s `id[@program]` | `jump:<id>` |
| `/resonance/cue/program` s `id` | `program:<id>` |
| `/resonance/cue/volume` f 0..1 | `volume:<v>` |
| `/resonance/cue/live` `/loop` | Switch to Live Theatre / the loop |
| `/resonance/cue/mark` | Mark a glitch at this second (flight recorder) |

`reload`, `break` and the particle A/B switches deliberately can't be sent from
a VJ desk.

In TD: use an OSC Out CHOP (or DAT) at `127.0.0.1:7001`. For example, a Button
COMP → CHOP Execute that sends `/resonance/cue/next 1`.

## The show patch: `ResonanceShow.toe`

A finished TouchDesigner show, driven live by this bridge. It is a GPU
particle field with feedback trails. Every journey has its own look, and the
music moves it.

- **Patch:** `~/Documents/Resonance/touchdesigner/ResonanceShow.toe`
- **Built from:** `scripts/touchdesigner/`, all in the repo, so the patch can be rebuilt any time.

### Install (once per machine)

TouchDesigner 2025.33230 (Apple Silicon) is installed at
`~/Applications/TouchDesigner.app`. To install it on another Mac:

```sh
curl -L -o ~/Downloads/TouchDesigner.2025.33230.arm64.dmg \
  https://download.derivative.ca/TouchDesigner.2025.33230.arm64.dmg
hdiutil attach -nobrowse -readonly ~/Downloads/TouchDesigner.2025.33230.arm64.dmg
ditto "/Volumes/TouchDesigner 2025.33230/TouchDesigner.app" ~/Applications/TouchDesigner.app
hdiutil detach "/Volumes/TouchDesigner 2025.33230"
```

The current build is listed at derivative.ca/download. The Mac links follow
the pattern `https://download.derivative.ca/TouchDesigner.<build>.arm64.dmg`
(use `.intel.dmg` for Intel Macs).

**Licence.** On first launch TouchDesigner opens the **Key Manager**. Sign in
with a free Derivative account and choose **Non-Commercial**. This Mac is
already licensed Non-Commercial (done 2026-10-13).

Non-Commercial caps every TOP at **1280 × 1280**, so the patch defaults to
1280 × 720 output. A paid Commercial or Educational key removes the cap. With
one, set `Outw`/`Outh` to 1920 × 1080 or the projector's native size.

### Launch

```sh
open -a ~/Applications/TouchDesigner.app ~/Documents/Resonance/touchdesigner/ResonanceShow.toe
```

The shipped `.toe` is already built: TouchDesigner made it and saved it, and the
self-test below ran against it.

If you regenerate it with `make_toe.mjs`:

- The first start builds `/project1/show` from the embedded `build_show` DAT
  (about 2 s).
- It then saves the result. TouchDesigner's incremental save writes
  `ResonanceShow.1.toe` next to it, so open that file from then on, or rename it.
- Each build appends to `ResonanceShow.build.log` next to the `.toe`. A failed
  build leaves its traceback there.

To rebuild from the Textport:

```python
op('/project1/boot').module.rebuild()
```

### Show day

1. **Kiosk:** start the relay (`node scripts/osc-relay.mjs`), and add `?osc=1`
   once to the kiosk URL. Nothing else changes on the kiosk.
2. **TD on the same Mac:** open the patch. The OSC In CHOP `osc_in` and the OSC
   In DAT `osc_dat` both listen on UDP **7000**.
3. **TD on another machine:** start the relay with
   `--osc-host <TD machine IP>`.
4. **Projector:**
   1. On `/project1/show`, open the **Show** page.
   2. Set `Display` to the projector's index (0 = main), and set `Outw`/`Outh`.
   3. Pulse **Open output window**.

   The output window is borderless, always on top and has no cursor. You can
   also use **F1** perform mode, which shows `/project1/show/out`. Esc returns
   to the editor.
5. **Check it's live:** `osc_in` should show about 70 channels moving. The
   `brain` DAT's `show.fetch('look')` names the look in use.
6. **Hands off:** looks follow the kiosk's journey changes on their own. Nothing
   needs touching during the show.

AirPlay Receiver (Control Center) also listens on port 7000, but on **TCP**.
OSC is UDP, so the two don't clash. If anything else ever holds UDP 7000, run
the relay with `--osc-port 7002` and set both OSC In ports to match.

If TD runs on the kiosk Mac, it shares the GPU with the show. Keep
`Particleres` at 128 (16k motes, the default). On a dedicated machine, 256
(65k) is comfortable.

### Rehearsal (no kiosk)

Toggle **Show > Rehearsal**. The `brain` then plays the recorded OSC log in
`/project1/rehearsal_log` into the patch's own OSC In, through `osc_out` to
127.0.0.1:7000, one bundle per frame like the relay. It loops at the end.

The bundled log is 76 s long:

- Snowflake, Yellow Bird and Chenin 5, each 16 s around a phase boundary near
  its climax;
- a 3 s title-hold silence before each one;
- one **uncatalogued** journey id, which exercises the fallback look.

Stop the relay while rehearsing: both would feed port 7000.

The log comes from the real journey data, not from random noise. Each segment
uses that journey's deep-analysis energy curve, section onset rates,
brightness and harmony, its phase bounds and tempo, and its per-phase stills
palettes. It all goes through the relay's own `frameToOsc` map, so addresses,
types, pulses and keyframes match what the relay sends.

Make another log, record a real session, or replay a file without TD:

```sh
node scripts/touchdesigner/osc-show.mjs synth --journeys ghost,first-snow --out my.oscl.jsonl
node scripts/touchdesigner/osc-show.mjs record --seconds 120 --out show.oscl.jsonl   # relay → :7000, TD closed
node scripts/touchdesigner/osc-show.mjs replay show.oscl.jsonl --loop                 # → TD :7000
node scripts/touchdesigner/make_toe.mjs --log show.oscl.jsonl                         # embed it in a fresh .toe
```

### Looks: one per journey

`scripts/touchdesigner/build-looks.mjs` writes `looks.json`, which holds
**119 looks**: every journey id that has stills palettes or a deep analysis
in the repo. Each look comes from the journey's own data
(the founding law: never from the title).

| Look field | Comes from |
|---|---|
| `palette` and 6 `phases` palettes (5 stops, dark → light) | its pack stills (`journey-palettes.generated.ts`), or its theme palette |
| `form`: 0 drift, 1 rise, 2 vortex, 3 fall, 4 orbit | mood arousal + valence, section trends, tempo steadiness |
| `speed`, `turbulence`, `emission`, `size`, `trail` | energy curve, dynamics, onset rate, voice character (quiet / middle / energetic) |
| `warmth`, `sparkle` | major/minor balance × valence, spectral brightness |

Palettes are made seizure-safe at generation: no saturated red, and the
brightest stop is at most 0.85 luminance.

**Selecting a look:**

- `/resonance/event/journey` (and the `journey/id` keyframe) selects the look
  by **id**, falling back to the journey **name**.
- `/resonance/event/phase` and `journey/phase/index` move to that phase's
  palette.
- A journey change is a **smoothstep crossfade** of every control over `Xfade`
  (8 s). While it runs, trails lengthen and emission dips, so one world
  dissolves into the next.
- A phase change crossfades over `Phasexfade` (6 s).
- **Fallback:** an id that isn't in `looks.json` gets a palette-derived default
  look: a calm drift/orbit field coloured live from the journey's own
  `/resonance/palette/*` channels.
- Empty ids between journeys are ignored, so the look holds through the title
  card.

After the journey catalogue changes, regenerate the looks and the patch:

```sh
node scripts/touchdesigner/build-looks.mjs && node scripts/touchdesigner/make_toe.mjs
```

### The network (`/project1/show`)

```
osc_in  (OSC In CHOP :7000) ─┐
osc_dat (OSC In DAT  :7000) ─┴→ brain (Execute DAT, every frame)
        osc_cb → event queue      ├ normalise channels, look select + crossfade
                                  ├ music → MOTION: speed, turbulence, emission, size
                                  └ rehearsal player → osc_out (127.0.0.1:7000)
raw (Constant CHOP) → ease (Lag 0.15 s up / 0.6 s down) → calm (Filter 0.3 s) → ctl (Null)
                                                    every shader uniform reads ctl ↓
seed → sim_fb → sim (GLSL, RGBA32F: xyz + life; curl flow × form blend; respawn = emission)
             sim → pcol (GLSL: palette colour, life fade-in 0.9 s / fade-out 1.6 s, presence)
sprite (GLSL soft mote) → mote_mat (Constant MAT, additive, premultiplied)
geo (instancing: translate ← sim r/g/b, colour ← pcol rgba) + cam → render
render ─→ trail (GLSL: advected feedback, max-blend, bounded) ←─ trail_fb
trail  ─→ safe  (GLSL: palette ground, master, luminance cap, red guard, per-pixel slew) ←─ safe_fb
safe → out (Null TOP) → window (Window COMP, projector) · rec (Movie File Out, self-test)
```

**Music → motion map:**

- level, bass and onsets drive flow **speed**;
- harmonic tension, onsets and treble drive **turbulence**;
- onsets and sections drive **emission bursts**;
- bass and cadences drive mote **size**;
- breath moves the field **in and out**;
- journey progress drives emission density (sparse → build → cosmic);
- silence and title holds fade presence to 25 % over about 2 s.

### Seizure law, enforced in the patch

- Audio never touches brightness. `master` is a fixed parameter (0.3–0.9,
  default 0.85, clamped) with no audio term.
- Every control is eased three times: the brain's envelopes and smoothstep
  crossfades, then the Lag CHOP, then the Filter CHOP.
- New motes fade in over at least 0.9 s. Trails use max-blend, so light can
  never accumulate.
- The `safe` stage enforces the limits for every frame:
  - luminance soft-capped at 0.8;
  - saturated red pulled back;
  - **every pixel slew-limited to 2.4/s**, so no input whatsoever can make
    the output flash.

### Tests

These run without a TouchDesigner licence:

```sh
python3 scripts/touchdesigner/test_show.py --track /tmp/track.json        # build + brain + 119 looks
node scripts/touchdesigner/render_check.mjs /tmp/track.json --out /tmp/td.mp4 --from 16 --seconds 20
node scripts/flicker-meter.mjs /tmp/td.mp4
```

- **`test_show.py`** builds the patch against a mock TD API, which checks
  every operator type and parameter name against the installed TD's
  `TDParameterHelp.json` and every menu value against its offline help. It
  runs the brain's TD glue and replays the rehearsal log through the real
  brain at 60 fps, checking:
  - look selection;
  - continuity;
  - that `master` is constant;
  - that all 119 looks resolve by id and by name.
- **`render_check.mjs`** renders the same GLSL in headless WebGL2 and writes an
  MP4 for the flicker meter.

In TouchDesigner itself, the self-test does the following:

1. builds the patch;
2. turns rehearsal on;
3. records `out` for 24 s with `rec`;
4. writes `td-selftest.json` (errors, warnings, OSC channel count, look
   switches, TOP statistics);
5. quits.

```sh
RESONANCE_TD_SELFTEST=/tmp/tdtest ~/Applications/TouchDesigner.app/Contents/MacOS/TouchDesigner \
  /path/to/a/copy/of/ResonanceShow.toe
node scripts/flicker-meter.mjs /tmp/tdtest/td-show.mov
```

A scripted launch once sat on the splash screen at 0 % CPU. Stop that PID and
launch again; the next launch finished in 42 s.

The evidence from the run below is kept in
`~/Documents/Resonance/touchdesigner/selftest-2026-10-13/`: `td-selftest.json`
and the 24 s `td-show.mov`.

Results on 2026-10-13, TD 2025.33230 Non-Commercial on this Mac:

| Run | What | Result |
|---|---|---|
| Real TD self-test | Build | 49 ops, 0 build warnings, 0 errors |
| | OSC | 71 channels live |
| | Looks | palette default → Snowflake → Yellow Bird |
| | Flicker meter | **0 flashes, 0 red flashes, 0 % local flicker (PASS)** |
| WebGL render of the full 76 s log | 4 journeys, including the fallback | **0 flashes (PASS)** |

## Starter network (text recipes)

The base for every recipe:

1. `oscin1` (**OSC In CHOP**): Port `7000`, Address Scope `/resonance/*`,
   Queued off. Channels appear named after the addresses.
2. `oscin_dat` (**OSC In DAT**): Port `7000` (TD can share a port across OSC
   In operators). Keep it for strings and events.
3. Pick channels with **Select CHOP**s using wildcard patterns such as
   `*audio/bass *audio/mid *audio/treble`. Wildcards work however your TD
   version prefixes the channel names.

### 1. Audio-reactive instancing

- `sel_bands` (Select) picks `*audio/bass *audio/mid *audio/treble *audio/level`.
- `lag_bands` (Lag CHOP) uses lag up 0.08 s and lag down 0.4 s. The bands are
  already smoothed like the shaders, so this is only extra softness for big
  surfaces.
- `math_scale` (Math CHOP) maps 0..1 to 0.6..1.8 for instance scale. Treble
  maps to rotation speed through a Speed CHOP, so it changes *speed*, not a
  jump.
- `sel_onset` (Select `*pulse/onset`) feeds a **Trigger CHOP** (attack 0.02 s,
  decay 0.6 s). Use the envelope for instance emission or displacement, never
  for overall brightness (seizure law).
- `sel_tension` (Select `*harmony/tension`) feeds a **Noise CHOP** amplitude:
  the field gathers as harmony tightens and relaxes on release.
- `sel_breath` (Select `*breath/phase`, -1..1) drives the Geometry COMP's
  uniform scale (1 + 0.08 × breath), so the whole cloud inhales with the
  phrase.
- Geometry COMP: instance from a Sphere/Grid SOP (or an Instance CHOP built
  from a Noise CHOP). Translate comes from the noise, scale from `math_scale`.
  Colour comes from recipe 2's palette ramp, sampled by instance index.

### 2. Palette-driven LED mapping

- `sel_pal` (Select) picks `*palette/0/* *palette/1/* *palette/2/* *palette/3/* *palette/4/*`
  (15 channels: r, g, b × 5).
- **Shuffle CHOP**: "Sequence Channels by Name" → 5 samples × r, g, b.
  Rename them to `r g b`. Then **CHOP to TOP** makes a 5 × 1 colour strip.
- **Fit/Resolution TOP** stretches it to the LED pixel count. Interpolate
  (or Lookup TOP) to blend between palette stops.
- Intensity uses `*audio/level` (lagged 0.3 s) × 0.6 + `*breath/phase`
  remapped to 0.7..1.0 × 0.4. Clamp the master at a safe maximum. The palette
  follows **the phase's own stills**, so the room's light matches the imagery
  on screen.
- `*pulse/section` → Trigger (attack 0.5 s, decay 3 s) adds a gentle lift of at
  most +15 % at each section, never a flash.
- Output: **TOP to CHOP** → DMX Out CHOP (Art-Net / sACN), or a Pixel Map for
  an LED wall.
- Rate law for lights: run the final intensity through a **Filter CHOP**
  (≥ 0.25 s) so no rule upstream can strobe a fixture.

### 3. Journey-phase scene switching

- `sel_phase` (Select `*journey/phase/index`) → **Lag CHOP** (2 s) →
  **Switch TOP** (Blend between inputs on) with one input per phase look
  (6 scenes). Phases change smoothly, so the scenes crossfade.
- Or drive a **Cross TOP** from `*journey/phase/progress` for a slow evolution
  inside each phase. `*journey/progress` drives the whole arc, from sparse to
  build to the cosmic end.
- Text / titles: in a DAT Execute on `oscin_dat`, react to
  `/resonance/event/journey` and `/resonance/event/phase` (and read
  `/resonance/journey/name`) to update a Text TOP and fade it in for 4 s.
- `*morph/playing` = 1 means a travel morph is crossing a phase boundary on
  the main screen. Hold your scene switch until it falls back to 0 so both
  surfaces arrive together.
- `*presenter/holding` = 1 (the title card) or `*audio/silent` = 1 (between
  journeys): fade the extra surfaces to black so the room breathes with the
  show.

## Files

| File | Role |
|---|---|
| `scripts/osc-relay.mjs` | The relay (WebSocket in → OSC/UDP out; cues in → remote bus) |
| `src/lib/vj-bridge/osc.mjs` | Minimal OSC 1.0 encoder/decoder (byte-exact tests against the spec examples) |
| `src/lib/vj-bridge/osc-map.mjs` | Frame → address map, cue allow-list |
| `src/lib/vj-bridge/ws-frame.mjs` | Minimal RFC 6455 server framing |
| `src/lib/vj-bridge/rate-gate.mjs` | The shared rate gate |
| `src/lib/vj-bridge/protocol.ts` | Frame schema, packing, band drive, beat clock, enabling flags |
| `src/lib/vj-bridge/bridge-core.ts` | Send loop, socket lifecycle, derived events (dependency-injected) |
| `src/lib/vj-bridge/client.ts` / `use-vj-bridge.ts` | Browser wiring, mounted from `useKioskRemote` (all kiosk contexts + /room) |
| `src/lib/vj-bridge/tap.ts` | Where the particle lead layer leaves its signals |
| `scripts/touchdesigner/build_show.py` | Builds `/project1/show` inside TD: brain (looks, crossfades, music → motion, rehearsal), GLSL, self-test |
| `scripts/touchdesigner/build-looks.mjs` → `looks.json` | One look per journey from its stills palettes + deep analysis |
| `scripts/touchdesigner/make_toe.mjs` | Writes `ResonanceShow.toe` with TD's `toecollapse` (no licence needed); embeds build_show, looks, rehearsal log |
| `scripts/touchdesigner/osc-show.mjs` | Rehearsal logs: `synth` (from real journey data), `record`, `replay` |
| `scripts/touchdesigner/rehearsal.oscl.jsonl` | The 76 s rehearsal log (generated, seeded and deterministic, by `make_toe.mjs` / `test_show.py` when missing; not committed) |
| `scripts/touchdesigner/test_show.py` | Offline tests: mock-TD build validation, brain replay, control track |
| `scripts/touchdesigner/render_check.mjs` | Headless WebGL2 render of the same shaders → MP4 for the flicker meter |
