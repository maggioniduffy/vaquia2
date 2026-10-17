// Sign-in and code-sending run in-process from the login server actions (with DB-backed rate
// limits). Exposing them over HTTP would bypass those limits, so POST is an allowlist.
const ALLOWED_POST = new Set(["/sign-out"]);

export function isBlockedAuthPath(pathname: string): boolean {
  const path =
    pathname
      .replace(/\/{2,}/g, "/")
      .replace(/^\/api\/auth/i, "")
      .replace(/\/+$/, "") || "/";
  return !ALLOWED_POST.has(path.toLowerCase());
}
