const PUBLIC_PATHS = ["/", "/login", "/manifest.webmanifest", "/icon.svg"];
const PUBLIC_PREFIXES = ["/api/auth/", "/pwa-icon/", "/apple-icon"];

export function isPublicPath(pathname: string): boolean {
  return PUBLIC_PATHS.includes(pathname) || PUBLIC_PREFIXES.some((p) => pathname.startsWith(p));
}

// Only same-origin relative paths are allowed as post-login destinations.
export function safeNextPath(next: string | null | undefined): string {
  if (!next || !next.startsWith("/")) return "/";
  // Control chars (tab/newline are stripped by browsers: "/\t/evil.com" becomes "//evil.com")
  // and backslashes are never legitimate here.
  if (/[\x00-\x1F\x7F\\]/.test(next)) return "/";
  try {
    const u = new URL(next, "http://local.invalid");
    if (u.origin !== "http://local.invalid" || u.pathname.startsWith("//")) return "/";
    return u.pathname + u.search + u.hash;
  } catch {
    return "/";
  }
}
