import type { Metadata } from "next";
import "./globals.css";
export const metadata: Metadata = { title: "OmniStaff", description: "Multi-tenant workforce and leave management" };
export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) { return <html lang="en"><body>{children}</body></html>; }
