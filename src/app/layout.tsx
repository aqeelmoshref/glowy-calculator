import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Glowy Calculator",
  description: "A little clarity in every calculation.",
  icons: {
    icon: "/favicon.svg",
    shortcut: "/favicon.svg",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body>{children}</body>
    </html>
  );
}
