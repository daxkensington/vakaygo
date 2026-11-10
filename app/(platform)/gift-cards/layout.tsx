import type { Metadata } from "next";
import { staticPageMetadata } from "@/lib/page-metadata";
export const metadata: Metadata = staticPageMetadata("/gift-cards", "Gift cards", "VakayGo gift cards.", { noindex: true });
export default function Layout({children}:{children:React.ReactNode}) { return <>{children}</>; }
