import type { Metadata } from "next";
import type { ReactNode } from "react";
import "./globals.css";
import { SessionProvider } from "@/components/session/session-provider";
import { SiteHeader } from "@/components/layout/site-header";
import { SiteFooter } from "@/components/layout/site-footer";

export const metadata: Metadata = {
  title: { default: "TandMatch", template: "%s · TandMatch" },
  description: "Beskriv dit tandproblem og find tandlæger, der kan svare dig. AI'en giver ikke medicinsk rådgivning.",
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="da" className="h-full antialiased">
      <body className="flex min-h-dvh flex-col">
        <SessionProvider>
          <a
            href="#indhold"
            className="sr-only focus:not-sr-only focus:absolute focus:top-3 focus:left-3 focus:z-50 focus:rounded-lg focus:bg-surface focus:px-4 focus:py-3 focus:font-semibold focus:shadow-lg"
          >
            Gå til indhold
          </a>
          <SiteHeader />
          <main id="indhold" className="flex flex-1 flex-col">
            {children}
          </main>
          <SiteFooter />
        </SessionProvider>
      </body>
    </html>
  );
}
