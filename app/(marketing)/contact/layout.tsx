import type { Metadata } from "next";
import { staticPageMetadata } from "@/lib/page-metadata";
export const metadata: Metadata = staticPageMetadata("/contact", "Contact us", "Contact the VakayGo team about a listing, a booking, claiming your business or partnering with us.");
export default function Layout({children}:{children:React.ReactNode}) { return <>{children}</>; }
