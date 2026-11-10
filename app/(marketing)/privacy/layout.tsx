import type { Metadata } from "next";
import { staticPageMetadata } from "@/lib/page-metadata";
export const metadata: Metadata = staticPageMetadata("/privacy", "Privacy policy", "How VakayGo collects, uses and protects personal information, and the choices you have.");
export default function Layout({children}:{children:React.ReactNode}) { return <>{children}</>; }
