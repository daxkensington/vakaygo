import type { Metadata } from "next";
import { staticPageMetadata } from "@/lib/page-metadata";
export const metadata: Metadata = staticPageMetadata("/map", "Caribbean map", "Map of stays, tours, restaurants and transport across 34 Caribbean, Latin American and Mediterranean destinations on VakayGo.");
export default function Layout({children}:{children:React.ReactNode}) { return <>{children}</>; }
