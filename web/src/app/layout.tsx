import type { Metadata } from "next";
import { Geist_Mono, Inter } from "next/font/google";
import "./globals.css";
import { cn } from "@/lib/utils";

const inter = Inter({
  subsets: ["latin"],
  variable: "--font-sans",
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "Anacronia",
  description:
    "Local-first collection intelligence for Apple Silicon Macs.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="en"
      className={cn(
        "dark h-full font-sans antialiased",
        inter.variable,
        geistMono.variable
      )}
    >
      <body className="group/body flex min-h-full flex-col overscroll-none antialiased [--footer-height:calc(var(--spacing)*14)] [--header-height:calc(var(--spacing)*14)] lg:[--header-height:calc(var(--spacing)*16)] xl:[--footer-height:calc(var(--spacing)*24)]">
        {children}
      </body>
    </html>
  );
}
