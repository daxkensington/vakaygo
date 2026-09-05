import type { Metadata } from "next";
export const metadata: Metadata = {"title":"Terms of service","alternates":{"canonical":"https://vakaygo.com/terms"}};
export default function Layout({children}:{children:React.ReactNode}) { return <>{children}</>; }
