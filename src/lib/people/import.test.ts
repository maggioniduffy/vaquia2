import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import {
  addMonths,
  MAX_BYTES,
  normalizeDni,
  normalizeName,
  parse,
  validatePersonas,
  validateQualifications,
  type QualificationTypeInfo,
} from "./import";

// Fixtures shared with the DB import test (db/tests/import.test.ts).
// Resolved from the repo root (vitest runs there); import.meta.url is not a file URL under jsdom.
const fixture = (name: string) =>
  readFileSync(path.resolve(process.cwd(), "db/tests/fixtures", name), "utf8");

const crewsByName = new Map([
  [normalizeName("Cuadrilla Norte"), { id: "crew-norte", name: "Cuadrilla Norte" }],
  [normalizeName("Cuadrilla Sur"), { id: "crew-sur", name: "Cuadrilla Sur" }],
]);

const TYPES: QualificationTypeInfo[] = [
  { id: "t-altura", name: "Trabajo en altura (IRAM 3625)", defaultValidityMonths: 12 },
  { id: "t-confinados", name: "Espacios confinados", defaultValidityMonths: 12 },
  { id: "t-rcp", name: "Primeros auxilios / RCP", defaultValidityMonths: 24 },
  { id: "t-manejo", name: "Manejo defensivo", defaultValidityMonths: 24 },
  { id: "t-licencia", name: "Licencia de conducir de campo", defaultValidityMonths: null },
];

describe("parse: headers and layout", () => {
  it("reports a missing required column in the header", () => {
    const result = parse("nombre;activo\n1;si", "personas");
    expect(result.headerErrors).toEqual(["Falta la columna 'dni' en el encabezado."]);
    expect(result.rows).toEqual([]);
  });

  it("reports every missing required column for capacitaciones", () => {
    const result = parse("dni;capacitacion\n1;x", "capacitaciones");
    expect(result.headerErrors).toEqual(["Falta la columna 'emitida' en el encabezado."]);
  });

  it("reports an empty file and an oversized file", () => {
    expect(parse("   \n  ", "personas").headerErrors).toEqual(["El archivo está vacío."]);
    expect(parse("x".repeat(MAX_BYTES + 1), "personas").headerErrors).toEqual([
      "El archivo supera 2 MB.",
    ]);
  });

  it("matches headers case-insensitively and without accents", () => {
    const result = parse("DNI;Nombre\n20000001;Ana", "personas");
    expect(result.headerErrors).toEqual([]);
    expect(result.rows[0]?.cells.dni).toBe("20000001");
  });

  it("accepts comma-separated files", () => {
    const result = parse("dni,nombre\n20000001,Ana", "personas");
    expect(result.rows).toEqual([
      { line: 2, cells: { dni: "20000001", nombre: "Ana", cuadrilla: "", activo: "" } },
    ]);
  });

  it("keeps the file line number of each row, skipping blank lines", () => {
    const result = parse("dni;nombre\n\n20000001;Ana\n;\n20000002;Beto\n", "personas");
    // Line 4 is ";" (all cells blank) and is skipped like an empty line.
    expect(result.rows.map((r) => r.line)).toEqual([3, 5]);
  });

  it("parses the 200-row personas fixture with line numbers 2..201", () => {
    const result = parse(fixture("personas-200.csv"), "personas");
    expect(result.headerErrors).toEqual([]);
    expect(result.rows).toHaveLength(200);
    expect(result.rows[0]?.line).toBe(2);
    expect(result.rows[199]?.line).toBe(201);
  });
});

