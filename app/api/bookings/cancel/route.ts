import { NextResponse } from "next/server";
import { requireUser } from "@/server/admin-auth";
import { cancelBooking } from "@/server/cancel-booking";
import { logger } from "@/lib/logger";
export async function POST(request: Request) {
  const auth = await requireUser();
  if (!auth.ok) return auth.error;
  try {
    const { bookingId, reason } = await request.json();
    if (typeof bookingId !== "string" || !/^[0-9a-f-]{36}$/i.test(bookingId)) return NextResponse.json({error:"A valid booking is required"},{status:400});
    const result = await cancelBooking(bookingId,{id:auth.userId,role:auth.role},reason);
    return NextResponse.json(result,{status:"httpStatus" in result ? result.httpStatus : 200});
  } catch (error) {
    logger.error("Cancellation could not finish",error);
    return NextResponse.json({error:"Cancellation could not finish. Please retry or contact bookings@vakaygo.com."},{status:503});
  }
}
