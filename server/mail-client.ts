import { Resend } from "resend";

let client: Resend | undefined;

/** Initialize only when sending; page and route discovery do not require email credentials. */
export function getMailClient() {
  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) throw new Error("RESEND_API_KEY is not set");
  return client ??= new Resend(apiKey);
}

export async function sendEmail(params: Parameters<Resend["emails"]["send"]>[0]) {
  const result = await getMailClient().emails.send(params);
  if (result.error) throw new Error(result.error.message);
  return result;
}
