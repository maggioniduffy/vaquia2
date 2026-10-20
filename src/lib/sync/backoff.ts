// Retry schedule: 5 s, 10 s, 20 s ... capped at 15 min, with "equal jitter" (half fixed, half random)
// so a fleet of devices coming back online does not hit the server in lockstep.

export const BACKOFF_BASE_MS = 5_000;
export const BACKOFF_CAP_MS = 15 * 60_000;

/** `attempts` = how many attempts have failed so far (>= 1). `random` returns [0, 1). */
export function backoffDelayMs(attempts: number, random: () => number = Math.random): number {
  const exp = Math.min(BACKOFF_CAP_MS, BACKOFF_BASE_MS * 2 ** Math.max(0, attempts - 1));
  return Math.round(exp / 2 + random() * (exp / 2));
}
