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
 * `robots` is the half that matters, and it lives here because the page is a client
 * component and a client component cannot export metadata. Unlinked is not unfindable:
 * anything that meets the URL — a shared link, an inbound link somebody adds later —
 * will index it unless told not to. /dev/pixel and /dev/og already say no the same way.
 *
 * Two things deliberately NOT done. There is no `Disallow` line in a robots.txt: that
 * file is public, so it would publish the address while also stopping a crawler from
 * ever reaching the meta directive — the one reliable way to guarantee the directive is
 * never read. And there is no `alternates` override: the root layout hardcodes
 * `canonical: "/"`, which every route inherits, so this page already emits a canonical
 * pointing at the homepage and never prints its own URL. Setting a self-canonical here
 * would undo exactly that.
 *
 * What this is honestly not is private. Anyone with the link can open it, and "build" is
 * a word every directory scanner already tries. Genuine privacy is a password on the
 * deployment or a gate in front of the route — not a nav decision, and not this file.
 *
 * The chrome itself is the app's, minus nothing — the builder is meant to look like
 * the product when it is demonstrated, not like a page off to one side.
 */
export const metadata: Metadata = {
  title: "Build a Stack — Osinko",
  robots: { index: false, follow: false },
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
