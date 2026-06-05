import type { Metadata } from "next";
import { Geist_Mono, Inter } from "next/font/google";
import "./globals.css";
import { cn } from "@/lib/utils";
import { TooltipProvider } from "@/components/ui/tooltip";
import {
  FORMAL_PROJECT_CREDIT,
  SOURCE_PROJECT_CREDIT_COMMENT,
} from "@/lib/project-attribution";

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
  applicationName: "Anacronia",
  authors: [{ name: "Giorgio Olivero / Gio Sampietro" }],
  creator: "Giorgio Olivero / Gio Sampietro",
  other: {
    "project-credit": FORMAL_PROJECT_CREDIT,
  },
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
        <template
          data-anacronia-credit
          dangerouslySetInnerHTML={{ __html: SOURCE_PROJECT_CREDIT_COMMENT }}
        />
        <TooltipProvider>{children}</TooltipProvider>
      </body>
    </html>
  );
}
