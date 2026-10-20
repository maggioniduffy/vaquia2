"use client";

import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { FieldError, Input, Label, Textarea } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { cn } from "@/lib/cn";
import { t } from "@/i18n/es-AR";
import { AttendeesPicker } from "./attendees";
import { StepsHazardsControls } from "./steps-hazards";
import { isVisible, visibilityView, type Payload } from "../compile";
import type { Field, GroupField, OptionItem } from "../dsl";
import type { FormErrors, FormReferences } from "./types";

type FieldProps<F extends Field = Field> = {
  field: F;
  value: unknown;
  onChange: (value: unknown) => void;
  references: FormReferences;
  errors: FormErrors;
  path: string;
  readOnly: boolean;
  /** Record root + enclosing items, used for nested `visibleIf`. */
  scope: Payload;
};

const touch = "h-12 text-base";

function optionLabel(options: OptionItem[], key: unknown): string {
  return options.find((o) => o.key === key)?.label ?? String(key);
}

function referenceOptions(field: Field, refs: FormReferences): OptionItem[] {
  switch (field.type) {
    case "persona":
      return refs.personas ?? [];
    case "crew":
      return refs.crews ?? [];
    case "location":
      return refs.locations ?? [];
    case "task_type":
      return refs.taskTypes ?? [];
    case "select":
    case "multiselect":
      return field.options;
    default:
      return [];
  }
}

function readOnlyText(field: Field, value: unknown, refs: FormReferences): string {
  if (value === undefined || value === null || value === "") return t.forms.none;
  switch (field.type) {
    case "yesno":
      return value === "yes" ? t.forms.yes : value === "no" ? t.forms.no : t.forms.na;
    case "select":
    case "crew":
    case "location":
    case "task_type":
      return optionLabel(referenceOptions(field, refs), value);
    case "multiselect":
    case "persona":
      return Array.isArray(value)
        ? value.map((v) => optionLabel(referenceOptions(field, refs), v)).join(", ")
        : optionLabel(referenceOptions(field, refs), value);
    case "number":
      return field.unit ? `${value} ${field.unit}` : String(value);
    case "photos":
      return t.forms.photosPending((value as unknown[]).length);
    case "geo": {
      const g = value as { lat: number; lng: number; accuracy: number };
      return t.forms.geoValue(
        g.lat.toFixed(5),
        g.lng.toFixed(5),
        Math.round(g.accuracy).toString(),
      );
    }
    case "signature":
      return t.forms.signaturePending;
    default:
      return String(value);
  }
}

function ChoiceList({
  options,
  selected,
  multiple,
  onChange,
  name,
}: {
  options: OptionItem[];
  selected: string[];
  multiple: boolean;
  onChange: (next: string[]) => void;
  name: string;
}) {
  return (
    <div className="flex flex-col" role="group" aria-label={name}>
      {options.map((o) => {
        const on = selected.includes(o.key);
        return (
          <div key={o.key} className="flex min-h-12 items-center">
            <Checkbox
              label={o.label}
              checked={on}
              onChange={(e) =>
                onChange(
                  multiple
                    ? e.target.checked
                      ? [...selected, o.key]
                      : selected.filter((k) => k !== o.key)
                    : e.target.checked
                      ? [o.key]
                      : [],
                )
              }
            />
          </div>
        );
      })}
    </div>
  );
}

