import { getExchangeRates } from "@/server/exchange-rates";

export async function GET() {
  return Response.json(await getExchangeRates());
}
