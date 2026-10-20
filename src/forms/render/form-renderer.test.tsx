import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { walkSchema, type Field, type FormSchema } from "../dsl";
import type { Payload } from "../compile";
import atsSeed from "../seeds/ats.v1.json";
import toolboxTalkSeed from "../seeds/toolbox_talk.v1.json";
import { FormRenderer } from "./form-renderer";
import type { FormReferences } from "./types";

// Vitest runs without globals, so testing-library cannot auto-register its cleanup.
afterEach(cleanup);

const toolboxTalk = toolboxTalkSeed as unknown as FormSchema;
const ats = atsSeed as unknown as FormSchema;

const references: FormReferences = {
  personas: [
    { key: "persona-1", label: "Ana Pérez" },
    { key: "persona-2", label: "Luis Gómez" },
  ],
  crews: [{ key: "crew-1", label: "Cuadrilla 1" }],
  locations: [{ key: "loc-1", label: "Pozo A" }],
  taskTypes: [{ key: "tt-1", label: "Mantenimiento" }],
  ppeItems: [
    { key: "casco", label: "Casco" },
    { key: "arnes", label: "Arnés" },
  ],
};

const toolboxTalkValue: Payload = {
  topic: "Uso del arnés de seguridad",
  crew: "crew-1",
  location: "loc-1",
  attendees: ["persona-1", "persona-2"],
  notes: "Recordatorio de uso",
};

const atsValue: Payload = {
  task_type: "tt-1",
  steps: [
    {
      step: "Aislar la energía",
      hazards: [{ hazard: "Electrocución", controls: "Bloquear y etiquetar" }],
    },
  ],
  ppe: { casco: true, arnes: false },
  participants: ["persona-1"],
};

/** Field types rendered with an input that carries the field path as `id`. */
const ID_CONTROLS = new Set([
  "text",
  "textarea",
  "number",
  "date",
  "time",
  "select",
  "crew",
  "location",
  "task_type",
]);

function expectsId(field: Field): boolean {
  if (field.type === "persona") return !field.multiple;
  return ID_CONTROLS.has(field.type);
}

/** Every field of a schema with the dotted path the renderer uses for it. */
function fieldsWithPaths(
  fields: Field[],
  value: Payload = {},
  prefix = "",
): { field: Field; path: string }[] {
  const out: { field: Field; path: string }[] = [];
  for (const field of fields) {
    const path = prefix ? `${prefix}.${field.key}` : field.key;
    out.push({ field, path });
    if (field.type !== "group") continue;
    const raw = value[field.key];
    const items = Array.isArray(raw) ? raw : [raw ?? {}];
    items.forEach((item, i) => {
      const itemPrefix = Array.isArray(raw) ? `${path}.${i}` : path;
      out.push(...fieldsWithPaths(field.fields, item as Payload, itemPrefix));
    });
  }
  return out;
}

function seedFields(schema: FormSchema): Field[] {
  const out: Field[] = [];
  walkSchema(schema, (field) => out.push(field));
  return out;
}

/** Enabled form controls inside a rendered form. */
function enabledControls(container: HTMLElement): Element[] {
  return Array.from(container.querySelectorAll("input, select, textarea, button")).filter(
    (element) => !(element as HTMLInputElement).disabled,
  );
}

describe("FormRenderer: toolbox talk seed", () => {
  it("renders the label of every field", () => {
    render(
      <FormRenderer
        sections={toolboxTalk.sections}
        value={toolboxTalkValue}
        references={references}
        onChange={vi.fn()}
      />,
    );
    const missing = seedFields(toolboxTalk)
      .filter((field) => screen.queryAllByText(field.label).length === 0)
      .map((field) => field.key);
    expect(missing).toEqual([]);
  });

  it("renders a control for every field that has one", () => {
    const { container } = render(
      <FormRenderer
        sections={toolboxTalk.sections}
        value={toolboxTalkValue}
        references={references}
        onChange={vi.fn()}
      />,
    );
    const missing = toolboxTalk.sections
      .flatMap((section) => fieldsWithPaths(section.fields, toolboxTalkValue))
      .filter(({ field }) => expectsId(field))
      .filter(({ path }) => container.querySelector(`[id="${path}"]`) === null)
      .map(({ path }) => path);
    expect(missing).toEqual([]);
  });

  it("renders the reference options of the reference fields", () => {
    render(
      <FormRenderer
        sections={toolboxTalk.sections}
        value={toolboxTalkValue}
        references={references}
        onChange={vi.fn()}
      />,
    );
    expect(screen.getByRole("option", { name: "Cuadrilla 1" })).toBeTruthy();
    expect(screen.getByRole("option", { name: "Pozo A" })).toBeTruthy();
  });
});

