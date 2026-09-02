import { redirect } from "next/navigation";

// ISR: rebuilt in the background at most hourly, so new posts/listings
// show up without a deploy.
export const revalidate = 3600;

export default function BlogRedirect() {
  redirect("/guides");
}
