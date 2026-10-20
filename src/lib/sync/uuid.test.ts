import { describe, expect, it } from "vitest";
import { isUuidV7, uuidv7 } from "./uuid";

// Phase 2.4 — client ids are UUIDv7: 48-bit ms timestamp, version 7, variant 10, 74 random bits.

const zeros = (length: number) => new Uint8Array(length);

function timestampOf(id: string): number {
  return parseInt(id.replace(/-/g, "").slice(0, 12), 16);
}

describe("uuidv7", () => {
  it("emits a version-7 uuid with the RFC variant", () => {
    const id = uuidv7(0, zeros);
    expect(id).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-7[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);
    expect(isUuidV7(id)).toBe(true);
  });

  it("encodes the millisecond timestamp in the first 48 bits", () => {
    const now = 1_700_000_000_123;
    expect(timestampOf(uuidv7(now, zeros))).toBe(now);
    expect(timestampOf(uuidv7(1, zeros))).toBe(1);
  });

  it("clamps a negative clock instead of wrapping", () => {
    expect(timestampOf(uuidv7(-1, zeros))).toBe(0);
  });

  it("fills the random tail without touching version or variant", () => {
    const random = (length: number) => new Uint8Array(length).fill(0xff);
    const id = uuidv7(42, random);
    expect(id).toMatch(/-7fff-[89ab]fff-[0-9a-f]{12}$/);
    expect(id.endsWith("f".repeat(12))).toBe(true);
  });

  it("does not repeat itself", () => {
    const seen = new Set(Array.from({ length: 50 }, () => uuidv7()));
    expect(seen.size).toBe(50);
  });
});

describe("isUuidV7", () => {
  it("rejects other versions and malformed values", () => {
    expect(isUuidV7("11111111-1111-4111-8111-111111111111")).toBe(false); // v4
    expect(isUuidV7("11111111-1111-1111-8111-111111111111")).toBe(false); // v1
    expect(isUuidV7("dddd0000-0000-7000-c000-000000000001")).toBe(false); // bad variant
    expect(isUuidV7("not-a-uuid")).toBe(false);
    expect(isUuidV7("")).toBe(false);
  });
});