describe("FormRenderer: ats seed", () => {
  it("renders the label of every field", () => {
    render(
      <FormRenderer
        sections={ats.sections}
        value={atsValue}
        references={references}
        onChange={vi.fn()}
      />,
    );
    const missing = seedFields(ats)
      .filter((field) => screen.queryAllByText(field.label).length === 0)
      .map((field) => field.key);
    expect(missing).toEqual([]);
  });

  it("renders a control for every field that has one, nested groups included", () => {
    const { container } = render(
      <FormRenderer
        sections={ats.sections}
        value={atsValue}
        references={references}
        onChange={vi.fn()}
      />,
    );
    const missing = ats.sections
      .flatMap((section) => fieldsWithPaths(section.fields, atsValue))
      .filter(({ field }) => expectsId(field))
      .filter(({ path }) => container.querySelector(`[id="${path}"]`) === null)
      .map(({ path }) => path);
    expect(missing).toEqual([]);
  });

  it("renders the PPE items of the task type", () => {
    render(
      <FormRenderer
        sections={ats.sections}
        value={atsValue}
        references={references}
        onChange={vi.fn()}
      />,
    );
    expect(screen.getByRole("checkbox", { name: "Casco" })).toBeTruthy();
    expect(screen.getByRole("checkbox", { name: "Arnés" })).toBeTruthy();
  });
});

describe("FormRenderer: readOnly mode", () => {
  it.each([
    ["toolbox talk", toolboxTalk, toolboxTalkValue] as const,
    ["ats", ats, atsValue] as const,
  ])("renders no enabled input for the %s seed", (_name, schema, value) => {
    const { container } = render(
      <FormRenderer
        sections={schema.sections}
        value={value}
        references={references}
        onChange={vi.fn()}
        readOnly
      />,
    );
    expect(enabledControls(container)).toEqual([]);
  });

  it.each([
    ["toolbox talk", toolboxTalk, toolboxTalkValue] as const,
    ["ats", ats, atsValue] as const,
  ])("the %s seed does have enabled inputs when it is not readOnly", (_name, schema, value) => {
    const { container } = render(
      <FormRenderer
        sections={schema.sections}
        value={value}
        references={references}
        onChange={vi.fn()}
      />,
    );
    expect(enabledControls(container).length).toBeGreaterThan(0);
  });

  it("keeps the checklist controls of the ats seed but disabled", () => {
    render(
      <FormRenderer sections={ats.sections} value={atsValue} references={references} readOnly />,
    );
    const checkboxes = screen.getAllByRole("checkbox") as HTMLInputElement[];
    expect(checkboxes.length).toBe(references.ppeItems?.length);
    for (const checkbox of checkboxes) expect(checkbox.disabled).toBe(true);
  });

  it("renders the stored values as text", () => {
    render(
      <FormRenderer
        sections={toolboxTalk.sections}
        value={toolboxTalkValue}
        references={references}
        readOnly
      />,
    );
    expect(screen.getByText("Uso del arnés de seguridad")).toBeTruthy();
    expect(screen.getByText("Cuadrilla 1")).toBeTruthy();
    expect(screen.getByText("Ana Pérez, Luis Gómez")).toBeTruthy();
  });

  it("renders no add/remove button for repeatable groups", () => {
    const { container } = render(
      <FormRenderer sections={ats.sections} value={atsValue} references={references} readOnly />,
    );
    expect(container.querySelectorAll("button").length).toBe(0);
  });
});
