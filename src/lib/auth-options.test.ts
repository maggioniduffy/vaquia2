import { describe, expect, it } from "vitest";
import { accountLinking } from "./auth-options";

describe("accountLinking", () => {
  it("is enabled and trusts no provider unconditionally", () => {
    expect(accountLinking.enabled).toBe(true);
    expect(accountLinking).not.toHaveProperty("trustedProviders");
  });
});
