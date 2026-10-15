import { Resend } from "resend";

let client: Resend | undefined;

/** Initialize only when sending; page and route discovery do not require email credentials. */
export function getMailClient() {
  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) throw new Error("RESEND_API_KEY is not set");
  return client ??= new Resend(apiKey);
}

function htmlToPlainText(html: string): string {
  return html
    .replace(/<style[\s\S]*?<\/style>/gi, "")
    .replace(/<script[\s\S]*?<\/script>/gi, "")
    .replace(/<a\s+[^>]*href=["']([^"']+)["'][^>]*>([\s\S]*?)<\/a>/gi, "$2 ($1)")
    .replace(/<\/(p|div|h[1-6]|li|tr|blockquote)>/gi, "\n")
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<li>/gi, "• ")
    .replace(/<[^>]+>/g, "")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

export async function sendEmail(params: Parameters<Resend["emails"]["send"]>[0]) {
  const payload = { ...params } as Record<string, unknown>;
  if (typeof payload.html === "string" && !payload.text) {
    payload.text = htmlToPlainText(payload.html);
  }
  const result = await getMailClient().emails.send(payload as Parameters<Resend["emails"]["send"]>[0]);
  if (result.error) throw new Error(result.error.message);
  return result;
}

