import { fail, type SyncDb, type SyncResult } from "./result";

export type Access = { isGuest: boolean };

/**
 * Gate shared by both endpoints (spec/data-model.md#Sync endpoints): the item's company must be
 * the caller's active company (`wrong_company`; a company the caller is not a member of at all is
 * `forbidden`), the role must be supervisor/hse/admin and the company writable (expired trial →
 * `read_only`; no DB row protects blob writes, so it is checked explicitly).
 */
export async function checkAccess(db: SyncDb, companyId: string): Promise<Access | SyncResult> {
  const { rows } = await db.query<{
    current: string | null;
    member: boolean;
    can_write: boolean;
    writable: boolean;
    is_guest: boolean;
  }>(
    `select public.current_company_id() as current,
            exists (select 1 from public.my_companies() c where c.company_id = $1::uuid) as member,
            public.has_role(array['supervisor', 'hse', 'admin']::public.member_role[]) as can_write,
            public.company_writable($1::uuid) as writable,
            public.current_user_is_guest() as is_guest`,
    [companyId],
  );
  const row = rows[0]!;
  if (row.current !== companyId) return fail(row.member ? "wrong_company" : "forbidden");
  if (!row.can_write) return fail("forbidden");
  if (!row.writable) return fail("read_only");
  return { isGuest: row.is_guest };
}

export const isDenied = (value: Access | SyncResult): value is SyncResult => "status" in value;
