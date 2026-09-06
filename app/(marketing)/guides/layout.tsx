import type { Metadata } from "next";
export const metadata: Metadata = {"title":"Caribbean travel guides","alternates":{"canonical":"https://vakaygo.com/guides"}};
export default function Layout({children}:{children:React.ReactNode}) { return <>{children}</>; }
