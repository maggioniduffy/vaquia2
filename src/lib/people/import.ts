// Pure CSV import logic for personas and qualifications (no DB, no server-only: unit-testable).
// Flow: parse(text, kind) -> validatePersonas / validateQualifications(rows, ctx) -> row results.
import Papa from "papaparse";
import { t } from "@/i18n/es-AR";
import { formatDateAr, parseDateInput } from "@/lib/dates";

export const MAX_BYTES = 2 * 1024 * 1024;
export const MAX_ROWS = 5000;

export type ImportKind = "personas" | "capacitaciones";

export const COLUMNS: Record<ImportKind, readonly string[]> = {
  personas: ["dni", "nombre", "cuadrilla", "activo"],
  capacitaciones: ["dni", "capacitacion", "emitida", "vence"],
};

const REQUIRED: Record<ImportKind, readonly string[]> = {
  personas: ["dni", "nombre"],
  capacitaciones: ["dni", "capacitacion", "emitida"],
};

/** Lowercase, strip accents, collapse whitespace. Used for headers, crew and type names. */
export function normalizeName(value: string): string {
  return value.normalize("NFD").replace(/\p{M}/gu, "").toLowerCase().replace(/\s+/g, " ").trim();
}

/** Digits only (drops dots, spaces, dashes). Valid DNIs have 7 or 8 digits. */
export function normalizeDni(value: string): string {
  return value.replace(/[\s.\-]/g, "");
}

function isValidDni(dni: string): boolean {
  return /^\d{7,8}$/.test(dni);
}

function fmt(template: string, vars: Record<string, string | number>): string {
  return template.replace(/\{(\w+)\}/g, (_, key: string) => String(vars[key] ?? ""));
}

// ---------------------------------------------------------------- parse

export type ParsedRow = {
  /** 1-based line in the file (header = 1). */
  line: number;
  /** Trimmed cells keyed by canonical column name; missing optional cells are "". */
  cells: Record<string, string>;
};

export type ParseResult = { headerErrors: string[]; rows: ParsedRow[] };

function detectDelimiter(headerLine: string): string {
  const semicolons = headerLine.split(";").length;
  const commas = headerLine.split(",").length;
  return semicolons > commas ? ";" : ",";
}

export function parse(input: string, kind: ImportKind): ParseResult {
  const errors = t.import.errors;
  const text = input.replace(/^﻿/, "");
  if (text.length > MAX_BYTES) return { headerErrors: [errors.tooLarge], rows: [] };
  if (text.trim() === "") return { headerErrors: [errors.empty], rows: [] };

  const firstLine = text.split(/\r?\n/).find((l) => l.trim() !== "") ?? "";
  const result = Papa.parse<string[]>(text, {
    delimiter: detectDelimiter(firstLine),
    skipEmptyLines: false,
  });
  const all = result.data;

  // Header = first non-empty line.
  const headerIndex = all.findIndex((r) => r.some((c) => c.trim() !== ""));
  if (headerIndex < 0) return { headerErrors: [errors.empty], rows: [] };
  const header = all[headerIndex]!.map((h) => normalizeName(h));
  const columnIndex = new Map<string, number>();
  header.forEach((name, i) => {
    if (COLUMNS[kind].includes(name) && !columnIndex.has(name)) columnIndex.set(name, i);
  });
  const headerErrors = REQUIRED[kind]
    .filter((c) => !columnIndex.has(c))
    .map((column) => fmt(errors.missingColumn, { column }));
  if (headerErrors.length > 0) return { headerErrors, rows: [] };

  const rows: ParsedRow[] = [];
  for (let i = headerIndex + 1; i < all.length; i++) {
    const raw = all[i]!;
    if (raw.every((c) => c.trim() === "")) continue; // blank line
    const cells: Record<string, string> = {};
    for (const column of COLUMNS[kind]) {
      const idx = columnIndex.get(column);
      cells[column] = idx === undefined ? "" : (raw[idx] ?? "").trim();
    }
    rows.push({ line: i + 1, cells });
  }
  if (rows.length > MAX_ROWS) {
    return {
      headerErrors: [fmt(errors.tooManyRows, { count: rows.length })],
      rows: [],
    };
  }
  return { headerErrors: [], rows };
}

// ---------------------------------------------------------------- results

export type RowAction = "create" | "update" | "insert" | "skip" | "invalid";

type BaseResult = {
  line: number;
  values: Record<string, string>;
  /** Explicit es-AR messages. Non-empty only when action is "invalid". */
  errors: string[];
  /** Informational es-AR message for skipped rows. */
  note?: string;
};

