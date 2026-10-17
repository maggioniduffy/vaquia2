import { describe, expect, it } from "vitest";
import { isBlockedAuthPath } from "./blocked";

describe("isBlockedAuthPath", () => {
  it.each([
    "/api/auth/email-otp/send-verification-otp",
    "/api/auth/sign-in/email-otp",
    "/api/auth/sign-in/anonymous",
    "/api/auth/sign-in/anonymous/",
    "/api/auth//sign-in/anonymous",
    "/api/auth/Sign-In/Email-OTP",
    "/api/auth/email-otp/reset-password",
    "/api/auth/some-future-plugin-endpoint",
  ])("blocks POST %s", (p) => expect(isBlockedAuthPath(p)).toBe(true));

  it.each(["/api/auth/sign-out", "/api/auth/sign-out/"])("allows POST %s", (p) =>
    expect(isBlockedAuthPath(p)).toBe(false),
  );
});
