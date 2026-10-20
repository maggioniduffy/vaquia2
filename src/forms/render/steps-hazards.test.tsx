import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { compileForm, type Payload } from "../compile";
import type { FormSchema, GroupField } from "../dsl";
import { StepsHazardsControls } from "./steps-hazards";

// Vitest runs without globals, so testing-library cannot auto-register its cleanup.
afterEach(cleanup);

// Phase 2.6 — the ATS "steps -> hazards -> controls" widget: repeatable cards with nested groups,
// add/remove within min/max, dotted error paths and a read-only rendering.

const field: GroupField = {
  key: "steps",
  type: "group",
  label: "Pasos, peligros y controles",
  repeatable: true,
  min: 1,
  max: 2,
  required: true,
  widget: "steps_hazards_controls",
  fields: [
    { key: "step", type: "text", label: "Paso", required: true, maxLength: 300 },
    {
      key: "hazards",
      type: "group",
      label: "Peligros",
      repeatable: true,
      min: 1,
      max: 2,
      required: true,
      fields: [
        { key: "hazard", type: "text", label: "Peligro", required: true, maxLength: 300 },
        { key: "controls", type: "textarea", label: "Controles", required: true, maxLength: 1000 },
      ],
    },
  ],
};

const step = (value: string, hazards: { hazard?: string; controls?: string }[] = [{}]) => ({
  step: value,
  hazards,
});

function renderWidget(
  value: Payload[],
  opts: { errors?: Record<string, string>; readOnly?: boolean; onValue?: (next: Payload[]) => void } = {},
) {
  const onChange = vi.fn<(next: Payload[]) => void>(opts.onValue);
  const utils = render(
    <StepsHazardsControls
      id="steps"
      field={field}
      value={value}
      onChange={onChange}
      errors={opts.errors ?? {}}
      path="steps"
      readOnly={opts.readOnly ?? false}
    />,
  );
  return { ...utils, onChange };
}

/** Compiles the widget's value with the same field definition, to check min/max rules. */
function issues(value: Payload[]): string[] {
  const schema: FormSchema = {
    title: "ATS",
    sections: [{ key: "tarea", title: "Tarea", fields: [field] }],
  };
  const result = compileForm(schema).safeParse({ steps: value });
  if (result.success) return [];
  return result.error.issues.map((issue) => `${issue.path.join(".")}: ${issue.message}`);
}

describe("StepsHazardsControls: rendering", () => {
  it("renders one card per step and hazard, with their values", () => {
    renderWidget([
      {
        step: "Aislar la energía",
        hazards: [{ hazard: "Electrocución", controls: "Bloquear y etiquetar" }],
      },
      { step: "Verificar", hazards: [{ hazard: "Caída", controls: "Arnés" }] },
    ]);

    expect(screen.getByText("Paso 1")).toBeTruthy();
    expect(screen.getByText("Paso 2")).toBeTruthy();
    // Hazards are numbered inside each step card, so both steps have a "Peligro 1".
    expect(screen.getAllByText("Peligro 1")).toHaveLength(2);
    expect((screen.getAllByLabelText("Paso")[0] as HTMLInputElement).value).toBe(
      "Aislar la energía",
    );
    expect((screen.getAllByLabelText("Paso")[1] as HTMLInputElement).value).toBe("Verificar");
    expect((screen.getAllByLabelText("Peligro")[1] as HTMLInputElement).value).toBe("Caída");
    expect((screen.getAllByLabelText("Controles")[0] as HTMLTextAreaElement).value).toBe(
      "Bloquear y etiquetar",
    );
  });

  it("wires the maxLength of the nested text fields", () => {
    renderWidget([step("Aislar")]);
    expect(screen.getByLabelText("Paso").getAttribute("maxLength")).toBe("300");
    expect(screen.getByLabelText("Peligro").getAttribute("maxLength")).toBe("300");
    expect(screen.getByLabelText("Controles").getAttribute("maxLength")).toBe("1000");
  });

  it("renders the empty state in readOnly mode", () => {
    renderWidget([], { readOnly: true });
    expect(screen.getByText("—")).toBeTruthy();
    expect(screen.queryAllByRole("button")).toEqual([]);
  });
});

