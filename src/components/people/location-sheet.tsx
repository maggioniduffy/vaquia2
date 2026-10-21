"use client";

import type { ReactNode } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { t } from "@/i18n/es-AR";
import { deleteLocation, saveLocation } from "@/lib/people/actions";
import type { LocationRow, Option } from "@/lib/people/queries";
import { EditProvider, useEditHost } from "./edit-host";
import { controlClass, EntitySheet, Field } from "./entity-sheet";
import { LocationPicker } from "./location-picker";

/** Create (no `location`) or edit a location; delete is offered when editing (blocked if crews use it). */
export function LocationSheet({
  location,
  operators,
  primary = false,
  open,
  onOpenChange,
}: {
  location?: LocationRow;
  operators: Option[];
  primary?: boolean;
  /** Controlled mode (shared edit host): no trigger is rendered. */
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
}) {
  return (
    <EntitySheet
      open={open}
      onOpenChange={onOpenChange}
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
        open !== undefined ? undefined : primary ? (
          <Button variant="primary" className="h-10 md:h-8">
            {t.locations.new}
          </Button>
        ) : (
          <Button variant="ghost" size="sm" className="min-h-12 md:min-h-7">
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
          <LocationPicker
            initialLat={location?.lat ?? null}
            initialLng={location?.lng ?? null}
            latError={errors.lat}
            lngError={errors.lng}
          />
        </>
      )}
    </EntitySheet>
  );
}

/** One edit sheet for the whole list; wrap the rows and render `EditButton`s inside. */
export function LocationEditHost({
  locations,
  operators,
  children,
}: {
  locations: LocationRow[];
  operators: Option[];
  children: ReactNode;
}) {
  const host = useEditHost(locations);
  return (
    <EditProvider openEdit={host.openEdit}>
      {children}
      <LocationSheet
        key={host.item?.id}
        location={host.item}
        operators={operators}
        open={host.open}
        onOpenChange={host.onOpenChange}
      />
    </EditProvider>
  );
}
