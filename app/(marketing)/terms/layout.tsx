import type { Metadata } from "next";
import { staticPageMetadata } from "@/lib/page-metadata";
export const metadata: Metadata = staticPageMetadata("/terms", "Terms of service", "The terms that govern using VakayGo as a traveler or a listed business.");
export default function Layout({children}:{children:React.ReactNode}) { return <>{children}</>; }
