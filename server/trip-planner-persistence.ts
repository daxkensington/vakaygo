import { sql } from "drizzle-orm";

export type TripDraftItem = {
  listingId: string | null; dayNumber: number; timeSlot: string;
  customTitle: string; customNote: string | null; sortOrder: number;
};

/** Neon HTTP does not support interactive transactions: use one atomic statement. */
export function tripSaveQuery(actor: {
  userId: string; sessionVersion: number; role: string; email: string; emailVerified: boolean;
}, trip: {
  islandId: number; title: string; startDate: string; endDate: string; guestCount: number;
  budget: string | null; interests: string[] | null; isAiGenerated: boolean;
}, items: TripDraftItem[]) {
  return sql`
    WITH actor AS (
      SELECT id FROM users WHERE id=${actor.userId}::uuid
        AND session_version=${actor.sessionVersion} AND role=${actor.role}
        AND email=${actor.email} AND coalesce(email_verified,false)=${actor.emailVerified} FOR SHARE
    ), new_trip AS (
      INSERT INTO trips (user_id,island_id,title,start_date,end_date,guest_count,budget,interests,is_ai_generated,is_public)
      SELECT id,${trip.islandId},${trip.title},${trip.startDate}::timestamp,${trip.endDate}::timestamp,
        ${trip.guestCount},${trip.budget},${trip.interests === null ? null : JSON.stringify(trip.interests)}::json,${trip.isAiGenerated},false FROM actor
      RETURNING *
    ), saved_items AS (
      INSERT INTO trip_items (trip_id,listing_id,day_number,time_slot,custom_title,custom_note,sort_order)
      SELECT new_trip.id,item."listingId"::uuid,item."dayNumber",item."timeSlot",item."customTitle",item."customNote",item."sortOrder"
      FROM new_trip CROSS JOIN jsonb_to_recordset(${JSON.stringify(items)}::jsonb)
        AS item("listingId" text,"dayNumber" integer,"timeSlot" text,"customTitle" text,"customNote" text,"sortOrder" integer)
    ) SELECT id,user_id AS "userId",island_id AS "islandId",title,start_date AS "startDate",end_date AS "endDate",
      guest_count AS "guestCount",budget,interests,is_ai_generated AS "isAiGenerated",is_public AS "isPublic",
      created_at AS "createdAt",updated_at AS "updatedAt" FROM new_trip
  `;
}
