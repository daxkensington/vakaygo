import type { Metadata } from "next";
import { staticPageMetadata } from "@/lib/page-metadata";
export const metadata: Metadata = staticPageMetadata("/protection", "Booking protection", "How bookings made and paid through VakayGo are protected, from payment to cancellation.");
export default function Layout({children}:{children:React.ReactNode}) { return <>{children}</>; }
