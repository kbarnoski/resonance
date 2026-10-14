// Builds the self-contained page init script for the offline export:
// the runtime modules concatenated (imports dropped, `export` stripped)
// inside one IIFE, then installExportRuntime(window, cfg).
import { readFileSync } from "node:fs";

export const RUNTIME_FILES = ["analyser-math.mjs", "virtual-clock.mjs", "virtual-media.mjs", "page-runtime.mjs"];

/** Drop single-line imports, strip `export` from top-level declarations. */
export function stripModule(src) {
  return src
    .split("\n")
    .filter((l) => !/^import\s/.test(l))
    .map((l) => l.replace(/^export\s+(?=(async\s+)?function\b|const\b|let\b|class\b)/, ""))
    .join("\n");
}

export function runtimeSource() {
  return RUNTIME_FILES.map((f) => {
    const src = readFileSync(new URL(f, import.meta.url), "utf8");
    if (/^export\s+(default|\{|\*)/m.test(src)) throw new Error(`${f}: only 'export function/const' declarations can be inlined`);
    return `// ---- ${f}\n${stripModule(src)}`;
  }).join("\n");
}

/**
 * The init script. Installs only in the top-level browsing context
 * (iframes keep real clocks) and only when the page URL carries
 * export=1 — a stray reuse of the script can't hijack a normal page.
 */
export function buildInitScript(cfg) {
  return `(() => {
"use strict";
if (typeof window === "undefined" || window.top !== window) return;
try { if (new URLSearchParams(location.search).get("export") !== "1") return; } catch { return; }
${runtimeSource()}
installExportRuntime(window, ${JSON.stringify(cfg ?? {})});
})();
`;
}
