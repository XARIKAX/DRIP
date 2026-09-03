"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { ConnectButton } from "@rainbow-me/rainbowkit";
import { Wordmark } from "@/components/Wordmark";

const LINKS = [
  { href: "/app", label: "Dashboard" },
  { href: "/app/deposit", label: "Deposit" },
  { href: "/app/borrow", label: "Borrow" },
  { href: "/app/vault", label: "Vault" },
  { href: "/app/calendar", label: "Calendar" },
  { href: "/app/agent", label: "Agent" },
];

/** Wordmark, five links, one connect button. Nothing else earns the space. */
export function SiteNav() {
  const pathname = usePathname();

  return (
    <header className="rule-b sticky top-0 z-40 bg-paper">
      <div className="shell flex h-16 items-center justify-between gap-6">
        <Link href="/" aria-label="Osinko home">
          <Wordmark />
        </Link>

        <nav className="hidden items-center gap-1 md:flex">
          {LINKS.map((link) => {
            const active = pathname === link.href;
            return (
              <Link
                key={link.href}
                href={link.href}
                className={`border px-3 py-2 text-micro font-bold uppercase transition-colors ${
                  active
                    ? "border-ink bg-ink text-paper"
                    : "border-transparent text-ink hover:border-ink"
                }`}
              >
                {link.label}
              </Link>
            );
          })}
        </nav>

        <div className="flex items-center gap-3">
          <ConnectButton
            showBalance={false}
            accountStatus={{ smallScreen: "avatar", largeScreen: "address" }}
            chainStatus="none"
          />
        </div>
      </div>

      <nav className="rule-t flex overflow-x-auto md:hidden">
        {LINKS.map((link) => {
          const active = pathname === link.href;
          return (
            <Link
              key={link.href}
              href={link.href}
              className={`shrink-0 border-r border-faint px-4 py-3 text-micro font-bold uppercase ${
                active ? "bg-ink text-paper" : "text-ink"
              }`}
            >
              {link.label}
            </Link>
          );
        })}
      </nav>
    </header>
  );
}
