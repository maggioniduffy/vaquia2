const WEIGHTS = [5, 4, 3, 2, 7, 6, 5, 4, 3, 2];
const PREFIXES = new Set(["20", "23", "24", "27", "30", "33", "34"]);

/** Strips everything but digits. */
export function normalizeCuit(input: string): string {
  return input.replace(/\D/g, "");
}

/** AFIP CUIT/CUIL: 11 digits, valid prefix, mod-11 check digit. Mirrors `app.cuit_valid` in the DB. */
export function isValidCuit(input: string): boolean {
  const cuit = normalizeCuit(input);
  if (cuit.length !== 11 || !PREFIXES.has(cuit.slice(0, 2))) return false;
  const total = WEIGHTS.reduce((sum, w, i) => sum + Number(cuit[i]) * w, 0);
  const rest = total % 11;
  const expected = rest === 0 ? 0 : 11 - rest;
  if (expected === 10) return false;
  return expected === Number(cuit[10]);
}

/** XX-XXXXXXXX-X; returns the digits unchanged if not 11 long. */
export function formatCuit(input: string): string {
  const cuit = normalizeCuit(input);
  if (cuit.length !== 11) return cuit;
  return `${cuit.slice(0, 2)}-${cuit.slice(2, 10)}-${cuit.slice(10)}`;
}
