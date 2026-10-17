"use client";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { t } from "@/i18n/es-AR";
import { deleteCrew, saveCrew } from "@/lib/people/actions";
import type { CrewRow, Option, PersonaOption } from "@/lib/people/queries";
import { controlClass, EntitySheet, Field } from "./entity-sheet";

/** Create (no `crew`) or edit a crew; delete is offered when editing (blocked server-side if it has personas). */
export function CrewSheet({
  crew,
  personas,
  locations,
  primary = false,
}: {
  crew?: CrewRow;
  personas: PersonaOption[];
  locations: Option[];
  primary?: boolean;
}) {
  const supervisors = personas.filter((p) => p.active || p.id === crew?.supervisor_persona_id);
  return (
    <EntitySheet
      title={crew ? t.crews.editTitle : t.crews.newTitle}
      action={saveCrew}
      successMessage={crew ? t.crews.updated : t.crews.created}
      remove={
        crew
          ? {
              action: () => deleteCrew(crew.id),
              label: t.crews.delete,
              confirmLabel: t.crews.confirmDelete,
              question: t.crews.deleteQuestion,
              successMessage: t.crews.deleted,
            }
          : undefined
      }
      trigger={
        primary ? (
          <Button variant="primary" size="touch" className="md:h-9 md:text-sm">
            {t.crews.new}
          </Button>
        ) : (
          <Button variant="ghost" className="min-h-12 md:min-h-9">
            {t.crews.edit}
          </Button>
        )
      }
    >
      {(errors) => (
        <>
          {crew ? <input type="hidden" name="id" value={crew.id} /> : null}
          <Field name="name" label={t.crews.fields.name} error={errors.name}>
            <Input
              id="name"
              name="name"
              defaultValue={crew?.name}
              required
              maxLength={120}
              autoComplete="off"
              aria-invalid={errors.name ? true : undefined}
              className={controlClass}
            />
          </Field>
          <Field name="supervisorPersonaId" label={t.crews.fields.supervisor}>
            <Select
              id="supervisorPersonaId"
              name="supervisorPersonaId"
              defaultValue={crew?.supervisor_persona_id ?? ""}
              className={controlClass}
            >
              <option value="">{t.crews.fields.noSupervisor}</option>
              {supervisors.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
            </Select>
          </Field>
          <Field name="locationId" label={t.crews.fields.location}>
            <Select
              id="locationId"
              name="locationId"
              defaultValue={crew?.location_id ?? ""}
              className={controlClass}
            >
              <option value="">{t.crews.fields.noLocation}</option>
              {locations.map((l) => (
                <option key={l.id} value={l.id}>
                  {l.name}
                </option>
              ))}
            </Select>
          </Field>
        </>
      )}
    </EntitySheet>
  );
}
