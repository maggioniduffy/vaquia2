export type CapturedGeo = { lat: number; lng: number; accuracy: number };

/** Best-effort position. Resolves null when denied, unavailable or timed out; never throws. */
export function captureGeo(timeoutMs = 8000): Promise<CapturedGeo | null> {
  if (typeof navigator === "undefined" || !navigator.geolocation) return Promise.resolve(null);
  return new Promise((resolve) => {
    const timer = setTimeout(() => resolve(null), timeoutMs + 500);
    const done = (value: CapturedGeo | null) => {
      clearTimeout(timer);
      resolve(value);
    };
    try {
      navigator.geolocation.getCurrentPosition(
        (p) =>
          done({
            lat: p.coords.latitude,
            lng: p.coords.longitude,
            accuracy: Math.max(0, p.coords.accuracy),
          }),
        () => done(null),
        { enableHighAccuracy: true, timeout: timeoutMs, maximumAge: 60_000 },
      );
    } catch {
      done(null);
    }
  });
}
