import type { Metadata } from "next";
import type { ReactNode } from "react";
import "./globals.css";
import { SessionProvider } from "@/views/components/session/session-provider";
import { SiteHeader } from "@/components/ui/site-header";
import { SiteFooter } from "@/components/ui/site-footer";

export const metadata: Metadata = {
  title: { default: "TandMatch", template: "%s · TandMatch" },
  description: "Beskriv dit tandproblem, sammenlign klinikker og book en tid. AI’en giver en foreløbig vurdering; klinikken vurderer endeligt.",
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="da" className="h-full antialiased">
      <body className="flex min-h-dvh flex-col">
        <SessionProvider>
          <a
            href="#indhold"
            className="sr-only focus:not-sr-only focus:absolute focus:top-3 focus:left-3 focus:z-50 focus:rounded-control focus:bg-surface focus:px-4 focus:py-3 focus:font-semibold focus:shadow-raised"
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
