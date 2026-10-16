/** Public directory/AI responses must obey the same pre-booking contact gate. */
export function publicListingTypeData(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const copy = { ...value } as Record<string, unknown>;
  for (const key of ["phone", "email", "website", "whatsapp", "googleMapsUrl"]) delete copy[key];
  return copy;
}
