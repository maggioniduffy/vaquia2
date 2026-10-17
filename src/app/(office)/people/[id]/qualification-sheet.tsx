"use client";

import { useState, useTransition, type FormEvent } from "react";
import { Button } from "@/components/ui/button";
import { Input, Label } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { RefreshIcon } from "@/components/ui/icons";
import { Sheet, SheetContent, SheetTrigger } from "@/components/ui/sheet";
import { useToast } from "@/components/ui/toast";
import { t } from "@/i18n/es-AR";
import { formatDateAr } from "@/lib/dates";
import { addMonthsIso } from "@/lib/people/qualification-dates";
import { MAX_FILE_BYTES } from "@/lib/storage/keys";
import { addQualification, type AddQualificationResult } from "./actions";

export type TypeOption = { id: string; name: string; default_validity_months: number | null };

type Props = {
  personaId: string;
  types: TypeOption[];
  storageAvailable: boolean;
  /** Today in ART (YYYY-MM-DD), computed on the server. */
  today: string;
  /** Renewal: type is fixed. Omit for "add". */
  renewType?: { id: string; name: string };
  variant?: "primary" | "secondary" | "link" | "icon";
};

const q = t.qualifications;

export function QualificationSheet({
  personaId,
  types,
  storageAvailable,
  today,
  renewType,
  variant = "secondary",
}: Props) {
  const [open, setOpen] = useState(false);
  return (
    <Sheet open={open} onOpenChange={setOpen}>
      <SheetTrigger asChild>
        {variant === "icon" ? (
          <button
            type="button"
            aria-label={renewType ? `${q.renew}: ${renewType.name}` : q.add}
            title={renewType ? `${q.renew}: ${renewType.name}` : q.add}
            className="text-muted hover:text-text inline-flex size-6 items-center justify-center"
          >
            <RefreshIcon size={14} />
          </button>
        ) : variant === "link" ? (
          <button
            type="button"
            aria-label={renewType ? `${q.renew}: ${renewType.name}` : q.add}
            className="text-accent-strong hover:text-accent-hover shrink-0 text-xs font-medium"
          >
            {renewType ? q.renew : t.people.panel.add}
          </button>
        ) : (
          <Button variant={variant}>{renewType ? q.renew : q.add}</Button>
        )}
      </SheetTrigger>
      <SheetContent
        title={renewType ? q.renewTitle(renewType.name) : q.addTitle}
        description={renewType ? q.form.renewNote : undefined}
      >
        <QualificationForm
          personaId={personaId}
          types={types}
          storageAvailable={storageAvailable}
          today={today}
          renewType={renewType}
          onDone={() => setOpen(false)}
        />
      </SheetContent>
    </Sheet>
  );
}

type FormProps = Omit<Props, "variant"> & { onDone: () => void };

function QualificationForm({
  personaId,
  types,
  storageAvailable,
  today,
  renewType,
  onDone,
}: FormProps) {
  const toast = useToast();
  const [pending, startTransition] = useTransition();
  const [typeId, setTypeId] = useState(renewType?.id ?? "");
  const [issuedOn, setIssuedOn] = useState(today);
  const [expiresOn, setExpiresOn] = useState("");
  const [expiresTouched, setExpiresTouched] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<
    Extract<AddQualificationResult, { ok: false }>["fieldErrors"]
  >({});

  const months = types.find((x) => x.id === typeId)?.default_validity_months ?? null;
  const computed = months && issuedOn ? addMonthsIso(issuedOn, months) : null;
  const expiresValue = expiresTouched ? expiresOn : (computed ?? "");

  let expiresHint: string = q.form.expiresOptional;
  if (!expiresTouched && computed && months) {
    expiresHint = q.form.expiresComputed(formatDateAr(computed), months);
  } else if (months && !expiresValue) {
    expiresHint = q.form.expiresEmptyWithDefault;
  }

  function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    data.set("personaId", personaId);
    data.set("typeId", typeId);
    data.set("expiresOn", expiresValue);
    const picked = data.get("file");
    if (picked instanceof File && picked.size > MAX_FILE_BYTES) {
      setError(q.errors.fileTooLarge);
      setFieldErrors({ file: q.errors.fileTooLarge });
      return;
    }
    setError(null);
    setFieldErrors({});
    startTransition(async () => {
      let result: AddQualificationResult;
      try {
        result = await addQualification(data);
      } catch {
        result = { ok: false, error: q.errors.generic };
      }
      if (result.ok) {
        toast(q.form.saved, "success");
        onDone();
      } else {
        setError(result.error);
        setFieldErrors(result.fieldErrors ?? {});
      }
    });
  }

  return (
    <form onSubmit={onSubmit} className="flex flex-col gap-4" noValidate>
      <div className="flex flex-col gap-1">
        <Label htmlFor="q-type">{q.form.type}</Label>
        <Select
          id="q-type"
          value={typeId}
          onChange={(e) => setTypeId(e.target.value)}
          disabled={Boolean(renewType) || pending}
          aria-invalid={Boolean(fieldErrors?.typeId)}
          required
        >
          <option value="" disabled>
            {q.form.typePlaceholder}
          </option>
          {types.map((x) => (
            <option key={x.id} value={x.id}>
              {x.name}
            </option>
          ))}
        </Select>
        {fieldErrors?.typeId ? <FieldError>{fieldErrors.typeId}</FieldError> : null}
      </div>

      <div className="flex flex-col gap-1">
        <Label htmlFor="q-issued">{q.form.issued}</Label>
        <Input
          id="q-issued"
          name="issuedOn"
          type="date"
          value={issuedOn}
          onChange={(e) => setIssuedOn(e.target.value)}
          disabled={pending}
          aria-invalid={Boolean(fieldErrors?.issuedOn)}
          required
        />
        {fieldErrors?.issuedOn ? <FieldError>{fieldErrors.issuedOn}</FieldError> : null}
      </div>

      <div className="flex flex-col gap-1">
        <Label htmlFor="q-expires">{q.form.expires}</Label>
        <Input
          id="q-expires"
          type="date"
          value={expiresValue}
          min={issuedOn || undefined}
          onChange={(e) => {
            setExpiresTouched(true);
            setExpiresOn(e.target.value);
          }}
          disabled={pending}
          aria-invalid={Boolean(fieldErrors?.expiresOn)}
        />
        {fieldErrors?.expiresOn ? (
          <FieldError>{fieldErrors.expiresOn}</FieldError>
        ) : (
          <p className="text-muted text-xs" data-testid="expires-hint">
            {expiresHint}
          </p>
        )}
      </div>

      {storageAvailable ? (
        <div className="flex flex-col gap-1">
          <Label htmlFor="q-file">{q.form.file}</Label>
          <Input
            id="q-file"
            name="file"
            type="file"
            accept="application/pdf,image/jpeg,image/png,.pdf,.jpg,.jpeg,.png"
            disabled={pending}
            aria-invalid={Boolean(fieldErrors?.file)}
            className="h-auto py-1.5"
          />
          {fieldErrors?.file ? <FieldError>{fieldErrors.file}</FieldError> : null}
        </div>
      ) : (
        <p className="text-muted text-xs">{t.storage.unavailable}</p>
      )}

      {error ? (
        <p role="alert" className="border-l-danger border-border border-l-2 py-1 pl-3 text-sm">
          {error}
        </p>
      ) : null}

      <Button type="submit" variant="primary" disabled={pending || !typeId || !issuedOn}>
        {pending ? q.form.saving : q.form.submit}
      </Button>
    </form>
  );
}

function FieldError({ children }: { children: string }) {
  return <p className="text-danger text-xs">{children}</p>;
}
