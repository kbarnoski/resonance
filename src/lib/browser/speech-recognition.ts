/**
 * Browser-only Web Speech API shim.
 *
 * Both `SpeechRecognition` and the older `webkitSpeechRecognition`
 * (Safari/older Chrome) are exposed on the window object. The TS DOM
 * lib types this poorly across browsers, so we declare the bits we
 * actually use and provide a single `getSpeechRecognition()` accessor
 * that returns the constructor (or null on Node / unsupported
 * browsers like Firefox).
 *
 * This used to live inline at the top of visualizer-client.tsx; it
 * was lifted out as part of the post-audit decomposition pass.
 */

export interface SpeechRecognitionEvent extends Event {
  results: SpeechRecognitionResultList;
  resultIndex: number;
}

/** Constructor signature of the runtime SpeechRecognition class. */
export type SpeechRecognitionType = new () => {
  continuous: boolean;
  interimResults: boolean;
  lang: string;
  start(): void;
  stop(): void;
  onresult: ((event: SpeechRecognitionEvent) => void) | null;
  onerror: ((event: Event) => void) | null;
  onend: (() => void) | null;
};

/** Returns the SpeechRecognition class if available, else null.
 *  Safe to call during SSR — returns null when window is undefined. */
export function getSpeechRecognition(): SpeechRecognitionType | null {
  if (typeof window === "undefined") return null;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const w = window as any;
  return w.SpeechRecognition || w.webkitSpeechRecognition || null;
}
