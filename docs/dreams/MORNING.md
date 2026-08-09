# Morning digest — last updated 2026-08-09 (cycle 1070, WIDE)

**Open first:** https://getresonance.vercel.app/dream/8904-billow

## New since yesterday
- **`8904-billow` — make a hanging cloth BILLOW and its folds sing.** Every
  membrane instrument in the lab so far is a *taut* skin you strike (drumheads,
  Chladni plates, cymatics). This one is **slack** — a cloth hung from its top
  edge, draping under gravity. **Tilt your phone** (or drag a wind on desktop)
  and it billows, and a **wrinkle sweeping across the fabric** rings a bank of
  struck spectral-bell voices — so a fold rippling left-to-right is a glissando
  you both SEE (a lit 3D surface) and HEAR. Rendered in **WebGPU** (the lab's
  most-starved substrate) with a Canvas2D fallback so it works even without it.
  Warm linen, no drone. *Why open it:* it auto-billows the moment it loads, so
  the travelling fold reads even muted — but it's best with volume on and a
  phone you can tilt.

## How it was made (WIDE fire, 3 parallel builders → 1 shipped)
- Cycle 1070 ran **WIDE**: three unrelated directions in one fire, each on a
  different substrate/input. Shipped the cloth; **2 more explored — see IDEAS.md.**

## In the bank (built to demoable this fire, resurrect-ready — IDEAS §1070)
- **⭐⭐ `8920-phonautograph` — draw a recording with your VOICE, then scratch it
  back.** Speak into the mic; your voice etches a visible groove on a spinning
  wax cylinder; drag along the groove to replay it forwards/backwards like a
  scratch DJ. Grep-0 (nothing like it in the lab). *The killer next step:* seed
  its groove from your real Path piano — then you're scratching **your** piano.
- **⭐⭐ `8936-soapfilm` — a soap film that sings.** Place wire posts; a film
  relaxes to the minimal surface across them and voices its area/tension; the
  only color is real thin-film iridescence (deliberately non-violet).

## Research finding (§1070)
- **"Real-Time Cloth Simulation Using WebGPU" (arXiv:2507.11794, July 2026)** —
  GPU cloth is now cheap in a browser tab. It exposed the gap tonight's build
  fills: the lab had ~a dozen *taut* membranes and zero *draping* ones. The
  chain (this month's paper → tonight's instrument) is the point.

## Open questions for Karel
- **Scratch your own piano?** The banked `8920-phonautograph` is the natural
  on-ramp to your standing "use my real Path piano" ask (~36 cycles) — seed its
  buffer from `/api/audio/[id]`. Make that the next DEEP?
- The **AI-pipeline chain** (music→image→video, needs `FAL_KEY`) is still a
  standing build-or-strike.
- Strategic (~16 cycles): "first-ever technique" is unreachable at 1000+
  prototypes — formally reward fresh-verb + scope + diversity instead? Tonight
  is another honest 3/5 with no #1.
