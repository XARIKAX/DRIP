import type { Metadata } from "next";
import type { ReactNode } from "react";
import { ReadProgress } from "@/components/motion";
import { UtilityBar } from "@/components/UtilityBar";
import { SiteNav } from "@/components/SiteNav";
import { Footer } from "@/components/Footer";

export const metadata: Metadata = {
  title: "How it works — Osinko, the Aave of stocks",
  description:
    "How Osinko works, in plain words: get your dividends the day you earn them, a little every second, or as more stock. Borrow against your stock and let the dividends pay the interest. Split a stock and sell the dividend on its own. Every number the code enforces, and every risk.",
  alternates: { canonical: "/docs" },
  openGraph: {
    title: "How Osinko works — the Aave of stocks",
    description:
      "The whole thing explained: how you get paid, how the pool works, borrowing, splitting, who controls what, the risks, and how to use the app.",
    url: "https://www.osinko.app/docs",
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
