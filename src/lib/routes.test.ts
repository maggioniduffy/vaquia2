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
    ["/\t/evil.com", "/"],
    ["/\n/evil.com", "/"],
    ["/%09/evil.com", "/%09/evil.com"],
    ["\\evil", "/"],
    ["/\\evil", "/"],
    ["http://evil", "/"],
    ["//evil", "/"],
    ["/a/b?x=1&y=2#h", "/a/b?x=1&y=2#h"],
  ])("%s → %s", (input, expected) => {
    expect(safeNextPath(input)).toBe(expected);
  });
});

describe("isPublicPath", () => {
  it("allows login and auth routes only", () => {
    expect(isPublicPath("/login")).toBe(true);
    expect(isPublicPath("/api/auth/sign-in/email")).toBe(true);
    expect(isPublicPath("/auth/callback")).toBe(false);
    expect(isPublicPath("/dashboard")).toBe(false);
    expect(isPublicPath("/loginx")).toBe(false);
  });
});

describe("isPublicPath: sign-up and onboarding", () => {
  it("keeps /signup public so new users can request a code", () => {
    expect(isPublicPath("/signup")).toBe(true);
  });

  it("does not make /onboarding public (signed-in users with no company only)", () => {
    expect(isPublicPath("/onboarding")).toBe(false);
    expect(isPublicPath("/onboarding/step")).toBe(false);
  });

  it("does not match look-alike paths of the public ones", () => {
    expect(isPublicPath("/signupx")).toBe(false);
    expect(isPublicPath("/signup/extra")).toBe(false);
  });
});
