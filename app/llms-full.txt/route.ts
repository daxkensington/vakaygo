import { buildLlmsFullTxt } from "@/lib/llms-full";
import { getPublishedGuideLinks } from "@/server/guides-queries";

export const revalidate = 3600;

export async function GET(): Promise<Response> {
  const guides = await getPublishedGuideLinks();
  const body = buildLlmsFullTxt(guides);
  return new Response(body, {
    status: 200,
    headers: {
      "Content-Type": "text/plain; charset=utf-8",
      "Cache-Control": "public, s-maxage=3600, stale-while-revalidate=86400",
    },
  });
}
