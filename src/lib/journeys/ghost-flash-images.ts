/**
 * Ghost flash-angel image pool.
 *
 * The Ghost journey's bass-hit flash shows an angelic figure on the beat.
 * Both flashes show the WHITE angel (Karel 2026-10-01: the possession
 * micro-story — dark angel on flash #1, black dress until flash #2 — is
 * retired with the rest of the possession arc).
 *
 * The white image is generated once per session and consumed by `FlashAngel`
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
  "long free-flowing fibonacci spiral da Vinci fractal hair (NOT braided) cascading from her head down past her waist to the ground and also trailing upward and outward in the air like streamers and ribbons, wrapped with dense swirling particles spiraling along every strand, hair flowing seamlessly into her dress so hair and dress read as one continuous translucent ribbon, " +
  "wearing a long floor-length flowing translucent dress of woven mist and light, somewhat see-through, rippling with dense swirling particles, " +
  "ALWAYS TWO translucent flowing wispy angel wings attached anatomically to her upper BACK at the shoulder blades (BOTH LEFT and RIGHT wings fully visible and symmetrical, NEVER missing a wing, NEVER one-winged, NEVER detached). wings are translucent flowing wisps of light and mist, like flowing smoke or silk trailing behind her, thin and ethereal, made of pure light and particle mist. NEVER FEATHERED, NEVER bird feathers, NEVER plumage, NEVER butterfly, NEVER segmented, NEVER insect-like, NEVER panels, NEVER membrane, NEVER filigree, NEVER opaque, NEVER bulky. " +
  "strong rim light from above outlining her edges against the void, dramatic chiaroscuro, photographic product-shot isolation, not illustration, not concept art";

const WHITE_FLASH_PROMPT =
  FLASH_PORTRAIT_BASE +
  ", pose: SOARING freely with both arms fully outstretched UPWARD in transcendent flight, head tilted BACK, body angled upward rising into infinity — the same transcendent flight pose from the golden cosmos finale scene, " +
  "eyes closed peaceful serene ecstatic expression, " +
  "wardrobe: returned to light. hair is SNOW WHITE (NEVER blonde, NEVER yellow, NEVER gold), dress is SNOW WHITE translucent mist-and-light, wings on her back are SNOW WHITE translucent flowing wisps of light and mist like flowing smoke or silk, particles wrapped in her braids and streaming from her dress and wings are WHITE";

// Index 1 = the white angel (both flashes). Index 0 is the retired dark
// variant — never generated; getGhostFlashUrl() maps every variant to 1.
const FLASH_PROMPTS: (string | null)[] = [null, WHITE_FLASH_PROMPT];

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
  return "white"; // possession retired 2026-10-01 — never the black dress
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
        if (!prompt) return;
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
  void variant; // both flashes are white
  return flashUrls[1] ?? null;
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
