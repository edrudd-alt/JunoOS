import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Juno Capital Partners",
  description: "Internal investment management platform",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" className="h-full">
      <body className="h-full">{children}</body>
    </html>
  );
}
