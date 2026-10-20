import { describe, expect, it } from "vitest";
import { BACKOFF_BASE_MS, BACKOFF_CAP_MS, backoffDelayMs } from "./backoff";

// Phase 2.4 — retry schedule: 5 s doubling, 15 min cap, "equal jitter" (half fixed, half random).

const low = () => 0;
const high = () => 1;

describe("backoffDelayMs", () => {
  it("doubles from 5 s", () => {
    expect(backoffDelayMs(1, low)).toBe(2_500);
    expect(backoffDelayMs(2, low)).toBe(5_000);
    expect(backoffDelayMs(3, low)).toBe(10_000);
    expect(backoffDelayMs(4, low)).toBe(20_000);
    for (const attempts of [1, 2, 3, 4, 5]) {
      const exp = BACKOFF_BASE_MS * 2 ** (attempts - 1);
      expect(backoffDelayMs(attempts, low)).toBe(exp / 2);
      expect(backoffDelayMs(attempts, high)).toBe(exp);
    }
  });

  it("caps the exponential part at 15 minutes", () => {
    expect(backoffDelayMs(9, low)).toBe(BACKOFF_CAP_MS / 2);
    expect(backoffDelayMs(9, high)).toBe(15 * 60_000);
    expect(backoffDelayMs(30, low)).toBe(BACKOFF_CAP_MS / 2);
    expect(backoffDelayMs(30, high)).toBe(BACKOFF_CAP_MS);
  });

  it("adds equal jitter: half fixed + half random", () => {
    expect(backoffDelayMs(1, () => 0.5)).toBe(3_750);
    expect(backoffDelayMs(3, () => 0.5)).toBe(15_000);
    const value = backoffDelayMs(4, () => 0.25);
    expect(value).toBeGreaterThanOrEqual(20_000);
    expect(value).toBeLessThanOrEqual(40_000);
  });

  it("treats attempts below 1 as the first attempt", () => {
    expect(backoffDelayMs(0, low)).toBe(2_500);
    expect(backoffDelayMs(-3, low)).toBe(2_500);
  });
});
