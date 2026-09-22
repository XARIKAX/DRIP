import type { Metadata } from "next";
import type { ReactNode } from "react";
import { UtilityBar } from "@/components/UtilityBar";
import { SiteNav } from "@/components/SiteNav";
import { TickerStrip } from "@/components/TickerStrip";
import { Footer } from "@/components/Footer";
import { GroundLine } from "@/components/pixel/Scenery";

/**
 * The Stack builder's shell, and the reason it is a shell of its own.
 *
 * The builder sits at /build rather than under /app, and it is deliberately not in the
 * nav: it is shown to people by sending them the link, not found by clicking around.
 * That is the whole reason this file exists rather than the page living beside its
 * siblings — a route under /app inherits the app shell, and the only way to be off the
 * nav while still wearing the product's chrome is to compose that chrome here.
 *
 * `robots` is the half that matters. Unlinked is not the same as unfindable: a crawler
 * that meets the URL anywhere — a shared link, a referrer header, an inbound link
 * somebody adds — will index it unless told not to. So this says no, the same way
 * /dev/pixel and /dev/og already do.
 *
 * Note what is deliberately NOT done: there is no `Disallow: /build` in a robots.txt.
 * A robots file is public, so naming the path there would publish the exact address
 * this route is trying to keep quiet — it would be a signpost, not a lock. The meta
 * directive does the work without announcing the door.
 *
 * And note what this is honestly not: obscurity, not access control. Anyone with the
 * link can open it. If it ever needs to be genuinely private, that is a deployment
 * password or a gate in front of the page, not a nav decision.
 *
 * The chrome itself is the app's, minus nothing — the builder is meant to look like
 * the product when it is demonstrated, not like a page off to one side.
 */
export const metadata: Metadata = {
  title: "Build a Stack — Osinko",
  robots: { index: false, follow: false },
  // No canonical. The root layout sets one per route from `alternates`; leaving it unset
  // here keeps the page out of anything that enumerates canonical URLs.
};

export default function BuildLayout({ children }: { children: ReactNode }) {
  return (
    <div className="grain relative min-h-screen bg-ground">
      <UtilityBar />
      <SiteNav />
      <TickerStrip />
      <main className="shell relative z-[2] py-12 md:py-16">{children}</main>
      {/* The horizon the app stands on: the last thing before the page goes to night. */}
      <div className="relative z-[2] overflow-hidden opacity-60 [--cell:2px]" aria-hidden>
        <GroundLine night cell="calc(var(--cell) * 2)" />
      </div>
      <Footer />
    </div>
  );
}
