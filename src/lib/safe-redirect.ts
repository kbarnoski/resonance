/**
 * Sanitize a `redirectTo` value coming from a URL query param.
 *
 * Login + signup pages accept ?redirectTo=... so users land on the
 * page they tried to reach pre-auth. Without sanitization this is an
 * open redirect: `?redirectTo=https://evil.example.com` would have
 * bounced the user off-site post-login.
 *
 * Returns a path that's guaranteed to be:
 *   - same-origin (starts with a single `/`, not `//` which is
 *     protocol-relative and would let an attacker swap the host)
 *   - not a reference to an absolute URL with a scheme
 *   - not empty
 *
 * Falls back to `fallback` for any input that fails the checks.
 */
export function safeInternalRedirect(
  raw: string | null | undefined,
  fallback: string,
): string {
  if (!raw) return fallback;
  // Must start with exactly one '/'.
  if (raw.length < 1 || raw[0] !== "/") return fallback;
  // Reject protocol-relative URLs ('//evil.com/x' or '/\evil.com').
  if (raw.length >= 2 && (raw[1] === "/" || raw[1] === "\\")) return fallback;
  // Reject anything that looks like a scheme (e.g. an attacker tries
  // 'https:/...' — already excluded by the leading-slash check, but
  // belt-and-suspenders for any decoded/concatenated weirdness).
  if (raw.includes("://")) return fallback;
  return raw;
}
