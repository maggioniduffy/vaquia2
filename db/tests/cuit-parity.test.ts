import { describe, expect, it } from "vitest";
import { isValidCuit } from "@/lib/cuit";
import { withRollback } from "./helpers";

// The TS validator (src/lib/cuit.ts) and the SQL one (app.cuit_valid, used by the companies check
// constraint and create_company) must agree on every input. One round trip for the whole list.

const PREFIXES = ["20", "23", "24", "27", "30", "33", "34", "21", "00", "10", "99"];
const BODIES = [
  "00000000",
  "00000001",
  "00000006",
  "99999999",
  "12345678",
  // Deterministic pseudo-random bodies.
  ...Array.from({ length: 25 }, (_, i) =>
    String(((i * 7919 + 12345) * 104729) % 100_000_000).padStart(8, "0"),
  ),
];

function cuitCandidates(): string[] {
  const out: string[] = [];
  for (const prefix of PREFIXES) {
    for (const body of BODIES) {
      // All ten last digits: exactly one (or none, for check digit 10) is valid per body.
      for (let check = 0; check <= 9; check++) out.push(`${prefix}${body}${check}`);
    }
  }
  // Wrong lengths. Input is digits only: the TS side normalizes (strips non-digits) before
  // validating, while the SQL side expects the normalized form (see create_company).
  out.push("", "2012345678", "201234567866");
  return out;
}

describe("cuit validation parity (TS vs app.cuit_valid)", () => {
  it("agrees on every candidate", () =>
    withRollback(async (db) => {
      const candidates = cuitCandidates();
      const rows = await db.query<{ cuit: string; valid: boolean }>(
        "select c as cuit, app.cuit_valid(c) as valid from unnest($1::text[]) as c",
        [candidates],
      );
      expect(rows).toHaveLength(candidates.length);

      const mismatches = rows
        .filter((row) => isValidCuit(row.cuit) !== row.valid)
        .map((row) => `${row.cuit}: ts=${isValidCuit(row.cuit)} sql=${row.valid}`);
      expect(mismatches).toEqual([]);

      // Guard against a vacuous pass: both outcomes must actually be exercised.
      expect(rows.filter((row) => row.valid).length).toBeGreaterThan(100);
      expect(rows.filter((row) => !row.valid).length).toBeGreaterThan(100);
    }));
});
