"use client";

import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { t } from "@/i18n/es-AR";
import { savePersona } from "@/lib/people/actions";
import type { Option, PersonaRow } from "@/lib/people/queries";
import { controlClass, EntitySheet, Field } from "./entity-sheet";

/** Create (no `persona`) or edit a persona. Personas are never deleted, only deactivated. */
export function PersonaSheet({
  persona,
  crews,
  primary = false,
}: {
  persona?: PersonaRow;
  crews: Option[];
  primary?: boolean;
}) {
  const editing = Boolean(persona);
  return (
    <EntitySheet
      title={editing ? t.people.editTitle : t.people.newTitle}
      action={savePersona}
      successMessage={editing ? t.people.updated : t.people.created}
      trigger={
        primary ? (
          <Button variant="primary" className="h-10 md:h-8">
            {t.people.new}
          </Button>
        ) : (
          <Button variant="ghost" size="sm" className="min-h-12 md:min-h-7">
            {t.people.edit}
          </Button>
        )
      }
    >
      {(errors) => (
        <>
          {persona ? <input type="hidden" name="id" value={persona.id} /> : null}
          <Field name="fullName" label={t.people.fields.fullName} error={errors.fullName}>
            <Input
              id="fullName"
              name="fullName"
              defaultValue={persona?.full_name}
              required
              maxLength={200}
              autoComplete="off"
              aria-invalid={errors.fullName ? true : undefined}
              className={controlClass}
            />
          </Field>
          <Field
            name="dni"
            label={t.people.fields.dni}
            hint={t.people.fields.dniHint}
            error={errors.dni}
          >
            <Input
              id="dni"
              name="dni"
              defaultValue={persona?.dni}
              required
              inputMode="numeric"
              autoComplete="off"
              aria-invalid={errors.dni ? true : undefined}
              className={`${controlClass} font-mono tabular-nums`}
            />
          </Field>
          <Field name="crewId" label={t.people.fields.crew} error={errors.crewId}>
            <Select
              id="crewId"
              name="crewId"
              defaultValue={persona?.crew_id ?? ""}
              className={controlClass}
            >
              <option value="">{t.people.fields.noCrew}</option>
              {crews.map((crew) => (
                <option key={crew.id} value={crew.id}>
                  {crew.name}
                </option>
              ))}
            </Select>
          </Field>
          <div className="flex flex-col gap-1">
            <Checkbox
              name="active"
              defaultChecked={persona?.active ?? true}
              label={t.people.fields.active}
              className="size-4"
            />
            <p className="text-muted text-xs">{t.people.fields.activeHint}</p>
          </div>
        </>
      )}
    </EntitySheet>
  );
}
