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
