import type { Metadata } from "next";
export const metadata: Metadata = {"title":"VakayGo for restaurants","alternates":{"canonical":"https://vakaygo.com/for-restaurants"}};
export default function Layout({children}:{children:React.ReactNode}) { return <>{children}</>; }
