**For**: kids (4+)

## Shake Band

Shake the tablet like a maraca and a whole Brazilian batucada band dances and plays back in time with your shaking. Gentle jiggles trigger the soft chocalho shaker; big arm swings bring in the surdo bass drum. Five glowing 3D characters bounce and flash on a darkened stage — one for each instrument in the ensemble.

---

## How to Play

1. Tap **Start 🥁** (unlocks audio and requests motion permission).
2. **Shake the device** — any direction works.
   - Gentle jiggle → chocalho (violet shaker character)
   - Light shake → repique (emerald mid-tom)
   - Medium shake → caixa (amber snare)
   - Hard slam → surdo + agogô (rose bass drum + sky bell)
3. On desktop / no accelerometer: **drag your finger or mouse fast** across the screen to drive the same percussion.
4. The band plays a soft batucada groove bed the whole time — you always hear music even before you shake.

---

## Named Reference

**Brazilian batucada bloco** — a street carnival percussion section that marches with a locked groove of surdo (bass), caixa (snare), repique (tenor tom), agogô (cowbell pair), and chocalho (large metal rattle). The shake-intensity tiers map honestly to the batucada dynamic hierarchy: the surdo is the loudest and deepest, held for strong downbeats; the chocalho shimmers continuously at the top; agogô and repique fill the middle accents.

This drove the design in three concrete ways:
1. The groove bed scheduler uses a 16-step batucada pattern (surdo on 1+3, caixa on 2+4, repique fills, agogô accent on beat 1, chocalho off-beats).
2. The instrument voicing is faithful — surdo is a sine with fast pitch-drop (130→42 Hz), caixa is bandpass noise, repique is a mid-sine + attack transient, agogô is three sine partials, chocalho is a soft bandpass noise grain.
3. The character colors map to the ensemble: rose for surdo (the loudest, most physical drum), violet for the airy chocalho shimmer, emerald for the quick repique fills.

---

## Subsystems

1. **Input — DeviceMotionEvent**: `accelerationIncludingGravity` magnitude → adaptive threshold onset detection (80 ms refractory period, rolling average for baseline). iOS `DeviceMotionEvent.requestPermission()` called inside Start button handler.
2. **Input fallback — pointer drag velocity**: drag speed in px/ms drives same magnitude→hit mapping for desktop / denied-permission scenarios.
3. **Audio synthesis — Web Audio percussion voices**: surdo (sine pitch-drop), caixa (bandpass noise + triangle snap), repique (sine + noise transient), agogô (three sine partials through bandpass), chocalho (bandpass noise grain). All 5 voices synthesized from scratch — no samples.
4. **Master safety chain**: `instrument gain → global gain → lowpass (7.5 kHz) → DynamicsCompressor (threshold −10 dB, ratio 20:1) → destination`. Cymbal/snare can never spike a child's ears.
5. **Groove bed scheduler**: `setTimeout`-based look-ahead groove loop at 92 BPM. 16-step batucada pattern plays always-on. Child's shakes layer on top — it always sounds musical.
6. **Three.js 3D stage**: Five `IcosahedronGeometry` characters on a `MeshStandardMaterial` stage. Per-character `PointLight` flashes on hits. Spring physics drive the bounce. Camera gently sways. Emissive intensity and scale pulsing tied to flash intensity with exponential decay (~50 ms halflife → feels immediate).
7. **Auto-demo pre-start**: CSS animation bounces the colored orbs from frame one, no audio — satisfies autoplay rules.
8. **Graceful degradation**: motion denied/unsupported → `text-rose-300` notice + drag fallback active. WebGL unavailable → React error boundary (not thrown, the canvas mount checks renderer).

---

## Renderer

**Three.js** (`three@^0.182.0`, already in `package.json`). Chosen because the brief specifies three.js for a 3D-ish stage of glowing dancing characters. Five icosahedron meshes with emissive `MeshStandardMaterial`, per-character `PointLight` rigs, and spring-physics bounce give the "dancing band" feel with very little geometry — loads instantly.

---

## Unverified Surfaces

- **iOS motion permission timing**: the `requestPermission` dialog must fire synchronously inside the click handler; the `await` for the async result comes after. This matches the iOS 13+ pattern but needs testing on a real device.
- **Accelerometer sensitivity calibration**: the magnitude tiers (3 / 9 / 18 m/s²) were chosen heuristically. On some phones the quiet-mode `accelerationIncludingGravity` may read lower; the adaptive threshold in `motion.ts` (1.4× rolling average, floor 3.5 m/s²) should compensate but may need tuning.
- **60 fps budget on low-end tablets**: the Three.js scene is lightweight (5 meshes + 5 lights + floor + wall + 4 ceiling spots) but hasn't been profiled on Android entry-level hardware.
- **`webkitAudioContext` path**: untested on older Safari; the `|| (window as any).webkitAudioContext` cast should cover it.
