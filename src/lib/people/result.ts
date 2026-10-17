/** Result of a people/crews/locations server action. `error` is already user-facing copy. */
export type ActionResult =
  { ok: true } | { ok: false; error: string; fieldErrors?: Record<string, string> };
