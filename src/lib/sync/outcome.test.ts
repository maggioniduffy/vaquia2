import { describe, expect, it } from "vitest";
import { TERMINAL_CODES, classifyResponse } from "./outcome";

// Phase 2.4 — device-side reading of `200 {ok}` / `{error}` responses. Terminal codes are kept on
// the device; 401, 429, 5xx and network failures retry with backoff.

describe("classifyResponse: ok", () => {
  it("200 with ok:true is ok (and reports a conflict copy)", () => {
    expect(classifyResponse(200, { ok: true })).toEqual({ kind: "ok", conflict: false });
    expect(classifyResponse(200, { ok: true, conflict: true })).toEqual({
      kind: "ok",
      conflict: true,
    });
    expect(classifyResponse(201, { ok: true })).toEqual({ kind: "ok", conflict: false });
  });

  it("a 2xx without ok:true is not accepted", () => {
    expect(classifyResponse(204, null)).toEqual({ kind: "retry", code: "server_error" });
  });
});

describe("classifyResponse: terminal", () => {
  it.each([
    [403, "read_only"],
    [403, "forbidden"],
    [409, "wrong_company"],
    [409, "id_conflict"],
    [422, "invalid"],
    [422, "blob_rejected"],
    [409, "blob_conflict"],
  ] as const)("%i %s is terminal", (status, error) => {
    expect(classifyResponse(status, { error })).toEqual({ kind: "terminal", code: error });
  });

  it("covers exactly the terminal codes the runner keeps", () => {
    expect([...TERMINAL_CODES].sort()).toEqual(
      [
        "read_only",
        "forbidden",
        "wrong_company",
        "id_conflict",
        "invalid",
        "blob_rejected",
        "blob_conflict",
      ].sort(),
    );
  });
});

describe("classifyResponse: retry", () => {
  it("401 is unauthorized", () => {
    expect(classifyResponse(401, null)).toEqual({ kind: "retry", code: "unauthorized" });
  });

  it("429 is rate_limited and honours Retry-After seconds", () => {
    expect(classifyResponse(429, null, "120")).toEqual({
      kind: "retry",
      code: "rate_limited",
      retryAfterMs: 120_000,
    });
    expect(classifyResponse(429, null, "0")).toEqual({
      kind: "retry",
      code: "rate_limited",
      retryAfterMs: undefined,
    });
    expect(classifyResponse(429, null)).toEqual({
      kind: "retry",
      code: "rate_limited",
      retryAfterMs: undefined,
    });
  });

  it("5xx is a server error", () => {
    for (const status of [500, 502, 503]) {
      expect(classifyResponse(status, { error: "boom" })).toEqual({
        kind: "retry",
        code: "server_error",
      });
    }
  });

  it("409 blob_missing retries (the blob has not landed yet)", () => {
    expect(classifyResponse(409, { error: "blob_missing" })).toEqual({
      kind: "retry",
      code: "blob_missing",
    });
  });

  it("an unknown error body retries", () => {
    expect(classifyResponse(400, { error: "teapot" })).toEqual({
      kind: "retry",
      code: "server_error",
    });
  });
});
