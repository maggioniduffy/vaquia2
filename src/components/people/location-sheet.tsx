"use client";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { t } from "@/i18n/es-AR";
import { deleteLocation, saveLocation } from "@/lib/people/actions";
import type { LocationRow, Option } from "@/lib/people/queries";
import { controlClass, EntitySheet, Field } from "./entity-sheet";

/** Create (no `location`) or edit a location; delete is offered when editing (blocked if crews use it). */
export function LocationSheet({
  location,
  operators,
  primary = false,
}: {
  location?: LocationRow;
  operators: Option[];
  primary?: boolean;
}) {
  return (
    <EntitySheet
      title={location ? t.locations.editTitle : t.locations.newTitle}
      action={saveLocation}
      successMessage={location ? t.locations.updated : t.locations.created}
      remove={
        location
          ? {
              action: () => deleteLocation(location.id),
              label: t.locations.delete,
              confirmLabel: t.locations.confirmDelete,
              question: t.locations.deleteQuestion,
              successMessage: t.locations.deleted,
            }
          : undefined
      }
      trigger={
        primary ? (
          <Button variant="primary" size="touch" className="md:h-9 md:text-sm">
            {t.locations.new}
          </Button>
        ) : (
          <Button variant="ghost" className="min-h-12 md:min-h-9">
            {t.locations.edit}
          </Button>
        )
      }
    >
      {(errors) => (
        <>
          {location ? <input type="hidden" name="id" value={location.id} /> : null}
          <Field name="name" label={t.locations.fields.name} error={errors.name}>
            <Input
              id="name"
              name="name"
              defaultValue={location?.name}
              required
              maxLength={120}
              autoComplete="off"
              aria-invalid={errors.name ? true : undefined}
              className={controlClass}
            />
          </Field>
          <Field name="field" label={t.locations.fields.field} error={errors.field}>
            <Input
              id="field"
              name="field"
              defaultValue={location?.field ?? ""}
              maxLength={120}
              autoComplete="off"
              aria-invalid={errors.field ? true : undefined}
              className={controlClass}
            />
          </Field>
          <Field name="operatorId" label={t.locations.fields.operator}>
            <Select
              id="operatorId"
              name="operatorId"
              defaultValue={location?.operator_id ?? ""}
              className={controlClass}
            >
              <option value="">{t.locations.fields.noOperator}</option>
              {operators.map((o) => (
                <option key={o.id} value={o.id}>
                  {o.name}
                </option>
              ))}
            </Select>
          </Field>
          <Field
            name="lat"
            label={t.locations.fields.lat}
            hint={t.locations.fields.coordsHint}
            error={errors.lat}
          >
            <Input
              id="lat"
              name="lat"
              defaultValue={location?.lat ?? ""}
              inputMode="decimal"
              autoComplete="off"
              aria-invalid={errors.lat ? true : undefined}
              className={`${controlClass} font-mono tabular-nums`}
            />
          </Field>
          <Field name="lng" label={t.locations.fields.lng} error={errors.lng}>
            <Input
              id="lng"
              name="lng"
              defaultValue={location?.lng ?? ""}
              inputMode="decimal"
              autoComplete="off"
              aria-invalid={errors.lng ? true : undefined}
              className={`${controlClass} font-mono tabular-nums`}
            />
          </Field>
        </>
      )}
    </EntitySheet>
  );
}
