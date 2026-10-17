"use server";

import { revalidatePath } from "next/cache";
import type { z } from "zod";
import { t } from "@/i18n/es-AR";
import { withUser } from "@/lib/db";
import { getSession } from "@/lib/session";
import type { ActionResult } from "./result";
import { crewSchema, idSchema, locationSchema, personaSchema } from "./schemas";

// Server actions for personas, crews and locations. RLS (hse/admin write) is the real gate; the
// role check here only gives a clean message before touching the database.

const WRITE_ROLES = ["hse", "admin"];

const noPermission: ActionResult = { ok: false, error: t.people.errors.noPermission };
const generic: ActionResult = { ok: false, error: t.people.errors.generic };

async function writerId(): Promise<string | null> {
  const session = await getSession();
  const role = session.active?.role;
  return role && WRITE_ROLES.includes(role) ? session.userId : null;
}

function text(formData: FormData, key: string): string | undefined {
  const value = formData.get(key);
  return typeof value === "string" && value !== "" ? value : undefined;
}

function invalid(error: z.ZodError): ActionResult {
  const fieldErrors: Record<string, string> = {};
  for (const issue of error.issues) {
    const key = String(issue.path[0] ?? "");
    if (key && !(key in fieldErrors)) fieldErrors[key] = issue.message;
  }
  return { ok: false, error: t.people.errors.invalid, fieldErrors };
}

type PgError = { code?: string };

function fromPgError(
  error: unknown,
  messages: { unique: string; reference: string; uniqueField?: string },
): ActionResult {
  const code = (error as PgError | null)?.code;
  if (code === "42501") return noPermission;
  if (code === "23505") {
    return {
      ok: false,
      error: messages.unique,
      fieldErrors: messages.uniqueField ? { [messages.uniqueField]: messages.unique } : undefined,
    };
  }
  if (code === "23503") return { ok: false, error: messages.reference };
  console.error("people action failed", error);
  return generic;
}

function revalidatePeople() {
  revalidatePath("/people", "layout");
}

export async function savePersona(formData: FormData): Promise<ActionResult> {
  const userId = await writerId();
  if (!userId) return noPermission;

  const parsed = personaSchema.safeParse({
    id: text(formData, "id"),
    fullName: formData.get("fullName") ?? "",
    dni: formData.get("dni") ?? "",
    crewId: formData.get("crewId"),
    active: formData.get("active") === "on",
  });
  if (!parsed.success) return invalid(parsed.error);
  const { id, fullName, dni, crewId, active } = parsed.data;

  try {
    const found = await withUser(userId, async (db) => {
      if (id) {
        const result = await db.query(
          "update public.personas set full_name = $2, dni = $3, crew_id = $4, active = $5 where id = $1",
          [id, fullName, dni, crewId, active],
        );
        return (result.rowCount ?? 0) > 0;
      }
      await db.query(
        `insert into public.personas (company_id, full_name, dni, crew_id, active)
         values (public.current_company_id(), $1, $2, $3, $4)`,
        [fullName, dni, crewId, active],
      );
      return true;
    });
    if (!found) return { ok: false, error: t.people.errors.notFound };
  } catch (error) {
    return fromPgError(error, {
      unique: t.people.errors.dniDuplicate,
      uniqueField: "dni",
      reference: t.people.errors.invalidReference,
    });
  }

  revalidatePeople();
  return { ok: true };
}

export async function saveCrew(formData: FormData): Promise<ActionResult> {
  const userId = await writerId();
  if (!userId) return noPermission;

  const parsed = crewSchema.safeParse({
    id: text(formData, "id"),
    name: formData.get("name") ?? "",
    supervisorPersonaId: formData.get("supervisorPersonaId"),
    locationId: formData.get("locationId"),
  });
  if (!parsed.success) return invalid(parsed.error);
  const { id, name, supervisorPersonaId, locationId } = parsed.data;

  try {
    const found = await withUser(userId, async (db) => {
      if (id) {
        const result = await db.query(
          "update public.crews set name = $2, supervisor_persona_id = $3, location_id = $4 where id = $1",
          [id, name, supervisorPersonaId, locationId],
        );
        return (result.rowCount ?? 0) > 0;
      }
      await db.query(
        `insert into public.crews (company_id, name, supervisor_persona_id, location_id)
         values (public.current_company_id(), $1, $2, $3)`,
        [name, supervisorPersonaId, locationId],
      );
      return true;
    });
    if (!found) return { ok: false, error: t.people.errors.notFound };
  } catch (error) {
    return fromPgError(error, {
      unique: t.crews.errors.duplicate,
      uniqueField: "name",
      reference: t.crews.errors.invalidReference,
    });
  }

  revalidatePeople();
  return { ok: true };
}

