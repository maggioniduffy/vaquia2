import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { AttendeesPicker } from "./attendees";
import type { FormReferences } from "./types";

// Vitest runs without globals, so testing-library cannot auto-register its cleanup.
afterEach(cleanup);

const personas = [
  { key: "persona-1", label: "Ana Pérez" },
  { key: "persona-2", label: "Luis Gómez" },
  { key: "persona-3", label: "Sofía Díaz" },
];

const references: FormReferences = {
  personas,
  personaInfo: {
    "persona-1": { dni: "20111111", crewId: "crew-1", status: "valid" },
    "persona-2": { dni: "20222222", crewId: "crew-1", status: "expired" },
    "persona-3": { dni: "20333333", crewId: "crew-2", status: "expiring" },
  },
  crewId: "crew-1",
};

function renderPicker(
  value: string[] = [],
  overrides: Partial<FormReferences> = {},
  readOnly = false,
) {
  const onChange = vi.fn();
  const { container } = render(
    <AttendeesPicker
      id="attendees"
      label="Asistentes"
      value={value}
      onChange={onChange}
      references={{ ...references, ...overrides }}
      readOnly={readOnly}
    />,
  );
  return { onChange, container };
}

describe("AttendeesPicker", () => {
  it("renders the count of the selected people", () => {
    renderPicker(["persona-1", "persona-2"]);
    expect(screen.getByText("2 asistentes")).toBeTruthy();
  });

  it("renders the selected people with their name and DNI", () => {
    renderPicker(["persona-1"]);
    // Once in the list of the chosen people, once in the list of the candidates.
    expect(screen.getAllByText("Ana Pérez").length).toBe(2);
    expect(screen.getByText("20111111")).toBeTruthy();
  });

  it("renders the qualification status of a selected person", () => {
    renderPicker(["persona-2"]);
    expect(screen.getAllByText("Vencido").length).toBeGreaterThan(0);
  });

  it("offers to add the crew when it has people that are not selected", () => {
    const { onChange } = renderPicker(["persona-1"]);
    const button = screen.getByRole("button", { name: "Agregar 1 persona de la cuadrilla" });
    button.click();
    expect(onChange).toHaveBeenCalledWith(["persona-1", "persona-2"]);
  });

  it("does not offer to add the crew when everyone is already selected", () => {
    renderPicker(["persona-1", "persona-2"]);
    expect(screen.queryByRole("button", { name: /cuadrilla/ })).toBeNull();
  });

  it("filters the list by name", () => {
    renderPicker();
    const search = screen.getByRole("searchbox", { name: "Buscar por nombre o DNI" });
    fireEvent.change(search, { target: { value: "Luis" } });
    expect(screen.getByRole("checkbox", { name: /Luis Gómez/ })).toBeTruthy();
    expect(screen.queryByRole("checkbox", { name: /Ana Pérez/ })).toBeNull();
  });

  it("filters the list by DNI", () => {
    renderPicker();
    const search = screen.getByRole("searchbox", { name: "Buscar por nombre o DNI" });
    fireEvent.change(search, { target: { value: "20333333" } });
    expect(screen.getByRole("checkbox", { name: /Sofía Díaz/ })).toBeTruthy();
    expect(screen.queryByRole("checkbox", { name: /Ana Pérez/ })).toBeNull();
  });

  it("says when no person matches the search", () => {
    renderPicker();
    const search = screen.getByRole("searchbox", { name: "Buscar por nombre o DNI" });
    fireEvent.change(search, { target: { value: "zzzz" } });
    expect(screen.getByText("No hay personas que coincidan.")).toBeTruthy();
  });

  it("removes a selected person", () => {
    const { onChange } = renderPicker(["persona-1", "persona-2"]);
    screen.getByRole("button", { name: "Quitar Ana Pérez" }).click();
    expect(onChange).toHaveBeenCalledWith(["persona-2"]);
  });

  it("renders no search, no add button and no remove button in readOnly mode", () => {
    const { container } = renderPicker(["persona-1"], {}, true);
    expect(screen.queryByRole("searchbox")).toBeNull();
    expect(container.querySelectorAll("button").length).toBe(0);
    expect(screen.getByText("Ana Pérez")).toBeTruthy();
  });
});