export type PersonaData = {
  dni: string;
  fullName: string;
  /** null = no crew change (blank cell). */
  crewId: string | null;
  /** null = no change on update, true on create. */
  active: boolean | null;
};

export type PersonaRowResult = BaseResult & {
  action: "create" | "update" | "invalid";
  data?: PersonaData;
};

export type QualificationData = {
  personaId: string;
  typeId: string;
  issuedOn: string;
  expiresOn: string | null;
};

export type QualificationRowResult = BaseResult & {
  action: "insert" | "skip" | "invalid";
  data?: QualificationData;
};

export type RowResult = PersonaRowResult | QualificationRowResult;

// ---------------------------------------------------------------- personas

export type PersonasContext = {
  /** Keys are `normalizeName(crew name)`. */
  crewsByName: Map<string, { id: string; name: string }>;
  /** DNIs (normalized) already in the company. */
  existingDnis?: Set<string>;
};

const TRUE_VALUES = new Set(["si", "s", "true", "1", "verdadero"]);
const FALSE_VALUES = new Set(["no", "n", "false", "0", "falso"]);

export function validatePersonas(rows: ParsedRow[], ctx: PersonasContext): PersonaRowResult[] {
  const errs = t.import.errors;
  const seen = new Map<string, number>();
  return rows.map(({ line, cells }): PersonaRowResult => {
    const errors: string[] = [];
    const rawDni = cells.dni ?? "";
    const dni = normalizeDni(rawDni);
    if (rawDni === "") errors.push(fmt(errs.dniMissing, { line }));
    else if (!isValidDni(dni)) errors.push(fmt(errs.dniInvalid, { line, value: rawDni }));
    else if (seen.has(dni)) {
      errors.push(fmt(errs.dniDuplicate, { line, value: rawDni, first: seen.get(dni)! }));
    } else seen.set(dni, line);

    const name = (cells.nombre ?? "").replace(/\s+/g, " ").trim();
    if (name === "") errors.push(fmt(errs.nameMissing, { line }));
    else if (name.length > 200) errors.push(fmt(errs.nameTooLong, { line }));

    let crewId: string | null = null;
    const rawCrew = cells.cuadrilla ?? "";
    if (rawCrew !== "") {
      const crew = ctx.crewsByName.get(normalizeName(rawCrew));
      if (crew) crewId = crew.id;
      else errors.push(fmt(errs.crewUnknown, { line, value: rawCrew }));
    }

    let active: boolean | null = null;
    const rawActive = cells.activo ?? "";
    if (rawActive !== "") {
      const key = normalizeName(rawActive);
      if (TRUE_VALUES.has(key)) active = true;
      else if (FALSE_VALUES.has(key)) active = false;
      else errors.push(fmt(errs.activeInvalid, { line, value: rawActive }));
    }

    if (errors.length > 0) return { line, values: cells, errors, action: "invalid" };
    const exists = ctx.existingDnis?.has(dni) ?? false;
    return {
      line,
      values: cells,
      errors,
      action: exists ? "update" : "create",
      data: { dni, fullName: name, crewId, active: exists ? active : (active ?? true) },
    };
  });
}

// ---------------------------------------------------------------- qualifications

export type QualificationTypeInfo = {
  id: string;
  name: string;
  defaultValidityMonths: number | null;
};

export type QualificationsContext = {
  /** Keys are normalized DNIs. */
  personaIdsByDni: Map<string, string>;
  /** Keys are `normalizeName(type name)`. */
  typesByName: Map<string, QualificationTypeInfo>;
  /** Existing qualifications as `qualificationKey(personaId, typeId, issuedOn)`. */
  existingKeys?: Set<string>;
};

export function qualificationKey(personaId: string, typeId: string, issuedOn: string): string {
  return `${personaId}|${typeId}|${issuedOn}`;
}

function validDateRange(iso: string): boolean {
  const year = Number(iso.slice(0, 4));
  return year >= 1950 && year <= 2100;
}

