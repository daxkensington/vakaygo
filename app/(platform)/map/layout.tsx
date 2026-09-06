import type { Metadata } from "next";
export const metadata: Metadata = {"title":"Caribbean map","alternates":{"canonical":"https://vakaygo.com/map"}};
export default function Layout({children}:{children:React.ReactNode}) { return <>{children}</>; }
