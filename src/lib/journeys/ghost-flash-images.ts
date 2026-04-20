/**
 * Ghost flash-angel image pool.
 *
 * The Ghost journey's bass-hit flash shows an angelic figure on the beat.
 * Per the user's direction the flash sequence tells a micro-story:
 *
 *   Flash 1 — DARK possessed angel (hair, dress, wings all black/shadow)
 *   Flash 2 — WHITE angel returned (same figure, white theme back)
 *   Flash 3+ — WHITE angel (same as flash 2)
 *
 * Two images are generated once per session and consumed by `FlashAngel`
 * via `getGhostFlashUrl(variant)`. Rendered with client-side luminance
 * chroma-keying in FlashAngel so pure-black pixels become truly transparent.
 *
 * If generation fails or is slow, `FlashAngel` falls back to its static PNG.
 */

// Shared portrait base — same body, same pale skin, same braided hair,
// same translucent butterfly wings on her back in both variants. The
// flashes differ in wardrobe color AND eye state:
//   Flash #1 (dark devil) — BLACK eyes wide open, black wardrobe
//   Flash #2 (white return) — soaring transcendent pose, eyes closed,
//                             white wardrobe (matches integration-phase
//                             imagery so the two scenes read together)
const FLASH_PORTRAIT_BASE =
  "studio isolation shot photorealistic cinematic portrait of ONE single ethereal angel woman perfectly isolated against absolute void (one figure only — no other people, no duplicates, no companions, no distant figures anywhere), " +
  "the background is SOLID RGB 0 0 0 PURE MATHEMATICAL BLACK with zero luminosity, zero color, zero gradient, zero haze, zero particles in the background, zero stars — the figure is the ONLY element visible, " +
  "pale luminous skin (skin stays pale in both variants), " +
  "hair woven into intricate fibonacci spiral da Vinci fractal braids cascading down her back, each braid wrapped and trailed with dense swirling particles spiraling along its length, the braids flowing seamlessly into her dress so hair and dress read as one continuous ribbon, " +
  "wearing a long floor-length flowing translucent dress of woven mist and light, somewhat see-through, rippling with dense swirling particles, " +
  "ALWAYS TWO translucent flowing wispy angel wings attached anatomically to her upper BACK at the shoulder blades (BOTH LEFT and RIGHT wings fully visible and symmetrical, NEVER missing a wing, NEVER one-winged, NEVER detached). wings are translucent flowing wisps of light and mist, like flowing smoke or silk trailing behind her, thin and ethereal, made of pure light and particle mist. NEVER FEATHERED, NEVER bird feathers, NEVER plumage, NEVER butterfly, NEVER segmented, NEVER insect-like, NEVER panels, NEVER membrane, NEVER filigree, NEVER opaque, NEVER bulky. " +
  "strong rim light from above outlining her edges against the void, dramatic chiaroscuro, photographic product-shot isolation, not illustration, not concept art";

const DARK_FLASH_PROMPT =
  FLASH_PORTRAIT_BASE +
  ", pose: standing facing camera front-on, BOTH ARMS RAISED high above her head reaching upward, " +
  "eyes wide OPEN with PURE JET BLACK orbs (entirely black eyes, no whites, no pupils, no iris — just solid void black eyes staring mysteriously, possessed stare), " +
  "wardrobe: possessed under a dark spell. hair is JET BLACK, dress is JET BLACK translucent shadow-mist, wings on her back are JET BLACK translucent flowing wisps of shadow and dark mist like flowing smoke or silk, particles wrapped in her braids and streaming from her dress and wings are BLACK. same identity, same body, same pose as the white version — only the wardrobe has flipped to black AND the eyes are open as black voids";

const WHITE_FLASH_PROMPT =
  FLASH_PORTRAIT_BASE +
  ", pose: SOARING freely with both arms fully outstretched UPWARD in transcendent flight, head tilted BACK, body angled upward rising into infinity — the same transcendent flight pose from the golden cosmos finale scene, " +
  "eyes closed peaceful serene ecstatic expression, " +
  "wardrobe: returned to light. hair is SNOW WHITE (NEVER blonde, NEVER yellow, NEVER gold), dress is SNOW WHITE translucent mist-and-light, wings on her back are SNOW WHITE translucent flowing wisps of light and mist like flowing smoke or silk, particles wrapped in her braids and streaming from her dress and wings are WHITE";

// Index 0 = dark possessed (shown on flash #1)
// Index 1 = white returned (shown on flash #2+)
const FLASH_PROMPTS = [DARK_FLASH_PROMPT, WHITE_FLASH_PROMPT];

const flashUrls: (string | null)[] = [null, null];
let preparePromise: Promise<void> | null = null;
let currentJourneyId: string | null = null;
let abortController: AbortController | null = null;

// Bass-flash counter for Ghost. Drives BOTH the flash variant shown AND
// the main journey angel theme:
//   count 0        → main journey angel is WHITE (before any flash)
//   count === 1    → flash #1 shows BLACK / possessed angel;
//                    main journey angel is now BLACK (costume change)
//   count >= 2     → flash #2 shows WHITE angel returning;
//                    main journey angel is now WHITE again for the remainder
let ghostFlashCount = 0;
export function incrementGhostFlashCount(): number {
  ghostFlashCount += 1;
  return ghostFlashCount;
}
export function getGhostFlashCount(): number {
  return ghostFlashCount;
}
export function getGhostAngelTheme(): "white" | "black" {
  return ghostFlashCount === 1 ? "black" : "white";
}

export function prepareGhostFlashImages(journeyId: string): Promise<void> {
  if (currentJourneyId !== journeyId) {
    abortController?.abort();
    currentJourneyId = journeyId;
    flashUrls[0] = null;
    flashUrls[1] = null;
    preparePromise = null;
    ghostFlashCount = 0;
  }
  if (preparePromise) return preparePromise;

  const controller = new AbortController();
  abortController = controller;

  preparePromise = (async () => {
    await Promise.all(
      FLASH_PROMPTS.map(async (prompt, idx) => {
        try {
          const res = await fetch("/api/ai-image/generate", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            signal: controller.signal,
            body: JSON.stringify({
              prompt,
              denoisingStrength: 0.5,
              width: 1024,
              height: 1024,
            }),
          });
          if (!res.ok) return;
          const data = await res.json();
          if (typeof data.image === "string") {
            flashUrls[idx] = data.image;
          }
        } catch {
          // Silent — FlashAngel will fall back to the static PNG. AbortError is expected on journey switch.
        }
      }),
    );
  })();

  return preparePromise;
}

/** Get the flash image URL for a variant. 0 = dark/possessed, 1 = white/returned. */
export function getGhostFlashUrl(variant: 0 | 1 = 1): string | null {
  return flashUrls[variant] ?? null;
}

/** Clear cached flash images and abort any in-flight generation — called on journey stop. */
export function clearGhostFlashImages() {
  abortController?.abort();
  abortController = null;
  currentJourneyId = null;
  preparePromise = null;
  flashUrls[0] = null;
  flashUrls[1] = null;
  ghostFlashCount = 0;
}
