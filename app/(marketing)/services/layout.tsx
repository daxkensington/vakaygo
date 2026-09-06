import type { Metadata } from "next";
export const metadata: Metadata = {"title":"Travel services","alternates":{"canonical":"https://vakaygo.com/services"}};
export default function Layout({children}:{children:React.ReactNode}) { return <>{children}</>; }