export async function deleteCrew(rawId: string): Promise<ActionResult> {
  const userId = await writerId();
  if (!userId) return noPermission;
  const id = idSchema.safeParse(rawId);
  if (!id.success) return { ok: false, error: t.people.errors.notFound };

  try {
    const result = await withUser(userId, async (db): Promise<ActionResult> => {
      const members = await db.query<{ n: number }>(
        "select count(*)::int as n from public.personas where crew_id = $1",
        [id.data],
      );
      if ((members.rows[0]?.n ?? 0) > 0) return { ok: false, error: t.crews.errors.hasMembers };
      const deleted = await db.query("delete from public.crews where id = $1", [id.data]);
      return (deleted.rowCount ?? 0) > 0
        ? { ok: true }
        : { ok: false, error: t.people.errors.notFound };
    });
    if (!result.ok) return result;
  } catch (error) {
    return fromPgError(error, {
      unique: t.people.errors.generic,
      reference: t.crews.errors.hasMembers,
    });
  }

  revalidatePeople();
  return { ok: true };
}

export async function saveLocation(formData: FormData): Promise<ActionResult> {
  const userId = await writerId();
  if (!userId) return noPermission;

  const parsed = locationSchema.safeParse({
    id: text(formData, "id"),
    name: formData.get("name") ?? "",
    field: formData.get("field"),
    operatorId: formData.get("operatorId"),
    lat: formData.get("lat"),
    lng: formData.get("lng"),
  });
  if (!parsed.success) return invalid(parsed.error);
  const { id, name, field, operatorId, lat, lng } = parsed.data;

  try {
    const found = await withUser(userId, async (db) => {
      if (id) {
        const result = await db.query(
          `update public.locations
             set name = $2, field = $3, operator_id = $4, lat = $5, lng = $6
           where id = $1`,
          [id, name, field, operatorId, lat, lng],
        );
        return (result.rowCount ?? 0) > 0;
      }
      await db.query(
        `insert into public.locations (company_id, name, field, operator_id, lat, lng)
         values (public.current_company_id(), $1, $2, $3, $4, $5)`,
        [name, field, operatorId, lat, lng],
      );
      return true;
    });
    if (!found) return { ok: false, error: t.people.errors.notFound };
  } catch (error) {
    return fromPgError(error, {
      unique: t.locations.errors.duplicate,
      uniqueField: "name",
      reference: t.locations.errors.invalidReference,
    });
  }

  revalidatePeople();
  return { ok: true };
}

export async function deleteLocation(rawId: string): Promise<ActionResult> {
  const userId = await writerId();
  if (!userId) return noPermission;
  const id = idSchema.safeParse(rawId);
  if (!id.success) return { ok: false, error: t.people.errors.notFound };

  try {
    const result = await withUser(userId, async (db): Promise<ActionResult> => {
      const crews = await db.query<{ n: number }>(
        "select count(*)::int as n from public.crews where location_id = $1",
        [id.data],
      );
      if ((crews.rows[0]?.n ?? 0) > 0) return { ok: false, error: t.locations.errors.inUse };
      const deleted = await db.query("delete from public.locations where id = $1", [id.data]);
      return (deleted.rowCount ?? 0) > 0
        ? { ok: true }
        : { ok: false, error: t.people.errors.notFound };
    });
    if (!result.ok) return result;
  } catch (error) {
    return fromPgError(error, {
      unique: t.people.errors.generic,
      reference: t.locations.errors.inUse,
    });
  }

  revalidatePeople();
  return { ok: true };
}
