"use client";

import type { ReactNode } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { t } from "@/i18n/es-AR";
import { deleteCrew, saveCrew } from "@/lib/people/actions";
import type { CrewRow, Option, PersonaOption } from "@/lib/people/queries";
import { EditProvider, useEditHost } from "./edit-host";
import { controlClass, EntitySheet, Field } from "./entity-sheet";

/** Create (no `crew`) or edit a crew; delete is offered when editing (blocked server-side if it has personas). */
export function CrewSheet({
  crew,
  personas,
  locations,
  primary = false,
  open,
  onOpenChange,
}: {
  crew?: CrewRow;
  personas: PersonaOption[];
  locations: Option[];
  primary?: boolean;
  /** Controlled mode (shared edit host): no trigger is rendered. */
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
}) {
  const supervisors = personas.filter((p) => p.active || p.id === crew?.supervisor_persona_id);
  return (
    <EntitySheet
      open={open}
      onOpenChange={onOpenChange}
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
        open !== undefined ? undefined : primary ? (
          <Button variant="primary" className="h-10 md:h-8">
            {t.crews.new}
          </Button>
        ) : (
          <Button variant="ghost" size="sm" className="min-h-12 md:min-h-7">
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

/** One edit sheet for the whole list; wrap the rows and render `EditButton`s inside. */
export function CrewEditHost({
  crews,
  personas,
  locations,
  children,
}: {
  crews: CrewRow[];
  personas: PersonaOption[];
  locations: Option[];
  children: ReactNode;
}) {
  const host = useEditHost(crews);
  return (
    <EditProvider openEdit={host.openEdit}>
      {children}
      <CrewSheet
        key={host.item?.id}
        crew={host.item}
        personas={personas}
        locations={locations}
        open={host.open}
        onOpenChange={host.onOpenChange}
      />
    </EditProvider>
  );
}
