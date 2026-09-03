"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { ConnectButton } from "@rainbow-me/rainbowkit";
import { Wordmark } from "@/components/Wordmark";
import { useScrollY } from "@/components/motion";

const LINKS = [
  { href: "/app", label: "Dashboard" },
  { href: "/app/deposit", label: "Deposit" },
  { href: "/app/borrow", label: "Borrow" },
  { href: "/app/vault", label: "Vault" },
  { href: "/app/calendar", label: "Calendar" },
  { href: "/app/agent", label: "Agent" },
];

/**
 * The application header. Wordmark, six destinations, one connect button.
 *
 * The active link is marked by a cyan underscore drawn beneath it rather than a filled
 * chip — at this weight of type, a rule is louder than a box and quieter on the page.
 * On scroll the bar loses its transparency and gains a hairline, so content always
 * passes *under* something rather than through it.
 */
export function SiteNav() {
  const pathname = usePathname();
  const scrolled = useScrollY(8);

  return (
    <header
      className={`sticky top-0 z-chrome transition-colors duration-500 ease-osk ${
        scrolled ? "border-b border-line bg-paper" : "border-b border-line-soft bg-paper"
      }`}
    >
      <div className="shell flex h-[68px] items-center justify-between gap-8">
        <Link href="/" aria-label="Osinko home" className="shrink-0 transition-opacity hover:opacity-70">
          <Wordmark />
        </Link>

        <nav className="hidden items-center gap-1 lg:flex">
          {LINKS.map((link) => {
            const active = pathname === link.href;
            return (
              <Link
                key={link.href}
                href={link.href}
                aria-current={active ? "page" : undefined}
                className={`relative px-3.5 py-2 font-mono text-micro font-medium uppercase transition-colors duration-300 ${
                  active ? "text-ink" : "text-faint hover:text-ink"
                }`}
              >
                {link.label}
                <span
                  className={`absolute inset-x-3.5 bottom-0 h-px origin-left bg-cyan transition-transform duration-500 ease-osk ${
                    active ? "scale-x-100" : "scale-x-0"
                  }`}
                  aria-hidden
                />
              </Link>
            );
          })}
        </nav>

        <div className="flex shrink-0 items-center gap-3">
          <ConnectButton
            showBalance={false}
            accountStatus={{ smallScreen: "avatar", largeScreen: "address" }}
            chainStatus="none"
          />
        </div>
      </div>

      {/* Below lg the destinations become a scrolling rail rather than a menu. */}
      <nav className="no-scrollbar flex overflow-x-auto border-t border-line-soft lg:hidden">
        {LINKS.map((link) => {
          const active = pathname === link.href;
          return (
            <Link
              key={link.href}
              href={link.href}
              aria-current={active ? "page" : undefined}
              className={`relative shrink-0 px-5 py-3 font-mono text-micro font-medium uppercase transition-colors ${
                active ? "text-ink" : "text-faint"
              }`}
            >
              {link.label}
              {active ? <span className="absolute inset-x-4 bottom-0 h-px bg-cyan" aria-hidden /> : null}
            </Link>
          );
        })}
      </nav>
    </header>
  );
}
