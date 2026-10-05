// Read a Tramokyo pack JSON file and write it back in the SAME layout it
// was found in (compact / 2-space / 2-space + trailing newline), so
// entries a tool does not touch stay byte-identical.
import { readFileSync, writeFileSync } from "node:fs";

export function readPackJson(path) {
  const text = readFileSync(path, "utf8");
  const data = JSON.parse(text);
  let layout = "indent2";
  if (JSON.stringify(data) === text) layout = "compact";
  else if (JSON.stringify(data, null, 2) + "\n" === text) layout = "indent2nl";
  else if (JSON.stringify(data, null, 2) !== text) layout = "indent2"; // unknown — normalise to 2-space
  const serialize = (d) => (layout === "compact" ? JSON.stringify(d) : JSON.stringify(d, null, 2) + (layout === "indent2nl" ? "\n" : ""));
  return { data, layout, text, write: (d = data) => writeFileSync(path, serialize(d)) };
}
