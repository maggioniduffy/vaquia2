import { beforeEach, describe, expect, it, vi } from "vitest";
import { t } from "@/i18n/es-AR";

const mocks = vi.hoisted(() => ({
  getSession: vi.fn(),
  withUser: vi.fn(),
  query: vi.fn(),
}));

vi.mock("@/lib/session", () => ({ getSession: mocks.getSession }));
vi.mock("@/lib/db", () => ({ withUser: mocks.withUser }));
// next/navigation.redirect throws in Next; here it throws a marker error we can match on.
vi.mock("next/navigation", () => ({
  redirect: (url: string) => {
    throw new Error(`NEXT_REDIRECT:${url}`);
  },
}));

import { createCompany, type OnboardingState } from "./actions";

const e = t.onboarding.errors;
const VALID_CUIT = "20-12345678-6";

function form(overrides: Record<string, string> = {}): FormData {
  const fd = new FormData();
  const values = {
    fullName: "Ana Pérez",
    dni: "12345678",
    companyName: "Mi Empresa SA",
    cuit: VALID_CUIT,
    ...overrides,
  };
  for (const [key, value] of Object.entries(values)) fd.set(key, value);
  return fd;
}

const PREV: OnboardingState = {};

// Simulates the Postgres error the create_company function raises (SQLSTATE + message).
function pgError(code: string, message: string) {
  return Object.assign(new Error(message), { code });
}

// Signed-in, non-guest user with no membership yet.
function signedIn() {
  return {
    userId: "user-1",
    email: "ana@example.com",
    isGuest: false,
    companies: [],
    active: null,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  mocks.query.mockReset().mockResolvedValue({ rows: [{ id: "company-1" }] });
  mocks.withUser.mockImplementation(async (_userId: string, fn: (db: unknown) => unknown) =>
    fn({ query: mocks.query }),
  );
  // Zero-membership, non-guest user: the only one allowed to create a company.
  mocks.getSession.mockResolvedValue(signedIn());
});

describe("createCompany: caller gate", () => {
  it("rejects a guest before touching the database", async () => {
    mocks.getSession.mockResolvedValue({ ...signedIn(), isGuest: true });
    const result = await createCompany(PREV, form());
    expect(result).toMatchObject({ error: e.notAllowed });
    expect(mocks.withUser).not.toHaveBeenCalled();
    expect(mocks.query).not.toHaveBeenCalled();
  });

  it("rejects a user who already has a company, before touching the database", async () => {
    mocks.getSession.mockResolvedValue({
      ...signedIn(),
      active: { companyId: "c", name: "X", role: "worker", isActive: true },
    });
    const result = await createCompany(PREV, form());
    expect(result).toMatchObject({ error: e.notAllowed });
    expect(mocks.withUser).not.toHaveBeenCalled();
  });

  it("keeps the submitted values when rejecting", async () => {
    mocks.getSession.mockResolvedValue({ ...signedIn(), isGuest: true });
    const result = await createCompany(PREV, form({ companyName: "Keep me" }));
    expect(result.values?.companyName).toBe("Keep me");
  });
});

describe("createCompany: client-side-equivalent validation (server authoritative)", () => {
  it("returns field errors and does not call the database for an invalid CUIT", async () => {
    const result = await createCompany(PREV, form({ cuit: "20-12345678-7" }));
    expect(result.fieldErrors).toEqual({ cuit: e.invalidCuit });
    expect(mocks.withUser).not.toHaveBeenCalled();
  });

  it("flags the persona step (name, DNI) before the company step", async () => {
    const result = await createCompany(PREV, form({ fullName: "A", dni: "123" }));
    expect(result.fieldErrors).toEqual({ fullName: e.invalidFullName, dni: e.invalidDni });
    expect(mocks.withUser).not.toHaveBeenCalled();
  });

  it("calls create_company with normalized values on success and redirects to the dashboard", async () => {
    await expect(
      createCompany(PREV, form({ cuit: "20-12345678-6", dni: "12.345.678" })),
    ).rejects.toThrow("NEXT_REDIRECT:/dashboard");
    expect(mocks.withUser).toHaveBeenCalledWith("user-1", expect.any(Function));
    expect(mocks.query).toHaveBeenCalledWith("select public.create_company($1, $2, $3, $4) as id", [
      "Mi Empresa SA",
      "20123456786",
      "Ana Pérez",
      "12345678",
    ]);
  });
});

describe("createCompany: database error mapping", () => {
  it("23505 (duplicate CUIT) shows the duplicate message without revealing an admin", async () => {
    mocks.query.mockRejectedValue(pgError("23505", "duplicate key value"));
    const result = await createCompany(PREV, form());
    expect(result).toEqual({ error: e.duplicate, values: expect.any(Object) });
    expect(e.duplicate).toContain("administrador");
  });

  it("42501 shows the not-allowed message", async () => {
    mocks.query.mockRejectedValue(pgError("42501", "user already belongs to a company"));
    const result = await createCompany(PREV, form());
    expect(result).toMatchObject({ error: e.notAllowed });
  });

  it.each([
    ["invalid_cuit", "cuit", t.onboarding.errors.invalidCuit],
    ["invalid_name", "companyName", t.onboarding.errors.invalidName],
    ["invalid_full_name", "fullName", t.onboarding.errors.invalidFullName],
    ["invalid_dni", "dni", t.onboarding.errors.invalidDni],
  ])("22023 with message %s puts the error on the %s field", async (message, field, text) => {
    mocks.query.mockRejectedValue(pgError("22023", message));
    const result = await createCompany(PREV, form());
    expect(result.fieldErrors).toEqual({ [field]: text });
    expect(result.error).toBeUndefined();
  });

  it("22023 with an unknown message falls back to the generic error", async () => {
    mocks.query.mockRejectedValue(pgError("22023", "something else"));
    const result = await createCompany(PREV, form());
    expect(result).toMatchObject({ error: e.generic });
    expect(result.fieldErrors).toBeUndefined();
  });

  it("any other database error shows the generic message and keeps the values", async () => {
    mocks.query.mockRejectedValue(pgError("23514", "check violation"));
    const result = await createCompany(PREV, form({ companyName: "Keep" }));
    expect(result).toMatchObject({ error: e.generic });
    expect(result.values?.companyName).toBe("Keep");
  });
});
