/** The live page's listening source from its URL (live-theatre-client.tsx reads the same ?livesrc=). */
export function liveSourceOf(search: string, inSet: boolean): "mic" | "laptop" | "both" | "set" {
  const q = new URLSearchParams(search);
  if (inSet || q.get("liveset")) return "set";
  const v = q.get("livesrc");
  return v === "laptop" || v === "both" ? v : "mic";
}
