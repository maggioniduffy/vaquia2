import { describe, expect, it } from "vitest";
import { isPublicPath, safeNextPath } from "./routes";

describe("safeNextPath", () => {
  it.each([
    [null, "/"],
    ["", "/"],
    ["/records", "/records"],
    ["/field/sync?x=1", "/field/sync?x=1"],
    ["https://evil.example", "/"],
    ["//evil.example", "/"],
    ["/\\evil.example", "/"],
  ])("%s → %s", (input, expected) => {
    expect(safeNextPath(input)).toBe(expected);
  });
});

describe("isPublicPath", () => {
  it("allows login and auth routes only", () => {
    expect(isPublicPath("/login")).toBe(true);
    expect(isPublicPath("/auth/callback")).toBe(true);
    expect(isPublicPath("/dashboard")).toBe(false);
    expect(isPublicPath("/loginx")).toBe(false);
  });
});