function Control(props: FieldProps) {
  const { field, value, onChange, references, errors, path, readOnly, scope } = props;
  const invalid = Boolean(errors[path]);
  const common = { id: path, "aria-invalid": invalid || undefined, disabled: readOnly };

  switch (field.type) {
    case "text":
      return (
        <Input
          {...common}
          className={touch}
          maxLength={field.maxLength}
          value={(value as string) ?? ""}
          onChange={(e) => onChange(e.target.value)}
        />
      );
    case "textarea":
      return (
        <Textarea
          {...common}
          maxLength={field.maxLength}
          value={(value as string) ?? ""}
          onChange={(e) => onChange(e.target.value)}
        />
      );
    case "number":
      return (
        <div className="flex items-center gap-2">
          <Input
            {...common}
            className={cn(touch, "font-mono")}
            type="number"
            inputMode="decimal"
            min={field.min}
            max={field.max}
            step={field.step ?? "any"}
            value={(value as number | undefined) ?? ""}
            onChange={(e) => onChange(e.target.value === "" ? undefined : Number(e.target.value))}
          />
          {field.unit && <span className="text-muted text-sm">{field.unit}</span>}
        </div>
      );
    case "date":
    case "time":
      return (
        <Input
          {...common}
          className={cn(touch, "font-mono")}
          type={field.type}
          value={(value as string) ?? ""}
          onChange={(e) => onChange(e.target.value || undefined)}
        />
      );
    case "select":
    case "crew":
    case "location":
    case "task_type":
      return (
        <Select
          {...common}
          className={touch}
          value={(value as string) ?? ""}
          onChange={(e) => onChange(e.target.value || undefined)}
        >
          <option value="">{t.forms.select}</option>
          {referenceOptions(field, references).map((o) => (
            <option key={o.key} value={o.key}>
              {o.label}
            </option>
          ))}
        </Select>
      );
    case "persona":
      if (!field.multiple)
        return (
          <Select
            {...common}
            className={touch}
            value={(value as string) ?? ""}
            onChange={(e) => onChange(e.target.value || undefined)}
          >
            <option value="">{t.forms.select}</option>
            {(references.personas ?? []).map((o) => (
              <option key={o.key} value={o.key}>
                {o.label}
              </option>
            ))}
          </Select>
        );
      if (field.widget === "attendees")
        return (
          <AttendeesPicker
            id={path}
            label={field.label}
            value={(value as string[]) ?? []}
            onChange={onChange}
            references={references}
            readOnly={readOnly}
          />
        );
      return (
        <ChoiceList
          name={field.label}
          options={references.personas ?? []}
          selected={(value as string[]) ?? []}
          multiple
          onChange={(n) => onChange(n)}
        />
      );
    case "multiselect":
      return (
        <ChoiceList
          name={field.label}
          options={field.options}
          selected={(value as string[]) ?? []}
          multiple
          onChange={(n) => onChange(n)}
        />
      );
    case "yesno": {
      const choices = field.allowNA ? (["yes", "no", "na"] as const) : (["yes", "no"] as const);
      return (
        <div className="flex gap-2" role="radiogroup" aria-label={field.label}>
          {choices.map((c) => (
            <Button
              key={c}
              type="button"
              role="radio"
              aria-checked={value === c}
              disabled={readOnly}
              className={cn(
                "h-12 flex-1 text-base",
                value === c && "border-accent bg-accent-subtle",
              )}
              onClick={() => onChange(c)}
            >
              {c === "yes" ? t.forms.yes : c === "no" ? t.forms.no : t.forms.na}
            </Button>
          ))}
        </div>
      );
    }
    case "checklist":
    case "ppe": {
      const items = field.type === "checklist" ? field.items : (references.ppeItems ?? []);
      const current = (value as Record<string, boolean>) ?? {};
      if (field.type === "ppe" && items.length === 0) {
        // No PPE catalogue is cached for the task type: never invent items.
        const done = value !== undefined && value !== null;
        const marked = Object.keys(current).filter((k) => current[k]);
        if (readOnly)
          return <p className="text-base">{marked.length ? marked.join(", ") : t.forms.none}</p>;
        return (
          <div className="flex flex-col gap-2" id={path}>
            <p className="text-muted text-sm">{t.forms.ppe.noItems}</p>
            <Button
              type="button"
              role="checkbox"
              aria-checked={done}
              className={cn("h-12 text-base", done && "border-accent bg-accent-subtle")}
              onClick={() => onChange(done ? undefined : {})}
            >
              {t.forms.ppe.noneRequired}
            </Button>
          </div>
        );
      }
      return (
        <div className="flex flex-col">
          {items.map((o) => (
            <div key={o.key} className="flex min-h-12 items-center">
              <Checkbox
                label={o.label}
                disabled={readOnly}
                checked={Boolean(current[o.key])}
                onChange={(e) => onChange({ ...current, [o.key]: e.target.checked })}
              />
            </div>
          ))}
        </div>
      );
    }
    case "signature":
      return (
        <div className="border-border text-muted flex h-[140px] items-center justify-center rounded-[var(--radius-control)] border border-dashed text-xs">
          {t.forms.signaturePending}
        </div>
      );
    case "photos":
      return (
        <p className="text-muted text-sm">
          {t.forms.photosPending(((value as unknown[]) ?? []).length)}
        </p>
      );
    case "geo":
      return (
        <p className="text-muted font-mono text-sm">
          {value ? readOnlyText(field, value, references) : t.forms.geoPending}
        </p>
      );
    case "group":
      return <GroupControl {...(props as FieldProps<GroupField>)} scope={scope} />;
  }
}

