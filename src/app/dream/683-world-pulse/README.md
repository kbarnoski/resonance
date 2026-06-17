# World Pulse

**Route:** `/dream/683-world-pulse`

> What does the live, collective fear and greed of the world's markets sound and
> look like — right now, this second — if you witness it as a cosmic weather
> system instead of a trading screen?

A meditative, long-form audio-visual instrument. It listens to the world's
largest live market trade firehose and renders it not as candles and numbers but
as a luminous data-nebula with a slowly drifting modal drone. Buyers push the
field warm and bright; sellers cool and darken it; the turbulence of the storm is
the volatility of the market itself.

## The data → sound / visual mapping

| Market signal | Derived state | Sound | Visual |
|---|---|---|---|
| Buy aggressor (`m===false`) | up-pressure → momentum | brightens lowpass toward warmth; bright Lydian-lifted chime degrees | particles tinted warm (amber/rose), gentle buoyancy |
| Sell aggressor (`m===true`) | down-pressure → momentum | darker tension that still wants to resolve; pensive chime degrees | particles tinted cool (cyan/indigo), sinking drift |
| Price level | rolling-window normalization → `priceNorm` (0..1) | — | horizontal position where each trade's burst is born |
| Trade size `q` | log-scaled `lastSize` (0..1) | bigger trade → **lower & louder** bell/chime | larger, brighter impulse of births |
| Recent return variance | EMA `volatility` (0..1) | more shimmer, more reverb/space | higher curl/turbulence in the flow field, denser grain |
| Any trade | `pulse` (decaying spike) | (visual only) | momentary brightness lift across the field |
| Time | slow harmonic drift every ~22s + accumulating state | the bed transposes through modal steps and returns home | — |

The harmonic body is an always-present **D-Dorian** pad bed (drifting toward a
Lydian #4 color on up-momentum, a suspended/minor resolve on down-momentum), so
the piece is never silent between ticks and is genuinely **long-form** — minute 5
does not sound like minute 0.

### Audio safety
Single master chain: buses → `lowpass` (safety) → `DynamicsCompressor` brick-wall
limiter → master gain (≤ 0.34) → out. Chimes fade in (no startling transients).
An algorithmic convolution reverb adds cosmic space and grows with volatility.

## Inputs / outputs / technique (tags)

- **INPUT** — live, **keyless** browser **WebSocket** to Binance's public trade
  firehose: `wss://stream.binance.com:9443/ws/btcusdt@trade` (falls back to
  `stream.binance.us`). Read-only, no auth, no API route, no secret.
- **OUTPUT** — **WebGPU compute-shader particle nebula** (~60k particles advected
  by a curl flow), feature-detected via `navigator.gpu`, with a **Canvas2D**
  luminous particle-field fallback.
- **TECHNIQUE** — live market-tick → harmony/texture sonification:
  momentum → consonance/tension, volatility → density/reverb, trade size → bell
  register & loudness, price → spatial position.

## Graceful degradation

This piece is built to be **fully alive even in a silent, network-restricted
room**:

1. On load it **immediately** starts a built-in synthetic market generator — a
   geometric random walk with occasional volatility bursts and a realistic
   buy/sell trade stream — so visuals and (once you press *Listen*) sound play
   instantly, hands-off, before any connection.
2. It then attempts the live WebSocket. If it opens, it hands over smoothly to
   real ticks. If it errors or hasn't connected, it stays on the synthetic
   generator and shows a small, readable amber notice
   (*"Live feed unavailable — playing a simulated market"*). If the live socket
   later drops, it falls back to synthetic again.
3. If **WebGPU** is unavailable or init fails, it silently uses the Canvas2D
   field — which is driven by the same state and is designed to look intentional
   on its own, not like a broken placeholder.

Everything tears down cleanly on unmount: rAF cancelled, socket closed,
oscillators stopped, `device.destroy()` called.

## Named references

- **Brian Foo — "Data-Driven DJ" / "Two Trains: Sonification of Income
  Inequality on the NYC Subway"** (datadrivendj.com). The idea that data
  *quantity and dynamics* drive instrumentation and density — here, trade size
  picks the bell register and volatility picks the shimmer density.
- **Refik Anadol.** Data as luminous, fluid pigment. The nebula aesthetic —
  additive, advected, weather-like — is in this lineage: the market as a field of
  light rather than a chart.
- General **market / data sonification** lineage (turning streams of events into
  evolving harmony rather than alarms).

---

**Tags:** live-websocket · keyless-firehose · webgpu-compute · canvas2d-fallback ·
market-sonification · modal-drone · momentum→consonance · volatility→density ·
cosmic · transcendent · anadol-nebula · long-form
