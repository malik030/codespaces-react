import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Upime | Public University Course Finder",
  description:
    "Find degree-related public university courses with Gemini-assisted scraping.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
