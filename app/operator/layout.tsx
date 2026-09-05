import type { Metadata } from "next";
import Shell from "./dashboard-shell";
export const metadata: Metadata = { robots: { index: false, follow: false }, alternates: { canonical: null } };
export default function Layout({children}:{children:React.ReactNode}) { return <Shell>{children}</Shell>; }
