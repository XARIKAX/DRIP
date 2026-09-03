import type { Metadata } from "next";
import type { ReactNode } from "react";
import { ReadProgress } from "@/components/motion";
import { UtilityBar } from "@/components/UtilityBar";
import { SiteNav } from "@/components/SiteNav";
import { Footer } from "@/components/Footer";

export const metadata: Metadata = {
  title: "Documentation — Osinko, the Aave of stocks",
  description:
    "How Osinko works, in full: the ex date checkpoint, the advance vault, per second streams, same transaction reinvestment, the dividend serviced credit line, principal and yield tokens, settlement, roles, risks, and every number a contract enforces.",
  alternates: { canonical: "/docs" },
  openGraph: {
    title: "Osinko documentation — the Aave of stocks",
    description:
      "The complete description of the protocol: mechanism, parameters, trust assumptions, contracts, agent tools and how to use the app.",
    url: "https://dripmarkets.net/docs",
    siteName: "Osinko",
    type: "article",
  },
};

/**
 * The docs shell. Same chrome as the app — status rail, nav, footer — minus the tape
 * and the demo notice: a reference is read, not operated, and a marquee beside a
 * page of prose is noise. The reading progress hairline comes along from the landing
 * page, because a document this long should say how much of it is left.
 */
export default function DocsLayout({ children }: { children: ReactNode }) {
  return (
    <div className="grain relative min-h-screen bg-paper">
      <ReadProgress />
      <UtilityBar />
      <SiteNav />
      <main className="relative z-[2]">{children}</main>
      <Footer />
    </div>
  );
}
