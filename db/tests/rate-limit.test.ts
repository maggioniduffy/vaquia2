import { describe, expect, it } from "vitest";
import { HIT_SQL } from "../../src/lib/rate-limit-sql";
import { withRollback } from "./helpers";

describe("rate limit SQL", () => {
  it("counts hits per key within a window, so the (limit+1)th is over the limit", () =>
    withRollback(async (db) => {
      const limit = 3;
      const hits: number[] = [];
      for (let i = 0; i < limit + 1; i++) {
        hits.push((await db.one<{ hits: number }>(HIT_SQL, ["k:test", 600])).hits);
      }
      expect(hits).toEqual([1, 2, 3, 4]);
      expect(hits[limit - 1]! <= limit).toBe(true);
      expect(hits[limit]! <= limit).toBe(false);
      // Other keys are independent.
      expect((await db.one<{ hits: number }>(HIT_SQL, ["k:other", 600])).hits).toBe(1);
      const retry = (await db.one<{ retry_after: number }>(HIT_SQL, ["k:test", 600])).retry_after;
      expect(retry).toBeGreaterThan(0);
      expect(retry).toBeLessThanOrEqual(600);
    }));
});
