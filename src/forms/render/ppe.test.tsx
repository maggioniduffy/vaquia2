import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { Payload } from "../compile";
import type { Section } from "../dsl";
import { FormRenderer } from "./form-renderer";
import type { FormReferences } from "./types";

// Phase 2.6 — PPE checklist. When no PPE catalogue is cached for the task type the renderer must not
// invent items: it offers the "Sin EPP específico" toggle, which stores `{}` (not `undefined`).

afterEach(cleanup);

const sections: Section[] = [
  {
    key: "tarea",
    title: "Tarea",
    fields: [{ key: "ppe", type: "ppe", label: "EPP requerido", required: true }],
  },
];

const noCatalogue: FormReferences = { personas: [], crews: [], locations: [], taskTypes: [] };

function renderPpe(value: Payload, opts: { readOnly?: boolean; onChange?: (next: Payload) => void } = {}) {
  const onChange = vi.fn(opts.onChange);
  render(
    <FormRenderer
      sections={sections}
      value={value}
      onChange={onChange}
      references={noCatalogue}
      readOnly={opts.readOnly ?? false}
    />,
  );
  return onChange;
}

describe("PPE empty state (no cached catalogue)", () => {
  it("explains that the task type has no PPE and offers the toggle", () => {
    renderPpe({});
    expect(screen.getByText("No hay EPP definido para este tipo de tarea.")).toBeTruthy();
    const toggle = screen.getByRole("checkbox", { name: "Sin EPP específico" });
    expect(toggle.getAttribute("aria-checked")).toBe("false");
  });

  it("stores an empty object when 'Sin EPP específico' is selected", () => {
    const onChange = renderPpe({});
    fireEvent.click(screen.getByRole("checkbox", { name: "Sin EPP específico" }));
    expect(onChange).toHaveBeenCalledWith({ ppe: {} });
  });

  it("clears the field when the toggle is turned off again", () => {
    const onChange = renderPpe({ ppe: {} });
    const toggle = screen.getByRole("checkbox", { name: "Sin EPP específico" });
    expect(toggle.getAttribute("aria-checked")).toBe("true");
    fireEvent.click(toggle);
    expect(onChange).toHaveBeenCalledWith({ ppe: undefined });
  });

  it("renders the stored answer as text in readOnly mode", () => {
    renderPpe({ ppe: {} }, { readOnly: true });
    expect(screen.getByText("—")).toBeTruthy();
    expect(screen.queryByRole("checkbox")).toBeNull();
  });
});

describe("PPE with a cached catalogue", () => {
  const references: FormReferences = {
    ...noCatalogue,
    ppeItems: [
      { key: "casco", label: "Casco" },
      { key: "arnes", label: "Arnés" },
    ],
  };

  it("renders one checkbox per cached item and no empty-state toggle", () => {
    render(
      <FormRenderer
        sections={sections}
        value={{ ppe: { casco: true } }}
        onChange={vi.fn()}
        references={references}
      />,
    );
    expect(screen.getByRole("checkbox", { name: "Casco" })).toBeTruthy();
    expect(screen.getByRole("checkbox", { name: "Arnés" })).toBeTruthy();
    expect(screen.queryByRole("checkbox", { name: "Sin EPP específico" })).toBeNull();
  });

  it("updates one item without dropping the others", () => {
    const onChange = vi.fn();
    render(
      <FormRenderer
        sections={sections}
        value={{ ppe: { casco: true } }}
        onChange={onChange}
        references={references}
      />,
    );
    fireEvent.click(screen.getByRole("checkbox", { name: "Arnés" }));
    expect(onChange).toHaveBeenCalledWith({ ppe: { casco: true, arnes: true } });
  });
});