function GroupControl({
  field,
  value,
  onChange,
  references,
  errors,
  path,
  readOnly,
  scope,
}: FieldProps<GroupField>) {
  if (field.widget === "steps_hazards_controls" && field.repeatable)
    return (
      <StepsHazardsControls
        id={path}
        field={field}
        value={(value as Payload[]) ?? []}
        onChange={onChange}
        errors={errors}
        path={path}
        readOnly={readOnly}
      />
    );
  if (!field.repeatable) {
    const obj = (value as Payload) ?? {};
    return (
      <GroupBody
        fields={field.fields}
        value={obj}
        onChange={onChange}
        references={references}
        errors={errors}
        path={path}
        readOnly={readOnly}
        scope={scope}
      />
    );
  }
  const items = (value as Payload[]) ?? [];
  const canAdd = !readOnly && (field.max == null || items.length < field.max);
  return (
    <div className="flex flex-col gap-3">
      {items.map((item, i) => (
        <div
          key={i}
          className="border-border flex flex-col gap-3 rounded-[var(--radius-panel)] border p-3"
        >
          <div className="flex items-center justify-between">
            <span className="text-muted text-xs">{t.forms.item(i + 1)}</span>
            {!readOnly && (
              <Button
                type="button"
                variant="ghost"
                className="h-12"
                onClick={() => onChange(items.filter((_, j) => j !== i))}
              >
                {t.forms.remove}
              </Button>
            )}
          </div>
          <GroupBody
            fields={field.fields}
            value={item}
            onChange={(next) => onChange(items.map((o, j) => (j === i ? next : o)))}
            references={references}
            errors={errors}
            path={`${path}.${i}`}
            readOnly={readOnly}
            scope={scope}
          />
        </div>
      ))}
      {canAdd && (
        <Button type="button" className="h-12" onClick={() => onChange([...items, {}])}>
          {t.forms.add}
        </Button>
      )}
    </div>
  );
}

function GroupBody({
  fields,
  value,
  onChange,
  references,
  errors,
  path,
  readOnly,
  scope,
}: {
  fields: Field[];
  value: Payload;
  onChange: (next: Payload) => void;
  references: FormReferences;
  errors: FormErrors;
  path: string;
  readOnly: boolean;
  scope: Payload;
}) {
  return (
    <FieldList
      fields={fields}
      value={value}
      onChange={onChange}
      references={references}
      errors={errors}
      pathPrefix={path}
      readOnly={readOnly}
      scope={{ ...scope, ...value }}
    />
  );
}

export function FieldList({
  fields,
  value,
  onChange,
  references,
  errors,
  pathPrefix,
  readOnly,
  scope,
}: {
  fields: Field[];
  value: Payload;
  onChange: (next: Payload) => void;
  references: FormReferences;
  errors: FormErrors;
  pathPrefix: string;
  readOnly: boolean;
  scope: Payload;
}) {
  return (
    <div className="flex flex-col gap-4">
      {fields
        .filter((f) => isVisible(f, visibilityView(fields, value, scope)))
        .map((f) => (
          <FieldRow
            key={f.key}
            field={f}
            value={value[f.key]}
            onChange={(v) => onChange({ ...value, [f.key]: v })}
            references={references}
            errors={errors}
            path={pathPrefix ? `${pathPrefix}.${f.key}` : f.key}
            readOnly={readOnly}
            scope={{ ...scope, ...value }}
          />
        ))}
    </div>
  );
}

export function FieldRow(props: FieldProps) {
  const { field, value, references, errors, path, readOnly } = props;
  const error = errors[path];
  return (
    <div className="flex flex-col gap-1.5">
      <Label
        htmlFor={path}
        className={field.type === "group" ? "text-text text-sm font-medium" : "text-sm"}
      >
        {field.label}
        {field.required && !readOnly && <span className="text-muted"> *</span>}
      </Label>
      {readOnly && field.type !== "group" && field.type !== "checklist" && field.type !== "ppe" ? (
        <p className="min-h-6 text-base">{readOnlyText(field, value, references)}</p>
      ) : (
        <Control {...props} />
      )}
      {field.help && <p className="text-muted text-xs">{field.help}</p>}
      {error && <FieldError>{error}</FieldError>}
    </div>
  );
}
