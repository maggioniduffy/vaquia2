import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

const withUser = vi.hoisted(() => vi.fn());
vi.mock("@/lib/db", () => ({ withUser }));

import { getTrialInfo, isReadOnlyError } from "./trial";

const DAY_MS = 86_400_000;

// The company row the trial query returns: plan + remaining milliseconds (bigint as string).
function companyRow(plan: string, msLeft: number | null) {
  return { plan, ms_left: msLeft === null ? null : String(msLeft) };
}

function givenRow(row: ReturnType<typeof companyRow> | undefined) {
  withUser.mockImplementation(async (_userId: string, fn: (db: unknown) => Promise<unknown>) =>
    fn({ query: async () => ({ rows: row ? [row] : [] }) }),
  );
}

beforeEach(() => {
  withUser.mockReset();
});

describe("getTrialInfo: days left and expiry", () => {
  it.each([
    ["30 days left", 30 * DAY_MS, 30, false],
    ["29.5 days left rounds up", 29.5 * DAY_MS, 30, false],
    ["exactly 1 day left", DAY_MS, 1, false],
    ["1 millisecond left still counts as a day", 1, 1, false],
    ["just expired", 0, 0, true],
    ["expired a day ago", -DAY_MS, 0, true],
  ])("%s → daysLeft %i, expired %s", async (_label, msLeft, daysLeft, expired) => {
    givenRow(companyRow("trial", msLeft));
    expect(await getTrialInfo("user-1")).toEqual({ daysLeft, expired });
  });

  it("looks up the trial of the given user through withUser", async () => {
    givenRow(companyRow("trial", 10 * DAY_MS));
    await getTrialInfo("user-42");
    expect(withUser).toHaveBeenCalledWith("user-42", expect.any(Function));
  });

  it.each([
    ["paid", "paid"],
    ["demo", "demo"],
  ])("is null for plan %s (never shows a trial)", async (_label, plan) => {
    givenRow(companyRow(plan, -DAY_MS));
    expect(await getTrialInfo("user-1")).toBeNull();
  });

  it("is null when the trial has no end date", async () => {
    givenRow(companyRow("trial", null));
    expect(await getTrialInfo("user-1")).toBeNull();
  });

  it("is null when the user has no active company", async () => {
    givenRow(undefined);
    expect(await getTrialInfo("user-1")).toBeNull();
  });
});

describe("isReadOnlyError", () => {
  it("is true for the VQ001 read-only SQLSTATE raised by the trigger", () => {
    expect(isReadOnlyError({ code: "VQ001", message: "read only" })).toBe(true);
  });

  it.each([
    ["unique violation 23505", { code: "23505" }],
    ["insufficient privilege 42501", { code: "42501" }],
    ["invalid parameter 22023", { code: "22023" }],
    ["plain Error without code", new Error("VQ001")],
    ["object without code", { message: "VQ001" }],
    ["a string", "VQ001"],
    ["null", null],
    ["undefined", undefined],
  ])("is false for %s", (_label, error) => {
    expect(isReadOnlyError(error)).toBe(false);
  });
});
