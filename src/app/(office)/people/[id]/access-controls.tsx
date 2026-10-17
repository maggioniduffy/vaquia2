"use client";

import { useState, useTransition, type FormEvent } from "react";
import { Button } from "@/components/ui/button";
import { Input, Label } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { Sheet, SheetContent, SheetTrigger } from "@/components/ui/sheet";
import { useToast } from "@/components/ui/toast";
import { t } from "@/i18n/es-AR";
import {
  changeRole,
  grantAccess,
  removeAccess,
  revokeInvitation,
  type AccessResult,
} from "./access-actions";

const a = t.access;
const ROLES = ["worker", "supervisor", "hse", "manager", "admin"] as const;

function RoleSelect({
  id,
  value,
  onChange,
  disabled,
}: {
  id: string;
  value: string;
  onChange: (v: string) => void;
  disabled: boolean;
}) {
  return (
    <Select id={id} value={value} onChange={(e) => onChange(e.target.value)} disabled={disabled}>
      {ROLES.map((r) => (
        <option key={r} value={r}>
          {t.roles[r]}
        </option>
      ))}
    </Select>
  );
}

function ErrorBox({ message }: { message: string | null }) {
  if (!message) return null;
  return (
    <p role="alert" className="border-l-danger border-border border-l-2 py-1 pl-3 text-sm">
      {message}
    </p>
  );
}

/** Runs a server action with shared pending/error/toast handling. */
function useAccessAction(onDone: () => void) {
  const toast = useToast();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});

  function run(
    action: (data: FormData) => Promise<AccessResult>,
    data: FormData,
    success: (r: Extract<AccessResult, { ok: true }>) => [string, "success" | "warning"],
  ) {
    setError(null);
    setFieldErrors({});
    startTransition(async () => {
      let result: AccessResult;
      try {
        result = await action(data);
      } catch {
        result = { ok: false, error: a.errors.generic };
      }
      if (result.ok) {
        const [message, tone] = success(result);
        toast(message, tone);
        onDone();
      } else {
        setError(result.error);
        setFieldErrors(result.fieldErrors ?? {});
      }
    });
  }
  return { run, pending, error, fieldErrors };
}

export function GrantAccessSheet({ personaId }: { personaId: string }) {
  const [open, setOpen] = useState(false);
  return (
    <Sheet open={open} onOpenChange={setOpen}>
      <SheetTrigger asChild>
        <Button variant="secondary">{a.grant}</Button>
      </SheetTrigger>
      <SheetContent title={a.grantTitle} description={a.grantDescription}>
        <GrantForm personaId={personaId} onDone={() => setOpen(false)} />
      </SheetContent>
    </Sheet>
  );
}

function GrantForm({ personaId, onDone }: { personaId: string; onDone: () => void }) {
  const { run, pending, error, fieldErrors } = useAccessAction(onDone);
  const [email, setEmail] = useState("");
  const [role, setRole] = useState("supervisor");

  function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const data = new FormData();
    data.set("personaId", personaId);
    data.set("email", email);
    data.set("role", role);
    run(grantAccess, data, (r) =>
      r.emailSent === false ? [a.grantedNoEmail, "warning"] : [a.granted, "success"],
    );
  }

  return (
    <form onSubmit={onSubmit} className="flex flex-col gap-4" noValidate>
      <div className="flex flex-col gap-1">
        <Label htmlFor="access-email">{a.emailLabel}</Label>
        <Input
          id="access-email"
          type="email"
          autoComplete="off"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          disabled={pending}
          aria-invalid={Boolean(fieldErrors.email)}
          required
        />
        {fieldErrors.email ? <p className="text-danger text-xs">{fieldErrors.email}</p> : null}
      </div>
      <div className="flex flex-col gap-1">
        <Label htmlFor="access-role">{a.roleLabel}</Label>
        <RoleSelect id="access-role" value={role} onChange={setRole} disabled={pending} />
      </div>
      <ErrorBox message={fieldErrors.email ? null : error} />
      <Button type="submit" variant="primary" disabled={pending || !email.trim()}>
        {pending ? a.saving : a.submit}
      </Button>
    </form>
  );
}

export function ChangeRoleSheet({
  personaId,
  currentRole,
}: {
  personaId: string;
  currentRole: string;
}) {
  const [open, setOpen] = useState(false);
  return (
    <Sheet open={open} onOpenChange={setOpen}>
      <SheetTrigger asChild>
        <Button variant="secondary">{a.changeRole}</Button>
      </SheetTrigger>
      <SheetContent title={a.changeRoleTitle}>
        <ChangeRoleForm
          personaId={personaId}
          currentRole={currentRole}
          onDone={() => setOpen(false)}
        />
      </SheetContent>
    </Sheet>
  );
}

function ChangeRoleForm({
  personaId,
  currentRole,
  onDone,
}: {
  personaId: string;
  currentRole: string;
  onDone: () => void;
}) {
  const { run, pending, error } = useAccessAction(onDone);
  const [role, setRole] = useState(currentRole);

  function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const data = new FormData();
    data.set("personaId", personaId);
    data.set("role", role);
    run(changeRole, data, () => [a.roleChanged, "success"]);
  }

  return (
    <form onSubmit={onSubmit} className="flex flex-col gap-4">
      <div className="flex flex-col gap-1">
        <Label htmlFor="change-role">{a.roleLabel}</Label>
        <RoleSelect id="change-role" value={role} onChange={setRole} disabled={pending} />
      </div>
      <ErrorBox message={error} />
      <Button type="submit" variant="primary" disabled={pending || role === currentRole}>
        {pending ? a.saving : a.save}
      </Button>
    </form>
  );
}

export function RemoveAccessSheet({
  personaId,
  personaName,
}: {
  personaId: string;
  personaName: string;
}) {
  const [open, setOpen] = useState(false);
  return (
    <Sheet open={open} onOpenChange={setOpen}>
      <SheetTrigger asChild>
        <Button variant="danger">{a.remove}</Button>
      </SheetTrigger>
      <SheetContent title={a.removeTitle} description={a.removeConfirm(personaName)}>
        <RemoveForm personaId={personaId} onDone={() => setOpen(false)} />
      </SheetContent>
    </Sheet>
  );
}

function RemoveForm({ personaId, onDone }: { personaId: string; onDone: () => void }) {
  const { run, pending, error } = useAccessAction(onDone);

  function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const data = new FormData();
    data.set("personaId", personaId);
    run(removeAccess, data, () => [a.removed, "success"]);
  }

  return (
    <form onSubmit={onSubmit} className="flex flex-col gap-4">
      <ErrorBox message={error} />
      <Button type="submit" variant="danger" disabled={pending}>
        {pending ? a.saving : a.removeSubmit}
      </Button>
    </form>
  );
}

export function RevokeInvitationButton({ personaId }: { personaId: string }) {
  const { run, pending, error } = useAccessAction(() => {});

  function onClick() {
    const data = new FormData();
    data.set("personaId", personaId);
    run(revokeInvitation, data, () => [a.revoked, "success"]);
  }

  return (
    <div className="flex flex-col items-end gap-2">
      <Button type="button" variant="secondary" onClick={onClick} disabled={pending}>
        {a.revoke}
      </Button>
      <ErrorBox message={error} />
    </div>
  );
}
