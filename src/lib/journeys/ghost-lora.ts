/**
 * Ghost-angel character LoRA URL.
 *
 * Trained via scripts/train-ghost-lora.mjs (~$8 one-time). The training
 * script overwrites this file on success — re-run it (e.g. on a curated
 * image set) to retrain and update the URL in place.
 *
 * When non-null, the AI image generator routes Ghost-journey frames
 * through fal-ai/flux-lora with this LoRA attached, giving every frame
 * the character's consistent identity (white spiral fibonacci hair,
 * translucent mist dress, wispy wings, eyes closed, face obscured)
 * without per-call PuLID reference cost. When null, Ghost generation
 * falls back to plain flux/dev with the descriptor prompt.
 */
export const GHOST_LORA_URL: string | null = "https://v3b.fal.media/files/b/0a99ac7a/yzeS5s13BwrPr675RBZrh_pytorch_lora_weights.safetensors";
export const GHOST_LORA_TRAINED_AT = "2026-05-10T17:13:52.039Z";
