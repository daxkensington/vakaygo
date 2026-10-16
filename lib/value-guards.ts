/** Narrow external JSON before it reaches typed application code. */
export function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

export function recordValue(value: unknown): Record<string, unknown> {
  return isRecord(value) ? value : {};
}

export function textValue(value: unknown): string | undefined {
  return typeof value === "string" ? value : undefined;
}

export function textList(value: unknown): string[] | undefined {
  return Array.isArray(value) && value.every((entry): entry is string => typeof entry === "string") ? value : undefined;
}

export function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : textValue(recordValue(error).message) || "Unknown error";
}
