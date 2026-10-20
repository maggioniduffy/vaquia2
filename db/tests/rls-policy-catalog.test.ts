import { describe, expect, it } from "vitest";
import { withRollback } from "./helpers";

// RLS helpers are STABLE SECURITY DEFINER functions: Postgres calls them once per row unless they are
// wrapped in a scalar subquery `(select helper())`, which becomes a once-per-statement InitPlan.
// This guards every policy (present and future) against an unwrapped helper call.
describe("RLS policies", () => {
  it("never call current_company_id/has_role/current_user_is_guest/current_user_id unwrapped", () =>
    withRollback(async (db) => {
      const rows = await db.query<{ tablename: string; policyname: string; expr: string }>(
        `select tablename, policyname, coalesce(qual, '') || ' ' || coalesce(with_check, '') as expr
           from pg_policies where schemaname = 'public'`,
      );
      expect(rows.length).toBeGreaterThan(40);
      const unwrapped = rows.filter(({ expr }) => {
        const text = expr.replace(/\b(?:app|public)\./g, "").replace(/\s+/g, " ");
        return /(?<!SELECT )(?<!SELECT \(NOT )\b(?:current_company_id|has_role|current_user_is_guest|current_user_id)\(/i.test(
          text,
        );
      });
      expect(unwrapped.map((r) => `${r.tablename}.${r.policyname}`)).toEqual([]);
    }));
});
