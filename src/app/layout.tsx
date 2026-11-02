import type { Metadata } from "next";
import { Inter } from "next/font/google";
import "./globals.css";
import { AntdPopupContainer } from "@/components/common/AntdPopupContainer";

const inter = Inter({ subsets: ["latin"] });

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
      <body className={`${inter.className} bg-slate-50 text-slate-900 antialiased min-h-screen`}>
        <AntdPopupContainer>{children}</AntdPopupContainer>
      </body>
    </html>
  );
}
