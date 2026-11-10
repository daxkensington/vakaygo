import type { Metadata } from "next";
import { staticPageMetadata } from "@/lib/page-metadata";
export const metadata: Metadata = staticPageMetadata("/for-restaurants", "For restaurants", "List your restaurant on VakayGo: claim your free listing, keep your hours and menu current and reach travelers planning their trip.");
export default function Layout({children}:{children:React.ReactNode}) { return <>{children}</>; }
