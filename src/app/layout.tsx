import type { Metadata } from "next";
import "./globals.css";
import { AntdPopupContainer } from "@/components/common/AntdPopupContainer";


export const metadata: Metadata = {
  title: "Delta Warranty & Service (CSC) Management System",
  description:
    "Enterprise Warranty, Sticker Tracking, Complaints & Customer Service Center Management for Solartive Techno Industries",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body className="bg-slate-50 text-slate-900 antialiased min-h-screen">
        <AntdPopupContainer>{children}</AntdPopupContainer>
      </body>
    </html>
  );
}