/** issued + months, clamping the day to the end of the target month (31/01 + 1 -> 28/02). */
export function addMonths(iso: string, months: number): string {
  const [y, m, d] = iso.split("-").map(Number) as [number, number, number];
  const total = y * 12 + (m - 1) + months;
  const ny = Math.floor(total / 12);
  const nm = (total % 12) + 1;
  const lastDay = new Date(Date.UTC(ny, nm, 0)).getUTCDate();
  const day = Math.min(d, lastDay);
  return `${String(ny).padStart(4, "0")}-${String(nm).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}

export function validateQualifications(
  rows: ParsedRow[],
  ctx: QualificationsContext,
): QualificationRowResult[] {
  const errs = t.import.errors;
  const seen = new Map<string, number>();
  return rows.map(({ line, cells }): QualificationRowResult => {
    const errors: string[] = [];

    const rawDni = cells.dni ?? "";
    const dni = normalizeDni(rawDni);
    let personaId: string | undefined;
    if (rawDni === "") errors.push(fmt(errs.dniMissing, { line }));
    else if (!isValidDni(dni)) errors.push(fmt(errs.dniInvalid, { line, value: rawDni }));
    else {
      personaId = ctx.personaIdsByDni.get(dni);
      if (!personaId) errors.push(fmt(errs.personaUnknown, { line, value: rawDni }));
    }

    const rawType = cells.capacitacion ?? "";
    let type: QualificationTypeInfo | undefined;
    if (rawType === "") errors.push(fmt(errs.typeMissing, { line }));
    else {
      type = ctx.typesByName.get(normalizeName(rawType));
      if (!type) errors.push(fmt(errs.typeUnknown, { line, value: rawType }));
    }

    const rawIssued = cells.emitida ?? "";
    let issuedOn: string | null = null;
    if (rawIssued === "") errors.push(fmt(errs.issuedMissing, { line }));
    else {
      issuedOn = parseDateInput(rawIssued);
      if (!issuedOn || !validDateRange(issuedOn)) {
        issuedOn = null;
        errors.push(fmt(errs.issuedInvalid, { line, value: rawIssued }));
      }
    }

    const rawExpires = cells.vence ?? "";
    let expiresOn: string | null = null;
    let expiresValid = true;
    if (rawExpires !== "") {
      expiresOn = parseDateInput(rawExpires);
      if (!expiresOn || !validDateRange(expiresOn)) {
        expiresOn = null;
        expiresValid = false;
        errors.push(fmt(errs.expiresInvalid, { line, value: rawExpires }));
      }
    }

    if (issuedOn && expiresValid) {
      if (expiresOn) {
        if (expiresOn < issuedOn) {
          errors.push(
            fmt(errs.expiresBeforeIssued, {
              line,
              expires: formatDateAr(expiresOn),
              issued: formatDateAr(issuedOn),
            }),
          );
        }
      } else if (type?.defaultValidityMonths) {
        expiresOn = addMonths(issuedOn, type.defaultValidityMonths);
      }
    }

    if (errors.length > 0 || !personaId || !type || !issuedOn) {
      return { line, values: cells, errors, action: "invalid" };
    }

    const data: QualificationData = { personaId, typeId: type.id, issuedOn, expiresOn };
    const key = qualificationKey(personaId, type.id, issuedOn);
    const firstLine = seen.get(key);
    if (firstLine !== undefined) {
      return {
        line,
        values: cells,
        errors,
        action: "skip",
        note: fmt(errs.skipInFile, { line, first: firstLine }),
        data,
      };
    }
    seen.set(key, line);
    if (ctx.existingKeys?.has(key)) {
      return {
        line,
        values: cells,
        errors,
        action: "skip",
        note: fmt(errs.skipExisting, { line }),
        data,
      };
    }
    return { line, values: cells, errors, action: "insert", data };
  });
}

// ---------------------------------------------------------------- summary

export type ImportCounts = {
  /** Rows that will be written (create + update + insert). */
  valid: number;
  errors: number;
  skipped: number;
  created: number;
  updated: number;
  inserted: number;
};

export function summarize(results: RowResult[]): ImportCounts {
  const counts: ImportCounts = {
    valid: 0,
    errors: 0,
    skipped: 0,
    created: 0,
    updated: 0,
    inserted: 0,
  };
  for (const r of results) {
    switch (r.action) {
      case "invalid":
        counts.errors++;
        break;
      case "skip":
        counts.skipped++;
        break;
      case "create":
        counts.created++;
        counts.valid++;
        break;
      case "update":
        counts.updated++;
        counts.valid++;
        break;
      case "insert":
        counts.inserted++;
        counts.valid++;
        break;
    }
  }
  return counts;
}

/** CSV template (`;` separated, BOM so Excel detects UTF-8) with header + 2 example rows. */
export function templateCsv(kind: ImportKind): string {
  return "﻿" + t.import.templates[kind].join("\r\n") + "\r\n";
}
