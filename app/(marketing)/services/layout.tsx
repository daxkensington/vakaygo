import type { Metadata } from "next";
import { staticPageMetadata } from "@/lib/page-metadata";
export const metadata: Metadata = staticPageMetadata("/services", "Travel services", "Airport transfers, car rentals, VIP services and private guides across 34 destinations, with business details and locations on VakayGo.");
export default function Layout({children}:{children:React.ReactNode}) { return <>{children}</>; }
