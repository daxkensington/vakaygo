/**
 * CSV cells for files an administrator opens in a spreadsheet.
 *
 * Names, emails and listing titles are written by users. A cell that starts
 * with `=`, `+`, `-`, `@`, a tab or a carriage return is run as a formula by
 * Excel, Sheets and LibreOffice, so such text is prefixed with an apostrophe,
 * which spreadsheets show as plain text. Numbers stay numbers: a negative
 * amount is not a formula.
 */
const FORMULA_LEAD = /^[=+\-@\t\r]/;
const PLAIN_NUMBER = /^-?\d+(?:\.\d+)?$/;

export function neutralizeCsvFormula(text: string): string {
  if (!FORMULA_LEAD.test(text) || PLAIN_NUMBER.test(text)) return text;
  return `'${text}`;
}

/** One CSV field: formula-safe, then quoted when it contains a delimiter, quote or line break. */
export function csvCell(value: unknown): string {
  if (value === null || value === undefined) return "";
  if (typeof value === "number") return Number.isFinite(value) ? String(value) : "";
  const text = neutralizeCsvFormula(String(value));
  return /[",\r\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

export function csvRow(values: readonly unknown[]): string {
  return values.map(csvCell).join(",");
}
