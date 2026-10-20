"use client";

import { Button } from "@/components/ui/button";
import { FieldError, Input, Label, Textarea } from "@/components/ui/input";
import { t } from "@/i18n/es-AR";
import type { Payload } from "../compile";
import type { Field, GroupField } from "../dsl";
import type { FormErrors } from "./types";

type Hazard = { hazard?: string; controls?: string };
type Step = { step?: string; hazards?: Hazard[] };

const child = (fields: Field[], key: string) => fields.find((f) => f.key === key);
const textMax = (f: Field | undefined) =>
  f && (f.type === "text" || f.type === "textarea") ? f.maxLength : undefined;

/**
 * Steps → hazards → controls (`widget: "steps_hazards_controls"`, ATS). Value: `[{ step, hazards: [{ hazard, controls }] }]`.
 * Each step is a card with nested hazard cards; every input is full width with 48px touch targets.
 */
export function StepsHazardsControls({
  id,
  field,
  value,
  onChange,
  errors,
  path,
  readOnly,
}: {
  id: string;
  field: GroupField;
  value: Payload[];
  onChange: (next: Payload[]) => void;
  errors: FormErrors;
  path: string;
  readOnly: boolean;
}) {
  const steps = value as Step[];
  const stepField = child(field.fields, "step");
  const hazardsField = child(field.fields, "hazards") as GroupField | undefined;
  const hazardField = hazardsField ? child(hazardsField.fields, "hazard") : undefined;
  const controlsField = hazardsField ? child(hazardsField.fields, "controls") : undefined;

  const setStep = (i: number, patch: Step) =>
    onChange(steps.map((s, j) => (j === i ? { ...s, ...patch } : s)) as Payload[]);
  const setHazard = (i: number, h: number, patch: Hazard) =>
    setStep(i, {
      hazards: (steps[i]?.hazards ?? []).map((x, k) => (k === h ? { ...x, ...patch } : x)),
    });

  if (readOnly)
    return (
      <ol id={id} className="flex flex-col gap-3">
        {steps.length === 0 && <li className="text-base">{t.forms.none}</li>}
        {steps.map((s, i) => (
          <li key={i} className="border-border flex flex-col gap-2 rounded-[var(--radius-panel)] border p-3">
            <span className="text-base font-medium">
              {t.forms.ats.stepN(i + 1)}: {s.step || t.forms.none}
            </span>
            {(s.hazards ?? []).map((h, k) => (
              <div key={k} className="border-border flex flex-col gap-0.5 border-l-2 pl-3">
                <span className="text-base">{h.hazard || t.forms.none}</span>
                <span className="text-muted text-sm whitespace-pre-wrap">{h.controls || t.forms.none}</span>
              </div>
            ))}
          </li>
        ))}
      </ol>
    );

  const canAddStep = field.max == null || steps.length < field.max;

  return (
    <div id={id} className="flex flex-col gap-3" role="group" aria-label={field.label}>
      {steps.map((s, i) => {
        const hazards = s.hazards ?? [];
        const sp = `${path}.${i}`;
        const canAddHazard = hazardsField?.max == null || hazards.length < hazardsField.max;
        return (
          <div
            key={i}
            className="border-border flex flex-col gap-3 rounded-[var(--radius-panel)] border p-3"
          >
            <div className="flex items-center justify-between">
              <span className="text-sm font-medium">{t.forms.ats.stepN(i + 1)}</span>
              <Button
                type="button"
                variant="ghost"
                className="h-12"
                aria-label={`${t.forms.remove} ${t.forms.ats.stepN(i + 1)}`}
                onClick={() => onChange(steps.filter((_, j) => j !== i) as Payload[])}
              >
                {t.forms.remove}
              </Button>
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor={`${sp}.step`} className="text-sm">
                {stepField?.label ?? t.forms.ats.step}
              </Label>
              <Input
                id={`${sp}.step`}
                className="h-12 text-base"
                maxLength={textMax(stepField)}
                aria-invalid={Boolean(errors[`${sp}.step`]) || undefined}
                value={s.step ?? ""}
                onChange={(e) => setStep(i, { step: e.target.value })}
              />
              {errors[`${sp}.step`] && <FieldError>{errors[`${sp}.step`]}</FieldError>}
            </div>
            <span className="text-sm font-medium">{hazardsField?.label ?? t.forms.ats.hazards}</span>
            {hazardsField && (
              <span className="text-sm font-medium">{hazardsField.label}</span>
            )}
            {hazards.map((h, k) => {
              const hp = `${sp}.hazards.${k}`;
              return (
                <div key={k} className="border-border flex flex-col gap-3 border-l-2 pl-3">
                  <div className="flex items-center justify-between">
                    <span className="text-muted text-xs">{t.forms.ats.hazardN(k + 1)}</span>
                    <Button
                      type="button"
                      variant="ghost"
                      className="h-12"
                      aria-label={`${t.forms.remove} ${t.forms.ats.hazardN(k + 1)}`}
                      onClick={() =>
                        setStep(i, { hazards: hazards.filter((_, m) => m !== k) })
                      }
                    >
                      {t.forms.remove}
                    </Button>
                  </div>
                  <div className="flex flex-col gap-1.5">
                    <Label htmlFor={`${hp}.hazard`} className="text-sm">
                      {hazardField?.label ?? t.forms.ats.hazard}
                    </Label>
                    <Input
                      id={`${hp}.hazard`}
                      className="h-12 text-base"
                      maxLength={textMax(hazardField)}
                      aria-invalid={Boolean(errors[`${hp}.hazard`]) || undefined}
                      value={h.hazard ?? ""}
                      onChange={(e) => setHazard(i, k, { hazard: e.target.value })}
                    />
                    {errors[`${hp}.hazard`] && <FieldError>{errors[`${hp}.hazard`]}</FieldError>}
                  </div>
                  <div className="flex flex-col gap-1.5">
                    <Label htmlFor={`${hp}.controls`} className="text-sm">
                      {controlsField?.label ?? t.forms.ats.controls}
                    </Label>
                    <Textarea
                      id={`${hp}.controls`}
                      maxLength={textMax(controlsField)}
                      aria-invalid={Boolean(errors[`${hp}.controls`]) || undefined}
                      value={h.controls ?? ""}
                      onChange={(e) => setHazard(i, k, { controls: e.target.value })}
                    />
                    {errors[`${hp}.controls`] && <FieldError>{errors[`${hp}.controls`]}</FieldError>}
                  </div>
                </div>
              );
            })}
            {errors[`${sp}.hazards`] && <FieldError>{errors[`${sp}.hazards`]}</FieldError>}
            {canAddHazard && (
              <Button
                type="button"
                className="h-12"
                onClick={() => setStep(i, { hazards: [...hazards, {}] })}
              >
                {t.forms.ats.addHazard}
              </Button>
            )}
          </div>
        );
      })}
      {canAddStep && (
        <Button
          type="button"
          className="h-12"
          onClick={() => onChange([...steps, { hazards: [{}] }] as Payload[])}
        >
          {t.forms.ats.addStep}
        </Button>
      )}
    </div>
  );
}
