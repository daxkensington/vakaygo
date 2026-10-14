export const MAX_MESSAGE_LENGTH = 2000;
export const MESSAGE_UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
export function isMessageId(value: unknown): value is string { return typeof value === "string" && MESSAGE_UUID.test(value); }
export function messageAttachmentUrl(value: unknown): string | null {
  if (typeof value !== "string" || value.length > 2048) return null;
  try {
    const url = new URL(value);
    // /api/upload issues public Vercel Blob URLs, with no alternate attachment provider.
    return url.protocol === "https:" && !url.username && !url.password && /^[a-z0-9-]+\.public\.blob\.vercel-storage\.com$/i.test(url.hostname)
      ? url.href : null;
  } catch { return null; }
}
export type MessageInput = { receiverId: string; content: string; listingId: string | null; bookingId: string | null; attachmentUrl: string | null; attachmentType: "image" | "file" | null; clientMessageId: string | null };
export function parseMessageInput(value: unknown): MessageInput | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const body = value as Record<string, unknown>;
  if (!isMessageId(body.receiverId) || (body.content !== undefined && typeof body.content !== "string")) return null;
  const content = typeof body.content === "string" ? body.content.trim() : "";
  if (content.length > MAX_MESSAGE_LENGTH || /[\u0000-\u0008\u000b\u000c\u000e-\u001f]/.test(content)) return null;
  for (const key of ["listingId", "bookingId", "clientMessageId"]) if (body[key] != null && !isMessageId(body[key])) return null;
  const attachmentUrl = body.attachmentUrl == null ? null : messageAttachmentUrl(body.attachmentUrl);
  if (body.attachmentUrl != null && !attachmentUrl) return null;
  const attachmentType = body.attachmentType === "image" || body.attachmentType === "file" ? body.attachmentType : null;
  if ((attachmentUrl && !attachmentType) || (!attachmentUrl && body.attachmentType != null) || (!content && !attachmentUrl)) return null;
  const normalizedId = (value: unknown) => isMessageId(value) ? value.toLowerCase() : null;
  return { receiverId: body.receiverId.toLowerCase(), content, listingId: normalizedId(body.listingId), bookingId: normalizedId(body.bookingId),
    attachmentUrl, attachmentType, clientMessageId: normalizedId(body.clientMessageId) };
}