describe("StepsHazardsControls: add and remove", () => {
  it("adds a step with an empty hazard card", () => {
    const { onChange } = renderWidget([step("Aislar")]);
    fireEvent.click(screen.getByRole("button", { name: "Agregar paso" }));
    expect(onChange).toHaveBeenCalledWith([step("Aislar"), { hazards: [{}] }]);
  });

  it("removes a step by position", () => {
    const { onChange } = renderWidget([step("Uno"), step("Dos")]);
    fireEvent.click(screen.getByRole("button", { name: "Quitar Paso 1" }));
    expect(onChange).toHaveBeenCalledWith([step("Dos")]);
  });

  it("adds a hazard to the step that owns the button", () => {
    const { onChange } = renderWidget([
      step("Uno", [{ hazard: "A", controls: "B" }]),
      step("Dos", [{ hazard: "C", controls: "D" }]),
    ]);
    const cards = screen.getAllByText(/^Paso \d$/);
    const secondCard = cards[1]!.closest("div.flex.flex-col.gap-3") as HTMLElement;
    fireEvent.click(within(secondCard).getByRole("button", { name: "Agregar peligro" }));
    expect(onChange).toHaveBeenCalledWith([
      step("Uno", [{ hazard: "A", controls: "B" }]),
      step("Dos", [
        { hazard: "C", controls: "D" },
        {},
      ]),
    ]);
  });

  it("removes a hazard by position", () => {
    const { onChange } = renderWidget([
      step("Uno", [
        { hazard: "A", controls: "B" },
        { hazard: "C", controls: "D" },
      ]),
    ]);
    fireEvent.click(screen.getByRole("button", { name: "Quitar Peligro 2" }));
    expect(onChange).toHaveBeenCalledWith([step("Uno", [{ hazard: "A", controls: "B" }])]);
  });
});

describe("StepsHazardsControls: min and max", () => {
  it("hides 'Agregar paso' once the group reaches its max", () => {
    renderWidget([step("Uno"), step("Dos")]);
    expect(screen.queryByRole("button", { name: "Agregar paso" })).toBeNull();
  });

  it("keeps 'Agregar paso' below the max", () => {
    renderWidget([step("Uno")]);
    expect(screen.getByRole("button", { name: "Agregar paso" })).toBeTruthy();
  });

  it("hides 'Agregar peligro' once a step reaches the hazard max", () => {
    renderWidget([
      step("Uno", [
        { hazard: "A", controls: "B" },
        { hazard: "C", controls: "D" },
      ]),
    ]);
    expect(screen.queryByRole("button", { name: "Agregar peligro" })).toBeNull();
  });

  it("lets the user remove below the min; the compiler reports it", () => {
    let next: Payload[] = [];
    const { onChange } = renderWidget([step("Uno")], { onValue: (v) => (next = v) });
    fireEvent.click(screen.getByRole("button", { name: "Quitar Paso 1" }));
    expect(onChange).toHaveBeenCalled();
    expect(next).toEqual([]);
    expect(issues(next)).toContain("steps: at least 1 required");
  });

  it("reports a step without hazards through the compiler", () => {
    expect(issues([step("Uno", [])])).toContain("steps.0.hazards: at least 1 required");
  });
});

describe("StepsHazardsControls: errors", () => {
  it("shows nested error paths under the matching input", () => {
    renderWidget(
      [
        step("Uno", [
          { hazard: "A", controls: "B" },
          { hazard: "C", controls: "D" },
        ]),
      ],
      {
        errors: {
          "steps.0.step": "Obligatorio",
          "steps.0.hazards.1.hazard": "Obligatorio",
          "steps.0.hazards.1.controls": "Obligatorio",
          "steps.0.hazards": "Al menos 1",
        },
      },
    );

    expect(screen.getByText("Al menos 1")).toBeTruthy();
    // step, hazard and controls of the second hazard
    expect(screen.getAllByText("Obligatorio")).toHaveLength(3);
    expect(screen.getByLabelText("Paso").getAttribute("aria-invalid")).toBe("true");
    expect(screen.getAllByLabelText("Peligro")[1]!.getAttribute("aria-invalid")).toBe("true");
    expect(screen.getAllByLabelText("Controles")[1]!.getAttribute("aria-invalid")).toBe("true");
    // the first hazard is not flagged
    expect(screen.getAllByLabelText("Peligro")[0]!.getAttribute("aria-invalid")).toBeNull();
  });
});

describe("StepsHazardsControls: readOnly", () => {
  it("renders the stored steps and hazards as text, without inputs or buttons", () => {
    renderWidget(
      [
        {
          step: "Aislar la energía",
          hazards: [
            { hazard: "Electrocución", controls: "Bloquear y etiquetar" },
            { hazard: "Caída", controls: "Arnés" },
          ],
        },
      ],
      { readOnly: true },
    );

    expect(screen.getByText("Paso 1: Aislar la energía")).toBeTruthy();
    expect(screen.getByText("Electrocución")).toBeTruthy();
    expect(screen.getByText("Bloquear y etiquetar")).toBeTruthy();
    expect(screen.getByText("Caída")).toBeTruthy();
    expect(screen.queryByRole("textbox")).toBeNull();
    expect(screen.queryAllByRole("button")).toEqual([]);
  });

  it("falls back to the 'none' marker for empty values", () => {
    renderWidget([{ step: "", hazards: [{}] }], { readOnly: true });
    // The step's marker lives inside "Paso 1: —", so it is not a standalone node.
    expect(screen.getByText("Paso 1: —")).toBeTruthy();
    expect(screen.getAllByText("—")).toHaveLength(2); // hazard, controls
  });
});
