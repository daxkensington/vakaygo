import { neon } from "@neondatabase/serverless";
import { drizzle } from "drizzle-orm/neon-http";
import { notifications } from "@/drizzle/schema";

export async function createNotification(params: {
  userId: string;
  type: "booking" | "review" | "message" | "system";
  title: string;
  body?: string;
  link?: string;
}) {
  const db = drizzle(neon(process.env.DATABASE_URL!));

  await db.insert(notifications).values({
    userId: params.userId,
    type: params.type,
    title: params.title,
    body: params.body,
    link: params.link,
  });
}
