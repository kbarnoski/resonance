/**
 * Ghost flash-angel image pool.
 *
 * The Ghost journey's bass-hit flash shows an angelic figure on the beat.
 * Per the user's direction: the figure's FACE is visible here — the only
 * moment in the entire journey where she's seen directly. Everywhere else,
 * her face is hidden behind her white spiral hair.
 *
 * Generates ONE image per session (previously three variants) to keep the
 * flash beat visually consistent. Rendered with client-side luminance
 * chroma-keying in FlashAngel so black pixels become truly transparent.
 *
 * If generation fails or is slow, `FlashAngel` falls back to its static PNG.
 */

const FLASH_PROMPT =
  "studio isolation shot photorealistic cinematic front view portrait of one ethereal angel woman perfectly isolated against absolute void, the background is SOLID RGB 0 0 0 PURE MATHEMATICAL BLACK with zero luminosity, zero color, zero gradient, zero haze, zero particles in the background, zero stars, zero atmosphere — the figure is the ONLY element visible. " +
  "her face calmly visible with EYES CLOSED peaceful serene expression, BOTH ARMS RAISED high above her head reaching upward in a transcendent gesture, " +
  "very long pure SNOW WHITE hair (NEVER blonde, NEVER yellow, NEVER gold) woven into intricate fibonacci spiral da Vinci fractal braids cascading down her back and flowing seamlessly into the dress so hair and dress read as one continuous translucent white ribbon, " +
  "wearing a long floor-length flowing translucent white dress of woven mist and light, somewhat see-through, rippling with dense swirling white particles, " +
  "ALWAYS TWO LARGE transparent translucent white wings of pure light and mist extending symmetrically from her back (BOTH LEFT and RIGHT wings fully visible and symmetrical, NEVER missing a wing, NEVER one-winged, wings made of translucent mist and light NEVER FEATHERED NOT bird feathers NOT plumage), " +
  "pale luminous skin catching soft rim light, dense swirling white particles ON HER BODY and WINGS and DRESS (never in the surrounding darkness), strong rim light from above outlining her edges against the void, dramatic chiaroscuro, photographic product-shot isolation, not illustration, not concept art";

let flashUrl: string | null = null;
let preparePromise: Promise<void> | null = null;
let currentJourneyId: string | null = null;
let abortController: AbortController | null = null;

/**
 * Kick off (or reuse) a generation pass for the Ghost flash angel images.
 * Idempotent: if already generating or already populated for this journey,
 * returns the existing promise. Safe to call multiple times.
 */
export function prepareGhostFlashImages(journeyId: string): Promise<void> {
  if (currentJourneyId !== journeyId) {
    abortController?.abort();
    currentJourneyId = journeyId;
    flashUrl = null;
    preparePromise = null;
  }
  if (preparePromise) return preparePromise;

  const controller = new AbortController();
  abortController = controller;

  preparePromise = (async () => {
    try {
      const res = await fetch("/api/ai-image/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        signal: controller.signal,
        body: JSON.stringify({
          prompt: FLASH_PROMPT,
          denoisingStrength: 0.5,
          width: 1024,
          height: 1024,
        }),
      });
      if (!res.ok) return;
      const data = await res.json();
      if (typeof data.image === "string") {
        flashUrl = data.image;
      }
    } catch {
      // Silent — FlashAngel will fall back to the static PNG. AbortError is expected on journey switch.
    }
  })();

  return preparePromise;
}

/** Get the flash image URL, or null if not ready. */
export function getGhostFlashUrl(): string | null {
  return flashUrl;
}

/** Clear cached flash image and abort any in-flight generation — called on journey stop. */
export function clearGhostFlashImages() {
  abortController?.abort();
  abortController = null;
  currentJourneyId = null;
  preparePromise = null;
  flashUrl = null;
}