describe("validatePersonas: row errors with line numbers", () => {
  const results = validatePersonas(parse(fixture("personas-200.csv"), "personas").rows, {
    crewsByName,
  });
  const invalid = results.filter((r) => r.action === "invalid");

  it("flags exactly the seven bad rows, by line", () => {
    expect(invalid.map((r) => r.line)).toEqual([10, 20, 30, 40, 50, 60, 70]);
    expect(results.filter((r) => r.action === "create")).toHaveLength(193);
  });

  it("explains each error with its line", () => {
    const message = (line: number) => invalid.find((r) => r.line === line)?.errors.join(" | ");
    expect(message(10)).toBe("Fila 10: falta el DNI");
    expect(message(20)).toBe("Fila 20: el DNI '12.ABC.345' no es válido. Debe tener 7 u 8 dígitos");
    expect(message(30)).toBe("Fila 30: falta el nombre");
    expect(message(40)).toContain("Fila 40:");
    expect(message(40)).toContain("ya figura en la fila 5");
    expect(message(50)).toBe("Fila 50: la cuadrilla 'Cuadrilla Inexistente' no existe");
    expect(message(60)).toContain("Fila 60: el valor de activo 'quizas' no es válido");
    expect(message(70)).toContain("Fila 70: el DNI '1234' no es válido");
  });

  it("normalizes dotted DNIs and matches crews case-insensitively", () => {
    const line4 = results.find((r) => r.line === 4);
    expect(line4?.data?.dni).toBe("20000274");
    const line2 = results.find((r) => r.line === 2);
    expect(line2?.data).toMatchObject({ dni: "20000000", crewId: "crew-norte", active: true });
  });
});

describe("validateQualifications: row errors and expiry defaults", () => {
  const personas = validatePersonas(parse(fixture("personas-200.csv"), "personas").rows, {
    crewsByName,
  });
  const personaIdsByDni = new Map(
    personas.filter((r) => r.data).map((r) => [r.data!.dni, `pid-${r.data!.dni}`]),
  );
  const typesByName = new Map(TYPES.map((t) => [normalizeName(t.name), t]));
  const results = validateQualifications(
    parse(fixture("capacitaciones-200.csv"), "capacitaciones").rows,
    {
      personaIdsByDni,
      typesByName,
    },
  );

  it("flags the eight bad rows by line and skips the in-file duplicate", () => {
    const invalid = results.filter((r) => r.action === "invalid").map((r) => r.line);
    expect(invalid).toEqual([5, 12, 18, 25, 26, 33, 40, 45]);
    const skipped = results.filter((r) => r.action === "skip");
    expect(skipped.map((r) => r.line)).toEqual([50]);
    expect(skipped[0]?.note).toContain("49");
    expect(results.filter((r) => r.action === "insert")).toHaveLength(191);
  });

  it("explains each bad row with its line and value", () => {
    const message = (line: number) => results.find((r) => r.line === line)?.errors.join(" | ");
    expect(message(5)).toBe("Fila 5: falta el DNI");
    expect(message(12)).toBe(
      "Fila 12: no existe una persona con DNI '99999999'. Importar el personal primero",
    );
    expect(message(18)).toBe("Fila 18: la capacitación 'Curso de cocina' no existe");
    expect(message(25)).toContain("Fila 25: la fecha de emisión '31/02/2025' no es válida");
    expect(message(26)).toContain("Fila 26: la fecha de vencimiento '2025-13-01' no es válida");
    expect(message(33)).toBe("Fila 33: falta la fecha de emisión");
    expect(message(40)).toContain("Fila 40:");
    expect(message(45)).toContain("Fila 45: el DNI 'ABC' no es válido");
  });

  it("fills the default validity when vence is blank", () => {
    // Line 2: altura (12 months), issued 2025-01-01, no vence.
    expect(results.find((r) => r.line === 2)?.data).toMatchObject({
      typeId: "t-altura",
      issuedOn: "2025-01-01",
      expiresOn: "2026-01-01",
    });
  });
});

describe("addMonths", () => {
  it("clamps the day to the end of the target month", () => {
    expect(addMonths("2025-01-31", 1)).toBe("2025-02-28");
    expect(addMonths("2024-12-15", 2)).toBe("2025-02-15");
  });

  it("normalizes DNIs by dropping separators", () => {
    expect(normalizeDni("20.000.274")).toBe("20000274");
  });
});
