/**
 * Angle branch-cut SEAM BLEND (kiosk film 2026-10-10: maelstrom drew a hard
 * straight line along the left half of the horizontal centre line).
 *
 * `atan(y, x)` jumps from +π to −π along the local negative x-axis. Any
 * angle use that is not 2π-periodic (noise/fbm/hash of the angle, sin/cos
 * at a non-integer angular frequency, the angle used linearly in a palette
 * or mix, fract(a * k) with non-integer k...) therefore shows a seam there.
 *
 * `withAngleSeamBlend(frag)` fixes the whole class without touching how a
 * shader looks anywhere else:
 *   - every two-argument `atan(y, x)` becomes `rsSeamAtan(y, x)`;
 *   - the shader's `main` runs once as written. Pixels in the 45° wedge
 *     just BELOW the cut (−π < a < −0.75π) record a weight
 *     w = smoothstep(0.75π, π, |a|) and run `main` a second time with the
 *     angle unwrapped to a + 2π (the value the pixel just ABOVE the cut
 *     sees), mixed by w. At the cut w = 1, so both sides meet at f(π);
 *     at −0.75π w = 0, so the wedge fades back to the original. Only
 *     calls inside their own wedge unwrap, so a second atan centre
 *     elsewhere in the frame is left as it was.
 *   - every pixel outside that wedge (w == 0) skips the second pass and
 *     outputs EXACTLY the original colour.
 *
 * Exact when every atan call shares one centre. With several centres the
 * weight is the max over calls, so each cut is still closed except where
 * one centre's wedge overlaps another's (verify such shaders by render). The
 * registry lint (angle-seam.test.ts) keeps every atan-using shader either
 * wrapped here or on its verified-periodic allowlist.
 */

export const ANGLE_SEAM_GLSL = `
int rsSeamPass;
float rsSeamW;
vec4 rsSeamOut;
float rsSeamAtan(float y, float x) {
  float a = atan(y, x);
  if (a < 0.0) rsSeamW = max(rsSeamW, smoothstep(2.35619449, 3.14159265, -a));
  return (rsSeamPass == 1 && a < -2.35619449) ? a + 6.28318531 : a;
}
`;

const SEAM_MAIN = `
void main() {
  rsSeamPass = 0;
  rsSeamW = 0.0;
  rsSeamMain();
  vec4 rsSeamC0 = rsSeamOut;
  float rsSeamWeight = rsSeamW;
  if (rsSeamWeight > 0.0) {
    rsSeamPass = 1;
    rsSeamMain();
    rsSeamC0 = mix(rsSeamC0, rsSeamOut, rsSeamWeight);
  }
  gl_FragColor = rsSeamC0;
}
`;

/** Index just past the `)` closing the paren opened at `open`, plus the
 *  number of top-level comma-separated arguments inside. */
function scanCall(src: string, open: number): { end: number; args: number } {
  let depth = 0;
  let args = 1;
  for (let i = open; i < src.length; i++) {
    const c = src[i];
    if (c === "(") depth++;
    else if (c === ")") {
      depth--;
      if (depth === 0) return { end: i + 1, args };
    } else if (c === "," && depth === 1) args++;
  }
  throw new Error("angle-seam: unbalanced parentheses after atan(");
}

/** Positions of every two-argument `atan(` call in `src`. */
export function twoArgAtanCalls(src: string): number[] {
  const out: number[] = [];
  const re = /\batan\s*\(/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(src))) {
    const open = m.index + m[0].length - 1;
    if (scanCall(src, open).args === 2) out.push(m.index);
  }
  return out;
}

export function withAngleSeamBlend(frag: string): string {
  if (frag.includes("rsSeamAtan")) return frag; // idempotent
  const calls = twoArgAtanCalls(frag);
  if (calls.length === 0) throw new Error("angle-seam: shader has no two-argument atan()");
  let s = frag;
  for (let k = calls.length - 1; k >= 0; k--) {
    const i = calls[k];
    s = s.slice(0, i) + "rsSeamAtan" + s.slice(i + 4);
  }
  const mainRe = /\bvoid\s+main\s*\(\s*(void)?\s*\)/g;
  const mains = s.match(mainRe);
  if (!mains || mains.length !== 1) throw new Error("angle-seam: expected exactly one main()");
  s = s.replace(mainRe, "void rsSeamMain()").replace(/\bgl_FragColor\b/g, "rsSeamOut");
  const prec = s.match(/precision\s+\w+\s+float\s*;/);
  if (!prec || prec.index === undefined) throw new Error("angle-seam: no float precision statement");
  const at = prec.index + prec[0].length;
  return s.slice(0, at) + ANGLE_SEAM_GLSL + s.slice(at) + SEAM_MAIN;
}
