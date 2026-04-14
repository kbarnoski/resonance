import { createAnthropic } from "@ai-sdk/anthropic";

export const anthropic = createAnthropic({
  apiKey: process.env.ANTHROPIC_API_KEY,
});

export const defaultModel = anthropic("claude-sonnet-4-5-20250929");

/** Fast vision model for low-latency image validation (Ghost reject gate, etc.) */
export const fastVisionModel = anthropic("claude-haiku-4-5-20251001");
