import { describe, expect, it } from "vitest";
import { accountLinking, isUnverifiedSocialSignUp, parseLoginError } from "./auth-options";

describe("accountLinking", () => {
  it("is enabled and trusts no provider unconditionally", () => {
    expect(accountLinking.enabled).toBe(true);
    expect(accountLinking).not.toHaveProperty("trustedProviders");
  });
});

describe("isUnverifiedSocialSignUp", () => {
  it("rejects unverified users created from an OAuth callback", () => {
    expect(isUnverifiedSocialSignUp({ emailVerified: false }, { path: "/callback/:id" })).toBe(
      true,
    );
    expect(isUnverifiedSocialSignUp({}, { path: "/callback/google" })).toBe(true);
  });
  it("allows verified social users and non-OAuth sign-ups", () => {
    expect(isUnverifiedSocialSignUp({ emailVerified: true }, { path: "/callback/:id" })).toBe(
      false,
    );
    expect(isUnverifiedSocialSignUp({ emailVerified: false }, { path: "/sign-in/anonymous" })).toBe(
      false,
    );
    expect(isUnverifiedSocialSignUp({ emailVerified: false }, null)).toBe(false);
  });
});

describe("parseLoginError", () => {
  it("accepts only known values", () => {
    expect(parseLoginError("google")).toBe("google");
    expect(parseLoginError("<script>")).toBeNull();
    expect(parseLoginError(undefined)).toBeNull();
  });
});
