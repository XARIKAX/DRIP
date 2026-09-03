import Link from "next/link";
import { Mark } from "@/components/Wordmark";
import { Reveal } from "@/components/motion";

const COLUMNS = [
  {
    title: "Product",
    links: [
      { href: "/app", label: "Dashboard" },
      { href: "/app/deposit", label: "Deposit" },
      { href: "/app/borrow", label: "Borrow" },
      { href: "/app/split", label: "Split" },
      { href: "/app/vault", label: "The pool" },
      { href: "/app/calendar", label: "Payout calendar" },
      { href: "/app/agent", label: "Agent" },
    ],
  },
  {
    title: "Learn",
    links: [
      { href: "/docs", label: "How it works" },
      { href: "/docs#early", label: "Getting paid early" },
      { href: "/docs#borrow", label: "Borrowing" },
      { href: "/docs#split", label: "Splitting a stock" },
      { href: "/docs#risks", label: "Risks" },
    ],
  },
  {
    title: "Network",
    links: [
      { href: "/app", label: "Robinhood Chain" },
      { href: "/app/vault", label: "Paid in USDG" },
      { href: "/app/agent", label: "Works with AI agents" },
    ],
  },
];

/**
 * The footer.
 *
 * Three columns of destinations over a colossal wordmark cut from the background — the
 * last thing on the page should be the name, at a scale nothing else on the site is
 * allowed. The legal line sits under its own hairline, in the smallest type we set.
 */
export function Footer() {
  return (
    <footer className="relative mt-band border-t border-line-soft bg-paper-2">
      <Reveal className="shell grid gap-12 py-20 md:grid-cols-12 md:py-24">
        <div className="reveal md:col-span-5 lg:col-span-4">
          <Mark size={30} className="text-ink" />
          <p className="mt-7 max-w-xs text-[15px] leading-relaxed text-muted">
            The Aave of stocks. Deposit your stock and get the dividend the day you earn it.
            Sell the dividend on its own. Or borrow against the stock and let the dividends
            pay the interest.
          </p>
          <div className="mt-7 flex flex-wrap gap-2">
            <span className="pill">Robinhood Chain</span>
            <span className="pill">You keep your keys</span>
            <span className="pill-live">Onchain</span>
          </div>
        </div>

        <div className="grid grid-cols-2 gap-10 md:col-span-7 md:grid-cols-3 lg:col-span-7 lg:col-start-6">
          {COLUMNS.map((col, i) => (
            <div key={col.title} className={`reveal reveal-${i + 1} min-w-0`}>
              <div className="serial">{col.title}</div>
              <ul className="mt-5 space-y-3">
                {col.links.map((link) => (
                  <li key={`${col.title}-${link.label}`}>
                    <Link
                      href={link.href}
                      className="text-[14px] text-muted transition-colors duration-300 hover:text-ink"
                    >
                      {link.label}
                    </Link>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>
      </Reveal>

      {/* The name, at the scale it deserves, cut from the background. */}
      <div className="shell overflow-hidden pb-6" aria-hidden>
        <div className="text-cut select-none display text-colossal leading-[0.78]">OSINKO</div>
      </div>

      {/* The colophon. A document that states how it was set is a document someone
          cared about; the engraving here is generated, and it says so. */}
      <div className="border-t border-line-soft">
        <div className="shell flex flex-wrap items-center justify-between gap-3 py-6 font-mono text-nano font-medium uppercase text-ghost">
          <span>$OSINKO · Finnish for dividend · Robinhood Chain · Paid in USDG</span>
          <span className="text-faint">Let the dividends do the work</span>
        </div>
        <div className="shell flex flex-wrap items-center justify-between gap-3 border-t border-line-soft py-4 font-mono text-nano font-medium uppercase text-ghost">
          <span>Set in Bodoni Moda, Archivo &amp; IBM Plex Mono · Engine turning generated, not drawn</span>
          <span>© 2026 Osinko</span>
        </div>
      </div>
    </footer>
  );
}
