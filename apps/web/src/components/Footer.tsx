import Link from "next/link";
import { Wordmark } from "@/components/Wordmark";

const COLUMNS = [
  {
    title: "Product",
    links: [
      { href: "/app", label: "Dashboard" },
      { href: "/app/deposit", label: "Deposit" },
      { href: "/app/vault", label: "Advance vault" },
      { href: "/app/calendar", label: "Ex date calendar" },
      { href: "/app/agent", label: "Agent console" },
    ],
  },
  {
    title: "Protocol",
    links: [
      { href: "/app/calendar", label: "Dividend registry" },
      { href: "/app/vault", label: "Vault stats" },
      { href: "/app", label: "Your streams" },
    ],
  },
];

export function Footer() {
  return (
    <footer className="rule-t mt-24 bg-paper">
      <div className="shell grid gap-10 py-14 md:grid-cols-4">
        <div className="md:col-span-2">
          <Wordmark size="lg" />
          <div className="mt-2 text-micro font-bold uppercase text-muted">
            $DRIP · Dividend Reinvestment Plan
          </div>
          <p className="mt-3 max-w-sm text-[14px] text-muted">
            The dividend layer for Robinhood Chain. Paid at the ex date, streamed per second,
            reinvested the moment it lands.
          </p>
          <div className="mt-6 flex flex-wrap gap-3">
            <span className="tag">Testnet</span>
            <span className="tag">Self custody</span>
            <span className="tag-accent">Onchain</span>
          </div>
        </div>

        {COLUMNS.map((col) => (
          <div key={col.title}>
            <div className="eyebrow text-muted">{col.title}</div>
            <ul className="mt-4 space-y-2">
              {col.links.map((link) => (
                <li key={`${col.title}-${link.label}`}>
                  <Link href={link.href} className="text-[14px] hover:text-cyan-dark">
                    {link.label}
                  </Link>
                </li>
              ))}
            </ul>
          </div>
        ))}
      </div>

      <div className="rule-t">
        <div className="shell flex flex-wrap items-center justify-between gap-3 py-5 text-micro font-bold uppercase text-muted">
          <span>Testnet build. Tokens have no value.</span>
          <span>Dividends the way they should work</span>
        </div>
      </div>
    </footer>
  );
}
